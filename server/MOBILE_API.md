# NetBill Mobile API v1

API ini adalah facade JSON untuk aplikasi Android dan memakai database, JWT, serta RBAC NetBill yang sama. Jangan hubungkan aplikasi Android langsung ke MySQL.

## Base URL dan autentikasi

- Produksi: `https://netbill.skynetwifi.site/api/mobile/v1`
- Flutter web/desktop lokal: `http://localhost:3020/api/mobile/v1`
- Emulator Android: `http://10.0.2.2:3020/api/mobile/v1`
- Perangkat fisik LAN: `http://<IP-SERVER-LAN>:3020/api/mobile/v1`
- Format URL endpoint: `https://netbill.skynetwifi.site/api/mobile/v1<path>`; contoh daftar pelanggan: `https://netbill.skynetwifi.site/api/mobile/v1/customers?page=1&limit=20`.
- Verifikasi API key: `GET /api/mobile/v1` dengan header `X-API-Key` (`200` jika valid, `401` jika ditolak).
- Login mobile: `POST /api/mobile/v1/login`.
- API key aplikasi wajib pada verifikasi, login, dan semua endpoint mobile selain `/health`.
- Kirim key **hanya** lewat header `X-API-Key`; jangan tempel pada URL, path, atau query string. URL seperti `/api/mobile/v1/nb_live_...` bukan endpoint API dan key dapat tercatat pada log.

```bash
curl -i https://netbill.skynetwifi.site/api/mobile/v1 \
  -H 'Accept: application/json' \
  -H 'X-API-Key: nb_live_<key>'
```

Untuk probe Dart, terima URL dan API key sebagai argumen terpisah lalu kirim key pada header: `dart run tool/summary_probe.dart https://netbill.skynetwifi.site/api/mobile/v1 nb_live_<key>`.

```http
POST https://netbill.skynetwifi.site/api/mobile/v1/login
X-API-Key: nb_live_<key>
Content-Type: application/json

{ "username": "admin", "password": "password" }
```

Simpan `token` respons di Android Keystore/EncryptedSharedPreferences. Kirim kedua header pada request berikutnya:

```http
X-API-Key: nb_live_<key>
Authorization: Bearer <token>
Accept: application/json
```

API key mengidentifikasi build aplikasi, bukan pengguna dan bukan pengganti JWT/RBAC. APK dapat dibongkar; produksi wajib HTTPS. Saat rotasi, backend dapat menerima key lama selama `grace_hours` agar rollout aplikasi tidak terputus.

## Endpoint

Base endpoint pada kolom URL: `https://netbill.skynetwifi.site`. Ganti dengan domain produksi Anda. Untuk lokal, ganti dengan `http://10.0.2.2:4000` pada emulator atau `http://<IP-SERVER-LAN>:4000` pada perangkat fisik.

