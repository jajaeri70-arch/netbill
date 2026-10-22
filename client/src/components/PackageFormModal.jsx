import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Server, Wifi, Info, AlertTriangle, Wallet, SlidersHorizontal } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Button, SectionTitle } from './ui.jsx';
import { fmtIDR, fmtNum } from '../utils/format.js';

const emptyForm = {
  name: '', speed: '', base_price: '', tax_rate: 0, agent_commission: '',
  allow_app_change: 1, allow_online_payment: 1, is_active: 1,
  router_id: '', mikrotik_profile: '', description: '',
};

/** Input dengan prefix (Rp) dan/atau suffix (Mbps, %) */
function PrefixedInput({ prefix, suffix, className = '', ...props }) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{prefix}</span>
      )}
      <input className={`input ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-12' : ''} ${className}`} {...props} />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{suffix}</span>
      )}
    </div>
  );
}

/** Switch on/off modern dengan label & deskripsi */
function Toggle({ checked, onChange, label, desc, disabled }) {
  const on = !!checked;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(on ? 0 : 1)}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition
        ${disabled ? 'opacity-50 cursor-not-allowed ' : ''}
        ${on
          ? 'border-accent-blue/40 bg-accent-blue/5 dark:bg-accent-blue/10'
          : 'border-slate-200 dark:border-navy-600 hover:border-slate-300 dark:hover:border-navy-500'}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium truncate">{label}</span>
        {desc && <span className="block text-[11px] text-slate-400 mt-0.5">{desc}</span>}
      </span>
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-accent-blue' : 'bg-slate-300 dark:bg-navy-600'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

/**
 * Modal form Tambah/Edit Paket — dipakai halaman Paket Internet maupun
 * inline (nested) dari form Tambah Pelanggan.
 * Integrasi: DB (POST/PUT /api/packages) + Mikrotik (daftar router, PPP profile
 * live, dan provision profile opsional ke router terpilih).
 */
