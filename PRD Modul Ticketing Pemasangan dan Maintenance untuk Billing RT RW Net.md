# PRD: Modul Ticketing Pemasangan & Maintenance untuk Billing RT RW Net

Oct 11, 2026 · @Jaja Eri

## 1. Ringkasan & Latar Belakang

Modul ini menambahkan **ticketing pemasangan baru dan maintenance jaringan** ke website billing RT RW Net yang sudah berjalan (Next.js + Node.js), sehingga pendaftaran pelanggan, penugasan teknisi, dan penanganan gangguan berada dalam satu sistem dengan satu sumber data pelanggan.

**Masalah saat ini**

- Marketing mendaftarkan calon pelanggan secara manual (chat/catatan), lalu meneruskannya ke teknisi tanpa jejak yang rapi.
- Pelanggan yang offline diketahui dari laporan pelanggan atau pengecekan manual, bukan dari data billing/jaringan.
- Admin tidak punya satu tempat untuk melihat status pekerjaan teknisi, siapa yang menangani, dan berapa lama penyelesaiannya.

**Solusi yang diusulkan**

1. **Registrasi online oleh Marketing**: Marketing mengisi form calon pelanggan, memilih paket, lalu sistem otomatis membuat *ticket pemasangan baru* untuk teknisi.
2. **Open ticket oleh Admin**: Admin memilih pelanggan dari daftar *pelanggan offline* (diambil dari data billing), lalu membuat ticket perbaikan/maintenance dan menugaskan teknisi.
3. **Aplikasi kerja Teknisi**: Teknisi melihat ticket miliknya, mengubah status, mengunggah foto bukti, dan menutup ticket dari HP.

**Ruang lingkup**

| Termasuk (In Scope) | Tidak termasuk (Out of Scope) |
| --- | --- |
| Form registrasi calon pelanggan oleh Marketing | Portal self-service pelanggan (daftar sendiri) |
| Ticket pemasangan baru & ticket maintenance | Perubahan modul tagihan/pembayaran yang sudah ada |
| Daftar pelanggan offline dari data billing | Monitoring jaringan real-time penuh (NMS) |
| Dashboard & riwayat ticket per role | Manajemen stok/inventaris perangkat (fase lanjutan) |
| Notifikasi status ticket (WhatsApp/in-app) | Aplikasi mobile native (cukup web responsif/PWA) |

## 2. Tujuan, KPI, dan Non-Goals

Tujuan utama: setiap pekerjaan lapangan (pasang baru dan perbaikan) tercatat, ditugaskan, dan dapat dilacak dari awal sampai selesai dalam satu sistem billing.

| Tujuan | Indikator (KPI) | Target awal |
| --- | --- | --- |
| Pendaftaran tercatat digital | % calon pelanggan masuk lewat form online | 100% dalam 1 bulan setelah rilis |
| Penugasan pasang baru cepat | Waktu dari registrasi sampai teknisi ditugaskan | ≤ 1 jam kerja |
| Penanganan gangguan responsif | Waktu respon pertama ticket maintenance | ≤ 2 jam (prioritas tinggi) |
| Gangguan selesai tepat waktu | % ticket selesai dalam SLA | ≥ 85% |
| Transparansi pekerjaan | % ticket ditutup dengan foto bukti & catatan | ≥ 95% |
| Data konsisten | Ticket yang terhubung ke data pelanggan di billing | 100% |

*Target di atas adalah usulan awal; sesuaikan dengan kapasitas jumlah teknisi dan wilayah layanan Anda.*

**Non-goals**

- Tidak menggantikan sistem billing; modul ini terintegrasi dan memakai data pelanggan yang sudah ada.
- Tidak membangun sistem monitoring perangkat jaringan penuh; status offline cukup diambil dari sumber yang sudah dipakai billing.
- Tidak mengubah alur penagihan, jatuh tempo, atau isolir pelanggan.

## 3. Role & Hak Akses

Sistem memakai empat role. Role **Admin** dan **Super Admin** diasumsikan sudah ada di billing; role **Marketing** dan **Teknisi** ditambahkan atau dipetakan dari role yang ada.