| Method | Path | URL produksi lengkap | Izin | Keterangan |
|---|---|---|---|---|
| GET | `/health` | `https://netbill.skynetwifi.site/api/mobile/v1/health` | Publik | Status API dan koneksi database |
| POST | `/login` | `https://netbill.skynetwifi.site/api/mobile/v1/login` | API key | Login pengguna dan penerbitan JWT |
| GET | `/me` | `https://netbill.skynetwifi.site/api/mobile/v1/me` | API key + login | Profil dan permission pengguna |
| GET | `/summary` | `https://netbill.skynetwifi.site/api/mobile/v1/summary` | dashboard.view | Ringkasan pelanggan, tagihan, penerimaan |
| GET | `/customers` | `https://netbill.skynetwifi.site/api/mobile/v1/customers` | customers.view | Daftar pelanggan |
| GET | `/customers/:id` | `https://netbill.skynetwifi.site/api/mobile/v1/customers/:id` | customers.view | Detail dan 12 tagihan terakhir |
| GET | `/invoices` | `https://netbill.skynetwifi.site/api/mobile/v1/invoices` | invoices.view | Daftar tagihan |
| GET | `/invoices/:id` | `https://netbill.skynetwifi.site/api/mobile/v1/invoices/:id` | invoices.view | Detail dan pembayaran tagihan |
| GET | `/payments` | `https://netbill.skynetwifi.site/api/mobile/v1/payments` | payments.view | Riwayat pembayaran |
| POST | `/payments` | `https://netbill.skynetwifi.site/api/mobile/v1/payments` | payments.create | Catat pembayaran tagihan atau cicilan |
| GET | `/payments/banks` | `https://netbill.skynetwifi.site/api/mobile/v1/payments/banks` | payments.create | Active bank accounts for transfer selection |
| GET | `/banks` | `https://netbill.skynetwifi.site/api/mobile/v1/banks` | banks.view + owner/finance | Master Bank list; optional `active=1` |
| POST | `/banks` | `https://netbill.skynetwifi.site/api/mobile/v1/banks` | banks.create + owner/finance | Create bank account |
| PUT | `/banks/:id` | `https://netbill.skynetwifi.site/api/mobile/v1/banks/:id` | banks.edit + owner/finance | Update bank account |
| DELETE | `/banks/:id` | `https://netbill.skynetwifi.site/api/mobile/v1/banks/:id` | banks.delete + owner/finance | Delete unused bank account |
| GET | `/reports/profit-loss` | `https://netbill.skynetwifi.site/api/mobile/v1/reports/profit-loss` | finance.view | Laporan laba rugi bulanan |
| GET | `/pppoe/summary` | `https://netbill.skynetwifi.site/api/mobile/v1/pppoe/summary` | monitoring.view | Ringkasan sesi PPPoE |
| GET | `/pppoe/sessions` | `https://netbill.skynetwifi.site/api/mobile/v1/pppoe/sessions` | monitoring.view | Daftar sesi PPPoE |
| POST | `/pppoe/sync` | `https://netbill.skynetwifi.site/api/mobile/v1/pppoe/sync` | monitoring.edit | Sinkron sesi dari MikroTik |
| POST | `/pppoe/action` | `https://netbill.skynetwifi.site/api/mobile/v1/pppoe/action` | monitoring.edit | Disconnect, isolir, atau aktivasi PPPoE |
| GET | `/pppoe/customer/:id/history` | `https://netbill.skynetwifi.site/api/mobile/v1/pppoe/customer/:id/history` | monitoring.view | Riwayat koneksi pelanggan |
| GET | `/pppoe/customer/:id/usage` | `https://netbill.skynetwifi.site/api/mobile/v1/pppoe/customer/:id/usage` | monitoring.view | Pemakaian pelanggan |
| GET | `/ont` | `https://netbill.skynetwifi.site/api/mobile/v1/ont` | devices.view | Daftar ONT |
| GET | `/ont/:id/detail` | `https://netbill.skynetwifi.site/api/mobile/v1/ont/:id/detail` | devices.view | Detail WAN/WLAN ONT dari GenieACS |
| POST | `/ont/sync` | `https://netbill.skynetwifi.site/api/mobile/v1/ont/sync` | devices.edit | Sinkron semua ONT dari GenieACS |
| POST | `/ont/:id/sync` | `https://netbill.skynetwifi.site/api/mobile/v1/ont/:id/sync` | devices.edit | Summon satu ONT: 200 selesai / 202 antre; jangan retry otomatis |
| POST | `/ont/:id/reboot` | `https://netbill.skynetwifi.site/api/mobile/v1/ont/:id/reboot` | devices.edit | Reboot ONT |
| POST | `/ont/:id/wifi` | `https://netbill.skynetwifi.site/api/mobile/v1/ont/:id/wifi` | devices.edit | Ubah SSID/password WiFi |
| POST | `/ont/:id/wifi-enable` | `https://netbill.skynetwifi.site/api/mobile/v1/ont/:id/wifi-enable` | devices.edit | Aktif/nonaktifkan WiFi |
| GET | `/ont/:id/history` | `https://netbill.skynetwifi.site/api/mobile/v1/ont/:id/history` | devices.view | Riwayat sinyal/status ONT |

ONT sync response states, safe recovery, and backend/proxy troubleshooting are documented in [ONT_SYNC_BACKEND.md](./ONT_SYNC_BACKEND.md).

