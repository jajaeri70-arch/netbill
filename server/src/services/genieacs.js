import crypto from 'crypto';
import { getSettings, nowLocal } from '../utils/helper.js';
import { decrypt } from '../utils/crypto.js';
import { request } from './httpclient.js';

/**
 * Service integrasi GenieACS (TR-069 ACS) — PRD 5.6.
 * Semua operasi memakai GenieACS yang dikonfigurasi di menu Pengaturan.
 */

async function genieBase() {
  const s = await getSettings();
  if (String(s.genieacs_enabled) !== '1') throw new Error('Integrasi GenieACS belum diaktifkan');
  const rawHost = String(s.genieacs_host || '').trim();
  const port = Number(s.genieacs_port || 7557);
  if (!rawHost) throw new Error('IP server GenieACS belum diisi di Pengaturan');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port GenieACS harus berupa angka 1-65535');
  const inputUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(rawHost) ? rawHost : `http://${rawHost}`;
  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error('IP/URL GenieACS tidak valid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('IP/URL GenieACS harus memakai HTTP atau HTTPS');
  if (!parsed.hostname || parsed.username || parsed.password) throw new Error('IP/URL GenieACS tidak valid');
  const base = `${parsed.protocol}//${parsed.hostname}:${port}`;
  return { base, auth: s.genieacs_user ? { user: s.genieacs_user, pass: decrypt(s.genieacs_pass) || s.genieacs_pass || '' } : null };
}

function headers(auth) {
  const h = { Accept: 'application/json' };
  if (auth) h.Authorization = 'Basic ' + Buffer.from(`${auth.user}:${auth.pass}`).toString('base64');
  return h;
}

function mysqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  // Konversi ke string WIB (konvensi waktu aplikasi — lihat nowLocal di utils/helper.js);
  // GenieACS mengirim _lastInform sebagai ISO UTC → hasil tetap momen yang sama
  return Number.isNaN(date.getTime()) ? null : nowLocal(date);
}

/** Ambil daftar perangkat dari GenieACS */
export async function fetchDevices() {
  const cfg = await genieBase();
  const data = await request({
    url: `${cfg.base}/devices`,
    headers: headers(cfg.auth),
    timeout: 8000,
    insecure: false,
  });
  if (!Array.isArray(data)) throw new Error('Respons daftar perangkat GenieACS tidak valid');
  if (data.some((device) => !device || typeof device._id !== 'string' || !device._id.trim())) {
    throw new Error('Respons daftar perangkat GenieACS memiliki ID perangkat tidak valid');
  }
  return data.map(normalizeDevice);
}

/** Ambil satu perangkat lengkap (seluruh parameter TR-069) dari GenieACS via query API */
export async function fetchDevice(deviceId) {
  const cfg = await genieBase();
  const query = encodeURIComponent(JSON.stringify({ _id: deviceId }));
  const arr = await request({
    url: `${cfg.base}/devices?query=${query}`,
    headers: headers(cfg.auth),
    timeout: 10000,
    insecure: false,
  });
  return Array.isArray(arr) ? arr[0] : arr;
}

/** Tulis parameter TR-069 ke perangkat (setParameterValues) */
export async function setParameterValues(deviceId, parameterValues) {
  const cfg = await genieBase();
  return request({
    url: `${cfg.base}/devices/${encodeURIComponent(deviceId)}/tasks`,
    method: 'POST',
    body: { name: 'setParameterValues', parameterValues },
    headers: headers(cfg.auth),
    timeout: 10000,
  });
}

/** Kirim task TR-069 generik (refreshObject/addObject/deleteObject/setParameterValues).
 *  opts.timeoutMs         — MILI DETIK (unit NBI GenieACS): NBI menahan respons HTTP
 *                           hingga task selesai (HTTP 200) atau melepasnya (HTTP 202).
 *  opts.connectionRequest — default true bila timeoutMs > 0: GenieACS langsung
 *                           "men-ring" ONT via TR-069 connection request.
 *  opts.httpTimeoutMs     — override timeout idle socket HTTP. */
async function postTask(deviceId, body, timeoutMs = 0, opts = {}) {
  const { connectionRequest = timeoutMs > 0, httpTimeoutMs = null } = opts || {};
  const cfg = await genieBase();
  const parts = [];
  if (timeoutMs) parts.push(`timeout=${timeoutMs}`);
  if (connectionRequest) parts.push('connection_request');
  return request({
    url: `${cfg.base}/devices/${encodeURIComponent(deviceId)}/tasks${parts.length ? `?${parts.join('&')}` : ''}`,
    method: 'POST',
    body,
    headers: headers(cfg.auth),
    timeout: httpTimeoutMs ?? (timeoutMs ? timeoutMs + 10000 : 10000),
    deadlineMs: httpTimeoutMs,
    insecure: false,
  });
}

/** Kumpulkan nama parameter vendor yang punya nilai pada subtree (mis. X_ZTE-COM_VLANID) */
export function findVendorKeys(root, pattern) {
  const keys = new Set();
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (pattern.test(key) && child && typeof child === 'object' && child._value !== undefined) keys.add(key);
      walk(child);
    }
  };
  walk(root);
  return [...keys];
}

/** Ambil objek pada path bertitik (mis. InternetGatewayDevice.LANDevice.1.WLANConfiguration.5) */
function resolvePath(rootObj, path) {
  let node = rootObj;
  for (const key of String(path).split('.')) {
    if (!node || typeof node !== 'object') return null;
    node = node[key];
  }
  return node && typeof node === 'object' ? node : null;
}

/** Summon perangkat — integrasi dengan server GenieACS: kirim connection request ke
 *  ONT (TR-069) + task refreshObject seluruh pohon parameter (objectName '' = root,
 *  berlaku untuk data model TR-098 InternetGatewayDevice maupun TR-181 Device).
 *  Tunggu task maksimum 1 detik di NBI, dengan deadline HTTP 10 detik.
 *  HTTP 200 = task selesai; 202 = antre, bukan bukti ONT telah merespons.
 *  Jangan polling inform periodik di dalam request web/mobile. */
export async function summonDevice(deviceId) {
  return postTask(deviceId, { name: 'refreshObject', objectName: '' }, 1000, { connectionRequest: true, httpTimeoutMs: 10000 });
}

/** Data pendukung verifikasi summon: jangkauan ONT dari server GenieACS (ping NBI
 *  /ping/{ip} dijalankan DI SERVER GenieACS) + interval inform periodik (detik)
 *  bila tersedia di pohon parameter. */
export async function getSummonFallback(deviceId) {
  const raw = await fetchDevice(deviceId);
  if (!raw) return { reachable: false, interval: null };
  const root = raw.InternetGatewayDevice ? 'InternetGatewayDevice' : (raw.Device ? 'Device' : null);
  const ms = root ? (raw[root].ManagementServer || {}) : {};
  const url = paramValue(ms, 'ConnectionRequestURL');
  let host = null;
  try { host = url ? new URL(url).hostname : null; } catch { host = null; }
  const n = Number(paramValue(ms, 'PeriodicInformInterval'));
  const interval = Number.isFinite(n) && n > 0 ? n : null;
  let reachable = null;
  if (host) {
    const cfg = await genieBase();
    try {
      await request({ url: `${cfg.base}/ping/${encodeURIComponent(host)}`, headers: headers(cfg.auth), timeout: 25000, insecure: false });
      reachable = true;
    } catch { reachable = false; }
  }
  return { reachable, interval };
}

