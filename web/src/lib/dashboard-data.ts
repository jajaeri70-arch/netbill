import { formatIDR } from "./utils";

/** Data dummy untuk tabel tiap section dashboard. */
export interface SectionRow {
  main: string;
  sub: string;
  status: string;
  statusVariant: "success" | "warning" | "destructive" | "info" | "secondary";
  amount: string;
}

export const SECTION_ROWS: Record<string, SectionRow[]> = {
  pelanggan: [
    { main: "Budi Santoso", sub: "PLG-0001 · Paket Keluarga 20 Mbps", status: "Aktif", statusVariant: "success", amount: formatIDR(199000) },
    { main: "Siti Rahayu", sub: "PLG-0002 · Paket Basic 10 Mbps", status: "Aktif", statusVariant: "success", amount: formatIDR(99000) },
    { main: "Agus Wibowo", sub: "PLG-0003 · Paket Gaming 50 Mbps", status: "Tunggakan", statusVariant: "destructive", amount: formatIDR(349000) },
    { main: "Dewi Lestari", sub: "PLG-0004 · Paket Keluarga 20 Mbps", status: "Isolir", statusVariant: "warning", amount: formatIDR(199000) },
    { main: "Joko Prasetyo", sub: "PLG-0005 · Paket Bisnis 100 Mbps", status: "Aktif", statusVariant: "success", amount: formatIDR(749000) },
  ],
  tagihan: [
    { main: "INV-2026-07-0001", sub: "Budi Santoso · Juli 2026", status: "Lunas", statusVariant: "success", amount: formatIDR(199000) },
    { main: "INV-2026-07-0002", sub: "Siti Rahayu · Juli 2026", status: "Lunas", statusVariant: "success", amount: formatIDR(99000) },
    { main: "INV-2026-07-0003", sub: "Agus Wibowo · Juli 2026", status: "Belum Bayar", statusVariant: "warning", amount: formatIDR(349000) },
    { main: "INV-2026-07-0004", sub: "Dewi Lestari · Juli 2026", status: "Tunggakan", statusVariant: "destructive", amount: formatIDR(398000) },
    { main: "INV-2026-07-0005", sub: "Joko Prasetyo · Juli 2026", status: "Lunas", statusVariant: "success", amount: formatIDR(749000) },
  ],
  pembayaran: [
    { main: "PAY-88123", sub: "Budi Santoso · Transfer BCA", status: "Terkonfirmasi", statusVariant: "success", amount: formatIDR(199000) },
    { main: "PAY-88124", sub: "Siti Rahayu · QRIS", status: "Terkonfirmasi", statusVariant: "success", amount: formatIDR(99000) },
    { main: "PAY-88125", sub: "Joko Prasetyo · Tunai (Kasir)", status: "Terkonfirmasi", statusVariant: "success", amount: formatIDR(749000) },
    { main: "PAY-88126", sub: "Agus Wibowo · Gateway", status: "Menunggu", statusVariant: "info", amount: formatIDR(349000) },
  ],
  laporan: [
    { main: "Juli 2026", sub: "Pemasukan tagihan", status: "Selesai", statusVariant: "success", amount: formatIDR(61250000) },
    { main: "Juli 2026", sub: "Pengeluaran bandwidth", status: "Selesai", statusVariant: "secondary", amount: formatIDR(28400000) },
    { main: "Juni 2026", sub: "Pemasukan tagihan", status: "Selesai", statusVariant: "success", amount: formatIDR(58900000) },
    { main: "Juni 2026", sub: "Pengeluaran perawatan", status: "Selesai", statusVariant: "secondary", amount: formatIDR(7350000) },
  ],
  monitoring: [
    { main: "PLG-0001", sub: "budi.santoso · 10.10.0.1", status: "Online", statusVariant: "success", amount: "-18.4 dBm" },
    { main: "PLG-0002", sub: "siti.rahayu · 10.10.0.2", status: "Online", statusVariant: "success", amount: "-21.2 dBm" },
    { main: "PLG-0003", sub: "agus.wibowo · 10.10.0.3", status: "Offline", statusVariant: "destructive", amount: "-27.8 dBm" },
    { main: "PLG-0005", sub: "joko.prasetyo · 10.10.0.5", status: "Online", statusVariant: "success", amount: "-16.9 dBm" },
  ],
  perangkat: [
    { main: "ZTE F670L", sub: "SN ZTE21C8A001 · Milik PLG-0001", status: "Normal", statusVariant: "success", amount: "RX -18.4" },
    { main: "Huawei HG8245H", sub: "SN HW8245K772 · Milik PLG-0002", status: "Normal", statusVariant: "success", amount: "RX -21.2" },
    { main: "ZTE F609", sub: "SN ZTE609B114 · Milik PLG-0003", status: "Perlu cek", statusVariant: "warning", amount: "RX -27.8" },
  ],
  tiket: [
    { main: "TKT-0451", sub: "Internet lambat · Agus Wibowo", status: "Dikerjakan", statusVariant: "info", amount: "2 jam" },
    { main: "TKT-0450", sub: "Kabel putus tiang 7 · Area Selatan", status: "Selesai", statusVariant: "success", amount: "5 jam" },
    { main: "TKT-0449", sub: "Redaman tinggi · Dewi Lestari", status: "Menunggu", statusVariant: "warning", amount: "1 jam" },
  ],
  pengaturan: [
    { main: "Profil Usaha", sub: "Nama, alamat, dan kontak RT/RW Net", status: "Lengkap", statusVariant: "success", amount: "—" },
    { main: "Router Mikrotik", sub: "RB4011 · 192.168.88.1 · Terhubung", status: "Terhubung", statusVariant: "success", amount: "—" },
    { main: "Notifikasi WhatsApp", sub: "Pengingat tagihan H-3 aktif", status: "Aktif", statusVariant: "success", amount: "—" },
  ],
};
