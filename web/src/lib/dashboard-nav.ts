"use client";

import {
  BarChart3,
  FileText,
  Gauge,
  LayoutDashboard,
  MonitorSmartphone,
  ReceiptText,
  Router,
  Settings,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/session";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Menu dashboard bervariasi berdasarkan role (Task 1.5). */
export const ROLE_NAV: Record<Role, NavGroup[]> = {
  owner: [
    {
      label: "Menu Utama",
      items: [
        { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
        { href: "/dashboard/pelanggan", label: "Pelanggan", icon: Users },
        { href: "/dashboard/tagihan", label: "Tagihan", icon: FileText },
        { href: "/dashboard/pembayaran", label: "Pembayaran", icon: Wallet },
      ],
    },
    {
      label: "Laporan",
      items: [
        { href: "/dashboard/laporan", label: "Laporan Keuangan", icon: BarChart3 },
        { href: "/dashboard/monitoring", label: "Monitoring", icon: MonitorSmartphone },
      ],
    },
    {
      label: "Sistem",
      items: [{ href: "/dashboard/pengaturan", label: "Pengaturan", icon: Settings }],
    },
  ],
  finance: [
    {
      label: "Menu Utama",
      items: [
        { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
        { href: "/dashboard/pelanggan", label: "Pelanggan", icon: Users },
        { href: "/dashboard/tagihan", label: "Tagihan", icon: FileText },
        { href: "/dashboard/pembayaran", label: "Pembayaran", icon: Wallet },
        { href: "/dashboard/laporan", label: "Laporan Keuangan", icon: BarChart3 },
      ],
    },
    {
      label: "Sistem",
      items: [{ href: "/dashboard/pengaturan", label: "Pengaturan", icon: Settings }],
    },
  ],
  kasir: [
    {
      label: "Menu Kasir",
      items: [
        { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
        { href: "/dashboard/pelanggan", label: "Data Pelanggan", icon: Users },
      ],
    },
  ],
  teknisi: [
    {
      label: "Menu Teknisi",
      items: [
        { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
        { href: "/dashboard/monitoring", label: "Monitoring PPPoE", icon: MonitorSmartphone },
        { href: "/dashboard/perangkat", label: "Perangkat ONT", icon: Router },
        { href: "/dashboard/tiket", label: "Tiket Gangguan", icon: Wrench },
      ],
    },
  ],
  pelanggan: [
    {
      label: "Akun Saya",
      items: [
        { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
        { href: "/dashboard/tagihan", label: "Tagihan Saya", icon: ReceiptText },
        { href: "/dashboard/laporan", label: "Riwayat Pemakaian", icon: Gauge },
      ],
    },
  ],
};

/** Judul halaman untuk tiap section dashboard. */
export const SECTION_META: Record<string, { title: string; description: string }> = {
  pelanggan: { title: "Data Pelanggan", description: "Kelola daftar pelanggan, paket, dan status layanan." },
  tagihan: { title: "Tagihan", description: "Invoice bulanan beserta status lunas dan tunggakan." },
  pembayaran: { title: "Pembayaran", description: "Riwayat pembayaran dari semua channel." },
  laporan: { title: "Laporan", description: "Rekap keuangan dan pemakaian jaringan." },
  monitoring: { title: "Monitoring PPPoE", description: "Status koneksi realtime dari router Mikrotik." },
  perangkat: { title: "Perangkat ONT", description: "Inventaris perangkat pelanggan beserta kesehatannya." },
  tiket: { title: "Tiket Gangguan", description: "Penanganan laporan gangguan dari pelanggan." },
  pengaturan: { title: "Pengaturan", description: "Konfigurasi profil usaha dan preferensi aplikasi." },
};
