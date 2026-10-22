# NetBill Mobile API v1 — Flutter

Base URL produksi: `https://domain-anda/api/mobile/v1`.

Semua request mobile, kecuali `GET /health`, memakai header berikut:

```dart
final headers = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'X-API-Key': mobileApiKey,
  if (token != null) 'Authorization': 'Bearer $token',
};
```

Simpan JWT di `flutter_secure_storage`. Jangan commit `mobileApiKey`; APK dapat dibongkar, jadi gunakan HTTPS dan rotasi key lewat `POST /api/settings/mobile-api-key/rotate`.

## Client Dio minimal

```dart
import 'package:dio/dio.dart';

Dio netBillDio({required String baseUrl, required String apiKey, String? token}) => Dio(
  BaseOptions(
    baseUrl: '$baseUrl/api/mobile/v1',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': apiKey,
      if (token != null) 'Authorization': 'Bearer $token',
    },
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 30),
  ),
);
```

Error selalu baca `response.data['message']`. Status penting: `400` input salah, `401` key/JWT salah atau habis, `403` role tidak punya izin, `404` data tidak ada, `502` MikroTik/GenieACS gagal dihubungi.

## Login

`POST /login`

```json
{ "username": "finance", "password": "password" }
```

```json
{
  "token": "<jwt>",
  "user": { "id": 1, "name": "Finance", "username": "finance", "email": "finance@contoh.id", "role": "finance" }
}
```

Setelah login, panggil `GET /me`. Gunakan `permissions.<menu>.view/create/edit` untuk tampilkan halaman atau aksi.

## Daftar pelanggan

`GET /customers?page=1&limit=20&q=budi&status=active`

`q` mencari nama, kode, telepon, atau username PPPoE. `status`: `active`, `inactive`, `isolated`.

