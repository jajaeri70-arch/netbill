import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Landmark, Search, RefreshCw } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Button, Badge, Modal, Empty } from '../components/ui.jsx';
import { fmtNum } from '../utils/format.js';

const emptyForm = { name: '', account_number: '', account_name: '', note: '', is_active: 1 };

/** Master Bank — daftar rekening tujuan pembayaran (dipakai di metode form Catat Pembayaran) */
export default function Banks() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (s = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/banks', { params: s ? { q: s } : {} });
      setRows(data.rows || []);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal memuat daftar bank', 'danger');
    } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ ...emptyForm }); setEditId(null); setShowForm(true); };
  const openEdit = (b) => {
    setForm({
      name: b.name || '', account_number: b.account_number || '',
      account_name: b.account_name || '', note: b.note || '', is_active: b.is_active ? 1 : 0,
    });
    setEditId(b.id);
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) await api.put(`/banks/${editId}`, form);
      else await api.post('/banks', form);
      toast(editId ? 'Akun bank diperbarui' : 'Akun bank tersimpan', 'success');
      setShowForm(false);
      load(search);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan', 'danger');
    } finally { setSaving(false); }
  };

  const remove = async (b) => {
    if (!(await confirm({
      title: 'Hapus Akun Bank',
      message: `Akun bank "${b.name} ${b.account_number}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    try {
      await api.delete(`/banks/${b.id}`);
      toast('Akun bank dihapus', 'success');
      load(search);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menghapus', 'danger');
    }
  };

  return (
    <div>
      <PageHeader
        title="Master Bank"
        subtitle="Daftar rekening tujuan pembayaran — tampil sebagai pilihan metode Transfer di form Catat Pembayaran"
        actions={can('banks', 'create') && (
          <Button onClick={openCreate}><Plus size={15} /> Tambah Akun Bank</Button>
        )}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cari nama bank / no rekening / atas nama…" value={search}
              onChange={(e) => { setSearch(e.target.value); load(e.target.value); }} />
          </div>
          <Button variant="outline" onClick={() => load(search)}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Muat ulang
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200/60 dark:border-navy-700">
                <th className="py-2">Bank</th>
                <th>No Rekening</th>
                <th>Atas Nama</th>
                <th className="text-center">Dipakai</th>
                <th>Status</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
                  <td className="py-2.5 font-semibold">
                    <span className="flex items-center gap-2">
                      <Landmark size={14} className="text-accent-blue" /> {b.name}
                    </span>
                    {b.note && <span className="block text-xs text-slate-400 font-normal mt-0.5">{b.note}</span>}
                  </td>
                  <td className="font-mono">{b.account_number}</td>
                  <td className="text-slate-500 dark:text-slate-400">{b.account_name}</td>
                  <td className="text-center">{fmtNum(b.payments_count)}×</td>
                  <td><Badge value={b.is_active ? 'active' : 'inactive'} label={b.is_active ? 'Aktif' : 'Nonaktif'} /></td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      {can('banks', 'edit') && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(b)}><Pencil size={13} /></Button>
                      )}
                      {can('banks', 'delete') && (
                        <Button size="sm" variant="ghost" onClick={() => remove(b)}><Trash2 size={13} className="text-accent-red" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty text={search ? 'Tidak ada akun bank yang cocok' : 'Belum ada akun bank — tambahkan yang pertama'} />}
        </div>
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Akun Bank' : 'Tambah Akun Bank'}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Nama Bank *</label>
            <input className="input" placeholder="Contoh: BCA / BRI / Mandiri" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
          </div>
          <div>
            <label className="label">No Rekening *</label>
            <input className="input font-mono" placeholder="Contoh: 1234567890" value={form.account_number}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Atas Nama *</label>
            <input className="input" placeholder="Nama pemilik rekening" value={form.account_name}
              onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Catatan</label>
            <input className="input" placeholder="Opsional — misal: khusus pembayaran area timur" value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked ? 1 : 0 }))} />
            Aktif (tampil di pilihan metode pembayaran)
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
