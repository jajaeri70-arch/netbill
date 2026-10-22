import { q, exec } from '../db.js';

/**
 * Catat aktivitas user (audit trail) — PRD 5.10 Log Aktivitas
 * @param {object} opts { req, action, module, description, userId?, userName?, role? }
 */
export async function logActivity(opts) {
  const { req, action, module, description, userId, userName, role } = opts;
  try {
    const uid = userId ?? req?.user?.id ?? null;
    const uname = userName ?? req?.user?.name ?? 'Sistem';
    const r = role ?? req?.user?.role ?? 'sistem';
    const ip = req?.ip || req?.socket?.remoteAddress || null;
    await exec(
      `INSERT INTO activity_logs (user_id, user_name, role, action, module, description, ip)
       VALUES (?,?,?,?,?,?,?)`,
      [uid, uname, r, action, module, description || '', ip]
    );
  } catch (err) {
    console.error('[activity] gagal mencatat log:', err.message);
  }
}

/** Ambil setting global (cache 30 detik) */
let settingCache = { data: null, at: 0 };
export async function getSettings(force = false) {
  if (!force && settingCache.data && Date.now() - settingCache.at < 30000) {
    return settingCache.data;
  }
  const rows = await q('SELECT skey, svalue FROM settings');
  const map = {};
  rows.forEach((r) => (map[r.skey] = r.svalue));
  settingCache = { data: map, at: Date.now() };
  return map;
}

/** Simpan setting (upsert banyak) */
export async function saveSettings(obj) {
  for (const [k, v] of Object.entries(obj)) {
    await exec(
      `INSERT INTO settings (skey, svalue) VALUES (?,?)
       ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
      [k, v === undefined || v === null ? '' : String(v)]
    );
  }
  await getSettings(true);
}

/** Format angka desimal dari DB ke number JS */
export const num = (v) => (v === null || v === undefined ? 0 : Number(v));

/** Konvensi waktu aplikasi: string waktu di DB & API memakai WIB (UTC+7) — sesuai
 *  zona browser pengguna, sebab mysql2 `dateStrings` meneruskan string DATETIME
 *  tanpa transformasi zona. Dihitung eksplisit dari UTC sehingga selalu benar
 *  apa pun timezone proses/server (server ini berjalan UTC). */
function toWib(d) {
  return new Date(d.getTime() + 7 * 3600 * 1000);
}
const pad2 = (n) => String(n).padStart(2, '0');

/** Periode berjalan 'YYYY-MM' (menurut WIB) */
export function curPeriod(d = new Date()) {
  const w = toWib(d);
  return `${w.getUTCFullYear()}-${pad2(w.getUTCMonth() + 1)}`;
}

/** Pelanggan baru pascabayar bulan ini yang belum pernah ditagih. */
export const currentMonthNewCustomerWithoutInvoiceWhere = `c.status <> 'inactive'
  AND c.billing_type = 'pascabayar'
  AND DATE_FORMAT(c.created_at, '%Y-%m') = ?
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id)`;

/** Waktu WIB 'YYYY-MM-DD HH:MM:SS' — JANGAN pakai toISOString() (selalu UTC) */
export function nowLocal(d = new Date()) {
  const w = toWib(d);
  return `${w.getUTCFullYear()}-${pad2(w.getUTCMonth() + 1)}-${pad2(w.getUTCDate())} ` +
    `${pad2(w.getUTCHours())}:${pad2(w.getUTCMinutes())}:${pad2(w.getUTCSeconds())}`;
}

/** Tanggal WIB 'YYYY-MM-DD' (untuk nama file & default form) */
export function todayLocal(d = new Date()) {
  const w = toWib(d);
  return `${w.getUTCFullYear()}-${pad2(w.getUTCMonth() + 1)}-${pad2(w.getUTCDate())}`;
}

