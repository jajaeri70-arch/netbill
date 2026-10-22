import { useEffect, useState } from 'react';
import { Activity, Clock3, Monitor, RefreshCw, Thermometer, Users, Wifi } from 'lucide-react';
import api from '../api.js';
import { Badge, Button, Modal, RxPowerValue } from './ui.jsx';
import { fmtDateTime, fmtTemperature } from '../utils/format.js';

export default function ActiveDevicesModal({ device, onClose, onCount, onSummon }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [refresh, setRefresh] = useState(0);
  const [summoning, setSummoning] = useState(false);

  useEffect(() => {
    if (!device?.id) return undefined;
    let active = true;
    setState({ loading: true, data: null, error: null });
    api.get(`/devices/${device.id}/active-devices`).then(({ data }) => {
      if (!active) return;
      setState({ loading: false, data, error: null });
      onCount?.(device.id, data.count);
    }).catch((err) => {
      if (active) setState({ loading: false, data: null, error: err.response?.data?.message || 'Gagal mengambil data dari GenieACS' });
    });
    return () => { active = false; };
  }, [device?.id, refresh]);

  const { loading, data, error } = state;
  return (
    <Modal open={!!device} onClose={onClose} title={`Active Device List — ${device?.customer_name || device?.serial || ''}`} className="max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        {[
          { label: 'ACTIVE DEVICES', icon: Users, value: loading ? '...' : data?.count ?? 'N/A', sub: 'Perangkat WiFi terhubung' },
          { label: 'TEMPERATURE', icon: Thermometer, value: loading ? '...' : data ? fmtTemperature(data.temperature) : 'N/A', sub: 'Suhu ONT' },
          { label: 'RX POWER', icon: Activity, value: loading ? '...' : data?.rx_power == null ? 'N/A' : <RxPowerValue value={data.rx_power} />, sub: 'Sinyal optik' },
          { label: 'LAST INFORM', icon: Clock3, value: loading ? '...' : data?.last_inform ? fmtDateTime(data.last_inform) : 'N/A', sub: 'Kontak terakhir GenieACS' },
        ].map(({ label, icon: Icon, value, sub }) => (
          <div key={label} className="rounded-xl border border-border bg-secondary/40 px-3 py-3 min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-muted"><Icon size={13} />{label}</div>
            <p className="mt-1 font-bold text-sm break-words">{value}</p>
            <p className="text-xs text-muted">{sub}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mb-5">
        <Button size="sm" variant="ghost" onClick={() => setRefresh((n) => n + 1)} disabled={loading || summoning} title="Ambil ulang data tersimpan di GenieACS">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
        {onSummon && <Button size="sm" onClick={async () => {
          setSummoning(true);
          try { if (await onSummon(device)) setRefresh((n) => n + 1); }
          finally { setSummoning(false); }
        }} disabled={summoning || loading} title="Minta ONT memperbarui data melalui GenieACS">
          <RefreshCw size={14} className={summoning ? 'animate-spin' : ''} /> Summon
        </Button>}
      </div>
      {loading && <p className="text-sm text-muted">Memuat perangkat aktif...</p>}
      {error && <div role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">{error}</div>}
      {!loading && !error && (
        <>
          {data.count !== null && data.count !== data.devices.length && (
            <p className="mb-4 text-xs text-warning">ONT melaporkan {data.count} koneksi, tetapi hanya {data.devices.length} detail asosiasi yang tersedia di GenieACS.</p>
          )}
          {data.count === null && <p className="mb-4 text-xs text-muted">Jumlah koneksi tidak dilaporkan oleh ONT.</p>}
          {data.devices.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.devices.map((client) => (
                <div key={client.key} className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
                  <div className="flex items-center gap-2 border-b border-border pb-3 mb-3">
                    <span className="rounded-lg bg-violet-500/10 p-2 text-violet-600"><Monitor size={16} /></span>
                    <strong className="min-w-0 flex-1 truncate" title={client.name || client.mac || ''}>{client.name || client.mac || 'Perangkat tanpa nama'}</strong>
                    <Badge value="online" label="Active" />
                  </div>
                  <p className="break-all text-xs"><span className="text-muted">IP:</span> {client.ip || 'N/A'}</p>
                  <p className="mt-2 break-all text-xs"><span className="text-muted">MAC:</span> {client.mac || 'N/A'}</p>
                  <p className="mt-2 flex items-center gap-1 text-xs"><Wifi size={12} className="text-muted" /><span className="text-muted">SSID:</span> {client.ssid || 'N/A'}</p>
                </div>
              ))}
            </div>
          ) : <p className="rounded-xl border border-border p-5 text-sm text-muted">{data.count === 0 ? 'Tidak ada perangkat WiFi yang terhubung.' : 'Detail perangkat aktif tidak tersedia dari ONT.'}</p>}
        </>
      )}
    </Modal>
  );
}