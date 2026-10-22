import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Power, Wifi, History, SignalHigh, SignalLow, WifiOff, ArrowUp, ArrowDown, SlidersHorizontal, Activity, Users } from 'lucide-react';
import api from '../api.js';
import { syncDevices, deviceSyncError } from '../utils/deviceSync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Badge, Button, Modal, Pagination, Empty, StatCard, RxPowerValue } from '../components/ui.jsx';
import WifiModal from '../components/WifiModal.jsx';
import { fmtDateTime, fmtTemperature, fmtUptime, statusLabel } from '../utils/format.js';
import OntSettingsModal from '../components/OntSettingsModal.jsx';
import ActiveDevicesModal from '../components/ActiveDevicesModal.jsx';

export default function Devices() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [signal, setSignal] = useState('all');
  const [odp, setOdp] = useState('all');
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState({ by: 'status', dir: 'desc' });
  const [stats, setStats] = useState({ excellent: 0, fair: 0, poor: 0, offline: 0 });
  const [odps, setOdps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [wifiDev, setWifiDev] = useState(null);
  const [settingDev, setSettingDev] = useState(null);
  const [hist, setHist] = useState(null);
  const [histRows, setHistRows] = useState([]);
  const [pings, setPings] = useState({});
  const [pingingAll, setPingingAll] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [activeDev, setActiveDev] = useState(null);
  const loadId = useRef(0);

  /** Ping satu perangkat (gateway dari GenieACS / fallback IP PPPoE) */
  const pingDevice = async (id) => {
    setPings((p) => ({ ...p, [id]: { loading: true } }));
    try {
      const { data } = await api.get(`/devices/${id}/ping-gateway`);
      setPings((p) => ({ ...p, [id]: { ok: data.ok, latency: data.latency_ms, target: data.target } }));
    } catch {
      setPings((p) => ({ ...p, [id]: { ok: false, error: true } }));
    }
  };

  /** Ping semua perangkat pada halaman aktif (paralel di server, maks 5 proses) */
  const pingAll = async () => {
    setPingingAll(true);
    try {
      const ids = rows.map((r) => r.id);
      const { data } = await api.post('/devices/ping-batch', { ids });
      const map = {};
      data.results.forEach((r) => { map[r.id] = { ok: r.ok, latency: r.latency_ms, target: r.target }; });
      setPings((p) => ({ ...p, ...map }));
      const fail = data.results.filter((r) => !r.ok).length;
      toast(`Ping selesai — ${data.results.length - fail} berhasil, ${fail} gagal`, data.results.length - fail ? 'success' : 'warning');
    } catch (err) {
      toast(err.response?.data?.message || 'Ping massal gagal', 'danger');
    } finally { setPingingAll(false); }
  };
  const load = useCallback(async () => {
    const requestId = ++loadId.current;
    const { data } = await api.get('/devices', { params: { q, status, signal, odp, page, limit, sortBy: sort.by, sortDir: sort.dir } });
    if (requestId !== loadId.current) return;
    setRows(data.rows);
    setTotal(data.total);
    setStats(data.stats || {});
    setOdps(data.odps || []);
    if (!data.rows.length) { setLoadingClients(false); return; }
    setLoadingClients(true);
    try {
      const { data: clients } = await api.get('/devices/clients', { params: { ids: data.rows.map((row) => row.id).join(',') } });
      if (requestId !== loadId.current) return;
      const counts = new Map(clients.results.map((item) => [item.id, item.wifi_clients]));
      setRows((current) => current.map((row) => counts.has(row.id) ? { ...row, wifi_clients: counts.get(row.id) } : row));
    } catch {
      // Daftar ONT tetap bisa dibaca saat GenieACS tidak tersedia.
    } finally { if (requestId === loadId.current) setLoadingClients(false); }
  }, [q, status, signal, odp, page, limit, sort]);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await syncDevices(api);
      toast(`${data.synced} perangkat tersinkron via GenieACS${data.removed ? `, ${data.removed} perangkat terhapus` : ''}`, 'success');
      await load().catch(() => toast('Sinkronisasi selesai, tetapi daftar gagal dimuat ulang. Segarkan halaman.', 'warning'));
    } catch (err) {
      toast(deviceSyncError(err), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const reboot = async (dev) => {
    if (!(await confirm({
      title: 'Reboot Perangkat',
      message: `Reboot ${dev.model} (${dev.customer_name || dev.serial}) sekarang? Perangkat akan offline sementara.`,
      confirmText: 'Ya, Reboot',
      tone: 'warning',
      icon: Power,
    }))) return;
    try {
      const { data } = await api.post(`/devices/${dev.id}/reboot`);
      toast('Perintah reboot terkirim via GenieACS', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Reboot gagal', 'danger');
    }
  };

  const syncDevice = async (dev) => {
    if (syncingId != null) return false;
    setSyncingId(dev.id);
    try {
      const { data } = await syncDevices(api, dev.id);
      if (data.responded) toast(data.message || 'Summon berhasil — ONT merespons', 'success');
      else toast(data.message || 'Summon dikirim tetapi ONT tidak merespons', 'warning');
      await load().catch(() => toast('Perintah sinkron diproses, tetapi daftar gagal dimuat ulang. Segarkan halaman.', 'warning'));
      return Boolean(data.responded);
    } catch (err) {
      toast(deviceSyncError(err), 'danger');
      return false;
    } finally {
      setSyncingId(null);
    }
  };

  const openHist = async (dev) => {
    setHist(dev);
    const { data } = await api.get(`/devices/${dev.id}/history`);
    setHistRows(data.rows);
  };

  const resetPage = (setter) => (e) => { setter(e.target.value); setPage(1); };
  const sortBy = (by) => setSort((current) => current.by === by
    ? { by, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { by, dir: 'asc' });
  const sortHeader = (label, by) => (
    <button type="button" className="inline-flex items-center gap-1 hover:text-accent-blue" onClick={() => sortBy(by)}>
      {label}
      {sort.by === by && (sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Perangkat ONT (GenieACS)"
        subtitle="Manajemen perangkat pelanggan via TR-069 (PRD 5.6)"
        actions={
          can('devices', 'edit') && (
            <Button onClick={sync} disabled={busy}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Sinkronkan</Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <StatCard icon={SignalHigh} label="Excellent Signal" value={stats.excellent || 0} sub="RX ≥ -20 dBm" color="bg-accent-green/15 text-accent-green" />
        <StatCard icon={SignalHigh} label="Fair Signal" value={stats.fair || 0} sub="RX -25 sampai < -20 dBm" color="bg-accent-yellow/15 text-accent-yellow" />
        <StatCard icon={SignalLow} label="Poor Signal" value={stats.poor || 0} sub="RX < -25 dBm" color="bg-accent-red/15 text-accent-red" />
        <StatCard icon={WifiOff} label="Offline" value={stats.offline || 0} sub="Tidak terhubung" color="bg-slate-400/15 text-slate-400" />
      </div>

      <Card title="Daftar Perangkat ONT" bodyClass="!p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/60 dark:border-navy-700 p-4">
          <div className="min-w-[220px] flex-1">
            <input className="input" placeholder="Cari serial, pelanggan, model..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <select className="input w-auto min-w-[140px]" value={status} onChange={resetPage(setStatus)} aria-label="Filter status">
            <option value="all">Semua Status</option><option value="online">Online</option><option value="offline">Offline</option>
          </select>
          <select className="input w-auto min-w-[150px]" value={signal} onChange={resetPage(setSignal)} aria-label="Filter kualitas sinyal">
            <option value="all">Semua Sinyal</option><option value="excellent">Excellent</option><option value="fair">Fair</option><option value="poor">Poor</option>
          </select>
          <select className="input w-auto min-w-[140px]" value={odp} onChange={resetPage(setOdp)} aria-label="Filter ODP">
            <option value="all">Semua ODP</option>{odps.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <Button variant="outline" onClick={pingAll} disabled={pingingAll || rows.length === 0}
            title="Ping gateway IP WAN semua perangkat di halaman ini">
            <Activity size={14} className={pingingAll ? 'animate-spin text-accent-blue' : 'text-accent-blue'} />
            {pingingAll ? 'Menguji…' : 'Ping Semua'}
          </Button>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px]">
          <thead className="border-b border-slate-200/60 dark:border-navy-700">
            <tr>
              <th className="th">{sortHeader('ID', 'id')}</th>
              <th className="th">{sortHeader('Pelanggan', 'customer')}</th>
              <th className="th">{sortHeader('PPPoE Username', 'pppoe_username')}</th>
              <th className="th">{sortHeader('SN', 'serial')}</th>
              <th className="th">{sortHeader('Active', 'status')}</th>
              <th className="th" title="Jumlah perangkat WiFi yang terkoneksi pada ONT">Device {loadingClients && <RefreshCw size={12} className="inline animate-spin" />}</th>
              <th className="th">{sortHeader('RX', 'rx_power')}</th>
              <th className="th">{sortHeader('Temp', 'temperature')}</th>
              <th className="th">{sortHeader('Uptime', 'uptime')}</th>
              <th className="th">{sortHeader('IP PPPoE', 'ip_pppoe')}</th>
              <th className="th">{sortHeader('IP WAN', 'ip_wan')}</th>
              <th className="th text-center">Ping Gateway</th>
              <th className="th">{sortHeader('Perangkat', 'device')}</th>
              <th className="th text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
                <td className="td text-xs font-mono">{d.genieacs_device_id}</td>
                <td className="td">
                  {d.linked_customer_id ? (
                    <Link to={`/pelanggan/${d.linked_customer_id}`} className="font-medium hover:text-accent-blue">{d.customer_name}</Link>
                  ) : <span className="text-slate-400">Belum tertaut</span>}
                  <p className="text-xs text-slate-400">{d.customer_code || ''}</p>
                </td>
                <td className="td text-xs font-mono">
                  {d.pppoe_username || '-'}
                  {d.pppoe_source === 'genieacs' && <p className="text-[10px] text-accent-blue">via TR-069</p>}
                </td>
                <td className="td text-xs font-mono">{d.serial || '-'}</td>
                <td className="td"><Badge value={d.status} label={d.status === 'online' ? 'Online' : 'Offline'} /></td>
                <td className="td text-sm">
                  <button type="button" onClick={() => setActiveDev(d)} title="Lihat perangkat WiFi aktif pada ONT" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-accent-blue hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue">
                    <Users size={13} /> {d.wifi_clients == null ? 'N/A' : d.wifi_clients}
                  </button>
                </td>
                <td className="td text-sm">{d.rx_power == null ? '-' : <RxPowerValue value={d.rx_power} />}</td>
                <td className="td text-sm">{fmtTemperature(d.temperature)}</td>
                <td className="td text-sm">{fmtUptime(d.uptime)}</td>
                <td className="td text-xs font-mono">{d.ip_pppoe || '-'}</td>
                <td className="td text-xs font-mono">{d.ip_wan || '-'}</td>
                <td className="td text-center">
                  {pings[d.id]?.loading ? (
                    <RefreshCw size={13} className="inline animate-spin text-accent-blue" />
                  ) : pings[d.id] ? (
                    pings[d.id].ok ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-green/15 text-accent-green px-2 py-0.5 text-xs font-semibold"
                        title={`Ping ke ${pings[d.id].target || 'gateway'} berhasil`}>
                        <Activity size={11} /> {pings[d.id].latency != null ? `${pings[d.id].latency} ms` : 'OK'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-red/15 text-accent-red px-2 py-0.5 text-xs font-semibold"
                        title={pings[d.id].target ? `Ping ke ${pings[d.id].target} timeout` : 'IP WAN tidak tersedia'}>
                        <Activity size={11} /> Gagal
                      </span>
                    )
                  ) : (
                    <Button size="sm" variant="ghost" title="Ping gateway IP WAN" onClick={() => pingDevice(d.id)}>
                      <Activity size={13} className="text-slate-400" />
                    </Button>
                  )}
                </td>
                <td className="td text-sm">{d.model || '-'}<p className="text-xs text-slate-400">fw {d.firmware || '-'}</p></td>
                <td className="td text-right">
                  <div className="inline-flex gap-1">
                    {can('devices', 'edit') && (
                      <>
                        <Button size="sm" variant="ghost" title="Sinkronkan ONT via Summon" onClick={() => syncDevice(d)} disabled={syncingId === d.id}>
                        <RefreshCw size={13} className={syncingId === d.id ? 'animate-spin text-accent-blue' : 'text-accent-blue'} />
                      </Button>
                      <Button size="sm" variant="ghost" title="Reboot" onClick={() => reboot(d)}><Power size={13} className="text-accent-orange" /></Button>
                      <Button size="sm" variant="ghost" title="Ganti WiFi" onClick={() => setWifiDev(d)}>
                        <Wifi size={13} className="text-accent-blue" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Setting ONT — WAN PPP dan SSID" onClick={() => setSettingDev(d)}>
                        <SlidersHorizontal size={13} className="text-accent-purple" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Riwayat" onClick={() => openHist(d)}><History size={13} /></Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {rows.length === 0 && <Empty text="Belum ada perangkat — klik Sinkronkan" />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[320px]"><Pagination page={page} total={total} limit={limit} onPage={setPage} /></div>
          <label className="flex items-center gap-2 px-4 pb-3 text-xs text-slate-500 dark:text-slate-400">
            Tampilkan
            <select className="input !w-auto !py-1.5" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} aria-label="Jumlah perangkat per halaman">
              <option value="10">10</option><option value="25">25</option><option value="50">50</option>
            </select>
            per halaman
          </label>
        </div>
      </Card>

      {/* Modal ganti WiFi (remote via GenieACS — PRD 5.6) */}
      <WifiModal
        open={!!wifiDev}
        device={wifiDev}
        onClose={() => setWifiDev(null)}
        onSaved={() => { setWifiDev(null); load(); }}
      />

      <OntSettingsModal device={settingDev} onClose={() => setSettingDev(null)} onSaved={load} />
      <ActiveDevicesModal device={activeDev} onClose={() => setActiveDev(null)} onCount={(id, count) => setRows((current) => current.map((row) => row.id === id ? { ...row, wifi_clients: count } : row))} onSummon={can('devices', 'edit') ? syncDevice : null} />

      {/* Modal riwayat parameter perangkat (historical TR-069 — PRD 5.6) */}
      <Modal open={!!hist} onClose={() => setHist(null)} title={`Riwayat Parameter — ${hist?.serial || ''}`} wide>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200/60 dark:border-navy-700">
            <th className="py-2">Waktu</th><th>Status</th><th>RX Power</th><th>TX Power</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {histRows.map((h, i) => (
              <tr key={i}>
                <td className="py-2">{fmtDateTime(h.recorded_at)}</td>
                <td><Badge value={h.status} label={statusLabel[h.status]} /></td>
                <td><RxPowerValue value={h.rx_power} /></td>
                <td>{h.tx_power} dBm</td>
              </tr>
            ))}
          </tbody>
        </table>
        {histRows.length === 0 && <Empty text="Belum ada riwayat" />}
      </Modal>
    </div>
  );
}
