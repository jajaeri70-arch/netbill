import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity, num, getSettings } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import { decrypt, mask, encrypt } from '../utils/crypto.js';
import * as mt from '../services/mikrotik.js';

const r = Router();

/** GET /api/routers — daftar router Mikrotik */
r.get('/', can('routers'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT r.*, (SELECT COUNT(*) FROM nas n WHERE n.nasname = r.host) AS nas_registered
       FROM routers r ORDER BY r.id`
    );
    res.json({
      rows: rows.map((x) => ({
        ...x,
        api_pass: mask(decrypt(x.api_pass) || ''),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/routers */
r.post('/', can('routers', 'create'), async (req, res) => {
  try {
    const { name, host, port, api_user, api_pass, location, scheme, auto_isolate, isolate_action, isolate_profile } = req.body || {};
    if (!name || !host || !api_user) return res.status(400).json({ message: 'Nama, host & user API wajib diisi' });
    await mt.ensureRoutersSchema();
    const result = await exec(
      'INSERT INTO routers (name, host, port, scheme, api_user, api_pass, location, auto_isolate, isolate_action, isolate_profile) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [name, host, Number(port) || 81, scheme === 'https' ? 'https' : 'http', api_user, encryptPass(api_pass), location || null,
        Number(auto_isolate) === 0 ? 0 : 1, // default YA
        isolate_action === 'disable' ? 'disable' : 'profile',
        normIsolateProfile(isolate_profile)]
    );
    await logActivity({ req, action: 'routers.create', module: 'routers', description: `Menambah router ${name} (${host})` });
    res.json({ id: result.insertId, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/routers/:id */
r.put('/:id', can('routers', 'edit'), async (req, res) => {
  try {
    const { name, host, port, api_user, api_pass, location, is_active, scheme, auto_isolate, isolate_action, isolate_profile } = req.body || {};
    const old = (await q('SELECT * FROM routers WHERE id = ?', [req.params.id]))[0];
    if (!old) return res.status(404).json({ message: 'Router tidak ditemukan' });
    await mt.ensureRoutersSchema();
    await exec(
      'UPDATE routers SET name=?, host=?, port=?, scheme=?, api_user=?, api_pass=?, location=?, is_active=?, auto_isolate=?, isolate_action=?, isolate_profile=? WHERE id=?',
      [name ?? old.name, host ?? old.host, port ?? old.port,
        scheme === 'http' || scheme === 'https' ? scheme : (old.scheme || 'http'),
        api_user ?? old.api_user, api_pass ? encryptPass(api_pass) : old.api_pass,
        location ?? old.location, is_active !== undefined ? is_active : old.is_active,
        auto_isolate !== undefined ? (Number(auto_isolate) ? 1 : 0) : (Number(old.auto_isolate) ? 1 : 0),
        isolate_action === 'profile' || isolate_action === 'disable' ? isolate_action : (String(old.isolate_action) === 'disable' ? 'disable' : 'profile'),
        isolate_profile !== undefined ? normIsolateProfile(isolate_profile) : normIsolateProfile(old.isolate_profile),
        req.params.id]
    );
    await logActivity({ req, action: 'routers.update', module: 'routers', description: `Mengubah router #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/routers/:id */
r.delete('/:id', can('routers', 'delete'), async (req, res) => {
  try {
    await exec('DELETE FROM routers WHERE id = ?', [req.params.id]);
    await logActivity({ req, action: 'routers.delete', module: 'routers', description: `Menghapus router #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/routers/:id/test — uji koneksi RouterOS REST */
r.post('/:id/test', can('routers', 'edit'), async (req, res) => {
  try {
    const router = (await q('SELECT * FROM routers WHERE id = ?', [req.params.id]))[0];
    if (!router) return res.status(404).json({ message: 'Router tidak ditemukan' });
    try {
      const resource = await mt.systemResource(router);
      if (!resource.version) {
        await exec('UPDATE routers SET status = "offline" WHERE id = ?', [router.id]);
        return res.status(502).json({ ok: false, message: 'Server merespons tetapi bukan RouterOS REST API (gunakan port www 80 / www-ssl 443, bukan API biner 8728/8729).' });
      }
      await exec('UPDATE routers SET status = "online", last_seen = NOW() WHERE id = ?', [router.id]);
      res.json({ ok: true, resource });
    } catch (err) {
      await exec('UPDATE routers SET status = "offline" WHERE id = ?', [router.id]);
      res.status(502).json({ ok: false, message: err.message });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/routers/:id/resources — monitoring resource router (PRD 5.5) */
r.get('/:id/resources', can('routers'), async (req, res) => {
  try {
    const router = (await q('SELECT * FROM routers WHERE id = ?', [req.params.id]))[0];
    if (!router) return res.status(404).json({ message: 'Router tidak ditemukan' });
    try {
      const resource = await mt.systemResource(router);
      res.json({ ok: true, mode: 'real', resource });
    } catch (err) {
      await exec('UPDATE routers SET status = "offline" WHERE id = ?', [router.id]);
      res.status(502).json({ ok: false, message: `Tidak dapat mengambil resource Mikrotik: ${err.message}` });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function encryptPass(plain) {
  return plain ? encrypt(plain) : null;
}

/** Normalisasi Profile Isolir (Auto Isolir per server) — default "isolir" */
function normIsolateProfile(v) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 100) : 'isolir';
}

// =====================================================
// Server Mikrotik — input manual & integrasi RouterOS API
// =====================================================

async function findRouter(id) {
  const rows = await q('SELECT * FROM routers WHERE id = ?', [id]);
  return rows[0] || null;
}

function rateFromSpeed(speed) {
  const m = String(speed || '').match(/(\d+(?:\.\d+)?)/);
  return m ? `${m[1]}M/${m[1]}M` : '1M/1M';
}

/** POST /probe — verifikasi kredensial server manual SEBELUM disimpan */
r.post('/probe', can('routers', 'create'), async (req, res) => {
  try {
    const { host, port, api_user, api_pass, scheme, id } = req.body || {};
    if (!host || !api_user) return res.status(400).json({ ok: false, message: 'Host & API user wajib diisi' });
    // Mode Edit: password boleh dikosongkan — gunakan password tersimpan agar
    // "Tes Koneksi" tetap menguji kredensial yang benar (HTTP 401 jika diabaikan).
    let passEnc = encrypt(api_pass || '');
    if (!passEnc && id) {
      const saved = (await q('SELECT api_pass FROM routers WHERE id = ?', [id]))[0];
      if (saved && saved.api_pass) passEnc = saved.api_pass;
    }
    const pseudo = {
      host,
      port: Number(port) || 81,
      api_user,
      api_pass: passEnc,
      scheme: scheme === 'https' ? 'https' : 'http',
    };
    const resource = await mt.systemResource(pseudo);
    const identity = await mt.getIdentity(pseudo);
    if (!identity && !resource.version) {
      return res.status(502).json({ ok: false,
        message: 'Server merespons tetapi bukan RouterOS REST API. Gunakan port 80 (service www) atau 443 (www-ssl) — port API biner 8728/8729 bukan REST.' });
    }
    await logActivity({ req, action: 'routers.probe', module: 'routers', description: `Probe manual ${pseudo.scheme}://${host}:${pseudo.port} OK (${identity})` });
    res.json({ ok: true, scheme: pseudo.scheme, identity, resource });
  } catch (err) {
    res.status(502).json({ ok: false, message: probeErrorMessage(err) });
  }
});

/** Terjemahkan error teknis koneksi RouterOS menjadi pesan yang mudah dipahami */
function probeErrorMessage(err) {
  const code = String(err?.code || '');
  const raw = String(err?.message || err || '');
  if (/HTTP 401/.test(raw)) return 'Kredensial API ditolak oleh router (HTTP 401 Unauthorized). Periksa kembali API User & Password RouterOS, atau isi ulang password.';
  if (/HTTP 403/.test(raw)) return 'Akses ditolak router (HTTP 403). Pastikan user API memiliki hak akses (policy) yang memadai di RouterOS.';
  if (/HTTP 404/.test(raw)) return 'Endpoint REST tidak ditemukan (HTTP 404). Pastikan RouterOS v7+ dengan service www/www-ssl aktif.';
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(raw)) return 'Koneksi ditolak (ECONNREFUSED). Host merespons tetapi port tertutup — aktifkan service www/www-ssl pada port tersebut di menu IP → Services.';
  if (code === 'ENOTFOUND' || /ENOTFOUND|getaddrinfo/i.test(raw)) return 'Host tidak ditemukan (gagal resolve). Periksa kembali alamat Host / IP.';
  if (/EHOSTUNREACH|ENETUNREACH/i.test(raw)) return 'Host tidak dapat dijangkau dari server billing. Periksa rute jaringan / firewall.';
  if (/Timeout koneksi|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(raw)) return 'Timeout — router tidak merespons tepat waktu. Periksa jalur jaringan / firewall ke host tersebut, lalu coba lagi.';
  if (/EPROTO|wrong version number|SSL routines|certificate/i.test(raw)) return 'Protokol tidak cocok (HTTP/HTTPS). Coba ganti pilihan Protokol pada form (HTTP untuk service www, HTTPS untuk www-ssl).';
  if (/ECONNRESET|socket hang up/i.test(raw)) return 'Koneksi diputus oleh perangkat (ECONNRESET). Kemungkinan port tersebut bukan REST API atau service tidak stabil.';
  return `Tidak dapat terhubung: ${raw}`;
}

/** GET /:id/overview — identity, resource, sesi aktif & profile server.
 *  Mengembalikan data nyata atau error koneksi. */
r.get('/:id/overview', can('routers'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });

    try {
      // Ambil tiap data secara terpisah: kegagalan salah satu endpoint
      // tidak menggagalkan keseluruhan (graceful degradation).
      const safe = async (fn) => {
        try { return { data: await fn() }; } catch (e) { return { error: e.message }; }
      };
      const [idR, resR, actR, profR] = await Promise.all([
        safe(() => mt.getIdentity(router)),
        safe(() => mt.systemResource(router)),
        safe(() => mt.listPppActive(router)),
        safe(() => mt.listPppProfiles(router)),
      ]);
      const identity = idR.data ?? '';
      const resource = resR.data ?? null;
      const active = actR.data ?? [];
      const profiles = profR.data ?? [];
      const warnings = [idR.error, resR.error, actR.error, profR.error].filter(Boolean);
      if (!resource || !resource.version) {
        throw new Error(warnings[0] || 'Resource tidak tersedia dari server');
      }
      await exec('UPDATE routers SET status="online", last_seen=NOW() WHERE id=?', [router.id]);
      return res.json({ ok: true, mode: 'real', identity, resource,
        activeSessions: active.length, profiles: profiles.map((p) => p.name),
        warnings });
    } catch (realErr) {
      await exec('UPDATE routers SET status="offline" WHERE id=?', [router.id]).catch(() => {});
      return res.status(502).json({ ok: false, message: `Tidak dapat mengambil data Mikrotik: ${realErr.message}` });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /:id/interfaces — daftar interface fisik/bridge dari server */
r.get('/:id/interfaces', can('routers'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });
    try {
      return res.json({ ok: true, mode: 'real', rows: await mt.listInterfaces(router) });
    } catch (err) {
      await exec('UPDATE routers SET status = "offline" WHERE id = ?', [router.id]);
      return res.status(502).json({ ok: false, message: `Tidak dapat mengambil interface Mikrotik: ${err.message}` });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /:id/profiles — PPP profile di server (rate-limit per paket) */
r.get('/:id/profiles', can('routers'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });
    try {
      return res.json({ ok: true, mode: 'real', rows: await mt.listPppProfiles(router) });
    } catch (err) {
      await exec('UPDATE routers SET status = "offline" WHERE id = ?', [router.id]);
      return res.status(502).json({ ok: false, message: `Tidak dapat mengambil PPP profile Mikrotik: ${err.message}` });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /:id/secrets — PPP secrets langsung dari RouterOS */
r.get('/:id/secrets', can('routers'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });
    try {
      const rows = await mt.listPppSecrets(router);
      await exec('UPDATE routers SET status = "online", last_seen = NOW() WHERE id = ?', [router.id]);
      return res.json({ ok: true, mode: 'real', router: { id: router.id, name: router.name }, rows });
    } catch (err) {
      await exec('UPDATE routers SET status = "offline" WHERE id = ?', [router.id]);
      return res.status(502).json({ ok: false, message: `Tidak dapat mengambil PPP secrets Mikrotik: ${err.message}` });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /:id/ip-pools — IP pool RouterOS untuk remote-address PPP */
r.get('/:id/ip-pools', can('routers'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });
    const rows = await mt.listIpPools(router);
    res.json({ ok: true, mode: 'real', rows });
  } catch (err) {
    res.status(502).json({ ok: false, message: `Tidak dapat mengambil IP pool Mikrotik: ${err.message}` });
  }
});

/** POST /:id/profiles — buat PPP profile manual di server */
r.post('/:id/profiles', can('routers', 'edit'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });
    const { name, rate_limit, comment } = req.body || {};
    if (!name) return res.status(400).json({ message: 'Nama profile wajib diisi' });
    try {
      const existing = await mt.listPppProfiles(router);
      if (existing.some((p) => p.name === name)) {
        return res.status(400).json({ message: `Profile "${name}" sudah ada di server` });
      }
      await mt.createPppProfile(router, { name, rateLimit: rate_limit, comment });
      await logActivity({ req, action: 'routers.profile_create', module: 'routers', description: `Buat PPP profile "${name}" di ${router.name}` });
      return res.json({ ok: true, mode: 'real' });
    } catch (err) {
      return res.status(502).json({ ok: false, message: `Gagal membuat PPP profile di Mikrotik: ${err.message}` });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /:id/provision — sinkronkan profile isolir + seluruh paket aktif ke server */
r.post('/:id/provision', can('routers', 'edit'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });
    const pkgs = await q('SELECT name, mikrotik_profile, speed FROM packages WHERE mikrotik_profile IS NOT NULL AND is_active = 1');
    const wanted = [
      { name: 'isolir', rateLimit: '1M/1M', comment: 'NetBill auto-isolir' },
      // Profile Isolir kustom per server (Auto Isolir — halaman Server Mikrotik)
      ...(normIsolateProfile(router.isolate_profile) !== 'isolir'
        ? [{ name: normIsolateProfile(router.isolate_profile), rateLimit: '1M/1M', comment: 'NetBill Profile Isolir server' }]
        : []),
      ...pkgs.map((p) => ({ name: p.mikrotik_profile, rateLimit: rateFromSpeed(p.speed), comment: `NetBill paket ${p.name}` })),
    ];
    try {
      const existing = await mt.listPppProfiles(router);
      const created = [];
      const already = [];
      const seen = new Set();
      for (const w of wanted) {
        if (seen.has(w.name)) continue; // hindari duplikat bila nama bentrok dengan profile paket
        seen.add(w.name);
        if (existing.some((p) => p.name === w.name)) { already.push(w.name); continue; }
        await mt.createPppProfile(router, w);
        created.push(w.name);
      }
      await logActivity({ req, action: 'routers.provision', module: 'routers', description: `Provision ${created.length} profile ke ${router.name}: ${created.join(', ') || '-'}` });
      return res.json({ ok: true, mode: 'real', created, existing: already });
    } catch (err) {
      return res.status(502).json({ ok: false, message: `Gagal provision PPP profile di Mikrotik: ${err.message}` });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /:id/sessions — sesi PPPoE aktif langsung dari server */
r.get('/:id/sessions', can('routers'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });
    try {
      return res.json({ ok: true, mode: 'real', rows: await mt.listPppActive(router) });
    } catch (err) {
      await exec('UPDATE routers SET status = "offline" WHERE id = ?', [router.id]);
      return res.status(502).json({ ok: false, message: `Tidak dapat mengambil sesi PPPoE Mikrotik: ${err.message}` });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** NAS RADIUS — daftarkan/hapus server ke tabel `nas` FreeRADIUS */
r.post('/:id/register-nas', can('routers', 'edit'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });
    const s = await getSettings();
    const secret = s.radius_secret || 'netbill-secret';
    const ex = await q('SELECT id FROM nas WHERE nasname = ?', [router.host]);
    if (ex[0]) {
      await exec('UPDATE nas SET shortname=?, secret=?, description=? WHERE id=?', [router.name, secret, `NetBill: ${router.name}`, ex[0].id]);
    } else {
      await exec('INSERT INTO nas (nasname, shortname, secret, description) VALUES (?,?,?,?)',
        [router.host, router.name, secret, `NetBill: ${router.name}`]);
    }
    await logActivity({ req, action: 'routers.nas_register', module: 'routers', description: `${router.name} (${router.host}) didaftarkan sebagai NAS RADIUS` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

r.post('/:id/unregister-nas', can('routers', 'edit'), async (req, res) => {
  try {
    const router = await findRouter(req.params.id);
    if (!router) return res.status(404).json({ message: 'Server tidak ditemukan' });
    await exec('DELETE FROM nas WHERE nasname = ?', [router.host]);
    await logActivity({ req, action: 'routers.nas_unregister', module: 'routers', description: `${router.name} dihapus dari NAS RADIUS` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


export default r;
