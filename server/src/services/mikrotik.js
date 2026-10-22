import { q, exec } from '../db.js';
import { decrypt } from '../utils/crypto.js';
import { request, basicAuth } from './httpclient.js';

/**
 * Service Mikrotik via RouterOS v7 REST API (PRD 5.5).
 * Semua fungsi melempar Error jika router tidak dapat dihubungi.
 */

// RouterOS REST tersedia di service www (http, umumnya 80) atau
// www-ssl (https, umumnya 443). Beberapa instalasi memakai http di
// port kustom — sehingga skema per router + fallback otomatis.
const schemeCache = new Map(); // "id|host:port" -> skema yang berhasil

function normalizeHost(input) {
  const raw = String(input || '').trim();
  if (!raw) return { host: '', scheme: null, port: null };
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return {
      host: u.hostname,
      scheme: u.protocol === 'https:' ? 'https' : 'http',
      port: u.port ? Number(u.port) : null,
    };
  } catch {
    return { host: raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''), scheme: null, port: null };
  }
}

function initialScheme(router) {
  const parsed = normalizeHost(router.host);
  if (router.scheme === 'http' || router.scheme === 'https') return router.scheme;
  if (parsed.scheme) return parsed.scheme;
  return Number(router.port || parsed.port) === 80 ? 'http' : 'https';
}

function looksLikeProtocolMismatch(err) {
  const msg = String((err && err.message) || err);
  return /EPROTO|wrong version number|SSL routines|certificate|socket hang up|ECONNRESET/i.test(msg);
}

function headers(router) {
  const pass = decrypt(router.api_pass) || '';
  return { Authorization: basicAuth(router.api_user, pass) };
}

function buildUrl(router, path) {
  const parsed = normalizeHost(router.host);
  const host = parsed.host;
  const port = Number(router.port || parsed.port) || (initialScheme(router) === 'http' ? 80 : 443);
  const cleanPath = String(path || '').startsWith('/') ? path : `/${path || ''}`;
  return { host, port, url: `${initialScheme(router)}://${host}:${port}/rest${cleanPath}` };
}

async function call(router, path, method = 'GET', body = null) {
  const base = buildUrl(router, path);
  const key = `${router.id || ''}|${base.host}:${base.port}`;
  const scheme = schemeCache.get(key) || initialScheme(router);
  const doCall = (sch) => request({
    url: `${sch}://${base.host}:${base.port}/rest${String(path || '').startsWith('/') ? path : `/${path || ''}`}`,
    method,
    body,
    headers: headers(router),
    timeout: 6000,
    insecure: true,
  });
  try {
    const res = await doCall(scheme);
    schemeCache.set(key, scheme);
    return res;
  } catch (err) {
    // "wrong version number" / EPROTO = bicara TLS ke port non-TLS (atau sebaliknya)
    if (looksLikeProtocolMismatch(err)) {
      const alt = scheme === 'https' ? 'http' : 'https';
      try {
        const res2 = await doCall(alt);
        schemeCache.set(key, alt);
        return res2;
      } catch (err2) {
        throw new Error(`${err.message} | fallback ${alt.toUpperCase()} juga gagal: ${err2.message}`);
      }
    }
    throw err;
  }
}

export async function testConnection(router) {
  const res = await call(router, '/system/resource');
  return { ok: true, resource: res };
}

export async function systemResource(router) {
  const r = await call(router, '/system/resource');
  return {
    cpu_load: numOr(r['cpu-load']),
    free_memory: numOr(r['free-memory']),
    total_memory: numOr(r['total-memory']),
    uptime: r.uptime || '',
    version: r.version || '',
    board_name: r['board-name'] || '',
    cpu_count: numOr(r['cpu-count']),
  };
}

export async function listPppActive(router) {
  const rows = await call(router, '/ppp/active');
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    username: r.name,
    ip: r.address || null,
    mac: r['caller-id'] || null,
    uptime: r.uptime || '',
    service: r.service || 'pppoe',
    // RouterOS dapat mengirim field ini pada /ppp/active; simpan semua variasi.
    download_bytes: numOr(r['bytes-out'] ?? r['tx-byte'] ?? r['tx-bytes']),
    upload_bytes: numOr(r['bytes-in'] ?? r['rx-byte'] ?? r['rx-bytes']),
    download_bps: numOr(r['tx-bits-per-second'] ?? r['tx-rate'] ?? r['download-bps']),
    upload_bps: numOr(r['rx-bits-per-second'] ?? r['rx-rate'] ?? r['upload-bps']),
    _id: r['.id'],
  }));
}

