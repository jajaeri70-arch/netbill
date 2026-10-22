import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity } from '../utils/helper.js';
import { can } from '../middleware/auth.js';

const r = Router();

/** GET /api/transaction-categories */
r.get('/', can('categories'), async (req, res) => {
  try {
    const { type } = req.query;
    const rows = type
      ? await q('SELECT * FROM transaction_categories WHERE type = ? ORDER BY name', [type])
      : await q('SELECT * FROM transaction_categories ORDER BY type, name');
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/transaction-categories */
r.post('/', can('categories', 'create'), async (req, res) => {
  try {
    const { name, type, description } = req.body || {};
    if (!name || !['income', 'expense'].includes(type)) {
      return res.status(400).json({ message: 'Nama & tipe kategori wajib valid' });
    }
    const result = await exec(
      'INSERT INTO transaction_categories (name, type, description) VALUES (?,?,?)',
      [name, type, description || null]
    );
    await logActivity({ req, action: 'categories.create', module: 'categories', description: `Menambah kategori ${name} (${type})` });
    res.json({ id: result.insertId, ok: true });
  } catch (err) {
    if (String(err.message).includes('Duplicate')) {
      return res.status(400).json({ message: 'Kategori sudah ada' });
    }
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/transaction-categories/:id */
r.put('/:id', can('categories', 'edit'), async (req, res) => {
  try {
    const { name, description, is_active } = req.body || {};
    await exec('UPDATE transaction_categories SET name=?, description=?, is_active=? WHERE id=?',
      [name, description || null, is_active ? 1 : 0, req.params.id]);
    await logActivity({ req, action: 'categories.update', module: 'categories', description: `Mengubah kategori #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/transaction-categories/:id */
r.delete('/:id', can('categories', 'delete'), async (req, res) => {
  try {
    await exec('DELETE FROM transaction_categories WHERE id = ?', [req.params.id]);
    await logActivity({ req, action: 'categories.delete', module: 'categories', description: `Menghapus kategori #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
