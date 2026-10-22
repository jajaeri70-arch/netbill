import { Router } from 'express';
import { q } from '../db.js';
import { authenticate, can, canFinance, getRolePermissions, MENUS } from '../middleware/auth.js';
import monitoringRoutes from './monitoring.js';
import deviceRoutes from './devices.js';
import dashboardRoutes from './dashboard.js';
import { createPayment } from './payments.js';
import bankRoutes, { ensureBanksSchema } from './banks.js';
import { num } from '../utils/helper.js';
import { requireMobileApiKey } from '../middleware/mobileApiKey.js';
import { login } from './auth.js';
import { profitLossReport } from './reports.js';

const r = Router();
const api = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const CUSTOMER_STATUSES = new Set(['active', 'inactive', 'isolated']);
const INVOICE_STATUSES = new Set(['unpaid', 'partial', 'paid', 'void']);

export function mobileApiStatus(req, res) {
  res.json({ ok: true, service: 'netbill-mobile-api', version: 'v1', api_key: 'valid' });
}

export function paymentBanksHandler({ query = q, ensureSchema = ensureBanksSchema } = {}) {
  return async (req, res) => {
    await ensureSchema();
    const rows = await query(
      'SELECT id, name, account_number, account_name FROM banks WHERE is_active = 1 ORDER BY name ASC, id ASC'
    );
    res.json({ rows });
  };
}

export function pagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function fullPermissions() {
  return Object.fromEntries(MENUS.map((menu) => [menu, {
    view: true, create: true, edit: true, delete: true, export: true,
  }]));
}

function idOf(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function totals(row) {
  return {
    ...row,
    amount: num(row.amount), late_fee: num(row.late_fee), additional_fee: num(row.additional_fee), tax: num(row.tax),
    discount: num(row.discount), paid_amount: num(row.paid_amount),
    total: num(row.amount) + num(row.late_fee) + num(row.additional_fee) + num(row.tax) - num(row.discount),
  };
}

/** Publik: cek API dan koneksi database tanpa membuka detail konfigurasi. */
r.get('/health', async (req, res) => {
  try {
    await q('SELECT 1');
    res.json({ ok: true, service: 'netbill-mobile-api', version: 'v1' });
  } catch {
    res.status(503).json({ ok: false, message: 'Database tidak tersedia' });
  }
});

r.use(requireMobileApiKey);

/** Cek API key tanpa JWT; berguna untuk validasi konfigurasi aplikasi mobile. */
r.get('/', mobileApiStatus);

r.post('/login', login);
r.use(authenticate);

// Facade mobile: pakai handler bisnis yang sama agar validasi, RBAC, dan audit tidak bercabang.
r.use('/dashboard', dashboardRoutes);
r.use('/pppoe', monitoringRoutes);
r.use('/ont', deviceRoutes);
r.use('/banks', canFinance, bankRoutes);

r.get('/me', api(async (req, res) => {
  const permissions = await getRolePermissions(req.user.role);
  res.json({ user: req.user, permissions: permissions === null ? fullPermissions() : permissions });
}));

r.get('/summary', can('dashboard'), api(async (req, res) => {
  const [customers, invoices, payments] = await Promise.all([
    q(`SELECT COUNT(*) total, COALESCE(SUM(status='active'),0) active,
              COALESCE(SUM(status='isolated'),0) isolated,
              COALESCE(SUM(status='inactive'),0) inactive FROM customers`),
    q(`SELECT COUNT(*) total, COALESCE(SUM(status IN ('unpaid','partial')),0) open,
              COALESCE(SUM(CASE WHEN status IN ('unpaid','partial')
                THEN amount + late_fee + additional_fee + tax - discount - paid_amount ELSE 0 END),0) outstanding
       FROM invoices`),
    q(`SELECT COALESCE(SUM(amount),0) received_this_month FROM payments
       WHERE status='confirmed' AND DATE_FORMAT(payment_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')`),
  ]);
  const numeric = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, num(value)]));
  res.json({ customers: numeric(customers[0]), invoices: numeric(invoices[0]), payments: numeric(payments[0]) });
}));

