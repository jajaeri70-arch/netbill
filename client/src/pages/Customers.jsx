import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Plus, Download, Upload, Pencil, Eye, Search, Wifi, WifiOff, Timer, Globe,
  Clock, SignalHigh, SignalMedium, SignalLow, Router as RouterIcon,
  RefreshCw, CheckCircle2, XCircle, Activity, X, ListFilter, RotateCcw, SlidersHorizontal,
} from 'lucide-react';
import api from '../api.js';
import { syncDevices, deviceSyncError } from '../utils/deviceSync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, Badge, Button, Pagination, Empty, Modal, SortTh, RxPowerValue } from '../components/ui.jsx';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { fmtIDR, statusLabel, fmtDateTime, fmtUptime } from '../utils/format.js';
import CustomerForm from './CustomerForm.jsx';
import ImportCustomersModal from '../components/ImportCustomersModal.jsx';
import OntSettingsModal from '../components/OntSettingsModal.jsx';

/** Kualitas sinyal berdasarkan redaman PON — ambang sama dengan halaman Perangkat ONT */
function rxInfo(c) {
  if (c.ont_status !== 'online') return { label: 'Offline', Icon: WifiOff, cls: 'text-accent-red', bg: 'bg-accent-red/15' };
  const rx = c.ont_rx_power;
  if (rx == null) return { label: 'N/A', Icon: SignalLow, cls: 'text-slate-400', bg: 'bg-slate-400/15' };
  if (rx >= -20) return { label: 'Bagus', Icon: SignalHigh, cls: 'text-accent-green', bg: 'bg-accent-green/15' };
  if (rx >= -25) return { label: 'Sedang', Icon: SignalMedium, cls: 'text-accent-yellow', bg: 'bg-accent-yellow/15' };
  return { label: 'Buruk', Icon: SignalLow, cls: 'text-accent-red', bg: 'bg-accent-red/15' };
}