/** Ambil _lastInform terakhir perangkat dari GenieACS — query ringan memakai
 *  projection (hanya field _lastInform) sehingga pohon parameter tidak ikut ditarik.
 *  Return timestamp (ms) atau null bila perangkat tidak ditemukan. */
export async function fetchDeviceLastInform(deviceId) {
  const cfg = await genieBase();
  const query = encodeURIComponent(JSON.stringify({ _id: deviceId }));
  const arr = await request({
    url: `${cfg.base}/devices?query=${query}&projection=_lastInform`,
    headers: headers(cfg.auth),
    timeout: 8000,
    insecure: false,
  });
  const d = Array.isArray(arr) ? arr[0] : arr;
  return d?._lastInform ? new Date(d._lastInform).getTime() : null;
}

/** Tunggu ONT melakukan inform — polling _lastInform secara berkala hingga
 *  bertambah sejak sinceMs (verifikasi summon). Menutup celah waktu antara NBI
 *  melepas respons (HTTP 202) dan ONT yang lambat menyelesaikan inform-nya.
 *  Return timestamp _lastInform terbaru (ms) atau null bila tidak ada perubahan. */
export async function waitForInform(deviceId, sinceMs, timeoutMs = 15000, intervalMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let latest = null;
    try {
      latest = await fetchDeviceLastInform(deviceId);
    } catch { /* GenieACS sesaat tidak terjangkau — ulangi sampai deadline */ }
    if (latest != null && (sinceMs == null || latest > sinceMs)) return latest;
  }
  return null;
}

/** Ambil gateway IP WAN utama dari parameter perangkat di server GenieACS
 *  (DefaultGateway pada WANPPPConnection / WANIPConnection). */
export function extractWanGateway(raw) {
  const root = raw.InternetGatewayDevice ? 'InternetGatewayDevice' : 'Device';
  const igd = raw[root] || {};
  for (const wv of Object.values(igd.WANDevice || {})) {
    if (!wv || typeof wv !== 'object') continue;
    for (const cv of Object.values(wv.WANConnectionDevice || {})) {
      if (!cv || typeof cv !== 'object') continue;
      for (const group of ['WANPPPConnection', 'WANIPConnection']) {
        for (const iv of Object.values(cv[group] || {})) {
          if (!iv || typeof iv !== 'object') continue;
          const gw = paramValue(iv, 'DefaultGateway');
          if (gw && isValidIp(gw)) return gw;
        }
      }
    }
  }
  return null;
}

export function normalizeDevice(d) {
  const idParts = parseDeviceId(d._id);
  const igd = d.InternetGatewayDevice || d.Device || {};
  const info = igd.DeviceInfo || {};
  const pon = igd.WANDevice?.['1']?.WANPONInterfaceConfig || {};
  const wlan = igd.LANDevice?.['1']?.WLANConfiguration?.['1'] || {};
  const lastInform = d._lastInform ? new Date(d._lastInform) : null;
  const online = lastInform && Date.now() - lastInform.getTime() < 3600 * 1000;
  const wanPpp = extractWanPpp(d);
  const loosePppIp = findValue(d, /externalipaddress|ipaddress/i, /wanpppconnection|ppp/i);
  const rxPower = normalizeOpticalPower(pon.RXPower?._value) ?? firstValidOptical(collectMatches(d, /rxpower|receive.*power/i));
  const txPower = normalizeOpticalPower(pon.TXPower?._value) ?? firstValidOptical(collectMatches(d, /txpower|transmit.*power/i));
  const temperature = firstValidTemperature(collectMatches(d, /temperature|temp/i));
  return {
    genieacs_device_id: d._id,
    wifi_clients: wifiClientCount(d),
    serial: idParts.serial || d.DeviceID?.SerialNumber || d._deviceId?.SerialNumber || null,
    model: idParts.model || info.ModelName?._value || null,
    firmware: info.SoftwareVersion?._value || null,
    rx_power: rxPower,
    tx_power: txPower,
    temperature: temperature,
    uptime: uptimeSeconds(findValue(d, /uptime/i)),
    ip_pppoe: wanPpp.ip || (isValidIp(loosePppIp) ? loosePppIp : null),
    wan_ppp_username: readExactPath(d, WAN_PPP_USERNAME_PATH) || wanPpp.username || findWanPppUsername(d) || findValue(d, /^pppoeusername$/i),
    ip_wan: findValue(d, /externalipaddress|ipaddress/i, /wanipconnection|wanconnection|wandevice/i),
    ssid: wlan.SSID?._value || null,
    status: online ? 'online' : 'offline',
    last_inform: mysqlDateTime(lastInform),
  };
}

function parseDeviceId(value) {
  const parts = String(value || '').split('-').filter(Boolean);
  if (parts.length < 3) return { model: null, serial: null };
  return { model: parts.at(-2), serial: parts.at(-1) };
}

/** Path parameter TR-069 username PPPoE (PRD 5.6) */
export const WAN_PPP_USERNAME_PATH = 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username';

/** Baca nilai parameter pada path persis, mis. WANPPPConnection.1.Username */
export function readExactPath(root, path) {
  let node = root;
  for (const key of String(path).split('.')) {
    if (!node || typeof node !== 'object') return null;
    node = node[key];
  }
  const value = node?._value ?? node?.value ?? node;
  if (value === null || value === undefined || typeof value === 'object') return null;
  const text = String(value).trim();
  return text || null;
}

/** Validasi IPv4 sederhana; menolak sentinel 0.0.0.0 dan nilai kosong */
export function isValidIp(value) {
  const v = String(value ?? '').trim();
  if (!v || v === '0.0.0.0') return false;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(v);
}

/** Kumpulkan seluruh instance WANPPPConnection (index berapapun, TR-098/TR-181) */
function collectWanPppInstances(root) {
  const instances = [];
  const walk = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (/^wanpppconnection$/i.test(key) && child && typeof child === 'object' && !Array.isArray(child)) {
        for (const [idx, inst] of Object.entries(child)) {
          if (!inst || typeof inst !== 'object' || String(idx).startsWith('_')) continue;
          instances.push({
            path: `${nextPath}.${idx}`,
            connectionType: String(inst.ConnectionType?._value ?? '').trim(),
            connectionStatus: String(inst.ConnectionStatus?._value ?? '').trim(),
            username: String(inst.Username?._value ?? '').trim(),
            external_ip: String(inst.ExternalIPAddress?._value ?? '').trim(),
          });
        }
      }
      walk(child, nextPath);
    }
  };
  walk(root);
  return instances;
}

/**
 * Pilih instance WANPPPConnection yang benar-benar dipakai untuk PPPoE.
 * Beberapa ONT (mis. ZTE F670L) punya WANPPPConnection.1 "Unconfigured" (Username kosong,
 * IP 0.0.0.0) sementara sesi aktif ada di instance lain dengan ConnectionType IP_Routed.
 */
function extractWanPpp(root) {
  const instances = collectWanPppInstances(root);
  if (!instances.length) return { username: null, ip: null };
  const routed = instances.filter((i) => /ip_routed/i.test(i.connectionType));
  const withUser = routed.filter((i) => i.username);
  const chosen = withUser[0]
    || routed[0]
    || instances.find((i) => i.username)
    || instances[0];
  const ip = [chosen, ...instances].map((i) => i.external_ip).find((v) => isValidIp(v)) || null;
  return { username: chosen.username || null, ip };
}

