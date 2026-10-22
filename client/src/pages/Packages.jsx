import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Gauge, Server } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Button, Empty } from '../components/ui.jsx';
import PackageFormModal from '../components/PackageFormModal.jsx';
import { fmtIDR, fmtNum } from '../utils/format.js';

export default function Packages() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(async () => {
    const { data } = await api.get('/packages');
    setRows(data.rows);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Deep-link ?new=1 dari halaman lain
  useEffect(() => {
    if (params.get('new') === '1' && can('packages', 'create')) {
      setEditing(null);
      setShowForm(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams, can]);

  const remove = async (id) => {
    if (!(await confirm({
      title: 'Hapus Paket',
      message: 'Paket internet ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.',
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    try {
      await api.delete(`/packages/${id}`);
      toast('Paket dihapus', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menghapus', 'danger');
    }
  };

  return (
    <div>
      <PageHeader
        title="Paket Internet"
        subtitle="Kelola paket & profile bandwidth Mikrotik (PRD 5.5)"
        actions={can('packages', 'create') && (
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus size={15} /> Tambah Paket
          </Button>
        )}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {rows.map((p) => (
          <Card key={p.id} className={!p.is_active ? 'opacity-60' : ''}>
            <div className="flex items-start justify-between">
              <div className="p-2.5 rounded-xl bg-accent-purple/15 text-accent-purple"><Gauge size={20} /></div>
              <div className="flex gap-1">
                {can('packages', 'edit') && (
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setShowForm(true); }}>
                    <Pencil size={13} />
                  </Button>
                )}
                {can('packages', 'delete') && (
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 size={13} className="text-accent-red" /></Button>
                )}
              </div>
            </div>
            <h3 className="font-bold mt-3">{p.name}</h3>
            <p className="text-sm text-accent-blue font-semibold">{p.speed}</p>
            <p className="text-lg font-bold mt-1">{fmtIDR(p.price)}<span className="text-xs font-normal text-slate-400">/bln</span></p>
            {Number(p.tax_rate) > 0 && (
              <p className="text-[11px] text-slate-400">dasar {fmtIDR(p.base_price)} + PPN {fmtNum(p.tax_rate)}%</p>
            )}
            <p className="text-xs text-slate-400 mt-1">{p.subscribers} pelanggan · profile: {p.mikrotik_profile || '-'}</p>
            {p.router_name && (
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1"><Server size={11} /> {p.router_name}</p>
            )}
          </Card>
        ))}
      </div>
      {rows.length === 0 && <Card><Empty text="Belum ada paket" /></Card>}

      <PackageFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); toast('Paket tersimpan', 'success'); load(); }}
        editPackage={editing}
      />
    </div>
  );
}