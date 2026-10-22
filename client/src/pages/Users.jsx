import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, KeyRound, UserRound, AtSign, Mail, Phone, ShieldCheck, Lock, Eye, EyeOff, Save, Info, Search, Users as UsersIcon, UserCheck, UserX } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Button, Modal, Empty, SectionTitle, StatCard } from '../components/ui.jsx';
import { fmtDateTime, roleLabel } from '../utils/format.js';

const emptyForm = { name: '', username: '', email: '', password: '', role: 'finance', phone: '' };

/** Deskripsi singkat tiap role (RBAC — PRD 5.1) */
const ROLE_HINT = {
  owner: 'Akses penuh ke seluruh menu & pengaturan sistem.',
  finance: 'Kelola pembayaran, pengeluaran, dan laporan keuangan.',
  teknisi: 'Kelola perangkat, PPPoE, maintenance & troubleshooting jaringan.',
  kasir: 'Terima pembayaran & layanan pelanggan (CS).',
};

/** Warna identitas per role — dipakai avatar & badge */
const ROLE_COLOR = {
  owner: 'bg-accent-purple/15 text-accent-purple',
  finance: 'bg-accent-blue/15 text-accent-blue',
  teknisi: 'bg-accent-green/15 text-accent-green',
  kasir: 'bg-accent-orange/15 text-accent-orange',
};

/** Inisial nama untuk avatar (maks 2 huruf) */
const initials = (name = '') => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