export default function PackageFormModal({ open, onClose, onSaved, editPackage = null, hideSettingRouterLink = false }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  // ---- Data router & PPP profile (live dari Mikrotik) ----
  const canRouters = can('routers');
  const canProvision = can('routers', 'edit');
  const [routers, setRouters] = useState([]);
  const [routersLoaded, setRoutersLoaded] = useState(false);
  const [routersError, setRoutersError] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState(null);
  const [provision, setProvision] = useState(1);

  /** Daftar router aktif dari halaman Server Mikrotik */
  const loadRouters = useCallback(async () => {
    if (!canRouters) return;
    setRoutersError(null);
    try {
      const { data } = await api.get('/routers');
      setRouters(data.rows.filter((x) => x.is_active));
      setRoutersLoaded(true);
    } catch (err) {
      setRoutersError(err.response?.data?.message || 'Gagal memuat daftar router');
    }
  }, [canRouters]);

  /** PPP profile langsung dari server Mikrotik terpilih */
  const loadProfiles = useCallback(async (routerId) => {
    if (!routerId) { setProfiles([]); setProfilesError(null); return; }
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const { data } = await api.get(`/routers/${routerId}/profiles`);
      setProfiles(data.rows || []);
    } catch (err) {
      setProfiles([]);
      setProfilesError(err.response?.data?.message || 'Gagal mengambil profile dari Mikrotik');
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  // Inisialisasi ulang setiap kali modal dibuka
  useEffect(() => {
    if (!open) return;
    const p = editPackage;
    if (p) {
      const m = String(p.speed || '').match(/[\d.]+/);
      setForm({
        name: p.name || '',
        speed: m ? m[0] : '',
        base_price: p.base_price ?? p.price ?? '',
        tax_rate: p.tax_rate ?? 0,
        agent_commission: p.agent_commission ?? '',
        allow_app_change: p.allow_app_change ? 1 : 0,
        allow_online_payment: p.allow_online_payment ? 1 : 0,
        is_active: p.is_active ? 1 : 0,
        router_id: p.router_id ? String(p.router_id) : '',
        mikrotik_profile: p.mikrotik_profile || '',
        description: p.description || '',
      });
      setEditId(p.id || null);
    } else {
      setForm({ ...emptyForm });
      setEditId(null);
    }
    setProvision(1);
    setProfiles([]);
    setProfilesError(null);
    if (canRouters && !routersLoaded) loadRouters();
    if (p?.router_id) loadProfiles(p.router_id);
  }, [open, editPackage, canRouters, routersLoaded, loadRouters, loadProfiles]);

  const setF = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const changeRouter = (routerId) => {
    setForm((f) => ({ ...f, router_id: routerId, mikrotik_profile: '' }));
    loadProfiles(routerId);
  };

  const basePrice = Number(form.base_price) || 0;
  const taxRate = Number(form.tax_rate) || 0;
  const tarif = Math.round(basePrice * (1 + taxRate / 100));
  const selectedProfile = profiles.find((p) => p.name === form.mikrotik_profile);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const speedRaw = String(form.speed).trim();
      const payload = {
        ...form,
        speed: /^[\d.]+$/.test(speedRaw) ? `${speedRaw} Mbps` : speedRaw,
        price: tarif,
        base_price: basePrice,
        tax_rate: taxRate,
        agent_commission: Number(form.agent_commission) || 0,
        router_id: form.router_id || null,
      };
      let saved = null;
      if (editId) {
        await api.put(`/packages/${editId}`, payload);
        saved = { ...payload, id: editId };
      } else {
        const { data } = await api.post('/packages', payload);
        saved = { ...payload, id: data.id };
      }
      // Integrasi Mikrotik: provision PPP profile (paket aktif + isolir) ke router terpilih
      if (provision && saved.router_id && canProvision) {
        try {
          const { data } = await api.post(`/routers/${saved.router_id}/provision`);
          toast(`Profile Mikrotik disinkronkan — dibuat: ${data.created?.join(', ') || '-'}, sudah ada: ${data.existing?.join(', ') || '-'}`, 'success');
        } catch (err) {
          toast(`Paket tersimpan, tetapi provision Mikrotik gagal: ${err.response?.data?.message || err.message}`, 'warning');
        }
      }
      onSaved?.(saved);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl" title={editId ? 'Edit Paket' : 'Tambah Paket'}>
      <form onSubmit={save} className="space-y-5">
        <section>
          <SectionTitle icon={SlidersHorizontal} title="Informasi Paket" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Nama Paket</label>
              <input className="input" placeholder="Masukkan nama paket" value={form.name} onChange={setF('name')} required />
            </div>
            <div>
              <label className="label">Kecepatan</label>
              <PrefixedInput suffix="Mbps" inputMode="decimal" placeholder="0" value={form.speed} onChange={setF('speed')} required />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <Toggle checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Aktif" desc="Paket bisa dipilih pelanggan" />
            <Toggle checked={form.allow_app_change} onChange={(v) => setForm((f) => ({ ...f, allow_app_change: v }))} label="Upgrade / Downgrade di App" desc="Pelanggan boleh ganti paket dari aplikasi" />
            <Toggle checked={form.allow_online_payment} onChange={(v) => setForm((f) => ({ ...f, allow_online_payment: v }))} label="Pembayaran Online" desc="Tagihan bisa dibayar via gateway/QRIS" />
          </div>
        </section>

        <section>
          <SectionTitle icon={Wallet} title="Harga & Komisi" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Harga Dasar</label>
              <PrefixedInput prefix="Rp" type="number" min="0" placeholder="0" value={form.base_price} onChange={setF('base_price')} required />
            </div>
            <div>
              <label className="label">PPN</label>
              <PrefixedInput suffix="%" type="number" min="0" max="100" placeholder="0" value={form.tax_rate} onChange={setF('tax_rate')} />
            </div>
            <div>
              <label className="label">Komisi Agen</label>
              <PrefixedInput prefix="Rp" type="number" min="0" placeholder="0" value={form.agent_commission} onChange={setF('agent_commission')} />
            </div>
          </div>
          <div className="mt-3">
            <label className="label">Tarif / Bulan</label>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-navy-600 bg-slate-100 dark:bg-navy-700/60 px-3 py-2">
              <span className="text-sm font-bold">{fmtIDR(tarif)}</span>
              {taxRate > 0 && <span className="text-[11px] text-slate-400">{fmtIDR(basePrice)} + PPN {fmtNum(taxRate)}%</span>}
            </div>
          </div>
        </section>

        <section>
          <SectionTitle icon={Server} title="Integrasi Mikrotik" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Router</label>
              <div className="relative">
                <Server size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select className="input pl-9" value={form.router_id} onChange={(e) => changeRouter(e.target.value)}>
                  <option value="">— Pilih Router —</option>
                  {routers.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.host})</option>
                  ))}
                </select>
              </div>
              {routersError && (
                <p className="text-[11px] text-accent-red mt-1">
                  {routersError} · <button type="button" className="font-semibold underline" onClick={loadRouters}>Muat ulang</button>
                </p>
              )}
            </div>
            <div>
              <label className="label">Default Profile</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Wifi size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    className="input pl-9"
                    value={form.mikrotik_profile}
                    disabled={!form.router_id || profilesLoading}
                    onChange={(e) => setForm((f) => ({ ...f, mikrotik_profile: e.target.value }))}
                  >
                    <option value="">
                      {!form.router_id ? '— Pilih router dulu —' : profilesLoading ? 'Memuat…' : '— Pilih Profile —'}
                    </option>
                    {profiles.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}{p.rate_limit ? ` · ${p.rate_limit}` : ''}</option>
                    ))}
                  </select>
                </div>
                <Button type="button" variant="outline" disabled={!form.router_id} title="Muat ulang profile dari Mikrotik"
                  onClick={() => loadProfiles(form.router_id)} className="px-2.5">
                  <RefreshCw size={15} className={profilesLoading ? 'animate-spin' : ''} />
                </Button>
              </div>
              {selectedProfile?.rate_limit && (
                <p className="text-[11px] text-slate-400 mt-1">Rate-limit: <span className="font-mono">{selectedProfile.rate_limit}</span></p>
              )}
            </div>
          </div>

          {canProvision && (
            <div className="mt-3">
              <Toggle
                checked={provision}
                onChange={setProvision}
                disabled={!form.router_id}
                label="Provision profile ke Mikrotik"
                desc={form.router_id
                  ? `Buat PPP profile yang belum ada di ${routers.find((r) => String(r.id) === String(form.router_id))?.name || 'router terpilih'} (termasuk profile isolir)`
                  : 'Pilih router terlebih dahulu'}
              />
            </div>
          )}

          {profilesError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent-red/30 bg-accent-red/10 p-3 text-xs text-accent-red">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Gagal mengambil profile dari Mikrotik</p>
                <p className="mt-0.5 opacity-80">{profilesError}</p>
                <button type="button" onClick={() => loadProfiles(form.router_id)} className="mt-1 font-semibold underline">Coba lagi</button>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 dark:border-navy-600 bg-slate-50 dark:bg-navy-700/40 p-3">
            <Info size={14} className="mt-0.5 shrink-0 text-accent-blue" />
            <p className="text-xs text-slate-500 dark:text-slate-400 flex-1">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Informasi:</span>{' '}
              Jika router/profile tidak muncul pada daftar di atas, lakukan test koneksi dan simpan ulang router Anda melalui
              menu <b>Setting Server — Router Mikrotik</b>. Pilih router yang ingin digunakan, klik <b>Edit</b>, lalu
              <b> Test Koneksi</b> dan <b>Simpan</b> kembali.
            </p>
            {!hideSettingRouterLink && (
              <Button type="button" size="sm" onClick={() => navigate('/routers')}>Buka Setting Router</Button>
            )}
          </div>
          {!canRouters && (
            <p className="text-[11px] text-slate-400 mt-2">
              Pemilihan router & profile memerlukan izin akses menu "Server Mikrotik".
            </p>
          )}
        </section>

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200/60 dark:border-navy-700">
          <Button type="button" variant="ghost" onClick={onClose}>BATAL</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'SIMPAN'}</Button>
        </div>
        </form>
      </Modal>
    );
  }