| Role | Tugas utama di modul ini |
| --- | --- |
| Marketing | Mendaftarkan calon pelanggan, memantau status ticket pasang baru miliknya |
| Admin | Membuat ticket maintenance, menugaskan/memindahkan teknisi, memantau semua ticket |
| Teknisi | Mengerjakan ticket yang ditugaskan, memperbarui status, mengunggah bukti |
| Super Admin / Owner | Semua hak Admin, kelola user & role, lihat laporan dan audit log |

**Matriks hak akses (RBAC)**

| Fitur | Marketing | Admin | Teknisi | Super Admin |
| --- | --- | --- | --- | --- |
| Buat registrasi calon pelanggan | Ya | Ya | Tidak | Ya |
| Lihat registrasi/ticket pasang baru | Milik sendiri | Semua | Yang ditugaskan | Semua |
| Buat ticket maintenance | Tidak | Ya | Tidak | Ya |
| Lihat daftar pelanggan offline | Tidak | Ya | Hanya pelanggan di ticketnya | Ya |
| Tugaskan / pindahkan teknisi | Tidak | Ya | Tidak | Ya |
| Ubah status ticket (proses lapangan) | Tidak | Ya | Ya (ticket sendiri) | Ya |
| Unggah foto & catatan penyelesaian | Tidak | Ya | Ya | Ya |
| Batalkan / buka ulang ticket | Tidak | Ya | Tidak | Ya |
| Aktivasi pelanggan baru di billing | Tidak | Ya | Usulan (konfirmasi Admin) | Ya |
| Laporan & audit log | Tidak | Laporan | Tidak | Ya |

Aturan tambahan: Marketing hanya melihat data pelanggan yang ia daftarkan sendiri, dan Teknisi tidak dapat melihat data tagihan pelanggan.

## 4. User Stories

**Marketing**

- Sebagai marketing, saya ingin mengisi data calon pelanggan (nama, NIK opsional, alamat, titik koordinat, kontak, paket) dari HP agar tidak perlu mencatat manual.
- Sebagai marketing, saya ingin otomatis membuat ticket pasang baru setelah registrasi agar teknisi langsung mendapat tugas.
- Sebagai marketing, saya ingin melihat status pemasangan calon pelanggan saya (menunggu, dijadwalkan, selesai) agar bisa memberi kabar ke pelanggan.

**Admin**

- Sebagai admin, saya ingin melihat daftar pelanggan offline dari data billing agar bisa langsung membuat ticket perbaikan.
- Sebagai admin, saya ingin menugaskan teknisi, mengatur prioritas, dan menjadwalkan kunjungan agar pekerjaan terbagi merata.
- Sebagai admin, saya ingin memantau semua ticket dan SLA-nya agar tahu pekerjaan yang terlambat.
- Sebagai admin, saya ingin mengaktifkan pelanggan baru di billing setelah pemasangan selesai agar tagihan mulai berjalan.

**Teknisi**

- Sebagai teknisi, saya ingin melihat daftar ticket yang ditugaskan beserta alamat dan peta agar mudah menuju lokasi.
- Sebagai teknisi, saya ingin mengubah status (otw, mulai kerja, selesai) agar admin dan marketing mengetahui progres.
- Sebagai teknisi, saya ingin mengunggah foto, catatan, dan data perangkat (ONU/router, panjang kabel, redaman) sebagai bukti pekerjaan.
- Sebagai teknisi, saya ingin menandai ticket *tertunda* beserta alasannya (misalnya pelanggan tidak di rumah) agar tidak dianggap terlambat tanpa konteks.

**Super Admin**

- Sebagai owner, saya ingin melihat laporan jumlah ticket, waktu penyelesaian, dan performa tiap teknisi agar bisa mengevaluasi layanan.

## 5. Alur Bisnis

&#91;embedded content: alur pasang baru dan maintenance · 2 alur, 5 langkah\]

