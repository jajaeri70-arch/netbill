import { Router } from 'express';
import { q } from '../db.js';
import { num, curPeriod } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import { sendCsv } from '../utils/csv.js';

const r = Router();

/** GET /api/reports/income — laporan pemasukan tagihan (PRD 5.7) */
r.get('/income', can('finance'), async (req, res) => {
  try {
    const { from, to, package_id, area } = req.query;
    const where = ["pay.status = 'confirmed'"];
    const params = [];
    if (from) { where.push('DATE(pay.payment_date) >= ?'); params.push(from); }
    if (to) { where.push('DATE(pay.payment_date) <= ?'); params.push(to); }
    if (package_id) { where.push('c.package_id = ?'); params.push(package_id); }
    if (area) { where.push('c.area = ?'); params.push(area); }
    const w = `WHERE ${where.join(' AND ')}`;

    const summary = (
      await q(
        `SELECT COALESCE(SUM(pay.amount),0) total, COUNT(*) n FROM payments pay
         JOIN customers c ON c.id = pay.customer_id ${w}`,
        params
      )
    )[0];
    const byPackage = await q(
      `SELECT p.name, COALESCE(SUM(pay.amount),0) total, COUNT(*) n FROM payments pay
       JOIN customers c ON c.id = pay.customer_id
       LEFT JOIN packages p ON p.id = c.package_id ${w}
       GROUP BY p.id, p.name ORDER BY total DESC`,
      params
    );
    const byArea = await q(
      `SELECT COALESCE(c.area,'-') area, COALESCE(SUM(pay.amount),0) total, COUNT(*) n FROM payments pay
       JOIN customers c ON c.id = pay.customer_id ${w}
       GROUP BY c.area ORDER BY total DESC`,
      params
    );
    const daily = await q(
      `SELECT DATE(pay.payment_date) d, COALESCE(SUM(pay.amount),0) total FROM payments pay
       JOIN customers c ON c.id = pay.customer_id ${w}
       GROUP BY d ORDER BY d ASC`,
      params
    );
    res.json({
      summary: { total: num(summary.total), count: num(summary.n) },
      byPackage: byPackage.map((x) => ({ name: x.name || 'Tanpa Paket', total: num(x.total), count: num(x.n) })),
      byArea: byArea.map((x) => ({ area: x.area, total: num(x.total), count: num(x.n) })),
      daily: daily.map((x) => ({ date: x.d, total: num(x.total) })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/reports/aging — piutang/tunggakan (PRD 5.7) */
r.get('/aging', can('finance'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT c.id customer_id, c.code, c.name, c.phone, c.area, p.name package_name,
              COUNT(i.id) invoice_count,
              SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 0 AND 30
                  THEN i.amount + i.late_fee + i.additional_fee + i.tax - i.discount - i.paid_amount ELSE 0 END) b0_30,
              SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 31 AND 60
                  THEN i.amount + i.late_fee + i.additional_fee + i.tax - i.discount - i.paid_amount ELSE 0 END) b31_60,
              SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) > 60
                  THEN i.amount + i.late_fee + i.additional_fee + i.tax - i.discount - i.paid_amount ELSE 0 END) b60p,
              SUM(i.amount + i.late_fee + i.additional_fee + i.tax - i.discount - i.paid_amount) total,
              MIN(i.due_date) oldest_due
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN packages p ON p.id = c.package_id
       WHERE i.status IN ('unpaid','partial') AND i.due_date < CURDATE()
       GROUP BY c.id, c.code, c.name, c.phone, c.area, p.name
       ORDER BY total DESC`
    );
    const rowsNum = rows.map((x) => ({
      ...x,
      b0_30: num(x.b0_30), b31_60: num(x.b31_60), b60p: num(x.b60p), total: num(x.total),
      invoice_count: num(x.invoice_count),
    }));
    const buckets = {
      b0_30: rowsNum.reduce((s, x) => s + x.b0_30, 0),
      b31_60: rowsNum.reduce((s, x) => s + x.b31_60, 0),
      b60p: rowsNum.reduce((s, x) => s + x.b60p, 0),
      total: rowsNum.reduce((s, x) => s + x.total, 0),
      count: rowsNum.length,
    };
    res.json({ rows: rowsNum, buckets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const cashflowRange = (query) => {
  const year = Number(query.year) || new Date().getFullYear();
  const from = query.from || `${year}-01-01`;
  const to = query.to || `${year}-12-31`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    const err = new Error('Rentang tanggal tidak valid');
    err.status = 400;
    throw err;
  }
  return { year, from, to };
};

const cashflowRows = async ({ from, to }) => q(
  `SELECT DATE(payment_date) tx_date, 'Pemasukan tagihan' category, 'income' type, amount, 'Pembayaran pelanggan' description FROM payments
   WHERE status='confirmed' AND DATE(payment_date) BETWEEN ? AND ?
   UNION ALL
   SELECT t.tx_date, COALESCE(tc.name,'Tanpa Kategori') category, t.type, t.amount, t.description FROM transactions t
   LEFT JOIN transaction_categories tc ON tc.id=t.category_id
   WHERE t.status='approved' AND t.tx_date BETWEEN ? AND ?
   ORDER BY tx_date DESC`, [from, to, from, to]
);

/** GET /api/reports/cashflow — kas aktual dari pembayaran terkonfirmasi + transaksi disetujui */
r.get('/cashflow', can('finance'), async (req, res) => {
  try {
    const range = cashflowRange(req.query);
    const rows = await cashflowRows(range);
    const normalized = rows.map((row) => ({ ...row, amount: num(row.amount) }));
    const totals = normalized.reduce((result, row) => {
      if (row.type === 'expense') result.expense += row.amount;
      else { result.income += row.amount; if (row.category === 'Pemasukan tagihan') result.billing += row.amount; else result.nonBilling += row.amount; }
      return result;
    }, { income: 0, billing: 0, nonBilling: 0, expense: 0 });
    const dailyMap = normalized.reduce((map, row) => {
      const day = String(row.tx_date).slice(0, 10);
      if (!map[day]) map[day] = { date: day, income: 0, expense: 0 };
      map[day][row.type === 'expense' ? 'expense' : 'income'] += row.amount;
      return map;
    }, {});
    let balance = 0;
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)).map((day) => ({ ...day, label: new Date(`${day.date}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }), net: day.income - day.expense, balance: balance += day.income - day.expense }));
    const categories = normalized.filter((row) => row.type === 'expense').reduce((map, row) => ({ ...map, [row.category]: (map[row.category] || 0) + row.amount }), {});
    const expenseByCategory = Object.entries(categories).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    res.json({ ...range, totals: { ...totals, net: totals.income - totals.expense }, daily, expenseByCategory, recent: normalized.slice(0, 20) });
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
});

