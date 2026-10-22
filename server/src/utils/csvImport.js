/**
 * Utilitas import CSV migrasi pelanggan dari sistem billing lama.
 * Menangani keunikan file ekspor sistem lama:
 *  - direktif separator Excel pada baris pertama (contoh: sep=,)
 *  - sel formula Excel ="nilai" (agar NIK/nomor telepon tidak berubah jadi notasi ilmiah)
 *  - tanggal lokal dd/mm/yyyy (opsional diikuti jam HH:mm)
 *  - kolom berkutip yang memuat koma / tanda kutip ganda
 */

/** Bersihkan satu sel CSV: buang spasi berlebih & pembungkus formula Excel ="..." */
export function excelClean(value) {
  let s = value === null || value === undefined ? '' : String(value).trim();
  if (s.startsWith('="') && s.endsWith('"')) s = s.slice(2, -1).trim();
  return s;
}

/** Nama ternormalisasi utk pencocokan paket: huruf kecil tanpa spasi ("Up to" == "Upto") */
export const normName = (v) => String(v || '').toLowerCase().replace(/\s+/g, '');

/** dd/mm/yyyy → 'YYYY-MM-DD', atau null bila tidak dikenali */
export function parseDateId(value) {
  const m = String(value || '').trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** dd/mm/yyyy [HH:mm[:ss]] → 'YYYY-MM-DD HH:MM:SS', atau null */
export function parseDateTimeId(value) {
  const s = String(value || '').trim();
  const date = parseDateId(s);
  if (!date) return null;
  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const hh = t ? String(t[1]).padStart(2, '0') : '00';
  const mm = t ? t[2] : '00';
  const ss = t && t[3] ? t[3] : '00';
  return `${date} ${hh}:${mm}:${ss}`;
}

/** Ekstrak koordinat dari teks/tautan Maps: "...?q=-7.8685,112.6556" → { latitude, longitude } */
export function extractLatLng(value) {
  const m = String(value || '').match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return { latitude: null, longitude: null };
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { latitude: null, longitude: null };
  return { latitude, longitude };
}

/** Kecepatan dari nama paket: "(PROMO) Up to 10mbps" → "10Mbps" */
export function speedFromName(name) {
  const m = String(name || '').match(/(\d+(?:[.,]\d+)?)\s*mbps/i);
  return m ? `${m[1].replace(',', '.')}Mbps` : '';
}

/** Alias nama kolom yang dikenali (header dinormalisasi: huruf kecil, spasi tunggal) */
const HEADER_ALIASES = {
  no: ['no'],
  code: ['no pelanggan', 'kode pelanggan', 'kode', 'id pelanggan'],
  nik: ['no ktp', 'nik', 'ktp'],
  name: ['nama', 'nama pelanggan', 'name'],
  phone: ['telepon', 'no hp', 'no telp', 'hp', 'phone'],
  email: ['email'],
  username: ['username', 'user pppoe', 'pppoe username', 'user'],
  password: ['password', 'pass pppoe', 'pppoe password', 'pass'],
  odp: ['odp'],
  tag: ['kategori', 'tag'],
  area: ['area', 'wilayah'],
  package: ['paket', 'paket internet', 'package'],
  price: ['tarif', 'harga', 'harga paket'],
  activeUntil: ['masa aktif'],
  dueDate: ['jatuh tempo'],
  billingDay: ['tanggal tagihan', 'tgl tagihan', 'billing day'],
  status: ['status'],
  address: ['alamat', 'address'],
  village: ['desa', 'kelurahan'],
  district: ['kecamatan'],
  city: ['kota', 'kabupaten'],
  maps: ['maps', 'map', 'koordinat', 'lokasi'],
  notes: ['catatan', 'keterangan', 'note'],
  pppService: ['service ppp'],
  localAddress: ['local address'],
  remoteAddress: ['remote address'],
  regDate: ['tanggal daftar'],
  installDate: ['tanggal pemasangan', 'tanggal pasang'],
  createdAt: ['dibuat'],
  ontBrand: ['merk ont', 'merek ont', 'ont brand'],
  ontSerial: ['serial ont', 'sn ont', 'ont serial'],
  staticIp: ['ip statis', 'static ip'],
  odc: ['odc'],
  redaman: ['redaman', 'redaman pon'],
};

/** Rasio sel yang berisi tanggal dd/mm/yyyy penuh pada sebuah kolom */
function dateRatio(rows, idx) {
  if (idx === null || idx === undefined || idx < 0) return 0;
  let hit = 0;
  let total = 0;
  for (const r of rows) {
    const v = String(r[idx] || '').trim();
    if (!v) continue;
    total += 1;
    if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}$/.test(v)) hit += 1;
  }
  return total ? hit / total : 0;
}

/** Petakan header CSV → indeks kolom logis (null bila kolom tidak ada) */
function mapHeader(cells) {
  const norm = cells.map((c) => c.toLowerCase().replace(/\s+/g, ' ').trim());
  const cols = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = norm.findIndex((h) => aliases.includes(h));
    cols[key] = idx === -1 ? null : idx;
  }
  return cols;
}