Alur A mengubah registrasi Marketing menjadi pelanggan aktif di billing; alur B mengubah pelanggan offline menjadi ticket perbaikan. Pada kedua alur, Admin yang memegang keputusan akhir (aktivasi atau penutupan), sedangkan teknisi memberi bukti kerja.

**Aturan alur**

- Registrasi dengan no. HP yang sama dengan calon aktif ditolak atau diberi peringatan agar tidak ganda.
- Jika pelanggan tidak ada di lokasi, teknisi menandai ticket *Tertunda* dengan alasan, lalu Admin menjadwalkan ulang.
- Bila teknisi tidak dapat menyelesaikan di tempat (perangkat rusak, kabel putus panjang), Admin dapat membuat tindak lanjut sebagai ticket baru yang terhubung ke ticket awal.

## 6. Kebutuhan Fungsional

Prioritas: **P0** = wajib di MVP, **P1** = fase berikutnya, **P2** = opsional.

**FR-1 Registrasi calon pelanggan online (Marketing)**

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-1.1 | Form registrasi: nama, no. HP/WA, alamat lengkap, patokan, koordinat (peta/GPS), paket, catatan | P0 |
| FR-1.2 | Validasi: no. HP unik, field wajib, format koordinat; peringatan jika alamat/no. HP sudah terdaftar | P0 |
| FR-1.3 | Unggah foto KTP/lokasi (opsional, ukuran dibatasi) | P1 |
| FR-1.4 | Setelah simpan, sistem otomatis membuat ticket pasang baru berstatus *Open* | P0 |
| FR-1.5 | Daftar & detail registrasi milik marketing, dengan filter status dan pencarian | P0 |
| FR-1.6 | Hitung jumlah pemasangan berhasil per marketing (untuk insentif) | P2 |

**FR-2 Ticket pemasangan baru**

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-2.1 | Ticket terhubung ke data registrasi/pelanggan calon (satu sumber data) | P0 |
| FR-2.2 | Admin menugaskan teknisi dan menetapkan jadwal kunjungan | P0 |
| FR-2.3 | Teknisi mengisi hasil pemasangan: perangkat (tipe, serial/MAC), PPPoE/hotspot user, redaman, foto bukti | P0 |
| FR-2.4 | Setelah ticket selesai, Admin mengaktifkan pelanggan di billing (data calon menjadi pelanggan aktif) | P0 |
| FR-2.5 | Penjadwalan ulang dan pembatalan dengan alasan wajib | P1 |

**FR-3 Ticket maintenance / perbaikan (Admin)**

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-3.1 | Halaman *Pelanggan Offline* yang mengambil data dari billing, dengan filter wilayah/paket dan lama offline | P0 |
| FR-3.2 | Tombol *Buat Ticket* dari baris pelanggan; data pelanggan terisi otomatis (nama, alamat, paket, kontak, koordinat) | P0 |
| FR-3.3 | Kategori gangguan: tidak ada koneksi, lambat, kabel putus, perangkat rusak, relokasi, lainnya | P0 |
| FR-3.4 | Cegah ticket ganda: satu pelanggan hanya boleh punya satu ticket maintenance aktif | P0 |
| FR-3.5 | Penugasan teknisi, prioritas (rendah/normal/tinggi/kritis), dan jadwal | P0 |
| FR-3.6 | Ticket massal untuk gangguan area (beberapa pelanggan satu ODP/area) dalam satu ticket induk | P1 |
| FR-3.7 | Ticket otomatis ditutup/ditandai jika pelanggan kembali online (dengan konfirmasi Admin) | P2 |

**FR-4 Aplikasi kerja Teknisi (web responsif / PWA)**

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-4.1 | Daftar tugas hari ini dan yang tertunda, terurut prioritas dan jadwal | P0 |
| FR-4.2 | Detail ticket: data pelanggan, alamat, tombol buka peta/navigasi, tombol hubungi WA/telepon | P0 |
| FR-4.3 | Ubah status: Diterima → Dalam Perjalanan → Dikerjakan → Selesai/Tertunda | P0 |
| FR-4.4 | Form penyelesaian: penyebab, tindakan, material terpakai, foto sebelum/sesudah, catatan | P0 |
| FR-4.5 | Unggah foto dengan kompresi di sisi klien agar hemat kuota | P1 |
| FR-4.6 | Mode offline-tolerant: draft laporan tersimpan lokal saat sinyal buruk | P2 |

