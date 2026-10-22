# PRD Portal Pelanggan Netbill

Oct 14, 2026 · @Jaja Eri

## 1. Ringkasan dan latar belakang

Portal Pelanggan Netbill adalah aplikasi web self-service yang memungkinkan pelanggan ISP melihat data langganan dan mengatur perangkat ONT sendiri, tanpa menghubungi admin atau teknisi. Semua data bersumber dari endpoint Netbill, dan pengaturan ONT dijalankan lewat server GenieACS.

**Masalah yang diselesaikan**

- Pelanggan sering menghubungi CS hanya untuk menanyakan paket, tanggal jatuh tempo, atau meminta ganti password WiFi.
- Perubahan SSID dan password WiFi masih harus dikerjakan admin atau teknisi.
- Informasi gangguan dan pemberitahuan penting belum punya kanal resmi yang dibaca langsung oleh pelanggan.

**Gambaran solusi**

| Fitur | Ringkasan | Sumber data |
| --- | --- | --- |
| F1 Login | Masuk memakai nomor HP yang terdaftar di Netbill | Endpoint Netbill |
| F2 Dashboard | Profil, paket, periode, dan jatuh tempo secara realtime | Endpoint Netbill |
| F3 Setting ONT | Ganti SSID dan password, lihat status ONT, status langganan, total trafik, jumlah device | GenieACS + Netbill |
| F4 Pengumuman | Pengumuman dari admin tampil di portal | Endpoint Netbill |

## 2. Tujuan dan metrik keberhasilan

Tujuan utama rilis pertama: pelanggan dapat melihat info langganan dan mengganti WiFi sendiri, sehingga beban tiket CS turun. Target di bawah adalah usulan awal dan perlu dikonfirmasi dengan data tiket saat ini.

| Metrik | Definisi | Target 90 hari setelah rilis |
| --- | --- | --- |
| Adopsi | Pelanggan aktif yang login minimal 1 kali | 40% dari pelanggan aktif |
| Self-service WiFi | Perubahan SSID/password lewat portal vs total permintaan | 70% |
| Penurunan tiket | Tiket terkait info tagihan dan ganti WiFi | turun 30% |
| Keberhasilan login | Login sukses / percobaan login | di atas 95% |
| Keberhasilan ubah WiFi | Perintah GenieACS berstatus sukses | di atas 90% |
| Keterbacaan pengumuman | Pengumuman dibuka oleh pelanggan | di atas 50% |

**Bukan tujuan rilis ini:** pembayaran online, pembuatan tiket, dan manajemen paket (upgrade/downgrade).

## 3. Pengguna, ruang lingkup, dan asumsi

Pengguna utama adalah pelanggan rumahan dan usaha kecil yang memakai layanan internet dengan ONT yang terdaftar di GenieACS.

| Persona | Kebutuhan | Fitur utama |
| --- | --- | --- |
| Pelanggan | Cek paket dan jatuh tempo, ganti WiFi, lihat kondisi perangkat | F1 sampai F4 |
| Admin / CS | Kirim pengumuman, mengurangi tiket rutin | F4 (dikelola di Netbill) |
| Teknisi | Berkurangnya kunjungan hanya untuk ganti password | F3 |

**Termasuk (in scope)**

- Portal web responsif, mobile first.
- Login nomor HP, dashboard, setting ONT, pengumuman.
- Seluruh fitur setelah login berbasis sesi login pelanggan (lihat bagian 4).
- Integrasi ke endpoint Netbill dan API GenieACS (NBI).

**Tidak termasuk (out of scope)**

- Pembayaran dan unduh invoice.
- Reboot, factory reset, dan update firmware ONT.
- Aplikasi native Android/iOS.
- Pembuatan atau pengelolaan pengumuman di portal (tetap dikelola di Netbill).

**Asumsi**

- Nomor HP pelanggan tersedia di endpoint Netbill dan unik per akun pelanggan.
- Setiap pelanggan dapat dipetakan ke satu ONT di GenieACS lewat kunci tertentu (mis. serial number atau PPPoE username).
- Server GenieACS dapat dijangkau dari backend portal melalui jaringan internal.

## 4. F1: Login pelanggan dengan nomor HP

Pelanggan masuk hanya dengan nomor HP yang terdaftar di Netbill, tanpa OTP atau password, karena pengiriman OTP belum terintegrasi. Konsekuensinya, siapa pun yang mengetahui nomor HP pelanggan dapat masuk; risiko ini dikurangi dengan pembatasan di bawah dan ditinjau ulang saat OTP tersedia.