export async function listPppSecrets(router) {
  const [rows, profiles, activeRows] = await Promise.all([
    call(router, '/ppp/secret'),
    call(router, '/ppp/profile'),
    call(router, '/ppp/active'),
  ]);
  const profileMap = new Map((Array.isArray(profiles) ? profiles : []).map((profile) => [profile.name, profile]));
  const activeMap = new Map((Array.isArray(activeRows) ? activeRows : []).map((active) => [active.name, active]));
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    ...(() => {
      const profile = profileMap.get(r.profile) || {};
      const active = activeMap.get(r.name) || {};
      return {
        local_address: r['local-address'] || profile['local-address'] || '',
        remote_address: active.address || r['remote-address'] || profile['remote-address'] || '',
      };
    })(),
    username: r.name,
    password: r.password || '',
    profile: r.profile,
    service: r.service,
    // Waktu logout terakhir menurut router (RouterOS v7.8+ — properti "last-logged-out")
    last_logged_out: r['last-logged-out'] || null,
    disabled: r.disabled === 'true',
    _id: r['.id'],
  }));
}

export async function listIpPools(router) {
  const rows = await call(router, '/ip/pool');
  return (Array.isArray(rows) ? rows : []).map((r) => ({ name: r.name, ranges: r.ranges || '', _id: r['.id'] }));
}

export async function createPppSecret(router, { username, password, service, profile, localAddress, remoteAddress, usePool = true }) {
  const body = { name: username, password, service: service || 'pppoe' };
  if (profile) body.profile = profile;
  if (localAddress) body['local-address'] = localAddress;
  if (usePool && (remoteAddress === 'IP Pools' || remoteAddress)) {
    const pools = await listIpPools(router);
    const pool = remoteAddress === 'IP Pools'
      ? pools[0]
      : pools.find((item) => item.name === remoteAddress);
    if (!pool) throw new Error(remoteAddress === 'IP Pools'
      ? 'Tidak ada IP pool di MikroTik'
      : `IP pool "${remoteAddress}" tidak ditemukan di MikroTik`);
    body['remote-address'] = pool.name;
  }
  // RouterOS REST: PUT membuat item. POST hanya menjalankan command.
  return call(router, '/ppp/secret', 'PUT', body);
}

export async function setSecretProfile(router, username, profile) {
  const secrets = await listPppSecrets(router);
  const sec = secrets.find((s) => s.username === username);
  if (!sec) throw new Error(`Secret PPPoE "${username}" tidak ditemukan di router`);
  return call(router, `/ppp/secret/${encodeURIComponent(sec._id)}`, 'PATCH', { profile });
}

/**
 * Enable/disable secret PPPoE di RouterOS (auto disable penagihan — PRD 5.5).
 * Saat disable, sesi aktif pelanggan ikut diputus.
 */
export async function setSecretDisabled(router, username, disabled) {
  const secrets = await listPppSecrets(router);
  const sec = secrets.find((s) => s.username === username);
  if (!sec) throw new Error(`Secret PPPoE "${username}" tidak ditemukan di router`);
  await call(router, `/ppp/secret/${encodeURIComponent(sec._id)}`, 'PATCH', { disabled: disabled ? 'true' : 'false' });
  if (disabled) await disconnectActive(router, username).catch(() => {});
  return { ok: true };
}

export async function disconnectActive(router, username) {
  const rows = await call(router, `/ppp/active?.query=${encodeURIComponent(`name=${username}`)}`);
  const arr = Array.isArray(rows) ? rows : [];
  for (const r of arr) {
    await call(router, `/ppp/active/${encodeURIComponent(r['.id'])}`, 'DELETE');
  }
  return { removed: arr.length };
}

export async function interfaceTraffic(router) {
  const rows = await call(router, '/interface');
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r.type === 'ether' || r.type === 'pppoe-out' || r.type === 'sfp')
    .map((r) => ({ name: r.name, 'rx-byte': numOr(r['rx-byte']), 'tx-byte': numOr(r['tx-byte']) }));
}

/** Identity perangkat (/system/identity) */
export async function getIdentity(router) {
  const r = await call(router, '/system/identity');
  const row = Array.isArray(r) ? r[0] : r;
  return row?.name || '';
}

/** Daftar PPP profile (rate-limit per paket) */
export async function listPppProfiles(router) {
  const rows = await call(router, '/ppp/profile');
  return (Array.isArray(rows) ? rows : []).map((x) => ({
    name: x.name,
    rate_limit: x['rate-limit'] || null,
    local_address: x['local-address'] || null,
    remote_address: x['remote-address'] || null,
    comment: x.comment || null,
    _id: x['.id'],
  }));
}

