// Bulk reconciliation includes database work for every ONT; do not use the
// general API's 15-second timeout or automatically retry an uncertain request.
export const DEVICE_SYNC_TIMEOUT = 120000;

export function syncDevices(api, id) {
  return api.post(id == null ? '/devices/sync' : `/devices/${id}/sync`, null, {
    timeout: DEVICE_SYNC_TIMEOUT,
  });
}

export function deviceSyncError(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (!error.response) {
    return 'Status sinkronisasi belum dapat dipastikan karena koneksi terputus atau waktu tunggu habis. Segarkan data dan periksa status GenieACS sebelum mencoba kembali.';
  }
  return 'Sinkronisasi gagal. Periksa layanan backend dan konfigurasi GenieACS.';
}