# Open Ticketing

Panduan operasi modul ticket pemasangan dan maintenance NetBill.

## Akses

Menu: **Jaringan → Tiket Gangguan**. Rute aplikasi: `/gangguan`.

Semua akses memerlukan login, izin RBAC menu `tickets`, dan JWT pada header `Authorization: Bearer <token>` untuk API.

| Role | Hak akses aktual |
| --- | --- |
| `owner` | Melihat semua ticket, membuka ticket, menugaskan teknisi, mengubah status, menutup ticket. Akses penuh menu secara bawaan. |
| `finance` | Sama seperti owner bila memiliki izin RBAC `tickets`; bertindak sebagai Admin/Owner pada modul ticket. |
| `teknisi` | Hanya melihat dan mengubah ticket yang ditugaskan kepadanya. Dapat mengisi laporan dan unggah bukti. Tidak dapat membuka, menugaskan, atau menutup ticket. |
| `kasir` | Sesuai izin RBAC `tickets`; bukan Admin/Owner sehingga tidak dapat membuka atau menugaskan ticket. |

> Hak create/edit/view pada tabel `role_permissions` tetap berlaku. Jika menu atau aksi ditolak dengan HTTP 403, aktifkan izin `tickets` untuk role tersebut di Pengguna/Izin.

## Persiapan rilis

1. Backup database produksi.
2. Jalankan migrasi dari root proyek:

   ```bash
   cd /www/wwwroot/billing
   npm run migrate --prefix server
   ```

3. Build frontend bila deployment melayani hasil build React:

   ```bash
   npm run build --prefix client
   ```

4. Restart service Node.js sesuai pengelola proses server.
5. Pastikan role teknisi ada pada tabel `users`, `is_active=1`, dan izin menu `tickets` tersedia.
6. Pastikan folder upload server dapat ditulis proses Node.js. Bukti kerja disimpan pada `server/uploads` dan dilayani di URL `/uploads/<nama-file>`.

Migrasi menambah kolom ticket, tabel `ticket_events`, tabel `ticket_attachments`, dan indeks `idx_ticket_status` serta `idx_ticket_assignee` bila belum ada.

## Membuka ticket

Hanya `owner` dan `finance` yang dapat membuka ticket.

1. Buka **Jaringan → Tiket Gangguan**.
2. Klik **Buka Ticket**.
3. Pilih jenis ticket:
   - **Maintenance**: pekerjaan gangguan/perbaikan pelanggan aktif.
   - **Pemasangan baru**: pekerjaan instalasi.
4. Untuk **Maintenance**, pilih pelanggan offline, kategori, prioritas, dan judul pekerjaan.
5. Untuk **Pemasangan baru**, isi nama dan WhatsApp calon pelanggan, alamat, patokan, catatan awal, titik GPS/peta, dan foto rumah. Calon pelanggan belum dibuat menjadi pelanggan billing.
6. Opsional: pilih teknisi dan jadwal kunjungan.
7. Klik **Buka ticket**.

Ticket baru tanpa teknisi berstatus `open`. Jika teknisi dipilih saat dibuat, status langsung `assigned` dan teknisi menerima notifikasi dalam aplikasi.

### Pelanggan maintenance offline

Pilihan pelanggan pada form dibuat dari endpoint pelanggan offline. Syaratnya:

- `customers.status = 'active'`
- sesi PPPoE pelanggan berstatus `offline`
- tidak memiliki ticket maintenance aktif

Ticket maintenance aktif berarti status `open`, `assigned`, `on_the_way`, `in_progress`, atau `pending`. Sistem menolak duplikasi maintenance untuk pelanggan sama dengan HTTP 409.

## Penugasan dan SLA

Admin/Owner membuka detail ticket lalu memilih **Tugaskan teknisi**. Pilih teknisi aktif, prioritas, dan jadwal kunjungan, lalu simpan.

Penugasan hanya valid pada status `open`, `assigned`, atau `pending`; hasilnya selalu berstatus `assigned`.

| Prioritas | Target SLA | `due_at` |
| --- | ---: | --- |
| `critical` | 4 jam | Waktu pembuatan/penugasan + 4 jam |
| `high` | 8 jam | Waktu pembuatan/penugasan + 8 jam |
| `normal` | 24 jam | Waktu pembuatan/penugasan + 24 jam |
| `low` | 72 jam | Waktu pembuatan/penugasan + 72 jam |

