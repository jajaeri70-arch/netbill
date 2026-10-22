import { q, exec } from './db.js';
import { randomString, randomNumber } from './utils/crypto.js';
import { num } from './utils/helper.js';

/** Generator acak deterministik agar hasil seed konsisten */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260830);
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pad2 = (n) => String(n).padStart(2, '0');

const FIRST = ['Budi', 'Siti', 'Ahmad', 'Dewi', 'Joko', 'Rina', 'Agus', 'Sri', 'Bambang', 'Wati',
  'Hendra', 'Maya', 'Dedi', 'Lina', 'Eko', 'Nur', 'Fajar', 'Ayu', 'Gunawan', 'Ratna',
  'Hadi', 'Fitri', 'Andi', 'Sari', 'Rudi', 'Tuti', 'Iwan', 'Dian', 'Slamet', 'Yuni',
  'Tono', 'Wawan', 'Endang', 'Yusuf', 'Novi', 'Zainal', 'Kartika', 'Doni', 'Melati', 'Arif',
  'Puji', 'Bagas'];
const LAST = ['Santoso', 'Wijaya', 'Pratama', 'Hidayat', 'Nugroho', 'Saputra', 'Lestari',
  'Maulana', 'Anggraini', 'Firmansyah', 'Puspita', 'Setiawan', 'Rahayu', 'Kurniawan',
  'Handayani', 'Gunawan', 'Wibowo', 'Susanto', 'Utami', 'Ramadhan'];
const AREAS = ['Area Utara', 'Area Selatan', 'Area Timur', 'Area Barat'];
const TAGS = ['Rumahan', 'VIP', 'Warung', 'Corporate'];
const ODPS = ['ODP-SW-01', 'ODP-SW-02', 'ODP-SW-03', 'ODP-UT-01', 'ODP-UT-02', 'ODP-TM-01', 'ODP-BR-01', 'ODP-BR-02'];
const MODELS = ['ZTE F609', 'ZTE F670L', 'Huawei HG8245H', 'Fiberhome HG6245D', 'Nokia G-1425'];
const METHODS = ['cash', 'transfer', 'qris', 'gateway'];
const PERIODS = ['2026-06', '2026-07', '2026-08'];
const TODAY = '2026-08-30';

