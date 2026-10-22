import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q, exec } from '../db.js';
import config from '../config.js';
import { authenticate, getRolePermissions, MENUS } from '../middleware/auth.js';
import { logActivity } from '../utils/helper.js';

const r = Router();

function fullPermissions() {
  const p = {};
  for (const m of MENUS) p[m] = { view: true, create: true, edit: true, delete: true, export: true };
  return p;
}

/** Login bersama untuk web dan mobile. */
export async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Username/email dan password wajib diisi' });
    }
    const users = await q('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
    const user = users[0];
    if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ message: 'Kredensial salah atau akun tidak aktif' });
    }
    await exec('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    const token = jwt.sign({ id: user.id, role: user.role }, config.jwt.secret, {
      expiresIn: config.jwt.expires,
    });
    await logActivity({
      req, action: 'auth.login', module: 'auth', description: 'Login berhasil',
      userId: user.id, userName: user.name, role: user.role,
    });
    res.json({
      token,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/** POST /api/auth/login */
r.post('/login', login);

/** POST /api/auth/register — pendaftaran akun baru dari halaman publik /register */
r.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    const nama = String(name || '').trim();
    const mail = String(email || '').trim().toLowerCase();
    const VALID_ROLES = ['owner', 'finance', 'kasir', 'teknisi'];

    if (!nama) return res.status(400).json({ message: 'Nama wajib diisi' });
    if (nama.length > 100) return res.status(400).json({ message: 'Nama maksimal 100 karakter' });
    if (!/^\S+@\S+\.\S+$/.test(mail) || mail.length > 120) {
      return res.status(400).json({ message: 'Format email tidak valid' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password minimal 6 karakter' });
    }
    const chosenRole = VALID_ROLES.includes(role) ? role : 'owner';

    const dupEmail = await q('SELECT id FROM users WHERE email = ?', [mail]);
    if (dupEmail[0]) return res.status(409).json({ message: 'Email sudah terdaftar — silakan masuk' });

    // Username otomatis dari bagian email sebelum "@", diberi akhiran bila sudah dipakai
    const base = mail.split('@')[0].replace(/[^a-z0-9._-]/g, '').slice(0, 40) || 'user';
    let username = base;
    for (let i = 2; i <= 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const dup = await q('SELECT id FROM users WHERE username = ?', [username]);
      if (!dup[0]) break;
      username = `${base}-${i}`;
    }

    const result = await exec(
      'INSERT INTO users (name, username, email, password_hash, role, is_active) VALUES (?,?,?,?,?,1)',
      [nama, username, mail, bcrypt.hashSync(String(password), 10), chosenRole]
    );
    await logActivity({
      req, action: 'auth.register', module: 'auth',
      description: `Registrasi akun baru ${nama} (${mail}) sebagai ${chosenRole}`,
      userId: result.insertId, userName: nama, role: chosenRole,
    });
    res.status(201).json({
      message: 'Registrasi berhasil. Silakan masuk dengan akun Anda.',
      user: { id: result.insertId, name: nama, username, email: mail, role: chosenRole },
    });
  } catch (err) {
    if (String(err.message).includes('Duplicate')) {
      return res.status(409).json({ message: 'Email sudah terdaftar — silakan masuk' });
    }
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/auth/me — user + permissions untuk RBAC frontend */
r.get('/me', authenticate, async (req, res) => {
  const perms = await getRolePermissions(req.user.role);
  const permissions = perms === null ? fullPermissions() : perms;
  res.json({ user: req.user, permissions });
});

/** POST /api/auth/change-password */
r.post('/change-password', authenticate, async (req, res) => {
  try {
    const { old_password, new_password } = req.body || {};
    if (!old_password || !new_password || new_password.length < 6) {
      return res.status(400).json({ message: 'Password baru minimal 6 karakter' });
    }
    const rows = await q('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(old_password, rows[0].password_hash)) {
      return res.status(400).json({ message: 'Password lama salah' });
    }
    await exec('UPDATE users SET password_hash = ? WHERE id = ?', [
      bcrypt.hashSync(new_password, 10), req.user.id,
    ]);
    await logActivity({ req, action: 'auth.change_password', module: 'auth', description: 'Mengubah password sendiri' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