/** Keterangan relatif sederhana utk Last Inform */
function relTime(s) {
  if (!s) return '';
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

/** Ubin info berikon utk popup detail ONT */
function OntTile({ icon: Icon, bg, cls, label, children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-navy-600 p-3">
      <span className={`p-2 rounded-lg shrink-0 ${bg} ${cls}`}><Icon size={16} /></span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <div className="text-sm font-semibold mt-0.5">{children}</div>
      </div>
    </div>
  );
}

/** Sel tabel: tombol ringkasan perangkat ONT (kecocokan via username PPPoE) → buka popup detail */
function OntCell({ c, onShow }) {
  if (!c.ont_device_id) return <span className="text-xs text-slate-400">-</span>;
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onShow(c)} title="Lihat detail perangkat ONT" aria-label={`Lihat detail ONT ${c.ont_model || c.ont_serial || c.name}`}
        className="relative rounded-lg border border-slate-200 dark:border-navy-600 bg-slate-50 dark:bg-navy-700/40 p-2 text-slate-500 transition hover:border-accent-blue/50 hover:bg-accent-blue/5 hover:text-accent-blue hover:shadow-sm">
        <RouterIcon size={18} />
        <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-slate-50 dark:ring-navy-700 ${c.ont_status === 'online' ? 'bg-accent-green' : 'bg-accent-red'}`} />
      </button>
    </div>
  );
}

/** Popup ringkasan ONT: status koneksi, redaman PON, uptime, IP WAN & last inform. */
function OntModal({ c, onClose, canDevices, canEditDevices, onSettings, canSummon, onSummon, summoning, summonState, summonMsg, pingData, pinging, onPing, pingHistory }) {
  if (!c) return null;
  const online = c.ont_status === 'online';
  const info = rxInfo(c);
  return (
    <Modal open onClose={onClose} title="Detail Perangkat ONT" className="max-w-lg">
      <div className="flex items-center gap-3 mb-4">
        <span className={`p-2.5 rounded-xl ${info.bg} ${info.cls}`}><RouterIcon size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold truncate">{c.ont_model || 'Perangkat ONT'}</p>
          <p className="text-xs text-slate-400 font-mono truncate">{c.ont_serial || '-'} · {c.name}</p>
        </div>
        <Badge value={online ? 'online' : 'offline'} label={online ? 'Online' : 'Offline'} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <OntTile icon={info.Icon} bg={info.bg} cls={info.cls} label="Status Koneksi">
          <span className={info.cls}>{online ? 'Online' : 'Offline'}</span>
        </OntTile>
        <OntTile icon={info.Icon} bg={info.bg} cls={info.cls} label="Redaman PON (RX Power)">
          <span>
            <RxPowerValue value={c.ont_rx_power} />{' '}
            <span className={`text-xs font-normal ${info.cls}`}>({info.label})</span>
          </span>
        </OntTile>
        <OntTile icon={Timer} bg="bg-accent-blue/15" cls="text-accent-blue" label="Up Time">
          {c.ont_uptime != null ? fmtUptime(c.ont_uptime) : '-'}
        </OntTile>
        <OntTile icon={Globe} bg="bg-accent-purple/15" cls="text-accent-purple" label="IP WAN (PPPoE)">
          <span className="font-mono">{c.ont_ip_pppoe || '-'}</span>
        </OntTile>
        {canDevices && (
          <div className="sm:col-span-2">
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-navy-600 p-3">
              <span className={`p-2 rounded-lg shrink-0 ${pinging ? 'bg-accent-blue/15 text-accent-blue' : pingData?.ok ? 'bg-accent-green/15 text-accent-green' : pingData?.target ? 'bg-accent-red/15 text-accent-red' : 'bg-slate-400/15 text-slate-400'}`}>
                {pinging ? <RefreshCw size={16} className="animate-spin" /> : pingData?.ok ? <Activity size={16} /> : <WifiOff size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Ping Gateway IP WAN {pingData?.target && <span className="font-mono normal-case">· {pingData.target}</span>}
                </p>
                <div className="text-sm font-semibold mt-0.5">
                  {pinging ? <span className="text-accent-blue">Menguji…</span>
                    : pingData?.target
                      ? (pingData.ok
                        ? <span className="text-accent-green">Berhasil — {pingData.latency_ms} ms</span>
                        : <span className="text-accent-red">Tidak merespons</span>)
                      : (pingData?.message || 'Belum dites')}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={pinging} onClick={onPing} title="Uji ulang ping ke gateway">
                <RefreshCw size={12} className={pinging ? 'animate-spin' : ''} /> Test
              </Button>
            </div>
          </div>
        )}
        {canDevices && pingHistory.length > 0 && (
          <div className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-navy-600 p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Riwayat Ping Gateway — kualitas koneksi</p>
              <span className="text-[10px] text-slate-400">{pingHistory.length} tes terakhir · terbaru di kanan</span>
            </div>
            <div style={{ width: '100%', height: 60 }}>
              <ResponsiveContainer>
                <AreaChart
                  data={pingHistory.slice(-30).map((h) => ({ ...h, latency: h.ok ? Math.round(Number(h.latency_ms) * 10) / 10 : null }))}
                  margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
                >
                  <YAxis hide domain={[0, (dataMax) => Math.max(Number(dataMax) || 0, 10)]} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }}
                    labelFormatter={() => ''}
                    formatter={(v) => [`${v} ms`, 'Latensi']}
                  />
                  <Area type="monotone" dataKey="latency" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="sm:col-span-2">
          <OntTile icon={Clock} bg="bg-accent-orange/15" cls="text-accent-orange" label="Last Inform — summon terakhir">
            {c.ont_last_inform ? `${fmtDateTime(c.ont_last_inform)} (${relTime(c.ont_last_inform)})` : '-'}
          </OntTile>
        </div>
      </div>
      {summonState !== 'idle' && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs font-medium ${
          summonState === 'success' ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
            : summonState === 'failed' ? 'bg-accent-red/10 border-accent-red/30 text-accent-red'
              : 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue'}`}>
          {summonState === 'success' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            : summonState === 'failed' ? <XCircle size={14} className="mt-0.5 shrink-0" />
              : <RefreshCw size={14} className={`mt-0.5 shrink-0 ${summonState === 'sending' ? 'animate-spin' : ''}`} />}
          <span>{summonMsg}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-4">
        {canEditDevices && (
          <Button variant="secondary" onClick={onSettings} title="Buka Setting ONT">
            <SlidersHorizontal size={14} /> Setting ONT
          </Button>
        )}
        {canSummon && (
          <Button variant="orange" className="mr-auto" disabled={summoning} onClick={onSummon}
            title="Minta ONT melakukan inform ke GenieACS sekarang">
            <RefreshCw size={14} className={summoning ? 'animate-spin' : ''} />
            {summoning ? 'Mengirim & menunggu…' : 'Summon ONT'}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>Tutup</Button>
      </div>
    </Modal>
  );
}

/** Opsi jumlah baris & kolom urut yang valid (disimpan di URL agar tahan reload) */
const LIMIT_OPTIONS = [10, 25, 50, 100];
const SORT_FIELDS = ['id', 'code', 'name', 'package', 'area', 'ont', 'status', 'price', 'created'];