/** Buat PPP profile (dipakai provision paket & isolir) */
export async function createPppProfile(router, { name, rateLimit, comment }) {
  const body = { name, comment: comment || 'NetBill' };
  if (rateLimit) body['rate-limit'] = rateLimit;
  return call(router, '/ppp/profile', 'PUT', body);
}

/** Daftar interface RouterOS. */
const PHYSICAL_INTERFACE_TYPES = new Set(['ether', 'sfp', 'sfp-sfpplus', 'wlan', 'wifi', 'wifiwave2', 'lte']);

export function isPhysicalInterface(type) {
  return PHYSICAL_INTERFACE_TYPES.has(String(type || '').toLowerCase());
}

function boolish(v) {
  return v === true || v === 'true';
}

export async function listInterfaces(router) {
  const rows = await call(router, '/interface');
  return (Array.isArray(rows) ? rows : [])
    .map((x) => ({
      name: x.name || '',
      type: x.type || '-',
      kind: x.type || '-',
      running: boolish(x.running),
      disabled: boolish(x.disabled),
      default_name: x['default-name'] || null,
      comment: x.comment || null,
      mac_address: x['mac-address'] || null,
      mtu: numOr(x.mtu),
      rx_byte: numOr(x['rx-byte']),
      tx_byte: numOr(x['tx-byte']),
      _id: x['.id'],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }));
}

function numOr(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Total byte per sesi PPPoE aktif — dari counter interface dinamis "<pppoe-username>"
 * yang RouterOS buat untuk tiap sesi aktif (terlihat di /interface).
 * Arah counter pada sisi server (terverifikasi empiris terhadap uplink):
 *   tx-byte = data KE pelanggan  → download pelanggan
 *   rx-byte = data DARI pelanggan → upload pelanggan
 * Return: Map<username, { download_byte, upload_byte }>
 */
export function normalizePppoeUsername(username) {
  const value = String(username || '').trim();
  return value || null;
}

export function pppoeUsernameFromInterface(name) {
  const match = /^(?:<pppoe-(.+)>|pppoe-(.+))$/.exec(String(name || '').trim());
  return match ? normalizePppoeUsername(match[1] || match[2]) : null;
}

export async function listPppoeSessionBytes(router) {
  const rows = await call(router, '/interface');
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const username = pppoeUsernameFromInterface(row.name);
    if (!username) continue;
    map.set(username, {
      download_byte: numOr(row['tx-byte']),
      upload_byte: numOr(row['rx-byte']),
    });
  }
  return map;
}

let routersSchemaReady;
/** Pastikan kolom Auto Isolir per server ada (migrasi runtime — pola ensureBillingSchema) */
export async function ensureRoutersSchema() {
  if (!routersSchemaReady) {
    routersSchemaReady = (async () => {
      const cols = await q(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'routers'
           AND COLUMN_NAME IN ('auto_isolate','isolate_action','isolate_profile')`
      );
      const have = new Set(cols.map((x) => x.COLUMN_NAME));
      if (!have.has('auto_isolate')) await exec('ALTER TABLE routers ADD COLUMN auto_isolate TINYINT(1) NOT NULL DEFAULT 1 AFTER location');
      if (!have.has('isolate_action')) await exec("ALTER TABLE routers ADD COLUMN isolate_action VARCHAR(20) NOT NULL DEFAULT 'profile' AFTER auto_isolate");
      if (!have.has('isolate_profile')) await exec("ALTER TABLE routers ADD COLUMN isolate_profile VARCHAR(100) NOT NULL DEFAULT 'isolir' AFTER isolate_action");
    })().catch((err) => { routersSchemaReady = null; throw err; });
  }
  return routersSchemaReady;
}

/** Router aktif pertama (dengan kredensial terdekripsi) */
export async function getActiveRouter() {
  await ensureRoutersSchema();
  const rows = await q(
    'SELECT * FROM routers WHERE is_active = 1 ORDER BY id LIMIT 1'
  );
  return rows[0] || null;
}

/** Router berdasarkan id — aksi pelanggan mengikuti router pada paketnya (Auto Isolir per server) */
export async function getRouterById(id) {
  if (!id) return null;
  await ensureRoutersSchema();
  const rows = await q('SELECT * FROM routers WHERE id = ?', [id]);
  return rows[0] || null;
}