Parameter daftar: `page` (default 1), `limit` (default 20, maksimum 100), dan `q` bila didukung. Pelanggan mendukung `status=active|inactive|isolated`; tagihan mendukung `status=unpaid|partial|paid|void` dan `period=YYYY-MM`.

Laporan laba rugi menerima `period=YYYY-MM` opsional; default bulan berjalan menurut WIB. Respons dan kalkulasi identik dengan halaman web `/api/reports/profit-loss`: `revenue`, rincian `expenses`, `totalExpense`, `net`, periode `previous`, dan persentase `growth`. Semua nominal berupa JSON number; `growth` bernilai `null` jika laba bersih periode sebelumnya nol.

Daftar PPPoE mendukung `status`, `q`, `router`, `sort`, `dir`, `page`, dan `limit`. Daftar ONT mendukung `status`, `signal=excellent|fair|poor`, `odp`, `q`, `sortBy`, `sortDir`, `page`, dan `limit`. Endpoint mobile ini memakai handler bisnis yang sama dengan `/api/monitoring` dan `/api/devices`; aksi tetap tervalidasi dan tercatat di audit log.

Contoh aksi PPPoE:

```http
POST https://netbill.skynetwifi.site/api/mobile/v1/pppoe/action
X-API-Key: nb_live_<key>
Authorization: Bearer <token>
Content-Type: application/json

{ "username": "pelanggan01", "action": "disconnect" }
```

Nilai `action`: `disconnect`, `isolir`, atau `activate`.

Contoh ubah WiFi ONT:

```http
POST https://netbill.skynetwifi.site/api/mobile/v1/ont/42/wifi
X-API-Key: nb_live_<key>
Authorization: Bearer <token>
Content-Type: application/json

{
  "ssid": "Rumah Budi",
  "password": "rahasia123",
  "path": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1"
}
```

Respons daftar pelanggan, tagihan, dan pembayaran:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "pages": 0 }
}
```

Respons daftar PPPoE memakai `rows`, `total`, `page`, `limit`, dan `total_pages`. Respons daftar ONT memakai `rows`, `total`, `stats`, dan `odps`.

Error menggunakan status HTTP (`400`, `401`, `403`, `404`, `500`, `503`) dan bentuk:

```json
{ "message": "Penjelasan error" }
```

## Mobile dashboard

The mobile dashboard uses the same handlers and JSON contracts as the web dashboard.
Base route: `https://netbill.skynetwifi.site/api/mobile/v1/dashboard`.
Every endpoint requires `X-API-Key`, `Authorization: Bearer <token>`, and
`dashboard.view`. `/summary` remains available with its existing response format.

| Method | Path (relative to mobile v1) | Parameters | Response |
|---|---|---|---|
| GET | `/dashboard/stats` | Optional `registrationPeriod=daily|monthly|custom`, `registrationStart`, `registrationEnd` (dates) | `cards`, `widgets`, `network`, `revenueTrend`, `packageDistribution`, `arrearsList`, `recentPayments`, `recentActivity` |
| GET | `/dashboard/business-summary` | None; owner/finance only | `incomeToday`, `incomeThisMonth`, `invoicesThisMonth`, `unpaid`, `previousPeriodUnpaid`, `totalBills`, `totalCustomers`, `inactiveCustomers`, `notInstalledCustomers` |
| GET | `/dashboard/installation-trend` | `period=day|month|year` (default `month`) | `{ period, total, series: [{ label, value }] }` |
| GET | `/dashboard/network-users` | `status=customers|online|offline|all`, `q`, `page` (default 1), `limit` (default 8, max 25) | `{ rows, total }` with session metadata when applicable |
| GET | `/dashboard/invoice-adjustments` | `q`, `page` (default 1), `limit` (default/min 5, max 100); owner/finance only | `{ rows, total }` |
| POST | `/dashboard/ping` | JSON body `{ "target": "192.168.1.1" }` | `{ ok, target, latency_ms }` |

Dashboard list responses use `rows`/`total`, not the `data`/`meta` envelope
of the mobile customer and invoice lists. Ping runs from the server network,
not the phone. Business summary and invoice adjustments return `403` for
roles other than owner/finance, even when they have dashboard permission.

