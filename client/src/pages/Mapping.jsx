import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Plus, RefreshCw, Search, MapPin, Pencil, Trash2, Wifi, Download,
  Crosshair, Focus, Layers, Router as RouterIcon, Cable,
  FileUp, Network, Move, Box, ArrowDownToLine, ArrowUpToLine, Database,
} from 'lucide-react';
import api from '../api.js';
import { syncDevices, deviceSyncError } from '../utils/deviceSync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Button, Badge, Modal, Empty, StatCard, RxPowerValue } from '../components/ui.jsx';
import { fmtBytes, fmtDateTime, fmtRate } from '../utils/format.js';
import { parseCoordinate } from '../utils/coordinates.js';

/** Palet pin per jenis/status — selaras badge aplikasi (PRD 4.4) */
const PIN_COLORS = {
  online: '#10b981',    // hijau — perangkat GenieACS online
  offline: '#f43f5e',   // merah — perangkat offline
  customer: '#6366f1',  // indigo — titik pelanggan tanpa perangkat
  odp: '#06b6d4',       // cyan — titik ODP/splitter/distribusi
  odc: '#1d4ed8',       // biru — ODC/kabinet feeder
  router: '#8b5cf6',    // violet — titik router/POP
  warn: '#eab308',      // kuning — redaman sedang (borderline)
};

/** Klasifikasi redaman RX — ambang sama dengan rxQuality (ui.jsx) & backend:
 *  Bagus: rx ≥ -20 dBm (hijau) · Sedang: -25 ≤ rx < -20 dBm (kuning) · Buruk: rx < -25 dBm (merah) */
function attLevel(rx) {
  const n = rx == null ? null : Number(rx);
  if (n == null || Number.isNaN(n)) return null;
  if (n >= -20) return 'bagus';
  if (n >= -25) return 'sedang';
  return 'buruk';
}

/** Warna pin sesuai data perangkat terkait — pin perangkat pelanggan mengikuti
 *  kualitas redaman (Hijau/Kuning/Merah) selaras filter redaman */
function pinColor(row) {
  if (row.marker_type === 'odc') return PIN_COLORS.odc;
  if (row.marker_type === 'odp') return PIN_COLORS.odp;
  if (row.marker_type === 'router') return PIN_COLORS.router;
  if (row.device_status === 'offline') return PIN_COLORS.offline;
  if (row.device_status === 'online') {
    const lvl = attLevel(row.rx_power);
    if (lvl === 'sedang') return PIN_COLORS.warn;    // kuning
    if (lvl === 'buruk') return PIN_COLORS.offline;  // merah
    return PIN_COLORS.online;                        // hijau (bagus / tanpa data redaman)
  }
  return PIN_COLORS.customer;
}

/** DivIcon pin bulat dengan cincin pulsa — lebih modern daripada pin bawaan Leaflet.
 *  highlight=true → pin Server/POP diberi cincin emas agar jadi pusat sorotan peta. */
function makePin(row, draggable, highlight = false) {
  const color = pinColor(row || {});
  return L.divIcon({
    className: 'nb-map-pin',
    html:
      `<span class="nb-pin${highlight ? ' nb-pin-server' : ''}${draggable ? ' nb-pin-editing' : ''}" style="--pin:${color}${draggable ? ';--ring:#f59e0b' : ''}">` +
      `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      (row?.marker_type === 'router'
        ? '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>'
        : row?.marker_type === 'odc'
          ? '<path d="M4 6h16v12H4z"/><path d="M4 10h16M4 14h16"/>'
          : row?.marker_type === 'odp'
            ? '<path d="M4 7h16v10H4z"/><path d="M8 7v10M16 7v10"/>'
            : row?.device_row_id
              ? '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 7V4M17 7V4"/><circle cx="7" cy="13" r="1" fill="currentColor"/><circle cx="11" cy="13" r="1" fill="currentColor"/><path d="M15 13h3"/>'
              : '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>') +
      `</svg></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

/** Handler klik peta saat mode "Tambah Titik" aktif + ubah kursor jadi crosshair */
function MapClickHandler({ picking, onPick, drawingLink, onLinkPoint, onLinkMove }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = picking || drawingLink ? 'crosshair' : '';
    return () => { el.style.cursor = ''; };
  }, [map, picking, drawingLink]);
  useMapEvents({
    click(e) {
      if (picking) onPick(e.latlng);
      else if (drawingLink) onLinkPoint(e.latlng);
    },
    mousemove(e) {
      if (drawingLink) onLinkMove(e.latlng);
    },
  });
  return null;
}

/** Terbangkan peta ke satu titik (sorotan awal Server / fokus dari daftar) */
function Flyer({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? Math.max(map.getZoom(), 17), { duration: 0.8 });
  }, [map, target]);
  return null;
}

const EMPTY_FORM = { name: '', marker_type: 'customer', customer_id: '', device_id: '', latitude: '', longitude: '', address: '', note: '', capacity: '', splitter: '' };
const EMPTY_LINK_FORM = { fiber_type: 'drop', distance: '', notes: '' };

const WAYPOINT_ICON = L.divIcon({
  className: 'nb-link-waypoint',
  html: '<span style="display:block;width:12px;height:12px;border:2px solid #fff;border-radius:50%;background:#f97316;box-shadow:0 1px 3px #0008"></span>',
  iconSize: [12, 12], iconAnchor: [6, 6],
});

