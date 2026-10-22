import { q, exec } from '../db.js';
import { getSettings, num } from '../utils/helper.js';

/**
 * Service sinkronisasi RADIUS (FreeRADIUS + MySQL) — PRD 5.5.
 * Kredensial PPPoE pelanggan disinkron ke tabel radcheck/radreply
 * yang dibaca FreeRADIUS untuk autentikasi PPPoE.
 */

/** Upsert kredensial pelanggan ke radcheck */
export async function syncCustomer(customer) {
  if (!customer.pppoe_username) return;
  const pass = customer.pppoe_password || '';
  // Password PPPoE
  await exec(
    `INSERT INTO radcheck (username, attribute, op, value) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [customer.pppoe_username, 'Cleartext-Password', ':=', pass]
  );
  // Simultaneous use: 1 sesi
  await exec(
    `INSERT INTO radcheck (username, attribute, op, value) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [customer.pppoe_username, 'Simultaneous-Use', ':=', '1']
  );
}

/** Hapus user dari RADIUS */
export async function removeCustomer(username) {
  if (!username) return;
  await exec('DELETE FROM radcheck WHERE username = ?', [username]);
  await exec('DELETE FROM radreply WHERE username = ?', [username]);
}

/**
 * Nonaktifkan total akses pelanggan (auto disable penagihan):
 * auth RADIUS ditolak (Auth-Type := Reject) sehingga PPPoE tidak bisa konek.
 * Di-enable kembali via enableCustomer() saat pembayaran lunas.
 */
export async function disableCustomer(username) {
  if (!username) return;
  await exec(
    `INSERT INTO radcheck (username, attribute, op, value) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [username, 'Auth-Type', ':=', 'Reject']
  );
  await exec('DELETE FROM radreply WHERE username = ?', [username]);
}

/** Aktifkan kembali auth RADIUS setelah disable (hapus Auth-Type Reject) */
export async function enableCustomer(username) {
  if (!username) return;
  await exec("DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type'", [username]);
}

/**
 * Terapkan profile bandwidth pelanggan via radreply.
 * - isolir: Mikrotik-Group = isolir (profile isolir di Mikrotik/PPP)
 * - normal : Mikrotik-Rate-Limit sesuai paket
 */
export async function setProfile(username, profileName) {
  if (!username) return;
  if (profileName === 'isolir') {
    await exec(
      `INSERT INTO radreply (username, attribute, op, value) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [username, 'Mikrotik-Group', ':=', 'isolir']
    );
  } else {
    await exec('DELETE FROM radreply WHERE username = ? AND attribute = ?', [
      username,
      'Mikrotik-Group',
    ]);
    await exec(
      `INSERT INTO radreply (username, attribute, op, value) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [username, 'Mikrotik-Rate-Limit', ':=', profileName]
    );
  }
}

/** Grup isolir kustom per server (Auto Isolir — Profile Isolir selain "isolir") */
export async function setIsolateGroup(username, profileName) {
  if (!username) return;
  await exec(
    `INSERT INTO radreply (username, attribute, op, value) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [username, 'Mikrotik-Group', ':=', profileName || 'isolir']
  );
}

/** Terapkan profile sesuai status pelanggan + paketnya */
export async function applyCustomerProfile(customerId) {
  const rows = await q(
    `SELECT c.*, p.mikrotik_profile FROM customers c
     LEFT JOIN packages p ON p.id = c.package_id WHERE c.id = ?`,
    [customerId]
  );
  const c = rows[0];
  if (!c || !c.pppoe_username) return;
  if (c.status === 'isolated') {
    await setProfile(c.pppoe_username, 'isolir');
  } else {
    await enableCustomer(c.pppoe_username); // pastikan tidak ada reject tersisa dari auto disable
    await setProfile(c.pppoe_username, c.mikrotik_profile || 'default');
  }
}

/** Statistik pemakaian trafik per pelanggan dari radacct (audit) */
export async function radiusUsage(username, days = 30) {
  const rows = await q(
    `SELECT DATE(acctstarttime) AS d, SUM(acctinputoctets) AS upload, SUM(acctoutputoctets) AS download
     FROM radacct WHERE username = ? AND acctstarttime >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY DATE(acctstarttime) ORDER BY d`,
    [username, days]
  );
  return rows.map((r) => ({ date: r.d, upload: num(r.upload), download: num(r.download) }));
}