/** GET /api/reports/cashflow/export — ekspor seluruh arus kas sesuai periode */
r.get('/cashflow/export', can('finance', 'export'), async (req, res) => {
  try {
    const rows = await cashflowRows(cashflowRange(req.query));
    sendCsv(res, 'arus-kas.csv', rows, [
      { key: 'tx_date', label: 'Tanggal' }, { key: 'type', label: 'Tipe' }, { key: 'category', label: 'Kategori / Sumber' },
      { key: 'amount', label: 'Jumlah' }, { key: 'description', label: 'Keterangan' },
    ]);
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
});

export async function profitLossReport(period = curPeriod(), query = q) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    const err = new Error('Periode tidak valid');
    err.status = 400;
    throw err;
  }
  const [y, m] = period.split('-').map(Number);
  const prevPeriod = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const billingIncome = num((await query(
    `SELECT COALESCE(SUM(amount),0) v FROM payments
     WHERE status='confirmed' AND DATE_FORMAT(payment_date,'%Y-%m') = ?`, [period]
  ))[0]?.v);
  const nonBillingIncome = num((await query(
    `SELECT COALESCE(SUM(amount),0) v FROM transactions
     WHERE type='income' AND status='approved' AND DATE_FORMAT(tx_date,'%Y-%m') = ?`, [period]
  ))[0]?.v);
  const expenseRows = await query(
    `SELECT COALESCE(tc.name,'Tanpa Kategori') name, SUM(t.amount) v FROM transactions t
     LEFT JOIN transaction_categories tc ON tc.id = t.category_id
     WHERE t.type='expense' AND t.status='approved' AND DATE_FORMAT(t.tx_date,'%Y-%m') = ?
     GROUP BY tc.id, tc.name ORDER BY v DESC`, [period]
  );
  const expenses = expenseRows.map((x) => ({ name: x.name, total: num(x.v) }));
  const totalExpense = expenses.reduce((sum, row) => sum + row.total, 0);
  const revenue = billingIncome + nonBillingIncome;
  const net = revenue - totalExpense;
  const prevNet = num((await query(
    `SELECT
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='confirmed' AND DATE_FORMAT(payment_date,'%Y-%m') = ?) +
      (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='income' AND status='approved' AND DATE_FORMAT(tx_date,'%Y-%m') = ?) -
      (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='expense' AND status='approved' AND DATE_FORMAT(tx_date,'%Y-%m') = ?) v`,
    [prevPeriod, prevPeriod, prevPeriod]
  ))[0]?.v);
  return {
    period,
    revenue: { billing: billingIncome, nonBilling: nonBillingIncome, total: revenue },
    expenses,
    totalExpense,
    net,
    previous: { period: prevPeriod, net: prevNet },
    growth: prevNet !== 0 ? ((net - prevNet) / Math.abs(prevNet)) * 100 : null,
  };
}

