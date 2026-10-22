import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity, num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';

const r = Router();

/** GET /api/areas — daftar master wilayah + jumlah pelanggan pemakai */
r.get('/', can('customers'), async (req, res) => {
  try {
    const { q: search } = req.query;
    const where = [];
    const params = [];
    if (search) {
      where.push('(a.name LIKE ? OR a.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(
      `SELECT a.*, (SELECT COUNT(*) FROM customers c WHERE c.area = a.name) AS customers_count
       FROM areas a ${w} ORDER BY a.name ASC`,
      params
    );
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/areas — tambah wilayah */
r.post('/', can('customers', 'create'), async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Nama wilayah wajib diisi' });
    const dup = await q('SELECT id FROM areas WHERE name = ?', [name]);
    if (dup[0]) return res.status(400).json({ message: `Wilayah "${name}" sudah ada` });
    const result = await exec(
      'INSERT INTO areas (name, description, is_active) VALUES (?,?,?)',
      [name, b.description || null, b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1]
    );
    await logActivity({ req, action: 'areas.create', module: 'customers', description: `Menambah wilayah ${name}` });
    res.json({ id: result.insertId, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/areas/:id — ubah wilayah */
r.put('/:id', can('customers', 'edit'), async (req, res) => {
  try {
    const old = (await q('SELECT * FROM areas WHERE id = ?', [req.params.id]))[0];
    if (!old) return res.status(404).json({ message: 'Wilayah tidak ditemukan' });
    const b = req.body || {};
    const name = String((b.name ?? old.name) || '').trim();
    if (!name) return res.status(400).json({ message: 'Nama wilayah wajib diisi' });
    if (name !== old.name) {
      const dup = await q('SELECT id FROM areas WHERE name = ? AND id <> ?', [name, req.params.id]);
      if (dup[0]) return res.status(400).json({ message: `Wilayah "${name}" sudah ada` });
    }
    await exec(
      'UPDATE areas SET name=?, description=?, is_active=? WHERE id=?',
      [name,
        b.description !== undefined ? (b.description || null) : old.description,
        b.is_active !== undefined ? (b.is_active ? 1 : 0) : old.is_active,
        req.params.id]
    );
    await logActivity({ req, action: 'areas.update', module: 'customers', description: `Mengubah wilayah ${old.name} → ${name}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/areas/:id — hapus wilayah (ditolak bila masih dipakai pelanggan) */
r.delete('/:id', can('customers', 'delete'), async (req, res) => {
  try {
    const old = (await q('SELECT * FROM areas WHERE id = ?', [req.params.id]))[0];
    if (!old) return res.status(404).json({ message: 'Wilayah tidak ditemukan' });
    const used = await q('SELECT COUNT(*) n FROM customers WHERE area = ?', [old.name]);
    if (num(used[0]?.n) > 0) {
      return res.status(400).json({ message: `Wilayah masih dipakai ${num(used[0].n)} pelanggan, nonaktifkan saja` });
    }
    await exec('DELETE FROM areas WHERE id = ?', [req.params.id]);
    await logActivity({ req, action: 'areas.delete', module: 'customers', description: `Menghapus wilayah ${old.name}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