**User story**

Sebagai pelanggan, saya ingin masuk memakai nomor HP saya agar bisa melihat dan mengatur layanan saya tanpa membuat akun baru.

**Alur login**

1. Pelanggan memasukkan nomor HP di halaman login.
2. Backend menormalisasi nomor (08xx, +628xx, 628xx menjadi satu format) lalu mencocokkannya dengan data pelanggan dari endpoint Netbill.
3. Jika ditemukan satu akun, backend membuat sesi dan mengarahkan ke dashboard.
4. Jika ditemukan lebih dari satu akun, pelanggan memilih akun terlebih dahulu.
5. Jika tidak ditemukan, tampil pesan "Nomor tidak terdaftar, hubungi CS".

**Aturan bisnis**

| Aturan | Nilai usulan |
| --- | --- |
| Batas percobaan gagal | 10 kali per IP dalam 15 menit, lalu diblokir 15 menit |
| Batas login per nomor | 5 kali per menit, untuk mencegah penebakan nomor |
| Durasi sesi | 24 jam, lalu login ulang |
| Satu nomor, banyak akun | Pelanggan memilih akun setelah nomor dikenali |
| Status pelanggan nonaktif/terisolir | Tetap boleh login, fitur ONT dibatasi sesuai F3 |
| Tampilan nomor HP | Disamarkan sebagian di seluruh halaman dan log |

**Acceptance criteria**

- Nomor dalam format 08xx, 628xx, dan +628xx dikenali sebagai nomor yang sama.
- Nomor yang tidak terdaftar menampilkan pesan yang jelas dan tidak membuat sesi.
- Setelah 10 kali gagal dari satu IP dalam 15 menit, percobaan berikutnya ditolak dengan pesan waktu tunggu.
- Sesi berakhir otomatis setelah 24 jam.
- Logout menghapus sesi di server, bukan hanya di browser.
- Setiap percobaan login (berhasil dan gagal) tercatat di audit log dengan nomor yang disamarkan.

**Sesi login sebagai dasar semua fitur**

Setelah login, identitas pelanggan hanya berasal dari sesi di server. Aturan ini berlaku untuk F2, F3, dan F4:

- Semua halaman dan endpoint portal, kecuali halaman login, menolak akses tanpa sesi yang valid dan mengarahkan ke halaman login.
- ID pelanggan diambil dari sesi; browser tidak pernah mengirim ID pelanggan, nomor HP, atau ID perangkat ONT sebagai penentu data.
- Dashboard (F2) hanya memanggil Netbill untuk pelanggan di sesi tersebut.
- Setting ONT (F3) mencari ONT di GenieACS dari data pelanggan di sesi, lalu hanya membaca dan mengubah ONT itu.
- Pengumuman (F4) disaring sesuai pelanggan di sesi (semua pelanggan, atau sesuai paket/wilayah bila didukung), dan status baca disimpan per pelanggan.
- Bila sesi berakhir saat pelanggan sedang mengisi form (misalnya ganti WiFi), perubahan tidak dikirim dan pelanggan diminta login ulang.
- Pada pelanggan dengan beberapa akun, seluruh data mengikuti akun yang dipilih saat login; berpindah akun dilakukan lewat menu ganti akun, yang membuat sesi baru.

**Acceptance criteria sesi**

- Membuka halaman dashboard, setting ONT, atau pengumuman tanpa sesi mengarah ke login.
- Mengubah ID pelanggan atau ID perangkat pada request tidak mengubah data yang dikembalikan; server tetap memakai identitas dari sesi.
- Setelah logout atau sesi berakhir, tombol Kembali di browser tidak menampilkan data pelanggan.

## 5. F2: Dashboard pelanggan

Dashboard adalah halaman pertama setelah login dan menampilkan data langganan terkini yang diambil dari endpoint Netbill setiap kali halaman dibuka.

**User story**

Sebagai pelanggan, saya ingin langsung melihat paket, periode, dan jatuh tempo saya agar tahu kapan harus membayar.

**Data yang ditampilkan**

| Kelompok | Field | Catatan |
| --- | --- | --- |
| Profil | Nama, ID pelanggan, nomor HP, alamat | Hanya baca. Nomor HP disamarkan sebagian |
| Paket | Nama paket, kecepatan, harga per periode | Dari data langganan aktif |
| Periode | Tanggal mulai dan akhir periode berjalan | Format tanggal Indonesia |
| Jatuh tempo | Tanggal jatuh tempo dan sisa hari | Penanda warna bila kurang dari 3 hari atau lewat |
| Status langganan | Aktif, jatuh tempo, terisolir, berhenti | Dari status di Netbill |
| Pengumuman | 1 sampai 3 pengumuman terbaru | Tautan ke F4 |

