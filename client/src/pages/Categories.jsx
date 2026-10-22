import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Badge, Button, Modal, Empty } from '../components/ui.jsx';

export default function Categories() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'expense', description: '' });
  const [editId, setEditId] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get('/transaction-categories');
    setRows(data.rows);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editId) await api.put(`/transaction-categories/${editId}`, form);
      else await api.post('/transaction-categories', form);
      toast('Kategori tersimpan', 'success');
      setShowForm(false);
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan', 'danger');
    }
  };

  const remove = async (id) => {
    if (!(await confirm({
      title: 'Hapus Kategori',
      message: 'Kategori transaksi ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.',
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    await api.delete(`/transaction-categories/${id}`);
    toast('Kategori dihapus', 'success');
    load();
  };

  return (
    <div>
      <PageHeader
        title="Kategori Transaksi"
        subtitle="Kustomisasi kategori pemasukan & pengeluaran non-tagihan (PRD 5.9)"
        actions={can('categories', 'create') && (
          <Button onClick={() => { setForm({ name: '', type: 'expense', description: '' }); setEditId(null); setShowForm(true); }}>
            <Plus size={15} /> Tambah Kategori
          </Button>
        )}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['income', 'expense'].map((type) => (
          <Card key={type} title={type === 'income' ? 'Pemasukan' : 'Pengeluaran'} bodyClass="!p-0">
            <div className="divide-y divide-slate-100 dark:divide-navy-700/50">
              {rows.filter((r) => r.type === type).map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.description || '-'}</p>
                  </div>
                  {can('categories', 'edit') && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setForm({ name: c.name, type: c.type, description: c.description || '' }); setEditId(c.id); setShowForm(true); }}>
                        <Pencil size={13} />
                      </Button>
                      {can('categories', 'delete') && (
                        <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 size={13} className="text-accent-red" /></Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {rows.filter((r) => r.type === type).length === 0 && <Empty text="Belum ada kategori" />}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Kategori' : 'Tambah Kategori'}>
        <form onSubmit={save} className="space-y-3">
          <div><label className="label">Nama</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div>
            <label className="label">Tipe</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="income">Pemasukan</option>
              <option value="expense">Pengeluaran</option>
            </select>
          </div>
          <div><label className="label">Deskripsi</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Batal</Button>
            <Button type="submit">Simpan</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
