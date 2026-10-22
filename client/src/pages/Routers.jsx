import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Server, Cpu, MemoryStick, Timer, PlugZap, Radar,
  Users2, ListTree, Wand2, Database, RefreshCw, HardDrive, Ban, KeyRound,
  Network, Globe, Lock, User, Eye, EyeOff, MapPin, Hash, PowerOff,
  CircleCheck, CircleX, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Badge, Button, Modal, Empty } from '../components/ui.jsx';
import { fmtDateTime, fmtBytes, fmtUptime } from '../utils/format.js';

/** Form kosong — tanpa nilai bawaan; seluruh data diisi admin secara eksplisit */
const emptyForm = {
  name: '', host: '', port: '', scheme: '', api_user: '', api_pass: '', location: '',
  auto_isolate: 0, isolate_action: '', isolate_profile: '',
};
const TABS = [
  { key: 'resource', label: 'Resource' },
  { key: 'interfaces', label: 'Interface' },
  { key: 'profiles', label: 'PPP Profile' },
  { key: 'sessions', label: 'Sesi Aktif' },
];

/** Judul seksi form dengan ikon & garis — konsisten dengan form Paket (PackageFormModal) */
function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="p-1.5 rounded-lg bg-accent-blue/10 text-accent-blue"><Icon size={14} /></span>
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
      <span className="flex-1 h-px bg-slate-200 dark:bg-navy-700" />
    </div>
  );
}

/** Switch on/off modern dengan label & deskripsi — konsisten dengan form Paket (PackageFormModal) */
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

