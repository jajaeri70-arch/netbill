import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, CheckCircle2, Wrench, CalendarDays, Clock, User } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Button, SearchSelect } from '../components/ui.jsx';
import PackageFormModal from '../components/PackageFormModal.jsx';
import BillSchemePreview from '../components/BillSchemePreview.jsx';
import { buildBillScheme, computeBerakhir } from '../utils/prorata.js';
import { fmtIDR } from '../utils/format.js';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Opsi "Batas Waktu Pembayaran / Suspend / Isolir": +1 s/d +31 hari setelah tanggal berakhir */
const GRACE_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const emptyForm = { name: '', nik: '', phone: '', email: '', address: '', area: '', tag: '', package_id: '', activation_date: today(), billing_day: '', grace_days: '', no_auto_isolate: 0, status: 'active', pppoe_username: '', pppoe_password: '', ppp_service: 'pppoe', ppp_type_ip: 'IP Pools', ppp_local_address: '', ppp_remote_address: '', odp: '', odc: '', notes: '' };

export default function CustomerForm({ editId, onClose, onSaved }) {
  const { toast } = useToast();
  const { can } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [packages, setPackages] = useState([]);
  const [showPkgForm, setShowPkgForm] = useState(false);
  // Master wilayah/area + form tambah inline
  const [areas, setAreas] = useState([]);
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [areaForm, setAreaForm] = useState({ name: '', description: '' });
  const [savingArea, setSavingArea] = useState(false);
  const [tax, setTax] = useState(0);
  const [saving, setSaving] = useState(false);
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [village, setVillage] = useState('');
  const [addon, setAddon] = useState('');
  const [addonPrice, setAddonPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [billingType, setBillingType] = useState('PASCABAYAR | PAKAI DULU BARU BAYAR');
  const [activePeriod, setActivePeriod] = useState(1);
  const [periodUnit, setPeriodUnit] = useState('BULAN');
  const [installStatus, setInstallStatus] = useState('TERPASANG');
  const [agent, setAgent] = useState('');
  const [agentCommission, setAgentCommission] = useState(0);
  const [secretMode, setSecretMode] = useState('router');
  const [routers, setRouters] = useState([]);
  const [routerSecrets, setRouterSecrets] = useState([]);
  const [ipPools, setIpPools] = useState([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  // Skema penagihan gaya billing lama: tanggal pemasangan terpisah, rencana pembayaran suspend, pratinjau prorata
  const [installDate, setInstallDate] = useState(today());
  const [renewalPlan, setRenewalPlan] = useState('UBAH TANGGAL AKTIF SESUAI TANGGAL BERAKHIR');
  const [showScheme, setShowScheme] = useState(false); // pratinjau skema baru tampil setelah tombol "CEK SKEMA PEMBAYARAN" ditekan
  const [berakhirManual, setBerakhirManual] = useState(null); // Tanggal Berakhir pilihan manual (null = ikut hitungan otomatis)
  const [billingDaySnapshot, setBillingDaySnapshot] = useState(null); // Siklus Tagihan sebelum diubah otomatis oleh Tanggal Berakhir manual
  const [globalGrace, setGlobalGrace] = useState(0);
  const [globalBillingDay, setGlobalBillingDay] = useState(5);
  // Cascading dropdown wilayah Indonesia (provinsi → kota → kecamatan → desa)
  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);
  const [provCode, setProvCode] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [districtCode, setDistrictCode] = useState('');
  const [desaCode, setDesaCode] = useState('');
  const [wilayahLoading, setWilayahLoading] = useState('');
  // Checkbox "Tambahkan Detail Alamat?" — menampilkan/menyembunyikan grup alamat (Provinsi s/d Detail Alamat)
  const [showAddressDetail, setShowAddressDetail] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/packages'), api.get('/settings')]).then(([p, s]) => {
      setPackages(p.data.rows); setTax(Number(s.data.settings.tax_percent) || 0);
      setGlobalGrace(Number(s.data.settings.grace_days) || 0);
      setGlobalBillingDay(Number(s.data.settings.billing_day_default) || 5);
      if (!editId) setForm((f) => ({ ...f, billing_day: f.billing_day || Number(s.data.settings.billing_day_default) || 5 }));
    }).catch(() => {});
    api.get('/routers').then(({ data }) => setRouters(data.rows.filter((r) => r.is_active))).catch(() => {});
    if (editId) api.get(`/customers/${editId}`).then(({ data }) => { setForm({ ...emptyForm, ...data.customer, package_id: data.customer.package_id || '', activation_date: data.customer.activation_date || today() }); setInstallDate(data.customer.installation_date || data.customer.activation_date || today()); setInstallStatus({ pending: 'BELUM TERPASANG', in_progress: 'DALAM PROSES', installed: 'TERPASANG' }[data.customer.installation_status] || 'TERPASANG'); const nt = `${data.customer.billing_type || ''} ${data.customer.notes || ''}`; setBillingType(nt.includes('PRABAYAR') || nt.includes('prabayar') ? 'PRABAYAR | BAYAR DI MUKA' : 'PASCABAYAR | PAKAI DULU BARU BAYAR'); }).catch(() => toast('Gagal memuat data pelanggan', 'danger'));
  }, [editId, toast]);

  useEffect(() => { if (routers.length && secretMode === 'router' && !routerSecrets.length) loadSecrets(); }, [routers]);
  useEffect(() => { api.get('/wilayah/provinsi').then(({ data }) => setProvinces(data.rows || [])).catch(() => {}); }, []);
  useEffect(() => { api.get('/areas').then(({ data }) => setAreas(data.rows || [])).catch(() => {}); }, []);

  const selectedPackage = packages.find((p) => Number(p.id) === Number(form.package_id));
  const price = Number(selectedPackage?.price) || 0;
  const subtotal = Math.max(0, price + Number(addonPrice || 0) - Number(discount || 0));
  const taxAmount = Math.round(subtotal * tax / 100);
  const total = subtotal + taxAmount;
  // Skema tagihan & prorata — paritas dengan engine billing server:
  // PRABAYAR | BAYAR DI MUKA → siklus mengikuti Tanggal Aktif (fallback Tanggal Pemasangan),
  // selain itu anchor = Siklus Tagihan → hari Tanggal Aktif → pengaturan global (sama dgn cycleForDate).
  const isPrepaid = billingType.startsWith('PRABAYAR');
  const billStartDate = form.activation_date || (isPrepaid ? installDate : null);
  const anchorDay = isPrepaid
    ? (Number(billStartDate ? new Date(`${billStartDate}T00:00:00`).getDate() : 0) || Number(installDate ? new Date(`${installDate}T00:00:00`).getDate() : 0) || Number(form.billing_day) || globalBillingDay || 5)
    : (Number(form.billing_day) || (form.activation_date ? new Date(`${form.activation_date}T00:00:00`).getDate() : 0) || globalBillingDay || 5);
  const effGrace = form.grace_days === '' || form.grace_days == null ? globalGrace : Number(form.grace_days);
  // Tanggal Berakhir adalah batas periode layanan; Batas Waktu Pembayaran hanya menggeser jatuh tempo tagihan.
  const berakhir = useMemo(() => computeBerakhir({ activeDate: billStartDate, anchorDay, periods: activePeriod, unit: periodUnit }), [billStartDate, anchorDay, activePeriod, periodUnit]);
  const berakhirFinal = berakhirManual || berakhir; // manual menang, kosong = hitungan otomatis
  // Grace hanya menggeser jatuh tempo, bukan Tanggal Berakhir atau awal siklus tagihan.
  const berakhirSkema = berakhirManual || berakhir;
  // Tanggal Berakhir (manual/otomatis) jadi acuan skema: periode pertama = awal masa aktif s/d (Tanggal Berakhir − 1),
  // siklus berikutnya ber-anchor pada hari Tanggal Berakhir — Siklus Tagihan ikut disinkronkan agar engine server paritas
  const effAnchor = berakhirManual ? Math.min(Math.max(1, new Date(`${berakhirManual}T00:00:00`).getDate()), 31) : anchorDay;
  // PRABAYAR | BAYAR DI MUKA → skema tanpa prorata (siklus pertama tarif penuh)
  const schemeRows = useMemo(() => buildBillScheme({ activeDate: billStartDate, anchorDay: effAnchor, price, periods: activePeriod, unit: periodUnit, graceDays: effGrace, berakhir: berakhirSkema, noProrata: isPrepaid }), [billStartDate, effAnchor, price, activePeriod, periodUnit, effGrace, berakhirSkema, isPrepaid]);
  /** Pilih Tanggal Berakhir manual → sinkronkan Siklus Tagihan; reset → pulihkan nilai sebelumnya */
  const pickBerakhir = (v) => {
    if (v) {
      setBerakhirManual(v);
      setBillingDaySnapshot((s) => (s ?? form.billing_day));
      setForm((f) => ({ ...f, billing_day: new Date(`${v}T00:00:00`).getDate() }));
    } else {
      setBerakhirManual(null);
      if (billingDaySnapshot != null) {
        setForm((f) => ({ ...f, billing_day: billingDaySnapshot }));
        setBillingDaySnapshot(null);
      }
    }
  };
  // Tanggal Aktif / Pemasangan / Masa Aktif / Satuan / Jenis Penagihan / Batas Waktu berubah → pilihan manual di-reset agar kembali mengikuti hitungan otomatis
  useEffect(() => { pickBerakhir(null); }, [form.activation_date, installDate, activePeriod, periodUnit, billingType, effGrace]); // eslint-disable-line react-hooks/exhaustive-deps
  const provName = provinces.find((p) => p.code === provCode)?.name || '';
  const address = useMemo(() => (showAddressDetail ? [provName, city, district, village, form.address] : []).filter(Boolean).join(', '), [showAddressDetail, provName, city, district, village, form.address]);
  const setF = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const loadSecrets = async () => {
    const router = routers[0];
    if (!router) { toast('Tidak ada router aktif', 'warning'); return; }
    setSecretsLoading(true);
    try {
      const { data } = await api.get(`/routers/${router.id}/secrets`);
      setRouterSecrets(data.rows.filter((row) => !row.disabled && (!row.service || row.service === 'pppoe' || row.service === 'any')));
    } catch (err) { toast(err.response?.data?.message || 'Gagal mengambil PPP secrets dari router', 'danger'); }
    finally { setSecretsLoading(false); }
  };
  const loadIpPools = async () => {
    const router = routers[0];
    if (!router) { toast('Tidak ada router aktif', 'warning'); return; }
    try {
      const { data } = await api.get(`/routers/${router.id}/ip-pools`);
      setIpPools(data.rows || []);
    } catch (err) { toast(err.response?.data?.message || 'Gagal mengambil IP pool dari router', 'danger'); }
  };
  /** Pilih username secret dari SearchSelect — otomatis mengisi password/service/IP (pola sama dgn pickWilayah) */
  const pickSecret = (username) => {
    if (!username) {
      setForm((f) => ({ ...f, pppoe_username: '', pppoe_password: '', ppp_service: 'pppoe', ppp_local_address: '', ppp_remote_address: '' }));
      return;
    }
    const secret = routerSecrets.find((row) => row.username === username);
    if (!secret) return;
    setForm((f) => ({ ...f, pppoe_username: secret.username || '', pppoe_password: secret.password || '', ppp_service: secret.service || 'pppoe', ppp_local_address: secret.local_address || '', ppp_remote_address: secret.remote_address || '' }));
  };
  /** Opsi pencarian manual username secret — bisa dicari via username maupun IP remote.
   *  Username tersimpan (mode edit / secret bukan dari router) tetap tampil sbg "nilai tersimpan". */
  const secretOptions = useMemo(() => {
    const opts = routerSecrets.map((row) => ({ value: row.username, label: row.username, hint: [row.remote_address, row.service || 'pppoe'].filter(Boolean).join(' • ') }));
    if (form.pppoe_username && !routerSecrets.some((row) => row.username === form.pppoe_username)) {
      opts.unshift({ value: form.pppoe_username, label: form.pppoe_username, hint: 'nilai tersimpan' });
    }
    return opts;
  }, [routerSecrets, form.pppoe_username]);
  useEffect(() => { if (secretMode === 'new' && routers.length && !ipPools.length) loadIpPools(); }, [secretMode, routers]);

  // ===== Cascading dropdown wilayah: memuat otomatis turunannya & reset anak =====
  const pickProvinsi = async (code) => {
    setProvCode(code);
    setCity(''); setCityCode(''); setDistrict(''); setDistrictCode(''); setVillage(''); setDesaCode('');
    setRegencies([]); setDistricts([]); setVillages([]);
    if (!code) return;
    setWilayahLoading('kota');
    try {
      const { data } = await api.get(`/wilayah/kota/${code}`);
      setRegencies(data.rows || []);
    } catch (err) { toast(err.response?.data?.message || 'Gagal memuat daftar kota', 'danger'); }
    finally { setWilayahLoading(''); }
  };
  const pickKota = async (code) => {
    setCityCode(code);
    setCity(regencies.find((r) => r.code === code)?.name || '');
    setDistrict(''); setDistrictCode(''); setVillage(''); setDesaCode('');
    setDistricts([]); setVillages([]);
    if (!code) return;
    setWilayahLoading('kecamatan');
    try {
      const { data } = await api.get(`/wilayah/kecamatan/${code}`);
      setDistricts(data.rows || []);
    } catch (err) { toast(err.response?.data?.message || 'Gagal memuat daftar kecamatan', 'danger'); }
    finally { setWilayahLoading(''); }
  };
  const pickKecamatan = async (code) => {
    setDistrictCode(code);
    setDistrict(districts.find((r) => r.code === code)?.name || '');
    setVillage(''); setDesaCode('');
    setVillages([]);
    if (!code) return;
    setWilayahLoading('desa');
    try {
      const { data } = await api.get(`/wilayah/desa/${code}`);
      setVillages(data.rows || []);
    } catch (err) { toast(err.response?.data?.message || 'Gagal memuat daftar desa', 'danger'); }
    finally { setWilayahLoading(''); }
  };
  const pickDesa = (code) => {
    setDesaCode(code);
    setVillage(villages.find((r) => r.code === code)?.name || '');
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const extra = [`Billing: ${billingType}`, `Masa aktif: ${activePeriod} ${periodUnit}`, `Pemasangan: ${installStatus}${installDate ? ` (${installDate})` : ''}`, `Rencana suspend: ${renewalPlan}`, `Agen: ${agent || '-'} (${fmtIDR(agentCommission)})`, addon && `Addon: ${addon} (${fmtIDR(addonPrice)})`, discount && `Diskon: ${fmtIDR(discount)}`].filter(Boolean).join(' | ');
      const notes = [form.notes, extra].filter(Boolean).join(' | ');
      const payload = { ...form, address, notes, installation_date: installDate || null, installation_status: { 'BELUM TERPASANG': 'pending', 'DALAM PROSES': 'in_progress', TERPASANG: 'installed' }[installStatus], secret_mode: secretMode, ppp_profile: selectedPackage?.mikrotik_profile || '', grace_days: form.grace_days === '' ? null : (form.grace_days ?? null), billing_type: isPrepaid ? 'prabayar' : 'pascabayar' };
      if (berakhirManual) payload.active_until = berakhirManual; // Tanggal Berakhir pilihan manual selalu dipakai (termasuk mode edit)
      else if (!editId && berakhir) payload.active_until = berakhir; // otomatis: batas periode layanan pertama
      if (editId) { await api.put(`/customers/${editId}`, payload); toast('Data pelanggan diperbarui', 'success'); }
      else { const { data } = await api.post('/customers', payload); toast(`Pelanggan dibuat — PPPoE: ${data.pppoe_username} / ${data.pppoe_password}`, 'success'); }
      onSaved();
    } catch (err) { toast(err.response?.data?.message || 'Gagal menyimpan', 'danger'); }
    finally { setSaving(false); }
  };

  /** Paket baru dibuat dari form inline — refresh daftar & langsung pilih paketnya */
  const onPackageSaved = async (pkg) => {
    setShowPkgForm(false);
    toast(`Paket "${pkg?.name || 'baru'}" tersimpan & siap dipilih`, 'success');
    try {
      const { data } = await api.get('/packages');
      setPackages(data.rows);
      if (pkg?.id) setForm((f) => ({ ...f, package_id: String(pkg.id) }));
    } catch { /* biarkan daftar lama */ }
  };

  /** ===== Wilayah / Area: dropdown master + tambah inline ===== */
  const onAreaChange = (e) => {
    const v = e.target.value;
    if (v === '__add__') {
      setAreaForm({ name: '', description: '' });
      setShowAreaForm(true);
      return; // pilihan tidak berubah, modal terbuka
    }
    setForm((f) => ({ ...f, area: v }));
  };

  const saveArea = async (e) => {
    e.preventDefault();
    setSavingArea(true);
    try {
      await api.post('/areas', areaForm);
      const { data } = await api.get('/areas');
      setAreas(data.rows);
      setForm((f) => ({ ...f, area: areaForm.name.trim() }));
      setShowAreaForm(false);
      toast(`Wilayah "${areaForm.name.trim()}" tersimpan & terpilih`, 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan wilayah', 'danger');
    } finally { setSavingArea(false); }
  };

  return <Modal open onClose={onClose} title={editId ? 'Edit Pelanggan' : 'Tambah Pelanggan'} wide>
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div><label className="label">Tanggal Daftar</label><input type="date" className="input" value={form.activation_date} onChange={setF('activation_date')} /></div>
        <div className="md:col-span-2"><label className="label">Nama Pelanggan *</label><input className="input" placeholder="Masukkan Nama Pelanggan" value={form.name} onChange={setF('name')} required /></div>
        <div><label className="label">Nomor KTP <span className="text-slate-400">(tidak wajib diisi)</span></label><input className="input" placeholder="Nomor KTP" value={form.nik || ''} onChange={setF('nik')} /></div>
        <div className="md:col-span-2"><label className="label">Nomor HP / WhatsApp <span className="text-slate-400">(tidak wajib diisi)</span></label><input type="tel" autoComplete="tel" className="input" placeholder="08xxxxxxxxxx atau +628xxxxxxxxxx" value={form.phone || ''} onChange={setF('phone')} /></div>
        <div className="md:col-span-2"><label className="label">Email</label><input type="email" className="input" placeholder="Email Pelanggan" value={form.email || ''} onChange={setF('email')} /></div>
      </div>
      <label className="flex cursor-pointer select-none items-center gap-2 text-xs"><input type="checkbox" checked={showAddressDetail} onChange={(e) => setShowAddressDetail(e.target.checked)} /> Tambahkan Detail Alamat?</label>
      {showAddressDetail && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><label className="label">Provinsi</label><SearchSelect value={provCode} onChange={pickProvinsi} placeholder="Ketik untuk cari provinsi…" options={provinces.map((p) => ({ value: p.code, label: p.name }))} /></div>
            <div><label className="label">Kota / Kabupaten</label><SearchSelect value={cityCode} onChange={pickKota} disabled={!provCode} loading={wilayahLoading === 'kota'} placeholder="Ketik untuk cari kota…" options={regencies.map((k) => ({ value: k.code, label: k.name }))} /></div>
            <div><label className="label">Kecamatan</label><SearchSelect value={districtCode} onChange={pickKecamatan} disabled={!cityCode} loading={wilayahLoading === 'kecamatan'} placeholder="Ketik untuk cari kecamatan…" options={districts.map((k) => ({ value: k.code, label: k.name }))} /></div>
            <div><label className="label">Desa</label><SearchSelect value={desaCode} onChange={pickDesa} disabled={!districtCode} loading={wilayahLoading === 'desa'} placeholder="Ketik untuk cari desa…" options={villages.map((k) => ({ value: k.code, label: k.name }))} /></div>
          </div>
          <div><label className="label">Detail Alamat</label><textarea className="input" rows={2} value={form.address || ''} onChange={setF('address')} /></div>
        </>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div><label className="label">Pilih Wilayah / Area</label><select className="input" value={form.area || ''} onChange={onAreaChange}><option value="">- Pilih Wilayah / Area -</option>{areas.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}{form.area && !areas.some((a) => a.name === form.area) && <option value={form.area}>{form.area} (nilai lama)</option>}{can('customers', 'create') && <option value="__add__">+ Tambah Wilayah / Area…</option>}</select></div><div><label className="label">Lokasi</label><input className="input" placeholder="latitude,longitude" value={form.latitude ? `${form.latitude},${form.longitude || ''}` : ''} onChange={(e) => { const [latitude, longitude] = e.target.value.split(','); setForm((f) => ({ ...f, latitude, longitude })); }} /></div><div><label className="label">Kategori / Tag</label><input className="input" value={form.tag || ''} onChange={setF('tag')} placeholder="VIP / Umum" /></div></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"><div className="md:col-span-2"><label className="label">Pilih Paket Pelanggan</label><select className="input" value={form.package_id} onChange={setF('package_id')}><option value="">- Pilih Paket -</option>{packages.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.speed})</option>)}</select></div>{can('packages', 'create') ? <button type="button" onClick={() => setShowPkgForm(true)} title="Buat paket baru langsung dari sini — tanpa pindah halaman" className="group flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent-blue/40 bg-accent-blue/5 px-3 py-2 text-sm font-semibold text-accent-blue transition-all duration-200 hover:border-accent-blue hover:bg-accent-blue/10 hover:shadow-lg hover:shadow-accent-blue/20 active:scale-[0.97]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-blue/15 transition-all duration-200 group-hover:bg-accent-blue group-hover:text-white"><Plus size={14} strokeWidth={2.5} className="transition-transform duration-300 group-hover:rotate-90" /></span>Tambah Paket Baru</button> : <Link to="/paket" className="text-sm text-accent-blue hover:underline pb-2">+ Tambah paket di Paket Internet</Link>}</div>
      <section className="space-y-3"><h3 className="text-xs font-semibold text-accent-blue">PPP SECRETS</h3><div className="grid grid-cols-1 md:grid-cols-4 gap-3"><div><label className="label">Sumber Secrets</label><select className="input" value={secretMode} onChange={(e) => { setSecretMode(e.target.value); if (e.target.value === 'router' && !routerSecrets.length) loadSecrets(); }}><option value="router">AMBIL DARI ROUTER</option><option value="new">BUAT SECRETS BARU</option><option value="none">TANPA PPP SECRETS</option></select></div><div><label className="label">Username PPPoE</label>{secretMode === 'router' ? <div className="flex items-center gap-1.5"><SearchSelect value={form.pppoe_username} onChange={pickSecret} placeholder="Ketik untuk cari username / IP…" options={secretOptions} loading={secretsLoading} emptyText="username secret tidak ditemukan" className="flex-1" /><button type="button" title="Muat ulang daftar dari router" onClick={loadSecrets} disabled={secretsLoading} className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-accent-blue dark:hover:bg-navy-700 disabled:opacity-50 disabled:cursor-not-allowed"><RefreshCw size={14} className={secretsLoading ? 'animate-spin' : ''} /></button></div> : <input className="input" value={form.pppoe_username || ''} onChange={setF('pppoe_username')} placeholder="username baru" />}</div><div><label className="label">Password PPPoE</label><input className="input" type="text" value={form.pppoe_password || ''} onChange={setF('pppoe_password')} readOnly={secretMode === 'router'} placeholder={secretMode === 'router' ? 'otomatis dari router' : 'password secret baru'} /></div><div><label className="label">Service</label><select className="input" value={form.ppp_service || ''} onChange={setF('ppp_service')} disabled={secretMode === 'router'}><option value="pppoe">pppoe</option><option value="any">any</option><option value="pptp">pptp</option><option value="l2tp">l2tp</option><option value="sstp">sstp</option></select></div><div><label className="label">ODP</label><select className="input" value={form.odp || ''} onChange={setF('odp')}><option value="">TANPA ODP</option>{['ODP-SW-01', 'ODP-SW-02', 'ODP-UT-01', 'ODP-TM-01', 'ODP-BR-01'].map((odp) => <option key={odp}>{odp}</option>)}</select></div><div><label className="label">Tipe IP</label><select className="input" value={form.ppp_type_ip || 'IP Pools'} onChange={setF('ppp_type_ip')}><option>IP Pools</option><option>Static IP</option><option>DHCP</option></select></div><div><label className="label">Local Address</label><input className="input" value={form.ppp_local_address || ''} onChange={setF('ppp_local_address')} readOnly={secretMode === 'router'} placeholder={secretMode === 'router' ? 'otomatis dari router' : 'opsional'} /></div><div><label className="label">Remote Address</label>{secretMode === 'new' && form.ppp_type_ip === 'IP Pools' ? <select className="input" value={form.ppp_remote_address || ''} onChange={setF('ppp_remote_address')}><option value="">- Pilih IP Pool -</option>{ipPools.map((pool) => <option key={pool._id || pool.name} value={pool.name}>{pool.name} ({pool.ranges})</option>)}</select> : <input className="input" value={form.ppp_remote_address || ''} onChange={setF('ppp_remote_address')} readOnly={secretMode === 'router'} />}</div></div></section>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div><label className="label">Tambahkan Addon</label><input className="input" placeholder="Nama addon (opsional)" value={addon} onChange={(e) => setAddon(e.target.value)} /></div><div><label className="label">Tarif Addon</label><input type="number" min="0" className="input" value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} /></div><div><label className="label">Tarif Paket</label><div className="input bg-slate-50 dark:bg-navy-800">{fmtIDR(price)}</div></div></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div><label className="label">Diskon</label><input type="number" min="0" className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div><div><label className="label">PPN ({tax}%)</label><div className="input bg-slate-50 dark:bg-navy-800">{fmtIDR(taxAmount)}</div></div><div><label className="label">Total Tagihan</label><div className="input font-bold text-accent-blue">{fmtIDR(total)}</div></div></div>
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-accent-blue">PENAGIHAN & MASA AKTIF</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="label">Jenis Penagihan</label>
            <select className="input" value={billingType} onChange={(e) => setBillingType(e.target.value)}>
              <option>PASCABAYAR | PAKAI DULU BARU BAYAR</option>
              <option>PRABAYAR | BAYAR DI MUKA</option>
            </select>
          </div>
          <div>
            <label className="label">Masa Aktif</label>
            <div className="flex">
              <input type="number" min="1" className="input rounded-r-none" value={activePeriod} onChange={(e) => setActivePeriod(e.target.value)} />
              <select className="input w-24 shrink-0 rounded-l-none border-l-0" value={periodUnit} onChange={(e) => setPeriodUnit(e.target.value)}>
                <option>BULAN</option><option>HARI</option><option>TAHUN</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Siklus Tagihan</label>
            <select className="input" value={form.billing_day ?? ''} onChange={setF('billing_day')}>
              <option value="">IKUT PENGATURAN GLOBAL</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Tanggal {d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status Pemasangan</label>
            <select className="input" value={installStatus} onChange={(e) => setInstallStatus(e.target.value)}>
              <option>TERPASANG</option><option>BELUM TERPASANG</option><option>DALAM PROSES</option>
            </select>
          </div>
          <div>
            <label className="label">Status Layanan</label>
            <select className="input" value={form.status} onChange={setF('status')}>
              <option value="active">AKTIF</option><option value="inactive">NONAKTIF</option><option value="isolated">ISOLIR</option><option value="disabled">DISABLE</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Tanggal Pemasangan</label>
            <div className="relative">
              <Wrench size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="date" className="input pl-9" value={installDate || ''} onChange={(e) => setInstallDate(e.target.value)} />
            </div>
          </div>
          <div className="md:col-start-3">
            <label className="label">Tanggal Aktif</label>
            <div className="relative">
              <CalendarDays size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="date" className="input pl-9" value={form.activation_date || ''} onChange={setF('activation_date')} />
            </div>
            <button type="button" onClick={() => setShowScheme((v) => !v)} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-accent-blue/10 px-2.5 py-1.5 text-[11px] font-semibold text-accent-blue transition hover:bg-accent-blue/20">
              <CheckCircle2 size={13} /> {showScheme ? 'SEMBUNYIKAN SKEMA PEMBAYARAN' : 'CEK SKEMA PEMBAYARAN'}
            </button>
          </div>
          <div>
            <label className="label">Tanggal Berakhir</label>
            <div className="flex gap-1">
              <input
                type="date"
                title="Acuan skema tagihan: periode pertama s/d sebelum tanggal ini — otomatis dari Siklus Tagihan dan Masa Aktif; Batas Waktu Pembayaran hanya menggeser jatuh tempo, bisa dipilih manual"
                className={`input flex-1 ${berakhirManual ? '' : 'bg-slate-50 dark:bg-navy-800'}`}
                value={berakhirFinal || ''}
                onChange={(e) => pickBerakhir(e.target.value || null)}
                onClick={(e) => e.target.showPicker?.()}
              />
              {berakhirManual && (
                <button type="button" onClick={() => pickBerakhir(null)} title="Kembalikan ke hitungan otomatis" className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-accent-blue dark:hover:bg-navy-700">
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
            {!berakhirManual && berakhirFinal && (
              <p className="mt-1 text-[10px] text-slate-400">
                Otomatis: batas periode layanan. Jatuh tempo tagihan {effGrace > 0 ? `+ ${effGrace} hari setelah Tanggal Berakhir` : 'tepat pada Tanggal Berakhir'}.
              </p>
            )}
          </div>          <div className="md:col-span-2">
            <label className="label">Batas Waktu Pembayaran / Suspend / Isolir</label>
            <div className="relative">
              <Clock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select className="input pl-9" value={form.grace_days ?? ''} onChange={setF('grace_days')}>
                <option value="">IKUT PENGATURAN GLOBAL</option>
                {GRACE_DAYS.map((d) => <option key={d} value={d}>+{d} HARI setelah Tanggal Berakhir</option>)}
              </select>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Rencana | ( PEMBAYARAN PELANGGAN YANG BERSTATUS SUSPEND )</label>
            <div className="relative">
              <CalendarDays size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select className="input pl-9" value={renewalPlan} onChange={(e) => setRenewalPlan(e.target.value)}>
                <option>UBAH TANGGAL AKTIF SESUAI TANGGAL BERAKHIR</option>
                <option>PERPANJANG DARI TANGGAL AKTIF</option>
              </select>
            </div>
          </div>
          <div className="md:col-span-3">
            <label className="label">Marketing / Agen</label>
            <div className="relative">
              <User size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="Nama agen / marketing" />
            </div>
          </div>
          <div>
            <label className="label">Komisi Agen / Periode</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
              <input type="number" min="0" className="input pl-8 text-right" value={agentCommission} onChange={(e) => setAgentCommission(e.target.value)} />
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={Number(form.no_auto_isolate) === 1} onChange={(e) => setForm((f) => ({ ...f, no_auto_isolate: e.target.checked ? 1 : 0 }))} />
          Jangan Pernah Eksekusi ISOLIR khusus untuk pelanggan ini ?
        </label>
        {showScheme && schemeRows.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Skema Pembayaran — periode pertama s/d Tanggal Berakhir {isPrepaid ? '(TANPA PRORATA — BAYAR DI MUKA)' : '(prorata bila belum penuh)'}{price ? ` · tarif ${fmtIDR(price)}/periode` : ''}
            </p>
            <BillSchemePreview rows={schemeRows} />
          </div>
        )}
      </section>
      <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Pelanggan'}</Button></div>
    </form>
    <PackageFormModal
      open={showPkgForm}
      onClose={() => setShowPkgForm(false)}
      onSaved={onPackageSaved}
      hideSettingRouterLink
    />
    <Modal open={showAreaForm} onClose={() => setShowAreaForm(false)} title="Tambah Wilayah / Area">
      <form onSubmit={saveArea} className="space-y-3">
        <div>
          <label className="label">Nama Wilayah / Area *</label>
          <input className="input" placeholder="Contoh: Area Timur / Perum Griya Asri" value={areaForm.name}
            onChange={(e) => setAreaForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
        </div>
        <div>
          <label className="label">Keterangan</label>
          <input className="input" placeholder="Opsional — patokan jalan / blok" value={areaForm.description}
            onChange={(e) => setAreaForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => setShowAreaForm(false)}>Batal</Button>
          <Button type="submit" disabled={savingArea}>{savingArea ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  </Modal>;
}