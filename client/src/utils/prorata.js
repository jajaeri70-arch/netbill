/**
 * Util kalkulasi skema tagihan & prorata pelanggan — paritas dengan engine billing
 * server (server/src/services/billing.js):
 *  - Siklus ber-anchor ke "Siklus Tagihan" (billing_day) pelanggan; hari anchor yang
 *    melebihi jumlah hari bulan dicabut ke akhir bulan (sama dengan cycleStartIso).
 *  - Tagihan PERTAMA dihitung prorata bila Tanggal Aktif jatuh di tengah siklus:
 *    nominal = tarif × hari pemakaian ÷ panjang siklus penuh (mis. 125.000 × 5/31 ≈ 20.161).
 *  - Tanggal Tagihan = awal siklus (tagihan prorate = Tanggal Aktif),
 *    Tgl Isolir = akhir siklus + Batas Waktu (grace) hari.
 *  - PRABAYAR | BAYAR DI MUKA: Tanggal Berakhir = batas siklus + Batas Waktu
 *    Pembayaran (grace), karena pelanggan tetap aktif s/d tenggat bayar.
 *    Siklus pertama juga TIDAK di-prorata (bayar di muka = tarif penuh di depan).
 */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');
const toDate = (iso) => new Date(`${iso}T00:00:00`);
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const diffDays = (a, b) => Math.round((a - b) / 86400000); // a, b = Date tengah malam
const daysInMonth = (y, mIdx) => new Date(y, mIdx + 1, 0).getDate();
/** Tanggal anchor pada satu bulan — hari > jumlah hari bulan dicabut ke akhir bulan */
const anchorInMonth = (anchor, y, mIdx) => new Date(y, mIdx, Math.min(Math.max(1, anchor), daysInMonth(y, mIdx)));

/** Anchor berikutnya SETELAH tanggal referensi (strictly after) sesuai satuan siklus */
function nextAnchor(anchor, after, unit) {
  if (unit === 'HARI') return addDays(after, 1);
  if (unit === 'TAHUN') {
    let d = anchorInMonth(anchor, after.getFullYear(), after.getMonth());
    if (d <= after) d = anchorInMonth(anchor, after.getFullYear() + 1, after.getMonth());
    return d;
  }
  let d = anchorInMonth(anchor, after.getFullYear(), after.getMonth());
  if (d <= after) d = anchorInMonth(anchor, after.getFullYear(), after.getMonth() + 1);
  return d;
}

/** Anchor terakhir SEBELUM/sama dengan tanggal referensi (untuk panjang siklus penuh) */
function prevAnchor(anchor, on, unit) {
  if (unit === 'TAHUN') {
    let d = anchorInMonth(anchor, on.getFullYear(), on.getMonth());
    if (d > on) d = anchorInMonth(anchor, on.getFullYear() - 1, on.getMonth());
    return d;
  }
  let d = anchorInMonth(anchor, on.getFullYear(), on.getMonth());
  if (d > on) d = anchorInMonth(anchor, on.getFullYear(), on.getMonth() - 1);
  return d;
}

/** Format tanggal tabel skema: 27 Aug 2026 */
export function fmtSchemeDate(value) {
  if (!value) return '-';
  const d = value instanceof Date ? value : toDate(String(value).slice(0, 10));
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Tanggal Berakhir otomatis = awal siklus ke-(N+1) — batas siklus (eksklusif),
 * mis. aktif 27-08, Siklus Tagihan 1, Masa Aktif 1 BULAN → berakhir 01-09-2026.
 * `extraDays` = tambahan "Batas Waktu Pembayaran / Suspend / Isolir" (grace) yang
 * hanya dipakai untuk penagihan PRABAYAR | BAYAR DI MUKA: pelanggan tetap aktif
 * s/d tenggat bayar, sehingga Tanggal Berakhir = batas siklus + grace.
 */
export function computeBerakhir({ activeDate, anchorDay = 1, periods = 1, unit = 'BULAN', extraDays = 0 }) {
  const act = activeDate ? toDate(activeDate) : null;
  if (!act || Number.isNaN(act.getTime())) return null;
  const anchor = Math.min(Math.max(1, Number(anchorDay) || 1), 31);
  const n = Math.max(1, Number(periods) || 1);
  const extra = Math.max(0, Number(extraDays) || 0);
  if (unit === 'HARI') return isoOf(addDays(act, n + extra));
  let boundary = nextAnchor(anchor, act, unit);
  for (let k = 1; k < n; k++) boundary = nextAnchor(anchor, boundary, unit);
  return isoOf(addDays(boundary, extra));
}

/**
 * Baris skema pembayaran/tagihan (pratinjau `rowCount` siklus pertama).
 * `noProrata` = true untuk penagihan PRABAYAR | BAYAR DI MUKA: siklus pertama
 * tetap ditagih penuh (tarif paket) walau belum genap satu siklus.
 * Return: [{ no, masaAktif, tagihan, isolir, pakai: [mulai, selesai], nominal, prorate, prorateDays }]
 */
export function buildBillScheme({ activeDate, anchorDay = 1, price = 0, periods = 1, unit = 'BULAN', graceDays = 0, rowCount = 3, berakhir = null, noProrata = false }) {
  const act = activeDate ? toDate(activeDate) : null;
  if (!act || Number.isNaN(act.getTime())) return [];
  const anchor = Math.min(Math.max(1, Number(anchorDay) || 1), 31);
  const n = Math.max(1, Number(periods) || 1);
  const tarif = Number(price) || 0;
  const grace = Math.max(0, Number(graceDays) || 0);
  // Tanggal Berakhir (otomatis/manual) = batas siklus: periode pertama s/d (Tanggal Berakhir − 1 hari),
  // siklus berikutnya mulai tepat pada Tanggal Berakhir — mengikuti skema billing lama
  const boundary = berakhir ? toDate(berakhir) : null;
  const useBoundary = boundary && !Number.isNaN(boundary.getTime()) && unit !== 'HARI' && boundary > act;
  const unitLabel = unit === 'BULAN' ? 'Bulan' : unit === 'TAHUN' ? 'Tahun' : 'Hari';
  const rows = [];
  let start = new Date(act);
  for (let i = 0; i < rowCount; i++) {
    let end, cycleDays;
    if (unit === 'HARI') {
      end = addDays(start, n - 1);
      cycleDays = n;
    } else if (i === 0 && useBoundary) {
      end = addDays(boundary, -1);
      cycleDays = diffDays(end, prevAnchor(anchor, start, unit)) + 1;
    } else {
      end = addDays(nextAnchor(anchor, start, unit), -1);
      cycleDays = diffDays(end, prevAnchor(anchor, start, unit)) + 1;
    }
    const used = diffDays(end, start) + 1;
    // PRABAYAR | BAYAR DI MUKA → tanpa prorata: siklus pertama ditagih tarif penuh
    const prorate = !noProrata && used < cycleDays;
    rows.push({
      no: i + 1,
      masaAktif: `${n} ${unitLabel}${prorate ? ` ( Prorate ${used} Hari )` : ''}`,
      tagihan: isoOf(start),
      isolir: isoOf(addDays(end, grace)),
      pakai: [isoOf(start), isoOf(end)],
      nominal: prorate ? Math.round((tarif * used) / cycleDays) : tarif,
      prorate,
      prorateDays: prorate ? used : 0,
    });
    start = addDays(end, 1);
  }
  return rows;
}