```bash
curl 'https://netbill.skynetwifi.site/api/mobile/v1/dashboard/stats' \
  -H 'X-API-Key: nb_live_<key>' \
  -H 'Authorization: Bearer <token>' \
  -H 'Accept: application/json'
```

Load `/dashboard/stats` for the main screen, then load installation trends
and the owner/finance business summary separately. Fetch network users and
invoice adjustments when opening their detail views. Dashboard quick actions
still use their respective resource endpoints; these dashboard routes do not
create payments or modify customers.

## Master Bank

Base route: `/api/mobile/v1/banks`. These endpoints reuse the web Master Bank
handlers, database, validation, and audit logs; no separate mobile bank records
are created. All requests require `X-API-Key` and `Authorization: Bearer <token>`.
Only `owner` and `finance` may access this resource, with the action permissions
below (owner has full access).

| Method | Path relative to mobile v1 | Permission | Response |
|---|---|---|---|
| GET | `/banks` | `banks.view` | `{ "rows": [...] }` |
| GET | `/banks?active=1` | `banks.view` | Active accounts only, same envelope |
| POST | `/banks` | `banks.create` | `{ "id": 1, "ok": true }` |
| PUT | `/banks/:id` | `banks.edit` | `{ "ok": true }` |
| DELETE | `/banks/:id` | `banks.delete` | `{ "ok": true }` |

The list is not paginated and is sorted by `name`, then `id`. Each row contains
`id`, `name`, `account_number`, `account_name`, `note`, `is_active`, `created_at`,
and `payments_count`. Keep `account_number` as a string to preserve leading zeros.

Send `Content-Type: application/json` for create/update:

```json
{
  "name": "Example Bank",
  "account_number": "0012345678",
  "account_name": "Example Account Holder",
  "note": "Transfer payments",
  "is_active": 1
}
```

`name`, `account_number`, and `account_name` are required. `note` is optional.
Use numeric `1` (active) or `0` (inactive) for `is_active`, not string values.
Create defaults to active when omitted; update is a full form submission, so
always include `is_active` and the required fields. Successful operations return
HTTP `200`, matching the web API.

Errors use `{ "message": "..." }`: `400` for missing required fields or deleting
an account referenced by payments, `401` for invalid authentication, `403` for
denied role/permission, and `404` for an unknown account on update/delete.
Deactivate used accounts with PUT and `is_active: 0` instead of deleting them.

For the transfer selector on the payment form, continue using
`GET /payments/banks` (`payments.create`); it returns only active accounts and
does not grant Master Bank management access.

### Request and response examples

List active accounts:

```bash
curl 'https://netbill.skynetwifi.site/api/mobile/v1/banks?active=1' \
  -H 'X-API-Key: nb_live_<key>' \
  -H 'Authorization: Bearer <token>' \
  -H 'Accept: application/json'
```

Example HTTP `200` response (an empty list is `{ "rows": [] }`):

```json
{
  "rows": [
    {
      "id": 1,
      "name": "Example Bank",
      "account_number": "0012345678",
      "account_name": "Example Account Holder",
      "note": "Transfer payments",
      "is_active": 1,
      "created_at": "2026-10-16 10:00:00",
      "payments_count": 0
    }
  ]
}
```

Create an account:

```bash
curl -X POST 'https://netbill.skynetwifi.site/api/mobile/v1/banks' \
  -H 'X-API-Key: nb_live_<key>' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"name":"Example Bank","account_number":"0012345678","account_name":"Example Account Holder","note":"Transfer payments","is_active":1}'
```

Response: `{ "id": 1, "ok": true }`. Use the returned `id` for updates/deletion;
the example ID is illustrative.

Deactivate an account while retaining its payment history:

```http
PUT https://netbill.skynetwifi.site/api/mobile/v1/banks/1
X-API-Key: nb_live_<key>
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json

{
  "name": "Example Bank",
  "account_number": "0012345678",
  "account_name": "Example Account Holder",
  "note": "Transfer payments",
  "is_active": 0
}
```

