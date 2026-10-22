import { Router } from 'express';
import { q, exec, tx } from '../db.js';
import { logActivity, num, getSettings } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import { dueDateForInvoice, invoiceCycleTerms, invoiceTotal, activateCustomer, extendActivePeriod, ensureBillingSchema, generateInvoices, sendPaymentNotification } from '../services/billing.js';
import { ensureBanksSchema } from './banks.js';
import * as radius from '../services/radius.js';
import { notifyAll } from '../utils/notify.js';
import { sendCsv } from '../utils/csv.js';
import { upload } from '../utils/upload.js';

const r = Router();

/** ---------- Util tanggal lokal (sinkron dgn services/billing.js) ---------- */
const pad2 = (n) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

export const isFirstOpenInvoice = (invoice, firstOpenInvoice) => !firstOpenInvoice || invoice.id === firstOpenInvoice.id;

/** Status tagihan mengikuti total pembayaran confirmed yang masih tersisa. */
export const paymentStatusForTotal = (total, paidAmount) => {
  const paid = Math.max(0, num(paidAmount));
  if (paid <= 0.5) return 'unpaid';
  return paid >= num(total) - 0.5 ? 'paid' : 'partial';
};

async function firstOpenInvoice(customerId) {
  return (await q(
    `SELECT * FROM invoices WHERE customer_id = ? AND status IN ('unpaid','partial')
     ORDER BY period ASC, id ASC LIMIT 1`,
    [customerId]
  ))[0] || null;
}

/** Pratinjau siklus berikutnya + prorata tagihan pertama (logika sama dgn generateInvoices) */
async function previewCycle(cust, period, settings) {
  const prior = await q('SELECT COUNT(*) n FROM invoices WHERE customer_id = ?', [cust.id]);
  const terms = invoiceCycleTerms(cust, {
    refDate: period ? `${period}-15` : null,
    defaultBillingDay: num(settings.billing_day_default) || 5,
    hasPriorInvoice: num(prior[0]?.n) > 0,
  });
  return {
    period: terms.period,
    service_start: terms.serviceStart,
    service_end: terms.end,
    amount: terms.amount,
    prorated: terms.prorated,
    prorate_days: terms.prorateDays,
  };
}

