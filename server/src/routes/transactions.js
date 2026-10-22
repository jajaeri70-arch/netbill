import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity, num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import { sendCsv } from '../utils/csv.js';
import { upload } from '../utils/upload.js';

const r = Router();

/** GET /api/transactions — transaksi non-tagihan (PRD 5.9) */
r.get('/', can('transactions'), async (req, res) => {
  try {
    const { type, q: search, from, to, category_id, status, page = 1, limit = 15 } = req.query;
    const where = [];
    const params = [];
    if (type && type !== 'all') { where.push('t.type = ?'); params.push(type); }
    if (category_id) { where.push('t.category_id = ?'); params.push(category_id); }
    if (status && status !== 'all') { where.push('t.status = ?'); params.push(status); }
    if (from) { where.push('t.tx_date >= ?'); params.push(from); }
    if (to) { where.push('t.tx_date <= ?'); params.push(to); }
    if (search) {
      where.push('(t.description LIKE ? OR tc.name LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await q(
      `SELECT COUNT(*) n, COALESCE(SUM(t.amount),0) v FROM transactions t
       LEFT JOIN transaction_categories tc ON tc.id = t.category_id ${w}`,
      params
    );
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const rows = await q(
      `SELECT t.*, tc.name category_name, tc.type category_type, u.name created_by_name, a.name approved_by_name
       FROM transactions t
       LEFT JOIN transaction_categories tc ON tc.id = t.category_id
       LEFT JOIN users u ON u.id = t.created_by
       LEFT JOIN users a ON a.id = t.approved_by
       ${w} ORDER BY t.tx_date DESC, t.id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );
    res.json({ rows, total: num(total[0]?.n), sum: num(total[0]?.v) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/transactions — catat pemasukan/pengeluaran + lampiran */
r.post('/', can('transactions', 'create'), upload.single('attachment'), async (req, res) => {
  try {
    const { type, category_id, amount, tx_date, description, requires_approval } = req.body || {};
    if (!['income', 'expense'].includes(type) || !amount || !tx_date) {
      return res.status(400).json({ message: 'Tipe, tanggal & jumlah wajib diisi' });
    }
    const settings = await getSettingsSafe();
    const needApproval = requires_approval === '1' ||
      (settings.approval_threshold && Number(amount) >= Number(settings.approval_threshold));
    const result = await exec(
      `INSERT INTO transactions (type, category_id, amount, tx_date, description, attachment_path, status, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [type, category_id || null, amount, tx_date, description || null,
        req.file ? `/uploads/${req.file.filename}` : null,
        needApproval ? 'pending' : 'approved', req.user.id]
    );
    await logActivity({ req, action: 'transactions.create', module: 'transactions', description: `Transaksi ${type} Rp ${Number(amount).toLocaleString('id-ID')}${needApproval ? ' (menunggu approval)' : ''}` });
    res.json({ id: result.insertId, ok: true, pending: needApproval });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/transactions/:id */
r.put('/:id', can('transactions', 'edit'), upload.single('attachment'), async (req, res) => {
  try {
    const { type, category_id, amount, tx_date, description } = req.body || {};
    await exec(
      `UPDATE transactions SET type=?, category_id=?, amount=?, tx_date=?, description=?,
        attachment_path=COALESCE(?, attachment_path) WHERE id=?`,
      [type, category_id || null, amount, tx_date, description || null,
        req.file ? `/uploads/${req.file.filename}` : null, req.params.id]
    );
    await logActivity({ req, action: 'transactions.update', module: 'transactions', description: `Mengubah transaksi #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/transactions/:id */
r.delete('/:id', can('transactions', 'delete'), async (req, res) => {
  try {
    await exec('DELETE FROM transactions WHERE id = ?', [req.params.id]);
    await logActivity({ req, action: 'transactions.delete', module: 'transactions', description: `Menghapus transaksi #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/transactions/:id/approve — approval owner (workflow PRD 5.9) */
r.post('/:id/approve', can('transactions', 'edit'), async (req, res) => {
  try {
    await exec("UPDATE transactions SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?", [req.user.id, req.params.id]);
    await logActivity({ req, action: 'transactions.approve', module: 'transactions', description: `Menyetujui transaksi #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/transactions/export — CSV sesuai filter laporan aktif */
r.get('/export', can('transactions', 'export'), async (req, res) => {
  try {
    const { type, q: search, from, to, category_id, status } = req.query;
    const where = [];
    const params = [];
    if (type && type !== 'all') { where.push('t.type = ?'); params.push(type); }
    if (category_id) { where.push('t.category_id = ?'); params.push(category_id); }
    if (status && status !== 'all') { where.push('t.status = ?'); params.push(status); }
    if (from) { where.push('t.tx_date >= ?'); params.push(from); }
    if (to) { where.push('t.tx_date <= ?'); params.push(to); }
    if (search) {
      where.push('(t.description LIKE ? OR tc.name LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(
      `SELECT t.id, t.tx_date, t.type, tc.name category_name, t.amount, t.description, t.status, u.name created_by_name
       FROM transactions t LEFT JOIN transaction_categories tc ON tc.id = t.category_id
       LEFT JOIN users u ON u.id = t.created_by ${w} ORDER BY t.tx_date DESC, t.id DESC`, params
    );
    sendCsv(res, type === 'expense' ? 'laporan-pengeluaran.csv' : 'transaksi-non-tagihan.csv', rows, [
      { key: 'id', label: 'ID' }, { key: 'tx_date', label: 'Tanggal' }, { key: 'type', label: 'Tipe' },
      { key: 'category_name', label: 'Kategori' }, { key: 'amount', label: 'Jumlah' },
      { key: 'description', label: 'Keterangan' }, { key: 'status', label: 'Status' },
      { key: 'created_by_name', label: 'Diinput Oleh' },
    ]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;


async function getSettingsSafe() {
  const rows = await q('SELECT skey, svalue FROM settings');
  return Object.fromEntries(rows.map((x) => [x.skey, x.svalue]));
}