function findValue(root, keyPattern, pathPattern = null) {
  const matches = [];
  const walk = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (keyPattern.test(key) && child?._value !== undefined && (!pathPattern || pathPattern.test(nextPath))) {
        matches.push({ path: nextPath, value: child._value });
      }
      walk(child, nextPath);
    }
  };
  walk(root);
  if (matches.length) return scalar(matches[0].value);
  if (pathPattern) return findValue(root, keyPattern);
  return null;
}

/** Kumpulkan semua kandidat {path, value} yang cocok (untuk memilih yang pertama VALID, bukan sekadar pertama) */
function collectMatches(root, keyPattern) {
  const matches = [];
  const walk = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (keyPattern.test(key) && child?._value !== undefined) {
        matches.push({ path: nextPath, value: child._value });
      }
      walk(child, nextPath);
    }
  };
  walk(root);
  return matches;
}

/** Nilai optik (dBm) pertama yang valid — lewati nilai vendor mentah di luar rentang (mis. X_ZTE RXPower = 75) */
function firstValidOptical(matches) {
  for (const m of matches) {
    const n = normalizeOpticalPower(m.value);
    if (n !== null) return n;
  }
  return null;
}

/** Temperatur pertama yang valid; dukung encoding OMCI ZTE TransceiverTemperature (1/256 °C, mis. 11006 → 42,99) */
function firstValidTemperature(matches) {
  for (const m of matches) {
    const direct = normalizeTemperature(m.value);
    if (direct !== null) return direct;
    const n = numberValue(m.value);
    if (n !== null && n !== 0 && /transceiver/i.test(m.path) && n >= -32768 && n <= 32767) {
      const converted = Math.round((n / 256) * 100) / 100;
      if (converted !== 0 && converted >= -100 && converted <= 200) return converted;
    }
  }
  return null;
}

function findWanPppUsername(root) {
  const matches = [];
  const walk = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (/^username$/i.test(key) && /wanpppconnection/i.test(nextPath)) {
        const candidate = child?._value ?? child?.value ?? child;
        if (candidate !== null && candidate !== undefined && typeof candidate !== 'object' && String(candidate).trim() !== '') matches.push(candidate);
      } else if (Array.isArray(child)) {
        for (const item of child) {
          const candidate = item?._value ?? item?.value ?? item;
          if (/username/i.test(String(item?.name || item?.parameter || '')) && /wanpppconnection/i.test(nextPath) && typeof candidate !== 'object') matches.push(candidate);
        }
      }
      walk(child, nextPath);
    }
  };
  walk(root);
  return matches.length ? scalar(matches[0]) : null;
}

function scalar(value) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'object' ? JSON.stringify(value) : value;
}

function numberValue(value) {
  if (value === null) return null;
  const n = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Hanya simpan temperatur Celsius yang masuk akal; nilai sentinel GenieACS menjadi NULL. */
export function normalizeTemperature(value) {
  const n = numberValue(value);
  return n !== null && n !== 0 && n >= -100 && n <= 200 ? n : null;
}

/** Normalisasi daya optik GenieACS ke dBm; sentinel dan unit tidak valid menjadi NULL. */
export function normalizeOpticalPower(value) {
  const n = numberValue(value);
  return n !== null && n >= -100 && n <= 20 ? Number(n.toFixed(2)) : null;
}

function uptimeSeconds(value) {
  if (value === null) return null;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.match(/(?:(\d+)\s*d(?:ays?)?)?\s*(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?)?)?)?/i);
  if (!parts || !parts.slice(1).some(Boolean)) return null;
  return [parts[1], parts[2], parts[3], parts[4]].reduce((total, part, index) => total + Number(part || 0) * [86400, 3600, 60, 1][index], 0);
}

export const rebootTask = () => ({ name: 'reboot' });

/** Reboot perangkat melalui TR-069. Task tetap valid bila GenieACS mengantrekan respons 202. */
export async function rebootDevice(deviceId) {
  if (!String(deviceId || '').trim()) throw new Error('ID perangkat GenieACS tidak valid');
  return postTask(deviceId, rebootTask(), 20000);
}

/** Task untuk menjalankan provision SSID-LIST tanpa argumen. */
export function ssidListTask() {
  return { name: 'provisions', provisions: [['SSID-LIST']] };
}

/** Summon provision SSID-LIST yang dikonfigurasi pada server GenieACS. */
export async function summonSsidList(deviceId) {
  return postTask(deviceId, ssidListTask(), 20000);
}

/** Susun payload WiFi mengikuti path password yang benar-benar diekspos ONT. */
export function wifiParameterValues(raw, wlanPath, ssid, password) {
  const node = resolvePath(raw, wlanPath);
  if (!node) throw new Error('Path WLAN tidak ditemukan pada parameter perangkat — Summon SSID lalu coba lagi');
  const passwordPaths = [];
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('_')) continue;
      const childPath = `${path}.${key}`;
      if (/^(KeyPassphrase|PreSharedKey)$/i.test(key) && child && typeof child === 'object' && ('_value' in child || 'value' in child)) {
        passwordPaths.push(childPath);
      } else {
        walk(child, childPath);
      }
    }
  };
  walk(node, wlanPath);
  if (!passwordPaths.length) passwordPaths.push(`${wlanPath}.PreSharedKey.1.KeyPassphrase`);
  return [
    [`${wlanPath}.SSID`, String(ssid), 'xsd:string'],
    ...[...new Set(passwordPaths)].map((path) => [path, String(password), 'xsd:string']),
  ];
}

/** Ubah SSID & password WiFi pada WLANConfiguration tertentu. */
export async function setWifi(deviceId, ssid, password, wlanPath = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1') {
  const raw = await fetchDevice(deviceId);
  if (!raw) throw new Error('Perangkat tidak ditemukan di GenieACS');
  return postTask(deviceId, {
    name: 'setParameterValues',
    parameterValues: wifiParameterValues(raw, wlanPath, ssid, password),
  }, 20000);
}

/** Ubah kredensial PPPoE dan VLAN pada instance WANPPPConnection tertentu. */
export function wanPppParameterValues(pppPath, { username, password, vlan, vlanEnabled } = {}, node = {}) {
  const values = [[`${pppPath}.Username`, String(username).trim(), 'xsd:string']];
  if (password) values.push([`${pppPath}.Password`, String(password), 'xsd:string']);
  const keys = Object.keys(node).filter((key) => !key.startsWith('_'));
  if (vlan !== undefined && vlan !== null && String(vlan).trim() !== '') {
    const vlanKey = keys.find((key) => /vlan.*id|id.*vlan/i.test(key));
    if (!vlanKey) throw new Error('ONT tidak mengekspos parameter VLAN ID pada koneksi PPP ini');
    values.push([`${pppPath}.${vlanKey}`, String(vlan), 'xsd:unsignedInt']);
  }
  if (typeof vlanEnabled === 'boolean') {
    const vlanEnableKey = keys.find((key) => /vlan.*enable|enable.*vlan/i.test(key));
    if (!vlanEnableKey) throw new Error('ONT tidak mengekspos parameter VLAN enable pada koneksi PPP ini');
    values.push([`${pppPath}.${vlanEnableKey}`, String(vlanEnabled), 'xsd:boolean']);
  }
  return values;
}

