import { q, exec } from '../db.js';
import { getSettings, num } from '../utils/helper.js';
import { parseCustomerCsv, mapCustomerRow, normName, speedFromName } from '../utils/csvImport.js';
import * as radius from './radius.js';
import * as monitoring from './monitoring.js';
import { customerPhone } from '../utils/phone.js';

/** Batas jumlah item rincian (duplikat/error/warning) yang dilaporkan ke klien */
const MAX_REPORT_ROWS = 200;

/**
 * Import pelanggan dari CSV migrasi billing lama.
 * Pemetaan kolom utama:
 *  - No Pelanggan → kode pelanggan (bila kosong, dibuat otomatis C-XXXX)
 *  - Username / Password → kredensial PPPoE + sinkronisasi RADIUS
 *  - Paket + Tarif → dicocokkan ke master paket (nama dibandingkan tanpa spasi;
 *    bila tidak ada, paket baru dibuat otomatis)
 *  - Area → master area dibuat bila belum terdaftar
 *  - Masa Aktif → hari tagihan (billing_day); AKTIF/SUSPEND → active/isolated
 *  - Tanggal Pemasangan → tanggal aktivasi; Dibuat → created_at (jejak data lama)
 *
 * @param {string} text  Isi file CSV
 * @param {object} opts  { dryRun, mode: 'skip'|'update', userId }
 * @returns {object} Laporan { total, inserted, updated, skipped, failed, ... }
 */
