import { useCallback, useEffect, useState } from 'react';
import {
  Activity, SignalHigh, SignalLow, Thermometer, Clock, Globe, Wifi, Link2,
  AlertTriangle, RefreshCw, Trash2, Users,
} from 'lucide-react';
import api from '../api.js';
import { Badge, Button, Empty, Spinner, StatCard, RxPowerValue, rxQuality } from './ui.jsx';
import { fmtDateTime, fmtTemperature, fmtUptime } from '../utils/format.js';

/** Status koneksi WAN/WLAN dianggap aktif — ambang sama dengan halaman Setting ONT */
const isActiveStatus = (s) => /connected|up|active/i.test(String(s || ''));

/** Kolom info kecil (label + nilai) — gaya sama dengan halaman Setting ONT */
function Field({ label, children }) {
  return (
    <div className="rounded-xl border border-slate-200/60 dark:border-navy-700 px-3 py-2.5">
      <p className="text-[11px] text-slate-400">{label}</p>
      <div className="text-sm font-medium mt-0.5 break-all">{children}</div>
    </div>
  );
}

/** Chip interface LAN/WiFi yang terikat pada sebuah koneksi WAN */
function BindingsBox({ interfaces, bindings = [] }) {
  const isBound = (it) => bindings.includes(it.path);
  const lan = (interfaces || []).filter((i) => i.type === 'lan');
  const wifi = (interfaces || []).filter((i) => i.type === 'ssid');
  if (!lan.length && !wifi.length) return null;
  const chip = (it, index) => {
    const bound = isBound(it);
    const number = it.label?.match(/\d+/)?.[0] || String(index + 1);
    return (
      <div key={it.path} title={it.bound_to ? `Bound to: ${it.bound_to}` : 'Tidak terikat'} className="flex min-w-16 flex-col items-center gap-1">
        <span className={`grid h-9 w-9 place-items-center rounded-md border text-xs font-bold ${bound ? 'border-emerald-600 bg-emerald-500 text-white shadow-sm shadow-emerald-500/25' : 'border-slate-300 bg-white text-slate-500 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-400'}`}>{number}</span>
        <span className={`text-[10px] font-medium ${bound ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>{it.label}</span>
      </div>
    );
  };
  return (
    <div className="mt-3 rounded-xl border border-slate-200/60 dark:border-navy-700 p-3">
      <p className="text-xs font-semibold flex items-center gap-1.5 mb-2"><Link2 size={12} /> Interface Bindings</p>
      {lan.length > 0 && (
        <div className="mb-2">
          <p className="text-[11px] text-slate-400 mb-1">LAN Ports</p>
          <div className="grid grid-cols-4 gap-3">{lan.map(chip)}</div>
        </div>
      )}
      {wifi.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 mb-1">WiFi Networks</p>
          <div className="grid grid-cols-4 gap-3">{wifi.map(chip)}</div>
        </div>
      )}
    </div>
  );
}

const TABS = [['wan', 'WAN'], ['ssid', 'SSID'], ['system', 'System']];

/**
 * Konten detail perangkat ONT dari GenieACS (GET /api/devices/:id/detail) — hanya-baca.
 * Datanya sama dengan halaman "Perangkat ONT → Setting ONT": ringkasan koneksi +
 * tab WAN (IP & PPP, lengkap dengan bindings) / SSID (WLAN) / System (info perangkat).
 * Dipakai popup "Detail Perangkat ONT" pada halaman Pelanggan agar detail lengkap
 * bisa dilihat tanpa berpindah ke halaman Perangkat ONT.
 */
export function DeviceDetailContent({ deviceId, onAddWan, onEditWan, onDeleteWan }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('wan');

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await api.get(`/devices/${deviceId}/detail`);
      setData(res);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data perangkat');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  if (!deviceId) return <Empty text="Perangkat ONT tidak terhubung" />;
  if (loading && !data) return <Spinner />;
  if (error) {
    return (
      <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 p-6 text-center">
        <AlertTriangle size={24} className="mx-auto text-accent-red" />
        <p className="text-sm text-accent-red mt-2">{error}</p>
        <Button size="sm" className="mt-3" onClick={load}><RefreshCw size={13} /> Coba Lagi</Button>
      </div>
    );
  }

  const detail = data?.detail;
  const ov = detail?.overview;
  const rx = rxQuality(ov?.rx_power);

  return (
    <div className="space-y-4">
      {/* Baris status + refresh manual */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Badge value={ov?.status} label={ov?.status === 'online' ? 'Online' : 'Offline'} />
        <span className="min-w-0 break-words text-slate-400">Firmware: <b className="text-slate-600 dark:text-slate-200">{data?.device?.firmware || detail?.system?.firmware || '-'}</b></span>
        <span className="break-words text-slate-400">· Last inform: {fmtDateTime(ov?.last_inform)}</span>
        <Button size="sm" variant="ghost" className="sm:ml-auto" onClick={load} disabled={loading} title="Muat ulang data dari GenieACS">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      {/* Ringkasan koneksi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Activity} label="Status Koneksi" value={ov?.status === 'online' ? 'Online' : 'Offline'} sub="Status ONT di GenieACS" color={ov?.status === 'online' ? 'bg-accent-green/15 text-accent-green' : 'bg-slate-400/15 text-slate-400'} />
        <StatCard icon={ov?.rx_power != null && ov.rx_power < -25 ? SignalLow : SignalHigh} label="RX Power" value={ov?.rx_power == null ? 'N/A' : <RxPowerValue value={ov.rx_power} decimals={2} />} sub={rx.label} color={`${rx.bg} ${rx.cls}`} />
        <StatCard icon={Thermometer} label="Temperature" value={fmtTemperature(ov?.temperature)} sub="Transceiver optik" color="bg-accent-orange/15 text-accent-orange" />
        <StatCard icon={Clock} label="Uptime" value={fmtUptime(ov?.uptime)} sub={`IP PPPoE: ${ov?.ip_pppoe || 'N/A'}`} color="bg-accent-purple/15 text-accent-purple" />
      </div>

      {/* Tab konfigurasi (read-only): WAN / SSID / System */}
      <div>
        <div className="flex gap-1 border-b border-slate-200/60 dark:border-navy-700">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${tab === k ? 'border-accent-blue text-accent-blue' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pt-4 space-y-5">
          {tab === 'wan' && (
            <>
              <section>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">WAN IP Configuration</h4>
                {(detail?.wan_ip || []).length === 0 && <Empty text="Tidak ada koneksi WAN IP" />}
                <div className="space-y-3">
                  {(detail?.wan_ip || []).map((w) => (
                    <div key={w.key} className="rounded-xl border border-slate-200/60 dark:border-navy-700 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold flex items-center gap-2 break-words"><Globe size={14} className="shrink-0 text-accent-blue" /> {w.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono break-all">{w.base_path}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!w.management && onDeleteWan && <button type="button" onClick={() => onDeleteWan(w).then((deleted) => deleted && load())} title="Hapus WAN" aria-label={`Hapus WAN ${w.name}`} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /> Hapus</button>}
                          <Badge value={isActiveStatus(w.status) ? 'active' : 'inactive'} label={w.status || 'N/A'} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        <Field label="VLAN">{w.vlan || 'N/A'}</Field>
                        <Field label="IP Address"><span className="font-mono">{w.external_ip || 'N/A'}</span></Field>
                        <Field label="Service">{w.service || 'N/A'}</Field>
                        <Field label="Type">{w.connection_type || 'N/A'}</Field>
                        <Field label="NAT">{w.nat_enabled == null ? 'N/A' : (/^(1|true)$/i.test(w.nat_enabled) ? 'Enabled' : 'Disabled')}</Field>
                        <Field label="MAC"><span className="font-mono">{w.mac || 'N/A'}</span></Field>
                      </div>
                      {w.management && (
                        <div className="mt-3 rounded-lg bg-accent-orange/10 border border-accent-orange/30 px-3 py-2 text-xs text-accent-orange">
                          Koneksi manajemen TR-069 — disediakan untuk ACS, jangan diubah atau dihapus.
                        </div>
                      )}
                      <BindingsBox interfaces={detail?.interfaces} bindings={w.bindings} />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">WAN PPP Configuration</h4>
                  {onAddWan && <button type="button" onClick={onAddWan} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"><span aria-hidden="true">+</span> Add WAN</button>}
                </div>
                {(detail?.wan_ppp || []).length === 0 && <Empty text="Tidak ada koneksi WAN PPP" />}
                <div className="space-y-3">
                  {(detail?.wan_ppp || []).map((w) => (
                    <div key={w.key} className="rounded-xl border border-slate-200/60 dark:border-navy-700 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold flex items-center gap-2">
                            <Globe size={14} className={`shrink-0 ${w.active ? 'text-accent-green' : 'text-slate-400'}`} /> {w.name}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono break-all">{w.base_path}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge value={w.active ? 'active' : 'inactive'} label={w.active ? 'Active' : (w.status || 'Nonaktif')} />
                          {!w.management && onEditWan && <button type="button" onClick={() => onEditWan(w)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">Edit WAN</button>}
                          {!w.management && onDeleteWan && <button type="button" onClick={() => onDeleteWan(w).then((deleted) => deleted && load())} title="Hapus WAN" aria-label={`Hapus WAN ${w.name}`} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /> Hapus</button>}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        <Field label="VLAN">{w.vlan || 'N/A'}</Field>
                        <Field label="Username"><span className="font-mono">{w.username || '-'}</span></Field>
                        <Field label="IP Address"><span className="font-mono">{w.external_ip || 'N/A'}</span></Field>
                        <Field label="Type">{w.connection_type || 'N/A'}</Field>
                        <Field label="NAT">{w.nat_enabled == null ? 'N/A' : (/^(1|true)$/i.test(w.nat_enabled) ? 'Enabled' : 'Disabled')}</Field>
                        <Field label="Status">{w.status || 'N/A'}</Field>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                        <Field label="Last Connection Error">
                          {w.last_error
                            ? (/no.?error/i.test(w.last_error) ? <span className="text-accent-green">{w.last_error}</span> : <span className="text-accent-red">{w.last_error}</span>)
                            : '-'}
                        </Field>
                      </div>
                      <BindingsBox interfaces={detail?.interfaces} bindings={w.bindings} />
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === 'ssid' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {(detail?.wlan || []).length === 0 && <Empty text="Tidak ada konfigurasi WLAN" />}
              {(detail?.wlan || []).map((w) => (
                <div key={w.key} className="rounded-xl border border-slate-200/60 dark:border-navy-700 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold flex items-center gap-2 break-words"><Wifi size={14} className="shrink-0 text-accent-blue" /> WLAN {w.index} — {w.ssid || '-'}</p>
                      <p className="text-[11px] text-slate-400 font-mono break-all">{w.base_path}</p>
                    </div>
                    <Badge value={isActiveStatus(w.status) ? 'active' : 'inactive'} label={w.status || 'N/A'} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Field label="SSID">{w.ssid || '-'}</Field>
                    <Field label="Device Terkoneksi"><span className="inline-flex items-center gap-1"><Users size={14} />{w.device_count ?? 'N/A'}</span></Field>
                    <Field label="Standard">{w.standard || 'N/A'}</Field>
                    <Field label="Channel">{w.channel || 'N/A'}</Field>
                    <Field label="Beacon Type">{w.beacon_type || 'N/A'}</Field>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'system' && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Informasi Perangkat</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <Field label="Device ID (GenieACS)"><span className="font-mono text-xs">{detail?.system?.device_id}</span></Field>
                <Field label="Manufacturer">{detail?.system?.manufacturer || 'N/A'}</Field>
                <Field label="Model">{detail?.system?.model || data?.device?.model || 'N/A'}</Field>
                <Field label="Hardware Version">{detail?.system?.hardware || 'N/A'}</Field>
                <Field label="Firmware">{detail?.system?.firmware || data?.device?.firmware || 'N/A'}</Field>
                <Field label="Serial Number"><span className="font-mono">{detail?.system?.serial || data?.device?.serial || 'N/A'}</span></Field>
                <Field label="Uptime">{fmtUptime(ov?.uptime)}</Field>
                <Field label="Last Inform">{fmtDateTime(ov?.last_inform)}</Field>
                <Field label="IP PPPoE"><span className="font-mono">{ov?.ip_pppoe || 'N/A'}</span></Field>
              </div>
              {detail?.system?.description && <p className="text-xs text-slate-400 mt-2">{detail.system.description}</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