export async function setWanPpp(deviceId, pppPath, { username, password, vlan, vlanEnabled } = {}) {
  const raw = await fetchDevice(deviceId);
  if (!raw) throw new Error('Perangkat tidak ditemukan di GenieACS');
  const node = resolvePath(raw, pppPath);
  if (!node) throw new Error('Instance WAN PPP tidak ditemukan pada perangkat — lakukan Summon lalu coba lagi');

  const values = wanPppParameterValues(pppPath, { username, password, vlan, vlanEnabled }, node);
  return postTask(deviceId, { name: 'setParameterValues', parameterValues: values }, 20000);
}

export const factoryResetTask = () => ({ name: 'factoryReset' });

/** Factory reset perangkat melalui TR-069. Task tetap valid bila GenieACS mengantrekan respons 202. */
export async function resetDevice(deviceId) {
  if (!String(deviceId || '').trim()) throw new Error('ID perangkat GenieACS tidak valid');
  return postTask(deviceId, factoryResetTask(), 20000);
}

/** Ubah akun login web ONT (superadmin/user) via TR-069 setParameterValues.
 *  Nama parameter username/password dipilih dari node akun per level (berbeda antar
 *  vendor: Username/UserName/WebUsername/WebSuperUsername — FiberHome memakai satu
 *  node untuk dua akun). Format password mengikuti yang tersimpan di ONT: bila nilai
 *  lama berupa hash MD5 (32 hex), password baru dikirim sebagai MD5; selain itu plaintext. */
export async function setUserAccount(deviceId, accountPath, { username, password, level = 'user' } = {}) {
  const raw = await fetchDevice(deviceId);
  if (!raw) throw new Error('Perangkat tidak ditemukan di GenieACS');
  if (!ACCOUNT_PATH_RE.test(accountPath)) throw new Error('Path akun ONT tidak valid');
  const node = resolvePath(raw, accountPath);
  if (!node) throw new Error('Path akun tidak ditemukan pada parameter perangkat — lakukan Summon lalu coba lagi');
  const keys = pickAccountKeys(node, level === 'super' ? 'super' : 'user');
  if (!keys) throw new Error('Parameter akun login tidak dikenali pada perangkat');

  const parameterValues = [];
  const uname = String(username ?? '').trim();
  if (uname && keys.usernameKey) parameterValues.push([`${accountPath}.${keys.usernameKey}`, uname, 'xsd:string']);
  if (password && keys.passwordKey) {
    const stored = paramValue(node, keys.passwordKey);
    let value = String(password);
    if (/^[a-f0-9]{32}$/i.test(String(stored || ''))) {
      value = crypto.createHash('md5').update(value).digest('hex'); // firmware menyimpan hash MD5
    }
    parameterValues.push([`${accountPath}.${keys.passwordKey}`, value, 'xsd:string']);
  }
  if (!parameterValues.length) throw new Error('Tidak ada perubahan username/password yang dikirim');
  return postTask(deviceId, { name: 'setParameterValues', parameterValues }, 20000);
}

/** Aktifkan/nonaktifkan SSID WiFi ONT (WLANConfiguration.{i}.Enable) via TR-069.
 *  Memakai connection_request + menunggu task selesai (maks 20 dtk, MILI DETIK)
 *  agar ONT menerapkan perubahan segera — pola sama dengan summonDevice. */
export async function setWifiEnable(deviceId, wlanPath, enable) {
  return postTask(
    deviceId,
    { name: 'setParameterValues', parameterValues: [[`${wlanPath}.Enable`, enable ? 'true' : 'false', 'xsd:boolean']] },
    20000
  );
}

function paramValue(obj, key) {
  const v = obj?.[key]?._value ?? obj?.[key]?.value;
  return v === undefined || v === null || typeof v === 'object' ? null : String(v);
}

function paramByPattern(obj, pattern) {
  for (const [key, child] of Object.entries(obj || {})) {
    if (!pattern.test(key)) continue;
    const v = child?._value ?? child?.value;
    if (v !== undefined && v !== null && typeof v !== 'object') return String(v);
  }
  return null;
}

/** Jumlah klien aktif pada satu SSID; null bila ONT tidak melaporkan asosiasi. */
function wlanClientCount(wlan) {
  if (/^(false|0)$/i.test(paramValue(wlan, 'Enable') || '')) return 0;
  const reported = paramValue(wlan, 'TotalAssociations') ?? paramValue(wlan, 'AssociatedDeviceNumberOfEntries');
  if (reported !== null && /^\d+$/.test(reported) && Number.isSafeInteger(Number(reported))) return Number(reported);
  const entries = Object.entries(wlan?.AssociatedDevice || {}).filter(([key, value]) => /^\d+$/.test(key) && value && typeof value === 'object');
  if (!entries.length) return null;
  return entries.filter(([, entry]) => {
    const active = paramValue(entry, 'Active');
    return active === null || /^(true|1)$/i.test(active);
  }).length;
}

/** Total hanya diketahui jika setiap SSID melaporkan jumlah klien. */
export function wifiClientCount(raw) {
  const root = raw?.InternetGatewayDevice || raw?.Device || {};
  const counts = Object.values(root.LANDevice || {}).flatMap((lan) =>
    Object.entries(lan?.WLANConfiguration || {})
      .filter(([key, wlan]) => /^\d+$/.test(key) && wlan && typeof wlan === 'object')
      .map(([, wlan]) => wlanClientCount(wlan)));
  return counts.length && counts.every((count) => count !== null)
    ? counts.reduce((sum, count) => sum + count, 0) : null;
}

/** Daftar asosiasi WiFi aktif; metadata host hanya melengkapi MAC yang cocok. */
export function activeWifiDevices(raw) {
  const root = raw?.InternetGatewayDevice || raw?.Device || {};
  const hosts = new Map();
  for (const hostGroup of [root.Hosts, ...Object.values(root.LANDevice || {}).map((lan) => lan?.Hosts)]) {
    for (const [key, value] of Object.entries(hostGroup?.Host || {})) {
      if (!/^\d+$/.test(key) || !value || typeof value !== 'object') continue;
      const mac = paramValue(value, 'MACAddress');
      if (mac) hosts.set(mac.toLowerCase(), value);
    }
  }
  const devices = [];
  for (const [lanId, lan] of Object.entries(root.LANDevice || {})) {
    if (!/^\d+$/.test(lanId)) continue;
    for (const [wlanId, wlan] of Object.entries(lan?.WLANConfiguration || {})) {
      if (!/^\d+$/.test(wlanId) || /^(false|0)$/i.test(paramValue(wlan, 'Enable') || '')) continue;
      for (const [index, entry] of Object.entries(wlan?.AssociatedDevice || {})) {
        if (!/^\d+$/.test(index) || !entry || typeof entry !== 'object') continue;
        const active = paramValue(entry, 'Active');
        if (active !== null && !/^(true|1)$/i.test(active)) continue;
        const mac = paramValue(entry, 'AssociatedDeviceMACAddress') || paramValue(entry, 'MACAddress');
        const host = hosts.get(mac?.toLowerCase());
        devices.push({
          key: `${lanId}-${wlanId}-${index}`,
          ssid: paramValue(wlan, 'SSID'),
          name: paramValue(host, 'HostName') || paramValue(entry, 'HostName'),
          ip: paramValue(host, 'IPAddress') || paramValue(entry, 'IPAddress'),
          mac: mac || null,
        });
      }
    }
  }
  return devices;
}