**FR-5 Komentar, riwayat, dan notifikasi**

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-5.1 | Timeline aktivitas di tiap ticket (siapa mengubah apa dan kapan) | P0 |
| FR-5.2 | Komentar internal antar Admin, Marketing, dan Teknisi pada ticket | P1 |
| FR-5.3 | Notifikasi in-app untuk penugasan, perubahan status, dan SLA hampir lewat | P0 |
| FR-5.4 | Notifikasi WhatsApp ke teknisi (tugas baru) dan ke pelanggan (jadwal & selesai) | P1 |

**FR-6 Dashboard & laporan**

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-6.1 | Dashboard Admin: jumlah ticket per status, ticket lewat SLA, beban kerja per teknisi | P0 |
| FR-6.2 | Dashboard Marketing: registrasi saya per status | P0 |
| FR-6.3 | Laporan periodik (harian/bulanan) dengan ekspor CSV/Excel | P1 |

## 7. Status, Prioritas, dan SLA

&#91;embedded content: siklus status ticket · 6 status utama, 2 cabang\]

Status yang sama dipakai untuk ticket pasang baru dan maintenance. Pada ticket pasang baru, *Closed* terjadi setelah Admin mengaktifkan pelanggan di billing.

| Status | Diubah oleh | Arti |
| --- | --- | --- |
| Open | Sistem / Admin | Ticket dibuat, belum ada teknisi |
| Assigned | Admin | Teknisi dan jadwal sudah ditetapkan |
| On the way | Teknisi | Teknisi menuju lokasi pelanggan |
| In progress | Teknisi | Pekerjaan di lokasi sedang berjalan |
| Pending | Teknisi | Tertunda; alasan wajib diisi (misalnya pelanggan tidak ada, menunggu material) |
| Resolved | Teknisi | Pekerjaan selesai; laporan dan foto bukti sudah terisi |
| Closed | Admin | Hasil diverifikasi (maintenance) atau pelanggan aktif di billing (pasang baru) |
| Cancelled | Admin | Ticket dibatalkan dengan alasan |

Admin dapat membuka ulang ticket *Resolved* atau *Closed* menjadi *In progress* bila gangguan berulang; setiap pembukaan ulang tercatat di timeline. Transisi di luar alur ini ditolak oleh API.

**Prioritas dan SLA (usulan, sesuaikan dengan kapasitas teknisi)**

| Prioritas | Contoh kasus | Respon pertama | Target selesai |
| --- | --- | --- | --- |
| Kritis | Gangguan banyak pelanggan satu area | 1 jam | 4 jam |
| Tinggi | Satu pelanggan offline total, pelanggan bisnis | 2 jam | 8 jam |
| Normal | Koneksi lambat atau putus-nyambung | 4 jam | 24 jam |
| Rendah | Relokasi, penggantian perangkat terjadwal | 8 jam | 72 jam |
| Pasang baru | Ticket dari registrasi Marketing | Ditugaskan ≤ 1 jam kerja | Sesuai jadwal kunjungan |

Jam SLA dihitung pada jam kerja yang diatur Admin (misalnya 08.00 sampai 21.00), dan waktu berstatus *Pending* tidak dihitung sebagai keterlambatan teknisi.

## 8. Kebutuhan Non-Fungsional

