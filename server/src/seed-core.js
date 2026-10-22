import bcrypt from 'bcryptjs';
import { q, exec } from './db.js';
import { encrypt } from './utils/crypto.js';

const MENUS = [
  'dashboard', 'customers', 'packages', 'invoices', 'payments', 'monitoring',
  'devices', 'tickets', 'finance', 'transactions', 'categories', 'users',
  'routers', 'activity', 'settings', 'mapping',
];
// v=view, c=create, e=edit, d=delete, x=export
const PERM_MATRIX = {
  owner: Object.fromEntries(MENUS.map((m) => [m, 'vcedx'])),
  finance: {
    dashboard: 'v', customers: 'vcedx', packages: 'vce', invoices: 'vcedx',
    payments: 'vcedx', monitoring: 'v', devices: 'v', tickets: 'vce',
    finance: 'vx', transactions: 'vcedx', categories: 'vce', users: 'v',
    routers: 'v', activity: 'v', settings: 'v', mapping: 'vced',
  },
  teknisi: {
    dashboard: 'v', customers: 'vce', packages: 'v', monitoring: 'vced',
    devices: 'vce', tickets: 'vced', activity: 'v', mapping: 'vced',
  },
  kasir: {
    dashboard: 'v', customers: 'v', invoices: 'v', payments: 'vcex',
  },
};

function num0(rows) {
  return Number(rows?.[0]?.n || 0);
}

export async function seedCore() {
  const hash = bcrypt.hashSync('password', 10);
  const users = [
    ['Pemilik Usaha', 'owner', 'owner@netbill.id', hash, 'owner', '081200000001'],
    ['Admin Finance', 'finance', 'finance@netbill.id', hash, 'finance', '081200000002'],
    ['Teknisi NOC', 'teknisi', 'teknisi@netbill.id', hash, 'teknisi', '081200000003'],
    ['Kasir CS', 'kasir', 'kasir@netbill.id', hash, 'kasir', '081200000004'],
  ];
  for (const u of users) {
    await exec(
      `INSERT INTO users (name, username, email, password_hash, role, phone)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`,
      u
    );
  }
  console.log('[seed] users siap (owner/finance/teknisi/kasir, password: "password")');

  for (const [role, menus] of Object.entries(PERM_MATRIX)) {
    for (const [menu, flags] of Object.entries(menus)) {
      await exec(
        `INSERT INTO role_permissions (role, menu, can_view, can_create, can_edit, can_delete, can_export)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE can_view=VALUES(can_view), can_create=VALUES(can_create),
           can_edit=VALUES(can_edit), can_delete=VALUES(can_delete), can_export=VALUES(can_export)`,
        [role, menu, flags.includes('v') ? 1 : 0, flags.includes('c') ? 1 : 0,
         flags.includes('e') ? 1 : 0, flags.includes('d') ? 1 : 0, flags.includes('x') ? 1 : 0]
      );
    }
  }
  console.log('[seed] role permissions siap');

  const pkgCount = await q('SELECT COUNT(*) n FROM packages');
  if (num0(pkgCount) === 0) {
    const pkgs = [
      ['Paket Home 10', '10 Mbps', 150000, '10M', 'Untuk kebutuhan rumah tangga'],
      ['Paket Home 20', '20 Mbps', 200000, '20M', 'Streaming & WFH'],
      ['Paket Home 30', '30 Mbps', 300000, '30M', 'Keluarga aktif online'],
      ['Paket Business 50', '50 Mbps', 500000, '50M', 'Warung/usaha kecil'],
      ['Paket Business 100', '100 Mbps', 750000, '100M', 'Kantor & corporate'],
    ];
    for (const p of pkgs) {
      await exec(
        'INSERT INTO packages (name, speed, price, mikrotik_profile, description) VALUES (?,?,?,?,?)',
        p
      );
    }
    console.log('[seed] paket langganan siap');
  }

  const routerCount = await q('SELECT COUNT(*) n FROM routers');
  if (num0(routerCount) === 0) {
    await exec(
      `INSERT INTO routers (name, host, port, scheme, api_user, api_pass, location, is_active)
       VALUES (?,?,?,?,?,?,?,1)`,
      ['Mikrotik', '10.44.77.1', 81, 'http', 'admin', encrypt(''), null]
    );
    console.log('[seed] router default siap: http://10.44.77.1:81');
  }

  const catCount = await q('SELECT COUNT(*) n FROM transaction_categories');
  if (num0(catCount) === 0) {
    const cats = [
      ['Biaya Instalasi', 'income', 'Pendapatan instalasi pelanggan baru'],
      ['Penjualan Perangkat', 'income', 'Penjualan router/ONT ke pelanggan'],
      ['Biaya Pindah Titik', 'income', 'Biaya mutasi/penarikan ulang kabel'],
      ['Pendapatan Lain', 'income', 'Pendapatan non-tagihan lainnya'],
      ['Gaji Teknisi', 'expense', 'Gaji & insentif tim teknisi'],
      ['Listrik & Sewa', 'expense', 'Listrik POP dan sewa tempat/tower'],
      ['Bandwidth Upstream', 'expense', 'Biaya bandwidth ke NAP/upstream'],
      ['Perawatan Perangkat', 'expense', 'Perbaikan & penggantian perangkat'],
      ['Operasional Lainnya', 'expense', 'Biaya operasional lain'],
    ];
    for (const c of cats) {
      await exec('INSERT INTO transaction_categories (name, type, description) VALUES (?,?,?)', c);
    }
    console.log('[seed] kategori transaksi siap');
  }

  await seedSettings();
  console.log('[seed] pengaturan sistem siap');
}

