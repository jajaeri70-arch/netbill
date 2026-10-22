import { Router } from 'express';
import { q, exec, tx } from '../db.js';
import { logActivity, num, getSettings, nowLocal } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import * as genieacs from '../services/genieacs.js';
import { pingHost } from '../services/ping.js';

const r = Router();

// Nilai nol pernah tersimpan sebelum sentinel GenieACS diperbaiki.
function normalizeStoredTemperature(value) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Join pelanggan terbaik untuk perangkat ONT — prioritas:
 *  1) link langsung (customer_id)  2) kecocokan username PPPoE
 *  3) ID GenieACS sama  4) serial ONT di data pelanggan */
const CUSTOMER_JOIN = `LEFT JOIN customers c ON c.id = (
  SELECT c2.id FROM customers c2
  WHERE (d.customer_id IS NOT NULL AND c2.id = d.customer_id)
     OR (d.pppoe_username IS NOT NULL AND d.pppoe_username <> '' AND c2.pppoe_username = d.pppoe_username)
     OR (d.genieacs_device_id IS NOT NULL AND c2.genieacs_device_id = d.genieacs_device_id)
     OR (d.serial IS NOT NULL AND d.serial <> '' AND c2.ont_serial = d.serial)
  ORDER BY (c2.id = d.customer_id) DESC, c2.id DESC
  LIMIT 1
)`;

