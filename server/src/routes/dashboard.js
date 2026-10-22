import { Router } from 'express';
import { q, exec } from '../db.js';
import { num, curPeriod, currentMonthNewCustomerWithoutInvoiceWhere } from '../utils/helper.js';
import { can, canViewBusinessSummary, isFinanceRole } from '../middleware/auth.js';
import * as monitoring from '../services/monitoring.js';
import { normalizePingTarget, pingHost } from '../services/ping.js';

const r = Router();

/** POST /api/dashboard/ping — satu ICMP ping dari jaringan server aplikasi. */
r.post('/ping', can('dashboard'), async (req, res) => {
  const target = normalizePingTarget(req.body?.target);
  if (!target) return res.status(400).json({ message: 'Target harus berupa alamat IP atau hostname valid' });
  const { ok, latency } = await pingHost(target);
  res.json({ ok, target, latency_ms: latency });
});

/** GET /api/dashboard/business-summary — ringkasan bisnis dari data keuangan dan pelanggan saat ini. */
r.get('/business-summary', can('dashboard'), async (req, res) => {
  if (!canViewBusinessSummary(req.user.role)) {
    return res.status(403).json({ message: 'Akses ringkasan bisnis hanya untuk finance dan owner' });
  }
  try {
    await ensureInstallationDate();
    const [year, month] = curPeriod().split('-').map(Number);
    const previousPeriod = `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}`;
    const [today, monthly, invoices, arrears, previousPeriodArrears, customers, totalBills] = await Promise.all([
      q(`SELECT COALESCE(SUM(amount), 0) total FROM payments
         WHERE status = 'confirmed' AND DATE(payment_date) = CURDATE()`),
      q(`SELECT COUNT(*) count, COALESCE(SUM(amount), 0) total FROM payments
         WHERE status = 'confirmed' AND DATE_FORMAT(payment_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`),
      q(`SELECT COUNT(*) count, COALESCE(SUM(amount + late_fee + additional_fee + tax - discount), 0) total FROM invoices
         WHERE period = DATE_FORMAT(CURDATE(), '%Y-%m') AND status <> 'void'`),
      q(`SELECT COUNT(*) count, COALESCE(SUM(amount + late_fee + additional_fee + tax - discount - paid_amount), 0) total FROM invoices
         WHERE status IN ('unpaid', 'partial')`),
      q(`SELECT COUNT(*) count, COALESCE(SUM(amount + late_fee + additional_fee + tax - discount - paid_amount), 0) total FROM invoices
         WHERE period = ? AND status IN ('unpaid', 'partial')`, [previousPeriod]),
      q(`SELECT COUNT(*) total, SUM(status = 'inactive') inactive,
                SUM(installation_status IN ('pending', 'in_progress')) notInstalled
         FROM customers`),
      q(`SELECT COUNT(*) count, COALESCE(SUM(p.price), 0) total
         FROM customers c JOIN packages p ON p.id = c.package_id`),
    ]);
    res.json({
      incomeToday: num(today[0]?.total),
      incomeThisMonth: { count: num(monthly[0]?.count), total: num(monthly[0]?.total) },
      invoicesThisMonth: { count: num(invoices[0]?.count), total: num(invoices[0]?.total) },
      unpaid: { count: num(arrears[0]?.count), total: num(arrears[0]?.total) },
      previousPeriodUnpaid: { period: previousPeriod, count: num(previousPeriodArrears[0]?.count), total: num(previousPeriodArrears[0]?.total) },
      totalBills: { count: num(totalBills[0]?.count), total: num(totalBills[0]?.total) },
      totalCustomers: num(customers[0]?.total),
      inactiveCustomers: num(customers[0]?.inactive),
      notInstalledCustomers: num(customers[0]?.notInstalled),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/dashboard/invoice-adjustments — penyesuaian tagihan terbaru untuk tabel dashboard. */
r.get('/invoice-adjustments', can('dashboard'), async (req, res) => {
  if (!canViewBusinessSummary(req.user.role)) {
    return res.status(403).json({ message: 'Akses diskon dan biaya tambahan hanya untuk finance dan owner' });
  }
  try {
    const { q: search, page = 1, limit = 5 } = req.query;
    const where = ["i.status <> 'void'", '(i.additional_fee > 0 OR i.discount > 0)'];
    const params = [];
    if (search) {
      where.push('(c.name LIKE ? OR c.code LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }
    const w = `WHERE ${where.join(' AND ')}`;
    const lim = Math.min(Math.max(5, Number(limit) || 5), 100);
    const offset = (Math.max(1, Number(page) || 1) - 1) * lim;
    const total = await q(
      `SELECT COUNT(*) n FROM invoices i JOIN customers c ON c.id = i.customer_id ${w}`,
      params
    );
    const rows = await q(
      `SELECT i.id, i.customer_id, i.invoice_date, i.additional_fee, i.discount, i.status, c.name customer_name, c.code customer_code
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       ${w} ORDER BY i.invoice_date DESC, i.id DESC LIMIT ${lim} OFFSET ${offset}`,
      params
    );
    res.json({ rows, total: Number(total[0]?.n) || 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

let installationDateReady;
async function ensureInstallationDate() {
  if (!installationDateReady) {
    installationDateReady = (async () => {
      const rows = await q(
        `SELECT COUNT(*) n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'installation_date'`
      );
      if (!Number(rows[0]?.n)) {
        await exec('ALTER TABLE customers ADD COLUMN installation_date DATE NULL AFTER package_id');
        await exec('UPDATE customers SET installation_date = activation_date WHERE installation_date IS NULL');
      }
      const status = await q(
        `SELECT COUNT(*) n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'installation_status'`
      );
      if (!Number(status[0]?.n)) {
        await exec("ALTER TABLE customers ADD COLUMN installation_status ENUM('pending','in_progress','installed') NOT NULL DEFAULT 'installed' AFTER installation_date");
      }
    })().catch((err) => { installationDateReady = null; throw err; });
  }
  return installationDateReady;
}

/** GET /api/dashboard/stats — kartu ringkasan, grafik & panel bawah (PRD 7) */
r.get('/stats', can('dashboard'), async (req, res) => {
  try {
    await ensureInstallationDate();
    const period = curPeriod();
    const registrationPeriod = ['daily', 'monthly', 'custom'].includes(req.query.registrationPeriod) ? req.query.registrationPeriod : 'monthly';
    const registrationStart = /^\d{4}-\d{2}-\d{2}$/.test(req.query.registrationStart || '') ? req.query.registrationStart : null;
    const registrationEnd = /^\d{4}-\d{2}-\d{2}$/.test(req.query.registrationEnd || '') ? req.query.registrationEnd : null;
    if (registrationPeriod === 'custom' && registrationStart && registrationEnd && registrationStart > registrationEnd) {
      return res.status(400).json({ message: 'Tanggal mulai tidak boleh melebihi tanggal akhir' });
    }
    const cust = (
      await q(
        `SELECT COUNT(*) total, SUM(status='active') active, SUM(status='isolated') isolated,
                SUM(status='inactive') inactive FROM customers`
      )
    )[0];
    const live = await monitoring.getSummary();
    if (!isFinanceRole(req.user.role)) {
      return res.json({
        cards: {
          totalCustomers: num(cust.total), activeCustomers: num(cust.active), isolatedCustomers: num(cust.isolated), inactiveCustomers: num(cust.inactive),
          onlineUsers: live.online, offlineUsers: live.offline,
          revenueThisMonth: 0, subscriptionRevenue: 0, newCustomersWithoutInvoice: 0, registrations: 0,
          expensesThisMonth: 0, arrearsTotal: 0, arrearsCount: 0, overdueCustomers: 0, pendingTickets: 0,
        },
        widgets: { cashToday: { income: 0, expense: 0, net: 0 }, invoicesThisMonth: { count: 0, total: 0 }, paymentsThisMonth: 0 },
        network: live, revenueTrend: [], packageDistribution: [], arrearsList: [], recentPayments: [], recentActivity: [],
      });
    }
    const revenue = (
      await q(
        `SELECT COALESCE(SUM(amount),0) v FROM payments
         WHERE status='confirmed' AND DATE_FORMAT(payment_date,'%Y-%m') = ?`,
        [period]
      )
    )[0];
    const subscriptionRevenue = (
      await q(
        `SELECT COALESCE(SUM(p.price),0) v FROM customers c
         JOIN packages p ON p.id = c.package_id
         WHERE c.status <> 'inactive'`
      )
    )[0];
    const newCustomersWithoutInvoice = (
      await q(
        `SELECT COUNT(*) n FROM customers c
          WHERE ${currentMonthNewCustomerWithoutInvoiceWhere}`,
        [period]
      )
    )[0];
    const registrations = (
      await q(
        `SELECT COUNT(*) n FROM customers
         WHERE ${registrationPeriod === 'daily'
           ? 'COALESCE(installation_date, activation_date) = CURDATE()'
            : registrationPeriod === 'monthly'
              ? "DATE_FORMAT(COALESCE(installation_date, activation_date), '%Y-%m') = ?"
              : `${registrationStart ? 'COALESCE(installation_date, activation_date) >= ?' : '1=1'}${registrationStart && registrationEnd ? ' AND ' : ''}${registrationEnd ? 'COALESCE(installation_date, activation_date) <= ?' : ''}`}`,
         registrationPeriod === 'daily' ? [] : registrationPeriod === 'monthly' ? [period] : [registrationStart, registrationEnd].filter(Boolean)
      )
    )[0];
    const expense = (
      await q(
        `SELECT COALESCE(SUM(amount),0) v FROM transactions
         WHERE type='expense' AND status='approved' AND DATE_FORMAT(tx_date,'%Y-%m') = ?`,
        [period]
      )
    )[0];
    const arrears = (
      await q(
        `SELECT COUNT(*) n, COALESCE(SUM(amount + late_fee + additional_fee + tax - discount - paid_amount),0) total
         FROM invoices WHERE status IN ('unpaid','partial')`
      )
    )[0];
    const overdue = (
      await q(
        `SELECT COUNT(DISTINCT customer_id) n FROM invoices
         WHERE status IN ('unpaid','partial') AND due_date < CURDATE()`
      )
    )[0];
    const pendingTickets = (
      await q(`SELECT COUNT(*) n FROM support_tickets WHERE status <> 'resolved'`)
    )[0];
    const cashToday = (
      await q(
        `SELECT
           COALESCE((SELECT SUM(amount) FROM payments WHERE status='confirmed' AND DATE(payment_date) = CURDATE()), 0) income,
           COALESCE((SELECT SUM(amount) FROM transactions WHERE type='expense' AND status='approved' AND tx_date = CURDATE()), 0) expense`
      )
    )[0];
    const invoicesThisMonth = (
      await q(
        `SELECT COUNT(*) n, COALESCE(SUM(amount + late_fee + additional_fee + tax - discount),0) total
         FROM invoices WHERE DATE_FORMAT(invoice_date,'%Y-%m') = ?`,
        [period]
      )
    )[0];
    const paymentsThisMonth = (
      await q(
        `SELECT COUNT(*) n FROM payments
         WHERE status='confirmed' AND DATE_FORMAT(payment_date,'%Y-%m') = ?`,
        [period]
      )
    )[0];

    // tren 6 bulan: pemasukan (payments) vs pengeluaran (transaksi)
    const revSeries = await q(
      `SELECT DATE_FORMAT(payment_date,'%Y-%m') m, SUM(amount) v FROM payments
       WHERE status='confirmed' AND payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY m`
    );
    const expSeries = await q(
      `SELECT DATE_FORMAT(tx_date,'%Y-%m') m, SUM(amount) v FROM transactions
       WHERE type='expense' AND status='approved' AND tx_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY m`
    );
    const revMap = Object.fromEntries(revSeries.map((x) => [x.m, num(x.v)]));
    const expMap = Object.fromEntries(expSeries.map((x) => [x.m, num(x.v)]));
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        month: key,
        label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
        pemasukan: revMap[key] || 0,
        pengeluaran: expMap[key] || 0,
      });
    }

    const pkgDist = await q(
      `SELECT p.name, COUNT(*) value FROM customers c
       JOIN packages p ON p.id = c.package_id
       WHERE c.status <> 'inactive' GROUP BY p.id, p.name ORDER BY value DESC`
    );

    const arrearsList = await q(
      `SELECT i.id, i.number, i.period, i.due_date, i.amount, i.late_fee, i.additional_fee, i.tax, i.discount,
              (i.amount + i.late_fee + i.additional_fee + i.tax - i.discount) total, i.status, i.paid_amount,
              c.name customer_name, c.code, c.phone, p.name package_name
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       LEFT JOIN packages p ON p.id = c.package_id
       WHERE i.status IN ('unpaid','partial')
       ORDER BY i.due_date ASC LIMIT 10`
    );
    const recentPayments = await q(
      `SELECT pay.id, pay.amount, pay.method, pay.payment_date, c.name customer_name, c.code, i.number
       FROM payments pay JOIN customers c ON c.id = pay.customer_id
       JOIN invoices i ON i.id = pay.invoice_id
       ORDER BY pay.payment_date DESC LIMIT 8`
    );
    const recentActivity = await q(
      `SELECT id, user_name, role, action, module, description, created_at
       FROM activity_logs ORDER BY id DESC LIMIT 8`
    );

    res.json({
      cards: {
        totalCustomers: num(cust.total),
        activeCustomers: num(cust.active),
        isolatedCustomers: num(cust.isolated),
        inactiveCustomers: num(cust.inactive),
        onlineUsers: live.online,
        offlineUsers: live.offline,
        revenueThisMonth: num(revenue.v),
        subscriptionRevenue: num(subscriptionRevenue.v),
        newCustomersWithoutInvoice: num(newCustomersWithoutInvoice.n),
        registrations: num(registrations.n),
        expensesThisMonth: num(expense.v),
        arrearsTotal: num(arrears.total),
        arrearsCount: num(arrears.n),
        overdueCustomers: num(overdue.n),
        pendingTickets: num(pendingTickets.n),
      },
      widgets: {
        cashToday: {
          income: num(cashToday.income),
          expense: num(cashToday.expense),
          net: num(cashToday.income) - num(cashToday.expense),
        },
        invoicesThisMonth: { count: num(invoicesThisMonth.n), total: num(invoicesThisMonth.total) },
        paymentsThisMonth: num(paymentsThisMonth.n),
      },
      network: live,
      revenueTrend: months,
      packageDistribution: pkgDist.map((p) => ({ name: p.name, value: num(p.value) })),
      arrearsList,
      recentPayments,
      recentActivity,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/dashboard/installation-trend — pemasangan pelanggan berdasarkan hari/bulan/tahun */
r.get('/installation-trend', can('dashboard'), async (req, res) => {
  try {
    await ensureInstallationDate();
    const period = ['day', 'month', 'year'].includes(req.query.period) ? req.query.period : 'month';
    const now = new Date();
    const count = period === 'day'
      ? new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      : period === 'year' ? 5 : 6;
    const sqlFormat = period === 'day' ? '%Y-%m-%d' : period === 'year' ? '%Y' : '%Y-%m';
    const interval = period === 'day' ? 'DAY' : period === 'year' ? 'YEAR' : 'MONTH';
    const rows = await q(
      `SELECT DATE_FORMAT(COALESCE(installation_date, activation_date), ?) bucket, COUNT(*) value
       FROM customers
       WHERE COALESCE(installation_date, activation_date) >= ${period === 'day' ? 'DATE_FORMAT(CURDATE(), \'%Y-%m-01\') AND COALESCE(installation_date, activation_date) < DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)' : period === 'month' ? `DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${count - 1} ${interval}), '%Y-%m-01')` : `MAKEDATE(YEAR(CURDATE()) - ${count - 1}, 1)`}
       GROUP BY bucket`,
      [sqlFormat]
    );
    const values = Object.fromEntries(rows.map((row) => [row.bucket, num(row.value)]));
    const series = [];
    for (let offset = count - 1; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (period === 'day') date.setDate(count - offset);
      if (period === 'month') date.setMonth(date.getMonth() - offset, 1);
      if (period === 'year') date.setFullYear(date.getFullYear() - offset, 0, 1);
      const key = period === 'day'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        : period === 'month'
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          : String(date.getFullYear());
      series.push({
        label: period === 'day'
          ? date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
          : period === 'month'
            ? date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })
            : key,
        value: values[key] || 0,
      });
    }
    res.json({ period, total: series.reduce((total, item) => total + item.value, 0), series });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/dashboard/network-users — rincian sesi MikroTik untuk widget dashboard */
r.get('/network-users', can('dashboard'), async (req, res) => {
  try {
    const { status = 'all', q: search, page = 1, limit = 8 } = req.query;
    if (status === 'customers') {
      const safeLimit = Math.min(25, Math.max(1, Number(limit) || 8));
      const safePage = Math.max(1, Number(page) || 1);
      const where = [];
      const params = [];
      if (search) {
        const like = `%${search}%`;
        where.push('(c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ? OR c.pppoe_username LIKE ?)');
        params.push(like, like, like, like);
      }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = await q(`SELECT COUNT(*) n FROM customers c ${w}`, params);
      const rows = await q(
        `SELECT c.id customer_id, c.name customer_name, c.code customer_code, c.phone,
                c.pppoe_username username, c.status, p.name package_name
         FROM customers c LEFT JOIN packages p ON p.id = c.package_id
         ${w} ORDER BY c.name ASC LIMIT ${safeLimit} OFFSET ${(safePage - 1) * safeLimit}`,
        params
      );
      return res.json({ rows, total: num(total[0]?.n) });
    }
    res.json(await monitoring.getSessions({ status, q: search, page, limit: Math.min(25, Math.max(1, Number(limit) || 8)) }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