/**
 * Parse teks CSV → { header, cols, rows: [{ no, line, cells }] }.
 * Melempar Error berbahasa Indonesia bila file kosong / kolom "Nama" tidak ditemukan.
 */
export function parseCustomerCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  let delim = ',';
  let start = 0;
  if (lines[0] && /^sep=(.)\s*$/i.test(lines[0].trim())) {
    delim = lines[0].trim().match(/^sep=(.)\s*$/i)[1];
    start = 1;
  } else {
    const commas = (lines[0] || '').match(/,/g)?.length || 0;
    const semis = (lines[0] || '').match(/;/g)?.length || 0;
    if (semis > commas) delim = ';';
  }
  const body = lines.slice(start).join('\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const cleaned = rows.map((r) => r.map(excelClean)).filter((r) => r.some((c) => c !== ''));
  if (!cleaned.length) throw new Error('File CSV kosong atau tidak terbaca');
  const header = cleaned[0];
  const cols = mapHeader(header);
  if (cols.name === null) throw new Error('Kolom "Nama" tidak ditemukan pada baris pertama CSV');
  // Beberapa ekspor billing lama menukar posisi kolom Masa Aktif/Jatuh Tempo dengan
  // kolom durasi ("1 BULAN")/rentang suspend di sekitarnya — deteksi kolom bertanggal
  // di antara Tarif dan Status agar hari tagihan (billing_day) selalu akurat.
  if (cols.price !== null && cols.status !== null) {
    const dataRows = cleaned.slice(1);
    const dateCols = [];
    for (let i = cols.price + 1; i < cols.status; i++) {
      if (dateRatio(dataRows, i) >= 0.6) dateCols.push(i);
    }
    if (dateCols.length) cols.activeUntil = dateCols[0];
    if (dateCols.length > 1) cols.dueDate = dateCols[1];
  }
  return {
    header,
    cols,
    rows: cleaned.slice(1).map((cells, i) => ({
      no: cols.no !== null ? Number(cells[cols.no]) || 0 : 0,
      line: start + i + 2,
      cells,
    })),
  };
}

/**
 * Ubah satu baris CSV menjadi data pelanggan siap disimpan.
 * @param {string[]} cells Sel baris (sudah dibersihkan dari formula Excel)
 * @param {object} cols Hasil mapHeader (indeks kolom logis)
 * @param {object} opts Opsi { defaultBillingDay }
 */
export function mapCustomerRow(cells, cols, opts = {}) {
  const get = (k) => (cols[k] !== null && cols[k] !== undefined ? cells[cols[k]] || '' : '');
  const orNull = (v) => (v === '' ? null : v);
  const masaAktif = parseDateId(get('activeUntil'));
  const day = masaAktif ? Number(masaAktif.slice(8, 10)) : 0;
  const addr = [get('address'), get('village'), get('district'), get('city')].filter(Boolean).join(', ');
  const { latitude, longitude } = extractLatLng(get('maps'));
  const statusRaw = get('status').toUpperCase();
  const priceRaw = get('price').replace(/[^\d.-]/g, '');
  const billingDayRaw = Number(get('billingDay'));
  return {
    code: orNull(get('code').slice(0, 20)),
    name: get('name'),
    nik: orNull(get('nik')),
    phone: orNull(get('phone')),
    email: orNull(get('email')),
    address: addr || null,
    area: orNull(get('area')),
    latitude,
    longitude,
    pkgName: orNull(get('package')),
    price: priceRaw !== '' && Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : null,
    activation_date: parseDateId(get('installDate')) || parseDateId(get('regDate')),
    billing_day: day ? Math.min(Math.max(day, 1), 28)
      : (billingDayRaw >= 1 && billingDayRaw <= 28 ? billingDayRaw : Number(opts.defaultBillingDay) || 5),
    status: statusRaw.includes('SUSPEND') || statusRaw.includes('ISOLIR') ? 'isolated'
      : statusRaw.includes('NONAKTIF') || statusRaw.includes('INACTIVE') ? 'inactive' : 'active',
    pppoe_username: orNull(get('username')),
    pppoe_password: orNull(get('password')),
    ppp_service: orNull(get('pppService')),
    ppp_local_address: orNull(get('localAddress')),
    ppp_remote_address: orNull(get('remoteAddress')),
    odp: orNull(get('odp')),
    odc: orNull(get('odc')),
    redaman: get('redaman') !== '' && Number.isFinite(Number(get('redaman'))) ? Number(get('redaman')) : null,
    static_ip: orNull(get('staticIp')),
    ont_brand: orNull(get('ontBrand')),
    ont_serial: orNull(get('ontSerial')),
    tag: orNull(get('tag')),
    notes: orNull(get('notes')),
    created_at: parseDateTimeId(get('createdAt')),
  };
}

/** 'YYYY-MM-DD' → dd/mm/yyyy (format CSV ekspor agar bisa diimpor ulang) */
export function formatDateId(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** 'YYYY-MM-DD HH:MM[:SS]' → dd/mm/yyyy HH:MM (format CSV ekspor) */
export function formatDateTimeId(value) {
  const d = formatDateId(value);
  if (!d) return '';
  const t = String(value || '').match(/ (\d{1,2}:\d{2})/);
  return t ? `${d} ${t[1]}` : d;
}