/** Whitelist path akun login web ONT yang boleh diubah via API (hasil diagnosa lapangan):
 *  - {root}.UserInfo.{i}                              — ZTE/umum
 *  - {root}.UserInterface.X_HW_WebUserInfo.{i}        — Huawei
 *  - {root}.UserManagement.User.{i}                   — Fiberhome
 *  - {root}.User.{i}                                  — ZTE F670L
 *  - {root}.DeviceInfo.X_FH_Account.X_FH_WebUserInfo  — FiberHome (satu node, dua akun)
 *  - {root}.UserInterface.X_ZTE-COM_WebUserInfo       — ZTE (akun web)
 *  - Device.UserInterface.User.{i}                    — TR-181 */
export const ACCOUNT_PATH_RE = new RegExp([
  '^(InternetGatewayDevice|Device)\\.UserInfo\\.\\d+$',
  '^(InternetGatewayDevice|Device)\\.UserInterface\\.X_HW_WebUserInfo\\.\\d+$',
  '^(InternetGatewayDevice|Device)\\.UserManagement\\.User\\.\\d+$',
  '^(InternetGatewayDevice|Device)\\.User\\.\\d+$',
  '^Device\\.UserInterface\\.User\\.\\d+$',
  '^(InternetGatewayDevice|Device)\\.DeviceInfo\\.X_FH_Account\\.X_FH_WebUserInfo$',
  '^(InternetGatewayDevice|Device)\\.UserInterface\\.X_ZTE-COM_WebUserInfo$',
].join('|'));

/** Klasifikasi level akun berdasarkan username yang terbaca (null = tak dikenali) */
function classifyAccount(username) {
  const s = String(username || '').toLowerCase();
  if (/telecomadmin|superadmin|super_admin/.test(s)) return 'super';
  if (/^user$|^useradmin$|^customeradmin$/.test(s)) return 'user';
  if (/^admin/.test(s)) return 'super';
  return null;
}

/** Pilih pasangan key username/password pada node akun. Bila ada beberapa pasangan
 *  (FiberHome: WebSuperUsername/WebUsername), level 'super' memilih yang mengandung
 *  "super", 'user' yang bukan. Password dicari dengan prefix yang sama dari username
 *  (WebSuperUsername → WebSuperPassword, WebUsername → WebPassword, UserName → UserPassword). */
function pickAccountKeys(node, level = 'user') {
  const unameKeys = Object.keys(node).filter((k) => /username$/i.test(k));
  const pwdKeys = Object.keys(node).filter((k) => /password$/i.test(k));
  if (!unameKeys.length && !pwdKeys.length) return null;
  const prefer = (keys) => {
    if (!keys.length) return null;
    if (keys.length === 1) return keys[0];
    if (level === 'super') return keys.find((k) => /super/i.test(k)) || keys.find((k) => !/super/i.test(k)) || keys[0];
    return keys.find((k) => !/super/i.test(k)) || keys[0];
  };
  const usernameKey = prefer(unameKeys);
  let passwordKey = null;
  if (usernameKey) {
    const prefix = usernameKey.replace(/username$/i, '');
    passwordKey = pwdKeys.find((k) => k.toLowerCase() === `${prefix}password`.toLowerCase()) || null;
  }
  if (!passwordKey) passwordKey = prefer(pwdKeys);
  return { usernameKey, passwordKey };
}

/** Cari akun login web ONT (superadmin/user) dari lokasi yang benar-benar ada di lapangan:
 *  - Huawei    : {root}.UserInterface.X_HW_WebUserInfo.{i} (UserName/Password — di HG8145V5
 *                .1 = akun "user", .2 = superadmin dengan username tersembunyi)
 *  - FiberHome : {root}.DeviceInfo.X_FH_Account.X_FH_WebUserInfo (satu node dua akun:
 *                WebSuperUsername/WebSuperPassword + WebUsername/WebPassword)
 *  - ZTE       : {root}.UserInterface.X_ZTE-COM_WebUserInfo (UserName/UserPassword — nilai
 *                kerap tersembunyi, tetap bisa diubah)
 *  - ZTE F670L : {root}.User.{i} (Username/Password — .1 admin tersembunyi, .2 user)
 *  - ZTE/umum  : {root}.UserInfo.{i} · Fiberhome: {root}.UserManagement.User.{i} · TR-181: Device.UserInterface.User.{i} */
export function parseAccounts(igd, root) {
  const accounts = [];

  const pushIndexed = (path, node, idx) => {
    if (!node || typeof node !== 'object') return;
    const keys = pickAccountKeys(node, idx === 1 ? 'super' : 'user');
    if (!keys) return; // bukan node akun login
    accounts.push({
      path,
      idx,
      username: keys.usernameKey ? paramValue(node, keys.usernameKey) : null,
      password: keys.passwordKey ? paramValue(node, keys.passwordKey) : null,
      username_key: keys.usernameKey || null,
      password_key: keys.passwordKey || null,
      level: null, // diklasifikasikan per keluarga setelah pengumpulan
    });
  };

  for (const [k, v] of Object.entries(igd.UserInterface?.X_HW_WebUserInfo || {})) {
    if (!String(k).startsWith('_') && v && typeof v === 'object') pushIndexed(`${root}.UserInterface.X_HW_WebUserInfo.${k}`, v, Number(k) || 0);
  }
  for (const [k, v] of Object.entries(igd.User || {})) {
    if (!String(k).startsWith('_') && v && typeof v === 'object') pushIndexed(`${root}.User.${k}`, v, Number(k) || 0);
  }
  for (const [k, v] of Object.entries(igd.UserInfo || {})) {
    if (!String(k).startsWith('_') && v && typeof v === 'object') pushIndexed(`${root}.UserInfo.${k}`, v, Number(k) || 0);
  }
  for (const [k, v] of Object.entries(igd.UserManagement?.User || {})) {
    if (!String(k).startsWith('_') && v && typeof v === 'object') pushIndexed(`${root}.UserManagement.User.${k}`, v, Number(k) || 0);
  }
  for (const [k, v] of Object.entries(igd.UserInterface?.User || {})) {
    if (!String(k).startsWith('_') && v && typeof v === 'object') pushIndexed(`Device.UserInterface.User.${k}`, v, Number(k) || 0);
  }

  // Klasifikasi per keluarga (lokasi vendor = satu keluarga):
  //  - username terbaca → ikut klasifikasi (telecomadmin/superadmin/admin → super, user → user)
  //  - tepat satu akun tersembunyi di samping akun "user" → superadmin (pola Huawei/ZTE di lapangan)
  //  - tanpa petunjuk → urutan index (.1 = super, sisanya user)
  const families = new Map();
  for (const a of accounts) {
    const fam = a.path.replace(/\.\d+$/, '');
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam).push(a);
  }
  for (const fam of families.values()) {
    const hidden = [];
    for (const a of fam) {
      const c = classifyAccount(a.username);
      if (c) a.level = c;
      else hidden.push(a);
    }
    const levels = fam.filter((a) => a.level).map((a) => a.level);
    if (hidden.length === 1 && levels.length && levels.every((l) => l === 'user')) {
      hidden[0].level = 'super';
    }
    for (const a of hidden) if (!a.level) a.level = a.idx === 1 ? 'super' : 'user';
  }

  // FiberHome — satu node berisi dua akun (super & user)
  const fh = igd.DeviceInfo?.X_FH_Account?.X_FH_WebUserInfo;
  if (fh && typeof fh === 'object') {
    const ks = pickAccountKeys(fh, 'super');
    const ku = pickAccountKeys(fh, 'user');
    const p = `${root}.DeviceInfo.X_FH_Account.X_FH_WebUserInfo`;
    if (ks && ks.usernameKey) accounts.push({ path: p, username: paramValue(fh, ks.usernameKey), password: paramValue(fh, ks.passwordKey), username_key: ks.usernameKey, password_key: ks.passwordKey, level: 'super' });
    if (ku && ku.usernameKey) accounts.push({ path: p, username: paramValue(fh, ku.usernameKey), password: paramValue(fh, ku.passwordKey), username_key: ku.usernameKey, password_key: ku.passwordKey, level: 'user' });
  }

  // ZTE — node akun web tunggal (nilai biasanya tersembunyi, tetap bisa diubah)
  const zte = igd.UserInterface?.['X_ZTE-COM_WebUserInfo'];
  if (zte && typeof zte === 'object') {
    const kz = pickAccountKeys(zte, 'user');
    if (kz) accounts.push({ path: `${root}.UserInterface.X_ZTE-COM_WebUserInfo`, username: kz.usernameKey ? paramValue(zte, kz.usernameKey) : null, password: kz.passwordKey ? paramValue(zte, kz.passwordKey) : null, username_key: kz.usernameKey, password_key: kz.passwordKey, level: 'user' });
  }

  for (const a of accounts) delete a.idx;
  return accounts;
}

