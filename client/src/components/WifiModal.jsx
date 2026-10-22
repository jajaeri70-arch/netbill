import { useEffect, useRef, useState } from 'react';
import { Wifi, Eye, EyeOff, Info, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Button, Badge } from './ui.jsx';

/** Batas karakter sesuai standar WiFi (IEEE 802.11 / WPA2) */
const SSID_MAX = 32;
const PASS_MIN = 8;
const PASS_MAX = 63;

/**
 * Modal "Ganti WiFi" bersama — dipakai halaman Perangkat, Detail Pelanggan, dan Setting ONT
 * agar UX & validasi konsisten. Mengirim perintah TR-069 (setParameterValues) ke ONT via GenieACS.
 *
 * Props:
 *  - open, onClose       : kendali modal
 *  - device              : baris perangkat { id, model, serial, status, ssid, customer_name?, customer_code? }
 *  - onSaved             : dipanggil setelah konfigurasi terkirim (penutupan + refresh ditangani pemanggil)
 *  - wlans               : opsional — daftar WLAN dari GenieACS (bila sudah tersedia, mis. di Setting ONT);
 *                          bila tidak diberikan, daftar diambil otomatis dari /devices/:id/detail (best-effort)
 *  - defaultPath         : opsional — path WLANConfiguration yang terpilih saat modal dibuka
 */