Response: `{ "ok": true }`. To delete an unused account, send
`DELETE /api/mobile/v1/banks/1` with the same authentication headers and no body.
Deleting an account used by two payments returns HTTP `400`, for example:

```json
{
  "message": "Akun bank dipakai 2 pembayaran — nonaktifkan saja agar riwayat tetap utuh"
}
```

### Mobile integration notes

- Read the list from `rows`, not `data`; there is no `meta` pagination envelope.
- Only `active=1` filters the list. Omit it to include active and inactive accounts;
  `active=0` does not mean inactive-only. Search and pagination are not supported.
- Use the selected list row for the edit form; there is no `GET /banks/:id` endpoint.
- Read `permissions.banks` from `/me` to control view/create/edit/delete UI actions,
  and restrict the management screen to owner/finance. The backend still enforces access.
- Refresh the list after successful create, update, or delete operations.
- For transfer payments, send the selected account's `id` as `bank_id` to
  `POST /payments`; do not send its account number as the ID.

## Membuat pembayaran

### Transfer account selector

**Endpoint:** `GET https://netbill.skynetwifi.site/api/mobile/v1/payments/banks`

Requires `X-API-Key`, `Authorization: Bearer <token>`, and `payments.create`.
This read-only lookup does not require `banks.view` or bank management permissions.
No request body or query parameters are needed.

```bash
curl -i 'https://netbill.skynetwifi.site/api/mobile/v1/payments/banks' \
  -H 'X-API-Key: nb_live_<key>' \
  -H 'Authorization: Bearer <token>' \
  -H 'Accept: application/json'
```

HTTP `200` example:

```json
{
  "rows": [
    {
      "id": 7,
      "name": "Example Bank",
      "account_number": "0012345678",
      "account_name": "Example Account Holder"
    }
  ]
}
```

Only active accounts are returned, ordered by name and ID, without pagination.
Parse `rows`, not `data`. Keep `account_number` as a string. Display the name,
account number, and account holder; send the selected numeric `id` as `bank_id`
in `POST /payments` with `method: "transfer"`.

| Status | Meaning / mobile behavior |
|---|---|
| `200`, nonempty `rows` | Populate the transfer account selector |
| `200`, `rows: []` | No active accounts; ask an authorized owner/finance user to configure one |
| `401` | Missing/invalid API key or user session; check credentials/login |
| `403` | User lacks `payments.create`; do not fall back to Master Bank |
| `404` | Route unavailable at the requested server/URL; check deployment and routing |
| `500` | Server/database failure; show retry and inspect server logs |

Do not substitute `/banks` or `/banks?active=1`: they require different permissions.
No active accounts is a successful empty list, not a `404` from this handler.

### Troubleshooting `404` on `/api/mobile/v1/payments/banks`

The route is registered in `server/src/routes/mobile.js` and mounted under
`/api/mobile/v1` by `server/src/app.js`.

1. Check the final request URL. If the mobile base URL ends with `/api/mobile/v1`,
   append only `/payments/banks`; do not duplicate the prefix.
2. Run the authenticated cURL request above against the same host used by mobile.
   Inspect the actual HTTP status and response, not just the UI error message.
3. Deploy the updated backend and restart/reload its Node process using the
   deployment's process manager. Updating only the frontend/mobile app does not
   activate backend routes. Ensure all server instances use the same version.
4. Verify the reverse proxy forwards this path unchanged to the intended backend
   and port. Compare the public response with a direct backend request using the
   same headers. Do not put tokens or API keys in URLs or logs.
5. Retry the selector after the endpoint returns `200`. If it returns `403`, check
   `permissions.payments.create` from `/me` instead of changing the endpoint.

A `404` alone does not identify the deployment/proxy cause. Having this route in
the local source does not prove that the production process has loaded it.

`GET /payments/banks` mengembalikan `{ "rows": [{ "id": 1, "name": "Bank", "account_number": "123", "account_name": "Pemilik" }] }` berisi rekening aktif saja untuk pilihan transfer. Memerlukan `X-API-Key`, JWT, dan izin `payments.create` (tidak memerlukan izin pengelolaan Master Bank). Pilihan tunai, QRIS, dan payment gateway tidak memakai `bank_id`.

