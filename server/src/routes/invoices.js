import { Router } from 'express';
import { q, exec, tx } from '../db.js';
import { logActivity, num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import { curPeriod, generateInvoices, applyLateFees, invoiceTotal, recalculateProratedInvoices, recalculateInvoiceDueDates, automaticInvoicePeriod, ensureBillingSchema } from '../services/billing.js';
import { sendCsv } from '../utils/csv.js';

const r = Router();

/** GET /api/invoices — daftar tagihan + filter */
r.get('/', can('invoices'), async (req, res) => {
  try {
    // Endpoint daftar tagihan adalah sumber data UI. Sinkron dulu agar pelanggan baru
    // tidak perlu menunggu job tengah malam atau aksi generate manual.
    await generateInvoices(null, null, false);
    const { period, status, q: search, page = 1, limit = 10 } = req.query;
    const where = [];
    const params = [];
    if (period && period !== 'all') { where.push('i.period = ?'); params.push(period); }
    if (status && status !== 'all') { where.push('i.status = ?'); params.push(status); }
    if (search) {
      where.push('(i.number LIKE ? OR c.name LIKE ? OR c.code LIKE ? OR c.area LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await q(
      `SELECT COUNT(*) n, COALESCE(SUM(i.amount + i.late_fee + i.additional_fee + i.tax - i.discount),0) billed,
              COALESCE(SUM(i.paid_amount),0) paid
       FROM invoices i JOIN customers c ON c.id = i.customer_id ${w}`,
      params
    );
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const rows = await q(
      `SELECT i.*, c.name customer_name, c.code, c.phone, c.area, c.billing_type, p.name package_name,
              (i.amount + i.late_fee + i.additional_fee + i.tax - i.discount) total
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       LEFT JOIN packages p ON p.id = c.package_id
       ${w} ORDER BY i.period DESC, c.name ASC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );
    res.json({
      rows,
      total: num(total[0]?.n),
      summary: { billed: num(total[0]?.billed), paid: num(total[0]?.paid) },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/invoices/periods */
r.get('/periods', can('invoices'), async (req, res) => {
  try {
    const rows = await q('SELECT DISTINCT period FROM invoices ORDER BY period DESC');
    res.json({ periods: rows.map((x) => x.period), current: curPeriod() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/invoices/export */
r.get('/export', can('invoices', 'export'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT i.number, i.period, i.service_start, i.service_end, c.code, c.name, i.invoice_date, i.due_date, i.amount, i.late_fee,
              i.additional_fee, i.tax, i.discount, (i.amount + i.late_fee + i.additional_fee + i.tax - i.discount) total, i.paid_amount, i.status
       FROM invoices i JOIN customers c ON c.id = i.customer_id ORDER BY i.period DESC, i.number`
    );
    sendCsv(res, 'tagihan.csv', rows, [
      { key: 'number', label: 'No Tagihan' }, { key: 'period', label: 'Periode' },
      { key: 'service_start', label: 'Layanan Mulai' }, { key: 'service_end', label: 'Layanan Berakhir' },
      { key: 'code', label: 'Kode' }, { key: 'name', label: 'Pelanggan' },
      { key: 'invoice_date', label: 'Tgl Tagihan' }, { key: 'due_date', label: 'Jatuh Tempo' },
      { key: 'amount', label: 'Nilai' }, { key: 'late_fee', label: 'Denda' }, { key: 'additional_fee', label: 'Biaya Tambahan' }, { key: 'discount', label: 'Diskon' }, { key: 'tax', label: 'Pajak' },
      { key: 'total', label: 'Total' }, { key: 'paid_amount', label: 'Dibayar' }, { key: 'status', label: 'Status' },
    ]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/invoices/:id — detail + pembayaran */
r.get('/:id', can('invoices'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT i.*, c.name customer_name, c.code, c.phone, c.address, c.email, c.pppoe_username,
              p.name package_name, p.speed package_speed
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       LEFT JOIN packages p ON p.id = c.package_id WHERE i.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Tagihan tidak ditemukan' });
    const payments = await q(
      `SELECT pay.*, u.name created_by_name FROM payments pay
       LEFT JOIN users u ON u.id = pay.created_by
       WHERE pay.invoice_id = ? ORDER BY pay.payment_date DESC`,
      [req.params.id]
    );
    const settings = { company_name: (await q("SELECT svalue FROM settings WHERE skey='company_name'"))[0]?.svalue };
    res.json({ invoice: { ...rows[0], total: invoiceTotal(rows[0]) }, payments, company: settings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/invoices/:id/adjustments — biaya tambahan dan diskon sebelum pembayaran. */
r.put('/:id/adjustments', can('invoices', 'edit'), async (req, res) => {
  try {
    await ensureBillingSchema();
    const id = Number(req.params.id);
    const additionalFee = Number(req.body?.additional_fee);
    const discount = Number(req.body?.discount);
    const note = String(req.body?.note || '').trim();
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'ID tagihan tidak valid' });
    if (!Number.isFinite(additionalFee) || additionalFee < 0 || !Number.isFinite(discount) || discount < 0) {
      return res.status(400).json({ message: 'Biaya tambahan dan diskon harus berupa nominal nol atau lebih' });
    }
    const inv = (await q('SELECT * FROM invoices WHERE id = ?', [id]))[0];
    if (!inv) return res.status(404).json({ message: 'Tagihan tidak ditemukan' });
    if (inv.status !== 'unpaid' || num(inv.paid_amount) !== 0) {
      return res.status(400).json({ message: 'Biaya dan diskon hanya dapat diubah pada tagihan belum dibayar tanpa pembayaran' });
    }
    const beforeDiscount = num(inv.amount) + num(inv.late_fee) + additionalFee + num(inv.tax);
    if (discount > beforeDiscount) return res.status(400).json({ message: 'Diskon tidak boleh melebihi total tagihan' });
    await exec('UPDATE invoices SET additional_fee = ?, discount = ?, note = ? WHERE id = ?', [additionalFee, discount, note || null, id]);
    const updated = { ...inv, additional_fee: additionalFee, discount, note: note || null };
    await logActivity({ req, action: 'invoices.adjustments', module: 'invoices', description: `Memperbarui biaya tambahan dan diskon tagihan ${inv.number}` });
    res.json({ invoice: { ...updated, total: invoiceTotal(updated) } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/invoices/generate — generate massal (dukung dry-run) */
r.post('/generate', can('invoices', 'create'), async (req, res) => {
  try {
    const period = req.body?.period || automaticInvoicePeriod();
    const dryRun = !!req.body?.dryRun;
    if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ message: 'Format periode harus YYYY-MM' });
    const result = await generateInvoices(period, req.user, dryRun);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/invoices/apply-late-fees */
r.post('/apply-late-fees', can('invoices', 'edit'), async (req, res) => {
  try {
    const result = await applyLateFees(req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/invoices/recalculate-prorata — perbaiki invoice pertama lama yang belum dibayar */
r.post('/recalculate-prorata', can('invoices', 'edit'), async (req, res) => {
  try {
    res.json(await recalculateProratedInvoices(req.user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/invoices/recalculate-due-dates — terapkan batas waktu pembayaran pelanggan */
r.post('/recalculate-due-dates', can('invoices', 'edit'), async (req, res) => {
  try {
    res.json(await recalculateInvoiceDueDates(req.user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/invoices — hapus massal tagihan tanpa pembayaran */
r.delete('/', can('invoices', 'delete'), async (req, res) => {
  try {
    const ids = [...new Set(req.body?.ids || [])].map(Number).filter(Number.isSafeInteger);
    if (!ids.length || ids.length > 1000) return res.status(400).json({ message: 'Pilih 1 sampai 1000 tagihan' });
    const result = await tx(async (conn) => {
      const marks = ids.map(() => '?').join(',');
      const [rows] = await conn.query(
        `SELECT i.id, i.number FROM invoices i
         WHERE i.id IN (${marks}) AND i.status IN ('unpaid', 'void') AND i.paid_amount = 0
           AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id)
         FOR UPDATE`,
        ids,
      );
      if (rows.length) await conn.query(`DELETE FROM invoices WHERE id IN (${rows.map(() => '?').join(',')})`, rows.map((x) => x.id));
      return { deleted: rows.length, skipped: ids.length - rows.length, numbers: rows.map((x) => x.number) };
    });
    if (result.deleted) {
      await logActivity({ req, action: 'invoices.bulk_delete', module: 'invoices', description: `Menghapus ${result.deleted} tagihan: ${result.numbers.join(', ')}` });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/invoices/:id/void */
r.post('/:id/void', can('invoices', 'edit'), async (req, res) => {
  try {
    const inv = await q('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!inv[0]) return res.status(404).json({ message: 'Tagihan tidak ditemukan' });
    if (num(inv[0].paid_amount) > 0) {
      return res.status(400).json({ message: 'Tagihan sudah memiliki pembayaran, tidak bisa dibatalkan' });
    }
    await exec("UPDATE invoices SET status = 'void' WHERE id = ?", [req.params.id]);
    await logActivity({ req, action: 'invoices.void', module: 'invoices', description: `Membatalkan tagihan ${inv[0].number}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