/** GET /api/devices — daftar perangkat ONT (PRD 5.6) */
r.get('/', can('devices'), async (req, res) => {
  try {
    const { q: search, status, signal, odp, page = 1, limit = 15, sortBy = 'status', sortDir = 'desc' } = req.query;
    const sortColumns = {
      id: 'd.id', customer: 'c.name', pppoe_username: 'COALESCE(d.pppoe_username, c.pppoe_username)', serial: 'd.serial',
      status: 'd.status', rx_power: 'd.rx_power', temperature: 'd.temperature', uptime: 'd.uptime',
      ip_pppoe: 'd.ip_pppoe', ip_wan: 'd.ip_wan', device: 'd.genieacs_device_id',
    };
    const orderColumn = sortColumns[sortBy] || sortColumns.status;
    const orderDirection = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const where = [];
    const params = [];
    if (status && status !== 'all') { where.push('d.status = ?'); params.push(status); }
    if (odp && odp !== 'all') { where.push('c.odp = ?'); params.push(odp); }
    if (signal === 'excellent') where.push("d.status = 'online' AND d.rx_power >= -20");
    if (signal === 'fair') where.push("d.status = 'online' AND d.rx_power >= -25 AND d.rx_power < -20");
    if (signal === 'poor') where.push("d.status = 'online' AND d.rx_power < -25");
     if (search) {
       where.push('(c.name LIKE ? OR c.pppoe_username LIKE ? OR d.serial LIKE ? OR d.model LIKE ? OR d.genieacs_device_id LIKE ?)');
      const like = `%${search}%`;
       params.push(like, like, like, like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await q(
       `SELECT COUNT(*) n FROM devices d ${CUSTOMER_JOIN} ${w}`,
      params
    );
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const rows = await q(
      `SELECT d.*,
              CASE WHEN d.genieacs_device_id LIKE '%-%-%'
                THEN SUBSTRING_INDEX(SUBSTRING_INDEX(d.genieacs_device_id, '-', -2), '-', 1)
                ELSE d.model END AS model,
              CASE WHEN d.genieacs_device_id LIKE '%-%-%'
                THEN SUBSTRING_INDEX(d.genieacs_device_id, '-', -1)
                ELSE d.serial END AS serial,
              COALESCE(d.pppoe_username, c.pppoe_username) AS pppoe_username,
              CASE WHEN d.pppoe_username IS NOT NULL AND d.pppoe_username <> '' THEN 'genieacs'
                WHEN c.pppoe_username IS NOT NULL AND c.pppoe_username <> '' THEN 'customer' ELSE NULL END AS pppoe_source,
              c.id linked_customer_id, c.name customer_name, c.code customer_code, c.address, c.phone
       FROM devices d ${CUSTOMER_JOIN}
        ${w} ORDER BY ${orderColumn} ${orderDirection}, d.id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );
    const summary = await q(
      `SELECT COUNT(*) total,
              SUM(d.status = 'online' AND d.rx_power >= -20) excellent,
              SUM(d.status = 'online' AND d.rx_power >= -25 AND d.rx_power < -20) fair,
              SUM(d.status = 'online' AND d.rx_power < -25) poor,
              SUM(d.status = 'offline') offline
       FROM devices d`
    );
     const odps = await q(`SELECT DISTINCT c.odp FROM devices d ${CUSTOMER_JOIN} WHERE c.odp IS NOT NULL AND c.odp <> '' ORDER BY c.odp`);
    res.json({
      rows: rows.map((row) => ({ ...row, temperature: normalizeStoredTemperature(row.temperature) })),
      total: num(total[0]?.n), stats: summary[0], odps: odps.map((row) => row.odp),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/devices/clients?ids=1,2 — jumlah klien WiFi terbaru dari GenieACS untuk halaman tabel. */
r.get('/clients', can('devices'), async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',');
    if (!ids.length || ids.length > 50 || ids.some((id) => !/^[1-9]\d*$/.test(id))) {
      return res.status(400).json({ message: 'ID perangkat tidak valid (maksimal 50)' });
    }
    const devices = await q('SELECT id, genieacs_device_id FROM devices WHERE id IN (?)', [[...new Set(ids)]]);
    const results = [];
    // Batasi permintaan simultan agar halaman tabel tidak membebani GenieACS.
    for (let i = 0; i < devices.length; i += 5) {
      const batch = await Promise.all(devices.slice(i, i + 5).map(async (dev) => {
        try {
          const raw = await genieacs.fetchDevice(dev.genieacs_device_id);
          return { id: dev.id, wifi_clients: raw ? genieacs.wifiClientCount(raw) : null };
        } catch {
          return { id: dev.id, wifi_clients: null };
        }
      }));
      results.push(...batch);
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** Validasi path TR-069 — penulisan parameter hanya boleh pada objek WANPPPConnection/WLANConfiguration */
const WAN_PPP_PATH_RE = /^(InternetGatewayDevice|Device)\.WANDevice\.\d+\.WANConnectionDevice\.\d+\.WANPPPConnection\.\d+$/;
const WLAN_PATH_RE = /^(InternetGatewayDevice|Device)\.LANDevice\.\d+\.WLANConfiguration\.\d+$/;

/** GET /api/devices/:id/active-devices — monitor asosiasi WiFi pada ONT. */
r.get('/:id/active-devices', can('devices'), async (req, res) => {
  try {
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ message: 'ID perangkat tidak valid' });
    const dev = (await q('SELECT genieacs_device_id FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    const raw = await genieacs.fetchDevice(dev.genieacs_device_id);
    if (!raw) return res.status(502).json({ message: 'Perangkat tidak ditemukan di GenieACS' });
    const overview = genieacs.normalizeDevice(raw);
    res.json({ count: genieacs.wifiClientCount(raw), devices: genieacs.activeWifiDevices(raw),
      temperature: overview.temperature, rx_power: overview.rx_power, last_inform: raw._lastInform || null });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** GET /api/devices/:id/detail — konfigurasi lengkap ONT dari GenieACS (halaman Setting ONT) */
r.get('/:id/detail', can('devices'), async (req, res) => {
  try {
    const dev = (await q(
      `SELECT d.id, d.genieacs_device_id, d.serial, d.model, d.firmware, d.status, d.rx_power, d.tx_power,
              d.temperature, d.uptime, d.ip_pppoe, d.ip_wan, d.pppoe_username, d.last_inform, d.last_sync,
              c.id linked_customer_id, c.name customer_name, c.code customer_code, c.address, c.phone
       FROM devices d ${CUSTOMER_JOIN} WHERE d.id = ?`,
      [req.params.id]
    ))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    const raw = await genieacs.fetchDevice(dev.genieacs_device_id);
    if (!raw) return res.status(502).json({ message: 'Perangkat tidak ditemukan di GenieACS' });
    dev.temperature = normalizeStoredTemperature(dev.temperature);
    res.json({ device: dev, detail: genieacs.parseDeviceDetail(raw) });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** PUT /api/devices/:id/wan-ppp — ubah kredensial PPPoE pada instance WANPPPConnection tertentu */
r.put('/:id/wan-ppp', can('devices', 'edit'), async (req, res) => {
  try {
    const { path, username, password, vlan, vlanEnabled } = req.body || {};
    if (!path || !WAN_PPP_PATH_RE.test(path)) return res.status(400).json({ message: 'Path WANPPPConnection tidak valid' });
    const uname = String(username ?? '').trim();
    if (!uname) return res.status(400).json({ message: 'Username PPPoE wajib diisi' });
    if (uname.length > 128 || /[\u0000-\u001F\u007F]/.test(uname)) return res.status(400).json({ message: 'Username PPPoE tidak valid' });
    if (password != null && /[\u0000-\u001F\u007F]/.test(String(password))) return res.status(400).json({ message: 'Password PPPoE tidak boleh mengandung karakter kontrol' });
    let vlanValue;
    if (vlan !== undefined && vlan !== null && String(vlan).trim() !== '') {
      if (!/^\d+$/.test(String(vlan).trim())) return res.status(400).json({ message: 'VLAN ID harus angka 0-4094' });
      const n = Number(vlan);
      if (!Number.isInteger(n) || n < 0 || n > 4094) return res.status(400).json({ message: 'VLAN ID harus angka 0-4094' });
      vlanValue = n;
    }
    if (typeof vlanEnabled !== 'boolean') return res.status(400).json({ message: 'Status VLAN harus enable atau disable' });
    const dev = (await q('SELECT id, serial, genieacs_device_id FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    await genieacs.setWanPpp(dev.genieacs_device_id, path, { username: uname, password, vlan: vlanValue, vlanEnabled });
    await exec('UPDATE devices SET pppoe_username = ? WHERE id = ?', [uname, req.params.id]);
    await exec(
      'UPDATE customers SET pppoe_username = ? WHERE ont_serial = ? OR genieacs_device_id = ?',
      [uname, dev.serial || null, dev.genieacs_device_id]
    );
    await logActivity({ req, action: 'devices.wan_ppp', module: 'devices', description: `Ubah kredensial PPPoE ${dev.serial} → ${uname} (${path}) via GenieACS` });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** POST /api/devices/:id/wan — buat koneksi WAN baru (PPPoE / Bridge) di ONT via GenieACS */
r.post('/:id/wan', can('devices', 'edit'), async (req, res) => {
  try {
    const { type = 'ppp', name, vlan, vlanEnabled, username, password, bindings } = req.body || {};
    if (!['ppp', 'bridge'].includes(type)) return res.status(400).json({ message: 'Tipe WAN harus ppp atau bridge' });
    const wanName = String(name ?? '').trim();
    const uname = String(username ?? '').trim();
    const passwd = String(password ?? '');
    if (wanName.length > 64 || /[\u0000-\u001F\u007F]/.test(wanName)) return res.status(400).json({ message: 'Nama koneksi WAN tidak valid' });
    if (type === 'ppp' && !uname) return res.status(400).json({ message: 'PPP Username wajib diisi' });
    if (uname.length > 128 || /[\u0000-\u001F\u007F]/.test(uname)) return res.status(400).json({ message: 'PPP Username tidak valid' });
    if (passwd.length > 128 || /[\u0000-\u001F\u007F]/.test(passwd)) return res.status(400).json({ message: 'PPP Password tidak valid' });
    if (typeof vlanEnabled !== 'boolean') return res.status(400).json({ message: 'Status VLAN harus enable atau disable' });
    const vlanText = String(vlan ?? '').trim();
    if (vlanEnabled && (!/^\d+$/.test(vlanText) || Number(vlanText) > 4094)) {
      return res.status(400).json({ message: 'VLAN ID wajib berupa angka 0-4094 saat VLAN enable' });
    }
    const dev = (await q('SELECT id, serial, genieacs_device_id FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    const result = await genieacs.createWanConnection(dev.genieacs_device_id, {
      type, name: wanName, vlan: vlanEnabled ? Number(vlanText) : undefined, vlanEnabled,
      username: uname, password: passwd,
      bindings: Array.isArray(bindings) ? [...new Set(bindings.filter((path) => typeof path === 'string'))].slice(0, 32) : [],
    });
    await logActivity({ req, action: 'devices.wan_add', module: 'devices', description: `Tambah WAN ${type.toUpperCase()} "${result.name}" di ${dev.serial} (${result.instance_path}) via GenieACS` });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** DELETE /api/devices/:id/wan — hapus koneksi WAN di ONT via GenieACS */
r.delete('/:id/wan', can('devices', 'edit'), async (req, res) => {
  try {
    const { path } = req.body || {};
    const WAN_OBJ_PATH_RE = /^(InternetGatewayDevice|Device)\.WANDevice\.\d+\.WANConnectionDevice\.\d+\.WAN(?:IP|PPP)Connection\.\d+$/;
    if (!path || !WAN_OBJ_PATH_RE.test(path)) return res.status(400).json({ message: 'Path koneksi WAN tidak valid' });
    const dev = (await q('SELECT id, serial, genieacs_device_id FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    const raw = await genieacs.fetchDevice(dev.genieacs_device_id);
    const detail = raw ? genieacs.parseDeviceDetail(raw) : null;
    const entry = detail ? [...detail.wan_ip, ...detail.wan_ppp].find((w) => w.base_path === path) : null;
    if (!entry) return res.status(404).json({ message: 'Koneksi WAN tidak ditemukan di GenieACS' });
    if (entry.management || /tr069/i.test(`${entry.name} ${entry.service || ''}`)) {
      return res.status(400).json({ message: 'Koneksi manajemen TR-069 tidak boleh dihapus' });
    }
    await genieacs.deleteWanConnection(dev.genieacs_device_id, path);
    await logActivity({ req, action: 'devices.wan_delete', module: 'devices', description: `Hapus WAN "${entry.name}" di ${dev.serial} (${path}) via GenieACS` });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** POST /api/devices/sync — sinkron dan rekonsiliasi daftar dari GenieACS */
export function syncDevicesHandler({ acs = genieacs, transaction = tx, audit = logActivity } = {}) {
 return async (req, res) => {
  const record = async (entry) => {
    try { await audit(entry); } catch { console.error('ONT sync audit write failed'); }
  };
  try {
    // Penghapusan lokal hanya boleh terjadi setelah GenieACS mengembalikan daftar penuh.
    const devices = await acs.fetchDevices();
    const synced = devices.length;
    const removed = await transaction(async (conn) => {
      for (const dev of devices) {
        await conn.execute(
          `INSERT INTO devices (genieacs_device_id, serial, model, firmware, status, ssid, wifi_clients, rx_power, tx_power, temperature, uptime, ip_pppoe, ip_wan, pppoe_username, last_inform, last_sync)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE serial=VALUES(serial), model=VALUES(model), firmware=VALUES(firmware),
             status=VALUES(status), ssid=VALUES(ssid), wifi_clients=VALUES(wifi_clients), rx_power=VALUES(rx_power), tx_power=VALUES(tx_power),
             temperature=VALUES(temperature), uptime=VALUES(uptime), ip_pppoe=VALUES(ip_pppoe), ip_wan=VALUES(ip_wan),
             pppoe_username=COALESCE(VALUES(pppoe_username), pppoe_username),
             last_inform=VALUES(last_inform), last_sync=VALUES(last_sync)`,
           [dev.genieacs_device_id, dev.serial, dev.model, dev.firmware, dev.status, dev.ssid, dev.wifi_clients,
            dev.rx_power, dev.tx_power, dev.temperature, dev.uptime, dev.ip_pppoe, dev.ip_wan, dev.wan_ppp_username,
            dev.last_inform, nowLocal()]
        );
        if (dev.serial) {
          await conn.execute(
            'UPDATE devices d JOIN customers c ON c.ont_serial = d.serial OR c.genieacs_device_id = d.genieacs_device_id SET d.customer_id = c.id WHERE d.genieacs_device_id = ?',
            [dev.genieacs_device_id]
          );
        }
        if (dev.wan_ppp_username) {
          await conn.execute(
            'UPDATE customers SET pppoe_username = ? WHERE ont_serial = ? OR genieacs_device_id = ?',
            [dev.wan_ppp_username, dev.serial || null, dev.genieacs_device_id]
          );
        }
      }

      const genieacsIds = new Set(devices.map((dev) => dev.genieacs_device_id));
      const [local] = await conn.query('SELECT id, genieacs_device_id FROM devices');
      const staleIds = local
        .filter((dev) => !genieacsIds.has(dev.genieacs_device_id))
        .map((dev) => dev.id);
      if (!staleIds.length) return 0;

      const placeholders = staleIds.map(() => '?').join(',');
      // Bersihkan eksplisit agar instalasi lama tanpa foreign-key cascade tetap konsisten.
      await conn.query(`DELETE FROM devices_ping WHERE device_id IN (${placeholders})`, staleIds);
      await conn.query(`DELETE FROM devices_history WHERE device_id IN (${placeholders})`, staleIds);
      const [result] = await conn.query(`DELETE FROM devices WHERE id IN (${placeholders})`, staleIds);
      if (result.affectedRows !== staleIds.length) throw new Error('Penghapusan perangkat lokal tidak lengkap');
      return result.affectedRows;
    });

    await record({ req, action: 'devices.sync', module: 'devices', description: `Sinkronisasi ${synced} perangkat via GenieACS${removed ? `; hapus ${removed} perangkat yang sudah tidak ada` : ''}` });
    res.json({ synced, removed });
  } catch (err) {
    await record({ req, action: 'devices.sync.failed', module: 'devices', description: `Sinkronisasi GenieACS gagal: ${err.message}` });
    res.status(502).json({ message: `Sinkronisasi GenieACS gagal: ${err.message}` });
  }
 };
}
r.post('/sync', can('devices', 'edit'), syncDevicesHandler());

/** Shared web/mobile handler: never poll periodic informs inside an HTTP request. */
export function syncDeviceHandler({ query = q, execute = exec, acs = genieacs, audit = logActivity } = {}) {
 return async (req, res) => {
   let commandStatus = 'not_submitted';
   let taskId = null;
   // Audit failure must not turn an accepted command into a retryable failure.
   const record = async (entry) => {
     try { await audit(entry); } catch { console.error('ONT sync audit write failed'); }
   };
  try {
    const dev = (await query('SELECT id, serial, genieacs_device_id FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    if (!dev.genieacs_device_id) return res.status(400).json({ message: 'Perangkat belum memiliki ID GenieACS — tambahkan/tautkan perangkat dahulu' });

    commandStatus = 'unknown';
    const task = await acs.summonDevice(dev.genieacs_device_id);
    taskId = task?._id || null;
    if (![200, 202].includes(task?._httpStatus) || !taskId) throw new Error('Invalid GenieACS task response');
    commandStatus = task._httpStatus === 200 ? 'completed' : 'queued';
    if (commandStatus === 'queued') {
      await record({ req, action: 'devices.summon', module: 'devices', description: `Summon ${dev.genieacs_device_id}: queued; task ${taskId}` });
      return res.status(202).json({ ok: true, responded: false, command_status: commandStatus, task_id: taskId,
        retry_safe: false, last_inform: null,
        message: 'Perintah sinkron diterima dan antre di GenieACS. Segarkan detail ONT setelah inform berikutnya; jangan kirim ulang.' });
    }

    // 5) ONT merespons → ambil data lengkap terbaru & perbarui DB
    //    (field sama dengan sinkronisasi massal POST /devices/sync)
    const raw = await acs.fetchDevice(dev.genieacs_device_id);
    if (!raw) {
      throw new Error('Device readback unavailable');
    }
    const norm = acs.normalizeDevice(raw);
    await execute(
       `UPDATE devices SET serial = ?, model = ?, firmware = ?, status = ?, ssid = ?, wifi_clients = ?, rx_power = ?, tx_power = ?,
       temperature = ?, uptime = ?, ip_pppoe = ?, ip_wan = ?,
       pppoe_username = COALESCE(?, pppoe_username), last_inform = ?, last_sync = ?
       WHERE id = ?`,
       [norm.serial, norm.model, norm.firmware, norm.status, norm.ssid, norm.wifi_clients, norm.rx_power, norm.tx_power,
        norm.temperature, norm.uptime, norm.ip_pppoe, norm.ip_wan,
        norm.wan_ppp_username, norm.last_inform, nowLocal(), req.params.id]
    );
    if (norm.wan_ppp_username) {
      await execute(
        'UPDATE customers SET pppoe_username = ? WHERE ont_serial = ? OR genieacs_device_id = ?',
        [norm.wan_ppp_username, norm.serial || dev.serial || null, dev.genieacs_device_id]
      );
    }
    if (norm.serial) {
      await execute(
        'UPDATE devices d JOIN customers c ON c.ont_serial = d.serial OR c.genieacs_device_id = d.genieacs_device_id SET d.customer_id = c.id WHERE d.id = ?',
        [req.params.id]
      );
    }

    await record({ req, action: 'devices.summon', module: 'devices', description: `Summon perangkat ${dev.genieacs_device_id} via GenieACS — ONT merespons; task ${taskId}` });
    res.json({
      ok: true,
      command_status: commandStatus, task_id: taskId, retry_safe: false,
      responded: true,
      last_inform: norm.last_inform,
      device: {
        serial: norm.serial, model: norm.model, firmware: norm.firmware, status: norm.status,
        rx_power: norm.rx_power, temperature: norm.temperature, uptime: norm.uptime, ip_pppoe: norm.ip_pppoe,
      },
      message: 'Summon berhasil — ONT merespons dan mengirim inform terbaru.',
    });
  } catch (err) {
    await record({ req, action: 'devices.summon.failed', module: 'devices', description: `ONT ${req.params.id}: ${commandStatus}; task ${taskId || '-'}; code ${err.code || err.statusCode || 'internal'}` });
    const completed = commandStatus === 'completed';
    res.status(commandStatus === 'not_submitted' ? 500 : 502).json({
      ok: false, responded: completed, command_status: commandStatus, task_id: taskId, retry_safe: false,
      code: completed ? 'ONT_SYNC_READBACK_FAILED' : commandStatus === 'unknown' ? 'ONT_SYNC_STATUS_UNKNOWN' : 'ONT_SYNC_FAILED',
      message: completed
        ? 'Perintah selesai di GenieACS, tetapi pembaruan data lokal gagal. Segarkan detail ONT; jangan kirim ulang.'
        : commandStatus === 'unknown'
          ? 'Status perintah sinkron belum dapat dipastikan. Segarkan detail ONT dan minta administrator memeriksa task GenieACS sebelum mengirim ulang.'
          : 'Sinkron ONT belum dikirim. Minta administrator memeriksa layanan backend.',
    });
  }
 };
}
r.post('/:id/sync', can('devices', 'edit'), syncDeviceHandler());

/** GET /api/devices/:id/ping-gateway — ping gateway IP WAN ONT.
 *  Gateway diambil dari parameter GenieACS; fallback ke IP PPPoE terdaftar. */
r.get('/:id/ping-gateway', can('devices'), async (req, res) => {
  try {
    const dev = (await q('SELECT * FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });

    // 1) Gateway IP WAN dari server GenieACS
    let target = null;
    let source = null;
    try {
      const raw = await genieacs.fetchDevice(dev.genieacs_device_id);
      target = genieacs.extractWanGateway(raw);
      if (target) source = 'genieacs';
    } catch { /* GenieACS tak terjangkau — lanjut fallback */ }

    // 2) Fallback: IP PPPoE terdaftar di DB
    if (!target && dev.ip_pppoe && genieacs.isValidIp(dev.ip_pppoe)) {
      target = dev.ip_pppoe;
      source = 'db:ip_pppoe';
    }
    if (!target) {
      return res.json({ ok: false, target: null, latency_ms: null, source: null, message: 'Gateway IP WAN tidak ditemukan — lakukan summon ONT agar parameter terbaca GenieACS' });
    }

    // 3) Ping gateway dari server aplikasi + catat riwayat
    const { ok, latency } = await pingHost(target);
    await exec('INSERT INTO devices_ping (device_id, target, ok, latency_ms) VALUES (?,?,?,?)',
      [dev.id, target, ok ? 1 : 0, latency]);
    res.json({
      ok,
      target,
      latency_ms: latency,
      source,
      message: ok ? `Gateway merespons dalam ${latency} ms` : 'Gateway tidak merespons ping dari server',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/devices/:id/ping-history — riwayat ping terakhir (grafik kualitas koneksi) */
r.get('/:id/ping-history', can('devices'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT ok, latency_ms, target, created_at FROM devices_ping
       WHERE device_id = ? ORDER BY id DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ rows: rows.reverse() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/devices/ping-batch — ping banyak perangkat sekaligus
 *  (target cepat: IP PPPoE terdaftar di DB, paralel maks 5 proses) */
r.post('/ping-batch', can('devices'), async (req, res) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean).slice(0, 50);
    if (!ids.length) return res.json({ results: [] });
    const devs = await q(`SELECT id, ip_pppoe FROM devices WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    const results = [];
    const queue = [...devs];
    async function worker() {
      while (queue.length) {
        const d = queue.shift();
        if (!d.ip_pppoe || !genieacs.isValidIp(d.ip_pppoe)) {
          results.push({ id: d.id, ok: false, target: null, latency_ms: null });
          continue;
        }
        const { ok, latency } = await pingHost(d.ip_pppoe);
        await exec('INSERT INTO devices_ping (device_id, target, ok, latency_ms) VALUES (?,?,?,?)',
          [d.id, d.ip_pppoe, ok ? 1 : 0, latency]);
        results.push({ id: d.id, ok, target: d.ip_pppoe, latency_ms: latency });
      }
    }
    await Promise.all(Array.from({ length: Math.min(5, queue.length) || 1 }, worker));
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/devices/alerts — sinyal optik di bawah ambang (PRD 5.6) */
r.get('/alerts', can('devices'), async (req, res) => {
  try {
    const s = await getSettings(true);
    const threshold = num(s.low_signal_threshold) || -25;
    const rows = await q(
      `SELECT d.*, c.name customer_name, c.code customer_code, c.phone
       FROM devices d ${CUSTOMER_JOIN}
       WHERE d.rx_power < ? ORDER BY d.rx_power ASC`,
      [threshold]
    );
    res.json({ rows, threshold });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/devices/:id/reboot — remote reboot (PRD 5.6) */
r.post('/:id/reboot', can('devices', 'edit'), async (req, res) => {
  try {
    const dev = (await q('SELECT * FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    if (!dev.genieacs_device_id) return res.status(400).json({ message: 'Perangkat belum memiliki ID GenieACS' });
    await genieacs.rebootDevice(dev.genieacs_device_id);
    await logActivity({ req, action: 'devices.reboot', module: 'devices', description: `Reboot perangkat ${dev.serial} (${dev.model}) via GenieACS` });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** POST /api/devices/:id/summon-ssid — jalankan provision SSID-LIST GenieACS. */
r.post('/:id/summon-ssid', can('devices', 'edit'), async (req, res) => {
  try {
    const dev = (await q('SELECT id, serial, genieacs_device_id FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    if (!dev.genieacs_device_id) return res.status(400).json({ message: 'Perangkat belum memiliki ID GenieACS' });
    await genieacs.summonSsidList(dev.genieacs_device_id);
    await logActivity({ req, action: 'devices.summon_ssid', module: 'devices', description: `Summon provision SSID-LIST ${dev.serial} via GenieACS` });
    res.json({ ok: true, message: 'Summon SSID-LIST berhasil dikirim ke GenieACS.' });
  } catch (err) {
    res.status(502).json({ message: `Summon SSID-LIST gagal: ${err.message}` });
  }
});

r.post('/:id/wifi', can('devices', 'edit'), async (req, res) => {
  try {
    // Validasi standar WiFi: SSID maks 32 karakter tanpa karakter kontrol, password WPA2 8-63 karakter
    const ssid = String(req.body?.ssid ?? '').trim();
    const password = String(req.body?.password ?? '');
    const { path } = req.body || {};
    if (!ssid) return res.status(400).json({ message: 'SSID WiFi wajib diisi' });
    if (ssid.length > 32) return res.status(400).json({ message: 'SSID maksimal 32 karakter' });
    if (/[\u0000-\u001F\u007F]/.test(ssid)) return res.status(400).json({ message: 'SSID tidak boleh mengandung karakter kontrol' });
    if (password.length < 8) return res.status(400).json({ message: 'Password WiFi minimal 8 karakter' });
    if (password.length > 63) return res.status(400).json({ message: 'Password WiFi maksimal 63 karakter (batas WPA2)' });
    let wlanPath = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1';
    if (path) {
      if (!WLAN_PATH_RE.test(path)) return res.status(400).json({ message: 'Path WLANConfiguration tidak valid' });
      wlanPath = path;
    }
    const dev = (await q('SELECT * FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    await genieacs.setWifi(dev.genieacs_device_id, ssid, password, wlanPath);
    await exec('UPDATE devices SET ssid = ?, wifi_password = ? WHERE id = ?', [ssid, password, req.params.id]);
    await logActivity({ req, action: 'devices.wifi', module: 'devices', description: `Ubah WiFi ${dev.serial} → SSID ${ssid} (${wlanPath}) via GenieACS` });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** POST /api/devices/:id/wifi-enable — aktifkan/nonaktifkan SSID WiFi ONT
 *  (WLANConfiguration.{i}.Enable) via GenieACS */
r.post('/:id/wifi-enable', can('devices', 'edit'), async (req, res) => {
  try {
    const { path, enable } = req.body || {};
    if (!path || !WLAN_PATH_RE.test(path)) return res.status(400).json({ message: 'Path WLANConfiguration tidak valid' });
    if (typeof enable !== 'boolean') return res.status(400).json({ message: 'Parameter enable wajib boolean (true/false)' });
    const dev = (await q('SELECT id, serial, model, genieacs_device_id FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    await genieacs.setWifiEnable(dev.genieacs_device_id, path, enable);
    await logActivity({
      req,
      action: 'devices.wifi_enable',
      module: 'devices',
      description: `${enable ? 'Aktifkan' : 'Nonaktifkan'} SSID WiFi ${dev.serial} (${path}) via GenieACS`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** POST /api/devices/:id/reset — factory reset ONT (PRD 5.6) */
r.post('/:id/reset', can('devices', 'edit'), async (req, res) => {
  try {
    const dev = (await q('SELECT * FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    if (!dev.genieacs_device_id) return res.status(400).json({ message: 'Perangkat belum memiliki ID GenieACS' });
    await genieacs.resetDevice(dev.genieacs_device_id);
    await logActivity({ req, action: 'devices.reset', module: 'devices', description: `Factory reset perangkat ${dev.serial} (${dev.model}) via GenieACS` });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** PUT /api/devices/:id/account — ganti akun login web ONT (superadmin/user) via GenieACS */
r.put('/:id/account', can('devices', 'edit'), async (req, res) => {
  try {
    const { path, username, password, level } = req.body || {};
    if (!path || !genieacs.ACCOUNT_PATH_RE.test(path)) return res.status(400).json({ message: 'Path akun ONT tidak valid' });
    if (level && !['super', 'user'].includes(level)) return res.status(400).json({ message: 'Level akun tidak valid' });
    const uname = String(username ?? '').trim();
    if (!uname && !password) return res.status(400).json({ message: 'Isi username atau password baru terlebih dahulu' });
    if (uname) {
      if (uname.length < 3 || uname.length > 32) return res.status(400).json({ message: 'Username akun ONT harus 3-32 karakter' });
      if (/[\s\u0000-\u001F\u007F]/.test(uname)) return res.status(400).json({ message: 'Username tidak boleh mengandung spasi atau karakter kontrol' });
    }
    if (password) {
      if (String(password).length < 4 || String(password).length > 64) return res.status(400).json({ message: 'Password akun ONT harus 4-64 karakter' });
      if (/[\u0000-\u001F\u007F]/.test(String(password))) return res.status(400).json({ message: 'Password tidak boleh mengandung karakter kontrol' });
    }
    const dev = (await q('SELECT id, serial, model, genieacs_device_id FROM devices WHERE id = ?', [req.params.id]))[0];
    if (!dev) return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
    const lvl = level === 'super' ? 'super' : 'user';
    await genieacs.setUserAccount(dev.genieacs_device_id, path, { username: uname, password, level: lvl });
    await logActivity({
      req,
      action: 'devices.account',
      module: 'devices',
      description: `Ubah akun login ONT ${dev.serial} (${dev.model}) — ${path} [${lvl === 'super' ? 'superadmin' : 'user'}]: username${password ? ' + password' : ''} via GenieACS`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ message: `GenieACS gagal dihubungi: ${err.message}` });
  }
});

/** GET /api/devices/:id/history — riwayat parameter perangkat */
r.get('/:id/history', can('devices'), async (req, res) => {
  try {
    const rows = await q(
      'SELECT status, rx_power, tx_power, recorded_at FROM devices_history WHERE device_id = ? ORDER BY recorded_at DESC LIMIT 100',
      [req.params.id]
    );
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;

