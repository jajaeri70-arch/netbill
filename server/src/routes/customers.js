import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity, getSettings, num, todayLocal, curPeriod, currentMonthNewCustomerWithoutInvoiceWhere } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import { randomString, randomNumber } from '../utils/crypto.js';
import { sendCsv } from '../utils/csv.js';
import { upload } from '../utils/upload.js';
import * as radius from '../services/radius.js';
import * as monitoring from '../services/monitoring.js';
import * as mikrotik from '../services/mikrotik.js';
import { importCustomersFromCsv } from '../services/importCustomers.js';
import { ensureBillingSchema, generateInvoices } from '../services/billing.js';
import { formatDateId, formatDateTimeId } from '../utils/csvImport.js';
import { emit } from '../utils/events.js';
import { customerPhone } from '../utils/phone.js';

const r = Router();

let pppSchemaReady;
async function ensurePppSchema() {
  if (!pppSchemaReady) {
    pppSchemaReady = (async () => {
      for (const [column, type, after] of [['installation_date', 'DATE', 'package_id'], ['installation_status', "ENUM('pending','in_progress','installed') NOT NULL DEFAULT 'installed'", 'installation_date'], ['ppp_service', 'VARCHAR(20)', 'pppoe_password'], ['ppp_type_ip', 'VARCHAR(45)', 'ppp_service'], ['ppp_local_address', 'VARCHAR(45)', 'ppp_type_ip'], ['ppp_remote_address', 'VARCHAR(45)', 'ppp_local_address']]) {
        const exists = await q('SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'customers\' AND COLUMN_NAME = ?', [column]);
        if (!Number(exists[0]?.n)) {
          await exec(`ALTER TABLE customers ADD COLUMN ${column} ${type}${type.includes('NOT NULL') ? '' : ' NULL'} AFTER ${after}`);
          if (column === 'installation_date') await exec('UPDATE customers SET installation_date = activation_date WHERE installation_date IS NULL');
        }
      }
    })().catch((err) => { pppSchemaReady = null; throw err; });
  }
  return pppSchemaReady;
}

const SELECT_BASE = `
  SELECT c.*, p.name AS package_name, p.speed AS package_speed, p.price AS package_price,
         dev.id AS ont_device_id, dev.status AS ont_status, dev.rx_power AS ont_rx_power,
         dev.ip_pppoe AS ont_ip_pppoe, dev.uptime AS ont_uptime, dev.last_inform AS ont_last_inform,
         CASE WHEN dev.genieacs_device_id LIKE '%-%-%'
           THEN SUBSTRING_INDEX(SUBSTRING_INDEX(dev.genieacs_device_id, '-', -2), '-', 1)
           ELSE dev.model END AS ont_model,
         CASE WHEN dev.genieacs_device_id LIKE '%-%-%'
           THEN SUBSTRING_INDEX(dev.genieacs_device_id, '-', -1)
           ELSE dev.serial END AS ont_serial
  FROM customers c
  LEFT JOIN packages p ON p.id = c.package_id
  LEFT JOIN devices dev ON dev.id = (
    SELECT d2.id FROM devices d2
    WHERE c.pppoe_username IS NOT NULL AND c.pppoe_username <> ''
      AND d2.pppoe_username = c.pppoe_username
    ORDER BY d2.id DESC LIMIT 1
  )`;

/** Kolom yang boleh dipakai untuk pengurutan (whitelist, anti SQL injection) */
const SORT_COLS = {
  id: 'c.id', code: 'c.code', name: 'c.name', area: 'c.area', status: 'c.status',
  package: 'p.name', price: 'p.price', created: 'c.created_at',
};
/** Kolom tambahan khusus daftar (butuh JOIN devices): ONT online dikelompokkan lebih dulu */
const SORT_COLS_LIST = {
  ...SORT_COLS,
  ont: "CASE WHEN dev.status = 'online' THEN 0 WHEN dev.status = 'offline' THEN 1 ELSE 2 END",
};