export default function Customers() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [packages, setPackages] = useState([]);
  const [meta, setMeta] = useState({ areas: [], tags: [] });
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState(null);
  const [ontDetail, setOntDetail] = useState(null);
  const [settingDev, setSettingDev] = useState(null);
  const [summoning, setSummoning] = useState(false);
  const [summonState, setSummonState] = useState('idle'); // idle | sending | queued | success | failed
  const [summonMsg, setSummonMsg] = useState('');
  const [pingData, setPingData] = useState(null);
  const [pinging, setPinging] = useState(false);
  const [pingHistory, setPingHistory] = useState([]);

  // State tabel (filter, halaman, urutan) disimpan di URL → bertahan saat reload,
  // tombol back/forward berfungsi, dan alamat bisa dibagikan langsung
  const q = params.get('q') || '';
  const status = params.get('status') || 'all';
  const installationStatus = params.get('installation_status') || 'all';
  const withoutInvoice = params.get('without_invoice') || '';
  const pkg = params.get('pkg') || 'all';
  const area = params.get('area') || 'all';
  const tag = params.get('tag') || 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = LIMIT_OPTIONS.includes(Number(params.get('limit'))) ? Number(params.get('limit')) : LIMIT_OPTIONS[0];
  const sort = SORT_FIELDS.includes(params.get('sort')) ? params.get('sort') : 'id';
  const dir = params.get('dir') === 'asc' ? 'asc' : 'desc';

  const loadPingHistory = (devId) => api.get(`/devices/${devId}/ping-history`)
    .then(({ data }) => setPingHistory(data.rows || [])).catch(() => {});

  /** Ping gateway IP WAN ONT dari server aplikasi */
  const pingOnt = async (devId) => {
    if (!devId) return;
    setPinging(true);
    setPingData(null);
    try {
      const { data } = await api.get(`/devices/${devId}/ping-gateway`);
      setPingData(data);
      loadPingHistory(devId);
    } catch (err) {
      setPingData({ ok: false, target: null, message: err.response?.data?.message || 'Ping gagal dijalankan' });
    } finally { setPinging(false); }
  };

  const openOnt = (c) => {
    setSummoning(false);
    setSummonState('idle');
    setSummonMsg('');
    setOntDetail(c);
    if (c.ont_device_id && can('devices')) {
      pingOnt(c.ont_device_id); // ping otomatis saat popup dibuka
      loadPingHistory(c.ont_device_id);
    }
  };

  const closeOnt = () => {
    setSummoning(false);
    setSummonState('idle');
    setSummonMsg('');
    setPingData(null);
    setPingHistory([]);
    setOntDetail(null);
  };

  /** Summon ONT — task selesai atau antre di GenieACS, tanpa polling inform. */
  const summonOnt = async () => {
    const devId = ontDetail?.ont_device_id;
    if (!devId || summoning) return;
    setSummoning(true);
    setSummonState('sending');
    setSummonMsg('Mengirim perintah sinkron ke GenieACS…');
    try {
      const { data } = await syncDevices(api, devId);
      if (data.responded) {
        setSummonState('success');
        setSummonMsg(data.message || 'Summon berhasil — ONT merespons.');
        toast('Summon berhasil — ONT merespons', 'success');
        if (data.last_inform) {
          setOntDetail((d) => (d && d.ont_device_id === devId ? { ...d, ont_last_inform: data.last_inform } : d));
        }
        await load().catch(() => toast('Sinkronisasi selesai, tetapi data pelanggan gagal dimuat ulang. Segarkan halaman.', 'warning'));
      } else {
        setSummonState('queued');
        setSummonMsg(data.message || 'Perintah sinkron antre di GenieACS. Tunggu inform berikutnya; jangan kirim ulang.');
        toast(data.message || 'Perintah sinkron antre di GenieACS', 'warning');
      }
    } catch (err) {
      setSummonState('failed');
      setSummonMsg(deviceSyncError(err));
      toast(deviceSyncError(err), 'danger');
    } finally {
      setSummoning(false);
    }
  };
  const load = useCallback(async () => {
    const { data } = await api.get('/customers', {
      params: { q, status, installation_status: installationStatus !== 'all' ? installationStatus : undefined, without_invoice: withoutInvoice || undefined, package_id: pkg !== 'all' ? pkg : undefined, area, tag, page, limit, sort, dir },
    });
    setRows(data.rows);
    setTotal(data.total);
  }, [q, status, installationStatus, withoutInvoice, pkg, area, tag, page, limit, sort, dir]);

  /** Simpan satu parameter state tabel ke URL (parameter lain tetap terjaga) */
  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === null || value === undefined || value === '' || value === 'all') next.delete(key);
    else next.set(key, String(value));
    if (key !== 'page') next.delete('page'); // ganti filter/urutan → kembali ke halaman 1
    setParams(next, { replace: true });
  };

  /** Klik header kolom: kolom baru mulai asc → klik lagi desc → klik lagi kembali normal */
  const toggleSort = (field) => {
    const next = new URLSearchParams(params);
    if (sort === field && dir === 'asc') next.set('dir', 'desc');
    else if (sort === field) { next.delete('sort'); next.delete('dir'); }
    else { next.set('sort', field); next.set('dir', 'asc'); }
    next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => { load(); }, [load]);
  // Muat opsi paket/area sekali saat halaman dibuka (tidak tergantung state tabel di URL)
  useEffect(() => {
    api.get('/packages').then(({ data }) => setPackages(data.rows)).catch(() => {});
    api.get('/customers/meta').then(({ data }) => setMeta(data)).catch(() => {});
    if (window.location.search.includes('new=1')) {
      setShowForm(true);
      setParams(new URLSearchParams(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Export CSV mengikuti filter aktif (via axios agar membawa token & nama file ber-tanggal) */
  const exportCsv = async () => {
    try {
      const { data } = await api.get('/customers/export', {
        params: { q, status, installation_status: installationStatus !== 'all' ? installationStatus : undefined, without_invoice: withoutInvoice || undefined, package_id: pkg !== 'all' ? pkg : undefined, area, tag, sort, dir },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      const d = new Date();
      a.download = `pelanggan-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.response?.data?.message || 'Export gagal', 'danger');
    }
  };

  /** Filter aktif → chip yang bisa dihapus satu per satu */
  const activeChips = [
    q && { key: 'q', label: `Cari: "${q}"`, clear: () => setParam('q', null) },
    status !== 'all' && { key: 'status', label: `Status: ${statusLabel[status] || status}`, clear: () => setParam('status', null) },
    installationStatus !== 'all' && { key: 'installation_status', label: `Pemasangan: ${{ attention: 'Perlu Tindakan', pending: 'Belum Terpasang', in_progress: 'Dalam Proses', installed: 'Terpasang' }[installationStatus]}`, clear: () => setParam('installation_status', null) },
    withoutInvoice === 'current_month' && { key: 'without_invoice', label: 'Belum Ada Invoice', clear: () => setParam('without_invoice', null) },
    pkg !== 'all' && { key: 'pkg', label: `Paket: ${packages.find((p) => p.id === Number(pkg))?.name || pkg}`, clear: () => setParam('pkg', null) },
    area !== 'all' && { key: 'area', label: `Area: ${area}`, clear: () => setParam('area', null) },
    tag !== 'all' && { key: 'tag', label: `Kategori: ${tag}`, clear: () => setParam('tag', null) },
  ].filter(Boolean);

  const resetFilters = () => {
    const next = new URLSearchParams(params);
    ['q', 'status', 'installation_status', 'without_invoice', 'pkg', 'area', 'tag', 'page'].forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Pelanggan"
        subtitle={`${total} pelanggan terdaftar`}
        actions={
          <>
            {can('customers', 'export') && (
              <Button variant="outline" onClick={exportCsv}><Download size={15} /> Export</Button>
            )}
            {can('customers', 'create') && (
              <Button variant="outline" onClick={() => setShowImport(true)}>
                <Upload size={15} /> Import CSV
              </Button>
            )}
            {can('customers', 'create') && (
              <Button onClick={() => { setEditId(null); setShowForm(true); }}><Plus size={15} /> Tambah Pelanggan</Button>
            )}
          </>
        }
      />

      <Card bodyClass="!p-0 overflow-hidden">
        {/* Toolbar filter — header tabel */}
        <div className="p-4 border-b border-slate-200/60 dark:border-navy-700">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Cari nama / kode / HP / PPPoE…"
                value={q} onChange={(e) => setParam('q', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:items-center gap-2">
              <select className="input lg:w-36" value={status} onChange={(e) => setParam('status', e.target.value)}>
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="isolated">Isolir</option>
                <option value="inactive">Nonaktif</option>
              </select>
              <select className="input lg:w-44" value={installationStatus} onChange={(e) => setParam('installation_status', e.target.value)}>
                <option value="all">Semua Pemasangan</option>
                <option value="attention">Perlu Tindakan</option>
                <option value="pending">Belum Terpasang</option>
                <option value="in_progress">Dalam Proses</option>
                <option value="installed">Terpasang</option>
              </select>
              <select className="input lg:w-44" value={pkg} onChange={(e) => setParam('pkg', e.target.value)}>
                <option value="all">Semua Paket</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="input lg:w-36" value={area} onChange={(e) => setParam('area', e.target.value)}>
                <option value="all">Semua Area</option>
                {meta.areas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="input lg:w-36" value={tag} onChange={(e) => setParam('tag', e.target.value)}>
                <option value="all">Semua Kategori</option>
                {meta.tags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 lg:ml-auto">
              <span className="hidden sm:inline text-xs text-slate-400">Tampilkan</span>
              <select className="input !w-auto py-1.5 text-xs" value={limit}
                onChange={(e) => setParam('limit', Number(e.target.value) === LIMIT_OPTIONS[0] ? null : Number(e.target.value))}>
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} baris</option>)}
              </select>
            </div>
          </div>
          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-navy-700/50">
              <ListFilter size={13} className="text-slate-400" />
              {activeChips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-accent-blue/10 text-accent-blue py-1 pl-2.5 pr-1 text-xs font-medium">
                  {chip.label}
                  <button type="button" onClick={chip.clear} title="Hapus filter ini"
                    className="rounded-full p-0.5 transition hover:bg-accent-blue/20">
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button type="button" onClick={resetFilters} title="Bersihkan semua filter"
                className="ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-navy-700">
                <RotateCcw size={12} /> Reset
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead className="border-b border-slate-200/60 dark:border-navy-700 bg-slate-50/80 dark:bg-navy-800/60">
            <tr>
              <SortTh label="Kode" field="code" sort={sort} dir={dir} onSort={toggleSort} />
              <SortTh label="Nama" field="name" sort={sort} dir={dir} onSort={toggleSort} />
              <SortTh label="Paket" field="package" sort={sort} dir={dir} onSort={toggleSort} />
              <SortTh label="Area" field="area" sort={sort} dir={dir} onSort={toggleSort} />
              <SortTh label="Perangkat ONT" field="ont" sort={sort} dir={dir} onSort={toggleSort} />
              <SortTh label="Status" field="status" sort={sort} dir={dir} onSort={toggleSort} />
              <th className="th text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
                <td className="td font-mono text-xs">{c.code}</td>
                <td className="td">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.phone || '-'} · {c.tag || 'Umum'}</p>
                </td>
                <td className="td">
                  <p>{c.package_name || '-'}</p>
                  <p className="text-xs text-slate-400">{c.package_speed || ''} · {fmtIDR(c.package_price)}</p>
                </td>
                <td className="td text-sm">{c.area || '-'}</td>
                <td className="td"><OntCell c={c} onShow={openOnt} /></td>
                <td className="td"><Badge value={c.status} label={statusLabel[c.status]} /></td>
                <td className="td text-right">
                  <div className="inline-flex gap-1">
                    <Link to={`/pelanggan/${c.id}`}><Button size="sm" variant="ghost" title="Detail"><Eye size={14} /></Button></Link>
                    {can('customers', 'edit') && (
                      <Button size="sm" variant="ghost" title="Edit" onClick={() => { setEditId(c.id); setShowForm(true); }}><Pencil size={14} /></Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="Tidak ada pelanggan yang cocok" />}
        </div>

        <Pagination page={page} total={total} limit={limit} onPage={(p) => setParam('page', p === 1 ? null : p)} />
      </Card>

      <OntModal
        c={ontDetail}
        onClose={closeOnt}
        canDevices={can('devices')}
        canEditDevices={can('devices', 'edit')}
        onSettings={() => {
          setSettingDev({ id: ontDetail.ont_device_id, serial: ontDetail.ont_serial });
          closeOnt();
        }}
        canSummon={can('devices', 'edit')}
        onSummon={summonOnt}
        summoning={summoning}
        summonState={summonState}
        summonMsg={summonMsg}
        pingData={pingData}
        pinging={pinging}
        onPing={() => ontDetail && pingOnt(ontDetail.ont_device_id)}
        pingHistory={pingHistory}
      />
      <OntSettingsModal device={settingDev} onClose={() => setSettingDev(null)} onSaved={load} />

      {showForm && (
        <CustomerForm
          editId={editId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      <ImportCustomersModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onDone={() => {
          load();
          api.get('/packages').then(({ data }) => setPackages(data.rows)).catch(() => {});
          api.get('/customers/meta').then(({ data }) => setMeta(data)).catch(() => {});
        }}
      />
    </div>
  );

}
