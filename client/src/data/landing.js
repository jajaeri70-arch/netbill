/**
 * Konten halaman publik NetBill (landing, paket, tentang, kontak).
 * Porting dari prototype web/src/lib/data.ts + content.ts — konten statis tanpa backend.
 */

export const PLANS = [
  {
    id: 'basic',
    name: 'Paket Basic',
    speed: 10,
    price: 99000,
    tagline: 'Untuk rumah dengan kebutuhan browsing & media sosial.',
    features: [
      'Kecepatan 10 Mbps (1:1)',
      '1 perangkat PPPoE aktif',
      'Unlimited kuota — tanpa FUP',
      'Tagihan otomatis via WhatsApp',
      'Dukungan tiket gangguan 12 jam',
    ],
  },
  {
    id: 'keluarga',
    name: 'Paket Keluarga',
    speed: 20,
    price: 199000,
    tagline: 'Paling laris untuk streaming & belajar online keluarga.',
    popular: true,
    features: [
      'Kecepatan 20 Mbps (1:1)',
      'Hingga 3 perangkat PPPoE',
      'Unlimited kuota — tanpa FUP',
      'Prioritas tiket gangguan 4 jam',
      'Monitoring pemakaian harian',
      'Isolir otomatis bisa ditunda',
    ],
  },
  {
    id: 'gaming',
    name: 'Paket Gaming',
    speed: 50,
    price: 349000,
    tagline: 'Latensi rendah untuk e-sport dan live streaming.',
    features: [
      'Kecepatan 50 Mbps (1:1)',
      'Routing gaming optimasi (SG/JKT)',
      'Hingga 5 perangkat PPPoE',
      'Prioritas bandwidth malam hari',
      'Monitoring trafik realtime',
      'Teknisi on-call 24 jam',
    ],
  },
  {
    id: 'bisnis',
    name: 'Paket Bisnis',
    speed: 100,
    price: 749000,
    tagline: 'Untuk kantor, sekolah, dan usaha dengan SLA jelas.',
    features: [
      'Kecepatan 100 Mbps (1:1)',
      'IP publik statis tersedia',
      'SLA uptime 99,5% bergaransi',
      'Hingga 20 perangkat PPPoE',
      'Laporan bulanan terjadwal',
      'Account manager khusus',
    ],
  },
];

export const HERO_STATS = [
  { value: '2.450+', label: 'Pelanggan terkelola' },
  { value: '99,9%', label: 'Uptime jaringan' },
  { value: '1,2 jt', label: 'Tagihan terproses' },
  { value: '24/7', label: 'Dukungan teknis' },
];

export const FEATURES = [
  {
    icon: 'Users',
    title: 'Manajemen Pelanggan',
    description:
      'Data pelanggan, area, dan paket terpusat. Isolir, suspend, dan aktivasi ulang cukup satu klik dari dashboard.',
  },
  {
    icon: 'ReceiptText',
    title: 'Tagihan Otomatis',
    description:
      'Invoice dibuat otomatis tiap periode, terkirim via WhatsApp, dengan status lunas, sebagian, dan tunggakan yang jelas.',
  },
  {
    icon: 'Activity',
    title: 'Monitoring PPPoE Realtime',
    description:
      'Status online/offline pelanggan, redaman optik, dan trafik live langsung dari Mikrotik tanpa membuka Winbox.',
  },
  {
    icon: 'Wallet',
    title: 'Pembayaran Multi-Channel',
    description:
      'Terima tunai, transfer bank, QRIS, dan gateway. Struk digital cetak atau kirim otomatis ke pelanggan.',
  },
  {
    icon: 'BarChart3',
    title: 'Laporan Keuangan',
    description:
      'Pemasukan, pengeluaran, arus kas, dan laba rugi tersaji rapi per periode — siap diekspor untuk pembukuan.',
  },
  {
    icon: 'Wrench',
    title: 'Tiket Gangguan',
    description:
      'Laporan gangguan tercatat dengan status dikerjakan hingga selesai, terhubung ke data pelanggan dan perangkat.',
  },
];
export const TESTIMONIALS = [
  {
    name: 'Bpk. Ahmad Fauzi',
    role: 'Pengelola Net Desa Sukamaju',
    quote:
      'Sejak pakai NetBill, penagihan bulanan tidak lagi manual. Isolir tunggakan berjalan otomatis dan pelanggan langsung paham lewat WhatsApp.',
  },
  {
    name: 'Ibu Rina Marlina',
    role: 'Owner RT Net Cempaka',
    quote:
      'Laporan keuangannya rapi banget. Arus kas dan piutang terlihat jelas, jadi mudah mengatur belanja bandwidth tiap bulan.',
  },
  {
    name: 'Mas Doni Prasetyo',
    role: 'Teknisi Nusa Fiber',
    quote:
      'Monitoring PPPoE dan redaman optik mempermudah cari masalah. Tiket gangguan lengkap dengan riwayat perangkat pelanggan.',
  },
];