export default function WifiModal({ open, device, onClose, onSaved, wlans = null, defaultPath = '' }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ path: '', ssid: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(Array.isArray(wlans) ? wlans : []);
  const [loadingList, setLoadingList] = useState(false);
  const sigRef = useRef('');

  const propList = Array.isArray(wlans) ? wlans : null;

  // Muat daftar WLAN dari GenieACS (best-effort) bila tidak diberikan lewat prop —
  // gagal dimuat tidak fatal: form tetap memakai WLANConfiguration.1 default server.
  useEffect(() => {
    if (!open || !device || propList) return undefined;
    let cancelled = false;
    setLoadingList(true);
    api.get(`/devices/${device.id}/detail`)
      .then(({ data }) => {
        if (cancelled) return;
        const wl = data.detail?.wlan || [];
        setList(wl);
        // Targetkan tepat satu-satunya WLAN yang diekspos ONT (bisa berbeda dari default WLAN 1)
        if (wl.length === 1) {
          setForm((f) => (f.path ? f : { ...f, path: wl[0].base_path, ssid: f.ssid || wl[0].ssid || '' }));
        }
      })
      .catch(() => { if (!cancelled) setList([]); })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [open, device, propList]);

  // Reset form setiap kali modal dibuka / perangkat atau WLAN terpilih berubah
  // (dijaga lewat signature agar mengetik tidak ter-reset saat parent me-render ulang)
  useEffect(() => {
    const sig = `${open ? device?.id || '' : ''}|${defaultPath}`;
    if (!open || !device) { sigRef.current = ''; return; }
    if (sigRef.current === sig) return;
    sigRef.current = sig;
    setShowPass(false);
    setBusy(false);
    const initialPath = defaultPath || (propList?.length === 1 ? propList[0].base_path : '');
    const initialSsid = propList?.find((w) => w.base_path === initialPath)?.ssid ?? device.ssid ?? '';
    setForm({ path: initialPath, ssid: initialSsid, password: '' });
  }, [open, device, defaultPath, propList]);

  if (!open || !device) return null;

  const ssid = form.ssid.trim();
  const errors = {
    ssid: !ssid
      ? 'SSID wajib diisi'
      : ssid.length > SSID_MAX ? `SSID maksimal ${SSID_MAX} karakter` : null,
    password: !form.password
      ? 'Password WiFi wajib diisi'
      : form.password.length < PASS_MIN
        ? `Minimal ${PASS_MIN} karakter`
        : form.password.length > PASS_MAX ? `Maksimal ${PASS_MAX} karakter` : null,
  };
  const invalid = Boolean(errors.ssid || errors.password);
  const selected = list.find((w) => w.base_path === form.path) || null;
  const offline = String(device.status || '').toLowerCase() !== 'online';

  const pickWlan = (w) => setForm((f) => ({ ...f, path: w.base_path, ssid: w.ssid || '' }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy || invalid) return;
    setBusy(true);
    try {
      await api.post(`/devices/${device.id}/wifi`, {
        ssid,
        password: form.password,
        path: form.path || undefined,
      });
      toast(`Konfigurasi WiFi "${ssid}" dikirim via TR-069`, 'success');
      onSaved?.();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal mengubah WiFi', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Ganti WiFi — ${device.model || 'Perangkat'}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {/* Konteks perangkat */}
        <div className="rounded-xl border border-slate-200/60 dark:border-navy-700 p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-blue/15 text-accent-blue flex items-center justify-center shrink-0">
            <Wifi size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {device.model || 'Perangkat'}
              <span className="ml-2 font-mono text-xs font-normal text-slate-400">{device.serial || '-'}</span>
            </p>
            <p className="text-xs text-slate-400 truncate">
              {device.customer_name && <>{device.customer_name}{device.customer_code ? ` (${device.customer_code})` : ''} · </>}
              SSID saat ini: <span className="font-medium">{selected?.ssid || device.ssid || '-'}</span>
            </p>
          </div>
          <Badge value={device.status} label={offline ? 'Offline' : 'Online'} />
        </div>

        {offline && (
          <div className="rounded-xl border border-accent-orange/30 bg-accent-orange/10 text-accent-orange px-3 py-2.5 flex items-start gap-2 text-xs">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Perangkat sedang offline — perintah akan masuk antrean GenieACS dan dieksekusi saat ONT kembali online.</span>
          </div>
        )}

        {/* Pemilihan band/WLAN (hanya bila ONT mengekspos lebih dari satu) */}
        {(list.length > 1 || loadingList) && (
          <div>
            <p className="label">Jaringan WiFi</p>
            <div className="flex flex-wrap items-center gap-2">
              {list.map((w) => {
                const on = form.path ? w.base_path === form.path : w.index === 1;
                return (
                  <button
                    key={w.base_path}
                    type="button"
                    onClick={() => pickWlan(w)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${on
                      ? 'bg-accent-blue/10 border-accent-blue text-accent-blue'
                      : 'border-slate-200/60 dark:border-navy-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                  >
                    WLAN {w.index}{w.ssid ? ` — ${w.ssid}` : ''}
                  </button>
                );
              })}
              {loadingList && <span className="text-xs text-slate-400">Memuat daftar WLAN…</span>}
            </div>
          </div>
        )}
        {/* SSID */}
        <div>
          <label className="label" htmlFor="wifi-ssid">SSID</label>
          <input
            id="wifi-ssid"
            className="input"
            value={form.ssid}
            onChange={(e) => setForm({ ...form, ssid: e.target.value })}
            maxLength={SSID_MAX}
            placeholder="Nama WiFi"
            autoFocus
          />
          <div className="flex items-start justify-between gap-2 mt-1">
            <p className="text-[11px] text-accent-red">{errors.ssid || ''}</p>
            <p className="text-[11px] text-slate-400 ml-auto shrink-0">{ssid.length}/{SSID_MAX}</p>
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="label" htmlFor="wifi-password">Password WiFi (min {PASS_MIN}, maks {PASS_MAX} karakter)</label>
          <div className="relative">
            <input
              id="wifi-password"
              className="input pr-10"
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              maxLength={PASS_MAX}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
              onClick={() => setShowPass((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="flex items-start justify-between gap-2 mt-1">
            <p className="text-[11px] text-accent-red">{errors.password || ''}</p>
            <p className="text-[11px] text-slate-400 ml-auto shrink-0">{form.password.length}/{PASS_MAX}</p>
          </div>
        </div>

        {/* Info konsekuensi TR-069 */}
        <div className="rounded-xl border border-accent-blue/25 bg-accent-blue/10 text-accent-blue px-3 py-2.5 flex items-start gap-2 text-xs">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>Perintah dikirim via TR-069 (setParameterValues). Perangkat yang tersambung ke WiFi ini akan terputus sesaat dan wajib memasukkan kredensial baru.</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" disabled={busy || invalid}>
            {busy
              ? <><Loader2 size={14} className="animate-spin" /> Mengirim…</>
              : <><Wifi size={14} /> Terapkan via TR-069</>}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

