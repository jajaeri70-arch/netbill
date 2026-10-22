import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldBan, ShieldCheck, Pencil, Trash2, IdCard, Home, Wrench, FileSignature, Upload, FileText, RefreshCw } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { Card, Badge, Button, Empty } from '../components/ui.jsx';
import WifiModal from '../components/WifiModal.jsx';
import { fmtIDR, fmtDate, fmtDateTime, fmtUptime, statusLabel } from '../utils/format.js';
import CustomerForm from './CustomerForm.jsx';

/** Jenis dokumen pelanggan (tabel customer_attachments) — konfigurasi tampilan kartu Data Teknis & Dokumen */
const DOC_TYPES = [
  { type: 'ktp', label: 'KTP', Icon: IdCard, color: 'bg-accent-blue/15 text-accent-blue' },
  { type: 'rumah', label: 'Foto Rumah', Icon: Home, color: 'bg-accent-green/15 text-accent-green' },
  { type: 'instalasi', label: 'Instalasi', Icon: Wrench, color: 'bg-accent-orange/15 text-accent-orange' },
  { type: 'perjanjian', label: 'Perjanjian', Icon: FileSignature, color: 'bg-accent-purple/15 text-accent-purple' },
];

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [wifiDev, setWifiDev] = useState(null);
  const [uploadingType, setUploadingType] = useState(null); // jenis dokumen yang sedang diunggah

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/customers/${id}`);
      setData(data);
    } catch (err) {
      toast('Pelanggan tidak ditemukan', 'danger');
      navigate('/pelanggan');
    }
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const c = data.customer;
  const device = data.devices[0];
  // PRABAYAR | BAYAR DI MUKA → siklus tagihan mengikuti Tanggal Aktif (paritas engine server)
  const isPrepaid = String(c.billing_type || '').toLowerCase() === 'prabayar';
  const prepaidAnchor = c.activation_date || c.installation_date;
  const cycleDay = isPrepaid && prepaidAnchor
    ? new Date(`${String(prepaidAnchor).slice(0, 10)}T00:00:00`).getDate()
    : c.billing_day;

  const changeStatus = async (status) => {
    try {
      await api.post(`/customers/${id}/status`, { status });
      toast(`Status diubah menjadi ${statusLabel[status]}`, 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal mengubah status', 'danger');
    }
  };

  const remove = async () => {
    if (!(await confirm({
      title: 'Hapus Pelanggan',
      message: `Pelanggan "${c.name}" beserta seluruh data tagihan terkait akan dihapus permanen.`,
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    try {
      await api.delete(`/customers/${id}`);
      toast('Pelanggan dihapus', 'success');
      navigate('/pelanggan');
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menghapus', 'danger');
    }
  };

  /** Pilih & unggah dokumen per jenis — spinner tombol mengikuti jenis yang sedang diproses */
  const uploadDoc = (type) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      setUploadingType(type);
      try {
        await api.post(`/customers/${id}/attachments`, fd);
        toast(`Dokumen ${DOC_TYPES.find((d) => d.type === type)?.label || ''} berhasil diunggah`, 'success');
        await load();
      } catch (err) {
        toast(err.response?.data?.message || 'Upload gagal', 'danger');
      } finally {
        setUploadingType(null);
      }
    };
    input.click();
  };

  return (
    <div>
      <button onClick={() => navigate('/pelanggan')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 mb-4">
        <ArrowLeft size={15} /> Kembali ke Daftar Pelanggan
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent-blue/15 text-accent-blue flex items-center justify-center text-xl font-bold">
              {c.name.slice(0, 1)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{c.name}</h1>
                <Badge value={c.status} label={statusLabel[c.status]} />
                {c.tag && <Badge value="info" label={c.tag} />}
                {Number(c.no_auto_isolate) === 1 && <Badge value="success" label="Bebas Isolir" />}
              </div>
              <p className="text-sm text-slate-400">
                {c.code} · {c.phone || '-'} · PPPoE: <span className="font-mono">{c.pppoe_username}</span>
                {data.session && <> · Sesi: <Badge value={data.session.status} label={statusLabel[data.session.status]} /></>}
                {data.session?.uptime > 0 && <> · {fmtUptime(data.session.uptime)}</>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {device && can('devices', 'edit') && (
              <Button variant="outline" onClick={() => setWifiDev({ ...device, customer_name: c.name, customer_code: c.code })}>
                Ganti WiFi
              </Button>
            )}
            {(c.status === 'isolated' || c.status === 'disabled') ? (
              can('customers', 'edit') && <Button variant="green" onClick={() => changeStatus('active')}><ShieldCheck size={15} /> Aktifkan</Button>
            ) : (
              can('customers', 'edit') && !Number(c.no_auto_isolate) && <Button variant="danger" onClick={() => changeStatus('isolated')} title="Putus koneksi & isolir pelanggan ini"><ShieldBan size={15} /> Isolir</Button>
            )}
            {can('customers', 'edit') && <Button variant="ghost" onClick={() => setShowEdit(true)}><Pencil size={15} /> Edit</Button>}
            {can('customers', 'delete') && <Button variant="ghost" onClick={remove}><Trash2 size={15} className="text-accent-red" /></Button>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="Data Pribadi">
          <dl className="space-y-2 text-sm">
            {[['NIK', c.nik], ['Alamat', c.address], ['Area', c.area],
              ['Koordinat', c.latitude ? `${Number(c.latitude).toFixed(5)}, ${Number(c.longitude).toFixed(5)}` : null]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-slate-400 shrink-0">{k}</dt>
                <dd className="text-right">{v || '-'}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Langganan">
          <dl className="space-y-2 text-sm">
            {[['Paket', c.package_name ? `${c.package_name} (${c.package_speed})` : null],
              ['Harga', c.package_price ? fmtIDR(c.package_price) : null],
              ['Aktivasi', c.activation_date ? fmtDate(c.activation_date) : null],
              ['Masa Aktif s/d', c.active_until ? fmtDate(c.active_until) : null],
              ['Siklus Tagihan', `Tanggal ${cycleDay}${isPrepaid ? ' (Prabayar — mengikuti Tanggal Aktif)' : ''}`],
              ['Toleransi Isolir', c.grace_days ? `${c.grace_days} hari` : 'Ikut global'],
              ['Auto ISOLIR', Number(c.no_auto_isolate) === 1 ? 'Nonaktif — tidak pernah diisolir' : null]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-slate-400 shrink-0">{k}</dt>
                <dd className="text-right">{v || '-'}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Data Teknis & Dokumen">
          <dl className="space-y-2 text-sm mb-3">
            {[['ODP/ODC', `${c.odp || '-'} / ${c.odc || '-'}`], ['Redaman', c.redaman ? `${c.redaman} dBm` : null],
              ['Serial ONT', c.ont_serial], ['Model', device?.model]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-slate-400 shrink-0">{k}</dt>
                <dd className="text-right">{v || '-'}</dd>
              </div>
            ))}
          </dl>
          {/* Slot dokumen per jenis — unggah & buka dokumen dalam satu tempat */}
          <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-navy-700/50">
            {DOC_TYPES.map(({ type, label, Icon: DocIcon, color }) => {
              const docs = data.attachments.filter((a) => a.type === type);
              const busy = uploadingType === type;
              return (
                <div key={type} className="rounded-xl border border-slate-200 dark:border-navy-600 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`p-1.5 rounded-lg shrink-0 ${color}`}><DocIcon size={14} /></span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">{label}</p>
                        <p className="text-[11px] text-slate-400">{docs.length ? `${docs.length} dokumen terunggah` : 'Belum ada dokumen'}</p>
                      </div>
                    </div>
                    {can('customers', 'edit') && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => uploadDoc(type)} title={`Unggah dokumen ${label}`}>
                        {busy ? <RefreshCw size={12} className="animate-spin" /> : <Upload size={12} />}
                        {busy ? 'Mengunggah…' : 'Unggah'}
                      </Button>
                    )}
                  </div>
                  {docs.length ? (
                    <div className="space-y-1">
                      {docs.map((a) => (
                        <a key={a.id} href={a.file_path} target="_blank" rel="noreferrer" title="Buka dokumen di tab baru"
                          className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-navy-700/40 px-2 py-1.5 text-xs transition hover:bg-accent-blue/10 hover:text-accent-blue">
                          <FileText size={13} className="shrink-0 text-slate-400" />
                          <span className="font-semibold uppercase">{String(a.file_path).split('.').pop()}</span>
                          <span className="text-slate-400 truncate">· Diunggah {fmtDateTime(a.created_at)}</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 dark:border-navy-600 px-2 py-2 text-center text-xs text-slate-400">
                      {can('customers', 'edit') ? 'Klik "Unggah" untuk menambahkan' : 'Tidak ada dokumen'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Histori Tagihan" bodyClass="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px]">
              <thead className="border-b border-slate-200/60 dark:border-navy-700">
                <tr><th className="th">No</th><th className="th">Periode</th><th className="th">Total</th><th className="th">Status</th><th className="th"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
                {data.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="td text-xs font-mono">{i.number}</td>
                    <td className="td text-sm">{i.period}</td>
                    <td className="td text-sm font-semibold">{fmtIDR(i.total)}</td>
                    <td className="td"><Badge value={i.status} label={statusLabel[i.status]} /></td>
                    <td className="td text-right">
                      <Link to={`/tagihan/${i.id}/cetak`} className="text-xs text-accent-blue hover:underline">Cetak</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.invoices.length === 0 && <Empty text="Belum ada tagihan" />}
          </div>
        </Card>

        <Card title="Histori Pembayaran" bodyClass="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px]">
              <thead className="border-b border-slate-200/60 dark:border-navy-700">
                <tr><th className="th">Tanggal</th><th className="th">Tagihan</th><th className="th">Metode</th><th className="th">Jumlah</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="td text-sm">{fmtDateTime(p.payment_date)}</td>
                    <td className="td text-xs font-mono">{p.invoice_number}</td>
                    <td className="td"><Badge value={p.method} label={statusLabel[p.method]} /></td>
                    <td className="td text-sm font-semibold text-accent-green">{fmtIDR(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.payments.length === 0 && <Empty text="Belum ada pembayaran" />}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Tiket Gangguan" bodyClass="!p-0">
          <div className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {data.tickets.map((t) => (
              <div key={t.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <Badge value={t.status} label={statusLabel[t.status]} />
                </div>
                <p className="text-xs text-slate-400">{fmtDateTime(t.created_at)} · {t.assigned_name || 'Belum ditugaskan'}</p>
              </div>
            ))}
            {data.tickets.length === 0 && <Empty text="Tidak ada tiket" />}
          </div>
        </Card>

        <Card title="Histori Koneksi" bodyClass="!p-0">
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-navy-700/50">
            {data.connectionLogs.map((l, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2">
                <Badge value={l.event === 'up' || l.event === 'activate' ? 'online' : 'offline'}
                  label={l.event === 'up' ? 'Connect' : l.event === 'down' ? 'Disconnect' : statusLabel[l.event]} />
                <span className="text-xs text-slate-400">{fmtDateTime(l.logged_at)}</span>
              </div>
            ))}
            {data.connectionLogs.length === 0 && <Empty text="Tidak ada log" />}
          </div>
        </Card>

        <Card title="Histori Paket">
          <div className="space-y-2">
            {data.packageHistory.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm">
                <span>{h.old_name || '-'} → <strong>{h.new_name || '-'}</strong></span>
                <span className="text-xs text-slate-400">{fmtDateTime(h.changed_at)}</span>
              </div>
            ))}
            {data.packageHistory.length === 0 && <Empty text="Belum ada perubahan paket" />}
          </div>
        </Card>
      </div>

      {showEdit && (
        <CustomerForm editId={id} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); load(); }} />
      )}

      {/* Modal ganti WiFi (remote via GenieACS — PRD 5.6) */}
      <WifiModal
        open={!!wifiDev}
        device={wifiDev}
        onClose={() => setWifiDev(null)}
        onSaved={() => { setWifiDev(null); load(); }}
      />
    </div>
  );
}