function pathDistanceMeters(points) {
  const toRad = (degrees) => degrees * Math.PI / 180;
  return points.slice(1).reduce((total, point, index) => {
    const [lat1, lng1] = points[index];
    const [lat2, lng2] = point;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return total + 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, 0);
}
const TYPE_LABEL = { customer: 'Pelanggan WiFi', odp: 'ODP / Splitter', odc: 'ODC / Kabinet', router: 'Router / POP', drop: 'Drop Fiber', distribution: 'Kabel Distribusi', odp_to_odp: 'ODP → ODP', feeder: 'Feeder' };

/** Warna garis fiber per jenis — selaras file peta eksternal */
const FIBER_COLORS = {
  drop: '#10b981',        // drop kabel pelanggan
  distribution: '#6366f1',// distribusi dari ODC
  odp_to_odp: '#f59e0b',  // antar ODP
  feeder: '#8b5cf6',
};

/** Kartu popup marker: ringkasan pelanggan + status perangkat GenieACS */
function PointPopup({ row, links, onEdit, onEditPosition, onDelete, canEdit, canDelete, moving }) {
  const connections = row.marker_type === 'odp'
    ? links.filter((link) => link.source_id === row.id || link.target_id === row.id)
    : [];
  const capacity = Number(row.capacity) || 0;
  const sourceConnections = connections.filter((link) => link.source_id === row.id);
  const uplinks = connections.filter((link) => link.target_id === row.id);
  const used = sourceConnections.length;
  const available = Math.max(capacity - used, 0);
  return (
    <div className="min-w-[250px] max-w-[300px] space-y-3">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-2.5 pr-4">
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-bold text-foreground">{row.name}</p>
          <p className="mt-0.5 text-[11px] font-medium text-muted">{TYPE_LABEL[row.marker_type] || row.marker_type}</p>
        </div>
        {row.device_status && (
          <Badge value={row.device_status} label={row.device_status === 'online' ? 'Online' : 'Offline'} className="shrink-0" />
        )}
      </div>
      <dl className="space-y-1.5 text-[12px]">
        {row.customer_name && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted">Pelanggan</dt>
            <dd className="truncate font-semibold text-foreground">{row.customer_name}</dd>
          </div>
        )}
        {row.package_name && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted">Paket</dt>
            <dd className="truncate text-foreground">{row.package_name}</dd>
          </div>
        )}
        {row.serial && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted">ONT</dt>
            <dd className="truncate font-mono text-[11px] text-foreground">{row.model || row.serial}</dd>
          </div>
        )}
        {row.capacity != null && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted">Kapasitas</dt>
            <dd className="text-foreground">{row.capacity} port{row.splitter ? ` · ${row.splitter}` : ''}</dd>
          </div>
        )}
        {row.rx_power != null && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted">Redaman</dt>
            <dd><RxPowerValue value={row.rx_power} decimals={2} /></dd>
          </div>
        )}
        {row.ip_pppoe && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted">IP PPPoE</dt>
            <dd className="truncate font-mono text-[11px] text-foreground">{row.ip_pppoe}</dd>
          </div>
        )}
        {row.marker_type === 'customer' && row.customer_id && (
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-2.5">
            <div className="rounded-xl border border-accent-blue/20 bg-accent-blue/10 p-2.5">
              <div className="flex items-center gap-1 text-accent-blue"><ArrowDownToLine size={13} /><span className="text-[10px] font-bold uppercase tracking-wide">Download live</span></div>
              <p className="mt-1 text-sm font-bold text-foreground">{fmtRate(row.download_bps)}</p>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-muted"><ArrowUpToLine size={11} />Upload {fmtRate(row.upload_bps)}</div>
            </div>
            <div className="rounded-xl border border-accent-purple/20 bg-accent-purple/10 p-2.5">
              <div className="flex items-center gap-1 text-accent-purple"><Database size={13} /><span className="text-[10px] font-bold uppercase tracking-wide">Total pemakaian</span></div>
              <p className="mt-1 text-sm font-bold text-foreground">{fmtBytes(Number(row.usage_download_bytes) + Number(row.usage_upload_bytes))}</p>
              <div className="mt-1 text-[10px] text-muted">RX {fmtBytes(row.usage_download_bytes)} · TX {fmtBytes(row.usage_upload_bytes)}</div>
            </div>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted">Koordinat</dt>
          <dd className="font-mono text-[11px] text-foreground">
            {Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}
          </dd>
        </div>
        {row.google_name && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted">Google Maps</dt>
            <dd className="truncate text-right text-foreground" title={row.google_address || row.google_name}>{row.google_name}</dd>
          </div>
        )}
      </dl>
      {row.marker_type === 'odp' && capacity > 0 && (
        <div className="space-y-2 border-t border-slate-200 pt-2 text-[11px] dark:border-navy-700">
          <div className="flex justify-between font-semibold"><span>Slot Usage</span><span className={available ? 'text-emerald-600' : 'text-rose-600'}>{used} / {capacity}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-navy-700">
            <div className={`h-full rounded-full ${available ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(used / capacity * 100, 100)}%` }} />
          </div>
          <div className="flex justify-between"><span className="text-slate-500">Tersedia:</span><b className={available ? 'text-emerald-600' : 'text-rose-600'}>{available} port</b></div>
          {!!connections.length && (
            <div className="space-y-2 border-t border-slate-200 pt-2 dark:border-navy-700">
              {!!sourceConnections.length && (
                <div className="space-y-1">
                  <p className="font-semibold">Jalur Distribusi:</p>
                  {sourceConnections.map((link) => <p key={link.id} className="truncate text-slate-500">• {link.t_name}</p>)}
                </div>
              )}
              {!!uplinks.length && (
                <div className="space-y-1">
                  <p className="font-semibold">Uplink:</p>
                  {uplinks.map((link) => <p key={link.id} className="truncate text-slate-500">• {link.s_name}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {row.note && <p className="rounded-lg border border-border bg-secondary/60 px-2.5 py-2 text-[11px] leading-relaxed text-muted">{row.note}</p>}
      <div className="flex flex-wrap gap-1.5 border-t border-border pt-2.5">
        {canEdit && (
          <Button size="sm" variant="outline" className="flex-1 whitespace-nowrap" onClick={() => onEditPosition(row)} disabled={moving}>
            <Move size={12} /> {moving ? 'Geser titik…' : 'Edit posisi'}
          </Button>
        )}
        {canEdit && <Button size="sm" variant="ghost" title="Ubah data" aria-label="Ubah data" onClick={() => onEdit(row)}><Pencil size={12} /></Button>}
        {canDelete && <Button size="sm" variant="ghost" title="Hapus" aria-label="Hapus" onClick={() => onDelete(row)}><Trash2 size={12} className="text-accent-red" /></Button>}
      </div>
    </div>
  );
}

/** Form tambah/ubah titik — link pelanggan & perangkat ONT (GenieACS) */
function PointForm({ open, onClose, form, setForm, sources, rows, editId, onSave, saving, onCoordinateEntry }) {
  const { customers = [], devices = [] } = sources || {};
  const linkedCustomerIds = useMemo(() => new Set(
    rows.filter((row) => row.id !== editId && row.customer_id != null).map((row) => String(row.customer_id))
  ), [rows, editId]);
  const availableCustomers = customers.filter((customer) => !linkedCustomerIds.has(String(customer.id)));
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(form.customer_id));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (form.marker_type === 'customer' && selectedCustomer && form.name !== selectedCustomer.name) {
      setForm((f) => ({ ...f, name: selectedCustomer.name || '' }));
    }
  }, [form.marker_type, form.name, selectedCustomer, setForm]);

  // Pilih pelanggan → auto-link perangkat (username PPPoE / serial ONT) + isi alamat/koordinat
  const pickCustomer = (id) => {
    const c = customers.find((x) => String(x.id) === String(id));
    setForm((f) => {
      const next = { ...f, customer_id: id };
      if (c) {
        next.name = c.name || '';
        if (!f.address && c.address) next.address = c.address;
        const dev = devices.find((d) =>
          (c.pppoe_username && d.pppoe_username === c.pppoe_username) || (c.ont_serial && d.serial === c.ont_serial));
        if (dev) next.device_id = String(dev.id);
        if (c.latitude != null && c.longitude != null) {
          next.latitude = Number(c.latitude).toFixed(6);
          next.longitude = Number(c.longitude).toFixed(6);
        }
      }
      return next;
    });
  };

  const submit = (e) => { e.preventDefault(); onSave(); };

  return (
      <Modal open={open} onClose={onClose} title={editId ? 'Ubah Titik Peta' : `Add ${form.marker_type === 'customer' ? 'ONT' : form.marker_type.toUpperCase()}`} className="max-w-2xl">
      <form onSubmit={submit} className="space-y-3">
        {!editId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Pilih koordinat dengan klik peta atau masukkan latitude dan longitude secara manual.</p>
            <Button type="button" size="sm" variant="outline" onClick={onCoordinateEntry}>Tambah titik via koordinat</Button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Nama Titik *</label>
            <input className="input" placeholder={form.marker_type === 'customer' ? 'Otomatis dari pelanggan' : 'Contoh: ODP Pasirkaliki 01'} value={form.name}
              onChange={(e) => set('name', e.target.value)} readOnly={form.marker_type === 'customer'} required autoFocus />
          </div>
          <div>
            <label className="label">Jenis Titik</label>
            <select className="input" value={form.marker_type} onChange={(e) => set('marker_type', e.target.value)}>
              <option value="customer">Pelanggan WiFi</option>
              <option value="odp">ODP / Splitter</option>
              <option value="odc">ODC / Kabinet</option>
              <option value="router">Router / POP</option>
            </select>
          </div>
        </div>
        {form.marker_type === 'customer' && (
          <div>
            <label className="label">Pelanggan *</label>
            <select className="input" value={form.customer_id} onChange={(e) => pickCustomer(e.target.value)} required>
              <option value="">— Pilih pelanggan —</option>
              {availableCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.code ? ` · ${c.code}` : ''}{c.pppoe_username ? ` · ${c.pppoe_username}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Perangkat ONT (GenieACS)</label>
          <select className="input" value={form.device_id} onChange={(e) => set('device_id', e.target.value)}>
            <option value="">— Tanpa perangkat / sinkronisasi dulu di Perangkat ONT —</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.serial} · {d.model || '?'} · {d.status === 'online' ? 'Online' : 'Offline'}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">Status titik mengikuti perangkat ONT yang tersinkron dari GenieACS.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Latitude *</label>
            <input className="input font-mono" type="text" inputMode="decimal" value={form.latitude}
              onChange={(e) => set('latitude', e.target.value)} required placeholder="-6.914741 atau 80150.8S" />
          </div>
          <div>
            <label className="label">Longitude *</label>
            <input className="input font-mono" type="text" inputMode="decimal" value={form.longitude}
              onChange={(e) => set('longitude', e.target.value)} required placeholder="107.609810 atau 1123432.9E" />
          </div>
        </div>
        {(form.marker_type === 'odp' || form.marker_type === 'odc') && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Kapasitas (port)</label>
              <input className="input" type="number" min="1" max="64" placeholder="Otomatis dari splitter" value={form.capacity} readOnly />
            </div>
            <div>
              <label className="label">Splitter</label>
              <select className="input" value={form.splitter} onChange={(e) => {
                const splitter = e.target.value;
                setForm((f) => ({ ...f, splitter, capacity: splitter ? splitter.split(':')[1] : '' }));
              }}>
                <option value="">— Pilih ratio —</option>
                <option>1:2</option><option>1:4</option><option>1:8</option><option>1:16</option><option>1:32</option>
              </select>
            </div>
          </div>
        )}
        <div>
          <label className="label">Alamat / Patokan</label>
          <input className="input" placeholder="Opsional — alamat lengkap lokasi titik" value={form.address}
            onChange={(e) => set('address', e.target.value)} />
        </div>
        <div>
          <label className="label">Catatan</label>
          <input className="input" placeholder="Opsional — mis. posisi kabel, patokan rumah" value={form.note}
            onChange={(e) => set('note', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Titik'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Mapping() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const mapRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ total: 0, online: 0, offline: 0, unpinned: 0 });
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | online | offline | nodevice
  const [deviceGroup, setDeviceGroup] = useState('all'); // all | router | odc | odp | customer
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [picking, setPicking] = useState(false); // mode klik peta untuk taruh titik
  const [draft, setDraft] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false); // sinkron GenieACS / impor koordinat
  const [target, setTarget] = useState(null); // fokus peta dari daftar
  const [movingId, setMovingId] = useState(null); // hanya marker ini yang sementara bisa digeser
  // Simpan pilihan peta agar tampilan terakhir pulih setelah reload.
  const [basemap, setBasemap] = useState(() => {
    const saved = localStorage.getItem('mapping-basemap');
    return saved === 'satellite' ? saved : 'standard';
  }); // standard | satellite
  useEffect(() => localStorage.setItem('mapping-basemap', basemap), [basemap]);
  const [links, setLinks] = useState([]); // jalur fiber hasil impor file peta
  const [selectedLinkId, setSelectedLinkId] = useState(null); // fokus penelusuran satu kabel
  const [linking, setLinking] = useState(false);
  const [linkDrawing, setLinkDrawing] = useState(false);
  const [linkPoints, setLinkPoints] = useState([]);
  const [linkWaypoints, setLinkWaypoints] = useState([]);
  const [linkCursor, setLinkCursor] = useState(null);
  const [linkForm, setLinkForm] = useState(EMPTY_LINK_FORM);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const importRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState(null); // ringkasan hasil impor JSON
  const linkDistance = useMemo(() => {
    if (!linkPoints.length) return 0;
    const path = [[Number(linkPoints[0].latitude), Number(linkPoints[0].longitude)], ...linkWaypoints];
    if (linkPoints[1]) path.push([Number(linkPoints[1].latitude), Number(linkPoints[1].longitude)]);
    else if (linkCursor) path.push(linkCursor);
    return pathDistanceMeters(path);
  }, [linkPoints, linkWaypoints, linkCursor]);
  const focusedOnce = useRef(false); // sorotan awal peta hanya sekali (ke titik Server)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [pts, st] = await Promise.all([api.get('/mapping'), api.get('/mapping/stats')]);
      setRows(pts.data.rows || []);
      setLinks(pts.data.links || []);
      setStats(st.data || { total: 0, online: 0, offline: 0, unpinned: 0 });
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal memuat titik peta', 'danger');
    } finally { if (!silent) setLoading(false); }
  }, [toast]);
  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [load]);
  // Sorotan awal: pindahkan fokus peta ke titik Server (router/POP) setelah data termuat.
  // Bug lama: MapContainer.center hanya berlaku saat mount sehingga peta terbuka di pusat default.
  useEffect(() => {
    if (focusedOnce.current || !rows.length) return;
    focusedOnce.current = true;
    const s = rows.find((r) => r.marker_type === 'router') || rows[0];
    setTarget({ lat: Number(s.latitude), lng: Number(s.longitude), zoom: 16, key: Date.now() });
  }, [rows]);

  // Impor file JSON peta eksternal (format network-map: nodes + edges fiber)
  const importJson = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/mapping/import-json', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const parts = [`${data.nodes_created} titik dibuat`, `${data.links_created} jalur fiber`, `${data.nodes_skipped + data.links_skipped} duplikat dilewati`];
      if (data.errors?.length) parts.push(`${data.errors.length} error`);
      toast(`Impor selesai — ${parts.join(', ')}`, data.errors?.length ? 'warning' : 'success');
      setImportReport(data);
      await load();
    } catch (err) {
      toast(err.response?.data?.message || 'Impor file peta gagal', 'danger');
    } finally { setImporting(false); }
  };

  const cancelInteraction = () => {
    setPicking(false);
    setMovingId(null);
    setLinking(false);
    setLinkDrawing(false);
    setLinkPoints([]);
    setLinkWaypoints([]);
    setLinkCursor(null);
    setDraft(null);
  };

  const cancelPositionEdit = () => {
    setMovingId(null);
    toast('Edit posisi dibatalkan', 'info');
  };

  const cancelLinkDrawing = () => {
    setLinking(false);
    setLinkDrawing(false);
    setLinkPoints([]);
    setLinkWaypoints([]);
    setLinkCursor(null);
  };

  const cancelActiveMode = () => {
    if (linking || linkDrawing) cancelLinkDrawing();
    else if (movingId != null) cancelPositionEdit();
    else cancelInteraction();
  };


  // Sumber dropdown (pelanggan & perangkat) dimuat sekali saat pertama dibutuhkan
  const ensureSources = useCallback(async () => {
    if (sources) return;
    try {
      const { data } = await api.get('/mapping/sources');
      setSources(data);
    } catch {
      setSources({ customers: [], devices: [] });
    }
  }, [sources]);

  const deviceCounts = useMemo(() => rows.reduce((counts, row) => {
    if (Object.hasOwn(counts, row.marker_type)) counts[row.marker_type] += 1;
    return counts;
  }, { router: 0, odc: 0, odp: 0, customer: 0 }), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (deviceGroup !== 'all' && r.marker_type !== deviceGroup) return false;
      if (filter === 'online' && r.device_status !== 'online') return false;
      if (filter === 'offline' && r.device_status !== 'offline') return false;
      if (filter === 'nodevice' && r.device_status) return false;
      // Filter redaman — konsisten dengan warna pin (Hijau/Kuning/Merah)
      if (filter === 'bagus' && attLevel(r.rx_power) !== 'bagus') return false;
      if (filter === 'sedang' && attLevel(r.rx_power) !== 'sedang') return false;
      if (filter === 'buruk' && attLevel(r.rx_power) !== 'buruk') return false;
      if (!s) return true;
      return [r.name, r.customer_name, r.pppoe_username, r.serial, r.address, r.note]
        .some((v) => String(v || '').toLowerCase().includes(s));
    });
  }, [rows, search, filter, deviceGroup]);

  // Daftar dikelompokkan mengikuti tipe titik; ODP dipecah lagi berdasarkan rasio splitter.
  const groupedRows = useMemo(() => {
    const groups = new Map();
    const order = { router: 0, odc: 1, odp: 2, customer: 3 };
    filtered
      .slice()
      .sort((a, b) => (order[a.marker_type] ?? 9) - (order[b.marker_type] ?? 9) || String(a.name || '').localeCompare(String(b.name || '')))
      .forEach((row) => {
        const key = row.marker_type === 'odp' ? `odp:${row.splitter || 'none'}` : row.marker_type;
        if (!groups.has(key)) groups.set(key, { key, type: row.marker_type, splitter: row.splitter, rows: [] });
        groups.get(key).rows.push(row);
      });
    return [...groups.values()];
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);
  const pagedGroups = useMemo(() => {
    const visible = new Set(pagedRows.map((row) => row.id));
    return groupedRows.map((group) => ({ ...group, rows: group.rows.filter((row) => visible.has(row.id)) })).filter((group) => group.rows.length);
  }, [groupedRows, pagedRows]);
  useEffect(() => { setPage(1); }, [search, filter, deviceGroup]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const center = useMemo(() => {
    const s = rows.find((r) => r.marker_type === 'router') || rows[0];
    if (s) return [Number(s.latitude), Number(s.longitude)];
    return [-6.914741, 107.609810]; // default: Bandung (dipakai sebelum data termuat)
  }, [rows]);

  const openCreate = (markerType) => {
    setForm({ ...EMPTY_FORM, marker_type: markerType });
    setEditId(null);
    setDraft(null);
    setLinking(false);
    setLinkDrawing(false);
    setLinkPoints([]);
    setLinkWaypoints([]);
    setPicking(true);
    ensureSources();
      toast(`Klik lokasi di peta untuk menempatkan ${markerType === 'customer' ? 'ONT' : markerType === 'poi' ? 'POI' : markerType.toUpperCase()}`, 'info');
  };

  const openCreateLink = () => {
    setPicking(false);
    setMovingId(null);
    setLinkPoints([]);
    setLinkWaypoints([]);
    setLinkCursor(null);
    setLinkForm({ ...EMPTY_LINK_FORM });
    setLinking(true);
    toast('Klik titik awal lalu titik tujuan kabel', 'info');
  };

  const handlePick = (latlng) => {
    setDraft({ lat: latlng.lat, lng: latlng.lng });
    setForm((f) => ({ ...f, latitude: latlng.lat.toFixed(6), longitude: latlng.lng.toFixed(6) }));
    setShowForm(true);
    setPicking(false);
  };

  const handleCoordinateChange = (key, value) => {
    const next = { ...form, [key]: value };
    const lat = parseCoordinate(next.latitude, 'latitude');
    const lng = parseCoordinate(next.longitude, 'longitude');
    setDraft(lat != null && lng != null ? { lat, lng } : null);
    setForm(next);
  };

  const startCoordinateEntry = (markerType = 'customer') => {
    setForm({ ...EMPTY_FORM, marker_type: markerType });
    setEditId(null);
    setDraft(null);
    setPicking(false);
    setShowForm(true);
    setLinking(false);
    setLinkDrawing(false);
    setMovingId(null);
    ensureSources();
  };

  const openEdit = (row) => {
    setForm({
      name: row.name || '',
      marker_type: row.marker_type || 'customer',
      customer_id: row.customer_id ? String(row.customer_id) : '',
      device_id: '',
      latitude: Number(row.latitude).toFixed(6),
      longitude: Number(row.longitude).toFixed(6),
      address: row.address || row.customer_address || '',
      note: row.note || '',
      capacity: row.capacity || '',
      splitter: row.splitter || '',
    });
    setEditId(row.id);
    setPicking(false);
    setShowForm(true);
    // Isi ulang pilihan perangkat setelah daftar sumber termuat
    ensureSources().then(() => {
      setSources((src) => {
        if (src?.devices?.length && row.genieacs_device_id) {
          const dev = src.devices.find((d) => d.genieacs_device_id === row.genieacs_device_id);
          if (dev) setForm((f) => ({ ...f, device_id: String(dev.id) }));
        }
        return src;
      });
    });
  };

  const save = async () => {
    const latitude = parseCoordinate(form.latitude, 'latitude');
    const longitude = parseCoordinate(form.longitude, 'longitude');
    if (latitude == null) {
      toast('Latitude tidak valid (-90 s/d 90)', 'danger');
      return;
    }
    if (longitude == null) {
      toast('Longitude tidak valid (-180 s/d 180)', 'danger');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, latitude, longitude };
      if (editId) await api.put(`/mapping/${editId}`, payload);
      else await api.post('/mapping', payload);
      toast(editId ? 'Titik peta diperbarui' : 'Titik peta tersimpan', 'success');
      setShowForm(false);
      setDraft(null);
      setPicking(false);
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan titik', 'danger');
    } finally { setSaving(false); }
  };

  const remove = async (row) => {
    if (!(await confirm({
      title: 'Hapus Titik Peta',
      message: `Titik "${row.name}" akan dihapus dari peta. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    try {
      await api.delete(`/mapping/${row.id}`);
      toast('Titik peta dihapus', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menghapus titik', 'danger');
    }
  };

  // Sinkron perangkat dari GenieACS (pola tombol Sinkron halaman Perangkat ONT)
  const syncGenieacs = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await syncDevices(api);
      toast(`${data.synced} perangkat tersinkron via GenieACS — status peta diperbarui`, 'success');
      await load().catch(() => toast('Sinkronisasi selesai, tetapi peta gagal dimuat ulang. Segarkan halaman.', 'warning'));
    } catch (err) {
      toast(deviceSyncError(err), 'danger');
    } finally { setBusy(false); }
  };

  // Buat titik otomatis dari seluruh pelanggan berkoordinat
  const importCustomers = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/mapping/import-customers');
      toast(data.created ? `${data.created} titik pelanggan dibuat dari koordinat terdaftar`
        : 'Semua pelanggan berkoordinat sudah dipetakan', data.created ? 'success' : 'info');
      await load();
    } catch (err) {
      toast(err.response?.data?.message || 'Impor titik pelanggan gagal', 'danger');
    } finally { setBusy(false); }
  };

  const focus = (row) => setTarget({ lat: Number(row.latitude), lng: Number(row.longitude), key: Date.now() });

  const pickLinkPoint = (row) => {
    if (!linking && !linkDrawing) return;
    const usedSlots = links.filter((link) => link.source_id === row.id).length;
    if (!linkPoints.length && row.marker_type === 'odp' && Number(row.capacity) > 0 && usedSlots >= Number(row.capacity)) {
      toast(`Slot ODP "${row.name}" sudah penuh`, 'warning');
      return;
    }
    if (!linkPoints.length) {
      setLinkPoints([row]);
      setLinking(false);
      setLinkDrawing(true);
      setLinkCursor([Number(row.latitude), Number(row.longitude)]);
      toast(`Titik awal: ${row.name}. Klik peta untuk belokan, lalu klik titik tujuan`, 'info');
      return;
    }
    if (linkPoints[0].id === row.id) {
      toast('Pilih titik tujuan yang berbeda', 'warning');
      return;
    }
    setLinkPoints([linkPoints[0], row]);
    setLinkCursor(null);
    setLinkDrawing(false);
    setShowLinkForm(true);
  };

  const addLinkWaypoint = (latlng) => {
    setLinkWaypoints((points) => [...points, [Number(latlng.lat.toFixed(7)), Number(latlng.lng.toFixed(7))]]);
  };

  const moveLinkCursor = (latlng) => setLinkCursor([Number(latlng.lat.toFixed(7)), Number(latlng.lng.toFixed(7))]);

  const moveLinkWaypoint = (index, latlng) => {
    setLinkWaypoints((points) => points.map((point, i) => i === index
      ? [Number(latlng.lat.toFixed(7)), Number(latlng.lng.toFixed(7))] : point));
  };

  const removeLastLinkWaypoint = () => setLinkWaypoints((points) => points.slice(0, -1));

  const removeLink = async (link) => {
    if (!(await confirm({
      title: 'Hapus Kabel / Line',
      message: `Kabel "${link.s_name} → ${link.t_name}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    try {
      await api.delete(`/mapping/links/${link.id}`);
      toast('Kabel / line dihapus', 'success');
      setLinks((items) => items.filter((item) => item.id !== link.id));
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menghapus kabel / line', 'danger');
    }
  };

  const saveLink = async () => {
    const waypoints = [
      [Number(linkPoints[0].latitude), Number(linkPoints[0].longitude)],
      ...linkWaypoints,
      [Number(linkPoints[1].latitude), Number(linkPoints[1].longitude)],
    ];
    setLinkSaving(true);
    try {
      await api.post('/mapping/links', {
        ...linkForm,
        distance: pathDistanceMeters(waypoints).toFixed(2),
        source_id: linkPoints[0].id,
        target_id: linkPoints[1].id,
        waypoints,
      });
      toast('Kabel / line berhasil ditambahkan', 'success');
      setShowLinkForm(false);
      setLinkPoints([]);
      setLinkWaypoints([]);
      setLinkCursor(null);
      await load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menambahkan kabel', 'danger');
    } finally { setLinkSaving(false); }
  };

  const editPosition = (row) => {
    setMovingId(row.id);
    toast('Marker aktif — geser ke lokasi baru lalu lepas', 'info');
  };

  // Geser marker hanya setelah Edit posisi ditekan → simpan lalu kunci kembali
  const onDragEnd = async (row, e) => {
    const { lat, lng } = e.target.getLatLng();
    try {
      await api.put(`/mapping/${row.id}`, { latitude: lat, longitude: lng });
      toast('Koordinat titik diperbarui', 'success');
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, latitude: lat, longitude: lng } : r)));
      await load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menggeser titik', 'danger');
      load();
    } finally {
      setMovingId(null);
    }
  };

  const tileUrl = basemap === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = basemap === 'satellite'
    ? 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return (
    <div>
      <PageHeader
        title="Mapping Jaringan"
        subtitle="Peta titik pelanggan WiFi & perangkat — status live terintegrasi GenieACS (PRD 5.6)"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="info" onClick={syncGenieacs} disabled={busy} title="Sinkron status ONT dari GenieACS">
              <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Sinkron GenieACS
            </Button>
            {can('mapping', 'create') && (
              <Button variant="violet" onClick={() => importRef.current?.click()} disabled={importing} title="Impor file JSON peta (format network-map: nodes + jalur fiber)">
                <FileUp size={15} className={importing ? 'animate-pulse' : ''} /> {importing ? 'Mengimpor…' : 'Impor JSON'}
              </Button>
            )}
            {can('mapping', 'create') && (
              <Button variant="warning" onClick={importCustomers} disabled={busy} title="Buat titik dari semua pelanggan berkoordinat">
                <Download size={15} /> Impor Koordinat
              </Button>
            )}
            {can('mapping', 'create') && (
              <>
                <Button variant="success" onClick={() => openCreate('customer')}><RouterIcon size={15} /> Add ONT</Button>
                <Button variant="info" onClick={() => openCreate('odc')}><Box size={15} /> Add ODC</Button>
                <Button variant="cyan" onClick={() => openCreate('odp')}><Network size={15} /> Add ODP</Button>
                <Button onClick={openCreateLink}><Cable size={15} /> Add Kabel / Line</Button>
              </>
            )}
          </div>
        }
      />

      {/* Input file tersembunyi untuk impor JSON peta */}
      <input ref={importRef} type="file" accept=".json,application/json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importJson(f); }} />

      {/* Kelompok perangkat — klik widget untuk menyaring marker dan daftar. */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={RouterIcon} label="Server / OLT" value={deviceCounts.router} sub="Node pusat jaringan" color="bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" onClick={() => setDeviceGroup('router')} title="Tampilkan Server / OLT" />
        <StatCard icon={Box} label="Kabinet ODC" value={deviceCounts.odc} sub="Titik distribusi feeder" color="bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" onClick={() => setDeviceGroup('odc')} title="Tampilkan kabinet ODC" />
        <StatCard icon={Cable} label="Box ODP" value={deviceCounts.odp} sub="Titik distribusi pelanggan" color="bg-cyan-100 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400" onClick={() => setDeviceGroup('odp')} title="Tampilkan box ODP" />
        <StatCard icon={Wifi} label="Perangkat ONT" value={deviceCounts.customer} sub={`${stats.online} online · ${stats.offline} offline`} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" onClick={() => setDeviceGroup('customer')} title="Tampilkan perangkat ONT" />
      </div>

      {/* Toolbar: pencarian, filter status, basemap */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cari nama pelanggan, serial, alamat…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" value={deviceGroup} onChange={(e) => setDeviceGroup(e.target.value)} aria-label="Kelompok perangkat">
            <option value="all">Semua Perangkat</option>
            <option value="router">Server / OLT</option>
            <option value="odc">Kabinet ODC</option>
            <option value="odp">Box ODP</option>
            <option value="customer">Perangkat ONT</option>
          </select>
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter status">
            <option value="all">Semua Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="nodevice">Tanpa Perangkat</option>
            <option value="bagus">Redaman Bagus (Hijau)</option>
            <option value="sedang">Redaman Sedang (Kuning)</option>
            <option value="buruk">Redaman Buruk (Merah)</option>
          </select>
          {selectedLinkId != null && (
            <Button variant="outline" onClick={() => setSelectedLinkId(null)} title="Tampilkan kembali semua kabel fiber">
              <Cable size={15} /> Tampilkan Semua Kabel
            </Button>
          )}
          <div className="flex items-center gap-1 rounded-xl border border-border bg-secondary p-1">
            <button type="button" onClick={() => setBasemap('standard')} title="OpenStreetMap: tampilkan nama jalan dan lokasi"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${basemap === 'standard' ? 'bg-primary text-primary-foreground shadow' : 'text-muted hover:text-foreground'}`}>
              <Layers size={13} /> Jalan & Lokasi
            </button>
            <button type="button" onClick={() => setBasemap('satellite')} title="Citra satelit dengan jalan dan nama lokasi"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${basemap === 'satellite' ? 'bg-primary text-primary-foreground shadow' : 'text-muted hover:text-foreground'}`}>
              <MapPin size={13} /> Satelit
            </button>
          </div>
        </div>
      </Card>

      {/* Peta interaktif */}
      <Card className="mb-4 !p-0 overflow-hidden">
        <div className="relative h-[520px] w-full lg:h-[720px]">
          <MapContainer ref={mapRef} center={center} zoom={14} minZoom={3} maxZoom={22} scrollWheelZoom className="h-full w-full z-0">
            <TileLayer key={basemap} url={tileUrl} attribution={tileAttribution} maxNativeZoom={19} maxZoom={22} />
            {basemap === 'satellite' && (
              <>
                <TileLayer
                  url="https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png"
                  attribution="&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors &copy; <a href=\"https://carto.com/attributions\">CARTO</a>"
                  maxNativeZoom={22}
                  maxZoom={22}
                />
              </>
            )}
            <MapClickHandler picking={picking} onPick={handlePick} drawingLink={linkDrawing} onLinkPoint={addLinkWaypoint} onLinkMove={moveLinkCursor} />
            <Flyer target={target} />
            {linkPoints.length > 0 && (
              <>
                {(linkWaypoints.length > 0 || linkPoints[1]) && (
                  <Polyline positions={[
                    [Number(linkPoints[0].latitude), Number(linkPoints[0].longitude)],
                    ...linkWaypoints,
                    ...(linkPoints[1] ? [[Number(linkPoints[1].latitude), Number(linkPoints[1].longitude)]] : []),
                  ]} pathOptions={{ color: FIBER_COLORS[linkForm.fiber_type], weight: 4, opacity: 0.9 }} />
                )}
                {linkDrawing && linkCursor && (
                  <Polyline positions={[
                    linkWaypoints.at(-1) || [Number(linkPoints[0].latitude), Number(linkPoints[0].longitude)], linkCursor,
                  ]} pathOptions={{ color: FIBER_COLORS[linkForm.fiber_type], weight: 4, opacity: 0.75, dashArray: '6 6' }} />
                )}
                {linkWaypoints.map((point, index) => (
                  <Marker key={`link-waypoint-${index}`} position={point} icon={WAYPOINT_ICON} draggable
                    eventHandlers={{ dragend: (e) => moveLinkWaypoint(index, e.target.getLatLng()) }} />
                ))}
              </>
            )}
            {/* Jalur fiber hasil impor file peta — hanya tampil bila kedua ujungnya terlihat */}
            {(() => {
              const visible = new Set(filtered.map((r) => r.id));
              const displayedLinks = selectedLinkId == null
                ? links
                : links.filter((l) => l.id === selectedLinkId);
              return displayedLinks.filter((l) => visible.has(l.source_id) && visible.has(l.target_id)).map((l) => {
                let path = [];
                try {
                  const wp = typeof l.waypoints === 'string' ? JSON.parse(l.waypoints) : l.waypoints;
                  if (Array.isArray(wp) && wp.length > 1) path = wp.map((p) => [Number(p[0]), Number(p[1])]);
                } catch { /* fallback garis lurus */ }
                const source = [Number(l.s_lat), Number(l.s_lng)];
                const target = [Number(l.t_lat), Number(l.t_lng)];
                if (path.length >= 2) path = [source, ...path.slice(1, -1), target];
                else path = [source, target];
                if (path.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
                return (
                  <Polyline key={`link-${l.id}`} positions={path}
                    eventHandlers={{ click: () => setSelectedLinkId(l.id) }}
                    pathOptions={{
                      color: FIBER_COLORS[l.fiber_type] || '#94a3b8',
                      weight: selectedLinkId === l.id ? 7 : 4,
                      opacity: selectedLinkId === l.id ? 1 : 0.85,
                      dashArray: l.fiber_type === 'drop' ? '6 6' : null,
                    }}>
                    <Popup>
                      <div className="space-y-1 text-[12px]">
                        <p className="font-bold text-slate-800 dark:text-white">{TYPE_LABEL[l.fiber_type] || l.fiber_type}</p>
                        <p className="text-slate-500 dark:text-slate-400">{l.s_name} → {l.t_name}</p>
                        {l.distance != null && <p className="text-slate-500 dark:text-slate-400">Jarak: <b>{Math.round(l.distance)} m</b></p>}
                        {l.notes && <p className="text-slate-500 dark:text-slate-400">{l.notes}</p>}
                        {can('mapping', 'delete') && (
                          <Button size="sm" variant="ghost" onClick={() => removeLink(l)}>
                            <Trash2 size={12} className="text-accent-red" /> Hapus line
                          </Button>
                        )}
                      </div>
                    </Popup>
                  </Polyline>
                );
              });
            })()}
            {filtered.map((row) => (
              <Marker key={`${row.id}-${Number(row.latitude).toFixed(6)}`} position={[Number(row.latitude), Number(row.longitude)]}
                icon={makePin(row, movingId === row.id, row.marker_type === 'router')} draggable={movingId === row.id}
                eventHandlers={{
                  dragend: (e) => onDragEnd(row, e),
                  click: (e) => {
                    if (linking || linkDrawing) {
                      L.DomEvent.stopPropagation(e.originalEvent);
                      e.target.closePopup();
                      pickLinkPoint(row);
                    }
                  },
                }}>
                <Popup>
                  <PointPopup row={row} links={links} onEdit={openEdit} onEditPosition={editPosition} onDelete={remove}
                    canEdit={can('mapping', 'edit')} canDelete={can('mapping', 'delete')} moving={movingId === row.id} />
                </Popup>
              </Marker>
            ))}
            {/* Pratinjau titik draft saat memilih lokasi */}
            {draft && (
              <Marker position={[draft.lat, draft.lng]} icon={makePin({ marker_type: 'customer' }, false, false)} />
            )}
          </MapContainer>
          {(picking || movingId != null || linking || linkDrawing) && (
            <div className="absolute inset-x-0 top-3 z-[500] flex justify-center gap-2 px-3">
              <span className="pointer-events-none rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-lift">
                {picking
                  ? `Mode Add ${form.marker_type === 'customer' ? 'ONT' : form.marker_type.toUpperCase()} — klik lokasi pada peta`
                  : linking
                    ? `Mode Add Kabel — ${linkPoints.length ? `titik awal ${linkPoints[0].name}, pilih tujuan` : 'pilih titik awal'}`
                    : linkDrawing
                      ? `Gambar fiber — klik peta tambah titik, lalu klik perangkat tujuan · ${linkDistance.toFixed(2)} m`
                      : 'Mode Edit Posisi aktif — geser marker bercincin kuning lalu lepas'}
              </span>
              {linkDrawing && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={removeLastLinkWaypoint} disabled={!linkWaypoints.length}>Hapus titik</Button>
                  <Button size="sm" variant="danger" onClick={cancelLinkDrawing}>Batal</Button>
                </div>
              )}
              {(picking || movingId != null || linking) && (
                <Button size="sm" variant="danger" onClick={cancelActiveMode}>Batal</Button>
              )}
            </div>
          )}
          {rows.length === 0 && !loading && (
            <div className="absolute inset-x-0 top-16 z-[500] flex justify-center px-4">
              <div className="max-w-sm rounded-2xl border border-border bg-card/95 p-4 text-center shadow-lift backdrop-blur">
                <p className="text-sm font-bold">Belum ada titik terpetakan</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Gunakan <b>Tambah Titik</b> lalu klik lokasi di peta, atau <b>Impor Koordinat</b> dari data pelanggan.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Daftar titik */}
      <Card>
        <div className="border-b border-slate-100 dark:border-navy-700">
          <div className="flex items-center justify-between px-1 pb-2">
            <h2 className="font-bold">Daftar Titik ({filtered.length})</h2>
            <Button size="sm" variant="ghost" onClick={load}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Muat ulang
            </Button>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {[['all', 'Semua', rows.length], ['customer', 'Perangkat ONT', deviceCounts.customer], ['odp', 'Perangkat ODP', deviceCounts.odp], ['odc', 'Perangkat ODC', deviceCounts.odc], ['router', 'Server / OLT', deviceCounts.router]].map(([value, label, count]) => (
              <button key={value} type="button" onClick={() => setDeviceGroup(value)}
                className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${deviceGroup === value ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-foreground'}`}>
                {label} <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-navy-700">{count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200/60 dark:border-navy-700">
                <th className="py-2">Titik</th>
                <th>Pelanggan</th>
                <th>Perangkat ONT</th>
                <th>Status</th>
                <th>Redaman</th>
                <th>Koordinat</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
              {pagedGroups.flatMap((group) => [
                <tr key={`${group.key}-header`} className="bg-slate-50/80 dark:bg-navy-800/60">
                  <td colSpan="7" className="border-y border-border py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    {group.type === 'router' ? 'Server / OLT' : group.type === 'odc' ? 'ODC / Kabinet' : group.type === 'odp' ? `ODP / Splitter${group.splitter ? ` · ${group.splitter}` : ' · Rasio belum ditentukan'}` : group.type === 'poi' ? 'POI / Lokasi' : 'ONT / Pelanggan'}
                    <span className="ml-2 font-normal normal-case text-slate-400">({group.rows.length} titik)</span>
                  </td>
                </tr>,
                ...group.rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
                  <td className="py-2.5">
                    <p className="flex items-center gap-2 font-semibold">
                      {row.marker_type === 'router' ? <RouterIcon size={14} className="text-accent-purple" />
                        : row.marker_type === 'odc' ? <Network size={14} className="text-accent-blue" />
                        : row.marker_type === 'odp' ? <Cable size={14} className="text-accent-blue" />
                        : <MapPin size={14} className="text-accent-blue" />}
                      {row.name}
                    </p>
                    <p className="mt-0.5 pl-6 text-[11px] text-slate-400">
                      {TYPE_LABEL[row.marker_type] || row.marker_type}
                      {(row.marker_type === 'odp' || row.marker_type === 'odc') && row.capacity ? ` · ${row.capacity} port${row.splitter ? ` ${row.splitter}` : ''}` : ''}
                    </p>
                  </td>
                  <td>
                    <p className="font-medium">{row.customer_name || '-'}</p>
                    <p className="text-[11px] text-slate-400">{row.package_name || row.pppoe_username || ''}</p>
                  </td>
                  <td className="text-xs font-mono">{row.serial ? `${row.model || ''} ${row.serial}`.trim() : <span className="text-slate-400">—</span>}</td>
                  <td>
                    {row.device_status
                      ? <Badge value={row.device_status} label={row.device_status === 'online' ? 'Online' : 'Offline'} />
                      : <span className="text-xs text-slate-400">Tanpa perangkat</span>}
                  </td>
                  <td><RxPowerValue value={row.rx_power} decimals={2} /></td>
                  <td className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Fokus di peta" onClick={() => focus(row)}><Focus size={13} /></Button>
                      {can('mapping', 'edit') && (
                        <Button size="sm" variant="ghost" title={movingId === row.id ? 'Geser marker lalu lepas' : 'Edit posisi'}
                          onClick={() => editPosition(row)} disabled={movingId === row.id}><Move size={13} /></Button>
                      )}
                      {can('mapping', 'edit') && <Button size="sm" variant="ghost" title="Ubah data" onClick={() => openEdit(row)}><Pencil size={13} /></Button>}
                      {can('mapping', 'delete') && <Button size="sm" variant="ghost" title="Hapus" onClick={() => remove(row)}><Trash2 size={13} className="text-accent-red" /></Button>}
                    </div>
                  </td>
                </tr>
                )),
              ])}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <Empty text={rows.length === 0 ? 'Belum ada titik — petakan yang pertama dari peta di atas' : 'Tidak ada titik yang cocok dengan filter'} />
          )}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-1 pt-3 text-xs text-slate-500">
              <span>Menampilkan {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} dari {filtered.length}</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
                <span className="px-2 font-semibold text-foreground">{page} / {totalPages}</span>
                <Button size="sm" variant="ghost" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <PointForm open={showForm} onClose={() => { setShowForm(false); setDraft(null); }} form={form} setForm={setForm}
        sources={sources} rows={rows} editId={editId} onSave={save} saving={saving} onCoordinateEntry={() => startCoordinateEntry(form.marker_type)} />

      <Modal open={showLinkForm} onClose={() => { setShowLinkForm(false); setLinkPoints([]); setLinkWaypoints([]); setLinkCursor(null); }} title="Add Kabel / Line" className="max-w-lg">
        {linkPoints.length === 2 && (
          <form onSubmit={(e) => { e.preventDefault(); saveLink(); }} className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-navy-700/60">
              <span className="font-semibold">{linkPoints[0].name}</span>
              <span className="mx-2 text-slate-400">→</span>
              <span className="font-semibold">{linkPoints[1].name}</span>
            </div>
            <div>
              <label className="label">Jenis Kabel *</label>
              <select className="input" value={linkForm.fiber_type}
                onChange={(e) => setLinkForm((f) => ({ ...f, fiber_type: e.target.value }))}>
                <option value="drop">Drop Fiber</option>
                <option value="distribution">Kabel Distribusi</option>
                <option value="odp_to_odp">ODP → ODP</option>
                <option value="feeder">Feeder</option>
              </select>
            </div>
            <div>
              <label className="label">Jarak Jalur Otomatis</label>
              <output className="input flex items-center bg-secondary font-mono" aria-live="polite">
                {linkDistance.toFixed(2)} m
              </output>
              <p className="mt-1 text-[11px] text-slate-400">Haversine dari setiap segmen, termasuk titik belok.</p>
            </div>
            <div>
              <label className="label">Catatan</label>
              <input className="input" maxLength={255} placeholder="Opsional — jenis/core kabel atau patokan jalur"
                value={linkForm.notes} onChange={(e) => setLinkForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => { setShowLinkForm(false); setLinkPoints([]); setLinkWaypoints([]); setLinkCursor(null); }}>Batal</Button>
              <Button type="submit" disabled={linkSaving}><Cable size={14} /> {linkSaving ? 'Menyimpan…' : 'Simpan Kabel'}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Laporan hasil impor JSON peta */}
      <Modal open={!!importReport} onClose={() => setImportReport(null)} title="Hasil Impor Peta" className="max-w-lg">
        {importReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importReport.nodes_created}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Titik dibuat</p>
              </div>
              <div className="rounded-xl bg-indigo-50 dark:bg-indigo-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{importReport.links_created}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Jalur fiber dibuat</p>
              </div>
              <div className="rounded-xl bg-slate-100 dark:bg-navy-700 p-3 text-center">
                <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{importReport.nodes_skipped + importReport.links_skipped}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Duplikat dilewati</p>
              </div>
              <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{importReport.errors?.length || 0}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Error</p>
              </div>
            </div>
            {(importReport.errors?.length || 0) > 0 && (
              <div>
                <p className="label">Catatan error</p>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-secondary p-2 text-xs space-y-1">
                  {importReport.errors.map((e, i) => <p key={i} className="text-accent-red">• {e}</p>)}
                </div>
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Impor bersifat idempoten — file yang sama diimpor ulang tidak akan menduplikasi titik.
              Titik ONT otomatis terhubung ke data pelanggan & perangkat GenieACS via username PPPoE.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setImportReport(null)}>Selesai</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}