**Definisi "realtime"**

Data diambil langsung dari Netbill saat halaman dibuka, tanpa cache lebih dari 60 detik, dan diperbarui ulang saat pelanggan menekan tombol muat ulang atau kembali ke tab. Jika Netbill tidak merespons, tampil data terakhir yang berhasil dimuat dengan keterangan waktu pembaruan.

**Acceptance criteria**

- Perubahan paket atau jatuh tempo di Netbill muncul di portal maksimal 60 detik kemudian.
- Data yang tampil selalu milik pelanggan di sesi login; tidak ada parameter ID pelanggan pada request.
- Sisa hari dihitung dari tanggal server dalam zona waktu WIB.
- Saat Netbill gagal merespons, halaman tetap terbuka dan menampilkan pesan yang jelas, bukan halaman kosong.
- Halaman terbuka dalam waktu kurang dari 3 detik pada koneksi 4G (lihat bagian 9).

## 6. F3: Setting ONT (terintegrasi GenieACS)

Halaman ini menampilkan kondisi ONT pelanggan dan memungkinkan pelanggan mengganti nama WiFi (SSID) dan password WiFi. Semua perintah ke ONT dikirim backend portal ke GenieACS; browser pelanggan tidak pernah berhubungan langsung dengan GenieACS.

**User story**

- Sebagai pelanggan, saya ingin mengganti SSID dan password WiFi sendiri agar tidak perlu menunggu teknisi.
- Sebagai pelanggan, saya ingin melihat apakah ONT saya online, berapa perangkat yang tersambung, dan berapa data yang terpakai.

**Informasi yang ditampilkan**

| Informasi | Sumber | Cara memperoleh |
| --- | --- | --- |
| Status ONT (online/offline) | GenieACS | Waktu inform terakhir (`_lastInform`) dibandingkan batas, mis. 2 kali interval inform |
| Status langganan | Netbill | Sama dengan F2 |
| Total trafik data | GenieACS | Counter byte kirim dan terima dari parameter statistik WAN ONT |
| Total device terhubung | GenieACS | Jumlah entri host aktif pada ONT |
| SSID dan status WiFi saat ini | GenieACS | Parameter WLAN ONT, hanya baca |

**Ganti SSID dan password**

1. Pelanggan membuka form dan mengisi SSID baru dan/atau password baru.
2. Portal memvalidasi input: SSID 1 sampai 32 karakter; password WPA2 8 sampai 63 karakter; tanpa karakter yang ditolak ONT.
3. Pelanggan mengonfirmasi, dengan peringatan bahwa perangkat yang sedang tersambung akan terputus.
4. Backend mengirim task setParameterValues ke GenieACS untuk perangkat pelanggan tersebut.
5. Portal menampilkan status: menunggu, berhasil, atau gagal, dan memeriksa ulang nilai dari ONT setelah task selesai.

**Aturan bisnis**

- Pelanggan hanya dapat melihat dan mengubah ONT miliknya sendiri; ID perangkat ditentukan backend dari data pelanggan, bukan dikirim dari browser.
- Jika ONT offline, perubahan ditolak dengan pesan yang jelas, atau ditahan sebagai antrean bila disetujui (lihat pertanyaan terbuka nomor 3).
- Pelanggan terisolir atau nonaktif hanya dapat melihat status; form ganti WiFi dinonaktifkan.
- Password tidak pernah ditampilkan kembali setelah dikirim dan tidak boleh tercatat di log.
- Batas perubahan: 5 kali per hari per pelanggan.
- Setiap perubahan tercatat di audit log (siapa, kapan, SSID baru, hasil), tanpa password.

**Catatan teknis**

- Nama parameter berbeda menurut model ONT dan data model (TR-098 atau TR-181). Perlu tabel pemetaan parameter per vendor dan model yang diuji sebelum rilis.
- Counter trafik di ONT biasanya mulai dari nol saat ONT restart. Jika yang dibutuhkan adalah total pemakaian per periode langganan, portal perlu menyimpan snapshot counter secara berkala (lihat pertanyaan terbuka nomor 4).

**Acceptance criteria**