async function seedSettings() {
  const settings = {
    company_name: 'NetBill RT/RW Net',
    company_address: 'Jl. Melati No. 12, RT 03/RW 05',
    company_phone: '0812-0000-0000',
    invoice_footer: 'Pembayaran dapat dilakukan via transfer bank atau tunai di kantor.',
    billing_day_default: '5',
    grace_days: '3',
    auto_disable_enabled: '1',
    disable_after_days: '7',
    late_fee_type: 'fixed',
    late_fee_value: '5000',
    tax_percent: '0',
    mikrotik_enabled: '1',
    genieacs_enabled: '0',
    genieacs_host: '127.0.0.1',
    genieacs_port: '7557',
    genieacs_user: 'admin',
    genieacs_pass: 'admin',
    wa_gateway: 'log',
    wa_token: '',
    wa_domain: '',
    template_invoice: 'Halo {nama}, tagihan internet {periode} sebesar {tagihan} telah dibuat. Jatuh tempo: {jatuh_tempo}. - {perusahaan}',
    template_h7: 'Halo {nama}, tagihan internet {periode} sebesar {tagihan} akan jatuh tempo pada {jatuh_tempo}. Mohon siapkan pembayaran. - {perusahaan}',
    low_signal_threshold: '-25',
    radius_secret: 'netbill-secret',
    template_h3: 'Halo {nama}, tagihan internet {periode} sebesar {tagihan} akan jatuh tempo pada {jatuh_tempo}. Mohon lakukan pembayaran. - {perusahaan}',
    template_h1: 'Halo {nama}, besok ({jatuh_tempo}) tagihan {periode} sebesar {tagihan} jatuh tempo. - {perusahaan}',
    template_due: 'Halo {nama}, hari ini tagihan {periode} sebesar {tagihan} jatuh tempo. Terima kasih. - {perusahaan}',
    template_overdue: 'Halo {nama}, tagihan {periode} sebesar {tagihan} telah jatuh tempo. Segera bayar agar layanan tidak diisolir. - {perusahaan}',
    template_paid: 'Terima kasih {nama}, pembayaran telah kami terima dan layanan Anda aktif kembali. - {perusahaan}',
  };
  for (const [k, v] of Object.entries(settings)) {
    await exec(
      'INSERT INTO settings (skey, svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE skey = VALUES(skey)',
      [k, k === 'genieacs_pass' ? encrypt(v) : v]
    );
  }
}