r.get('/customers', can('customers'), api(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const where = [];
  const params = [];
  const search = String(req.query.q || '').trim();
  if (search) {
    const like = `%${search}%`;
    where.push('(c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ? OR c.pppoe_username LIKE ?)');
    params.push(like, like, like, like);
  }
  if (CUSTOMER_STATUSES.has(req.query.status)) {
    where.push('c.status = ?');
    params.push(req.query.status);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [count, rows] = await Promise.all([
    q(`SELECT COUNT(*) total FROM customers c ${sqlWhere}`, params),
    q(`SELECT c.id, c.code, c.name, c.phone, c.email, c.address, c.area,
              c.latitude, c.longitude, c.status, c.pppoe_username, c.billing_day,
              c.active_until, c.activation_date, p.id package_id, p.name package_name,
              p.speed package_speed, p.price package_price
       FROM customers c LEFT JOIN packages p ON p.id = c.package_id
       ${sqlWhere} ORDER BY c.name ASC, c.id ASC LIMIT ${limit} OFFSET ${offset}`, params),
  ]);
  const total = num(count[0].total);
  res.json({ data: rows.map((row) => ({ ...row, package_price: num(row.package_price) })),
    meta: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

r.get('/customers/:id', can('customers'), api(async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID pelanggan tidak valid' });
  const rows = await q(
    `SELECT c.id, c.code, c.name, c.nik, c.phone, c.email, c.address, c.area,
            c.latitude, c.longitude, c.status, c.pppoe_username, c.static_ip,
            c.billing_day, c.active_until, c.activation_date, c.odp, c.odc,
            c.redaman, c.ont_brand, c.ont_serial, c.tag, c.notes,
            p.id package_id, p.name package_name, p.speed package_speed, p.price package_price
     FROM customers c LEFT JOIN packages p ON p.id = c.package_id WHERE c.id = ?`, [id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' });
  const invoices = await q(
    `SELECT id, number, period, due_date, amount, late_fee, additional_fee, tax, discount, paid_amount, status
     FROM invoices WHERE customer_id = ? ORDER BY period DESC LIMIT 12`, [id]
  );
  res.json({ customer: { ...rows[0], package_price: num(rows[0].package_price) }, invoices: invoices.map(totals) });
}));

r.get('/invoices', can('invoices'), api(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const where = [];
  const params = [];
  const search = String(req.query.q || '').trim();
  if (search) {
    const like = `%${search}%`;
    where.push('(i.number LIKE ? OR c.name LIKE ? OR c.code LIKE ?)');
    params.push(like, like, like);
  }
  if (INVOICE_STATUSES.has(req.query.status)) {
    where.push('i.status = ?');
    params.push(req.query.status);
  }
  if (/^\d{4}-\d{2}$/.test(req.query.period || '')) {
    where.push('i.period = ?');
    params.push(req.query.period);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [count, rows] = await Promise.all([
    q(`SELECT COUNT(*) total FROM invoices i JOIN customers c ON c.id=i.customer_id ${sqlWhere}`, params),
    q(`SELECT i.id, i.number, i.customer_id, i.period, i.service_start, i.service_end,
              i.invoice_date, i.due_date, i.amount, i.late_fee, i.additional_fee, i.tax, i.discount,
              i.paid_amount, i.status, c.code customer_code, c.name customer_name,
              c.phone customer_phone
       FROM invoices i JOIN customers c ON c.id=i.customer_id ${sqlWhere}
       ORDER BY i.period DESC, i.id DESC LIMIT ${limit} OFFSET ${offset}`, params),
  ]);
  const total = num(count[0].total);
  res.json({ data: rows.map(totals), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

r.get('/invoices/:id', can('invoices'), api(async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID tagihan tidak valid' });
  const rows = await q(
    `SELECT i.*, c.code customer_code, c.name customer_name, c.phone customer_phone,
            c.address customer_address, p.name package_name, p.speed package_speed
     FROM invoices i JOIN customers c ON c.id=i.customer_id
     LEFT JOIN packages p ON p.id=c.package_id WHERE i.id=?`, [id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Tagihan tidak ditemukan' });
  const payments = await q(
    `SELECT id, amount, method, note, status, payment_date, proof_path
     FROM payments WHERE invoice_id=? ORDER BY payment_date DESC`, [id]
  );
  res.json({ invoice: totals(rows[0]), payments: payments.map((row) => ({ ...row, amount: num(row.amount) })) });
}));

/** GET /api/mobile/v1/reports/profit-loss — kontrak laporan sama dengan web. */
r.get('/reports/profit-loss', can('finance'), api(async (req, res) => {
  res.json(await profitLossReport(req.query.period || undefined));
}));

/** POST /api/mobile/v1/payments — JSON mobile, validasi bisnis bersama API web. */
r.post('/payments', can('payments', 'create'), createPayment);

/** Rekening aktif untuk metode transfer pada formulir pembayaran mobile. */
r.get('/payments/banks', can('payments', 'create'), api(paymentBanksHandler()));

r.get('/payments', can('payments'), api(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const [count, rows] = await Promise.all([
    q('SELECT COUNT(*) total FROM payments'),
    q(`SELECT pay.id, pay.invoice_id, pay.customer_id, pay.amount, pay.method,
              pay.note, pay.status, pay.payment_date, pay.proof_path,
              i.number invoice_number, c.code customer_code, c.name customer_name
       FROM payments pay JOIN invoices i ON i.id=pay.invoice_id
       JOIN customers c ON c.id=pay.customer_id
       ORDER BY pay.payment_date DESC LIMIT ${limit} OFFSET ${offset}`),
  ]);
  const total = num(count[0].total);
  res.json({ data: rows.map((row) => ({ ...row, amount: num(row.amount) })),
    meta: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

export default r;