/** Parse data mentah GenieACS menjadi struktur halaman Setting ONT (WAN/SSID/System) */
export function parseDeviceDetail(raw) {
  const root = raw.InternetGatewayDevice ? 'InternetGatewayDevice' : 'Device';
  const igd = raw[root] || {};
  const info = igd.DeviceInfo || {};
  const norm = normalizeDevice(raw);

  const wan_ip = [];
  const wan_ppp = [];
  for (const [wk, wv] of Object.entries(igd.WANDevice || {})) {
    if (String(wk).startsWith('_') || !wv || typeof wv !== 'object') continue;
    for (const [ck, cv] of Object.entries(wv.WANConnectionDevice || {})) {
      if (String(ck).startsWith('_') || !cv || typeof cv !== 'object') continue;
      for (const [ik, iv] of Object.entries(cv.WANIPConnection || {})) {
        if (String(ik).startsWith('_') || !iv || typeof iv !== 'object') continue;
        const name = paramValue(iv, 'Name') || paramValue(iv, 'ServiceList') || `WAN IP ${wk}.${ck}.${ik}`;
        wan_ip.push({
          key: `ip-${wk}-${ck}-${ik}`,
          base_path: `${root}.WANDevice.${wk}.WANConnectionDevice.${ck}.WANIPConnection.${ik}`,
          name,
          connection_type: paramValue(iv, 'ConnectionType'),
          status: paramValue(iv, 'Status') || paramValue(iv, 'ConnectionStatus'),
          external_ip: paramValue(iv, 'ExternalIPAddress'),
          mac: paramValue(iv, 'MACAddress'),
          nat_enabled: paramValue(iv, 'NATEnabled'),
          service: paramValue(iv, 'ServiceList') || paramValue(iv, 'X_ZTE-COM_ServiceList'),
          vlan: paramByPattern(iv, /vlan/i),
          bindings: (paramByPattern(iv, /(?:lan.*(?:bind|interface)|(?:bind|interface).*lan)/i) || '').split(',').map((path) => path.trim()).filter(Boolean),
          last_error: paramValue(iv, 'LastConnectionError'),
          enable: paramValue(iv, 'Enable'),
          management: /tr069|tr-069|management/i.test(`${name} ${paramValue(iv, 'ServiceList') || ''} ${paramValue(iv, 'X_ZTE-COM_ServiceList') || ''}`),
        });
      }
      for (const [ik, iv] of Object.entries(cv.WANPPPConnection || {})) {
        if (String(ik).startsWith('_') || !iv || typeof iv !== 'object') continue;
        const username = paramValue(iv, 'Username') || '';
        const name = paramValue(iv, 'Name') || paramValue(iv, 'ServiceList') || paramValue(iv, 'X_ZTE-COM_ServiceList') || `WAN PPP ${wk}.${ck}.${ik}`;
        wan_ppp.push({
          key: `ppp-${wk}-${ck}-${ik}`,
          base_path: `${root}.WANDevice.${wk}.WANConnectionDevice.${ck}.WANPPPConnection.${ik}`,
          name,
          connection_type: paramValue(iv, 'ConnectionType'),
          status: paramValue(iv, 'Status') || paramValue(iv, 'ConnectionStatus'),
          username,
          external_ip: paramValue(iv, 'ExternalIPAddress'),
          nat_enabled: paramValue(iv, 'NATEnabled'),
          service: paramValue(iv, 'ServiceList') || paramValue(iv, 'X_ZTE-COM_ServiceList'),
          vlan: paramByPattern(iv, /vlan.*id|id.*vlan/i),
          vlan_enabled: paramByPattern(iv, /vlan.*enable|enable.*vlan/i),
          bindings: (paramByPattern(iv, /(?:lan.*(?:bind|interface)|(?:bind|interface).*lan)/i) || '').split(',').map((path) => path.trim()).filter(Boolean),
          management: /tr069|tr-069|management/i.test(`${name} ${paramValue(iv, 'ServiceList') || ''} ${paramValue(iv, 'X_ZTE-COM_ServiceList') || ''}`),
          last_error: paramValue(iv, 'LastConnectionError'),
          enable: paramValue(iv, 'Enable'),
          active: /ip_routed/i.test(String(paramValue(iv, 'ConnectionType') || '')) && username.trim() !== '',
        });
      }
    }
  }

  const wlan = [];
  const interfaces = [];
  for (const [lk, lv] of Object.entries(igd.LANDevice || {})) {
    if (String(lk).startsWith('_') || !lv || typeof lv !== 'object') continue;
    for (const [ik, iv] of Object.entries(lv.LANEthernetInterfaceConfig || {})) {
      if (String(ik).startsWith('_') || !iv || typeof iv !== 'object') continue;
      interfaces.push({
        path: `${root}.LANDevice.${lk}.LANEthernetInterfaceConfig.${ik}`,
        type: 'lan',
        label: paramValue(iv, 'Name') || `LAN${ik}`,
        bound_to: paramByPattern(iv, /bind|wanname/i),
      });
    }
    for (const [wk2, wv2] of Object.entries(lv.WLANConfiguration || {})) {
      if (String(wk2).startsWith('_') || !wv2 || typeof wv2 !== 'object') continue;
      wlan.push({
        key: `wlan-${lk}-${wk2}`,
        base_path: `${root}.LANDevice.${lk}.WLANConfiguration.${wk2}`,
        index: Number(wk2),
        ssid: paramValue(wv2, 'SSID'),
        device_count: wlanClientCount(wv2),
        status: paramValue(wv2, 'Status'),
        channel: paramValue(wv2, 'Channel'),
        standard: paramValue(wv2, 'Standard'),
        beacon_type: paramValue(wv2, 'BeaconType'),
        mac: paramValue(wv2, 'BSSID'),
        enable: paramValue(wv2, 'Enable'),
      });
      interfaces.push({
        path: `${root}.LANDevice.${lk}.WLANConfiguration.${wk2}`,
        type: 'ssid',
        label: `SSID${wk2}`,
        ssid: paramValue(wv2, 'SSID'),
        bound_to: paramByPattern(wv2, /bind|wanname/i),
      });
    }
  }

  return {
    root,
    overview: {
      status: norm.status,
      last_inform: norm.last_inform,
      rx_power: norm.rx_power,
      tx_power: norm.tx_power,
      temperature: norm.temperature,
      uptime: norm.uptime,
      ip_wan: norm.ip_wan,
      ip_pppoe: norm.ip_pppoe,
    },
    wan_ip,
    wan_ppp,
    wlan,
    interfaces,
    accounts: parseAccounts(igd, root),
    system: {
      device_id: raw._id,
      manufacturer: paramValue(info, 'Manufacturer'),
      model: paramValue(info, 'ModelName'),
      hardware: paramValue(info, 'HardwareVersion'),
      firmware: paramValue(info, 'SoftwareVersion'),
      serial: paramValue(info, 'SerialNumber'),
      description: paramValue(info, 'Description'),
    },
  };
}