export default function Routers() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [detail, setDetail] = useState(null);
  const [ov, setOv] = useState(null);
  const [ovLoading, setOvLoading] = useState(false);
  const [tab, setTab] = useState('resource');
  const [tabData, setTabData] = useState(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [provBusy, setProvBusy] = useState(false);
  const [provMsg, setProvMsg] = useState(null);
  const [newProf, setNewProf] = useState({ name: '', rate_limit: '' });
  const [isoProfiles, setIsoProfiles] = useState(['isolir']); // opsi dropdown "Profile Isolir"

  const load = useCallback(async () => {
    const { data } = await api.get('/routers');
    setRows(data.rows);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    // Validasi eksplisit Auto Isolir — tanpa nilai default tersembunyi
    if (Number(form.auto_isolate) === 1 && !form.isolate_action) {
      toast('Pilih Action Isolir terlebih dahulu', 'warning'); return;
    }
    if (Number(form.auto_isolate) === 1 && form.isolate_action === 'profile' && !form.isolate_profile) {
      toast('Pilih Profile Isolir terlebih dahulu', 'warning'); return;
    }
    setSaving(true);
    try {
      if (editId) await api.put(`/routers/${editId}`, form);
      else await api.post('/routers', form);
      toast('Server tersimpan', 'success');
      setShowForm(false);
      setProbe(null);
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!(await confirm({
      title: 'Hapus Server',
      message: 'Server Mikrotik ini akan dihapus permanen dari daftar. Tindakan ini tidak dapat dibatalkan.',
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    await api.delete(`/routers/${id}`);
    toast('Server dihapus', 'success');
    load();
  };

  /** Uji kredensial manual via RouterOS REST — tanpa menyimpan.
   *  Mode Edit: kirim id agar password kosong memakai kredensial tersimpan. */
  const runProbe = async () => {
    if (!form.host || !form.port || !form.api_user) { toast('Isi host, port & API user terlebih dahulu', 'warning'); return; }
    setProbing(true); setProbe(null);
    try {
      const { data } = await api.post('/routers/probe', { ...form, id: editId });
      setProbe(data);
    } catch (err) {
      setProbe({ ok: false, message: err.response?.data?.message || err.message || 'Koneksi gagal' });
    } finally { setProbing(false); }
  };

  /** Daftar PPP profile server untuk dropdown "Profile Isolir" — live dari RouterOS saat mode edit */
  const loadIsoProfiles = async (r) => {
    const saved = r.isolate_profile || 'isolir';
    const base = saved !== 'isolir' ? ['isolir', saved] : ['isolir'];
    setIsoProfiles(base);
    try {
      const { data } = await api.get(`/routers/${r.id}/profiles`);
      setIsoProfiles([...new Set([...base, ...(data.rows || []).map((p) => p.name)])]);
    } catch { /* server offline — cukup pakai nilai tersimpan */ }
  };

  const test = async (r) => {
    toast('Menguji koneksi tersimpan…', 'info');
    try {
      const { data } = await api.post(`/routers/${r.id}/test`);
      toast(`Koneksi OK — ${data.resource.board_name} · RouterOS ${data.resource.version}`, 'success');
      load();
    } catch (err) {
      toast(`Koneksi gagal: ${err.response?.data?.message || err.message}`, 'danger');
      load();
    }
  };

  const openDetail = async (r) => {
    setDetail(r); setTab('resource'); setTabData(null); setProvMsg(null); setOv(null);
    await loadOverview(r);
  };

  const loadOverview = async (r) => {
    setOvLoading(true);
    try {
      const { data } = await api.get(`/routers/${r.id}/overview`);
      setOv(data);
    } catch (err) {
      setOv({ ok: false, message: err.response?.data?.message || err.message });
    } finally { setOvLoading(false); }
  };

  const loadTab = async (r, t) => {
    setTabLoading(true); setTabData(null);
    try {
      const map = {
        interfaces: `/routers/${r.id}/interfaces`,
        profiles: `/routers/${r.id}/profiles`,
        sessions: `/routers/${r.id}/sessions`,
      };
      const { data } = await api.get(map[t]);
      setTabData(data);
    } catch (err) {
      setTabData({ ok: false, message: err.response?.data?.message || err.message });
    } finally { setTabLoading(false); }
  };

  const switchTab = (t) => { setTab(t); if (t !== 'resource' && detail) loadTab(detail, t); };

  const provision = async () => {
    setProvBusy(true); setProvMsg(null);
    try {
      const { data } = await api.post(`/routers/${detail.id}/provision`);
      setProvMsg(data);
      toast(`Provision selesai — ${data.created?.length || 0} profil dibuat`, 'success');
      if (tab === 'profiles') loadTab(detail, 'profiles');
    } catch (err) {
      setProvMsg({ ok: false, message: err.response?.data?.message || err.message });
    } finally { setProvBusy(false); }
  };

  const addProfile = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/routers/${detail.id}/profiles`, newProf);
      toast('PPP profile dibuat', 'success');
      setNewProf({ name: '', rate_limit: '' });
      loadTab(detail, 'profiles');
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal membuat profile', 'danger');
    }
  };

  const toggleNas = async (r) => {
    try {
      if (r.nas_registered) {
        await api.post(`/routers/${r.id}/unregister-nas`);
        toast('Server dihapus dari NAS RADIUS', 'success');
      } else {
        await api.post(`/routers/${r.id}/register-nas`);
        toast('Server terdaftar sebagai NAS RADIUS (FreeRADIUS)', 'success');
      }
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal', 'danger');
    }
  };

  return (
    <div>
      <PageHeader
        title="Server Mikrotik"
        subtitle="Input server manual & integrasi RouterOS API — resource, interface, PPP profile, sesi, NAS RADIUS (PRD 5.5)"
        actions={can('routers', 'create') && (
          <Button onClick={() => { setForm(emptyForm); setEditId(null); setProbe(null); setIsoProfiles(['isolir']); setShowPass(false); setShowForm(true); }}>
            <Plus size={15} /> Tambahkan Server
          </Button>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-accent-blue/10 text-accent-blue"><Server size={20} /></div>
                <div>
                  <p className="font-bold">{r.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{r.host}:{r.port} · {r.api_user} · {r.location || '-'}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge value={r.status === 'online' ? 'online' : r.status === 'offline' ? 'offline' : 'pending'}
                  label={r.status === 'online' ? 'Online' : r.status === 'offline' ? 'Offline' : 'Belum diuji'} />
                {can('routers', 'edit') && (
                  <button onClick={() => toggleNas(r)}
                    title={r.nas_registered ? 'Terdaftar di NAS RADIUS — klik untuk hapus' : 'Belum terdaftar sebagai NAS — klik untuk daftarkan'}>
                    <Badge value={r.nas_registered ? 'success' : 'pending'} className="cursor-pointer"
                      label={r.nas_registered ? 'NAS RADIUS ✓' : 'NAS: belum'} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">Terakhir terlihat: {r.last_seen ? fmtDateTime(r.last_seen) : 'belum pernah'}</p>
            <p className="text-xs text-slate-400 mt-1">
              Auto Isolir:{' '}
              <span className={Number(r.auto_isolate) === 1 ? 'text-accent-green font-semibold' : 'text-accent-red font-semibold'}>
                {Number(r.auto_isolate) === 1 ? 'AKTIF' : 'NONAKTIF'}
              </span>
              {Number(r.auto_isolate) === 1 && (String(r.isolate_action) === 'disable'
                ? ' · Disable Secrets'
                : ` · Ubah Profile → ${r.isolate_profile || 'isolir'}`)}
            </p>
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-navy-700/50">
              <Button size="sm" variant="primary" onClick={() => openDetail(r)}><Radar size={13} /> Detail & Integrasi</Button>
              {can('routers', 'edit') && (
                <>
                  <Button size="sm" variant="outline" onClick={() => test(r)}><PlugZap size={13} /> Uji Koneksi</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setForm({ ...r, api_pass: '' }); setEditId(r.id); setProbe(null); loadIsoProfiles(r); setShowPass(false); setShowForm(true); }}><Pencil size={13} /> Edit</Button>
                  {can('routers', 'delete') && (
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 size={13} className="text-accent-red" /></Button>
                  )}
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
      {rows.length === 0 && <Card><Empty text="Belum ada server — gunakan tombol Input Server Manual" /></Card>}

      {/* Modal input server manual + probe API live */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Server' : 'Input Server Manual'} className="max-w-3xl">
        <form onSubmit={save} className="space-y-5">
          {/* Seksi: Informasi Server & Koneksi */}
          <section>
            <SectionTitle icon={Server} title="Informasi Server & Koneksi" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Nama Server <span className="text-accent-red">*</span></label>
                <div className="relative">
                  <Server size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Mikrotik POP Utama" />
                </div>
              </div>
              <div>
                <label className="label">Lokasi</label>
                <div className="relative">
                  <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9" value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="POP Sentral" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="label">Host / IP <span className="text-accent-red">*</span></label>
                <div className="relative">
                  <Globe size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9 font-mono" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required placeholder="10.10.10.1" />
                </div>
              </div>
              <div>
                <label className="label">Port REST <span className="text-accent-red">*</span></label>
                <div className="relative">
                  <Hash size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" min="1" max="65535" className="input pl-9" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} required placeholder="80" />
                </div>
              </div>
              <div>
                <label className="label">Protokol <span className="text-accent-red">*</span></label>
                <div className="relative">
                  <Network size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select className="input pl-9" value={form.scheme || ''} onChange={(e) => setForm({ ...form, scheme: e.target.value })} required>
                    <option value="">— Pilih Protokol —</option>
                    <option value="http">HTTP — service www</option>
                    <option value="https">HTTPS — service www-ssl</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Seksi: Kredensial API */}
          <section>
            <SectionTitle icon={KeyRound} title="Kredensial API" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">API User (RouterOS) <span className="text-accent-red">*</span></label>
                <div className="relative">
                  <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9" value={form.api_user} onChange={(e) => setForm({ ...form, api_user: e.target.value })} required placeholder="admin" autoComplete="off" />
                </div>
              </div>
              <div>
                <label className="label">API Password {editId && <span className="text-slate-400">(isi ulang untuk uji)</span>} <span className="text-accent-red">*</span></label>
                <div className="relative">
                  <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type={showPass ? 'text' : 'password'} className="input pl-9 pr-10" value={form.api_pass || ''} onChange={(e) => setForm({ ...form, api_pass: e.target.value })} required={!editId} placeholder="••••••••" autoComplete="new-password" />
                  <button type="button" tabIndex={-1} aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    onClick={() => setShowPass((v) => !v)}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Seksi: Verifikasi via RouterOS API */}
          <section>
            <SectionTitle icon={Radar} title="Verifikasi RouterOS API" />
            <div className="rounded-xl border border-slate-200 dark:border-navy-600 bg-slate-50/60 dark:bg-navy-800/50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sistem memanggil REST API Mikrotik untuk memverifikasi kredensial sebelum disimpan. Pastikan service <span className="font-mono">www</span> pada port tersebut aktif di router.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={runProbe} disabled={probing}>
                  <Radar size={13} className={probing ? 'animate-pulse' : ''} /> {probing ? 'Menguji…' : 'Tes Koneksi'}
                </Button>
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-xs">
                <span className="text-slate-400 shrink-0">Endpoint:</span>
                {form.scheme && form.host && form.port ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-navy-600 bg-white dark:bg-navy-700 px-2 py-1 font-mono text-[11px] text-accent-blue">
                    <Globe size={11} className="shrink-0" /> {form.scheme}://{form.host}:{form.port}
                  </span>
                ) : (
                  <span className="text-[11px] italic text-slate-400">lengkapi protokol, host & port di atas</span>
                )}
              </div>
              {editId && !form.api_pass && (
                <p className="mt-1.5 text-[11px] flex items-center gap-1 text-slate-400">
                  <ShieldCheck size={11} className="shrink-0 text-accent-green" />
                  Password dikosongkan — Tes Koneksi otomatis memakai password tersimpan di server.
                </p>
              )}

              {[8728, 8729].includes(Number(form.port)) && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-accent-orange/30 bg-accent-orange/10 p-2.5 text-[11px] text-accent-orange">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    Port <b>{form.port}</b> adalah service <b>API biner</b> Mikrotik — bukan REST. Gunakan <b>80 (www)</b> atau <b>443 (www-ssl)</b> untuk REST API RouterOS v7, atau aktifkan kedua service tersebut di menu IP → Services.
                  </span>
                </div>
              )}

              {probe?.ok && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-accent-green/30 bg-accent-green/10 p-2.5">
                  <CircleCheck size={15} className="text-accent-green shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-accent-green">Terhubung: {probe.identity}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {probe.resource.board_name} · RouterOS {probe.resource.version} · uptime {probe.resource.uptime} · CPU {probe.resource.cpu_load}%
                    </p>
                  </div>
                </div>
              )}
              {probe && !probe.ok && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-accent-red/30 bg-accent-red/10 p-2.5 text-sm text-accent-red">
                  <CircleX size={15} className="shrink-0 mt-0.5" />
                  <span>{probe.message}</span>
                </div>
              )}
            </div>
          </section>

          {/* Seksi: Auto Isolir — pengaturan isolir otomatis pelanggan (dieksekusi ke RouterOS via REST API) */}
          <section>
            <SectionTitle icon={Ban} title="Auto Isolir" />
            <Toggle
              checked={Number(form.auto_isolate) === 1}
              onChange={(v) => setForm((f) => ({ ...f, auto_isolate: v }))}
              label="Aktifkan Auto Isolir"
              desc="Isolir otomatis pelanggan menunggak pada server ini"
            />
            {Number(form.auto_isolate) === 1 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="label">Action Isolir <span className="text-accent-red">*</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'profile', icon: ListTree, label: 'Ubah Profile', desc: 'Pindah profile PPPoE' },
                        { key: 'disable', icon: PowerOff, label: 'Disable Secrets', desc: 'Nonaktifkan secret' },
                      ].map((a) => {
                        const active = form.isolate_action === a.key;
                        return (
                          <button type="button" key={a.key} onClick={() => setForm((f) => ({ ...f, isolate_action: a.key }))}
                            className={`rounded-xl border p-2.5 text-left transition ${active
                              ? 'border-accent-blue bg-accent-blue/5 dark:bg-accent-blue/10 ring-1 ring-accent-blue/40'
                              : 'border-slate-200 dark:border-navy-600 hover:border-slate-300 dark:hover:border-navy-500'}`}>
                            <a.icon size={15} className={active ? 'text-accent-blue' : 'text-slate-400'} />
                            <p className={`text-xs font-semibold mt-1 ${active ? 'text-accent-blue' : ''}`}>{a.label}</p>
                            <p className="text-[10px] text-slate-400">{a.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="label">Profile Isolir {form.isolate_action === 'profile' && <span className="text-accent-red">*</span>}</label>
                    <div className="relative">
                      <ListTree size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <select className="input pl-9 disabled:opacity-60 disabled:cursor-not-allowed" value={form.isolate_profile || ''}
                        disabled={form.isolate_action === 'disable'} required={form.isolate_action === 'profile'}
                        onChange={(e) => setForm((f) => ({ ...f, isolate_profile: e.target.value }))}>
                        <option value="">— Pilih Profile —</option>
                        {isoProfiles.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    {form.isolate_action === 'disable' && (
                      <p className="text-[11px] text-slate-400 mt-1">Tidak dipakai pada mode Disable Secrets.</p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  Saat pelanggan menunggak melewati toleransi: <b>Ubah Profile</b> memindahkan secret PPPoE pelanggan ke profile terpilih di Mikrotik;{' '}
                  <b>Disable Secrets</b> menonaktifkan secret (tidak bisa konek, sesi aktif diputus) sampai lunas.
                  {' '}Daftar profile diambil langsung dari server saat mode Edit — server baru dapat memilih profile <span className="font-mono">isolir</span> (bisa dipilih setelah disimpan).
                </p>
              </>
            )}
          </section>

          {/* Footer: info keamanan + aksi */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200/60 dark:border-navy-700">
            <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck size={13} className="text-accent-green shrink-0 mt-0.5" />
              <span>Kredensial disimpan terenkripsi AES-256. Server dapat didaftarkan sebagai NAS FreeRADIUS (tabel <span className="font-mono">nas</span>) agar autentikasi PPPoE lewat RADIUS.</span>
            </p>
            <div className="flex justify-end gap-2 shrink-0">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>BATAL</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Menyimpan…' : (<><Server size={14} /> SIMPAN ROUTER</>)}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal detail & integrasi server */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`${detail?.name || ''} — ${detail?.host || ''}`} wide>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${tab === t.key ? 'bg-accent-blue text-white' : 'bg-slate-100 dark:bg-navy-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200'}`}>
              {t.label}
            </button>
          ))}
          {ov?.ok && <Badge value="online" label="Data Real (Mikrotik)" />}
          {tab === 'resource' && (
            <button onClick={() => detail && loadOverview(detail)}
              className="ml-auto text-xs text-accent-blue hover:underline inline-flex items-center gap-1">
              <RefreshCw size={12} /> Muat ulang
            </button>
          )}
        </div>

        {ovLoading && <Empty text="Mengambil data dari server…" />}
        {ov && !ovLoading && !ov.ok && (
          <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 p-4 text-sm text-accent-red">
            ✗ {ov.message}
            <button onClick={() => loadOverview(detail)} className="ml-2 underline">coba lagi</button>
          </div>
        )}
        {ov && !ovLoading && ov.ok && tab === 'resource' && (
          <div>
            {ov.warnings?.length > 0 && (
              <div className="mb-3 rounded-lg bg-accent-orange/10 border border-accent-orange/30 p-3 text-xs text-accent-orange">
                ⚠ Sebagian data gagal diambil dari server: {ov.warnings.join(' | ')}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2"><Server size={16} className="text-accent-blue" /><div><p className="text-xs text-slate-400">Identity</p><strong>{ov.identity}</strong></div></div>
            <div className="flex items-center gap-2"><Cpu size={16} className="text-accent-orange" /><div><p className="text-xs text-slate-400">CPU Load</p><strong>{ov.resource.cpu_load}%</strong></div></div>
            <div className="flex items-center gap-2"><MemoryStick size={16} className="text-accent-purple" /><div><p className="text-xs text-slate-400">Memori</p><strong>{Math.round(ov.resource.free_memory / 1048576)}/{Math.round(ov.resource.total_memory / 1048576)} MB</strong></div></div>
            <div className="flex items-center gap-2"><Timer size={16} className="text-accent-green" /><div><p className="text-xs text-slate-400">Uptime</p><strong>{ov.resource.uptime}</strong></div></div>
            <div className="flex items-center gap-2"><HardDrive size={16} className="text-accent-blue" /><div><p className="text-xs text-slate-400">Board</p><strong className="text-xs">{ov.resource.board_name}</strong></div></div>
            <div className="flex items-center gap-2"><RefreshCw size={16} className="text-accent-purple" /><div><p className="text-xs text-slate-400">RouterOS</p><strong className="text-xs">{ov.resource.version}</strong></div></div>
            <div className="flex items-center gap-2"><Users2 size={16} className="text-accent-green" /><div><p className="text-xs text-slate-400">Sesi Aktif</p><strong>{ov.activeSessions}</strong></div></div>
            <div className="flex items-center gap-2"><ListTree size={16} className="text-accent-orange" /><div><p className="text-xs text-slate-400">PPP Profile</p><strong>{ov.profiles?.length ?? '-'}</strong></div></div>
          </div>
          </div>
        )}
        {tab !== 'resource' && tabLoading && <Empty text="Memuat…" />}
        {tab !== 'resource' && !tabLoading && tabData && !tabData.ok && (
          <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 p-4 text-sm text-accent-red">✗ {tabData.message}</div>
        )}
        {tab !== 'resource' && !tabLoading && tabData && tabData.ok !== false && (
            <>
              {tab === 'interfaces' && (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200/60 dark:border-navy-700">
                    <th className="py-2">Interface</th><th>Tipe</th><th>Status</th><th>MAC / MTU</th><th className="text-right">RX Byte</th><th className="text-right">TX Byte</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
                    {tabData.rows.map((i) => {
                      const status = i.disabled ? { tone: 'danger', text: 'disabled' } : (i.running ? { tone: 'success', text: 'running' } : { tone: 'warning', text: 'down' });
                      return (
                        <tr key={i._id || i.name}>
                          <td className="py-2">
                            <div className="font-mono text-xs">{i.name}</div>
                            {(i.default_name || i.comment) && (
                              <div className="text-[11px] text-slate-400">{[i.default_name, i.comment].filter(Boolean).join(' · ')}</div>
                            )}
                          </td>
                          <td>{i.kind || i.type || '-'}</td>
                          <td><Badge tone={status.tone}>{status.text}</Badge></td>
                          <td>
                            <div className="font-mono text-xs">{i.mac_address || '-'}</div>
                            <div className="text-[11px] text-slate-400">MTU {i.mtu || '-'}</div>
                          </td>
                          <td className="text-right">{fmtBytes(i.rx_byte)}</td>
                          <td className="text-right">{fmtBytes(i.tx_byte)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {tab === 'profiles' && (
                <div className="space-y-3">
                  {can('routers', 'edit') && (
                    <div className="flex flex-wrap items-end gap-2">
                      <Button size="sm" variant="orange" onClick={provision} disabled={provBusy}>
                        <Wand2 size={13} /> {provBusy ? 'Memproses…' : 'Provision otomatis (paket + isolir)'}
                      </Button>
                      <form onSubmit={addProfile} className="flex items-end gap-2 ml-auto">
                        <div><label className="label">Nama profil</label>
                          <input className="input py-1 text-xs w-32" value={newProf.name} onChange={(e) => setNewProf({ ...newProf, name: e.target.value })} required /></div>
                        <div><label className="label">Rate-limit</label>
                          <input className="input py-1 text-xs w-28" placeholder="10M/10M" value={newProf.rate_limit} onChange={(e) => setNewProf({ ...newProf, rate_limit: e.target.value })} /></div>
                        <Button size="sm" type="submit" variant="green"><Plus size={12} /> Buat</Button>
                      </form>
                    </div>
                  )}
                  {provMsg && (
                    <div className={`rounded-lg p-3 text-sm border ${provMsg.ok === false ? 'bg-accent-red/10 border-accent-red/30 text-accent-red' : 'bg-accent-green/10 border-accent-green/30'}`}>
                      {provMsg.message || `Dibuat: ${provMsg.created?.join(', ') || '-'} · Sudah ada: ${provMsg.existing?.join(', ') || '-'}`}
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200/60 dark:border-navy-700">
                      <th className="py-2">Nama</th><th>Rate-limit</th><th>Keterangan</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
                      {tabData.rows.map((p) => (
                        <tr key={p.name}>
                          <td className="py-2 font-semibold">{p.name}</td>
                          <td className="font-mono text-xs">{p.rate_limit || '-'}</td>
                          <td className="text-xs text-slate-400">{p.comment || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tabData.rows.length === 0 && <Empty text="Belum ada profil" />}
                </div>
              )}

              {tab === 'sessions' && (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200/60 dark:border-navy-700">
                    <th className="py-2">Pelanggan</th><th>Username</th><th>IP</th><th>MAC</th><th className="text-right">Uptime</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
                    {tabData.rows.map((s) => (
                      <tr key={s.username}>
                        <td className="py-2">{s.name || '-'} <span className="text-xs text-slate-400">{s.code || ''}</span></td>
                        <td className="font-mono text-xs">{s.username}</td>
                        <td className="font-mono text-xs">{s.ip || '-'}</td>
                        <td className="font-mono text-xs">{s.mac || '-'}</td>
                        <td className="text-right">{typeof s.uptime === 'number' ? fmtUptime(s.uptime) : (s.uptime || '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tabData.rows.length === 0 && tab !== 'profiles' && <Empty text="Tidak ada data" />}
            </>
        )}
      </Modal>
    </div>
  );
}