/** GET /api/payments — riwayat pembayaran */
r.get('/', can('payments'), async (req, res) => {
  try {
    await ensureBanksSchema();
    const { method, bank_id, q: search, from, to, page = 1, limit = 15 } = req.query;
    const where = [];
    const params = [];
    if (method && method !== 'all') { where.push('pay.method = ?'); params.push(method); }
    if (bank_id && bank_id !== 'all') { where.push('pay.bank_id = ?'); params.push(Number(bank_id)); }
    if (from) { where.push('pay.payment_date >= ?'); params.push(`${from} 00:00:00`); }
    if (to) { where.push('pay.payment_date <= ?'); params.push(`${to} 23:59:59`); }
    if (search) {
      where.push('(c.name LIKE ? OR c.code LIKE ? OR i.number LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await q(
      `SELECT COUNT(*) n, COALESCE(SUM(pay.amount),0) v FROM payments pay
       JOIN customers c ON c.id = pay.customer_id JOIN invoices i ON i.id = pay.invoice_id ${w}`,
      params
    );
    // Pagination: pastikan page/limit selalu angka valid & batasi limit (maks 200)
    const lim = Math.min(Math.max(1, Number(limit) || 15), 200);
    const offset = (Math.max(1, Number(page) || 1) - 1) * lim;
    const rows = await q(
      `SELECT pay.*, c.name customer_name, c.code, c.area, i.number invoice_number, i.period,
              b.name bank_name, b.account_number bank_account, u.name created_by_name
       FROM payments pay JOIN customers c ON c.id = pay.customer_id
       JOIN invoices i ON i.id = pay.invoice_id
       LEFT JOIN banks b ON b.id = pay.bank_id
       LEFT JOIN users u ON u.id = pay.created_by
       ${w} ORDER BY pay.payment_date DESC LIMIT ${lim} OFFSET ${offset}`,
      params
    );
    res.json({ rows, total: num(total[0]?.n), sum: num(total[0]?.v) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
/** GET /api/payments/customer-options — daftar ringkas seluruh pelanggan untuk dropdown transaksi */
r.get('/customer-options', can('payments'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT c.id, c.code, c.name, c.phone, c.area, c.pppoe_username, c.status
       FROM customers c ORDER BY c.name ASC, c.id ASC`
    );
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/payments/open-invoices — semua tagihan terbuka periode paling awal tiap pelanggan. */
r.get('/open-invoices', can('payments'), async (req, res) => {
  try {
    // Samakan sumber daftar pembayaran dengan halaman Tagihan agar invoice yang baru
    // terbit langsung tersedia di semua popup pembayaran.
    await ensureBillingSchema();
    await generateInvoices(null, null, false);
    const search = req.query.q?.trim();
    const params = [];
    let where = `i.status IN ('unpaid','partial')
      AND NOT EXISTS (
        SELECT 1 FROM invoices earlier
        WHERE earlier.customer_id = i.customer_id
          AND earlier.status IN ('unpaid','partial')
          AND (earlier.period < i.period OR (earlier.period = i.period AND earlier.id < i.id))
      )`;
    if (search) {
      where += ' AND (i.number LIKE ? OR c.name LIKE ? OR c.code LIKE ? OR c.area LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    const rows = await q(
      `SELECT i.*, c.name customer_name, c.code, c.area,
              (i.amount + i.late_fee + i.additional_fee + i.tax - i.discount) total
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE ${where} ORDER BY i.period ASC, c.name ASC, i.id ASC`,
      params
    );
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/payments/context/:customerId — data auto-isi form Transaksi Pembayaran Tagihan.
 *  ?period=YYYY-MM opsional: cari tagihan terbuka periode itu, atau pratinjau siklus bulan tersebut. */
r.get('/context/:customerId', can('payments'), async (req, res) => {
  try {
    await ensureBillingSchema();
    // Kasir dapat masuk langsung ke transaksi; sinkronkan invoice terlebih dahulu
    // agar sumber data tagihan sama dengan halaman Tagihan.
    await generateInvoices(null, null, false);
    const cid = Number(req.params.customerId);
    const c = (await q(
      `SELECT c.id, c.code, c.name, c.phone, c.address, c.area, c.status, c.pppoe_username,
              c.active_until, c.billing_day, c.billing_type, c.activation_date, c.installation_date,
              p.id package_id, p.name package_name, p.price package_price,
              r.name router_name
       FROM customers c
       LEFT JOIN packages p ON p.id = c.package_id
       LEFT JOIN routers r ON r.id = p.router_id
       WHERE c.id = ?`,
      [cid]
    ))[0];
    if (!c) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' });

    const s = await getSettings(true);
    const period = /^\d{4}-\d{2}$/.test(req.query.period || '') ? req.query.period : null;
    // Periode berikutnya baru boleh dipilih setelah seluruh tagihan sebelumnya lunas.
    let inv = await firstOpenInvoice(cid);
    // Tagihan lama tanpa tanggal layanan → lengkapi dari siklus periode terkait
    if (inv && (!inv.service_start || !inv.service_end)) {
      const cyc = cycleForDate(c, `${inv.period}-15`, num(s.billing_day_default) || 5);
      inv.service_start = inv.service_start || cyc.start;
      inv.service_end = inv.service_end || cyc.end;
    }

    // Belum ada tagihan terbuka → pratinjau siklus yang akan dibuat otomatis saat dibayar
    const next = inv ? null : await previewCycle(c, period, s);

    const receivers = await q('SELECT id, name FROM users WHERE is_active = 1 ORDER BY id');
    res.json({ customer: c, invoice: inv, next, tax_percent: num(s.tax_percent) || 0, receivers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/payments — catat pembayaran (dukung cicilan/sebagian + upload bukti) */

/** GET /api/payments/export */
r.get('/export', can('payments', 'export'), async (req, res) => {
  try {
    await ensureBanksSchema();
    const rows = await q(
      `SELECT pay.id, pay.payment_date, c.code, c.name, c.area, i.number invoice_number, i.period,
              pay.amount, pay.method, b.name bank_name, pay.status, u.name kasir
       FROM payments pay JOIN customers c ON c.id = pay.customer_id
       JOIN invoices i ON i.id = pay.invoice_id
       LEFT JOIN banks b ON b.id = pay.bank_id
       LEFT JOIN users u ON u.id = pay.created_by ORDER BY pay.payment_date DESC`
    );
    sendCsv(res, 'pembayaran.csv', rows, [
      { key: 'id', label: 'ID' }, { key: 'payment_date', label: 'Tanggal' },
      { key: 'code', label: 'Kode' }, { key: 'name', label: 'Pelanggan' }, { key: 'area', label: 'Area' },
      { key: 'invoice_number', label: 'No Tagihan' }, { key: 'period', label: 'Periode' },
      { key: 'amount', label: 'Jumlah' }, { key: 'method', label: 'Metode' },
      { key: 'bank_name', label: 'Bank' }, { key: 'status', label: 'Status' }, { key: 'kasir', label: 'Kasir' },
    ]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** Handler bersama web/mobile untuk pembayaran tagihan. */
export async function createPayment(req, res) {
  try {
    const { invoice_id, amount, method = 'cash', note, bank_id } = req.body || {};
    const amt = Number(amount);
    if (!invoice_id || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: 'Tagihan & jumlah pembayaran wajib diisi' });
    }
    if (!['cash', 'transfer', 'qris', 'gateway'].includes(method)) {
      return res.status(400).json({ message: 'Metode pembayaran tidak valid' });
    }
    // Akun bank (transfer) dari Master Bank — divalidasi aktif
    let bankId = null;
    if (bank_id) {
      await ensureBanksSchema();
      const bank = (await q('SELECT * FROM banks WHERE id = ?', [Number(bank_id)]))[0];
      if (!bank || !bank.is_active) return res.status(400).json({ message: 'Akun bank tidak valid / tidak aktif' });
      bankId = bank.id;
    }
    const inv = (await q('SELECT * FROM invoices WHERE id = ?', [invoice_id]))[0];
    if (!inv) return res.status(404).json({ message: 'Tagihan tidak ditemukan' });
    if (inv.status === 'void') return res.status(400).json({ message: 'Tagihan sudah dibatalkan' });
    if (!['unpaid', 'partial'].includes(inv.status)) return res.status(400).json({ message: 'Tagihan sudah lunas' });
    const oldest = await firstOpenInvoice(inv.customer_id);
    if (!isFirstOpenInvoice(inv, oldest)) {
      return res.status(400).json({ message: `Lunasi tagihan periode ${oldest.period} terlebih dahulu` });
    }
    const total = invoiceTotal(inv);
    const remaining = total - num(inv.paid_amount);
    if (amt > remaining + 1) {
      return res.status(400).json({ message: `Jumlah melebihi sisa tagihan (sisa: ${remaining})` });
    }
    const proofPath = req.file ? `/uploads/${req.file.filename}` : null;
    // payment_date: pakai nilai body bila ada, selain itu NOW() MySQL (waktu server yang benar — bukan toISOString/UTC)
    const payDate = req.body?.payment_date || null;
    const result = await exec(
      `INSERT INTO payments (invoice_id, customer_id, amount, method, bank_id, proof_path, note, status, payment_date, created_by, confirmed_at)
       VALUES (?,?,?,?,?,?,?,'confirmed',COALESCE(?, NOW()),?,NOW())`,
      [invoice_id, inv.customer_id, amt, method, bankId, proofPath, note || null, payDate, req.user.id]
    );
    await applyPaymentToInvoice(inv, amt);
    await logActivity({ req, action: 'payments.create', module: 'payments', description: `Pembayaran ${inv.number} sebesar ${amt} via ${method}${bankId ? ' (bank terkait)' : ''}` });
    await notifyAll({
      title: 'Pembayaran diterima',
      message: `Pembayaran tagihan ${inv.number} sebesar Rp ${Number(amt).toLocaleString('id-ID')} telah dicatat.`,
      type: 'success',
    });
    res.json({ id: result.insertId, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/** POST /api/payments — catat pembayaran (dukung cicilan/sebagian + akun bank dari Master Bank) */
r.post('/', can('payments', 'create'), upload.single('proof'), createPayment);

/** POST /api/payments/quick — transaksi pembayaran otomatis (pilih pelanggan → bayar).
 *  Body: { customer_id, invoice_id?, period?, tariff, additional_fee, discount, tax_percent, method, note, receiver_id? }
 *  Tagihan belum ada → dibuat otomatis mengikuti siklus langganan (prorata tagihan pertama). */
r.post('/quick', can('payments', 'create'), async (req, res) => {
  try {
    await ensureBillingSchema();
    const { customer_id, invoice_id, period, tariff, additional_fee = 0, discount = 0, tax_percent = 0,
            method = 'cash', note, receiver_id } = req.body || {};
    const cid = Number(customer_id);
    if (!cid) return res.status(400).json({ message: 'Pelanggan wajib dipilih' });
    if (!['cash', 'transfer', 'qris', 'gateway'].includes(method)) {
      return res.status(400).json({ message: 'Metode pembayaran tidak valid' });
    }
    const cust = (await q(
      `SELECT c.*, p.price package_price FROM customers c
       LEFT JOIN packages p ON p.id = c.package_id WHERE c.id = ?`,
      [cid]
    ))[0];
    if (!cust) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' });

    const s = await getSettings(true);
    const per = /^\d{4}-\d{2}$/.test(period || '') ? period : null;
    let inv = await firstOpenInvoice(cid);
    if (!inv) {
      // Buat tagihan siklus berjalan otomatis (penomoran & prorata sama dgn generateInvoices)
      const prior = await q('SELECT COUNT(*) n FROM invoices WHERE customer_id = ?', [cid]);
      const terms = invoiceCycleTerms(cust, {
        refDate: per ? `${per}-15` : null,
        defaultBillingDay: num(s.billing_day_default) || 5,
        hasPriorInvoice: num(prior[0]?.n) > 0,
      });
      const seqRows = await q('SELECT COUNT(*) n FROM invoices WHERE period = ?', [terms.period]);
      const number = `INV-${terms.period.replace('-', '')}-${String(num(seqRows[0]?.n) + 1).padStart(4, '0')}`;
      const ins = await exec(
        `INSERT INTO invoices (number, customer_id, period, invoice_date, due_date, amount, tax, service_start, service_end)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [number, cid, terms.period, todayIso(), dueDateForInvoice(terms.end, cust.grace_days, s.grace_days), terms.amount, 0, terms.serviceStart, terms.end]
      );
      inv = (await q('SELECT * FROM invoices WHERE id = ?', [ins.insertId]))[0];
    }

    if (num(inv.paid_amount) > 0) {
      return res.status(400).json({ message: 'Tagihan yang sudah memiliki pembayaran tidak dapat diubah melalui kasir' });
    }

    // Tarif prorata tidak boleh ditimpa tarif paket penuh oleh form kasir.
    // Biaya tambahan disimpan terpisah agar rumus total konsisten di semua kanal.
    const invStart = String(inv.service_start || '').slice(0, 10);
    const activationDate = String(cust.activation_date || '').slice(0, 10);
    const isProrated = invStart === activationDate && num(inv.amount) < num(cust.package_price);
    const amount = Math.max(0, isProrated ? num(inv.amount) : num(tariff));
    const additionalFee = Math.max(0, num(additional_fee));
    const disc = Math.max(0, num(discount));
    const lateFee = num(inv.late_fee);
    if (disc > amount + lateFee + additionalFee) {
      return res.status(400).json({ message: 'Diskon tidak boleh melebihi total tagihan sebelum pajak' });
    }
    const totalTagihan = Math.max(0, amount + lateFee + additionalFee - disc);
    const tax = Math.round((totalTagihan * Math.max(0, num(tax_percent))) / 100);
    await exec('UPDATE invoices SET amount = ?, additional_fee = ?, discount = ?, tax = ? WHERE id = ?', [amount, additionalFee, disc, tax, inv.id]);
    inv = { ...inv, amount, additional_fee: additionalFee, discount: disc, tax };

    const grand = invoiceTotal(inv); // amount + late_fee + additional_fee + tax - discount
    const remaining = Math.max(0, grand - num(inv.paid_amount));
    if (remaining <= 0) return res.status(400).json({ message: 'Tagihan ini sudah lunas' });

    // Penerima pembayaran: user aktif (fallback: user yang sedang login)
    let createdBy = req.user.id;
    if (receiver_id) {
      const u = (await q('SELECT id FROM users WHERE id = ? AND is_active = 1', [Number(receiver_id)]))[0];
      if (u) createdBy = u.id;
    }

    const result = await exec(
      `INSERT INTO payments (invoice_id, customer_id, amount, method, note, status, payment_date, created_by, confirmed_at)
       VALUES (?,?,?,?,?,'confirmed',NOW(),?,NOW())`,
      [inv.id, cid, remaining, method, note || null, createdBy]
    );
    await applyPaymentToInvoice(inv, remaining);
    await logActivity({
      req, action: 'payments.quick', module: 'payments',
      description: `Transaksi pembayaran ${inv.number} (${cust.name}) sebesar ${remaining} via ${method}`,
    });
    await notifyAll({
      title: 'Pembayaran diterima',
      message: `Pembayaran tagihan ${inv.number} sebesar Rp ${Number(remaining).toLocaleString('id-ID')} telah dicatat.`,
      type: 'success',
    });
    res.json({ id: result.insertId, invoice_id: inv.id, number: inv.number, ok: true, status: 'paid' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** Terapkan pembayaran ke invoice (status, pelunasan, aktivasi real-time, perpanjang masa aktif) */
async function applyPaymentToInvoice(inv, amount) {
  const newPaid = num(inv.paid_amount) + Number(amount);
  const total = invoiceTotal(inv);
  const status = newPaid >= total - 0.5 ? 'paid' : 'partial';
  await exec('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [newPaid, status, inv.id]);
  if (status === 'paid') {
    // Perpanjang masa aktif hingga Tanggal Berakhir tagihan yang dibayar (alur 9.1 langkah 5)
    await extendActivePeriod(inv.customer_id, inv.service_end || inv.period);
    const cust = (await q('SELECT status FROM customers WHERE id = ?', [inv.customer_id]))[0];
    // Auto aktivasi + enable RADIUS/Mikrotik setelah lunas (isolir maupun disabled)
    if (cust?.status === 'isolated' || cust?.status === 'disabled') {
      await activateCustomer(inv.customer_id, null);
    } else {
      await radius.applyCustomerProfile(inv.customer_id);
    }
    await sendPaymentNotification(inv);
  }
}

/** POST /api/payments/:id/confirm — konfirmasi pembayaran pending (rekonsiliasi manual) */
r.post('/:id/confirm', can('payments', 'edit'), async (req, res) => {
  try {
    const pay = (await q('SELECT * FROM payments WHERE id = ?', [req.params.id]))[0];
    if (!pay) return res.status(404).json({ message: 'Pembayaran tidak ditemukan' });
    if (pay.status === 'confirmed') return res.status(400).json({ message: 'Sudah dikonfirmasi' });
    await exec("UPDATE payments SET status = 'confirmed', confirmed_at = NOW() WHERE id = ?", [pay.id]);
    const inv = (await q('SELECT * FROM invoices WHERE id = ?', [pay.invoice_id]))[0];
    await applyPaymentToInvoice(inv, num(pay.amount));
    await logActivity({ req, action: 'payments.confirm', module: 'payments', description: `Konfirmasi pembayaran #${pay.id} (${inv.number})` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/payments/:id — hapus salah input dan kembalikan status tagihan dari sisa pembayaran. */
r.delete('/:id', can('payments', 'delete'), async (req, res) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId < 1) {
      return res.status(400).json({ message: 'ID pembayaran tidak valid' });
    }

    const result = await tx(async (conn) => {
      const [rows] = await conn.query(
        `SELECT pay.id, pay.invoice_id, pay.status payment_status, i.number invoice_number,
                i.amount, i.late_fee, i.additional_fee, i.tax, i.discount
         FROM payments pay JOIN invoices i ON i.id = pay.invoice_id
         WHERE pay.id = ? FOR UPDATE`,
        [paymentId],
      );
      const payment = rows[0];
      if (!payment) {
        const err = new Error('Pembayaran tidak ditemukan');
        err.status = 404;
        throw err;
      }

      await conn.query('DELETE FROM payments WHERE id = ?', [payment.id]);
      const [totals] = await conn.query(
        "SELECT COALESCE(SUM(amount), 0) paid_amount FROM payments WHERE invoice_id = ? AND status = 'confirmed'",
        [payment.invoice_id],
      );
      const paidAmount = num(totals[0]?.paid_amount);
      const invoiceStatus = paymentStatusForTotal(invoiceTotal(payment), paidAmount);
      await conn.query('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [paidAmount, invoiceStatus, payment.invoice_id]);

      return { invoiceId: payment.invoice_id, invoiceNumber: payment.invoice_number, invoiceStatus };
    });

    await logActivity({
      req, action: 'payments.delete', module: 'payments',
      description: `Menghapus pembayaran #${paymentId} untuk tagihan ${result.invoiceNumber}; status tagihan menjadi ${result.invoiceStatus}`,
    });
    res.json({ ok: true, invoice_id: result.invoiceId, invoice_status: result.invoiceStatus });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

/** GET /api/payments/:id/receipt — data kwitansi */
r.get('/:id/receipt', can('payments'), async (req, res) => {
  try {
    const pay = (await q(
      `SELECT pay.*, c.name customer_name, c.code, c.address, i.number invoice_number, i.period,
              i.amount inv_amount, i.late_fee, i.additional_fee, i.tax, i.discount, u.name created_by_name
       FROM payments pay JOIN customers c ON c.id = pay.customer_id
       JOIN invoices i ON i.id = pay.invoice_id
       LEFT JOIN users u ON u.id = pay.created_by WHERE pay.id = ?`,
      [req.params.id]
    ))[0];
    if (!pay) return res.status(404).json({ message: 'Pembayaran tidak ditemukan' });
    const settings = await getSettings(true);
    res.json({ payment: pay, company: settings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;