export async function importCustomersFromCsv(text, { dryRun = false, mode = 'skip', userId = null } = {}) {
  let parsed;
  try {
    parsed = parseCustomerCsv(text);
  } catch (err) {
    throw Object.assign(new Error(err.message), { status: 400 });
  }
  const effMode = mode === 'update' ? 'update' : 'skip';
  const report = {
    total: parsed.rows.length, inserted: 0, updated: 0, skipped: 0, failed: 0,
    dry_run: !!dryRun, mode: effMode,
    packages_created: [], areas_created: [], duplicates: [], errors: [], warnings: [],
  };

  const settings = await getSettings(true);
  const defaultBillingDay = num(settings.billing_day_default) || 5;

  // Referensi: master paket (pencocokan nama ternormalisasi), pelanggan existing, master area
  const pkgRows = await q('SELECT id, name, price FROM packages');
  const pkgByNorm = new Map(pkgRows.map((p) => [normName(p.name), p]));
  const custRows = await q('SELECT id, code, pppoe_username, pppoe_password FROM customers');
  const byCode = new Map(custRows.map((c) => [c.code, c]));
  const byUser = new Map(custRows.filter((c) => c.pppoe_username).map((c) => [c.pppoe_username, c]));
  const areaRows = await q('SELECT name FROM areas');
  const knownAreas = new Set(areaRows.map((a) => String(a.name).toLowerCase()));
  const fileCodes = new Set();
  const fileUsers = new Set();
  const pendingPkgs = new Map();
  const pendingAreas = new Set();
  let codeSeq = null;

  /** Kode pelanggan berurutan C-XXXX untuk baris tanpa "No Pelanggan" */
  const genCode = async () => {
    if (codeSeq === null) {
      const mx = await q("SELECT MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)) m FROM customers WHERE code LIKE 'C-%'");
      codeSeq = Number(mx[0]?.m) || 0;
    }
    codeSeq += 1;
    return `C-${String(codeSeq).padStart(4, '0')}`;
  };

  for (let i = 0; i < parsed.rows.length; i++) {
    const { cells, no, line } = parsed.rows[i];
    const rowNo = no || line;
    const rec = mapCustomerRow(cells, parsed.cols, { defaultBillingDay });
    rec.phone = customerPhone(rec.phone);
    if (!rec.name) {
      report.failed += 1;
      if (report.errors.length < MAX_REPORT_ROWS) report.errors.push({ row: rowNo, name: '-', message: 'Kolom Nama kosong' });
      continue;
    }

    try {
      const uname = rec.pppoe_username;
      const code = rec.code;
      const dupDb = (uname && byUser.get(uname)) || (code && byCode.get(code)) || null;
      const dupFile = (uname && fileUsers.has(uname)) || (code && fileCodes.has(code));
      if (uname) fileUsers.add(uname);
      if (code) fileCodes.add(code);

      // Paket: cocokkan nama ternormalisasi (parsial + tarif sama); buat baru bila tidak ada
      let pkgId = null;
      if (rec.pkgName) {
        const norm = normName(rec.pkgName);
        let pkg = pkgByNorm.get(norm);
        if (!pkg && rec.price !== null) {
          pkg = [...pkgByNorm.values()].find((p) => norm.includes(normName(p.name)) && Number(p.price) === rec.price) || null;
        }
        if (pkg) {
          pkgId = pkg.id;
        } else {
          let pend = pendingPkgs.get(norm);
          if (!pend) {
            pend = { id: null, name: rec.pkgName, price: rec.price ?? 0 };
            pendingPkgs.set(norm, pend);
            if (!dryRun) {
              const ins = await exec(
                'INSERT INTO packages (name, speed, price, base_price, is_active) VALUES (?,?,?,?,1)',
                [pend.name, speedFromName(pend.name), pend.price, pend.price]
              );
              pend.id = ins.insertId;
              pkgByNorm.set(norm, pend);
            }
            report.packages_created.push(pend.name);
          }
          pkgId = pend.id;
        }
      }

      // Master area dibuat otomatis bila belum terdaftar
      if (rec.area) {
        const lower = rec.area.toLowerCase();
        if (!knownAreas.has(lower) && !pendingAreas.has(lower)) {
          pendingAreas.add(lower);
          report.areas_created.push(rec.area);
          if (!dryRun) await exec('INSERT IGNORE INTO areas (name, is_active) VALUES (?, 1)', [rec.area]);
        }
      }

      if (dupDb) {
        if (effMode === 'update') {
          if (!dryRun) {
            await exec(
              `UPDATE customers SET name=?, nik=?, phone=?, email=?, address=?, area=?, latitude=?, longitude=?,
                 package_id=?, activation_date=?, billing_day=?, status=?, odp=?, odc=?, redaman=?,
                 static_ip=?, ont_brand=?, ont_serial=?, tag=?, notes=?,
                 ppp_service=?, ppp_local_address=?, ppp_remote_address=? WHERE id=?`,
              [rec.name, rec.nik, rec.phone, rec.email, rec.address, rec.area, rec.latitude, rec.longitude,
                pkgId, rec.activation_date, rec.billing_day, rec.status, rec.odp, rec.odc, rec.redaman,
                rec.static_ip, rec.ont_brand, rec.ont_serial, rec.tag, rec.notes,
                rec.ppp_service, rec.ppp_local_address, rec.ppp_remote_address, dupDb.id]
            );
            if (!dupDb.pppoe_username && uname) {
              await exec('UPDATE customers SET pppoe_username=? WHERE id=?', [uname, dupDb.id]);
            }
            await radius.syncCustomer({
              pppoe_username: dupDb.pppoe_username || uname,
              pppoe_password: rec.pppoe_password || dupDb.pppoe_password,
            });
            if (pkgId) await radius.applyCustomerProfile(dupDb.id);
          }
          report.updated += 1;
        } else {
          report.skipped += 1;
          if (report.duplicates.length < MAX_REPORT_ROWS) {
            report.duplicates.push({ row: rowNo, name: rec.name, code: code || dupDb.code, reason: uname ? 'username PPPoE sudah terdaftar' : 'no pelanggan sudah terdaftar' });
          }
        }
        continue;
      }
      if (dupFile) {
        report.skipped += 1;
        if (report.duplicates.length < MAX_REPORT_ROWS) {
          report.duplicates.push({ row: rowNo, name: rec.name, code: code || '-', reason: 'duplikat di dalam file CSV' });
        }
        continue;
      }

      if (dryRun) { report.inserted += 1; continue; }

      const finalCode = code || await genCode();
      const cols = ['code', 'name', 'nik', 'phone', 'email', 'address', 'area', 'latitude', 'longitude',
        'package_id', 'activation_date', 'billing_day', 'status', 'pppoe_username', 'pppoe_password',
        'ppp_service', 'ppp_local_address', 'ppp_remote_address', 'odp', 'odc', 'redaman',
        'static_ip', 'ont_brand', 'ont_serial', 'tag', 'notes', 'created_by'];
      const vals = [finalCode, rec.name, rec.nik, rec.phone, rec.email, rec.address, rec.area, rec.latitude, rec.longitude,
        pkgId, rec.activation_date, rec.billing_day, rec.status, uname, rec.pppoe_password,
        rec.ppp_service, rec.ppp_local_address, rec.ppp_remote_address, rec.odp, rec.odc, rec.redaman,
        rec.static_ip, rec.ont_brand, rec.ont_serial, rec.tag, rec.notes, userId];
      if (rec.created_at) { cols.push('created_at'); vals.push(rec.created_at); }
      const result = await exec(
        `INSERT INTO customers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        vals
      );
      byCode.set(finalCode, { id: result.insertId, code: finalCode, pppoe_username: uname, pppoe_password: rec.pppoe_password });
      if (uname) byUser.set(uname, { id: result.insertId, code: finalCode, pppoe_username: uname, pppoe_password: rec.pppoe_password });
      try {
        await radius.syncCustomer({ pppoe_username: uname, pppoe_password: rec.pppoe_password });
        if (pkgId) await radius.applyCustomerProfile(result.insertId);
      } catch (err) {
        if (report.warnings.length < MAX_REPORT_ROWS) {
          report.warnings.push(`Baris ${rowNo} (${rec.name}): sinkronisasi RADIUS gagal — ${err.message}`);
        }
      }
      report.inserted += 1;
    } catch (err) {
      report.failed += 1;
      if (report.errors.length < MAX_REPORT_ROWS) {
        report.errors.push({ row: rowNo, name: rec?.name || '-', message: err.message });
      }
    }
  }

  // Pantauan PPPoE aktif dimuat ulang sekali setelah import (bukan per baris)
  if (!dryRun && (report.inserted > 0 || report.updated > 0)) {
    try { await monitoring.init(); } catch { /* monitoring opsional saat import */ }
  }
  return report;
}