- Status ONT di portal sesuai dengan GenieACS dengan selisih maksimal 1 interval inform.
- ONT yang ditampilkan dan diubah selalu ONT milik pelanggan di sesi login.
- Perubahan SSID/password yang sukses terlihat di ONT dalam 60 detik pada ONT online.
- Input tidak valid ditolak sebelum dikirim ke GenieACS, dengan pesan di dekat kolom terkait.
- Percobaan mengubah ONT milik pelanggan lain (ID perangkat dimanipulasi) ditolak dan tercatat.

## 7. F4: Pengumuman (announcement)

Pengumuman dibuat dan dikelola admin di Netbill; portal hanya membaca dan menampilkannya kepada pelanggan.

**User story**

Sebagai pelanggan, saya ingin melihat pengumuman dari provider (gangguan, maintenance, promo) di satu tempat agar tidak perlu bertanya ke CS.

**Perilaku**

- Daftar pengumuman dengan judul, tanggal terbit, dan isi; yang terbaru di atas.
- Pengumuman penting (mis. gangguan) tampil sebagai banner di dashboard sampai ditutup atau kedaluwarsa.
- Penanda belum dibaca per pelanggan; status baca disimpan di portal.
- Hanya pengumuman berstatus terbit dan dalam rentang tanggal tayang yang ditampilkan.
- Jika Netbill mendukung target, pengumuman dapat ditujukan ke semua pelanggan, paket tertentu, atau wilayah tertentu (lihat pertanyaan terbuka nomor 5).

**Field yang dibutuhkan dari Netbill**

| Field | Keterangan |
| --- | --- |
| id | Pengenal unik pengumuman |
| title | Judul |
| body | Isi (teks atau HTML terbatas; portal wajib membersihkan HTML) |
| priority | Biasa atau penting |
| published\_at, expires\_at | Rentang tayang |
| target | Semua, paket, atau wilayah (bila tersedia) |

**Acceptance criteria**

- Pengumuman yang diterbitkan di Netbill muncul di portal maksimal 5 menit kemudian.
- Pengumuman yang melewati tanggal berakhir otomatis hilang dari portal.
- Pengumuman yang tampil dan status bacanya mengikuti pelanggan di sesi login.
- Konten HTML dari Netbill dibersihkan sehingga tidak dapat menjalankan skrip.

## 8. Arsitektur integrasi dan kebutuhan endpoint

&#91;embedded content: arsitektur integrasi · 1 backend, 3 sistem eksternal\]

Backend portal adalah satu-satunya pintu ke Netbill dan GenieACS; kredensial keduanya hanya ada di server.

**Endpoint Netbill yang dibutuhkan** (path dan format final menunggu dokumentasi API Netbill)

| Fungsi | Dipakai oleh | Data minimal |
| --- | --- | --- |
| Cari pelanggan berdasarkan nomor HP | F1 | ID pelanggan, nama, nomor HP, status |
| Detail pelanggan | F2 | Nama, alamat, ID pelanggan |
| Langganan aktif | F2, F3 | Paket, kecepatan, harga, periode mulai dan akhir, jatuh tempo, status |
| Kunci ONT pelanggan | F3 | Serial number ONT atau PPPoE username untuk mencari perangkat di GenieACS |
| Daftar pengumuman | F4 | Field pada bagian 7 |

Bila ada kebutuhan di atas yang belum tersedia di Netbill, dicatat sebagai permintaan pengembangan ke tim Netbill sebelum tahap 1 dimulai.

**Operasi GenieACS yang dibutuhkan** (lewat NBI REST API, port default 7557, tidak boleh dibuka ke internet)

| Operasi | Dipakai untuk |
| --- | --- |
| Baca perangkat dengan filter kunci ONT | Status ONT, SSID, trafik, jumlah host |
| Kirim task setParameterValues ke perangkat | Ganti SSID dan password WiFi |
| Baca status task | Menampilkan menunggu, berhasil, atau gagal |

**Prinsip integrasi**

- Netbill adalah sumber kebenaran data pelanggan dan langganan; portal tidak menyimpan salinan permanen selain cache pendek.
- Portal hanya menyimpan data miliknya sendiri: sesi, status baca pengumuman, audit log, dan (bila disetujui) snapshot trafik.
- Setiap panggilan eksternal memakai timeout, percobaan ulang terbatas, dan pencatatan error.

## 9. Kebutuhan non-fungsional