| Aspek | Kebutuhan |
| --- | --- |
| Autentikasi | Memakai sesi/JWT yang sudah ada di billing; token berumur pendek + refresh; logout otomatis saat tidak aktif |
| Otorisasi | RBAC dicek di **API (Node.js)**, bukan hanya di UI Next.js; setiap endpoint memeriksa role dan kepemilikan data |
| Keamanan data | Data pribadi (KTP, alamat, no. HP) hanya diakses role berwenang; foto KTP disimpan privat dengan URL bertanda tangan; HTTPS wajib |
| Validasi | Validasi input di sisi server (skema, mis. Zod/Joi), batas ukuran dan tipe file unggahan, proteksi SQL injection dan XSS |
| Audit log | Semua perubahan status, penugasan, dan aktivasi pelanggan dicatat: user, waktu, nilai lama dan baru |
| Performa | Halaman daftar ticket < 2 detik untuk 10.000 ticket (pagination sisi server, indeks pada status/teknisi/pelanggan) |
| Mobile-first | Halaman Marketing dan Teknisi nyaman di layar HP 360 px; tombol besar, form singkat |
| Ketersediaan | Target 99% jam kerja; kegagalan notifikasi tidak boleh menggagalkan pembuatan ticket (antrean + retry) |
| Integritas data | Pembuatan registrasi + ticket dalam satu transaksi database; kunci unik untuk mencegah ticket ganda |
| Privasi | Kebijakan retensi untuk foto dan data calon pelanggan yang batal (mis. dihapus setelah 90 hari); mengikuti UU PDP |
| Observabilitas | Log terstruktur, pencatatan error, dan health check endpoint |
| Kompatibilitas | Chrome/Android versi terbaru dan Safari iOS; PWA *add to home screen* untuk teknisi |

## 9. Arsitektur Teknis

&#91;embedded content: arsitektur modul ticketing · 4 lapisan\]

Modul ini ditambahkan sebagai bagian dari aplikasi yang sudah ada, bukan sistem terpisah, supaya login, role, dan data pelanggan tetap satu sumber.

**Prinsip konsistensi dengan sistem saat ini**

- **Frontend Next.js**: halaman baru dibuat di bawah rute role (`/marketing`, `/admin`, `/teknisi`) dengan komponen UI, layout, dan pola data-fetching yang sama dengan halaman billing yang ada.
- **Backend Node.js**: modul `prospects` dan `tickets` ditambahkan dengan pola routing, validasi, dan penanganan error yang sama dengan modul billing; tidak ada akses database langsung dari Next.js.
- **Database**: hanya menambah tabel baru (bagian 10). Tabel `customers` dan sejenisnya dibaca, tidak diubah strukturnya; penulisan ke tabel pelanggan hanya terjadi saat aktivasi, dalam satu transaksi.
- **Autentikasi**: memakai mekanisme login yang ada; role Marketing dan Teknisi ditambahkan pada tabel user/role yang sudah ada.

**Cara pelanggan offline ditentukan**

| Opsi | Cara kerja | Catatan |
| --- | --- | --- |
| A. Dari data billing yang sudah ada | Halaman *Pelanggan Offline* membaca status/last-seen yang sudah disimpan billing | Paling sederhana; dipilih bila billing sudah punya status koneksi |
| B. Sinkron berkala dari Mikrotik/RADIUS | Job terjadwal di Node.js membaca sesi PPPoE aktif dan menyimpan `last_seen` per pelanggan | Dipakai bila billing belum menyimpan status; interval mis. 5 menit |
| C. Ping/cek manual | Admin memeriksa lalu memilih pelanggan | Cadangan bila sumber otomatis tidak tersedia |

Rekomendasi: mulai dari opsi A atau B sesuai kondisi billing Anda, dan tampilkan waktu *terakhir online* agar Admin dapat membedakan gangguan sesaat dari gangguan nyata. Pelanggan yang diisolir karena tunggakan harus dikecualikan dari daftar offline.

## 10. Desain Data

Modul ini **menambah tabel baru** dan hanya *membaca* tabel pelanggan yang sudah ada di billing (`customers`, `packages`, dan status koneksi). Nama tabel di bawah adalah usulan; sesuaikan dengan konvensi database billing Anda.

**`prospects` (calon pelanggan hasil registrasi)**