Ticket aktif melewati `due_at` diberi label **SLA lewat** pada daftar ticket.

## Prosedur teknisi

1. Login memakai user role `teknisi`.
2. Buka **Tiket Gangguan**. Daftar hanya berisi ticket yang ditugaskan ke akun tersebut.
3. Buka ticket untuk melihat alamat, nomor WhatsApp, lokasi navigasi, jadwal, timeline, dan lampiran.
4. Ubah progres sesuai pekerjaan:
   - `assigned` → **Dalam Perjalanan** (`on_the_way`)
   - `on_the_way` → **Dikerjakan** (`in_progress`)
   - `in_progress` → **Selesai** (`resolved`)
5. Bila pekerjaan tertunda, pilih **Tunda** dan isi alasan. Status menjadi `pending`.
6. Isi **Penyebab gangguan** dan **Tindakan yang dilakukan**, lalu klik **Simpan laporan**.
7. Unggah minimal satu foto bukti pekerjaan.
8. Klik **Selesai**.

Sistem menolak status `resolved` sampai laporan penyebab, tindakan, dan minimal satu lampiran tersedia.

## Verifikasi dan penutupan

Admin/Owner memeriksa laporan, timeline, dan foto bukti pada detail ticket. Jika pekerjaan sesuai, klik **Verifikasi & tutup**.

Hanya Admin/Owner dapat mengubah `resolved` menjadi `closed`.

## Status lifecycle

| Status | Arti | Transisi yang diizinkan |
| --- | --- | --- |
| `open` | Ticket baru, belum ditugaskan | `assigned`, `cancelled` |
| `assigned` | Teknisi sudah ditugaskan | `on_the_way`, `in_progress`, `pending`, `cancelled` |
| `on_the_way` | Teknisi menuju lokasi | `in_progress`, `pending` |
| `in_progress` | Pekerjaan sedang dilakukan | `pending`, `resolved` |
| `pending` | Ditunda dengan alasan | `assigned`, `cancelled` |
| `resolved` | Pekerjaan selesai oleh teknisi | `closed`, `in_progress` |
| `closed` | Sudah diverifikasi Admin/Owner | `in_progress` |
| `cancelled` | Dibatalkan | Tidak ada |

Setiap pembuatan, penugasan, perubahan status, laporan, dan unggahan lampiran dicatat di timeline `ticket_events`.

## Kategori dan nomor ticket

| Nilai API | Label UI |
| --- | --- |
| `no_connection` | Tidak ada koneksi |
| `slow_connection` | Koneksi lambat |
| `broken_cable` | Kabel putus |
| `device_damage` | Perangkat rusak |
| `relocation` | Relokasi |
| `other` | Lainnya |

Nomor ticket dibuat otomatis setelah insert:

- Pemasangan: `INS-YYYYMMDD-####`
- Maintenance: `MNT-YYYYMMDD-####`

Angka akhir berasal dari ID database dan dipadatkan empat digit minimum.

## API internal

Base URL: `/api/tickets`. Semua endpoint berikut memerlukan JWT dan permission `tickets`.

| Method | Endpoint | Izin / role | Fungsi |
| --- | --- | --- | --- |
| `GET` | `/api/tickets` | `tickets:view` | Daftar ticket. Teknisi otomatis dibatasi ke ticket sendiri. |
| `GET` | `/api/tickets/customers?category={category}` | `tickets:create`, Admin/Owner | Daftar pelanggan aktif. Kategori `broken_cable` dan `device_damage` hanya mengembalikan pelanggan dengan ONT offline; kategori lain mengembalikan semua pelanggan aktif. |
| `GET` | `/api/tickets/technicians` | `tickets:view`, Admin/Owner | Daftar teknisi aktif. |
| `GET` | `/api/tickets/:id` | `tickets:view` | Detail ticket, events, dan attachments. |
| `POST` | `/api/tickets` | `tickets:create`, Admin/Owner | Membuka ticket. |
| `PATCH` | `/api/tickets/:id/assign` | `tickets:edit`, Admin/Owner | Menugaskan atau memindah teknisi. |
| `PATCH` | `/api/tickets/:id/status` | `tickets:edit` | Mengubah status dalam lifecycle valid. |
| `POST` | `/api/tickets/:id/report` | `tickets:edit` | Menyimpan laporan kerja. |
| `POST` | `/api/tickets/:id/attachments` | `tickets:edit` | Mengunggah lampiran bukti. |

