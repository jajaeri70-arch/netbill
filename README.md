# NetBill — Aplikasi Billing & Manajemen RT/RW Net

Implementasi **PRD "NetBill" v1.0** (30 Agustus 2026): aplikasi manajemen & billing ISP RT/RW Net dengan integrasi Mikrotik/RADIUS dan GenieACS, dashboard modern dark/light mode, multi-role RBAC, serta laporan keuangan–laba rugi terpadu.

## 1. Stack Teknologi (sesuai PRD §8.1)

| Layer | Teknologi |
|---|---|
| Backend | Node.js 18+ (ESM) + Express.js |
| Frontend | React 18 + Vite + Tailwind CSS + Recharts + Socket.io-client |
| Database | MySQL/MariaDB (kompatibel skema FreeRADIUS: `radcheck`, `radreply`, `radacct`, `nas`) |
| Realtime | WebSocket (Socket.io) — status online/offline & trafik live |
| Job Scheduler | node-cron (generate tagihan, reminder, denda, auto-isolir, backup) |
| Integrasi | Mikrotik RouterOS v7 REST API, GenieACS REST (TR-069), WA Gateway (Fonnte/Wablas/log) |
| Auth | JWT + bcrypt, RBAC granular per menu/aksi (view/create/edit/delete/export) |

## 2. Fitur yang Diimplementasikan

- **§5.1 Multi-Role**: role `owner / finance / teknisi / kasir`, matriks izin per menu (tabel `role_permissions`), log aktivitas setiap aksi sensitif.
- **§5.2 Transaksi Tagihan**: generate massal (dengan **dry-run**), denda otomatis (nominal/persen), cicilan/pembayaran sebagian, bukti transfer, cetak invoice & kwitansi, reminder WA H-3/H-1/H-H/overdue, auto-aktivasi setelah lunas.
- **§5.3 Traffic Monitoring**: kartu statistik, grafik trafik agregat realtime (Socket.io tiap 5 detik), sesi PPPoE (IP, MAC, uptime), aksi disconnect/isolir/aktivasi, histori koneksi.
- **§5.4 Data Pelanggan**: lengkap (pribadi, langganan, teknis, dokumen upload), filter lanjutan, import/export CSV, kategori/tag, histori perubahan paket.
- **§5.5 RADIUS & Mikrotik**: sinkron PPPoE ke `radcheck`, profile bandwidth via `radreply`, multi-router, monitoring resource router, auto-isolir & auto-aktivasi; **menu input server manual** dengan probe kredensial via RouterOS REST sebelum disimpan, detail live per server (resource, interface, PPP profile, sesi aktif), provision otomatis profil paket + `isolir`, dan pendaftaran NAS FreeRADIUS.
- **Auto Isolir per server (halaman Server Mikrotik)**: tiap server punya konfigurasi **Aktifkan Auto Isolir? (YA/TIDAK)**, **Action Isolir** (`Ubah Profile` → secret PPPoE dipindah ke **Profile Isolir** terpilih, mis. `expiredsisbro`; atau `Disable Secrets` → secret dinonaktifkan & sesi aktif diputus), disinkronkan juga ke RADIUS (`Mikrotik-Group` / `Auth-Type Reject`). Cron isolir otomatis melewati server dengan auto isolir nonaktif; pelanggan mengikuti router pada paketnya.
- **§5.6 GenieACS**: perangkat ONT, alert sinyal optik rendah, reboot remote, ubah SSID/password WiFi, riwayat parameter.
- **§5.7 Laporan Keuangan**: pemasukan (paket/area/harian), aging piutang (0-30/31-60/>60), arus kas, export CSV.
- **§5.8 Laba Rugi**: pendapatan tagihan + non-tagihan, beban per kategori, donut proporsi beban, laba bersih & growth MoM.
- **§5.9 Transaksi Non-Tagihan**: kategori kustom, lampiran bukti, approval workflow.
- **§5.10 Pendukung**: user, router, log aktivitas, pengaturan sistem, notifikasi pusat realtime.
- **§6 Non-fungsional**: dark/light mode, responsif, kredensial terenkripsi AES-256, backup harian (retensi 30 hari), pagination & index DB.
- **§7 Desain**: sidebar collapsible, topbar (quick search "Cek Status Pelanggan", bell notifikasi, tema, profil + role badge), kartu ringkasan, banner alert, aksi cepat, grafik area/donut/bar, badge status berwarna.

## 3. Cara Menjalankan

```bash
# 1. Install dependensi + buat skema DB + user & data inti
npm run setup

# 2. (Opsional) isi data demo: 42 pelanggan, tagihan 3 periode, pembayaran,
#    transaksi 6 bulan, perangkat, sesi PPPoE, tiket gangguan
npm run seed

# Mode dev (server :3020 + client :5173 hot reload)
npm run dev

# Mode produksi mandiri (hanya jika belum dikelola PM2/aaPanel)
npm run build
npm start
```