/** Buat koneksi WAN baru via addObject lalu setParameterValues — type: 'ppp' | 'bridge'. */
export function wanAddObjectName(base, type) {
  return `${base}.${type === 'bridge' ? 'WANIPConnection' : 'WANPPPConnection'}`;
}

/** Induk WANConnectionDevice dari path instance WAN; tipe koneksi dan nomor instance dibuang. */
export function wanConnectionDeviceBase(sample, root = 'InternetGatewayDevice') {
  const parts = String(sample || '').split('.').filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, -2).join('.') : `${root}.WANDevice.1.WANConnectionDevice.1`;
}

/** Pilih parent PPP yang ada; jangan tempatkan koneksi internet pada parent TR069. */
export function wanPppParent(raw, detail) {
  const wanDevices = raw[detail.root]?.WANDevice || {};
  const available = (base) => resolvePath(raw, base)?._object
    && !detail.wan_ip.some((w) => w.management && w.base_path.startsWith(`${base}.`));
  const internet = detail.wan_ppp.find((w) => w.active && w.username && available(wanConnectionDeviceBase(w.base_path, detail.root)))
    || detail.wan_ppp.find((w) => w.username && available(wanConnectionDeviceBase(w.base_path, detail.root)));
  if (internet) return wanConnectionDeviceBase(internet.base_path, detail.root);
  for (const [wk, device] of Object.entries(wanDevices)) {
    if (!/^\d+$/.test(wk)) continue;
    for (const [ck, parent] of Object.entries(device.WANConnectionDevice || {})) {
      if (!/^\d+$/.test(ck) || !parent?._object) continue;
      const base = `${detail.root}.WANDevice.${wk}.WANConnectionDevice.${ck}`;
      if (![...detail.wan_ip, ...detail.wan_ppp].some((w) => w.base_path.startsWith(`${base}.`))) return base;
    }
  }
  return null; // Parent internet belum ada; buat parent terpisah, jangan memakai parent TR069.
}

/** Temukan path instance baru hanya pada object parent yang diminta. */
export function findNewWanInstance(entries, objectName, existingPaths = new Set()) {
  const prefix = `${objectName}.`;
  const added = (entries || []).map((entry) => String(entry?.base_path || ''))
    .filter((path) => path.startsWith(prefix) && /^\d+$/.test(path.slice(prefix.length)) && !existingPaths.has(path));
  if (added.length !== 1) throw new Error(`Hasil addObject tidak jelas (${added.length} instance baru)`);
  return added[0];
}

export function wanBindingPaths(bindings = []) {
  const validPath = /^(InternetGatewayDevice|Device)\.LANDevice\.\d+\.(LANEthernetInterfaceConfig|WLANConfiguration)\.\d+$/;
  return [...new Set((Array.isArray(bindings) ? bindings : []).filter((path) => validPath.test(String(path))))];
}

const WAN_BINDING_PARAMETER_RE = /(?:lan.*(?:bind|interface)|(?:bind|interface).*lan)/i;

export function wanBindingTemplate(raw, detail) {
  for (const entry of [...detail.wan_ppp, ...detail.wan_ip]) {
    const node = resolvePath(raw, entry.base_path);
    const key = Object.keys(node || {}).find((name) => WAN_BINDING_PARAMETER_RE.test(name));
    if (key) return { [key]: node[key] };
  }
  return {};
}

/** Susun konfigurasi instance baru dari schema WAN sejenis yang benar-benar diekspos ONT. */
export function wanCreateParameterValues(newPath, type, opts, template = {}) {
  const isBridge = type === 'bridge';
  const name = String(opts.name || '').trim() || (isBridge ? 'BRIDGE' : 'INTERNET');
  const connectionType = isBridge ? 'IP_Bridged' : (paramValue(template, 'ConnectionType') || 'IP_Routed');
  const values = [
    [`${newPath}.Enable`, 'true', 'xsd:boolean'],
    [`${newPath}.Name`, name, 'xsd:string'],
    [`${newPath}.ConnectionType`, connectionType, 'xsd:string'],
    [`${newPath}.NATEnabled`, isBridge ? 'false' : 'true', 'xsd:boolean'],
  ];
  if (!isBridge) {
    values.push([`${newPath}.Username`, String(opts.username || '').trim(), 'xsd:string']);
    if (opts.password) values.push([`${newPath}.Password`, String(opts.password), 'xsd:string']);
  }

  const serviceKey = Object.keys(template).find((key) => /servicelist/i.test(key));
  if (serviceKey) values.push([`${newPath}.${serviceKey}`, 'INTERNET', 'xsd:string']);

  const bindings = wanBindingPaths(opts.bindings);
  const bindingKey = Object.keys(template).find((key) => WAN_BINDING_PARAMETER_RE.test(key));
  if (bindings.length && bindingKey) values.push([`${newPath}.${bindingKey}`, bindings.join(','), 'xsd:string']);

  if (typeof opts.vlanEnabled !== 'boolean') throw new Error('Status VLAN harus enable atau disable');
  const vlanIdKey = Object.keys(template).find((key) => /vlan.*id|id.*vlan/i.test(key));
  const vlanEnableKey = Object.keys(template).find((key) => /vlan.*enable|enable.*vlan/i.test(key));
  if (!vlanIdKey || !vlanEnableKey) throw new Error('ONT tidak mengekspos parameter VLAN ID/Enable pada tipe WAN yang dipilih');
  if (opts.vlanEnabled) values.push([`${newPath}.${vlanIdKey}`, String(opts.vlan), 'xsd:unsignedInt']);
  values.push([`${newPath}.${vlanEnableKey}`, String(opts.vlanEnabled), 'xsd:boolean']);
  return values;
}

