import { Router } from 'express';
import multer from 'multer';
import { q, exec, tx } from '../db.js';
import { logActivity, num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import * as mt from '../services/mikrotik.js';
import config from '../config.js';

const r = Router();
const liveTrafficState = new Map(); // username -> counter interface terakhir

function pathDistanceMeters(path) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const [lat1, lng1] = path[i - 1];
    const [lat2, lng2] = path[i];
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    total += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

/** Upload JSON peta (memory storage — file kecil, tidak perlu simpan ke disk) */
const jsonUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

let schemaReady;
/** Pastikan tabel titik peta pelanggan & izin menu tersedia (migrasi runtime — pola banks.js) */
export async function ensureMappingSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await exec(`CREATE TABLE IF NOT EXISTS map_points (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(11,7) NOT NULL,
        address VARCHAR(255) NULL,
        note VARCHAR(255) NULL,
        marker_type VARCHAR(20) NOT NULL DEFAULT 'customer',
        customer_id INT UNSIGNED NULL,
        device_id INT UNSIGNED NULL,
        created_by INT UNSIGNED NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_map_customer (customer_id),
        INDEX idx_map_device (device_id)
      ) ENGINE=InnoDB`);
      // Kolom hasil impor file peta eksternal (kompatibel format network-map JSON)
      for (const [column, ddl] of [
        ['external_id', "ALTER TABLE map_points ADD COLUMN external_id VARCHAR(64) NULL AFTER created_by"],
        ['capacity', 'ALTER TABLE map_points ADD COLUMN capacity INT UNSIGNED NULL AFTER external_id'],
        ['splitter', 'ALTER TABLE map_points ADD COLUMN splitter VARCHAR(20) NULL AFTER capacity'],
        ['google_place_id', 'ALTER TABLE map_points ADD COLUMN google_place_id VARCHAR(255) NULL AFTER splitter'],
        ['google_name', 'ALTER TABLE map_points ADD COLUMN google_name VARCHAR(255) NULL AFTER google_place_id'],
        ['google_address', 'ALTER TABLE map_points ADD COLUMN google_address VARCHAR(255) NULL AFTER google_name'],
        ['google_synced_at', 'ALTER TABLE map_points ADD COLUMN google_synced_at TIMESTAMP NULL AFTER google_address'],
      ]) {
        const exists = await q(
          "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'map_points' AND COLUMN_NAME = ?",
          [column]
        );
        if (!Number(exists[0]?.n)) await exec(ddl);
      }
      // Jalur fiber antar titik (hasil impor edges file peta: drop/distribution/odp_to_odp)
      await exec(`CREATE TABLE IF NOT EXISTS map_links (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        source_id INT UNSIGNED NOT NULL,
        target_id INT UNSIGNED NOT NULL,
        fiber_type VARCHAR(20) NOT NULL DEFAULT 'drop',
        distance DECIMAL(12,2) NULL,
        waypoints LONGTEXT NULL,
        notes VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_link_source (source_id),
        INDEX idx_link_target (target_id)
      ) ENGINE=InnoDB`);
      // Izin menu mapping: owner penuh (null), admin & teknisi kelola titik
      await exec(
        `INSERT IGNORE INTO role_permissions (role, menu, can_view, can_create, can_edit, can_delete, can_export)
         VALUES ('admin','mapping',1,1,1,1,0), ('teknisi','mapping',1,1,1,1,0)`
      );
    })().catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