Aplikasi: **http://localhost:3020** (produksi dengan `PORT=3020` di `server/.env`) atau **http://localhost:5173** (dev).
Di server aaPanel, produksi dikelola PM2 sebagai `wwwroot` dari `/www/wwwroot/billing/server/src/index.js`. Entri proyek Node aaPanel `billing` tidak dipakai untuk menjalankan aplikasi; autostart-nya dimatikan. Cek dengan `pm2 status wwwroot`, restart dengan `pm2 restart wwwroot`. Jangan klik Start proyek Node aaPanel `billing` atau jalankan `npm start` bersamaan: instance kedua akan gagal di port 3020 (`EADDRINUSE`). Jika beralih sepenuhnya ke pengelola aaPanel, hentikan dan hapus entri PM2 `wwwroot` beserta autostart-nya dahulu.
Jika memakai reverse proxy aaPanel/Nginx, arahkan upstream ke `http://127.0.0.1:3020`. Pastikan konfigurasi environment PM2 tidak menimpa `PORT=3020` sebelum restart.
Prasyarat: Node.js 18+, MySQL/MariaDB di `127.0.0.1:3306` (Laragon default: root tanpa password).

## 4. API Android

Base URL: `https://domain-anda/api/mobile/v1`. Verifikasi API key memakai `GET /api/mobile/v1`; login mobile memakai `POST /api/mobile/v1/login`.
Kirim `X-API-Key` saat verifikasi dan login, lalu kirim `X-API-Key` dan `Authorization: Bearer <token>` pada endpoint mobile.
Kontrak endpoint tersedia di [`server/MOBILE_API.md`](server/MOBILE_API.md). Payload, respons, dan contoh Dio Flutter tersedia di [`server/MOBILE_FLUTTER.md`](server/MOBILE_FLUTTER.md).

> Android emulator memakai `http://10.0.2.2:3020` untuk server lokal. Perangkat fisik memakai IP LAN/domain HTTPS server, bukan `localhost`.

## 5. Integrasi Real

Monitoring PPPoE hanya membaca sesi aktif dari MikroTik RouterOS v7 REST API melalui `/rest/ppp/active`. IP, MAC, uptime, status, dan router ID tidak dibuat oleh aplikasi. Saat router gagal dihubungi, API mengembalikan error dan tidak memakai data pengganti.

Aktifkan `mikrotik_enabled` di menu **Pengaturan** dan daftarkan kredensial di menu **Router Mikrotik**. MikroTik memakai RouterOS v7 REST.

## 6. Struktur Proyek

```
billing/
├── server/
│   ├── src/
│   │   ├── index.js              # HTTP + Socket.io + tick monitoring 5s + scheduler
│   │   ├── app.js                # Express + routes + static client dist
│   │   ├── config.js, db.js      # env & MySQL pool
│   │   ├── schema-*.sql          # core / operasional / FreeRADIUS
│   │   ├── seed.js, seed-core.js, seed-demo.js
│   │   ├── middleware/auth.js    # JWT + RBAC (can(menu, action))
│   │   ├── services/             # billing, monitoring, mikrotik, genieacs,
│   │   │                         # radius, whatsapp, httpclient
│   │   ├── jobs/scheduler.js     # cron 00:10 / 08:00 / 23:00 / 01:00
│   │   ├── utils/                # crypto AES, csv, upload, helper, events
│   │   └── routes/               # 18 modul REST API
│   └── uploads/                  # bukti transfer, KTP, lampiran
└── client/
    └── src/
        ├── pages/                # 20 halaman (dashboard s/d pengaturan)
        ├── components/           # ui.jsx, Layout.jsx, charts.jsx
        └── context/              # Auth, Theme, Toast, Socket
```

## 7. Alur Kunci untuk Dicoba

1. **Tagihan → Isolir → Aktivasi (PRD 9.1)**: menu Tagihan → *Generate Tagihan* (coba *Simulasikan*) → bayar tagihan milik pelanggan berstatus isolir → pelanggan otomatis aktif, sesi PPPoE online, notifikasi & WA (log) terkirim.
2. **Monitoring realtime**: angka online/offline & grafik trafik berubah tiap 5 detik; uji aksi isolir/aktivasi/disconnect.
3. **Aksi cepat dashboard**: catat pembayaran/pengeluaran; tambah pelanggan (PPPoE otomatis + tersinkron `radcheck`).
4. **Laba Rugi**: ganti periode untuk melihat laba bersih & growth MoM.
5. **RBAC**: login `teknisi` — menu keuangan hilang, akses API ditolak 403.

## 8. Job Terjadwal

| Jam | Job |
|---|---|
| 00:00 | Generate tagihan prabayar H-1 sebelum awal siklus (anchor Tanggal Aktif, fallback Tanggal Pemasangan) |
| 00:10 | Generate tagihan pascabayar untuk siklus yang dimulai hari ini |
| 08:00 | Reminder WA H-3/H-1/hari-H/overdue (dedupe harian) |
| 23:00 | Denda keterlambatan + auto isolir (grace period dari Pengaturan) |
| 01:00 | Backup `mysqldump` (retensi 30 hari) |

## 9. Keamanan

Password bcrypt; JWT 12 jam (`.env`); kredensial router/GenieACS/WA terenkripsi AES-256 (`APP_KEY`) & dimasking di API; RBAC ditegakkan di server (middleware `can()` di tiap endpoint, frontend hanya mirror); upload dibatasi tipe & 5 MB; audit trail semua aksi di `activity_logs`.
