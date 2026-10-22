import { q, exec } from '../db.js';
import { getSettings, logActivity, num } from '../utils/helper.js';
import { notifyAll } from '../utils/notify.js';
import * as mt from './mikrotik.js';
import * as radius from './radius.js';

/**
 * Service monitoring PPPoE realtime — PRD 5.3 & 5.5.
 * Data sesi ditarik dari Mikrotik RouterOS REST v7.
 * Tidak ada data trafik atau status sintetis.
 */

const state = {
  inited: false,
  series: [], // {t, online, rx, tx} ring buffer untuk grafik realtime
  routerDownNotifiedAt: 0,
  sessionCounters: new Map(), // username → counter sesi terakhir untuk hitung byte/detik nyata
};

/** Monitoring hanya menyimpan sesi yang dikembalikan MikroTik. */
export async function init() {
  // Hapus snapshot lama dan log demo; sesi berikutnya harus berasal dari MikroTik.
  await exec('DELETE FROM pppoe_sessions');
  await exec("DELETE FROM connection_logs WHERE ip LIKE '10.20.%'");
  state.inited = true;
}

let sessionSchemaReady;
/** Pastikan kolom pppoe_sessions ada: last_logout + total byte sesi (migrasi runtime — pola ensureRoutersSchema mikrotik.js) */
async function ensureSessionSchema() {
  if (!sessionSchemaReady) {
    sessionSchemaReady = (async () => {
      const cols = await q(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pppoe_sessions'
           AND COLUMN_NAME IN ('last_logout','rx_bytes','tx_bytes')`
      );
      const have = new Set(cols.map((x) => x.COLUMN_NAME));
      if (!have.has('last_logout')) await exec('ALTER TABLE pppoe_sessions ADD COLUMN last_logout DATETIME NULL AFTER uptime');
      if (!have.has('rx_bytes')) await exec("ALTER TABLE pppoe_sessions ADD COLUMN rx_bytes BIGINT NOT NULL DEFAULT 0 COMMENT 'Total download pelanggan (byte) dari MikroTik' AFTER rx_rate");
      if (!have.has('tx_bytes')) await exec("ALTER TABLE pppoe_sessions ADD COLUMN tx_bytes BIGINT NOT NULL DEFAULT 0 COMMENT 'Total upload pelanggan (byte) dari MikroTik' AFTER rx_bytes");
    })().catch((err) => { sessionSchemaReady = null; throw err; });
  }
  return sessionSchemaReady;
}

export async function getActiveRouter() {
  return mt.getActiveRouter();
}

async function integrationState() {
  const settings = await getSettings();
  const router = String(settings.mikrotik_enabled) === '1' ? await mt.getActiveRouter() : null;
  return {
    integrated: Boolean(router),
    reason: String(settings.mikrotik_enabled) !== '1'
      ? 'Integrasi MikroTik belum diaktifkan'
      : 'Belum ada router MikroTik aktif',
    router: router ? { id: router.id, name: router.name, status: router.status } : null,
  };
}

async function clearUnavailableData() {
  await exec('DELETE FROM pppoe_sessions');
  state.series = [];
}

export async function listInterfaces() {
  const router = await mt.getActiveRouter();
  if (!router) throw new Error('Tidak ada router aktif');
  return (await mt.listInterfaces(router)).filter((item) => mt.isPhysicalInterface(item.type));
}

export async function getInterfaceTraffic(name) {
  const router = await mt.getActiveRouter();
  if (!router) throw new Error('Tidak ada router aktif');
  const row = (await mt.listInterfaces(router))
    .filter((item) => mt.isPhysicalInterface(item.type))
    .find((item) => item.name === name);
  if (!row) throw new Error(`Interface "${name}" tidak ditemukan di MikroTik`);
  return { router_id: router.id, interface: row.name, rx_byte: row.rx_byte, tx_byte: row.tx_byte, at: new Date().toISOString() };
}

async function setSession(username, status, uptime, tx, rx, ip = undefined, mac = undefined, routerId = undefined) {
  const params = [status, uptime, tx, rx];
  let sql = 'UPDATE pppoe_sessions SET status = ?, uptime = ?, tx_rate = ?, rx_rate = ?, last_change = NOW()';
  if (ip !== undefined) {
    sql += ', ip = ?';
    params.push(ip);
  }
  if (mac !== undefined) {
    sql += ', mac = ?';
    params.push(mac);
  }
  if (routerId !== undefined) {
    sql += ', router_id = ?';
    params.push(routerId);
  }
  sql += ' WHERE username = ?';
  params.push(username);
  await exec(sql, params);
}

function uptimeSeconds(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '');
  const units = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  return [...text.matchAll(/(\d+)(w|d|h|m|s)/g)]
    .reduce((total, [, amount, unit]) => total + Number(amount) * units[unit], 0);
}

async function logConn(customerId, username, event, ip = null) {
  await exec(
    'INSERT INTO connection_logs (customer_id, username, event, ip) VALUES (?,?,?,?)',
    [customerId, username, event, ip]
  );
}

/** Tarik kondisi nyata dari Mikrotik (mode real) */
async function realTick() {
  const router = await mt.getActiveRouter();
  if (!router) throw new Error('Tidak ada router aktif');
  await ensureSessionSchema(); // pastikan kolom last_logout/rx_bytes/tx_bytes siap (cached)
  const [active, secrets, sessionBytes] = await Promise.all([
    mt.listPppActive(router),
    mt.listPppSecrets(router),
    mt.listPppoeSessionBytes(router),
  ]);
  await exec('UPDATE routers SET status = "online", last_seen = NOW() WHERE id = ?', [router.id]);
  const previous = await q('SELECT username, customer_id, status FROM pppoe_sessions');
  const previousMap = new Map(previous.map((s) => [s.username, s]));
  const customers = await q('SELECT id, pppoe_username, status FROM customers WHERE pppoe_username IS NOT NULL');
  const customerMap = new Map(customers
    .map((c) => [mt.normalizePppoeUsername(c.pppoe_username), c])
    .filter(([username]) => username));
  const pppoeActive = active.filter((x) => mt.normalizePppoeUsername(x.username));
  const activeMap = new Map(pppoeActive.map((x) => [mt.normalizePppoeUsername(x.username), x]));
  const pppoeSecrets = secrets.filter((x) => mt.normalizePppoeUsername(x.username) && (!x.service || x.service === 'pppoe' || x.service === 'any'));
  const secretMap = new Map(pppoeSecrets.map((x) => [mt.normalizePppoeUsername(x.username), x]));
  const usernames = new Set([...pppoeSecrets.map((x) => mt.normalizePppoeUsername(x.username)), ...activeMap.keys()]);
  const now = Date.now();
  const nextCounters = new Map();

  for (const username of usernames) {
    const live = activeMap.get(username);
    const customer = customerMap.get(username);
    const old = previousMap.get(username);
    const status = live ? 'online' : customer?.status === 'isolated' ? 'isolir' : 'offline';
    const ip = live?.ip || null;
    const mac = live?.mac || null;
    const uptime = live ? uptimeSeconds(live.uptime) : 0;
    // Total data sesi diambil langsung dari counter interface dinamis MikroTik "<pppoe-username>"
    // (rx_bytes = download pelanggan, tx_bytes = upload pelanggan; 0 saat sesi tidak aktif)
    const bytes = live ? sessionBytes.get(username) : null;
    const rxBytes = bytes ? num(bytes.download_byte) : 0;
    const txBytes = bytes ? num(bytes.upload_byte) : 0;
    const previousCounter = state.sessionCounters.get(username);
    const elapsedSeconds = previousCounter ? Math.max((now - previousCounter.at) / 1000, 1) : 0;
    // Counter lebih kecil berarti sesi/interface MikroTik baru; rate mulai dari 0, bukan lonjakan palsu.
    const rxRate = previousCounter && rxBytes >= previousCounter.rx ? Math.round((rxBytes - previousCounter.rx) * 8 / elapsedSeconds) : 0;
    const txRate = previousCounter && txBytes >= previousCounter.tx ? Math.round((txBytes - previousCounter.tx) * 8 / elapsedSeconds) : 0;
    if (live && bytes) nextCounters.set(username, { rx: rxBytes, tx: txBytes, at: now });
    // Last logout diambil langsung dari MikroTik (ppp secret "last-logged-out")
    const lastLogout = secretMap.get(username)?.last_logged_out || null;
    await exec(
      `INSERT INTO pppoe_sessions
         (customer_id, router_id, username, status, ip, mac, uptime, tx_rate, rx_rate, rx_bytes, tx_bytes, last_logout)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         customer_id = VALUES(customer_id), router_id = VALUES(router_id),
         status = VALUES(status), ip = VALUES(ip), mac = VALUES(mac),
         uptime = VALUES(uptime), tx_rate = VALUES(tx_rate), rx_rate = VALUES(rx_rate),
         rx_bytes = VALUES(rx_bytes), tx_bytes = VALUES(tx_bytes),
         last_logout = VALUES(last_logout),
         last_change = IF(status <> VALUES(status), NOW(), last_change)`,
      [customer?.id || old?.customer_id || null, router.id, username, status, ip, mac, uptime, txRate, rxRate, rxBytes, txBytes, lastLogout]
    );
    if (status === 'online' && (!old || old.status !== 'online')) {
      await logConn(customer?.id || old?.customer_id || null, username, 'up', ip);
    } else if (status !== 'online' && old?.status === 'online') {
      await logConn(customer?.id || old?.customer_id || null, username, 'down', null);
    }
  }

  state.sessionCounters = nextCounters;
  const trackedUsers = [...usernames];
  if (trackedUsers.length) await exec('DELETE FROM pppoe_sessions WHERE username NOT IN (?)', [trackedUsers]);
  else await exec('DELETE FROM pppoe_sessions');
  state.series.push({
    t: Math.floor(Date.now() / 1000),
    online: activeMap.size,
    rx: 0,
    tx: 0,
  });
  if (state.series.length > 120) state.series.shift();
}

/** Jalankan satu tick monitoring (interval 5 detik) */
export async function tick() {
  try {
    if (!state.inited) await init();
    // Migrasi kolom last_logout & counter byte sesi — kegagalan hanya dicatat, tidak dianggap router down
    try { await ensureSessionSchema(); } catch (err) { console.error('[monitoring] migrasi kolom pppoe_sessions gagal:', err.message); }
    const s = await getSettings();
    if (String(s.mikrotik_enabled) !== '1') {
      await clearUnavailableData();
      return { integrated: false, reason: 'Integrasi MikroTik belum diaktifkan' };
    }
    if (!(await mt.getActiveRouter())) {
      await clearUnavailableData();
      return { integrated: false, reason: 'Belum ada router MikroTik aktif' };
    }
    try {
      await realTick();
      return { integrated: true };
    } catch (err) {
      if (Date.now() - state.routerDownNotifiedAt > 10 * 60 * 1000) {
        state.routerDownNotifiedAt = Date.now();
        await exec('UPDATE routers SET status = "offline" WHERE is_active = 1');
        await notifyAll({
          title: 'Router tidak terjangkau',
          message: `Koneksi ke Mikrotik gagal (${err.message}). Tidak ada data pengganti.`,
          type: 'danger',
        });
      }
      throw err;
    }
  } catch (err) {
    console.error('[monitoring] tick error:', err.message);
  }
}

/** Tarik ulang sesi PPPoE sekarang, dipanggil tombol Sinkronkan. */
export async function sync() {
  const status = await integrationState();
  if (!status.integrated) {
    await clearUnavailableData();
    return status;
  }
  await realTick();
  return { ...status, synced_at: new Date().toISOString() };
}

/** Ringkasan statistik dashboard monitoring */
export async function getSummary() {
  const integration = await integrationState();
  if (!integration.integrated) {
    await clearUnavailableData();
    return { ...integration, total: 0, online: 0, offline: 0, isolir: 0, download_bps: 0, upload_bps: 0 };
  }
  const rows = await q(
    `SELECT COUNT(*) total,
            SUM(status = 'online') online,
            SUM(status = 'offline') offline,
            SUM(status = 'isolir') isolir,
            SUM(rx_rate) rx, SUM(tx_rate) tx
     FROM pppoe_sessions`
  );
  const r = rows[0] || {};
  return {
    ...integration,
    total: num(r.total),
    online: num(r.online),
    offline: num(r.offline),
    isolir: num(r.isolir),
    download_bps: num(r.rx),
    upload_bps: num(r.tx),
  };
}

/** Kolom sort whitelist untuk daftar sesi (pola orderClause customers.js) */
const SESSION_SORT_COLS = {
  name: 'c.name',
  username: 'ps.username',
  ip: 'ps.ip',
  mac: 'ps.mac',
  router: 'r.name',
  uptime: 'ps.uptime',
  download: 'ps.rx_bytes',
  upload: 'ps.tx_bytes',
  status: 'ps.status',
};

/** Daftar sesi dengan filter (status, pencarian, router), sort whitelist & pagination */
export async function getSessions({ status, q: search, router: routerId, sort, dir, page = 1, limit = 25 }) {
  const integration = await integrationState();
  const lim = Math.min(100, Math.max(1, Number(limit) || 25));
  const pg = Math.max(1, Number(page) || 1);
  if (!integration.integrated) {
    await clearUnavailableData();
    return { ...integration, rows: [], total: 0, page: pg, limit: lim, total_pages: 1 };
  }
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    where.push('ps.status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(ps.username LIKE ? OR c.name LIKE ? OR ps.ip LIKE ? OR ps.mac LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (routerId) {
    where.push('ps.router_id = ?');
    params.push(Number(routerId) || 0);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRows = await q(
    `SELECT COUNT(*) n FROM pppoe_sessions ps
     LEFT JOIN customers c ON c.id = ps.customer_id
     LEFT JOIN routers r ON r.id = ps.router_id ${w}`,
    params
  );
  const total = num(totalRows[0]?.n);
  const offset = (pg - 1) * lim;
  // Sort eksplisit dari whitelist; tanpa sort → default online dulu lalu nama pelanggan.
  // Kunci sekunder ps.id agar urutan stabil antar halaman.
  const col = SESSION_SORT_COLS[sort];
  const d = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const order = col
    ? `ORDER BY ${col} ${d}, ps.id ASC`
    : `ORDER BY ps.status = 'online' DESC, c.name ASC, ps.id ASC`;
  const rows = await q(
    `SELECT ps.*, c.name AS customer_name, c.code AS customer_code, c.phone, c.status AS customer_status,
            p.name AS package_name, r.name AS router_name
     FROM pppoe_sessions ps
     LEFT JOIN customers c ON c.id = ps.customer_id
     LEFT JOIN packages p ON p.id = c.package_id
     LEFT JOIN routers r ON r.id = ps.router_id
     ${w} ${order} LIMIT ${lim} OFFSET ${offset}`,
    params
  );
  return { ...integration, rows, total, page: pg, limit: lim, total_pages: Math.max(1, Math.ceil(total / lim)) };
}

/** Snapshot untuk broadcast socket */
export async function getSnapshot() {
  const summary = await getSummary();
  const { rows } = await getSessions({ status: 'online', page: 1, limit: 30 });
  return {
    summary,
    series: state.series.slice(-60),
    topSessions: rows
      .sort((a, b) => num(b.rx_rate) - num(a.rx_rate))
      .slice(0, 8)
      .map((s) => ({ username: s.username, name: s.customer_name, rx: num(s.rx_rate), tx: num(s.tx_rate) })),
    at: new Date().toISOString(),
  };
}

/** Aksi cepat: disconnect / isolir / activate / disable / enable — PRD 5.3, 5.5, 9.1 */
export async function doAction(username, action, actor = null) {
  // Cari pelanggan langsung berdasarkan username PPPoE — tidak bergantung baris pppoe_sessions,
  // sehingga isolir/disable otomatis penagihan tetap berjalan walau pelanggan sedang tidak tersambung.
  const rows = await q(
    `SELECT c.id AS cid, c.name, c.status AS customer_status, c.no_auto_isolate, p.mikrotik_profile, p.router_id
     FROM customers c
     LEFT JOIN packages p ON p.id = c.package_id
     WHERE c.pppoe_username = ?`,
    [username]
  );
  const s = rows[0];
  if (!s) throw new Error('Pelanggan PPPoE tidak ditemukan');
  // "Jangan Pernah Eksekusi ISOLIR khusus untuk pelanggan ini" — blokir aksi isolir apa pun (manual maupun otomatis)
  if (action === 'isolir' && Number(s.no_auto_isolate) === 1) {
    throw new Error(`${s.name} dikecualikan dari ISOLIR — matikan opsi "Jangan Pernah Eksekusi ISOLIR" pada form pelanggan bila ingin mengisolir`);
  }

  const st = await getSettings();
  if (String(st.mikrotik_enabled) !== '1') throw new Error('Integrasi Mikrotik belum diaktifkan');
  // Router pelanggan mengikuti router pada paketnya (paket → router); fallback router aktif pertama.
  const router = (await mt.getRouterById(s.router_id)) || (await mt.getActiveRouter());
  if (!router) throw new Error('Tidak ada router aktif');

  // "Action Isolir" per server (Auto Isolir — halaman Server Mikrotik):
  // 'profile' → Ubah Profile secret PPPoE ke Profile Isolir terpilih;
  // 'disable' → Disable Secrets (secret nonaktif, tidak bisa konek, sesi aktif diputus).
  const isolateByDisable = String(router.isolate_action) === 'disable';
  const isolateProfile = router.isolate_profile || 'isolir';

  if (action === 'disconnect') await mt.disconnectActive(router, username);
  if (action === 'isolir') {
    if (isolateByDisable) await mt.setSecretDisabled(router, username, true); // Disable Secrets (+ putus sesi aktif)
    else await mt.setSecretProfile(router, username, isolateProfile);          // Ubah Profile
  }
  if (action === 'activate' || action === 'enable') {
    await mt.setSecretDisabled(router, username, false); // pastikan secret aktif kembali bila sebelumnya di-disable
    await mt.setSecretProfile(router, username, s.mikrotik_profile || 'default');
  }
  if (action === 'disable') await mt.setSecretDisabled(router, username, true);

  if (action === 'disconnect') {
    await setSession(username, 'offline', 0, 0, 0);
    await logConn(s.cid, username, 'down', null);
  } else if (action === 'isolir') {
    await exec('UPDATE customers SET status = "isolated" WHERE id = ?', [s.cid]);
    if (isolateByDisable) {
      await radius.disableCustomer(username); // secret dimatikan → auth RADIUS juga ditolak selama isolir
    } else if (isolateProfile === 'isolir') {
      await radius.setProfile(username, 'isolir');
    } else {
      await radius.setIsolateGroup(username, isolateProfile); // Mikrotik-Group := Profile Isolir server
    }
    await setSession(username, 'isolir', 0, 0, 0);
    await logConn(s.cid, username, 'isolir', null);
    await notifyAll({
      title: 'Pelanggan diisolir',
      message: `${s.name} (${username}) diisolir${actor ? ` oleh ${actor.name || actor}` : ' otomatis'}.`,
      type: 'warning',
    });
  } else if (action === 'activate' || action === 'enable') {
    await exec('UPDATE customers SET status = "active" WHERE id = ?', [s.cid]);
    await radius.enableCustomer(username); // hapus Auth-Type Reject bila sebelumnya di-disable
    await radius.setProfile(username, s.mikrotik_profile || 'default');
    await setSession(username, 'online', 0, 0, 0);
    await logConn(s.cid, username, 'activate', null);
    await notifyAll({
      title: 'Pelanggan diaktifkan',
      message: `${s.name} (${username}) aktif kembali${actor ? ` oleh ${actor.name || actor}` : ' setelah pembayaran'}.`,
      type: 'success',
    });
  } else if (action === 'disable') {
    await exec('UPDATE customers SET status = "disabled" WHERE id = ?', [s.cid]);
    await radius.disableCustomer(username);
    await setSession(username, 'offline', 0, 0, 0);
    await logConn(s.cid, username, 'disable', null);
    await notifyAll({
      title: 'Pelanggan dinonaktifkan',
      message: `${s.name} (${username}) di-disable otomatis — menunggak melewati batas waktu.`,
      type: 'warning',
    });
  } else {
    throw new Error('Aksi tidak dikenal: ' + action);
  }
  await logActivity({
    action: `monitoring.${action}`,
    module: 'monitoring',
    description: `${action} PPPoE ${username} (sinkron Mikrotik)`,
    userId: actor?.id ?? null,
    userName: actor?.name ?? 'Sistem',
    role: actor?.role ?? 'sistem',
  });
  return { ok: true, mikrotikOk: true };
}

export default { init, tick, sync, getSummary, getSessions, getSnapshot, doAction };