async function syncGooglePlace(point) {
  if (!config.googleMapsApiKey) throw new Error('GOOGLE_MAPS_API_KEY belum dikonfigurasi');
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.googleMapsApiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({
      includedTypes: ['point_of_interest'],
      maxResultCount: 1,
      locationRestriction: {
        circle: { center: { latitude: Number(point.latitude), longitude: Number(point.longitude) }, radius: 100 },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Google Places merespons ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const place = (await response.json()).places?.[0];
  await exec(
    'UPDATE map_points SET google_place_id=?, google_name=?, google_address=?, google_synced_at=NOW() WHERE id=?',
    [place?.id || null, place?.displayName?.text || null, place?.formattedAddress || null, point.id]
  );
  return place;
}

/** GET /api/mapping — daftar titik peta + status perangkat GenieACS terkait + jalur fiber */
r.get('/', can('mapping'), async (req, res) => {
  try {
    await ensureMappingSchema();
    // Baca counter interface PPPoE langsung dari MikroTik. pppoe_sessions hanya fallback saat router gagal.
    let liveBytes = new Map();
    let activeByUsername = new Map();
    try {
      const router = await mt.getActiveRouter();
      if (router) {
        const [active, interfaces] = await Promise.all([
          mt.listPppActive(router),
          mt.listPppoeSessionBytes(router),
        ]);
        activeByUsername = new Map(active
          .filter((item) => mt.normalizePppoeUsername(item.username))
          .map((item) => [mt.normalizePppoeUsername(item.username), item]));
        liveBytes = interfaces;
      }
    } catch (err) {
      console.warn('[mapping] data PPPoE live gagal:', err.message);
    }
    const rows = await q(
      `SELECT m.*, c.name AS customer_name, c.phone AS customer_phone, c.status AS customer_status,
              c.address AS customer_address, COALESCE(NULLIF(c.pppoe_username, ''), NULLIF(d.pppoe_username, '')) AS pppoe_username, p.name AS package_name,
              d.id AS device_row_id, d.serial, d.model, d.status AS device_status, d.rx_power,
              d.ip_pppoe, d.ip_wan, d.last_inform, d.uptime, d.genieacs_device_id,
              ps.rx_rate AS stored_download_bps, ps.tx_rate AS stored_upload_bps,
              ps.rx_bytes AS stored_download_bytes, ps.tx_bytes AS stored_upload_bytes
         FROM map_points m
         LEFT JOIN customers c ON c.id = m.customer_id
         LEFT JOIN packages p ON p.id = c.package_id
         LEFT JOIN devices d ON d.id = m.device_id
         LEFT JOIN pppoe_sessions ps ON ps.username = c.pppoe_username
        ORDER BY m.created_at DESC, m.id DESC`
    );
    for (const row of rows) {
      const username = mt.normalizePppoeUsername(row.pppoe_username) || '';
      const active = activeByUsername.get(username);
      const live = liveBytes.get(username);
      const now = Date.now();
      const previous = liveTrafficState.get(username);
      const seconds = previous ? Math.max((now - previous.at) / 1000, 1) : 0;
      const download = Number(active?.download_bytes || live?.download_byte || 0);
      const upload = Number(active?.upload_bytes || live?.upload_byte || 0);
      const deltaDownload = previous && download >= previous.download ? Math.round((download - previous.download) * 8 / seconds) : 0;
      const deltaUpload = previous && upload >= previous.upload ? Math.round((upload - previous.upload) * 8 / seconds) : 0;
      row.download_bps = Number(active?.download_bps || deltaDownload || row.stored_download_bps || 0);
      row.upload_bps = Number(active?.upload_bps || deltaUpload || row.stored_upload_bps || 0);
      if (active || live) liveTrafficState.set(username, { download, upload, at: now });
      // Total pemakaian harus sama dengan Traffic Counter di Monitoring PPPoE.
      row.usage_download_bytes = Number(row.stored_download_bytes || 0);
      row.usage_upload_bytes = Number(row.stored_upload_bytes || 0);
    }
    const links = await q(
      `SELECT l.*, m1.latitude AS s_lat, m1.longitude AS s_lng, m1.name AS s_name, m1.marker_type AS s_type,
              m2.latitude AS t_lat, m2.longitude AS t_lng, m2.name AS t_name, m2.marker_type AS t_type
         FROM map_links l
         LEFT JOIN map_points m1 ON m1.id = l.source_id
         LEFT JOIN map_points m2 ON m2.id = l.target_id
        ORDER BY l.id ASC`
    );
    res.json({ rows, links });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/mapping/sources — kandidat sumber titik: pelanggan berkoordinat & perangkat ONT (GenieACS) */
r.get('/sources', can('mapping'), async (req, res) => {
  try {
    await ensureMappingSchema();
    const customers = await q(
      `SELECT c.id, c.name, c.code, c.address, c.latitude, c.longitude, c.pppoe_username, c.ont_serial,
              p.name AS package_name
         FROM customers c LEFT JOIN packages p ON p.id = c.package_id
        ORDER BY c.name ASC`
    );
    const devices = await q(
      `SELECT d.id, d.serial, d.model, d.status, d.rx_power, d.genieacs_device_id, d.pppoe_username
         FROM devices d ORDER BY d.status ASC, d.serial ASC`
    );
    res.json({ customers, devices });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/mapping/stats — ringkasan titik & status perangkat (GenieACS) */
r.get('/stats', can('mapping'), async (req, res) => {
  try {
    await ensureMappingSchema();
    const total = await q('SELECT COUNT(*) n FROM map_points');
    const online = await q(
      `SELECT COUNT(*) n FROM map_points m JOIN devices d ON d.id = m.device_id WHERE d.status = 'online'`
    );
    const offline = await q(
      `SELECT COUNT(*) n FROM map_points m JOIN devices d ON d.id = m.device_id WHERE d.status = 'offline'`
    );
    const unpinned = await q(
      `SELECT COUNT(*) n FROM customers c LEFT JOIN map_points m ON m.customer_id = c.id
        WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL AND m.id IS NULL`
    );
    res.json({
      total: num(total[0]?.n),
      online: num(online[0]?.n),
      offline: num(offline[0]?.n),
      unpinned: num(unpinned[0]?.n),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/mapping/google-sync — cari nama/alamat Google Places dekat titik. Nama internal tidak diubah. */
r.post('/google-sync', can('mapping', 'edit'), async (req, res) => {
  try {
    await ensureMappingSchema();
    const requestedId = req.body?.point_id;
    const points = requestedId
      ? await q('SELECT id, name, latitude, longitude FROM map_points WHERE id = ?', [requestedId])
      : await q('SELECT id, name, latitude, longitude FROM map_points ORDER BY id ASC LIMIT 50');
    if (requestedId && !points[0]) return res.status(404).json({ message: 'Titik peta tidak ditemukan' });
    let synced = 0;
    let found = 0;
    for (const point of points) {
      const place = await syncGooglePlace(point);
      synced += 1;
      if (place) found += 1;
    }
    await logActivity({ req, action: 'mapping.google.sync', module: 'mapping', description: `Sinkron Google Places: ${synced} titik, ${found} tempat ditemukan` });
    res.json({ ok: true, synced, found, limited: !requestedId && points.length === 50 });
  } catch (err) {
    res.status(err.message === 'GOOGLE_MAPS_API_KEY belum dikonfigurasi' ? 400 : 502).json({ message: err.message });
  }
});

/** POST /api/mapping — tambah titik peta */
r.post('/', can('mapping', 'create'), async (req, res) => {
  try {
    await ensureMappingSchema();
    const b = req.body || {};
    const type = ['customer', 'odp', 'odc', 'router', 'poi'].includes(b.marker_type) ? b.marker_type : 'customer';
    let name = String(b.name || '').trim();
    if (type === 'customer') {
      if (!b.customer_id) return res.status(400).json({ message: 'Pilih pelanggan untuk titik pelanggan' });
      const customer = (await q('SELECT name FROM customers WHERE id = ?', [b.customer_id]))[0];
      if (!customer) return res.status(400).json({ message: 'Pelanggan tidak ditemukan' });
      name = String(customer.name || '').trim();
    }
    const category = type === 'poi' ? String(b.category || '').trim() : '';
    if (type === 'poi' && !category) return res.status(400).json({ message: 'Kategori POI wajib dipilih' });
    const lat = Number(b.latitude);
    const lng = Number(b.longitude);
    if (!name) return res.status(400).json({ message: 'Nama titik wajib diisi' });
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return res.status(400).json({ message: 'Latitude tidak valid (-90 s/d 90)' });
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ message: 'Longitude tidak valid (-180 s/d 180)' });
    const result = await exec(
      `INSERT INTO map_points (name, latitude, longitude, address, note, marker_type, customer_id, device_id, created_by, external_id, capacity, splitter, google_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name, lat, lng, b.address || null, b.note || null, type,
        b.customer_id || null, b.device_id || null, req.user?.id || null,
        b.external_id || null, b.capacity ? Number(b.capacity) : null, b.splitter || null, category || null]
    );
    await logActivity({ req, action: 'mapping.create', module: 'mapping', description: `Menambah titik peta ${name} (${lat}, ${lng})` });
    res.json({ id: result.insertId, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/mapping/links — tambah kabel antara dua titik peta */
r.post('/links', can('mapping', 'create'), async (req, res) => {
  try {
    await ensureMappingSchema();
    const b = req.body || {};
    const sourceId = Number(b.source_id);
    const targetId = Number(b.target_id);
    const fiberTypes = new Set(['drop', 'distribution', 'odp_to_odp', 'feeder']);
    if (!Number.isInteger(sourceId) || !Number.isInteger(targetId) || sourceId === targetId) {
      return res.status(400).json({ message: 'Titik awal dan tujuan kabel tidak valid' });
    }
    const points = await q(
      `SELECT p.id, p.name, p.marker_type, p.capacity,
              (SELECT COUNT(*) FROM map_links l WHERE l.source_id = p.id) AS used_slots
         FROM map_points p WHERE p.id IN (?, ?)`,
      [sourceId, targetId]
    );
    if (points.length !== 2) return res.status(404).json({ message: 'Titik awal atau tujuan tidak ditemukan' });
    const fullOdp = points.find((point) => point.id === sourceId
      && point.marker_type === 'odp'
      && Number(point.capacity) > 0
      && Number(point.used_slots) >= Number(point.capacity));
    if (fullOdp) return res.status(409).json({ message: `Slot ODP "${fullOdp.name}" sudah penuh` });
    const duplicate = (await q(
      'SELECT id FROM map_links WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)',
      [sourceId, targetId, targetId, sourceId]
    ))[0];
    if (duplicate) return res.status(409).json({ message: 'Kabel antara kedua titik sudah tersedia' });
    const fiberType = fiberTypes.has(b.fiber_type) ? b.fiber_type : 'drop';
    const distance = Number(b.distance);
    let waypoints = null;
    if (b.waypoints !== undefined) {
      if (!Array.isArray(b.waypoints) || b.waypoints.length < 2 || b.waypoints.length > 100) {
        return res.status(400).json({ message: 'Jalur kabel harus berisi 2 s/d 100 koordinat' });
      }
      waypoints = b.waypoints.map((point) => [Number(point?.[0]), Number(point?.[1])]);
      if (waypoints.some(([lat, lng]) => !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
        return res.status(400).json({ message: 'Koordinat jalur kabel tidak valid' });
      }
    }
    const result = await exec(
      'INSERT INTO map_links (source_id, target_id, fiber_type, distance, waypoints, notes) VALUES (?,?,?,?,?,?)',
      [sourceId, targetId, fiberType, Number.isFinite(distance) && distance > 0 ? distance : null,
        waypoints ? JSON.stringify(waypoints) : null, b.notes ? String(b.notes).trim().slice(0, 255) : null]
    );
    const source = points.find((p) => p.id === sourceId)?.name;
    const target = points.find((p) => p.id === targetId)?.name;
    await logActivity({ req, action: 'mapping.link.create', module: 'mapping', description: `Menambah kabel ${source} → ${target}` });
    res.json({ id: result.insertId, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/mapping/links/:id — hapus kabel / line */
r.delete('/links/:id', can('mapping', 'delete'), async (req, res) => {
  try {
    await ensureMappingSchema();
    const old = (await q(
      `SELECT l.id, l.fiber_type, s.name AS source_name, t.name AS target_name
         FROM map_links l
         LEFT JOIN map_points s ON s.id = l.source_id
         LEFT JOIN map_points t ON t.id = l.target_id
        WHERE l.id = ?`,
      [req.params.id]
    ))[0];
    if (!old) return res.status(404).json({ message: 'Kabel / line tidak ditemukan' });
    await exec('DELETE FROM map_links WHERE id = ?', [old.id]);
    await logActivity({
      req,
      action: 'mapping.link.delete',
      module: 'mapping',
      description: `Menghapus kabel ${old.source_name || '?'} → ${old.target_name || '?'}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/mapping/:id — ubah titik (termasuk geser koordinat dari peta) */
r.put('/:id', can('mapping', 'edit'), async (req, res) => {
  try {
    await ensureMappingSchema();
    const old = (await q('SELECT * FROM map_points WHERE id = ?', [req.params.id]))[0];
    if (!old) return res.status(404).json({ message: 'Titik peta tidak ditemukan' });
    const b = req.body || {};
    const customerId = b.customer_id !== undefined ? (b.customer_id || null) : old.customer_id;
    let name = String(b.name ?? old.name).trim();
    const category = old.marker_type === 'poi' ? String(b.category ?? old.google_name ?? '').trim() : '';
    if (old.marker_type === 'poi' && !category) return res.status(400).json({ message: 'Kategori POI wajib dipilih' });
    if (old.marker_type === 'customer') {
      if (!customerId) return res.status(400).json({ message: 'Pilih pelanggan untuk titik pelanggan' });
      const customer = (await q('SELECT name FROM customers WHERE id = ?', [customerId]))[0];
      if (!customer) return res.status(400).json({ message: 'Pelanggan tidak ditemukan' });
      name = String(customer.name || '').trim();
    }
    const lat = b.latitude !== undefined ? Number(b.latitude) : Number(old.latitude);
    const lng = b.longitude !== undefined ? Number(b.longitude) : Number(old.longitude);
    if (!name) return res.status(400).json({ message: 'Nama titik wajib diisi' });
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return res.status(400).json({ message: 'Latitude tidak valid (-90 s/d 90)' });
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ message: 'Longitude tidak valid (-180 s/d 180)' });
    if (old.marker_type === 'odp' && b.capacity !== undefined && b.capacity) {
      const used = (await q('SELECT COUNT(*) n FROM map_links WHERE source_id = ?', [old.id]))[0];
      if (Number(b.capacity) < Number(used?.n)) {
        return res.status(409).json({ message: `Kapasitas tidak boleh kurang dari ${used.n} slot yang sedang terpakai` });
      }
    }
    await exec(
      `UPDATE map_points SET name=?, latitude=?, longitude=?, address=?, note=?, customer_id=?, device_id=?, capacity=?, splitter=?, google_name=? WHERE id=?`,
      [name, lat, lng,
        b.address !== undefined ? (b.address || null) : old.address,
        b.note !== undefined ? (b.note || null) : old.note,
        customerId,
        b.device_id !== undefined ? (b.device_id || null) : old.device_id,
        b.capacity !== undefined ? (b.capacity ? Number(b.capacity) : null) : old.capacity,
        b.splitter !== undefined ? (b.splitter || null) : old.splitter,
        old.marker_type === 'poi' ? category : old.google_name,
        old.id]
    );

    // Endpoint kabel mengikuti titik perangkat saat koordinat titik berubah.
    const relatedLinks = await q(
      'SELECT id, source_id, target_id, waypoints FROM map_links WHERE source_id = ? OR target_id = ?',
      [old.id, old.id]
    );
    for (const link of relatedLinks) {
      if (!link.waypoints) continue;
      let path;
      try { path = JSON.parse(link.waypoints); } catch { continue; }
      if (!Array.isArray(path) || path.length < 2) continue;
      path = path.map((point) => [Number(point[0]), Number(point[1])]);
      if (Number(link.source_id) === Number(old.id)) path[0] = [lat, lng];
      if (Number(link.target_id) === Number(old.id)) path[path.length - 1] = [lat, lng];
      await exec('UPDATE map_links SET waypoints=?, distance=? WHERE id=?',
        [JSON.stringify(path), pathDistanceMeters(path), link.id]);
    }

    await logActivity({ req, action: 'mapping.update', module: 'mapping', description: `Mengubah titik peta ${old.name} → ${name}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/mapping/:id — hapus titik */
r.delete('/:id', can('mapping', 'delete'), async (req, res) => {
  try {
    await ensureMappingSchema();
    const old = (await q('SELECT * FROM map_points WHERE id = ?', [req.params.id]))[0];
    if (!old) return res.status(404).json({ message: 'Titik peta tidak ditemukan' });
    await tx(async (conn) => {
      await conn.query('DELETE FROM map_links WHERE source_id = ? OR target_id = ?', [old.id, old.id]);
      await conn.query('DELETE FROM map_points WHERE id = ?', [old.id]);
    });
    await logActivity({ req, action: 'mapping.delete', module: 'mapping', description: `Menghapus titik peta ${old.name} beserta kabel terkait` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/mapping/import-customers — buat titik otomatis dari pelanggan berkoordinat (link perangkat GenieACS) */
r.post('/import-customers', can('mapping', 'create'), async (req, res) => {
  try {
    await ensureMappingSchema();
    const list = await q(
      `SELECT c.id, c.name, c.address, c.latitude, c.longitude FROM customers c
        WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL`
    );
    const linked = await q(
      `SELECT d.id AS device_id, c2.id AS customer_id FROM devices d
         LEFT JOIN customers c2 ON c2.id = (
           SELECT c3.id FROM customers c3
           WHERE (d.customer_id IS NOT NULL AND c3.id = d.customer_id)
              OR (d.pppoe_username IS NOT NULL AND d.pppoe_username <> '' AND c3.pppoe_username = d.pppoe_username)
              OR (d.genieacs_device_id IS NOT NULL AND c3.genieacs_device_id = d.genieacs_device_id)
              OR (d.serial IS NOT NULL AND d.serial <> '' AND c3.ont_serial = d.serial)
           ORDER BY (c3.id = d.customer_id) DESC, c3.id DESC LIMIT 1
         ) WHERE c2.id IS NOT NULL`
    );
    const deviceByCustomer = {};
    linked.forEach((l) => { deviceByCustomer[l.customer_id] = l.device_id; });
    let created = 0;
    for (const c of list) {
      const dup = await q('SELECT id FROM map_points WHERE customer_id = ?', [c.id]);
      if (dup[0]) continue;
      await exec(
        `INSERT INTO map_points (name, latitude, longitude, address, marker_type, customer_id, device_id, created_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [c.name, c.latitude, c.longitude, c.address || null, 'customer', c.id,
          deviceByCustomer[c.id] || null, req.user?.id || null]
      );
      created++;
    }
    await logActivity({ req, action: 'mapping.import', module: 'mapping', description: `Impor otomatis ${created} titik pelanggan berkoordinat (link perangkat GenieACS)` });
    res.json({ created, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** Proses edges file peta → baris map_links (resolve titik via external_id, dedup pasangan) */
async function importLinks(edges, extMap, summary) {
  const FIBER_TYPES = new Set(['drop', 'distribution', 'odp_to_odp', 'feeder']);
  const resolvePoint = async (extId) => {
    if (!extId) return null;
    if (extMap.has(extId)) return extMap.get(extId);
    const row = (await q('SELECT id FROM map_points WHERE external_id = ?', [String(extId).slice(0, 64)]))[0];
    const id = row?.id || null;
    if (id) extMap.set(extId, id);
    return id;
  };
  for (const edge of edges) {
    try {
      const sourceId = await resolvePoint(edge?.source);
      const targetId = await resolvePoint(edge?.target);
      if (!sourceId || !targetId || sourceId === targetId) { summary.links_skipped++; continue; }
      const dup = (await q('SELECT id FROM map_links WHERE source_id = ? AND target_id = ?', [sourceId, targetId]))[0]
        || (await q('SELECT id FROM map_links WHERE source_id = ? AND target_id = ?', [targetId, sourceId]))[0];
      if (dup) { summary.links_skipped++; continue; }
      const d = edge?.data || {};
      const fiberType = FIBER_TYPES.has(String(d.fiberType).toLowerCase()) ? String(d.fiberType).toLowerCase() : 'drop';
      const distance = Number(d.distance) > 0 ? Number(d.distance) : null;
      const waypoints = Array.isArray(d.waypoints) ? JSON.stringify(d.waypoints) : null;
      await exec(
        'INSERT INTO map_links (source_id, target_id, fiber_type, distance, waypoints, notes) VALUES (?,?,?,?,?,?)',
        [sourceId, targetId, fiberType, distance, waypoints, d.notes ? String(d.notes).slice(0, 255) : null]
      );
      summary.links_created++;
    } catch (e) {
      summary.errors.push(`Jalur fiber ${edge?.id}: ${e.message}`);
    }
  }
}

/** POST /api/mapping/import-json — impor file peta eksternal (format network-map: nodes + edges).
 *  Kompatibel jenis node: odc/odp/ont/customer/router; ONT otomatis di-link ke pelanggan &
 *  perangkat via username PPPoE / serial number (integrasi GenieACS). Dedup idempoten. */
r.post('/import-json', can('mapping', 'create'), jsonUpload.single('file'), async (req, res) => {
  try {
    await ensureMappingSchema();
    let data;
    if (req.file?.buffer) {
      try { data = JSON.parse(req.file.buffer.toString('utf8')); }
      catch { return res.status(400).json({ message: 'File bukan JSON yang valid' }); }
    } else {
      data = req.body || {};
    }
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const edges = Array.isArray(data.edges) ? data.edges : [];
    if (!nodes.length) return res.status(400).json({ message: 'File tidak berisi daftar titik (nodes)' });

    // Pemetaan jenis node file → jenis titik aplikasi
    const TYPE_MAP = { odc: 'odc', odp: 'odp', splitter: 'odp', ont: 'customer', customer: 'customer', router: 'router', server: 'router', pop: 'router' };
    const FIBER_TYPES = new Set(['drop', 'distribution', 'odp_to_odp', 'feeder']);

    // Indeks pelanggan & perangkat untuk auto-link titik ONT (pppoe / serial)
    const custRows = await q('SELECT id, pppoe_username, ont_serial FROM customers');
    const devRows = await q('SELECT id, pppoe_username, serial FROM devices');
    const custByPppoe = new Map(), devByPppoe = new Map(), devBySerial = new Map();
    for (const c of custRows) { if (c.pppoe_username) custByPppoe.set(c.pppoe_username, c.id); }
    for (const d of devRows) {
      if (d.pppoe_username) devByPppoe.set(d.pppoe_username, d.id);
      if (d.serial) devBySerial.set(d.serial, d.id);
    }

    const summary = { nodes_created: 0, nodes_skipped: 0, links_created: 0, links_skipped: 0, errors: [] };
    const extMap = new Map(); // external node id → map_points.id

    for (const node of nodes) {
      try {
        const d = node?.data || {};
        const name = String(d.name || node.id || '').trim().slice(0, 120) || 'Tanpa Nama';
        const lat = Number(d.latitude);
        const lng = Number(d.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          summary.errors.push(`${name}: koordinat tidak valid — dilewati`);
          continue;
        }
        const type = TYPE_MAP[String(node.type || d.type || '').toLowerCase()] || 'customer';
        const externalId = String(node.id || '').trim().slice(0, 64) || null;
        const pppoe = d.pppoe ? String(d.pppoe).trim() : '';
        const serial = d.serialnumber ? String(d.serialnumber).trim() : '';
        const customerId = pppoe ? (custByPppoe.get(pppoe) || null) : null;
        const deviceId = (pppoe && devByPppoe.get(pppoe)) || (serial && devBySerial.get(serial)) || null;
        const capacity = Number(d.capacity) > 0 ? Math.floor(Number(d.capacity)) : null;
        const splitter = d.splitter ? String(d.splitter).trim().slice(0, 20) : null;
        const note = d.notes ? String(d.notes).trim().slice(0, 255) : null;

        // Idempoten: 1) external_id  2) pelanggan sudah dipetakan  3) nama + koordinat sama
        let existing = externalId ? (await q('SELECT id FROM map_points WHERE external_id = ?', [externalId]))[0] : null;
        if (!existing && type === 'customer' && customerId) {
          existing = (await q('SELECT id FROM map_points WHERE customer_id = ?', [customerId]))[0];
        }
        if (!existing) {
          existing = (await q(
            'SELECT id FROM map_points WHERE name = ? AND ABS(latitude - ?) < 0.00001 AND ABS(longitude - ?) < 0.00001',
            [name, lat, lng]
          ))[0];
        }
        if (existing) {
          summary.nodes_skipped++;
          if (externalId) extMap.set(externalId, existing.id);
          continue;
        }

        const result = await exec(
          `INSERT INTO map_points (name, latitude, longitude, note, marker_type, customer_id, device_id, created_by, external_id, capacity, splitter)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [name, lat, lng, note, type, customerId, deviceId, req.user?.id || null, externalId, capacity, splitter]
        );
        summary.nodes_created++;
        if (externalId) extMap.set(externalId, result.insertId);
      } catch (e) {
        summary.errors.push(`Node "${node?.data?.name || node?.id}": ${e.message}`);
      }
    }

    await importLinks(edges, extMap, summary);
    await logActivity({
      req, action: 'mapping.import_json', module: 'mapping',
      description: `Impor file peta JSON: ${summary.nodes_created} titik dibuat, ${summary.nodes_skipped} dilewati, ${summary.links_created} jalur fiber (${summary.links_skipped} dilewati)`,
    });
    res.json({ ...summary, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;