| Field | Tipe | Keterangan |
| --- | --- | --- |
| id | PK |  |
| registered\_by | FK users | Marketing yang mendaftarkan |
| name, phone, email | string | No. HP unik per calon aktif |
| address, landmark | text |  |
| latitude, longitude | decimal | Dari peta/GPS |
| package\_id | FK packages | Paket yang dipilih |
| id\_photo\_url, location\_photo\_url | string | Opsional, penyimpanan privat |
| status | enum | `new`, `scheduled`, `installed`, `activated`, `cancelled` |
| customer\_id | FK customers, null | Terisi setelah diaktivasi di billing |
| created\_at, updated\_at | timestamp |  |

**`tickets`**

| Field | Tipe | Keterangan |
| --- | --- | --- |
| id, ticket\_no | PK, string | Format mis. `INS-20261011-001` / `MNT-20261011-001` |
| type | enum | `installation`, `maintenance` |
| prospect\_id | FK, null | Untuk type `installation` |
| customer\_id | FK, null | Untuk type `maintenance` |
| category | enum | Kategori gangguan (lihat FR-3.3) |
| priority | enum | `low`, `normal`, `high`, `critical` |
| status | enum | Lihat bagian 7 |
| title, description | string, text |  |
| created\_by | FK users | Marketing (otomatis) atau Admin |
| assigned\_to | FK users, null | Teknisi |
| scheduled\_at | datetime, null | Jadwal kunjungan |
| due\_at | datetime | Batas SLA, dihitung dari prioritas |
| started\_at, resolved\_at, closed\_at | datetime | Untuk hitung durasi |
| resolution\_note | text | Penyebab dan tindakan |

**Tabel pendukung**

| Tabel | Isi utama | Relasi |
| --- | --- | --- |
| ticket\_events | Riwayat: aksi, status lama/baru, aktor, waktu, catatan | ticket\_id, user\_id |
| ticket\_comments | Komentar internal | ticket\_id, user\_id |
| ticket\_attachments | URL foto, tipe (`before`, `after`, `evidence`), uploader | ticket\_id |
| ticket\_work\_reports | Perangkat terpasang, serial/MAC, redaman (dBm), panjang kabel, material | ticket\_id (1:1) |
| notifications | Penerima, judul, isi, kanal, status kirim, dibaca | user\_id, ticket\_id |
| technician\_profiles (opsional) | Wilayah kerja, status aktif, no. WA | user\_id |

**Aturan data penting**

- Tepat satu dari `prospect_id` atau `customer_id` terisi, sesuai `type`.
- Indeks unik parsial: satu pelanggan hanya boleh punya satu ticket `maintenance` yang belum berstatus selesai/batal.
- Saat aktivasi, data `prospects` disalin ke `customers` di billing dalam satu transaksi, lalu `prospects.customer_id` diisi.

## 11. Spesifikasi API & Halaman Next.js

API mengikuti pola REST di Node.js yang sudah dipakai billing, dengan prefix `/api/v1`. Semua endpoint wajib login dan dicek role-nya di server.

**Endpoint**

| Method & Path | Fungsi | Role |
| --- | --- | --- |
| POST `/prospects` | Buat registrasi + otomatis buat ticket pasang baru | Marketing, Admin |
| GET `/prospects` | Daftar registrasi (filter status, tanggal, pencarian) | Marketing (milik sendiri), Admin |
| GET `/prospects/:id` | Detail registrasi | Marketing (milik sendiri), Admin |
| POST `/prospects/:id/activate` | Aktivasi menjadi pelanggan di billing | Admin |
| GET `/customers/offline` | Daftar pelanggan offline dari billing (filter wilayah, paket, lama offline) | Admin |
| POST `/tickets` | Buat ticket maintenance dari `customer_id` | Admin |
| GET `/tickets` | Daftar ticket (filter tipe, status, prioritas, teknisi); hasil dibatasi role | Semua |
| GET `/tickets/:id` | Detail ticket + timeline | Sesuai hak akses |
| PATCH `/tickets/:id/assign` | Tugaskan/pindahkan teknisi, jadwal, prioritas | Admin |
| PATCH `/tickets/:id/status` | Ubah status sesuai transisi yang diizinkan | Admin, Teknisi |
| POST `/tickets/:id/report` | Kirim laporan pekerjaan (perangkat, redaman, penyebab, tindakan) | Teknisi, Admin |
| POST `/tickets/:id/attachments` | Unggah foto bukti | Teknisi, Admin |
| POST `/tickets/:id/comments` | Tambah komentar | Semua yang berhak |
| GET `/me/tasks` | Tugas teknisi yang login | Teknisi |
| GET `/notifications` & PATCH `/notifications/:id/read` | Notifikasi in-app | Semua |
| GET `/reports/tickets` | Laporan dan ekspor | Admin, Super Admin |

