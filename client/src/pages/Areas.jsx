import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, MapPin, Search, RefreshCw } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Button, Badge, Modal, Empty } from '../components/ui.jsx';

const emptyForm = { name: '', description: '', is_active: 1 };

export default function Areas() {
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
      const { data } = await api.get('/areas', { params: s ? { q: s } : {} });
      setRows(data.rows);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal memuat daftar wilayah', 'danger');
    } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ ...emptyForm }); setEditId(null); setShowForm(true); };
  const openEdit = (a) => {
    setForm({ name: a.name || '', description: a.description || '', is_active: a.is_active ? 1 : 0 });
    setEditId(a.id);
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) await api.put(`/areas/${editId}`, form);
      else await api.post('/areas', form);
      toast(editId ? 'Wilayah diperbarui' : 'Wilayah tersimpan', 'success');
      setShowForm(false);
      load(search);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan', 'danger');
    } finally { setSaving(false); }
  };

  const remove = async (a) => {
    if (!(await confirm({
      title: 'Hapus Wilayah',
      message: `Wilayah "${a.name}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    try {
      await api.delete(`/areas/${a.id}`);
      toast('Wilayah dihapus', 'success');
      load(search);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menghapus', 'danger');
    }
  };

  return (
    <div>
      <PageHeader
        title="Daftar Wilayah / Area"
        subtitle="Master wilayah cakupan layanan — dipakai di form data pelanggan"
        actions={can('customers', 'create') && (
          <Button onClick={openCreate}><Plus size={15} /> Tambah Wilayah</Button>
        )}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cari nama atau keterangan wilayah…" value={search}
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
                <th className="py-2">Nama Wilayah</th>
                <th>Keterangan</th>
                <th className="text-center">Pelanggan</th>
                <th>Status</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
                  <td className="py-2.5 font-semibold flex items-center gap-2">
                    <MapPin size={14} className="text-accent-blue" /> {a.name}
                  </td>
                  <td className="text-slate-500 dark:text-slate-400 text-xs">{a.description || '-'}</td>
                  <td className="text-center">{a.customers_count}</td>
                  <td><Badge value={a.is_active ? 'active' : 'inactive'} label={a.is_active ? 'Aktif' : 'Nonaktif'} /></td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      {can('customers', 'edit') && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil size={13} /></Button>
                      )}
                      {can('customers', 'delete') && (
                        <Button size="sm" variant="ghost" onClick={() => remove(a)}><Trash2 size={13} className="text-accent-red" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty text={search ? 'Tidak ada wilayah yang cocok' : 'Belum ada wilayah — tambahkan yang pertama'} />}
        </div>
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Wilayah / Area' : 'Tambah Wilayah / Area'}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Nama Wilayah / Area *</label>
            <input className="input" placeholder="Contoh: Area Timur / Perum Griya Asri" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
          </div>
          <div>
            <label className="label">Keterangan</label>
            <input className="input" placeholder="Opsional — patokan jalan / blok" value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked ? 1 : 0 }))} />
            Aktif (tampil di dropdown form pelanggan)
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