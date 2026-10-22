import { Router } from 'express';
import { q } from '../db.js';
import { createSessionStore, normalizePhone, maskPhone } from '../services/portal-session.js';

export function createPortalRouter({ query = q, sessions = createSessionStore(), origin = process.env.PORTAL_ORIGIN, secure = process.env.NODE_ENV === 'production' } = {}) {
const r = Router();
const attempts = new Map();
const cookieName = 'netbill_customer_session';
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure, path: '/api/portal' };
const tokenOf = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
function prune() {
  sessions.prune();
  for (const [key, entry] of attempts) if (entry.until <= Date.now()) attempts.delete(key);
}

function limited(key, limit, duration) {
  let entry = attempts.get(key);
  if (!entry || entry.until <= Date.now()) { entry = { count: 0, until: Date.now() + duration }; attempts.set(key, entry); }
  entry.count += 1;
  return entry.count > limit;
}

r.use((req, res, next) => {
  prune();
  res.set('Cache-Control', 'no-store');
  res.set('X-NetBill-Portal', '1');
  // Custom header + same-origin policy prevent cross-site cookie-authenticated writes.
  res.removeHeader('Access-Control-Allow-Origin');
  res.removeHeader('Access-Control-Allow-Credentials');
  const expectedOrigin = origin ? new URL(origin).origin : `${req.protocol}://${req.get('host')}`;
  const csrf = req.get('X-Portal-CSRF') === '1' || req.get('X-Portal-Request') === '1';
  if (req.method !== 'GET' && (!csrf || (req.get('Origin') && req.get('Origin') !== expectedOrigin))) {
    return res.status(403).json({ message: 'Permintaan tidak diizinkan' });
  }
  next();
});

r.post('/login', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  try {
    if (limited(`ip:${req.ip}`, 10, 900000) || (phone && limited(`phone:${phone}`, 5, 60000))) {
      console.info('[portal.login]', maskPhone(phone), 'rate-limited');
      res.set('Retry-After', '900');
      return res.status(429).json({ message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
    }
    if (!phone) {
      console.info('[portal.login]', 'invalid');
      return res.status(400).json({ message: 'Masukkan nomor HP Indonesia yang valid.' });
    }
    const rows = await query('SELECT id, name, phone FROM customers WHERE phone IS NOT NULL');
    const matches = rows.filter(customer => normalizePhone(customer.phone) === phone);
    if (matches.length !== 1) {
      console.info('[portal.login]', maskPhone(phone), 'not-found-or-ambiguous');
      return res.status(401).json({ message: 'Nomor tidak terdaftar atau terkait beberapa akun. Hubungi CS.' });
    }
    sessions.delete(tokenOf(req));
    const token = sessions.create(matches[0]);
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: 86400000 });
    console.info('[portal.login]', maskPhone(phone), 'success');
    const customer = { name: matches[0].name, phone: maskPhone(phone) };
    res.json({ ...customer, customer });
  } catch {
    console.error('[portal.login] failed');
    res.status(500).json({ message: 'Layanan login tidak tersedia. Coba lagi nanti.' });
  }
});

r.post('/logout', (req, res) => {
  sessions.delete(tokenOf(req));
  res.clearCookie(cookieName, cookieOptions);
  res.json({ message: 'Berhasil keluar' });
});

// Every remaining portal endpoint uses customer cookies, never staff JWTs.
r.use(async (req, res, next) => {
  const session = sessions.get(tokenOf(req));
  if (!session) {
    res.clearCookie(cookieName, cookieOptions);
    return res.status(401).json({ code: 'PORTAL_SESSION_REQUIRED', message: 'Sesi berakhir. Silakan masuk kembali.' });
  }
  try {
    const [customer] = await query('SELECT id, code, name, phone, address, status, package_id FROM customers WHERE id = ?', [session.customerId]);
    if (!customer) { sessions.delete(tokenOf(req)); return res.status(401).json({ message: 'Sesi tidak valid.' }); }
    session.name = customer.name;
    req.portalCustomer = customer;
    next();
  } catch { res.status(503).json({ message: 'Layanan tidak tersedia. Coba lagi nanti.' }); }
});

r.get('/me', (req, res) => {
  const { name, code, phone } = req.portalCustomer;
  const customer = { name, code, phone: maskPhone(normalizePhone(phone)) };
  res.json({ ...customer, customer });
});

r.get('/dashboard', async (req, res) => {
  try {
    const customer = req.portalCustomer;
    const [pkg] = customer.package_id ? await query('SELECT name, speed, price FROM packages WHERE id = ?', [customer.package_id]) : [];
    const [invoice] = await query('SELECT service_start, service_end, due_date FROM invoices WHERE customer_id = ? ORDER BY invoice_date DESC, id DESC LIMIT 1', [customer.id]);
    res.json({
      profile: { name: customer.name, code: customer.code, phone: maskPhone(normalizePhone(customer.phone)), address: customer.address },
      subscription: {
        package_name: pkg?.name ?? null, speed: pkg?.speed ?? null, price: pkg?.price ?? null,
        status: customer.status, period_start: invoice?.service_start ?? null,
        period_end: invoice?.service_end ?? null, due_date: invoice?.due_date ?? null, days_remaining: null,
      },
      announcements: [], announcements_available: false, updated_at: new Date().toISOString(),
    });
  } catch { res.status(503).json({ message: 'Data pelanggan tidak tersedia. Coba lagi nanti.' }); }
});

r.use(['/ont', '/announcements', '/select'], (req, res) => {
  res.status(501).json({ code: 'PORTAL_FEATURE_UNAVAILABLE', message: 'Fitur belum tersedia pada backend ini. Hubungi CS.' });
});
r.use((req, res) => res.status(404).json({ message: 'Endpoint portal tidak ditemukan' }));
return r;
}

export default createPortalRouter();