Format respons seragam: `{ success, data, error: { code, message } }`. Daftar memakai pagination `page` dan `limit`. Perubahan status dengan transisi tidak valid mengembalikan HTTP 409.

**Halaman Next.js**

| Rute | Isi | Role |
| --- | --- | --- |
| `/marketing/registrasi/baru` | Form registrasi calon pelanggan + peta | Marketing |
| `/marketing/registrasi` | Daftar & status registrasi saya | Marketing |
| `/admin/tickets` | Daftar semua ticket, filter, penugasan cepat | Admin |
| `/admin/tickets/[id]` | Detail, timeline, komentar, aksi | Admin |
| `/admin/pelanggan-offline` | Daftar pelanggan offline + tombol *Buat Ticket* | Admin |
| `/admin/dashboard-ticket` | Ringkasan status, SLA, beban teknisi | Admin |
| `/teknisi/tugas` | Tugas hari ini dan tertunda | Teknisi |
| `/teknisi/tugas/[id]` | Detail, ubah status, form laporan, unggah foto | Teknisi |

Rute dilindungi middleware Next.js berdasarkan role; data diambil melalui API di atas, dan daftar besar memakai pagination sisi server.

## 12. Notifikasi & Integrasi Eksternal

| Integrasi | Kegunaan | Prioritas | Catatan |
| --- | --- | --- | --- |
| Notifikasi in-app | Tugas baru, perubahan status, SLA hampir lewat | P0 | Polling atau Server-Sent Events; tanpa biaya tambahan |
| WhatsApp gateway | Tugas baru ke teknisi; jadwal dan penyelesaian ke pelanggan | P1 | Gunakan gateway yang sudah dipakai billing (jika ada); kirim lewat antrean dengan retry |
| Telegram bot (alternatif) | Notifikasi grup teknisi | P2 | Opsional bila WhatsApp dibatasi |
| Peta (Leaflet/OpenStreetMap) | Memilih koordinat di form, tombol navigasi ke Google Maps | P0 | OpenStreetMap tidak berbayar |
| Penyimpanan file | Foto KTP, lokasi, bukti kerja | P0 | Disk server atau object storage (S3-compatible); akses privat |
| Status koneksi pelanggan | Menentukan pelanggan offline | P0 | Lihat bagian 9 |
| Ekspor laporan | CSV/Excel untuk laporan bulanan | P1 |  |

**Template pesan WhatsApp (usulan)**

- Ke teknisi: nomor ticket, nama pelanggan, alamat, prioritas, jadwal, dan tautan ke detail ticket.
- Ke pelanggan (pasang baru): konfirmasi jadwal kunjungan dan nama teknisi.
- Ke pelanggan (maintenance): ticket diterima, teknisi menuju lokasi, dan gangguan selesai.

Pesan ke pelanggan hanya dikirim jika Admin mengaktifkan opsi tersebut di pengaturan, agar tidak mengirim pesan massal tanpa kontrol.

## 13. Rencana Rilis dan Dependensi

&#91;embedded content: roadmap rilis · 4 fase, 3 gate\]

Fase 1 (MVP) sudah memberi seluruh alur inti: Marketing mendaftarkan, Admin menugaskan atau membuat ticket gangguan, dan Teknisi menyelesaikan dengan bukti. Fase berikutnya hanya menambah kenyamanan dan otomatisasi.

**Dependensi**