export const FAQS = [
  {
    q: 'Apakah cocok untuk jaringan RT/RW yang masih kecil?',
    a: 'Sangat cocok. NetBill dirancang mulai dari puluhan hingga ribuan pelanggan. Anda bisa mulai dari satu router Mikrotik dan menambah router lain saat jaringan tumbuh.',
  },
  {
    q: 'Router apa saja yang didukung?',
    a: 'NetBill terintegrasi dengan Mikrotik RouterOS (PPPoE, isolir, monitoring). Banyak klien juga memakai ONU/ONT standar seperti ZTE dan Huawei untuk sisi pelanggan.',
  },
  {
    q: 'Bagaimana pelanggan menerima tagihan?',
    a: 'Invoice otomatis dikirim via WhatsApp dan bisa dicetak sebagai kuitansi. Pembayaran tercatat di dashboard dan struk digital langsung tersedia.',
  },
  {
    q: 'Apakah data pelanggan aman?',
    a: 'Akses aplikasi berbasis peran (Owner, Admin/Finance, Teknisi, Kasir) dengan log aktivitas lengkap, sehingga setiap perubahan data tercatat jelas.',
  },
];

export const COMPANY = {
  name: 'NetBill',
  tagline: 'Billing & manajemen jaringan RT/RW Net terintegrasi.',
  address: 'Jl. Merdeka Raya No. 88, Bandung, Jawa Barat 40115',
  phone: '+62 812-2000-8877',
  email: 'halo@netbill.id',
  hours: 'Senin–Sabtu, 08.00–20.00 WIB',
};
export const CONTACT_CHANNELS = [
  { icon: 'Phone', title: 'Telepon / WhatsApp', detail: '+62 812-2000-8877', note: 'Balasan cepat pada jam kerja' },
  { icon: 'Mail', title: 'Email', detail: 'halo@netbill.id', note: 'Respons maksimal 1×24 jam' },
  { icon: 'MapPin', title: 'Kantor', detail: 'Jl. Merdeka Raya No. 88, Bandung', note: 'Kunjungan dengan appointment' },
  { icon: 'Clock', title: 'Jam Operasional', detail: 'Senin–Sabtu, 08.00–20.00 WIB', note: 'Darurat jaringan 24/7' },
];

export const MILESTONES = [
  {
    year: '2022',
    title: 'Dimulai dari satu RT',
    description:
      'NetBill lahir dari kebutuhan pengelola jaringan RT di Bandung yang lelah mencatat tagihan manual di buku tulis.',
  },
  {
    year: '2023',
    title: 'Integrasi Mikrotik',
    description:
      'Isolir otomatis, monitoring PPPoE, dan pembayaran digital resmi dirilis. Pelanggan pertama tumbuh melewati 500 unit.',
  },
  {
    year: '2024',
    title: 'Keuangan menyeluruh',
    description:
      'Modul arus kas, laba rugi, dan multi-router diluncurkan untuk mengantarkan ISP RT/RW ke tingkat usaha yang profesional.',
  },
  {
    year: '2026',
    title: '2.450+ pelanggan terkelola',
    description:
      'Puluhan komunitas jaringan di Jawa Barat dan sekitarnya mempercayakan operasional harian mereka pada NetBill.',
  },
];

export const VALUES = [
  {
    icon: 'ShieldCheck',
    title: 'Andal',
    description: 'Infrastruktur monitoring 24/7 dengan uptime 99,9% dan cadangan data harian.',
  },
  {
    icon: 'HeartHandshake',
    title: 'Dekat dengan Pengguna',
    description: 'Dukungan berbahasa Indonesia yang memahami keseharian pengelola RT/RW Net.',
  },
  {
    icon: 'Sparkles',
    title: 'Terus Membaik',
    description: 'Rilis fitur rutin berdasarkan masukan langsung dari komunitas pengguna.',
  },
];

export const TEAM = [
  { name: 'Rizky Pratama', role: 'Founder & CEO', initials: 'RP' },
  { name: 'Sari Wulandari', role: 'Head of Engineering', initials: 'SW' },
  { name: 'Bimo Setiawan', role: 'Network Lead', initials: 'BS' },
  { name: 'Dewi Anggraini', role: 'Customer Success', initials: 'DA' },
];

/** Perbandingan paket lintas fitur untuk halaman /paket */
export const PLAN_COMPARISON = [
  { label: 'Perangkat PPPoE', values: { basic: '1', keluarga: '3', gaming: '5', bisnis: '20' } },
  { label: 'Tanpa FUP', values: { basic: '✓', keluarga: '✓', gaming: '✓', bisnis: '✓' } },
  { label: 'Prioritas gangguan', values: { basic: '12 jam', keluarga: '4 jam', gaming: '24/7', bisnis: '24/7' } },
  { label: 'IP publik statis', values: { basic: '—', keluarga: '—', gaming: 'Opsional', bisnis: 'Termasuk' } },
  { label: 'Laporan bulanan', values: { basic: '—', keluarga: 'Sederhana', gaming: 'Realtime', bisnis: 'Terjadwal' } },
  { label: 'Account manager', values: { basic: '—', keluarga: '—', gaming: '—', bisnis: 'Termasuk' } },
];