export async function createWanConnection(deviceId, opts = {}) {
  const type = opts.type === 'bridge' ? 'bridge' : 'ppp';
  const raw = await fetchDevice(deviceId);
  if (!raw) throw new Error('Perangkat tidak ditemukan di GenieACS');
  const detail = parseDeviceDetail(raw);
  const bindings = wanBindingPaths(opts.bindings).filter((path) => detail.interfaces.some((iface) => iface.path === path));
  const wanOptions = { ...opts, bindings };
  const srcList = type === 'bridge' ? detail.wan_ip : detail.wan_ppp;
  const preferredTemplate = type === 'ppp'
    ? srcList.find((w) => w.active && w.username) || srcList.find((w) => w.username) || srcList[0]
    : null;
  const templateEntry = type === 'ppp'
    ? preferredTemplate || null
    : srcList.find((w) => !w.management) || srcList[0] || null;
  const fallbackEntry = detail.wan_ppp[0] || detail.wan_ip[0] || null;
  const sample = templateEntry?.base_path || fallbackEntry?.base_path || null;
  let base = type === 'ppp' ? wanPppParent(raw, detail) : wanConnectionDeviceBase(sample, detail.root);
  const schemaEntry = templateEntry || (type === 'ppp' ? fallbackEntry : null);
  const template = { ...(schemaEntry ? resolvePath(raw, schemaEntry.base_path) : null), ...wanBindingTemplate(raw, detail) };
  // Validasi schema sebelum membuat instance; kegagalan validasi tidak boleh meninggalkan WAN kosong.
  const validationBase = base || `${detail.root}.WANDevice.1.WANConnectionDevice.1`;
  wanCreateParameterValues(`${wanAddObjectName(validationBase, type)}.1`, type, wanOptions, template || {});

  // HTTP 202 berarti task masih antre; jangan kirim task berikutnya atau ulang addObject.
  const wanTask = async (body) => {
    const result = await postTask(deviceId, body, 120000, { httpTimeoutMs: 130000 });
    if (result?._httpStatus !== 200) throw new Error(`Task ${body.name} belum selesai di ONT (HTTP 202); periksa antrean GenieACS sebelum mencoba lagi`);
    return result;
  };

  if (type === 'ppp' && !base) {
    const wanDevice = Object.entries(raw[detail.root]?.WANDevice || {}).find(([key, node]) => /^\d+$/.test(key) && node?.WANConnectionDevice?._object);
    if (!wanDevice) throw new Error('ONT tidak mengekspos WANConnectionDevice yang dapat ditambah; WAN TR069 tidak diubah');
    const parentCollection = `${detail.root}.WANDevice.${wanDevice[0]}.WANConnectionDevice`;
    const before = new Set(Object.keys(wanDevice[1].WANConnectionDevice).filter((key) => /^\d+$/.test(key)));
    try {
      await wanTask({ name: 'addObject', objectName: parentCollection });
      await wanTask({ name: 'refreshObject', objectName: parentCollection });
      const current = await fetchDevice(deviceId);
      const added = Object.keys(resolvePath(current, parentCollection) || {}).filter((key) => /^\d+$/.test(key) && !before.has(key));
      if (added.length !== 1) throw new Error(`Hasil addObject WANConnectionDevice tidak jelas (${added.length} parent baru)`);
      base = `${parentCollection}.${added[0]}`;
    } catch (err) {
      throw new Error(`${err.message}; addObject WANConnectionDevice telah dikirim, periksa parent internet di ONT sebelum mencoba lagi`);
    }
  }
  const objectName = wanAddObjectName(base, type);
  const existingPaths = new Set(srcList.map((entry) => entry.base_path));
  try {
    await wanTask({ name: 'addObject', objectName });
  } catch (err) {
    throw new Error(`${err.message}; periksa ${base} di ONT sebelum mencoba lagi`);
  }
  let newPath;
  try {
    await wanTask({ name: 'refreshObject', objectName });
    const updated = parseDeviceDetail(await fetchDevice(deviceId));
    newPath = findNewWanInstance(type === 'bridge' ? updated.wan_ip : updated.wan_ppp, objectName, existingPaths);
  } catch (err) {
    throw new Error(`${err.message}; addObject telah dikirim, periksa instance WAN di ONT sebelum mencoba lagi`);
  }
  const instance = Number(newPath.slice(objectName.length + 1));

  // Isi instance yang benar-benar dibuat ONT (nomornya tidak harus max + 1).
  const name = type === 'ppp' && opts.vlanEnabled
    ? `${base.split('.').pop()}_INTERNET_R_VID_${opts.vlan}`
    : String(opts.name || '').trim() || (type === 'bridge' ? 'BRIDGE' : 'INTERNET');
  let parameterValues;
  try {
    parameterValues = wanCreateParameterValues(newPath, type, { ...wanOptions, name }, template || {});
    await wanTask({ name: 'setParameterValues', parameterValues });

    // Baca ulang dari ONT. Hasil ini belum membuktikan konfigurasi bertahan setelah reboot.
    let configured = false;
    for (let i = 0; i < 5 && !configured; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await wanTask({ name: 'refreshObject', objectName: newPath });
      const node = resolvePath(await fetchDevice(deviceId), newPath);
      configured = parameterValues
        .filter(([path]) => !/\.Password$/i.test(path))
        .every(([path, expected]) => {
          const actual = paramValue(node, path.split('.').pop());
          return String(actual).toLowerCase() === String(expected).toLowerCase()
            || (/^(true|1)$/i.test(String(actual)) && /^(true|1)$/i.test(String(expected)))
            || (/^(false|0)$/i.test(String(actual)) && /^(false|0)$/i.test(String(expected)));
        });
    }
    if (!configured) throw new Error('Konfigurasi WAN baru tidak terverifikasi pada ONT; koneksi tidak dinyatakan berhasil');
  } catch (err) {
    // Task GenieACS/ONT asinkron: data dapat belum ter-refresh ketika batas polling habis.
    // Jangan hapus instance baru, karena rollback ini dapat menghapus WAN yang sebenarnya
    // sudah diterapkan ONT. Penghapusan hanya boleh diminta eksplisit oleh pengguna.
    throw new Error(`${err.message} WAN ${newPath} dipertahankan; refresh data ONT lalu periksa atau hapus manual bila perlu.`);
  }

  // LAN BIND belongs to the WAN instance and contains comma-separated interface paths.
  const requestedBindings = bindings;
  const bindParameter = parameterValues.find(([path]) => WAN_BINDING_PARAMETER_RE.test(path.split('.').pop()));
  const bindingsApplied = bindParameter ? requestedBindings : [];
  const bindingsSkipped = bindParameter ? [] : requestedBindings;

  const vlanKey = parameterValues.find(([path]) => /vlan.*id|id.*vlan/i.test(path))?.[0].split('.').pop() || null;
  return { instance_path: newPath, instance, name, vlan_key: vlanKey, bindings_applied: bindingsApplied, bindings_skipped: bindingsSkipped };
}

// Keep existing imports working while routing new WAN creation through explicit API.
export const addWanConnection = createWanConnection;

/** Hapus koneksi WAN (deleteObject) — timeout milidetik (unit NBI GenieACS) */
export async function deleteWanConnection(deviceId, objectPath) {
  return postTask(deviceId, { name: 'deleteObject', objectName: objectPath }, 20000);
}
