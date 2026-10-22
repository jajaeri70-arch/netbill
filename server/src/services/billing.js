import { q, exec } from '../db.js';
import { getSettings, logActivity, num, curPeriod, todayLocal } from '../utils/helper.js';
import { notifyAll } from '../utils/notify.js';
import { sendWhatsApp, sendMiberBillingNotification, renderTemplate } from './whatsapp.js';
import { ensureRoutersSchema } from './mikrotik.js';
import * as monitoring from './monitoring.js';

/**
 * Engine billing — PRD 5.2 & alur 9.1:
 * generate tagihan otomatis, denda keterlambatan, auto isolir,
 * auto aktivasi setelah pembayaran, dan reminder WA (H-3/H-1/H-H).
 */

export { curPeriod };

let billingSchemaReady;
/** Pastikan kolom penagihan & masa aktif ada (migrasi runtime — pola ensurePppSchema customers.js) */
export async function ensureBillingSchema() {
  if (!billingSchemaReady) {
    billingSchemaReady = (async () => {
      const cols = await q(
        `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'
           AND COLUMN_NAME IN ('grace_days','no_auto_isolate','active_until','billing_type','status')`
      );
      const have = new Set(cols.map((r) => r.COLUMN_NAME));
      if (!have.has('grace_days')) await exec('ALTER TABLE customers ADD COLUMN grace_days TINYINT NULL AFTER billing_day');
      // Jenis penagihan: PRABAYAR | BAYAR DI MUKA → siklus pertama tanpa prorata
      if (!have.has('billing_type')) await exec("ALTER TABLE customers ADD COLUMN billing_type ENUM('pascabayar','prabayar') NOT NULL DEFAULT 'pascabayar' AFTER grace_days");
      if (!have.has('no_auto_isolate')) await exec('ALTER TABLE customers ADD COLUMN no_auto_isolate TINYINT(1) NOT NULL DEFAULT 0 AFTER grace_days');
      if (!have.has('active_until')) await exec('ALTER TABLE customers ADD COLUMN active_until DATE NULL AFTER no_auto_isolate');
      const statusCol = cols.find((r) => r.COLUMN_NAME === 'status');
      if (statusCol && !String(statusCol.COLUMN_TYPE).includes("'disabled'")) {
        await exec("ALTER TABLE customers MODIFY COLUMN status ENUM('active','inactive','isolated','disabled') NOT NULL DEFAULT 'active'");
      }
      // Periode layanan tagihan (Tanggal Aktif → Tanggal Berakhir siklus langganan)
      const invCols = await q(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
            AND COLUMN_NAME IN ('service_start','service_end','additional_fee')`
      );
      const invHave = new Set(invCols.map((r) => r.COLUMN_NAME));
      if (!invHave.has('service_start')) await exec('ALTER TABLE invoices ADD COLUMN service_start DATE NULL AFTER period');
      if (!invHave.has('service_end')) await exec('ALTER TABLE invoices ADD COLUMN service_end DATE NULL AFTER service_start');
      if (!invHave.has('additional_fee')) await exec('ALTER TABLE invoices ADD COLUMN additional_fee DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER late_fee');
    })().catch((err) => { billingSchemaReady = null; throw err; });
  }
  return billingSchemaReady;
}


/** Total tagihan = amount + late_fee + biaya tambahan + tax - discount */
export function invoiceTotal(inv) {
  return num(inv.amount) + num(inv.late_fee) + num(inv.additional_fee) + num(inv.tax) - num(inv.discount);
}

/** ---------- Utilitas tanggal & siklus langganan (anniversary billing) ---------- */
const pad2 = (n) => String(n).padStart(2, '0');
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12
const todayIso = () => todayLocal();
const addDaysIso = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Jatuh tempo = akhir layanan + batas waktu pembayaran pelanggan (fallback global). */
export function dueDateForInvoice(serviceEnd, customerGraceDays, globalGraceDays = 0) {
  const grace = customerGraceDays == null ? num(globalGraceDays) : num(customerGraceDays);
  return addDaysIso(toIsoDate(serviceEnd), Math.max(0, grace));
}
/** Selisih hari a − b (tanggal ISO) */
const diffDaysIso = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
/** Normalisasi nilai tanggal dari DB (Date | 'YYYY-MM-DD' | 'YYYY-MM') → 'YYYY-MM-DD' */
function toIsoDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  return String(v).slice(0, 10);
}
function dayOfValue(v) {
  if (v == null) return 0;
  if (v instanceof Date) return v.getDate();
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Number(m[3]) : 0;
}
/** Tanggal mulai siklus pada bulan (y, m); hari anchor > jumlah hari bulan dicabut ke akhir bulan */
function cycleStartIso(anchorDay, y, m) {
  const day = Math.min(Math.max(1, anchorDay), daysInMonth(y, m));
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

/** Jenis penagihan PRABAYAR | BAYAR DI MUKA (bayar di muka) */
const isPrepaidType = (type) => String(type || '').toLowerCase() === 'prabayar';

/**
 * Hari anchor siklus tagihan pelanggan.
 * - PRABAYAR | BAYAR DI MUKA → mengikuti hari Tanggal Aktif (fallback Tanggal Pemasangan),
 *   sehingga tagihan dibuat H-1 sebelum siklus layanan dimulai.
 * - PASCABAYAR → Siklus Tagihan (billing_day) → hari Tanggal Aktif → pengaturan global.
 */
function billingAnchorDay(customer, defaultBillingDay = 5) {
  if (isPrepaidType(customer.billing_type)) {
    const active = dayOfValue(customer.activation_date) || dayOfValue(customer.installation_date);
    if (active) return active;
  }
  return num(customer.billing_day) || dayOfValue(customer.activation_date) || defaultBillingDay;
}

/**
 * Hitung siklus langganan yang memuat tanggal referensi.
 * Anchor = hari Tanggal Aktif untuk PRABAYAR | BAYAR DI MUKA, selain itu Siklus Tagihan
 * (billing_day) pelanggan — fallback: hari Tanggal Aktif → pengaturan global.
 * service_end = Tanggal Berakhir siklus (1 hari sebelum mulai siklus berikutnya).
 */
export function cycleForDate(customer, refDate = null, defaultBillingDay = 5) {
  const ref = toIsoDate(refDate) || todayIso();
  const anchor = billingAnchorDay(customer, defaultBillingDay);
  let [y, m] = ref.split('-').map(Number);
  let start = cycleStartIso(anchor, y, m);
  if (start > ref) { // tanggal referensi masih termasuk siklus sebelumnya
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    start = cycleStartIso(anchor, y, m);
  }
  const [sy, sm] = start.split('-').map(Number);
  const ny = sm === 12 ? sy + 1 : sy;
  const nm = sm === 12 ? 1 : sm + 1;
  const nextStart = cycleStartIso(anchor, ny, nm);
  return { start, end: addDaysIso(nextStart, -1), period: start.slice(0, 7) };
}

/** Siklus prabayar dibuat pada H-1 sebelum tanggal mulai masa aktif berikutnya. */
export function prepaidInvoiceCycleForDate(customer, refDate = todayIso(), defaultBillingDay = 5) {
  const tomorrow = addDaysIso(toIsoDate(refDate), 1);
  const cycle = cycleForDate(customer, tomorrow, defaultBillingDay);
  return cycle.start === tomorrow ? cycle : null;
}

/** Periode batch otomatis selalu bulan berjalan (WIB). */
export function automaticInvoicePeriod(date = new Date()) {
  return curPeriod(date);
}

/** Siklus yang dimulai pada periode tagihan, bukan siklus yang kebetulan aktif hari ini. */
export function cycleForPeriod(customer, period, defaultBillingDay = 5) {
  const [year, month] = period.split('-').map(Number);
  return cycleForDate(customer, cycleStartIso(billingAnchorDay(customer, defaultBillingDay), year, month), defaultBillingDay);
}

/**
 * Nilai layanan satu siklus. Prorata hanya berlaku untuk invoice pertama pelanggan
 * PASCABAYAR. Pelanggan PRABAYAR | BAYAR DI MUKA ditagih tarif penuh di depan
 * (tanpa prorata) dan siklusnya mengikuti Tanggal Pemasangan, sehingga tagihan
 * pertama mencakup tepat satu masa aktif sejak pemasangan.
 */
export function invoiceCycleTerms(customer, { refDate = null, defaultBillingDay = 5, hasPriorInvoice = false } = {}) {
  const cycle = cycleForDate(customer, refDate, defaultBillingDay);
  const activationDate = toIsoDate(customer.activation_date);
  const cycleDays = diffDaysIso(cycle.end, cycle.start) + 1;
  const usedDays = activationDate && activationDate > cycle.start && activationDate <= cycle.end
    ? diffDaysIso(cycle.end, activationDate) + 1
    : 0;
  const isPrepaid = isPrepaidType(customer.billing_type);
  const prorated = !isPrepaid && !hasPriorInvoice && usedDays > 0 && usedDays < cycleDays;
  return {
    ...cycle,
    serviceStart: prorated ? activationDate : cycle.start,
    amount: prorated ? Math.round((num(customer.price ?? customer.package_price) * usedDays) / cycleDays) : num(customer.price ?? customer.package_price),
    prorated,
    prorateDays: prorated ? usedDays : 0,
  };
}

/**
 * Generate tagihan otomatis sesuai siklus langganan tiap pelanggan.
 * Jenis penagihan:
 * - PASCABAYAR: diproses batch periode terpilih. Tagihan
 *   PERTAMA dihitung prorata bila Tanggal Aktif berada dalam siklus periode batch tersebut.
 * - PRABAYAR | BAYAR DI MUKA: dibuat H-1 sebelum awal siklus berikutnya, mengikuti
 *   Tanggal Aktif (fallback Tanggal Pemasangan), dengan tarif penuh.
 * Idempoten: pelanggan yang periode pertama/siklus berjalannya sudah ditagih dilewati. Dry-run didukung.
 */
export async function generateInvoices(period, actor = null, dryRun = false, billingType = 'all') {
  await ensureBillingSchema();
  const targetPeriod = period || automaticInvoicePeriod();
  const s = await getSettings(true);
  const taxPercent = num(s.tax_percent) || 0;
  const customers = await q(
     `SELECT c.id, c.name, c.phone, c.billing_day, c.activation_date, c.installation_date, c.billing_type, p.price
     FROM customers c JOIN packages p ON p.id = c.package_id
     WHERE c.status <> 'inactive' AND c.package_id IS NOT NULL`
  );
  const toCreate = [];
  const today = todayIso();
  const defaultBillingDay = num(s.billing_day_default) || 5;
  // Prabayar dibuat H-1 meski awal siklus berada di bulan kalender berikutnya.
  let prepaid = 0;
  for (const c of customers) {
    if (isPrepaidType(c.billing_type)) {
      prepaid++;
      if (billingType === 'pascabayar') continue;
      const cycle = prepaidInvoiceCycleForDate(c, today, defaultBillingDay);
      if (!cycle) continue;
      const dup = await q(
        `SELECT id FROM invoices
         WHERE customer_id = ? AND (service_start = ? OR (service_start IS NULL AND period = ?))
         LIMIT 1`,
        [c.id, cycle.start, cycle.period]
      );
      if (dup[0]) continue;
      const overlap = await q('SELECT id FROM invoices WHERE customer_id = ? AND service_end >= ? LIMIT 1', [c.id, cycle.start]);
      if (overlap[0]) continue;
      const terms = invoiceCycleTerms(c, { refDate: cycle.start, defaultBillingDay });
      toCreate.push({ customer: c, cycle, amount: terms.amount, serviceStart: terms.serviceStart, prorateDays: 0 });
      continue;
    }
    if (billingType === 'prabayar') continue;
    const startFrom = toIsoDate(c.activation_date); // sisa pelanggan = PASCABAYAR
    if (startFrom && startFrom > today) continue; // layanan belum dimulai — belum ditagih

    const prior = await q('SELECT COUNT(*) n FROM invoices WHERE customer_id = ?', [c.id]);
    const hasPriorInvoice = num(prior[0]?.n) > 0;
    const cycle = cycleForPeriod(c, targetPeriod, defaultBillingDay);
    if (startFrom && startFrom > cycle.end) continue; // aktif setelah periode batch
    const dup = await q(
      `SELECT id FROM invoices
       WHERE customer_id = ? AND (service_start = ? OR (service_start IS NULL AND period = ?))
       LIMIT 1`,
      [c.id, cycle.start, cycle.period]
    );
    if (dup[0]) continue;
    // Cegah dobel tagihan saat transisi anchor siklus (siklus baru masih tercakup tagihan sebelumnya)
    const overlap = await q('SELECT id FROM invoices WHERE customer_id = ? AND service_end >= ? LIMIT 1', [c.id, cycle.start]);
    if (overlap[0]) continue;
    // PRORATA: tagihan pertama dihitung proporsional bila Tanggal Aktif jatuh di tengah siklus
    // (mis. tarif 125.000, aktif 27-08, siklus tanggal 1 → 5/31 hari = 20.161) — skema sama dgn form billing lama
    const terms = invoiceCycleTerms(c, { refDate: cycle.start, defaultBillingDay, hasPriorInvoice });
    toCreate.push({
      customer: c,
      cycle,
      amount: terms.amount,
      serviceStart: terms.serviceStart,
      prorateDays: terms.prorateDays,
    });
  }

  if (dryRun) {
    return {
      dryRun: true,
       period: targetPeriod,
      wouldCreate: toCreate.length,
      prorated: toCreate.filter((x) => x.prorateDays > 0).length,
      estimated: toCreate.reduce((sum, x) => sum + num(x.amount), 0),
      skipped: customers.length - toCreate.length - prepaid,
      prepaid,
    };
  }

  let created = 0;
  let prorated = 0;
  for (const { customer: c, cycle: cyc, amount, serviceStart, prorateDays } of toCreate) {
    const countRows = await q('SELECT COUNT(*) n FROM invoices WHERE period = ?', [cyc.period]);
    const seq = num(countRows[0]?.n) + 1;
    const number = `INV-${cyc.period.replace('-', '')}-${String(seq).padStart(4, '0')}`;
    const tax = Math.round((amount * taxPercent) / 100);
    const dueDate = dueDateForInvoice(cyc.end, c.grace_days, s.grace_days);
    try {
      const result = await exec(
        `INSERT INTO invoices (number, customer_id, period, invoice_date, due_date, amount, tax, service_start, service_end)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [number, c.id, cyc.period, todayIso(), dueDate, amount, tax, serviceStart, cyc.end]
      );
      created++;
      if (prorateDays) prorated++;
        const msg = renderTemplate(
          s.template_invoice || 'Halo {nama}, tagihan internet {periode} sebesar {tagihan} telah dibuat. Jatuh tempo: {jatuh_tempo}. - {perusahaan}',
          { nama: c.name, tagihan: formatRupiah(amount + tax), jatuh_tempo: dueDate, periode: cyc.period, perusahaan: s.company_name || 'NetBill' }
        );
        const delivery = await sendBillingNotification({
          eventKey: `invoice:${result.insertId}`, eventType: 'invoice', invoiceId: result.insertId, customerId: c.id,
          phone: c.phone, message: msg, vars: { nama: c.name, tagihan: formatRupiah(amount + tax), jatuh_tempo: dueDate, periode: cyc.period, perusahaan: s.company_name || 'NetBill' },
        });
        if (delivery.ok) {
          await logActivity({
            action: 'billing.invoice_whatsapp', module: 'invoices',
            description: `${number}|Tagihan baru terkirim via ${delivery.provider}`,
            userName: 'Sistem', role: 'sistem',
          });
        } else {
          console.warn(`[billing] WA tagihan ${number} tidak terkirim: ${delivery.reason || 'unknown'}`);
        }
    } catch (err) {
      if (!String(err.message).includes('Duplicate')) throw err; // duplikat (pelanggan, periode) → lewati
    }
  }
  if (created) {
    await logActivity({
      action: 'billing.generate',
      module: 'invoices',
      description: `Generate ${created} tagihan sesuai siklus langganan${prorated ? ` — ${prorated} prorata (periode pertama sejak Tanggal Aktif)` : ''}${prepaid ? ` · ${prepaid} pelanggan prabayar diperiksa untuk generate H-1` : ''}`,
      userId: actor?.id ?? null,
      userName: actor?.name ?? 'Sistem',
      role: actor?.role ?? 'sistem',
    });
    await notifyAll({
      title: 'Tagihan digenerate',
      message: `${created} tagihan berhasil dibuat mengikuti siklus langganan pelanggan${prepaid ? `; ${prepaid} pelanggan prabayar diperiksa untuk jadwal H-1` : ''}.`,
      type: 'success',
    });
  }
  return { created, skipped: customers.length - toCreate.length - prepaid, prepaid, period: targetPeriod };
}

/** Terapkan prorata ke invoice pertama lama yang belum pernah menerima pembayaran. */
export async function recalculateProratedInvoices(actor = null) {
  await ensureBillingSchema();
  const settings = await getSettings(true);
  const taxPercent = num(settings.tax_percent) || 0;
  const rows = await q(
    `SELECT i.*, c.activation_date, c.installation_date, c.billing_day, c.billing_type, c.grace_days, p.price
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     JOIN packages p ON p.id = c.package_id
     WHERE i.status = 'unpaid' AND i.paid_amount = 0
       AND NOT EXISTS (
         SELECT 1 FROM invoices earlier
         WHERE earlier.customer_id = i.customer_id
           AND (COALESCE(earlier.service_start, CONCAT(earlier.period, '-01')) < COALESCE(i.service_start, CONCAT(i.period, '-01'))
             OR (COALESCE(earlier.service_start, CONCAT(earlier.period, '-01')) = COALESCE(i.service_start, CONCAT(i.period, '-01')) AND earlier.id < i.id))
       )`
  );
  let updated = 0;
  for (const inv of rows) {
    const terms = invoiceCycleTerms(inv, {
      refDate: `${inv.period}-15`,
      defaultBillingDay: num(settings.billing_day_default) || 5,
    });
    if (!terms.prorated) continue;
    const tax = Math.round((terms.amount * taxPercent) / 100);
    await exec(
      'UPDATE invoices SET amount = ?, tax = ?, service_start = ?, service_end = ?, due_date = ? WHERE id = ?',
      [terms.amount, tax, terms.serviceStart, terms.end, dueDateForInvoice(terms.end, inv.grace_days, settings.grace_days), inv.id],
    );
    updated++;
  }
  if (updated) {
    await logActivity({
      action: 'billing.recalculate_prorata',
      module: 'invoices',
      description: `Rekalkulasi prorata pada ${updated} tagihan lama belum dibayar`,
      userId: actor?.id ?? null,
      userName: actor?.name ?? 'Sistem',
      role: actor?.role ?? 'sistem',
    });
  }
  return { checked: rows.length, updated };
}

/** Terapkan batas waktu pembayaran pelanggan ke tagihan yang belum menerima pembayaran. */
export async function recalculateInvoiceDueDates(actor = null) {
  await ensureBillingSchema();
  const settings = await getSettings(true);
  const rows = await q(
    `SELECT i.id, i.due_date, i.service_end, c.grace_days
     FROM invoices i JOIN customers c ON c.id = i.customer_id
     WHERE i.status = 'unpaid' AND i.paid_amount = 0
       AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id)`
  );
  let updated = 0;
  for (const inv of rows) {
    const dueDate = dueDateForInvoice(inv.service_end || inv.due_date, inv.grace_days, settings.grace_days);
    if (toIsoDate(inv.due_date) === dueDate) continue;
    await exec('UPDATE invoices SET due_date = ? WHERE id = ?', [dueDate, inv.id]);
    updated++;
  }
  if (updated) {
    await logActivity({
      action: 'billing.recalculate_due_dates', module: 'invoices',
      description: `Memperbarui jatuh tempo pada ${updated} tagihan belum dibayar`,
      userId: actor?.id ?? null, userName: actor?.name ?? 'Sistem', role: actor?.role ?? 'sistem',
    });
  }
  return { checked: rows.length, updated };
}

/** Terapkan denda keterlambatan ke semua tagihan lewat jatuh tempo */
export async function applyLateFees(actor = null) {
  const s = await getSettings(true);
  const type = s.late_fee_type || 'fixed';
  const value = num(s.late_fee_value) || 0;
  if (!value) return { applied: 0 };
  const rows = await q(
    `SELECT id, amount FROM invoices
     WHERE status IN ('unpaid','partial') AND late_fee = 0 AND due_date < CURDATE()`
  );
  let applied = 0;
  for (const inv of rows) {
    const fee = type === 'percent' ? Math.round((num(inv.amount) * value) / 100) : value;
    await exec('UPDATE invoices SET late_fee = ? WHERE id = ?', [fee, inv.id]);
    applied++;
  }
  if (applied) {
    await logActivity({
      action: 'billing.late_fee',
      module: 'invoices',
      description: `Denda keterlambatan diterapkan ke ${applied} tagihan`,
      userId: actor?.id ?? null,
      userName: actor?.name ?? 'Sistem',
      role: actor?.role ?? 'sistem',
    });
  }
  return { applied };
}

/** Auto isolir pelanggan aktif yang menunggak melewati batas waktu (toleransi per pelanggan, fallback global) */
export async function autoIsolate(actor = null) {
  await ensureBillingSchema();
  await ensureRoutersSchema(); // kolom Auto Isolir per server (routers.auto_isolate)
  const s = await getSettings(true);
  const grace = Math.max(0, num(s.grace_days) || 0);
  // Hormati toggle "Aktifkan Auto Isolir?" per server (halaman Server Mikrotik):
  // pelanggan yang paketnya terhubung ke server dengan auto_isolate = 0 dilewati;
  // pelanggan tanpa router spesifik pada paketnya tetap diikutkan.
  const rows = await q(
    `SELECT c.id, c.name, c.pppoe_username FROM customers c
     JOIN invoices i ON i.customer_id = c.id
     LEFT JOIN packages p ON p.id = c.package_id
     LEFT JOIN routers rr ON rr.id = p.router_id
     WHERE c.status = 'active' AND c.no_auto_isolate = 0
       AND c.pppoe_username IS NOT NULL AND c.pppoe_username <> ''
       AND (p.router_id IS NULL OR rr.auto_isolate = 1)
       AND i.status IN ('unpaid','partial')
       AND i.due_date < DATE_SUB(CURDATE(), INTERVAL COALESCE(c.grace_days, ?) DAY)
     GROUP BY c.id, c.name, c.pppoe_username`,
    [grace]
  );
  let isolated = 0;
  for (const c of rows) {
    try {
      await monitoring.doAction(c.pppoe_username, 'isolir', actor);
      isolated++;
    } catch (err) {
      console.error('[billing] isolir gagal untuk', c.name, err.message);
    }
  }
  if (isolated) {
    await notifyAll({
      title: 'Auto isolir berjalan',
      message: `${isolated} pelanggan menunggak diisolir otomatis (toleransi ${grace} hari).`,
      type: 'warning',
    });
  }
  return { isolated, checked: rows.length };
}

/**
 * Auto disable pelanggan yang tetap menunggak setelah masa isolir + disable_after_days (PRD 5.5, alur 9.1).
 * Secret PPPoE dimatikan di MikroTik (tidak bisa konek) & auth RADIUS ditolak (Auth-Type := Reject).
 * Otomatis enable + aktif kembali saat pembayaran lunas terinput.
 */
export async function autoDisable(actor = null) {
  await ensureBillingSchema();
  const s = await getSettings(true);
  if (String(s.auto_disable_enabled ?? '1') !== '1') return { disabled: 0, checked: 0, skipped: true };
  const grace = Math.max(0, num(s.grace_days) || 0);
  const extra = Math.max(0, num(s.disable_after_days) || 7);
  const rows = await q(
    `SELECT c.id, c.name, c.pppoe_username FROM customers c
     JOIN invoices i ON i.customer_id = c.id
     WHERE c.status = 'isolated' AND c.no_auto_isolate = 0
       AND c.pppoe_username IS NOT NULL AND c.pppoe_username <> ''
       AND i.status IN ('unpaid','partial')
       AND i.due_date < DATE_SUB(CURDATE(), INTERVAL (COALESCE(c.grace_days, ?) + ?) DAY)
     GROUP BY c.id, c.name, c.pppoe_username`,
    [grace, extra]
  );
  let disabled = 0;
  for (const c of rows) {
    try {
      await monitoring.doAction(c.pppoe_username, 'disable', actor);
      disabled++;
    } catch (err) {
      console.error('[billing] disable gagal untuk', c.name, err.message);
    }
  }
  if (disabled) {
    await notifyAll({
      title: 'Auto disable berjalan',
      message: `${disabled} pelanggan menunggak berat dinonaktifkan otomatis (isolir +${extra} hari).`,
      type: 'warning',
    });
  }
  return { disabled, checked: rows.length };
}

/**
 * Perpanjang masa aktif pelanggan hingga Tanggal Berakhir tagihan yang dibayar
 * (menerima tanggal penuh 'YYYY-MM-DD' atau 'YYYY-MM' untuk tagihan lama).
 * Tidak pernah memendekkan masa aktif yang sudah berjalan (GREATEST).
 */
export async function extendActivePeriod(customerId, untilDate) {
  await ensureBillingSchema();
  if (!customerId || !untilDate) return;
  let iso = toIsoDate(untilDate);
  if (/^\d{4}-\d{2}$/.test(iso)) {
    const [y, m] = iso.split('-').map(Number);
    iso = `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`;
  }
  await exec(
    'UPDATE customers SET active_until = GREATEST(COALESCE(active_until, ?), ?) WHERE id = ?',
    [iso, iso, customerId]
  );
}

/** Aktifkan kembali pelanggan setelah pembayaran lunas (flow 9.1 langkah 5) — termasuk yang di-disable */
export async function activateCustomer(customerId, actor = null) {
  await ensureBillingSchema();
  const rows = await q(
    `SELECT c.*, p.mikrotik_profile FROM customers c
     LEFT JOIN packages p ON p.id = c.package_id WHERE c.id = ?`,
    [customerId]
  );
  const c = rows[0];
  if (!c) return { ok: false };
  if (c.pppoe_username) {
    try {
      await monitoring.doAction(c.pppoe_username, c.status === 'disabled' ? 'enable' : 'activate', actor);
    } catch (err) {
      console.error('[billing] aktivasi PPPoE gagal:', err.message);
    }
  } else {
    await exec('UPDATE customers SET status = "active" WHERE id = ?', [customerId]);
  }
  return { ok: true };
}

/** Kirim satu konfirmasi setelah invoice berubah menjadi lunas. */
export async function sendPaymentNotification(inv) {
  const [customer] = await q('SELECT id, name, phone FROM customers WHERE id = ?', [inv.customer_id]);
  if (!customer?.phone) return { ok: false, reason: 'no-phone' };
  const s = await getSettings(true);
  const vars = { nama: customer.name, tagihan: formatRupiah(invoiceTotal(inv)), jatuh_tempo: inv.due_date, periode: inv.period, perusahaan: s.company_name || 'NetBill' };
  const msg = renderTemplate(
    s.template_paid || 'Terima kasih {nama}, pembayaran tagihan {periode} telah kami terima. - {perusahaan}',
    vars
  );
  return sendBillingNotification({
    eventKey: `paid:${inv.id}`, eventType: 'paid', invoiceId: inv.id, customerId: customer.id, phone: customer.phone, message: msg, vars,
  });
}

/** Cek apakah reminder sudah terkirim hari ini (hindari dobel) */
async function reminderSentToday(invoiceNumber, label) {
  const rows = await q(
    `SELECT COUNT(*) n FROM activity_logs
     WHERE action = 'billing.reminder' AND DATE(created_at) = CURDATE()
       AND description LIKE CONCAT('%', ?, '|', ?, '%')`,
    [invoiceNumber, label]
  );
  return num(rows[0]?.n) > 0;
}

async function markReminderSent(invoiceNumber, label, channel) {
  await logActivity({
    action: 'billing.reminder',
    module: 'invoices',
    description: `${invoiceNumber}|${label} reminder ${channel} terkirim`,
    userName: 'Sistem',
    role: 'sistem',
  });
}

/** Kirim reminder WA: H-3, H-1, hari-H, dan jatuh tempo (overdue) */
export async function sendReminders() {
  const s = await getSettings(true);
  const tiers = [
    { diff: 7, key: 'template_h7', label: 'H-7', eventType: 'h7' },
    { diff: 3, key: 'template_h3', label: 'H-3', eventType: 'h3' },
    { diff: 1, key: 'template_h1', label: 'H-1', eventType: 'h1' },
    { diff: 0, key: 'template_due', label: 'Hari-H', eventType: 'due' },
  ];
  let sent = 0;
  for (const t of tiers) {
    const rows = await q(
      `SELECT i.*, c.name, c.phone FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.status IN ('unpaid','partial') AND i.due_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
      [t.diff]
    );
    for (const inv of rows) {
      if (await reminderSentToday(inv.number, t.label)) continue;
      const msg = renderTemplate(
        s[t.key] ||
          'Halo {nama}, tagihan internet {periode} sebesar {tagihan} akan jatuh tempo pada {jatuh_tempo}. Mohon lakukan pembayaran. - {perusahaan}',
        {
          nama: inv.name,
          tagihan: formatRupiah(invoiceTotal(inv)),
          jatuh_tempo: inv.due_date,
          periode: inv.period,
          perusahaan: s.company_name || 'NetBill',
        }
      );
      const delivery = await sendBillingNotification({
        eventKey: `reminder:${t.eventType}:${inv.id}:${todayIso()}`, eventType: t.eventType, invoiceId: inv.id, customerId: inv.customer_id,
        phone: inv.phone, message: msg,
        vars: { nama: inv.name, tagihan: formatRupiah(invoiceTotal(inv)), jatuh_tempo: inv.due_date, periode: inv.period, perusahaan: s.company_name || 'NetBill' },
      });
      if (delivery.ok) {
        await markReminderSent(inv.number, t.label, `WA (${delivery.provider})`);
        sent++;
      }
    }
  }
  // Overdue (sudah lewat jatuh tempo, belum lunas)
  const overdue = await q(
    `SELECT i.*, c.name, c.phone FROM invoices i JOIN customers c ON c.id = i.customer_id
     WHERE i.status IN ('unpaid','partial') AND i.due_date < CURDATE()`
  );
  for (const inv of overdue) {
    if (await reminderSentToday(inv.number, 'Overdue')) continue;
    const msg = renderTemplate(
      s.template_overdue ||
        'Halo {nama}, tagihan {periode} sebesar {tagihan} telah jatuh tempo. Segera lakukan pembayaran agar layanan tidak diisolir. - {perusahaan}',
      {
        nama: inv.name,
        tagihan: formatRupiah(invoiceTotal(inv)),
        periode: inv.period,
        perusahaan: s.company_name || 'NetBill',
      }
    );
    const delivery = await sendBillingNotification({
      eventKey: `reminder:overdue:${inv.id}:${todayIso()}`, eventType: 'overdue', invoiceId: inv.id, customerId: inv.customer_id,
      phone: inv.phone, message: msg,
      vars: { nama: inv.name, tagihan: formatRupiah(invoiceTotal(inv)), jatuh_tempo: inv.due_date, periode: inv.period, perusahaan: s.company_name || 'NetBill' },
    });
    if (delivery.ok) {
      await markReminderSent(inv.number, 'Overdue', `WA (${delivery.provider})`);
      sent++;
    }
  }
  if (sent) {
    await notifyAll({
      title: 'Reminder terkirim',
      message: `${sent} reminder pembayaran terkirim via WhatsApp.`,
      type: 'info',
    });
  }
  return { sent };
}

function formatRupiah(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

async function sendBillingNotification({ eventKey, eventType, invoiceId, customerId, phone, message, vars }) {
  const settings = await getSettings();
  if (settings.wa_gateway === 'miber') {
    return sendMiberBillingNotification({ eventKey, eventType, invoiceId, customerId, phone, vars });
  }
  return sendWhatsApp(phone, message);
}

export default { generateInvoices, applyLateFees, autoIsolate, autoDisable, activateCustomer, extendActivePeriod, sendPaymentNotification, sendReminders };