/** GET /api/reports/profit-loss — laba rugi (PRD 5.8) */
r.get('/profit-loss', can('finance'), async (req, res) => {
  try {
    res.json(await profitLossReport(req.query.period || curPeriod()));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

/** GET /api/reports/profit-loss/export — ringkasan laba rugi per periode */
r.get('/profit-loss/export', can('finance', 'export'), async (req, res) => {
  try {
    const period = req.query.period || curPeriod();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return res.status(400).json({ message: 'Periode tidak valid' });
    const billing = num((await q("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE status='confirmed' AND DATE_FORMAT(payment_date,'%Y-%m') = ?", [period]))[0]?.v);
    const nonBilling = num((await q("SELECT COALESCE(SUM(amount),0) v FROM transactions WHERE type='income' AND status='approved' AND DATE_FORMAT(tx_date,'%Y-%m') = ?", [period]))[0]?.v);
    const expenses = await q(
      `SELECT COALESCE(tc.name,'Tanpa Kategori') name, COALESCE(SUM(t.amount),0) total FROM transactions t
       LEFT JOIN transaction_categories tc ON tc.id=t.category_id
       WHERE t.type='expense' AND t.status='approved' AND DATE_FORMAT(t.tx_date,'%Y-%m') = ?
       GROUP BY tc.id, tc.name ORDER BY total DESC`, [period]
    );
    const totalExpense = expenses.reduce((sum, row) => sum + num(row.total), 0);
    const revenue = billing + nonBilling;
    sendCsv(res, `laba-rugi-${period}.csv`, [
      { group: 'Pendapatan', item: 'Pendapatan Tagihan', amount: billing },
      { group: 'Pendapatan', item: 'Pendapatan Non-Tagihan', amount: nonBilling },
      ...expenses.map((row) => ({ group: 'Beban', item: row.name, amount: num(row.total) })),
      { group: 'Ringkasan', item: 'Total Pendapatan', amount: revenue },
      { group: 'Ringkasan', item: 'Total Beban', amount: totalExpense },
      { group: 'Ringkasan', item: 'Laba Bersih', amount: revenue - totalExpense },
    ], [{ key: 'group', label: 'Kelompok' }, { key: 'item', label: 'Pos' }, { key: 'amount', label: 'Nilai' }]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/** GET /api/reports/pl-trend — tren laba bulanan setahun (untuk grafik P&L) */
r.get('/pl-trend', can('finance'), async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const payments = await q(
      `SELECT DATE_FORMAT(payment_date,'%Y-%m') m, SUM(amount) v FROM payments
       WHERE status='confirmed' AND YEAR(payment_date) = ? GROUP BY m`,
      [year]
    );
    const incomes = await q(
      `SELECT DATE_FORMAT(tx_date,'%Y-%m') m, SUM(amount) v FROM transactions
       WHERE type='income' AND status='approved' AND YEAR(tx_date) = ? GROUP BY m`,
      [year]
    );
    const expenses = await q(
      `SELECT DATE_FORMAT(tx_date,'%Y-%m') m, SUM(amount) v FROM transactions
       WHERE type='expense' AND status='approved' AND YEAR(tx_date) = ? GROUP BY m`,
      [year]
    );
    const pMap = Object.fromEntries(payments.map((x) => [x.m, num(x.v)]));
    const iMap = Object.fromEntries(incomes.map((x) => [x.m, num(x.v)]));
    const eMap = Object.fromEntries(expenses.map((x) => [x.m, num(x.v)]));
    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const revenue = (pMap[key] || 0) + (iMap[key] || 0);
      const expense = eMap[key] || 0;
      monthly.push({
        month: key,
        label: new Date(year, m - 1, 1).toLocaleDateString('id-ID', { month: 'short' }),
        revenue,
        expense,
        net: revenue - expense,
      });
    }
    res.json({ year, monthly });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/reports/income/export */
r.get('/income/export', can('finance', 'export'), async (req, res) => {
  try {
    const { from, to, package_id, area } = req.query;
    const where = ["pay.status = 'confirmed'"];
    const params = [];
    if (from) { where.push('DATE(pay.payment_date) >= ?'); params.push(from); }
    if (to) { where.push('DATE(pay.payment_date) <= ?'); params.push(to); }
    if (package_id) { where.push('c.package_id = ?'); params.push(package_id); }
    if (area) { where.push('c.area = ?'); params.push(area); }
    const rows = await q(
      `SELECT pay.payment_date, c.code, c.name, i.number invoice_number, i.period, p.name package_name,
              c.area, pay.amount, pay.method
       FROM payments pay JOIN customers c ON c.id = pay.customer_id
       JOIN invoices i ON i.id = pay.invoice_id
       LEFT JOIN packages p ON p.id = c.package_id
       WHERE ${where.join(' AND ')} ORDER BY pay.payment_date DESC`,
      params
    );
    sendCsv(res, 'laporan-pemasukan.csv', rows, [
      { key: 'payment_date', label: 'Tanggal' }, { key: 'code', label: 'Kode' },
      { key: 'name', label: 'Pelanggan' }, { key: 'invoice_number', label: 'No Tagihan' },
      { key: 'period', label: 'Periode' }, { key: 'package_name', label: 'Paket' },
      { key: 'area', label: 'Area' }, { key: 'amount', label: 'Jumlah' }, { key: 'method', label: 'Metode' },
    ]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;



