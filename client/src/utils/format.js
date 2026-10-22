export const fmtIDR = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    Number(n || 0)
  );

export const fmtNum = (n) => new Intl.NumberFormat('id-ID').format(Number(n || 0));

export const fmtDate = (s) => {
  if (!s) return '-';
  const d = new Date(String(s).length <= 10 ? `${s}T00:00:00` : s);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (s) => {
  if (!s) return '-';
  return new Date(s).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export const fmtBytes = (b) => {
  const n = Number(b || 0);
  if (n >= 1099511627776) return `${(n / 1099511627776).toFixed(2)} TB`;
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
};

export const fmtRate = (bps) => `${(Number(bps || 0) / 1000000).toFixed(2)} Mbps`;

export const fmtUptime = (sec) => {
  const s = Number(sec || 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
};

export const fmtTemperature = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? `${n} °C` : 'N/A';
};

export const periodLabel = (p) =>
  p ? new Date(`${p}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-';

export const roleLabel = { owner: 'Owner', finance: 'Finance', teknisi: 'Teknisi/NOC', kasir: 'Kasir/CS' };

export const statusLabel = {
  active: 'Aktif', inactive: 'Nonaktif', isolated: 'Isolir', disabled: 'Disable',
  unpaid: 'Belum Bayar', partial: 'Sebagian', paid: 'Lunas', void: 'Batal',
  online: 'Online', offline: 'Offline', isolir: 'Isolir',
  open: 'Terbuka', assigned: 'Ditugaskan', on_the_way: 'Dalam Perjalanan', in_progress: 'Dikerjakan', pending: 'Tertunda', resolved: 'Selesai', closed: 'Ditutup', cancelled: 'Dibatalkan',
  cash: 'Tunai', transfer: 'Transfer', gateway: 'Gateway', qris: 'QRIS',
  confirmed: 'Terkonfirmasi', pending: 'Menunggu', approved: 'Disetujui',
  income: 'Pemasukan', expense: 'Pengeluaran',
};