export default function Users() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const isSelfOwner = editId === me?.id && form.role === 'owner';

  const load = useCallback(async () => {
    const { data } = await api.get('/users');
    setRows(data.rows);
  }, []);
  useEffect(() => { load(); }, [load]);

  /** Statistik ringkas untuk kartu atas */
  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((u) => u.is_active).length,
    inactive: rows.filter((u) => !u.is_active).length,
    owner: rows.filter((u) => u.role === 'owner').length,
  }), [rows]);

  /** Filter klien: pencarian + role + status */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((u) =>
      (!q || [u.name, u.username, u.email].some((v) => (v || '').toLowerCase().includes(q))) &&
      (roleFilter === 'all' || u.role === roleFilter) &&
      (statusFilter === 'all' || (statusFilter === 'active' ? !!u.is_active : !u.is_active))
    );
  }, [rows, search, roleFilter, statusFilter]);

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editId) {
        const { password, ...rest } = form;
        await api.put(`/users/${editId}`, rest);
      } else {
        await api.post('/users', form);
      }
      toast('Pengguna tersimpan', 'success');
      setShowForm(false);
      setShowPass(false);
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { is_active: u.is_active ? 0 : 1 });
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal', 'danger');
    }
  };

  const resetPass = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/users/${resetUser.id}/reset-password`, { password: newPass });
      toast('Password direset', 'success');
      setResetUser(null);
      setNewPass('');
      setShowPass(false);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u) => {
    if (!(await confirm({
      title: 'Hapus Pengguna',
      message: `Akun "${u.username}" akan dihapus permanen dan tidak dapat masuk ke sistem lagi.`,
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast('Pengguna dihapus', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal', 'danger');
    }
  };

  return (
    <div>
      <PageHeader
        title="Pengguna & Role"
        subtitle="Kelola akun dan hak akses (RBAC — PRD 5.1)"
        actions={<Button onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}><Plus size={15} /> Tambah Pengguna</Button>}
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StatCard icon={UsersIcon} label="Total Pengguna" value={stats.total} />
        <StatCard icon={UserCheck} label="Aktif" value={stats.active} color="bg-accent-green/15 text-accent-green" />
        <StatCard icon={UserX} label="Nonaktif" value={stats.inactive} color="bg-accent-red/15 text-accent-red" />
        <StatCard icon={ShieldCheck} label="Owner" value={stats.owner} color="bg-accent-purple/15 text-accent-purple" />
      </div>
      <Card bodyClass="!p-0 overflow-x-auto">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-slate-200/60 dark:border-navy-700">
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cari nama, username, email…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <select className="input !w-auto text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter role">
              <option value="all">Semua Role</option>
              {Object.keys(ROLE_HINT).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
            <select className="input !w-auto text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status">
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>
        </div>
        <table className="w-full min-w-[680px]">
          <thead className="border-b border-slate-200/60 dark:border-navy-700">
            <tr>
              <th className="th">Pengguna</th><th className="th">Role</th>
              <th className="th">Login Terakhir</th><th className="th">Status</th><th className="th text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${ROLE_COLOR[u.role] || ROLE_COLOR.finance}`}>
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate flex items-center gap-1.5">
                        {u.name}
                        {u.id === me?.id && <span className="rounded-full bg-accent-blue/15 text-accent-blue px-1.5 py-px text-[10px] font-semibold">Anda</span>}
                      </p>
                      <p className="text-xs text-slate-400 font-mono truncate">@{u.username}</p>
                    </div>
                  </div>
                </td>
                <td className="td">
                  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_COLOR[u.role] || ROLE_COLOR.finance}`}>
                    {roleLabel[u.role] || u.role}
                  </span>
                </td>
                <td className="td text-sm">{u.last_login_at ? fmtDateTime(u.last_login_at) : <span className="text-slate-400">Belum pernah</span>}</td>
                <td className="td">
                  <button
                    onClick={() => toggleActive(u)}
                    disabled={u.role === 'owner'}
                    title={u.role === 'owner' ? 'Akun owner tidak dapat dinonaktifkan' : u.is_active ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan'}
                    className={`relative h-5 w-9 rounded-full transition-colors ${u.role === 'owner' ? 'opacity-60 cursor-not-allowed' : ''} ${u.is_active ? 'bg-accent-green' : 'bg-slate-300 dark:bg-navy-600'}`}
                    role="switch" aria-checked={!!u.is_active} aria-label={u.is_active ? 'Nonaktifkan akun' : 'Aktifkan akun'}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${u.is_active ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </td>
                <td className="td text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" title="Reset Password" onClick={() => setResetUser(u)}><KeyRound size={13} /></Button>
                    <Button size="sm" variant="ghost" title="Edit" onClick={() => { setForm({ ...emptyForm, ...u, password: '' }); setEditId(u.id); setShowForm(true); }}><Pencil size={13} /></Button>
                    {u.id !== me?.id && u.role !== 'owner' && (
                      <Button size="sm" variant="ghost" onClick={() => remove(u)}><Trash2 size={13} className="text-accent-red" /></Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <Empty text={rows.length ? 'Tidak ada pengguna yang cocok dengan filter' : 'Belum ada pengguna'} />}
        {filtered.length > 0 && filtered.length !== rows.length && (
          <p className="px-4 py-2.5 text-xs text-slate-400 border-t border-slate-200/60 dark:border-navy-700">
            Menampilkan {filtered.length} dari {rows.length} pengguna
          </p>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Pengguna' : 'Tambah Pengguna'}>
        <form onSubmit={save} className="space-y-5">
          <section>
            <SectionTitle icon={UserRound} title="Data Pengguna" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Nama Lengkap <span className="text-accent-red">*</span></label>
                <div className="relative">
                  <UserRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9" placeholder="cth: Budi Santoso" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="label">Username <span className="text-accent-red">*</span></label>
                <div className="relative">
                  <AtSign size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9" placeholder="cth: budi" autoComplete="off" value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} required />
                </div>
                {editId && <p className="text-[11px] text-slate-400 mt-1">Username dapat diubah. Gunakan username unik.</p>}
              </div>
              <div>
                <label className="label">Email <span className="text-accent-red">*</span></label>
                <div className="relative">
                  <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="email" className="input pl-9" placeholder="nama@domain.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="label">No. HP</label>
                <div className="relative">
                  <Phone size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="tel" className="input pl-9" placeholder="cth: 0812xxxxxxx" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle icon={ShieldCheck} title="Akses & Keamanan" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Role <span className="text-accent-red">*</span></label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={isSelfOwner}>
                  <option value="owner">Owner — akses penuh</option>
                  <option value="finance">Finance</option>
                  <option value="teknisi">Teknisi/NOC</option>
                  <option value="kasir">Kasir/CS</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5">{ROLE_HINT[form.role] || ''}</p>
              </div>
              {!editId && (
                <div>
                  <label className="label">Password <span className="text-accent-red">*</span></label>
                  <div className="relative">
                    <Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type={showPass ? 'text' : 'password'} className="input pl-9 pr-9" placeholder="Min. 6 karakter" autoComplete="new-password"
                      value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
                    <button type="button" tabIndex={-1} aria-label={showPass ? 'Sembunyikan password' : 'Lihat password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      onClick={() => setShowPass((v) => !v)}>
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/60 dark:border-navy-700">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Menyimpan…' : (<><Save size={15} /> Simpan</>)}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!resetUser} onClose={() => setResetUser(null)} title={`Reset Password — ${resetUser?.username || ''}`}>
        <form onSubmit={resetPass} className="space-y-4">
          <p className="flex items-start gap-2 rounded-xl border border-slate-200 dark:border-navy-600 bg-slate-50 dark:bg-navy-700/40 p-3 text-xs text-slate-500 dark:text-slate-400">
            <Info size={14} className="mt-0.5 shrink-0 text-accent-blue" />
            <span>
              Tentukan password baru untuk akun <b className="text-slate-600 dark:text-slate-300">{resetUser?.name || resetUser?.username}</b>{' '}
              ({resetUser?.username}). Password lama akan langsung tidak berlaku.
            </span>
          </p>
          <div>
            <label className="label">Password Baru <span className="text-accent-red">*</span></label>
            <div className="relative">
              <Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type={showPass ? 'text' : 'password'} className="input pl-9 pr-9" placeholder="Min. 6 karakter" autoComplete="new-password"
                value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={6} />
              <button type="button" tabIndex={-1} aria-label={showPass ? 'Sembunyikan password' : 'Lihat password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                onClick={() => setShowPass((v) => !v)}>
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Gunakan kombinasi huruf, angka, dan simbol agar lebih kuat.</p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/60 dark:border-navy-700">
            <Button type="button" variant="ghost" onClick={() => setResetUser(null)}>Batal</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Menyimpan…' : (<><KeyRound size={15} /> Reset Password</>)}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