export async function runDemo() {
  const pkgs = await q('SELECT * FROM packages ORDER BY id');
  const staff = await q("SELECT id FROM users WHERE role IN ('finance','kasir')");

  // ---------- Pelanggan ----------
  console.log('[demo] membuat pelanggan & perangkat...');
  const customers = [];
  const used = new Set();
  for (let i = 0; i < 42; i++) {
    let name;
    do {
      name = `${pick(FIRST)} ${pick(LAST)}`;
    } while (used.has(name));
    used.add(name);

    const pkg = pkgs[i % pkgs.length];
    const status = i < 34 ? 'active' : i < 38 ? 'isolated' : 'inactive';
    const code = `C-${String(i + 1).padStart(4, '0')}`;
    const uname = name.split(' ')[0].toLowerCase() + randomNumber(3);
    const pass = randomString(8);
    const billingDay = [5, 5, 5, 10, 15, 25][i % 6];
    const area = AREAS[i % AREAS.length];
    const addr = `Jl. ${pick(['Melati', 'Mawar', 'Kenanga', 'Anggrek', 'Cempaka', 'Flamboyan'])} No. ${randInt(1, 99)}, ${area}`;
    const activation = `202${randInt(4, 6)}-${pad2(randInt(1, 8))}-${pad2(randInt(1, 28))}`;
    const redaman = Number((-(16 + rand() * 12)).toFixed(2));

    const r = await exec(
      `INSERT INTO customers
        (code, name, nik, phone, email, address, area, latitude, longitude, package_id,
         activation_date, billing_day, status, pppoe_username, pppoe_password, odp, odc, redaman, tag, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [code, name, `3204${randInt(1000000000000, 9999999999999)}`,
        `0812${randInt(30000000, 99999999)}`, `${uname}@mail.com`, addr, area,
        -6.9 + rand() * 0.2, 107.6 + rand() * 0.2, pkg.id, activation, billingDay,
        status, uname, pass, pick(ODPS), 'ODC-Sentral', redaman, pick(TAGS), staff[0]?.id]
    );
    const cid = r.insertId;

    // Perangkat ONT (terhubung GenieACS) untuk pelanggan aktif
    if (status !== 'inactive' && i % 10 !== 9) {
      const model = pick(MODELS);
      const brand = model.split(' ')[0];
      const serial = brand.slice(0, 3).toUpperCase() + randomNumber(8);
      const devId = `${serial}-${randomNumber(4)}`;
      const rx = i % 11 === 5 ? Number((-(25.5 + rand() * 3)).toFixed(2)) : Number((-(16 + rand() * 8)).toFixed(2));
      await exec(
        `INSERT INTO devices
          (genieacs_device_id, customer_id, serial, model, firmware, status, ssid, wifi_password, rx_power, tx_power, uptime, last_inform, last_sync)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
        [devId, cid, serial, model, `${randInt(1, 9)}.${randInt(0, 9)}.${randInt(1, 30)}`,
          rand() < 0.9 ? 'online' : 'offline', `WiFi-${code}`, randomString(8), rx,
          Number((1.5 + rand() * 2).toFixed(2)), randInt(3600, 2592000),
          new Date(Date.now() - randInt(0, 3600) * 1000).toISOString().slice(0, 19).replace('T', ' ')]
      );
      await exec('UPDATE customers SET genieacs_device_id = ?, ont_serial = ?, ont_brand = ? WHERE id = ?', [devId, serial, brand, cid]);
      const devRow = await q('SELECT id FROM devices WHERE genieacs_device_id = ?', [devId]);
      if (devRow[0]) {
        for (let h = 1; h <= 5; h++) {
          await exec(
            `INSERT INTO devices_history (device_id, status, rx_power, tx_power, recorded_at)
             VALUES (?, 'online', ?, ?, NOW() - INTERVAL ? HOUR)`,
            [devRow[0].id, Number((rx + rand() * 2 - 1).toFixed(2)), Number((2 + rand()).toFixed(2)), h]
          );
        }
      }
    }

    // Sinkron kredensial ke RADIUS (radcheck)
    await exec(`INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)`, [uname, pass]);
    await exec(`INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Simultaneous-Use', ':=', '1')`, [uname]);

    customers.push({ id: cid, name, uname, pass, pkg, status, billingDay });
  }
  console.log(`[demo] ${customers.length} pelanggan dibuat`);

  // ---------- Tagihan & Pembayaran ----------
  console.log('[demo] membuat tagihan 3 periode & pembayaran...');
  const seq = { '2026-06': 0, '2026-07': 0, '2026-08': 0 };
  for (const c of customers.filter((x) => x.status !== 'inactive')) {
    for (const period of PERIODS) {
      seq[period] += 1;
      const amount = num(c.pkg.price);
      const due = `${period}-${pad2(c.billingDay)}`;
      const r1 = rand();
      let status;
      if (period === '2026-06') status = c.status === 'isolated' ? 'unpaid' : r1 < 0.92 ? 'paid' : 'unpaid';
      else if (period === '2026-07') {
        status = c.status === 'isolated' ? 'unpaid' : r1 < 0.78 ? 'paid' : r1 < 0.86 ? 'partial' : 'unpaid';
      } else {
        status = c.status === 'isolated' ? 'unpaid' : r1 < 0.3 ? 'paid' : r1 < 0.45 ? 'partial' : 'unpaid';
      }

      const isOverdue = due < TODAY;
      const lateFee = isOverdue && status !== 'paid' && rand() < 0.6 ? 5000 : 0;
      const total = amount + lateFee;
      const paidAmount = status === 'paid' ? total : status === 'partial' ? Math.round(total / 2) : 0;
      const number = `INV-${period.replace('-', '')}-${String(seq[period]).padStart(4, '0')}`;

      const inv = await exec(
        `INSERT INTO invoices (number, customer_id, period, invoice_date, due_date, amount, late_fee, status, paid_amount)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [number, c.id, period, `${period}-01`, due, amount, lateFee, status, paidAmount]
      );
      if (paidAmount > 0) {
        const payDay = Math.min(28, c.billingDay + randInt(0, 8));
        const payDate = `${period}-${pad2(payDay)} ${pad2(randInt(8, 20))}:${pad2(randInt(0, 59))}:00`;
        const by = pick(staff);
        await exec(
          `INSERT INTO payments (invoice_id, customer_id, amount, method, note, status, payment_date, created_by, confirmed_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [inv.insertId, c.id, paidAmount, pick(METHODS), status === 'partial' ? 'Pembayaran sebagian (cicilan)' : null,
            'confirmed', payDate, by.id, payDate]
        );
      }
    }
  }
  console.log('[demo] tagihan & pembayaran dibuat');

  // ---------- Transaksi non-tagihan (6 bulan) ----------
  console.log('[demo] membuat transaksi pemasukan/pengeluaran...');
  const cats = await q('SELECT * FROM transaction_categories');
  const catId = (name) => cats.find((c) => c.name === name)?.id || null;
  const MONTHS = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
  for (const m of MONTHS) {
    const expenses = [
      ['Bandwidth Upstream', 4500000 + randInt(0, 800000), `${m}-03`],
      ['Gaji Teknisi', 2750000, `${m}-28`],
      ['Listrik & Sewa', 850000, `${m}-05`],
      ['Perawatan Perangkat', randInt(150000, 900000), `${m}-${pad2(randInt(6, 26))}`],
      ['Operasional Lainnya', randInt(50000, 400000), `${m}-${pad2(randInt(2, 27))}`],
    ];
    for (const [catName, amt, d] of expenses) {
      await exec(
        `INSERT INTO transactions (type, category_id, amount, tx_date, description, status, created_by, approved_by, approved_at)
         VALUES ('expense', ?, ?, ?, ?, 'approved', ?, ?, NOW())`,
        [catId(catName), amt, d, catName, staff[0]?.id, staff[0]?.id]
      );
    }
    const nInstal = m === '2026-08' ? 3 : m === '2026-07' ? 2 : 1;
    for (let k = 0; k < nInstal; k++) {
      await exec(
        `INSERT INTO transactions (type, category_id, amount, tx_date, description, status, created_by)
         VALUES ('income', ?, 350000, ?, ?, 'approved', ?)`,
        [catId('Biaya Instalasi'), `${m}-${pad2(randInt(2, 26))}`, 'Biaya instalasi pelanggan baru', staff[0]?.id]
      );
    }
    if (rand() < 0.5) {
      await exec(
        `INSERT INTO transactions (type, category_id, amount, tx_date, description, status, created_by)
         VALUES ('income', ?, 450000, ?, 'Penjualan router ONT ke pelanggan', 'approved', ?)`,
        [catId('Penjualan Perangkat'), `${m}-${pad2(randInt(2, 26))}`, staff[0]?.id]
      );
    }
  }

  // ---------- Tiket gangguan ----------
  console.log('[demo] membuat tiket gangguan...');
  const teknisi = (await q("SELECT id FROM users WHERE username = 'teknisi'"))[0];
  const subjects = [
    ['Internet lambat sejak pagi', 'normal', 'in_progress'],
    ['Fiber putus tertimpa pohon tumbang', 'high', 'open'],
    ['Ganti ONT rusak akibat petir', 'high', 'resolved'],
    ['WiFi tidak bisa terhubung', 'normal', 'resolved'],
    ['Redaman optik tinggi (>27dBm)', 'high', 'in_progress'],
    ['Pindah titik instalasi ke lantai 2', 'low', 'open'],
    ['Tagihan tidak sesuai paket', 'normal', 'resolved'],
  ];
  for (const [subj, prio, st] of subjects) {
    const cust = pick(customers);
    await exec(
      `INSERT INTO support_tickets (customer_id, subject, description, priority, status, assigned_to, created_by, created_at, resolved_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [cust.id, subj, `Laporan dari pelanggan ${cust.name} (${cust.uname}).`, prio, st,
        st === 'open' ? null : teknisi?.id, staff[0]?.id,
        `2026-08-${pad2(randInt(10, 28))} 09:00:00`, st === 'resolved' ? '2026-08-29 15:00:00' : null]
    );
  }

  // PPPoE sessions and connection logs come only from MikroTik.
  // Usage history is unrelated to live PPPoE sessions.
  for (const c of customers.filter((x) => x.status === 'active')) {
    const values = [];
    for (let d = 0; d < 30; d++) {
      const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      values.push(`(${c.id}, '${date}', ${randInt(2 * 1073741824, 22 * 1073741824)}, ${randInt(300000000, 4 * 1073741824)})`);
    }
    await exec(
      `INSERT IGNORE INTO usage_daily (customer_id, d, download_bytes, upload_bytes) VALUES ${values.join(',')}`
    );
  }

  // ---------- Notifikasi & log aktivitas awal ----------
  const notes = [
    ['Pelanggan menunggak meningkat', 'Ada tagihan jatuh tempo yang belum dibayar. Segera tindak lanjuti.', 'warning'],
    ['Auto isolir dijadwalkan', 'Sistem akan mengisolir pelanggan menunggak >3 hari pada pukul 23:00.', 'info'],
    ['Backup database berhasil', 'Backup harian database tersimpan pada penyimpanan lokal.', 'success'],
  ];
  for (const [t, msg, type] of notes) {
    await exec('INSERT INTO notifications (user_id, title, message, type) VALUES (NULL, ?, ?, ?)', [t, msg, type]);
  }
  const acts = [
    [1, 'Pemilik Usaha', 'owner', 'auth.login', 'auth', 'Login ke sistem'],
    [2, 'Admin Finance', 'admin', 'customers.create', 'customers', 'Menambah pelanggan baru'],
    [3, 'Teknisi NOC', 'teknisi', 'monitoring.isolir', 'monitoring', 'Mengisolir pelanggan menunggak'],
    [2, 'Admin Finance', 'admin', 'payments.create', 'payments', 'Mencatat pembayaran tunai'],
  ];
  for (const [uid, uname, role, action, module, desc] of acts) {
    await exec(
      `INSERT INTO activity_logs (user_id, user_name, role, action, module, description, ip, created_at)
       VALUES (?,?,?,?,?,?, '127.0.0.1', NOW() - INTERVAL ? HOUR)`,
      [uid, uname, role, action, module, desc, randInt(1, 48)]
    );
  }
  console.log('[demo] data demo selesai ✓');
}