```json
{
  "data": [{
    "id": 12, "code": "CUST-0012", "name": "Budi Santoso", "phone": "08123456789",
    "email": null, "address": "Jl. Mawar 1", "area": "Cimahi",
    "latitude": -6.8721, "longitude": 107.5421, "status": "active",
    "pppoe_username": "budi12", "billing_day": 5, "active_until": "2026-10-05",
    "activation_date": "2026-01-05", "package_id": 2, "package_name": "20 Mbps",
    "package_speed": "20 Mbps", "package_price": 200000
  }],
  "meta": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

Detail: `GET /customers/12`. Respons `{ "customer": {...}, "invoices": [...] }`; detail pelanggan juga memuat `nik`, `static_ip`, `odp`, `odc`, `redaman`, `ont_brand`, `ont_serial`, `tag`, dan `notes`.

## Management dan monitoring PPPoE

Ringkasan: `GET /pppoe/summary`.

Sesi: `GET /pppoe/sessions?page=1&limit=25&status=online&q=budi&router=1&sort=uptime&dir=desc`.

`status`: `all`, `online`, `offline`, `isolir`. Respons handler monitoring:

```json
{
  "rows": [{
    "customer_id": 12, "router_id": 1, "username": "budi12", "ip": "10.10.0.12",
    "mac": "AA:BB:CC:DD:EE:FF", "uptime": 86400, "status": "online",
    "tx_rate": 1000000, "rx_rate": 2000000, "tx_bytes": 1000, "rx_bytes": 2000,
    "last_logout": null, "last_change": "2026-09-19 10:00:00"
  }],
  "total": 1, "page": 1, "limit": 25, "total_pages": 1
}
```

Sinkron dari MikroTik: `POST /pppoe/sync`, body kosong `{}`.

Aksi sesi: `POST /pppoe/action`.

```json
{ "username": "budi12", "action": "disconnect" }
```

Nilai `action`: `disconnect`, `isolir`, `activate`. Hanya role berizin `monitoring.edit`.

Riwayat: `GET /pppoe/customer/12/history` memberi `{ "rows": [{ "event": "up", "ip": "10.10.0.12", "logged_at": "..." }] }`.

Pemakaian: `GET /pppoe/customer/12/usage?days=30` memberi `{ "rows": [{ "d": "2026-09-19", "download": 2000, "upload": 1000 }] }`. `days` maksimum 90.

## Monitoring ONT

Daftar: `GET /ont?page=1&limit=15&status=online&signal=poor&odp=ODP-01&q=budi&sortBy=rx_power&sortDir=asc`.

`signal`: `excellent` (>= -20 dBm), `fair` (-25 s/d < -20), `poor` (< -25). Respons:

```json
{
  "rows": [{
    "id": 42, "genieacs_device_id": "...", "serial": "ZTEGC123", "model": "F609",
    "status": "online", "rx_power": -24.5, "tx_power": 2.1, "temperature": 48.2,
    "uptime": 86400, "ip_pppoe": "10.10.0.12", "ip_wan": "192.168.1.2",
    "pppoe_username": "budi12", "customer_name": "Budi Santoso", "customer_code": "CUST-0012"
  }],
  "total": 1, "stats": { "total": 1, "excellent": 0, "fair": 1, "poor": 0, "offline": 0 },
  "odps": ["ODP-01"]
}
```

Detail live GenieACS: `GET /ont/42/detail` memberi `{ "device": {...}, "detail": {...} }`.

Sinkron semua ONT: `POST /ont/sync`, body `{}`. Sinkron satu ONT: `POST /ont/42/sync`, body `{}`. Keduanya dapat menunggu inform ONT beberapa menit.

Reboot: `POST /ont/42/reboot`, body `{}`.

Ubah WiFi: `POST /ont/42/wifi`.

```json
{
  "ssid": "Rumah Budi",
  "password": "rahasia123",
  "path": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1"
}
```

Aktif/nonaktif WiFi: `POST /ont/42/wifi-enable`.

```json
{ "enabled": true, "path": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1" }
```

Riwayat sinyal/status: `GET /ont/42/history`.

## Laporan laba rugi

`GET /reports/profit-loss?period=2026-09`

`period` opsional, format `YYYY-MM`; default periode berjalan menurut WIB. Respons memakai kalkulasi dan struktur sama dengan halaman web:

```json
{
  "period": "2026-09",
  "revenue": { "billing": 12500000, "nonBilling": 500000, "total": 13000000 },
  "expenses": [
    { "name": "Bandwidth", "total": 4000000 },
    { "name": "Operasional", "total": 1500000 }
  ],
  "totalExpense": 5500000,
  "net": 7500000,
  "previous": { "period": "2026-08", "net": 7000000 },
  "growth": 7.142857142857142
}
```

Semua nominal dan `growth` berupa JSON number. `growth` bernilai `null` bila laba bersih periode sebelumnya nol. Endpoint membutuhkan permission `finance.view`; periode salah memberi `400` dengan `{ "message": "Periode tidak valid" }`.

```dart
final response = await netBillDio(baseUrl: baseUrl, apiKey: mobileApiKey, token: token)
    .get('/reports/profit-loss', queryParameters: {'period': '2026-09'});
final report = response.data as Map<String, dynamic>;
```

## Tagihan dan pembayaran

Daftar tagihan: `GET /invoices?page=1&limit=20&q=budi&status=unpaid&period=2026-09`.

```json
{
  "data": [{
    "id": 123, "number": "INV-202609-0001", "customer_id": 12, "period": "2026-09",
    "due_date": "2026-10-05", "amount": 200000, "late_fee": 0, "tax": 0,
    "discount": 0, "paid_amount": 0, "total": 200000, "status": "unpaid",
    "customer_code": "CUST-0012", "customer_name": "Budi Santoso", "customer_phone": "08123456789"
  }],
  "meta": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

Detail: `GET /invoices/123`. Respons `{ "invoice": {...}, "payments": [...] }`.

Riwayat pembayaran: `GET /payments?page=1&limit=20`. Respons `data/meta`; item memuat `id`, `invoice_id`, `customer_id`, `amount`, `method`, `note`, `status`, `payment_date`, `proof_path`, `invoice_number`, `customer_code`, `customer_name`.

Catat pembayaran: `POST /payments`. Client Dio `netBillDio` sudah mengirim `X-API-Key` dan JWT.

```dart
await netBillDio(baseUrl: baseUrl, apiKey: mobileApiKey, token: token).post(
  '/payments',
  data: {
    'invoice_id': 123,
    'amount': 200000,
    'method': 'qris', // cash | transfer | gateway | qris
    'bank_id': 2, // opsional; harus bank aktif
    'note': 'Pembayaran Flutter',
    'payment_date': '2026-09-19 10:30:00', // opsional, WIB
  },
);
```

Respons sukses:

```json
{ "id": 77, "ok": true }
```

Nilai pembayaran harus lebih dari nol dan tidak boleh melebihi sisa tagihan. Backend mengubah status tagihan, mengaktifkan pelanggan bila lunas, sinkron RADIUS, dan mencatat audit. Endpoint belum idempoten: nonaktifkan tombol bayar saat request berjalan; setelah timeout, baca ulang detail tagihan sebelum mengirim pembayaran lagi. Bukti transfer belum didukung oleh endpoint JSON mobile.

Semua nominal API adalah JSON number, bukan format Rupiah. Semua datetime dikirim server sebagai string MySQL lokal; parse di Flutter sebagai waktu lokal.