| Area | Kebutuhan |
| --- | --- |
| Keamanan | HTTPS wajib; sesi memakai cookie HttpOnly dan Secure atau token berumur pendek; kredensial Netbill dan GenieACS hanya di server, tidak pernah di browser |
| Otorisasi | Setiap request divalidasi terhadap ID pelanggan di sesi; tidak ada ID pelanggan atau ID perangkat dari input pengguna |
| Perlindungan | Rate limit login per nomor dan per IP; perlindungan CSRF; sanitasi HTML pengumuman; header keamanan standar |
| Privasi | Data pribadi hanya dipakai untuk menampilkan layanan; nomor HP disamarkan di tampilan dan log; mengikuti UU Pelindungan Data Pribadi |
| Performa | Halaman utama kurang dari 3 detik (4G); panggilan Netbill dan GenieACS dengan timeout 5 sampai 10 detik |
| Ketersediaan | Target 99,5% per bulan; gangguan Netbill atau GenieACS tidak menjatuhkan seluruh portal (degradasi per fitur) |
| Skala | Dirancang untuk jumlah pelanggan aktif saat ini dengan puncak 10% login serentak; angka pasti menunggu data |
| Audit | Log login, perubahan WiFi, dan error integrasi disimpan minimal 90 hari tanpa password |
| Kompatibilitas | Browser mobile terbaru (Chrome, Safari), layar mulai 360 px |
| Bahasa | Bahasa Indonesia |

## 10. Rencana rilis, risiko, dan pertanyaan terbuka

Rilis dibagi tiga tahap agar risiko integrasi GenieACS ditemukan lebih awal. Durasi adalah perkiraan awal dan perlu disesuaikan dengan kapasitas tim.

| Tahap | Isi | Perkiraan |
| --- | --- | --- |
| 0. Persiapan | Konfirmasi endpoint Netbill, akses GenieACS, pemetaan parameter ONT per model | 1 sampai 2 minggu |
| 1. MVP | F1 login, F2 dashboard, F4 pengumuman | 3 sampai 4 minggu |
| 2. ONT | F3 status ONT dan ganti SSID/password | 3 sampai 4 minggu |
| 3. Uji dan pilot | UAT, uji beban, pilot 50 sampai 100 pelanggan, perbaikan | 2 minggu |
| 4. Rilis bertahap | Buka per wilayah, pantau metrik bagian 2 | 2 minggu |

**Risiko**

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Login hanya dengan nomor HP, tanpa OTP | Siapa pun yang tahu nomor HP dapat melihat data dan mengubah WiFi pelanggan | Rate limit per IP dan per nomor, sesi 24 jam, batas perubahan WiFi per hari, audit log; tambah OTP bila gateway tersedia; opsi verifikasi tambahan khusus ganti WiFi (pertanyaan 1) |
| Parameter ONT berbeda tiap vendor/model | Ganti WiFi gagal di sebagian pelanggan | Tabel pemetaan per model; uji pilot; fitur dimatikan per model bila belum teruji |
| ONT offline saat perintah dikirim | Pelanggan mengira perubahan berhasil | Status task jelas; verifikasi nilai setelah task |
| Netbill atau GenieACS lambat atau down | Halaman gagal dimuat | Timeout, cache pendek, degradasi per fitur |
| Satu nomor HP dipakai banyak akun, atau nomor salah/ganda di Netbill | Salah akun atau login gagal | Pilih akun setelah nomor dikenali; audit kualitas data nomor HP sebelum rilis |

**Pertanyaan terbuka**

- [ ] 1\. Login sudah diputuskan memakai nomor HP saja. Apakah perlu verifikasi tambahan khusus untuk ganti SSID/password, misalnya memasukkan ID pelanggan? Dan kapan OTP direncanakan terintegrasi?
- [ ] 2\. Endpoint Netbill apa yang tersedia untuk: cari pelanggan berdasarkan nomor HP, detail langganan, dan pengumuman? Bagaimana autentikasinya dan adakah batas request?
- [ ] 3\. Jika ONT offline, perubahan WiFi ditolak atau diantrekan sampai ONT online?
- [ ] 4\. "Total trafik" berarti counter sejak ONT menyala, total per periode langganan, atau total per hari? Bila per periode, apakah snapshot counter boleh disimpan di database portal?
- [ ] 5\. Apakah pengumuman di Netbill bisa ditargetkan ke paket atau wilayah?
- [ ] 6\. Bagaimana pelanggan dipetakan ke ONT di GenieACS (serial number, PPPoE username, atau tag)? Apakah sudah konsisten untuk semua pelanggan?
- [ ] 7\. Apakah ONT dual band (2,4 GHz dan 5 GHz) perlu diatur terpisah, atau satu SSID untuk keduanya?
- [ ] 8\. Siapa pemilik produk, tim pengembang, dan tanggal target rilis?
