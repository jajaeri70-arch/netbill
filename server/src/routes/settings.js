import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import { encrypt, mask } from '../utils/crypto.js';
import { upload } from '../utils/upload.js';
import { getMobileApiKeyStatus, rotateMobileApiKey } from '../services/mobileApiKey.js';
import { getMiberConfiguration, miberConfigurationStatus, testMiberConnection } from '../services/whatsapp.js';

const r = Router();

const SECRET_KEYS = ['genieacs_pass', 'wa_token'];

/** GET /api/settings */
r.get('/', can('settings'), async (req, res) => {
  try {
    const rows = await q('SELECT skey, svalue FROM settings ORDER BY skey');
    const out = {};
    rows.forEach((row) => {
      out[row.skey] = SECRET_KEYS.includes(row.skey) ? mask(row.svalue) : row.svalue;
    });
    res.json({ settings: out });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/settings — khusus owner (PRD 5.1) */
r.put('/', can('settings', 'edit'), async (req, res) => {
  try {
    const body = req.body || {};
    for (const [k, v] of Object.entries(body)) {
      // Nilai bertanda mask tidak diubah
      if (SECRET_KEYS.includes(k) && /^••••/.test(String(v))) continue;
      const value = SECRET_KEYS.includes(k) && v ? encrypt(v) : v;
      await exec(
        'INSERT INTO settings (skey, svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)',
        [k, value === undefined || value === null ? '' : String(value)]
      );
    }
    await logActivity({ req, action: 'settings.update', module: 'settings', description: `Memperbarui ${Object.keys(body).length} pengaturan` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/settings/mobile-api-key — plaintext key tidak pernah dapat dibaca ulang. */
r.get('/mobile-api-key', can('settings'), async (req, res) => {
  try {
    res.json(await getMobileApiKeyStatus());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/settings/mobile-api-key/rotate — key baru hanya tampil sekali. */
r.post('/mobile-api-key/rotate', can('settings', 'edit'), async (req, res) => {
  try {
    const result = await rotateMobileApiKey(req.user.id, req.body?.grace_hours ?? 24);
    await logActivity({ req, action: 'settings.mobile_api_key.rotate', module: 'settings', description: `Merotasi API key mobile; grace ${result.grace_hours} jam` });
    res.status(201).json({ ...result, message: 'Salin API key sekarang; nilainya tidak dapat dilihat lagi' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

/** GET /api/settings/miber — hanya metadata environment, tanpa API key. */
r.get('/miber', can('settings'), (req, res) => {
  getMiberConfiguration().then((miber) => res.json(miberConfigurationStatus(miber))).catch((err) => res.status(500).json({ message: err.message }));
});

/** PUT /api/settings/miber — API key terenkripsi dan tidak pernah dikembalikan. */
r.put('/miber', can('settings', 'edit'), async (req, res) => {
  try {
    const { base_url, api_key, whatsapp_account_id, language_code } = req.body || {};
    if (base_url !== undefined) {
      try {
        const url = new URL(String(base_url));
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        return res.status(400).json({ message: 'Base URL Miber harus URL HTTP atau HTTPS valid' });
      }
    }
    const values = {};
    if (base_url !== undefined) values.miber_base_url = String(base_url).trim().replace(/\/$/, '');
    if (whatsapp_account_id !== undefined) values.miber_whatsapp_account_id = String(whatsapp_account_id).trim();
    if (language_code !== undefined) values.miber_language_code = String(language_code).trim() || 'id';
    if (api_key) values.miber_api_key = encrypt(String(api_key).trim());
    for (const [key, value] of Object.entries(values)) {
      await exec('INSERT INTO settings (skey, svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)', [key, value]);
    }
    await logActivity({ req, action: 'settings.miber.update', module: 'settings', description: 'Memperbarui konfigurasi MiberConnect' });
    res.json(miberConfigurationStatus(await getMiberConfiguration(true)));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/settings/miber/test — validasi kredensial tanpa mengirim pesan. */
r.post('/miber/test', can('settings', 'edit'), async (req, res) => {
  const result = await testMiberConnection();
  await logActivity({
    req,
    action: 'settings.miber.test',
    module: 'settings',
    description: result.ok ? 'Tes koneksi MiberConnect berhasil' : `Tes koneksi MiberConnect gagal: ${result.message}`,
  });
  res.status(result.ok ? 200 : 400).json(result);
});

/** POST /api/settings/logo */
r.post('/logo', can('settings', 'edit'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File logo wajib diunggah' });
    const path = `/uploads/${req.file.filename}`;
    await exec(
      'INSERT INTO settings (skey, svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)',
      ['logo_url', path]
    );
    await logActivity({ req, action: 'settings.logo', module: 'settings', description: 'Mengunggah logo perusahaan' });
    res.json({ ok: true, path });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
