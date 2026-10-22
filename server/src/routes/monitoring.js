import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity, num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import * as monitoring from '../services/monitoring.js';

const r = Router();

/** GET /api/monitoring/interfaces — interface MikroTik untuk pilihan traffic */
r.get('/interfaces', can('monitoring'), async (req, res) => {
  try {
    const router = await monitoring.getActiveRouter();
    if (!router) return res.status(502).json({ message: 'Tidak ada router aktif' });
    res.json({ router: { id: router.id, name: router.name }, rows: await monitoring.listInterfaces() });
  } catch (err) {
    res.status(502).json({ message: `Tidak dapat mengambil interface Mikrotik: ${err.message}` });
  }
});

/** GET /api/monitoring/traffic?interface=ether1 — counter interface MikroTik */
r.get('/traffic', can('monitoring'), async (req, res) => {
  try {
    const name = String(req.query.interface || '').trim();
    if (!name) return res.status(400).json({ message: 'Interface wajib dipilih' });
    res.json(await monitoring.getInterfaceTraffic(name));
  } catch (err) {
    res.status(502).json({ message: `Tidak dapat mengambil traffic Mikrotik: ${err.message}` });
  }
});

/** GET /api/monitoring/summary */
r.get('/summary', can('monitoring'), async (req, res) => {
  try {
    res.json(await monitoring.getSummary());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/monitoring/sync — tarik sesi terbaru dari MikroTik sekarang */
r.post('/sync', can('monitoring', 'edit'), async (req, res) => {
  try {
    res.json(await monitoring.sync());
  } catch (err) {
    res.status(502).json({ message: `Sinkronisasi MikroTik gagal: ${err.message}` });
  }
});

/** GET /api/monitoring/routers — daftar ringkas router untuk filter sesi */
r.get('/routers', can('monitoring'), async (req, res) => {
  try {
    const rows = await q('SELECT id, name FROM routers ORDER BY name ASC');
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/monitoring/sessions — daftar sesi PPPoE (filter status/pencarian/router, sort, pagination) */
r.get('/sessions', can('monitoring'), async (req, res) => {
  try {
    const { status = 'all', q: search, router, sort, dir, page = 1, limit = 25 } = req.query;
    const data = await monitoring.getSessions({ status, q: search, router, sort, dir, page, limit });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/monitoring/aggregate — seri realtime untuk grafik */
r.get('/aggregate', can('monitoring'), async (req, res) => {
  try {
    const snap = await monitoring.getSnapshot();
    res.json({ series: snap.series, topSessions: snap.topSessions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/monitoring/action — disconnect/isolir/activate (PRD 5.3) */
r.post('/action', can('monitoring', 'edit'), async (req, res) => {
  try {
    const { username, action } = req.body || {};
    if (!username || !['disconnect', 'isolir', 'activate'].includes(action)) {
      return res.status(400).json({ message: 'Parameter aksi tidak valid' });
    }
    const result = await monitoring.doAction(username, action, req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/monitoring/customer/:id/history — log naik-turun koneksi */
r.get('/customer/:id/history', can('monitoring'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT event, ip, logged_at FROM connection_logs WHERE customer_id = ?
       ORDER BY logged_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/monitoring/customer/:id/usage — trafik harian */
r.get('/customer/:id/usage', can('monitoring'), async (req, res) => {
  try {
    const days = Math.min(90, Number(req.query.days) || 30);
    const rows = await q(
      `SELECT d, download_bytes, upload_bytes FROM usage_daily
       WHERE customer_id = ? AND d >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY d ASC`,
      [req.params.id, days]
    );
    res.json({ rows: rows.map((x) => ({ d: x.d, download: num(x.download_bytes), upload: num(x.upload_bytes) })) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
