/**
 * Data dummy NetBill — konten nyata untuk landing, paket, tentang, kontak,
 * dan dashboard (tanpa placeholder "segera hadir").
 */

export interface Plan {
  id: string;
  name: string;
  speed: number; // Mbps
  price: number; // IDR/bulan
  tagline: string;
  popular?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Paket Basic",
    speed: 10,
    price: 99000,
    tagline: "Untuk rumah dengan kebutuhan browsing & media sosial.",
    features: [
      "Kecepatan 10 Mbps (1:1)",
      "1 perangkat PPPoE aktif",
      "Unlimited kuota — tanpa FUP",
      "Tagihan otomatis via WhatsApp",
      "Dukungan tiket gangguan 12 jam",
    ],
  },
  {
    id: "keluarga",
    name: "Paket Keluarga",
    speed: 20,
    price: 199000,
    tagline: "Paling laris untuk streaming & belajar online keluarga.",
    popular: true,
    features: [
      "Kecepatan 20 Mbps (1:1)",
      "Hingga 3 perangkat PPPoE",
      "Unlimited kuota — tanpa FUP",
      "Prioritas tiket gangguan 4 jam",
      "Monitoring pemakaian harian",
      "Isolir otomatis bisa ditunda",
    ],
  },
  {
    id: "gaming",
    name: "Paket Gaming",
    speed: 50,
    price: 349000,
    tagline: "Latensi rendah untuk e-sport dan live streaming.",
    features: [
      "Kecepatan 50 Mbps (1:1)",
      "Routing gaming optimasi (SG/JKT)",
      "Hingga 5 perangkat PPPoE",
      "Prioritas bandwidth malam hari",
      "Monitoring trafik realtime",
      "Teknisi on-call 24 jam",
    ],
  },
  {
    id: "bisnis",
    name: "Paket Bisnis",
    speed: 100,
    price: 749000,
    tagline: "Untuk kantor, sekolah, dan usaha dengan SLA jelas.",
    features: [
      "Kecepatan 100 Mbps (1:1)",
      "IP publik statis tersedia",
      "SLA uptime 99,5% bergaransi",
      "Hingga 20 perangkat PPPoE",
      "Laporan bulanan terjadwal",
      "Account manager khusus",
    ],
  },
];

export const HERO_STATS = [
  { value: "2.450+", label: "Pelanggan terkelola" },
  { value: "99,9%", label: "Uptime jaringan" },
  { value: "1,2 jt", label: "Tagihan terproses" },
  { value: "24/7", label: "Dukungan teknis" },
];

export const FEATURES = [
  {
    icon: "Users",
    title: "Manajemen Pelanggan",
    description:
      "Data pelanggan, area, dan paket terpusat. Isolir, suspend, dan aktivasi ulang cukup satu klik dari dashboard.",
  },
  {
    icon: "ReceiptText",
    title: "Tagihan Otomatis",
    description:
      "Invoice dibuat otomatis tiap periode, terkirim via WhatsApp, dengan status lunas, sebagian, dan tunggakan yang jelas.",
  },
  {
    icon: "Activity",
    title: "Monitoring PPPoE Realtime",
    description:
      "Status online/offline pelanggan, redaman optik, dan trafik live langsung dari Mikrotik tanpa membuka Winbox.",
  },
  {
    icon: "Wallet",
    title: "Pembayaran Multi-Channel",
    description:
      "Terima tunai, transfer bank, QRIS, dan gateway. Struk digital cetak atau kirim otomatis ke pelanggan.",
  },
  {
    icon: "BarChart3",
    title: "Laporan Keuangan",
    description:
      "Pemasukan, pengeluaran, arus kas, dan laba rugi tersaji rapi per periode — siap diekspor untuk pembukuan.",
  },
  {
    icon: "Wrench",
    title: "Tiket Gangguan",
    description:
      "Laporan gangguan tercatat dengan status dikerjakan hingga selesai, terhubung ke data pelanggan dan perangkat.",
  },
];
