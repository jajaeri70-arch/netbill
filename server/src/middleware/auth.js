import jwt from 'jsonwebtoken';
import { q } from '../db.js';
import config from '../config.js';

/** Daftar menu aplikasi (dipakai RBAC & frontend) */
export const MENUS = [
  'dashboard', 'customers', 'packages', 'invoices', 'payments', 'monitoring',
  'devices', 'tickets', 'finance', 'transactions', 'categories', 'banks', 'users',
  'routers', 'activity', 'settings', 'mapping',
];

/** Middleware autentikasi JWT */
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Tidak terautentikasi' });
    const payload = jwt.verify(token, config.jwt.secret);
    const users = await q(
      'SELECT id, name, username, email, role, is_active FROM users WHERE id = ?',
      [payload.id]
    );
    const user = users[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Akun tidak aktif atau tidak ditemukan' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Sesi tidak valid, silakan login ulang' });
  }
}

// ---- RBAC granular per menu/aksi (PRD 5.1) ----
const MENU_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];
let permCache = { data: null, at: 0 };

async function loadPermissions() {
  if (permCache.data && Date.now() - permCache.at < 30000) return permCache.data;
  const rows = await q('SELECT * FROM role_permissions');
  const map = {};
  rows.forEach((r) => {
    if (!map[r.role]) map[r.role] = {};
    map[r.role][r.menu] = {
      view: !!r.can_view,
      create: !!r.can_create,
      edit: !!r.can_edit,
      delete: !!r.can_delete,
      export: !!r.can_export,
    };
  });
  permCache = { data: map, at: Date.now() };
  return map;
}

export async function getRolePermissions(role) {
  const perms = await loadPermissions();
  // Owner memiliki akses penuh ke seluruh menu
  if (role === 'owner') {
    return null; // null = full access
  }
  return perms[role] || {};
}

export async function hasPermission(role, menu, action = 'view') {
  if (role === 'owner') return true;
  const perms = await loadPermissions();
  const m = perms[role]?.[menu];
  return !!(m && m[action]);
}

export const FINANCE_ROLES = new Set(['owner', 'finance']);
export const isFinanceRole = (role) => FINANCE_ROLES.has(role);
export const canViewBusinessSummary = isFinanceRole;

/** Guard mutlak untuk seluruh data dan aksi finansial. */
export const canFinance = (req, res, next) => {
  if (isFinanceRole(req.user?.role)) return next();
  return res.status(403).json({ message: 'Akses finance, pembayaran, dan pengeluaran hanya untuk finance dan owner' });
};

/** Middleware cek izin menu+aksi */
export const can = (menu, action = 'view') => async (req, res, next) => {
  if (await hasPermission(req.user.role, menu, action)) return next();
  return res.status(403).json({ message: `Akses ditolak: Anda tidak punya izin "${action}" pada menu ${menu}` });
};

export { MENU_ACTIONS };