### Query daftar

`GET /api/tickets` menerima parameter opsional:

| Parameter | Contoh | Keterangan |
| --- | --- | --- |
| `status` | `in_progress` | Filter status; gunakan `all` atau kosong untuk semua. |
| `type` | `maintenance` | Filter jenis. |
| `priority` | `critical` | Filter prioritas. |
| `q` | `Budi` | Cari nomor ticket, judul, nama pelanggan, atau kode pelanggan. |
| `page` | `2` | Halaman, mulai dari 1. |
| `limit` | `12` | Jumlah data; dibatasi 1–100. |

Respons berisi `rows`, `total`, dan agregat `counts` per status.

### Contoh membuka ticket

```bash
curl -X POST https://domain-anda/api/tickets \
  -H 'Authorization: Bearer <JWT>' \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id": 42,
    "type": "maintenance",
    "category": "no_connection",
    "subject": "Gangguan koneksi - Budi",
    "description": "Pelanggan melapor internet mati sejak pagi.",
    "priority": "high",
    "assigned_to": 7,
    "scheduled_at": "2026-10-11T14:00"
  }'
```

### Contoh perubahan status

```bash
curl -X PATCH https://domain-anda/api/tickets/12/status \
  -H 'Authorization: Bearer <JWT>' \
  -H 'Content-Type: application/json' \
  -d '{"status":"in_progress"}'
```

Untuk menunda, `pending_reason` wajib ada:

```json
{"status":"pending","pending_reason":"Menunggu akses kunci lokasi ODP."}
```

### Contoh laporan dan foto bukti

```bash
curl -X POST https://domain-anda/api/tickets/12/report \
  -H 'Authorization: Bearer <JWT>' \
  -H 'Content-Type: application/json' \
  -d '{
    "cause":"Patch cord di ODP putus.",
    "action":"Ganti patch cord dan uji koneksi.",
    "materials":"1 patch cord SC/APC"
  }'

curl -X POST https://domain-anda/api/tickets/12/attachments \
  -H 'Authorization: Bearer <JWT>' \
  -F 'type=evidence' \
  -F 'file=@/path/foto-bukti.jpg'
```

Tipe lampiran: `before`, `after`, atau `evidence`. Maksimum file 5 MB. Upload umum menerima gambar JPEG/PNG/WebP, PDF, dan CSV; UI ticket membatasi pemilihan ke gambar. Sebelum file diproses, server memeriksa bahwa ticket milik teknisi tersebut atau user adalah Admin/Owner.

## Troubleshooting

| Masalah | Pemeriksaan / tindakan |
| --- | --- |
| Menu Tiket Gangguan tidak muncul | Periksa permission `tickets:view` pada role. Owner selalu lolos. |
| Tombol Buka Ticket tidak ada | Login sebagai `owner` atau `finance`; pastikan `tickets:create`. |
| Pelanggan tidak ada pada picker | Maintenance picker hanya menampilkan pelanggan `active` dengan sesi PPPoE `offline`. Periksa status pelanggan dan `pppoe_sessions`. |
| Tidak dapat membuat maintenance | Cari ticket aktif pelanggan. Selesaikan atau batalkan ticket lama lebih dulu. |
| Tidak dapat menekan Selesai | Simpan penyebab, tindakan, lalu unggah minimal satu foto bukti. |
| 403 “Tiket ini bukan tugas Anda” | Teknisi hanya dapat membuka ticket dengan `assigned_to` sama dengan user login. |
| Foto tidak dapat diunggah | Cek ukuran maksimal 5 MB, tipe gambar, permission `tickets:edit`, dan izin tulis folder upload. |
| Ticket tidak terlihat setelah status berubah | Muat ulang daftar atau hilangkan filter status/jenis aktif. |

## Batasan versi saat ini

- Open ticket dari UI memakai daftar pelanggan offline untuk kedua jenis ticket.
- Tidak ada registrasi prospek/marketing atau pembuatan calon pelanggan publik pada modul ini.
- Notifikasi penugasan menggunakan notifikasi dalam aplikasi. Integrasi WhatsApp belum dipanggil oleh route ticket.
- Tidak ada penghapusan lampiran dari UI/API ticket.