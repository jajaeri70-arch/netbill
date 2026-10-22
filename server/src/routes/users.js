import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, exec } from '../db.js';
import { logActivity, num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';

const r = Router();
const VALID_ROLES = new Set(['owner', 'finance', 'teknisi', 'kasir']);

/** GET /api/users */
r.get('/', can('users'), async (req, res) => {
  try {
    const rows = await q(
      'SELECT id, name, username, email, role, phone, is_active, last_login_at, created_at FROM users ORDER BY id'
    );
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/users */
r.post('/', can('users', 'create'), async (req, res) => {
  try {
    const { name, username, email, password, role, phone } = req.body || {};
    if (!name || !username || !email || !password || !role) {
      return res.status(400).json({ message: 'Semua field wajib diisi' });
    }
    if (!VALID_ROLES.has(role)) return res.status(400).json({ message: 'Role tidak valid' });
    if (password.length < 6) return res.status(400).json({ message: 'Password minimal 6 karakter' });
    const result = await exec(
      'INSERT INTO users (name, username, email, password_hash, role, phone) VALUES (?,?,?,?,?,?)',
      [name, username, email, bcrypt.hashSync(password, 10), role, phone || null]
    );
    await logActivity({ req, action: 'users.create', module: 'users', description: `Membuat user ${username} (${role})` });
    res.json({ id: result.insertId, ok: true });
  } catch (err) {
    if (String(err.message).includes('Duplicate')) {
      return res.status(400).json({ message: 'Username atau email sudah dipakai' });
    }
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/users/:id */
r.put('/:id', can('users', 'edit'), async (req, res) => {
  try {
    const { name, username, email, role, phone, is_active } = req.body || {};
    const target = (await q('SELECT * FROM users WHERE id = ?', [req.params.id]))[0];
    if (!target) return res.status(404).json({ message: 'User tidak ditemukan' });
    if (role !== undefined && !VALID_ROLES.has(role)) return res.status(400).json({ message: 'Role tidak valid' });
    if (target.role === 'owner' && is_active === 0) {
      return res.status(400).json({ message: 'Akun owner tidak dapat dinonaktifkan' });
    }

    const nextUsername = username !== undefined ? String(username).trim().toLowerCase() : target.username;
    if (!nextUsername) return res.status(400).json({ message: 'Username wajib diisi' });

    await exec('UPDATE users SET name=?, username=?, email=?, role=?, phone=?, is_active=? WHERE id=?',
      [name ?? target.name, nextUsername, email ?? target.email, role ?? target.role,
        phone ?? target.phone, is_active !== undefined ? is_active : target.is_active, req.params.id]);
    await logActivity({ req, action: 'users.update', module: 'users', description: `Mengubah user ${target.username}${nextUsername !== target.username ? ` menjadi ${nextUsername}` : ''}` });
    res.json({ ok: true });
  } catch (err) {
    if (String(err.message).includes('Duplicate')) {
      return res.status(400).json({ message: 'Username atau email sudah dipakai' });
    }
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/users/:id/reset-password */
r.post('/:id/reset-password', can('users', 'edit'), async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password minimal 6 karakter' });
    }
    await exec('UPDATE users SET password_hash = ? WHERE id = ?', [
      bcrypt.hashSync(password, 10), req.params.id,
    ]);
    await logActivity({ req, action: 'users.reset_password', module: 'users', description: `Reset password user #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/users/:id */
r.delete('/:id', can('users', 'delete'), async (req, res) => {
  try {
    const target = (await q('SELECT * FROM users WHERE id = ?', [req.params.id]))[0];
    if (!target) return res.status(404).json({ message: 'User tidak ditemukan' });
    if (Number(target.id) === Number(req.user.id)) {
      return res.status(400).json({ message: 'Tidak bisa menghapus akun sendiri' });
    }
    if (target.role === 'owner') {
      return res.status(400).json({ message: 'Akun owner tidak dapat dihapus' });
    }
    await exec('DELETE FROM users WHERE id = ?', [req.params.id]);
    await logActivity({ req, action: 'users.delete', module: 'users', description: `Menghapus user ${target.username}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