| Dependensi | Dibutuhkan untuk | Pemilik |
| --- | --- | --- |
| Akses kode dan database billing (staging dan produksi) | Seluruh fase | Pemilik sistem |
| Keputusan sumber status offline (bagian 9) | Fase 1, halaman Pelanggan Offline | Admin jaringan |
| Daftar user: marketing dan teknisi beserta no. WhatsApp | Fase 1 | Admin |
| Gateway WhatsApp (atau Telegram) | Fase 2 | Pemilik sistem |
| Penyimpanan file (disk atau object storage) | Fase 1 | Developer |
| 2 sampai 3 orang penguji (Admin, Marketing, Teknisi) | UAT akhir Fase 1 | Operasional |

**Strategi rilis**

- Rilis ke satu wilayah atau 2 sampai 3 teknisi terlebih dahulu, lalu perluas setelah gate lolos.
- Sediakan fitur flag untuk menyalakan modul per role, sehingga rollback tidak memengaruhi billing yang berjalan.
- Lakukan backup database sebelum migrasi tabel baru.

## 14. Risiko, Asumsi, Pertanyaan Terbuka, dan UAT

**Risiko**

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Status offline tidak akurat (pelanggan sengaja dimatikan, jaringan area down) | Ticket salah atau ganda | Admin memverifikasi sebelum membuat ticket; satu ticket aktif per pelanggan; ticket induk untuk gangguan area |
| Teknisi di lapangan sinyal buruk | Laporan terlambat | Kompresi foto, draft lokal (P2), pembaruan status ringan |
| Data pribadi calon pelanggan bocor | Pelanggaran privasi | RBAC ketat, penyimpanan privat, audit log, retensi data |
| Teknisi/marketing tidak disiplin mengisi data | Data tidak lengkap | Field wajib saat menutup ticket, validasi, laporan kepatuhan |
| Perubahan tabel billing mengganggu sistem lama | Regresi | Hanya baca tabel lama; tabel baru terpisah; uji regresi sebelum rilis |

**Asumsi**

- Billing saat ini sudah punya login, role Admin, tabel pelanggan, dan status koneksi (aktif/isolir/offline) atau dapat diambil dari Mikrotik/RADIUS.
- Teknisi memakai HP Android dengan browser modern dan paket data.
- Satu ticket pasang baru ditangani satu teknisi utama.
- Notifikasi WhatsApp memakai gateway yang sudah ada atau akan disediakan.

**Pertanyaan terbuka**

- [ ] Bagaimana billing saat ini menentukan pelanggan *offline* (ping, Mikrotik API, session RADIUS, atau input manual)?
- [ ] Database apa yang dipakai (MySQL/PostgreSQL) dan ORM apa (Prisma, Sequelize, atau query langsung)?
- [ ] Apakah ada biaya instalasi atau voucher yang harus dicatat saat pemasangan?
- [ ] Apakah marketing mendapat insentif per pemasangan sehingga perlu laporan khusus?
- [ ] Apakah Admin perlu persetujuan sebelum teknisi menutup ticket, atau cukup teknisi menutup sendiri?
- [ ] Berapa jumlah teknisi, marketing, dan pelanggan saat ini (untuk kapasitas dan SLA)?

**Kriteria penerimaan (UAT)**

1. Marketing dapat mendaftarkan calon pelanggan dari HP; ticket pasang baru otomatis muncul di Admin dan tidak dapat dibuat ganda untuk no. HP yang sama.
2. Marketing hanya melihat registrasi miliknya; Teknisi hanya melihat ticket yang ditugaskan padanya.
3. Admin dapat membuka daftar pelanggan offline, membuat ticket, dan data pelanggan terisi otomatis.
4. Pelanggan yang sudah punya ticket maintenance aktif tidak dapat dibuatkan ticket kedua.
5. Teknisi dapat mengubah status, mengisi laporan, dan mengunggah foto; ticket tidak bisa selesai tanpa laporan dan minimal satu foto bukti.
6. Setelah pemasangan selesai, Admin dapat mengaktifkan pelanggan dan data tampil di modul billing yang ada tanpa mengubah tagihan lain.
7. Setiap perubahan status tercatat di timeline beserta pelakunya.
8. Notifikasi penugasan diterima teknisi dalam 1 menit (in-app).
