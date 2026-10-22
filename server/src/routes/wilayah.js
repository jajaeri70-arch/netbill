import { Router } from 'express';
import { can } from '../middleware/auth.js';

const r = Router();

/**
 * Proxy master data wilayah Indonesia (kode Permendagri) — sumber: wilayah.id.
 * Dipakai form pelanggan untuk cascading dropdown Provinsi → Kota → Kecamatan → Desa.
 * Cache in-memory 24 jam agar tidak membebani upstream; saat upstream gagal,
 * cache basi tetap dipakai bila tersedia.
 */
const UPSTREAM = 'https://wilayah.id/api';
const TTL_OK = 24 * 60 * 60 * 1000; // 24 jam
const TTL_ERR = 60 * 1000; // 1 menit untuk error (hindari membanjiri upstream)
const cache = new Map(); // key → { at, ttl, rows?, err? }

async function fetchWilayah(path, key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) {
    if (hit.err) throw new Error(hit.err);
    return hit.rows;
  }
  try {
    const res = await fetch(`${UPSTREAM}/${path}`);
    if (!res.ok) throw new Error(`upstream merespons ${res.status}`);
    const json = await res.json();
    const rows = (json.data || []).map((x) => ({ code: String(x.code), name: String(x.name) }));
    cache.set(key, { at: Date.now(), ttl: TTL_OK, rows });
    return rows;
  } catch (err) {
    if (hit?.rows) return hit.rows; // fallback cache basi
    cache.set(key, { at: Date.now(), ttl: TTL_ERR, err: err.message });
    throw new Error(`Gagal mengambil data wilayah: ${err.message}`);
  }
}

/** GET /api/wilayah/provinsi — seluruh provinsi Indonesia */
r.get('/provinsi', can('customers'), async (req, res) => {
  try {
    const rows = await fetchWilayah('provinces.json', 'provinsi');
    res.json({ rows });
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
});

/** GET /api/wilayah/kota/:prov — kabupaten/kota dalam satu provinsi */
r.get('/kota/:prov', can('customers'), async (req, res) => {
  try {
    const prov = req.params.prov;
    if (!/^\d{2}$/.test(prov)) return res.status(400).json({ message: 'Kode provinsi tidak valid' });
    const rows = await fetchWilayah(`regencies/${prov}.json`, `kota:${prov}`);
    res.json({ rows });
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
});

/** GET /api/wilayah/kecamatan/:kota — kecamatan dalam satu kabupaten/kota */
r.get('/kecamatan/:kota', can('customers'), async (req, res) => {
  try {
    const kota = req.params.kota;
    if (!/^\d{2}\.\d{2}$/.test(kota)) return res.status(400).json({ message: 'Kode kabupaten/kota tidak valid' });
    const rows = await fetchWilayah(`districts/${kota}.json`, `kec:${kota}`);
    res.json({ rows });
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
});

/** GET /api/wilayah/desa/:kec — desa/kelurahan dalam satu kecamatan */
r.get('/desa/:kec', can('customers'), async (req, res) => {
  try {
    const kec = req.params.kec;
    if (!/^\d{2}\.\d{2}\.\d{2}$/.test(kec)) return res.status(400).json({ message: 'Kode kecamatan tidak valid' });
    const rows = await fetchWilayah(`villages/${kec}.json`, `desa:${kec}`);
    res.json({ rows });
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
});

export default r;