/** ORDER BY aman dari whitelist + kunci sekunder c.id agar urutan stabil antar halaman */
function orderClause(sort, dir, cols) {
  const col = cols[sort] || cols.id;
  const d = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${col} ${d}, c.id DESC`;
}

/** GET /api/customers — daftar + filter lanjutan (PRD 5.4) */
r.get('/', can('customers'), async (req, res) => {
  try {
    const { q: search, status, installation_status, without_invoice, package_id, area, tag, sort, dir, page = 1, limit = 10 } = req.query;
    const where = [];
    const params = [];
    if (search) {
      where.push('(c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ? OR c.pppoe_username LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (status && status !== 'all') { where.push('c.status = ?'); params.push(status); }
    if (installation_status === 'attention') where.push("(c.installation_status IN ('pending', 'in_progress') OR c.status = 'inactive')");
    else if (['pending', 'in_progress', 'installed'].includes(installation_status)) { where.push('c.installation_status = ?'); params.push(installation_status); }
    if (without_invoice === 'current_month') {
      where.push(currentMonthNewCustomerWithoutInvoiceWhere);
      params.push(curPeriod());
    }
    if (package_id) { where.push('c.package_id = ?'); params.push(package_id); }
    if (area && area !== 'all') { where.push('c.area = ?'); params.push(area); }
    if (tag && tag !== 'all') { where.push('c.tag = ?'); params.push(tag); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await q(`SELECT COUNT(*) n FROM customers c ${w}`, params);
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const rows = await q(
      `${SELECT_BASE} ${w} ${orderClause(sort, dir, SORT_COLS_LIST)} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );
    res.json({ rows, total: num(total[0]?.n) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/customers/meta — opsi filter (area, tag, status) */
r.get('/meta', can('customers'), async (req, res) => {
  try {
    const areas = await q('SELECT DISTINCT area FROM customers WHERE area IS NOT NULL ORDER BY area');
    const tags = await q('SELECT DISTINCT tag FROM customers WHERE tag IS NOT NULL ORDER BY tag');
    res.json({ areas: areas.map((a) => a.area), tags: tags.map((t) => t.tag) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** Pemetaan status → label CSV ekspor (dibaca kembali oleh import: AKTIF/SUSPEND/NONAKTIF) */
const STATUS_CSV_LABELS = { active: 'AKTIF', isolated: 'SUSPEND', inactive: 'NONAKTIF' };

/** Kolom CSV ekspor — nama & urutan sama dengan template import agar file bisa diimpor ulang */
const EXPORT_COLS = [
  { key: 'code', label: 'No Pelanggan' }, { key: 'name', label: 'Nama' }, { key: 'nik', label: 'No KTP' },
  { key: 'phone', label: 'Telepon' }, { key: 'email', label: 'Email' }, { key: 'pppoe_username', label: 'Username' },
  { key: 'pppoe_password', label: 'Password' }, { key: 'odp', label: 'ODP' }, { key: 'odc', label: 'ODC' },
  { key: 'redaman', label: 'Redaman' }, { key: 'area', label: 'Area' }, { key: 'package_name', label: 'Paket' },
  { key: 'package_price', label: 'Tarif' }, { key: 'billing_day', label: 'Tanggal Tagihan' },
  { key: 'status_label', label: 'Status' }, { key: 'address', label: 'Alamat' }, { key: 'maps', label: 'Maps' },
  { key: 'notes', label: 'Catatan' }, { key: 'ppp_service', label: 'Service PPP' },
  { key: 'ppp_local_address', label: 'Local Address' }, { key: 'ppp_remote_address', label: 'Remote Address' },
  { key: 'static_ip', label: 'IP Statis' }, { key: 'ont_brand', label: 'Merk ONT' },
  { key: 'ont_serial', label: 'Serial ONT' }, { key: 'tag', label: 'Kategori' },
  { key: 'activation_label', label: 'Tanggal Pemasangan' }, { key: 'created_label', label: 'Dibuat' },
];

/** Ubah baris customers → baris CSV ekspor (tanggal dd/mm/yyyy, Maps dari lat/lng) */
function customerToExportRow(c) {
  return {
    code: c.code, name: c.name, nik: c.nik || '', phone: c.phone || '', email: c.email || '',
    pppoe_username: c.pppoe_username || '', pppoe_password: c.pppoe_password || '',
    odp: c.odp || '', odc: c.odc || '', redaman: c.redaman ?? '', area: c.area || '',
    package_name: c.package_name || '', package_price: c.package_price ?? '', billing_day: c.billing_day ?? '',
    status_label: STATUS_CSV_LABELS[c.status] || c.status, address: c.address || '',
    maps: c.latitude != null && c.longitude != null ? `https://www.google.com/maps?q=${c.latitude},${c.longitude}` : '',
    notes: c.notes || '', ppp_service: c.ppp_service || '',
    ppp_local_address: c.ppp_local_address || '', ppp_remote_address: c.ppp_remote_address || '',
    static_ip: c.static_ip || '', ont_brand: c.ont_brand || '', ont_serial: c.ont_serial || '',
    tag: c.tag || '', activation_label: formatDateId(c.activation_date),
    created_label: formatDateTimeId(c.created_at),
  };
}

/** GET /api/customers/export — CSV sesuai filter aktif (format sama dengan template import) */
r.get('/export', can('customers', 'export'), async (req, res) => {
  try {
    const { q: search, status, installation_status, without_invoice, package_id, area, tag, sort, dir } = req.query;
    const where = [];
    const params = [];
    if (search) {
      where.push('(c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ? OR c.pppoe_username LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (status && status !== 'all') { where.push('c.status = ?'); params.push(status); }
    if (installation_status === 'attention') where.push("(c.installation_status IN ('pending', 'in_progress') OR c.status = 'inactive')");
    else if (['pending', 'in_progress', 'installed'].includes(installation_status)) { where.push('c.installation_status = ?'); params.push(installation_status); }
    if (without_invoice === 'current_month') {
      where.push(currentMonthNewCustomerWithoutInvoiceWhere);
      params.push(curPeriod());
    }
    if (package_id) { where.push('c.package_id = ?'); params.push(package_id); }
    if (area && area !== 'all') { where.push('c.area = ?'); params.push(area); }
    if (tag && tag !== 'all') { where.push('c.tag = ?'); params.push(tag); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(
      `SELECT c.*, p.name AS package_name, p.price AS package_price
       FROM customers c LEFT JOIN packages p ON p.id = c.package_id ${w} ${orderClause(sort, dir, SORT_COLS)}`,
      params
    );
    sendCsv(res, `pelanggan-${todayLocal()}.csv`, rows.map(customerToExportRow), EXPORT_COLS);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/customers/import — import CSV migrasi dari billing lama.
 *  Mendukung format ekspor sistem lama: direktif sep=, sel ="…", tanggal dd/mm/yyyy.
 *  Body: mode=skip|update (duplikat via Username PPPoE / No Pelanggan), dry_run=1 (pratinjau). */
r.post('/import', can('customers', 'create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File CSV wajib diunggah' });
    const fs = await import('fs');
    const content = fs.readFileSync(req.file.path, 'utf8');
    fs.promises.unlink(req.file.path).catch(() => {});
    const result = await importCustomersFromCsv(content, {
      dryRun: ['1', 'true'].includes(String(req.body?.dry_run ?? '').toLowerCase()),
      mode: String(req.body?.mode) === 'update' ? 'update' : 'skip',
      userId: req.user.id,
    });
    if (result.inserted > 0) emit('customers:changed');
    if (!result.dry_run) {
      await logActivity({
        req, action: 'customers.import', module: 'customers',
        description: `Import CSV migrasi: ${result.inserted} ditambah, ${result.updated} diperbarui, ${result.skipped} dilewati, ${result.failed} gagal`,
      });
    }
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

/** Contoh baris template import (2 contoh: aktif & isolir) — bentuk sama dengan baris ekspor */
const TEMPLATE_EXAMPLES = [
  {
    code: '10383127', name: 'Fandi Pratama', nik: '3507191103080003', phone: '081325461307', email: '',
    pppoe_username: 'tbs-fandi_pratama', pppoe_password: 'apalag1ini', odp: 'ODP-TBS-GG Anggur', odc: '',
    redaman: -24.5, area: 'Tambaksari', package_name: '(PROMO) Up to 15Mbps', package_price: 125000,
    billing_day: 1, status_label: 'AKTIF',
    address: 'Dsn Tambaksari RT 01 / RW 01, JATISARI, PAKISAJI, KAB. MALANG',
    maps: 'https://www.google.com/maps?q=-7.8685356,112.6556213', notes: '',
    ppp_service: 'pppoe', ppp_local_address: '', ppp_remote_address: '', static_ip: '',
    ont_brand: '', ont_serial: '', tag: '', activation_label: '27/08/2026', created_label: '27/08/2026 16:17',
  },
  {
    code: '10375218', name: 'Rindi Ayu Saputri', nik: '', phone: '0895360688920', email: '',
    pppoe_username: 'wdg-rindi_ayu', pppoe_password: 'apalag1ini', odp: '', odc: '',
    redaman: '', area: 'Wadung', package_name: '(PROMO) Up to 40Mbps', package_price: 200000,
    billing_day: 1, status_label: 'SUSPEND',
    address: 'Dsn Wadung RT 07 / RW 02, WADUNG, PAKISAJI, KAB. MALANG',
    maps: '', notes: 'Contoh pelanggan isolir', ppp_service: 'pppoe',
    ppp_local_address: '192.168.3.1', ppp_remote_address: '192.168.3.46', static_ip: '',
    ont_brand: 'Huawei', ont_serial: '48575443XXXXXXXX', tag: '',
    activation_label: '05/08/2026', created_label: '05/08/2026 15:45',
  },
];

/** GET /api/customers/template — template CSV import (kolom sama dengan Export, contoh terisi) */
r.get('/template', can('customers', 'create'), async (req, res) => {
  try {
    sendCsv(res, 'template-import-pelanggan.csv', TEMPLATE_EXAMPLES, EXPORT_COLS);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/customers/:id — profil lengkap + histori */
r.get('/:id', can('customers'), async (req, res) => {
  try {
    const rows = await q(`${SELECT_BASE} WHERE c.id = ?`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' });
    const invoices = await q(
      `SELECT id, number, period, due_date, amount, late_fee, additional_fee, status, paid_amount,
              (amount + late_fee + additional_fee + tax - discount) total
       FROM invoices WHERE customer_id = ? ORDER BY period DESC LIMIT 12`,
      [req.params.id]
    );
    const payments = await q(
      `SELECT pay.*, i.number invoice_number FROM payments pay
       JOIN invoices i ON i.id = pay.invoice_id
       WHERE pay.customer_id = ? ORDER BY pay.payment_date DESC LIMIT 12`,
      [req.params.id]
    );
    const tickets = await q(
      `SELECT t.*, u.name assigned_name FROM support_tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.customer_id = ? ORDER BY t.created_at DESC LIMIT 10`,
      [req.params.id]
    );
    const devices = await q(
      `SELECT * FROM devices
       WHERE customer_id = ?
          OR (? <> '' AND pppoe_username = ?)`,
      [req.params.id, rows[0].pppoe_username || '', rows[0].pppoe_username || '']
    );
    const attachments = await q('SELECT * FROM customer_attachments WHERE customer_id = ?', [req.params.id]);
    const pkgHistory = await q(
      `SELECT h.*, p1.name old_name, p2.name new_name FROM customer_package_history h
       LEFT JOIN packages p1 ON p1.id = h.old_package_id
       LEFT JOIN packages p2 ON p2.id = h.new_package_id
       WHERE h.customer_id = ? ORDER BY h.changed_at DESC LIMIT 10`,
      [req.params.id]
    );
    const connLogs = await q(
      `SELECT event, ip, logged_at FROM connection_logs WHERE customer_id = ?
       ORDER BY logged_at DESC LIMIT 20`,
      [req.params.id]
    );
    const session = await q('SELECT * FROM pppoe_sessions WHERE customer_id = ?', [req.params.id]);
    res.json({
      customer: rows[0], invoices, payments, tickets, devices, attachments,
      packageHistory: pkgHistory, connectionLogs: connLogs, session: session[0] || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** Kolom INSERT pelanggan baru — VALUES dibangun dari array ini sehingga jumlah placeholder
 *  selalu persis sama dengan jumlah kolom (mencegah bug "near '?')' / column count mismatch") */
const INSERT_COLS = ['code', 'name', 'nik', 'phone', 'email', 'address', 'area', 'latitude', 'longitude',
  'package_id', 'installation_date', 'installation_status', 'activation_date', 'billing_day', 'billing_type', 'grace_days', 'no_auto_isolate', 'active_until', 'status',
  'pppoe_username', 'pppoe_password', 'ppp_service', 'ppp_type_ip', 'ppp_local_address', 'ppp_remote_address',
  'static_ip', 'odp', 'odc', 'redaman', 'ont_brand', 'ont_serial', 'genieacs_device_id', 'tag', 'notes', 'created_by'];

/** POST /api/customers — tambah pelanggan (generate PPPoE otomatis) */
r.post('/', can('customers', 'create'), async (req, res) => {
  try {
    await ensurePppSchema();
    await ensureBillingSchema();
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ message: 'Nama pelanggan wajib diisi' });
    const settings = await getSettings(true);
    const lastCode = await q("SELECT COALESCE(MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)), 0) n FROM customers WHERE code REGEXP '^C-[0-9]+$'");
    const code = b.code || `C-${String(num(lastCode[0]?.n) + 1).padStart(4, '0')}`;
    const uname = b.pppoe_username ||
      b.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) + randomNumber(3);
    const pass = b.pppoe_password || randomString(8);
    const result = await exec(
      `INSERT INTO customers (${INSERT_COLS.join(', ')}) VALUES (${INSERT_COLS.map(() => '?').join(',')})`,
       [code, b.name, b.nik || null, customerPhone(b.phone), b.email || null, b.address || null,
         b.area || null, b.latitude || null, b.longitude || null, b.package_id || null,
          b.installation_date || b.activation_date || null, ['pending', 'in_progress', 'installed'].includes(b.installation_status) ? b.installation_status : 'installed', b.activation_date || null, b.billing_day || num(settings.billing_day_default) || 5,
         b.billing_type === 'prabayar' ? 'prabayar' : 'pascabayar',
         b.grace_days === '' || b.grace_days == null ? null : num(b.grace_days),
         b.no_auto_isolate ? 1 : 0,
         b.active_until || null,
         b.status || 'active', uname, pass, b.ppp_service || null, b.ppp_type_ip || null, b.ppp_local_address || null, b.ppp_remote_address || null, b.static_ip || null, b.odp || null, b.odc || null,
        b.redaman || null, b.ont_brand || null, b.ont_serial || null, b.genieacs_device_id || null,
        b.tag || null, b.notes || null, req.user.id]
    );
    if (b.secret_mode === 'new') {
      const router = (await q('SELECT * FROM routers WHERE is_active = 1 ORDER BY id LIMIT 1'))[0];
      if (!router) {
        await exec('DELETE FROM customers WHERE id = ?', [result.insertId]);
        return res.status(400).json({ message: 'Tidak ada router aktif untuk membuat PPP secret' });
      }
      try {
        await mikrotik.createPppSecret(router, {
          username: uname,
          password: pass,
          service: b.ppp_service,
          profile: b.ppp_profile,
          localAddress: b.ppp_local_address,
          remoteAddress: b.ppp_remote_address || 'IP Pools',
          usePool: b.ppp_type_ip === 'IP Pools',
        });
      } catch (err) {
        await exec('DELETE FROM customers WHERE id = ?', [result.insertId]);
        return res.status(502).json({ message: `Gagal membuat PPP secret di Mikrotik: ${err.message}` });
      }
    }
    await radius.syncCustomer({ pppoe_username: uname, pppoe_password: pass });
    if (b.package_id) await radius.applyCustomerProfile(result.insertId);
    if (b.status !== 'inactive') await monitoring.init();
    // Sinkron saat pelanggan dibuat: invoice pascabayar pertama langsung tersedia dan
    // engine yang sama tetap menghitung prorata dari tanggal aktif sampai akhir siklus.
    if (b.package_id && b.status !== 'inactive') await generateInvoices(null, req.user);
    await logActivity({ req, action: 'customers.create', module: 'customers', description: `Menambah pelanggan ${b.name} (${code}) — PPPoE: ${uname}` });
    emit('customers:changed');
    res.json({ id: result.insertId, code, pppoe_username: uname, pppoe_password: pass });
  } catch (err) {
    if (String(err.message).includes('Duplicate')) {
      return res.status(400).json({ message: 'Kode/username PPPoE sudah dipakai' });
    }
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/customers/:id */
r.put('/:id', can('customers', 'edit'), async (req, res) => {
  try {
    await ensurePppSchema();
    await ensureBillingSchema();
    const b = req.body || {};
    const old = (await q('SELECT * FROM customers WHERE id = ?', [req.params.id]))[0];
    if (!old) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' });
    await exec(
      `UPDATE customers SET name=?, nik=?, phone=?, email=?, address=?, area=?, latitude=?, longitude=?,
        package_id=?, installation_date=?, installation_status=?, activation_date=?, billing_day=?, billing_type=?, grace_days=?, no_auto_isolate=?, active_until=?, status=?, pppoe_username=?, pppoe_password=?, ppp_service=?, ppp_type_ip=?, ppp_local_address=?, ppp_remote_address=?, static_ip=?, odp=?, odc=?, redaman=?,
        ont_brand=?, ont_serial=?, genieacs_device_id=?, tag=?, notes=? WHERE id=?`,
      [b.name ?? old.name, b.nik ?? old.nik, customerPhone(b.phone ?? old.phone), b.email ?? old.email,
        b.address ?? old.address, b.area ?? old.area, b.latitude ?? old.latitude,
        b.longitude ?? old.longitude, b.package_id ?? old.package_id,
        b.installation_date ?? old.installation_date, ['pending', 'in_progress', 'installed'].includes(b.installation_status) ? b.installation_status : old.installation_status, b.activation_date ?? old.activation_date, b.billing_day ?? old.billing_day,
         b.billing_type === 'prabayar' ? 'prabayar' : (b.billing_type === 'pascabayar' ? 'pascabayar' : old.billing_type),
         b.grace_days === '' ? null : (b.grace_days ?? old.grace_days),
         b.no_auto_isolate === undefined ? old.no_auto_isolate : (b.no_auto_isolate ? 1 : 0),
         b.active_until ?? old.active_until,
          b.status ?? old.status, b.pppoe_username ?? old.pppoe_username, b.pppoe_password ?? old.pppoe_password, b.ppp_service ?? old.ppp_service, b.ppp_type_ip ?? old.ppp_type_ip, b.ppp_local_address ?? old.ppp_local_address, b.ppp_remote_address ?? old.ppp_remote_address, b.static_ip ?? old.static_ip, b.odp ?? old.odp, b.odc ?? old.odc,
        b.redaman ?? old.redaman, b.ont_brand ?? old.ont_brand, b.ont_serial ?? old.ont_serial,
        b.genieacs_device_id ?? old.genieacs_device_id, b.tag ?? old.tag, b.notes ?? old.notes,
        req.params.id]
    );
    if (b.package_id && Number(b.package_id) !== Number(old.package_id)) {
      await exec(
        'INSERT INTO customer_package_history (customer_id, old_package_id, new_package_id, changed_by) VALUES (?,?,?,?)',
        [req.params.id, old.package_id, b.package_id, req.user.id]
      );
    }
    await radius.syncCustomer({ ...old, ...b });
    await radius.applyCustomerProfile(req.params.id);
    await logActivity({ req, action: 'customers.update', module: 'customers', description: `Mengubah data pelanggan ${old.name}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/customers/:id */
r.delete('/:id', can('customers', 'delete'), async (req, res) => {
  try {
    const old = (await q('SELECT * FROM customers WHERE id = ?', [req.params.id]))[0];
    if (!old) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' });
    await exec('DELETE FROM customers WHERE id = ?', [req.params.id]);
    await radius.removeCustomer(old.pppoe_username);
    await logActivity({ req, action: 'customers.delete', module: 'customers', description: `Menghapus pelanggan ${old.name} (${old.code})` });
    emit('customers:changed');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/customers/:id/status — isolir / disable / aktivasi manual */
r.post('/:id/status', can('customers', 'edit'), async (req, res) => {
  try {
    await ensureBillingSchema();
    const { status } = req.body || {};
    if (!['active', 'inactive', 'isolated', 'disabled'].includes(status)) {
      return res.status(400).json({ message: 'Status tidak valid' });
    }
    const old = (await q('SELECT * FROM customers WHERE id = ?', [req.params.id]))[0];
    if (!old) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' });
    // "Jangan Pernah Eksekusi ISOLIR khusus untuk pelanggan ini" — tolak isolir manual (dengan/tanpa username PPPoE)
    if (status === 'isolated' && Number(old.no_auto_isolate) === 1) {
      return res.status(400).json({ message: `${old.name} dikecualikan dari ISOLIR — matikan opsi "Jangan Pernah Eksekusi ISOLIR" pada form pelanggan bila ingin mengisolir` });
    }
    if (status === 'isolated' && old.pppoe_username) {
      await monitoring.doAction(old.pppoe_username, 'isolir', req.user);
    } else if (status === 'disabled' && old.pppoe_username) {
      await monitoring.doAction(old.pppoe_username, 'disable', req.user);
    } else if (status === 'active' && old.pppoe_username && (old.status === 'isolated' || old.status === 'disabled')) {
      await monitoring.doAction(old.pppoe_username, old.status === 'disabled' ? 'enable' : 'activate', req.user);
    } else {
      await exec('UPDATE customers SET status = ? WHERE id = ?', [status, req.params.id]);
      await radius.applyCustomerProfile(req.params.id);
      await logActivity({ req, action: 'customers.status', module: 'customers', description: `Ubah status ${old.name} → ${status}` });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/customers/:id/attachments — upload dokumen (KTP, rumah, dll) */
r.post('/:id/attachments', can('customers', 'edit'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File wajib diunggah' });
    const type = ['ktp', 'rumah', 'instalasi', 'perjanjian'].includes(req.body?.type) ? req.body.type : 'lainnya';
    await exec(
      'INSERT INTO customer_attachments (customer_id, type, file_path, uploaded_by) VALUES (?,?,?,?)',
      [req.params.id, type, `/uploads/${req.file.filename}`, req.user.id]
    );
    await logActivity({ req, action: 'customers.upload_doc', module: 'customers', description: `Upload dokumen ${type} untuk pelanggan #${req.params.id}` });
    res.json({ ok: true, path: `/uploads/${req.file.filename}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;