`POST /payments` mencatat pembayaran penuh atau cicilan pada tagihan yang sudah ada. Handler sama dengan API web, sehingga status tagihan, aktivasi pelanggan saat lunas, sinkronisasi RADIUS, notifikasi, dan audit log tetap berjalan.

Header wajib: `X-API-Key`, `Authorization: Bearer <token>`, `Content-Type: application/json`, dan `Accept: application/json`.

```http
POST https://netbill.skynetwifi.site/api/mobile/v1/payments
X-API-Key: nb_live_<key>
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json

{
  "invoice_id": 123,
  "amount": 150000,
  "method": "cash",
  "note": "Dibayar dari Android",
  "payment_date": "2026-09-20 10:30:00"
}
```

| Field | Tipe | Wajib | Aturan |
|---|---|---:|---|
| `invoice_id` | integer | Ya | ID tagihan yang ada dan tidak berstatus `void`. |
| `amount` | number | Ya | Lebih dari `0`; maksimal sisa tagihan. Mendukung cicilan. |
| `method` | string | Tidak | `cash`, `transfer`, `qris`, atau `gateway`; default `cash`. |
| `bank_id` | integer | Tidak | ID akun bank aktif. |
| `note` | string | Tidak | Catatan pembayaran. |
| `payment_date` | string | Tidak | Waktu WIB format `YYYY-MM-DD HH:mm:ss`; jika kosong memakai waktu server. |

Sukses `200`:

```json
{ "id": 77, "ok": true }
```

Error: `400` payload, metode, bank, atau nominal tidak valid; `401` API key/JWT tidak valid; `403` tanpa `payments.create`; `404` tagihan tidak ada; `500` gagal menyimpan. Endpoint ini belum idempoten. Mobile harus mencegah tombol bayar ganda dan meminta operator memeriksa riwayat tagihan sebelum mengulang request yang timeout.

Bukti transfer tidak dikirim pada endpoint JSON ini. Unggah bukti melalui alur web yang ada sebelum memakai integrasi upload mobile terautentikasi.

## Contoh Retrofit

Dependensi Retrofit mengikuti versi yang dipilih proyek Android; backend tidak memerlukan perubahan tambahan.

```kotlin
data class LoginBody(val username: String, val password: String)
data class LoginResponse(val token: String, val user: User)
data class PageMeta(val page: Int, val limit: Int, val total: Int, val pages: Int)
data class ApiPage<T>(val data: List<T>, val meta: PageMeta)

interface NetBillApi {
    @POST("api/mobile/v1/login")
    suspend fun login(
        @Header("X-API-Key") apiKey: String,
        @Body body: LoginBody
    ): LoginResponse

    @GET("api/mobile/v1/customers")
    suspend fun customers(
        @Header("X-API-Key") apiKey: String,
        @Header("Authorization") bearer: String,
        @Query("page") page: Int = 1,
        @Query("q") query: String? = null
    ): ApiPage<Customer>
}
```

Gunakan base URL yang berakhiran `/`. Produksi wajib HTTPS; cleartext HTTP lokal membutuhkan network security config Android khusus debug.

## Membuat dan merotasi API key

Jalankan migrasi sekali:

```bash
cd /www/wwwroot/billing/server
npm run migrate
```

Owner atau user dengan permission `settings.edit` membuat key awal dan melakukan rotasi melalui API web:

```http
POST /api/settings/mobile-api-key/rotate
Authorization: Bearer <token-web>
Content-Type: application/json

{ "grace_hours": 24 }
```

`grace_hours` menerima `0..168`. Respons `201` memuat `api_key` plaintext satu kali. Backend hanya menyimpan hash SHA-256. Salin key ke konfigurasi build mobile; jangan commit ke repository.

Status tanpa plaintext key:

```http
GET /api/settings/mobile-api-key
Authorization: Bearer <token-web>
```

Key baru aktif langsung. Key lama aktif sampai `previous_expires_at`; gunakan `grace_hours: 0` untuk mencabutnya langsung.
