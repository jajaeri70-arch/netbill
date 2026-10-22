import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Download, FileText, Loader2, Pencil, Plus, ReceiptText, Search, Trash2, WalletCards } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { Badge, Button, Card, Empty, Modal, Pagination, StatCard } from '../components/ui.jsx';
import { fmtDate, fmtIDR, statusLabel } from '../utils/format.js';

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 7)}-01`;
const emptyForm = { category_id: '', amount: '', tx_date: today, description: '', requires_approval: '' };

export default function Transactions() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState(0);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ q: '', category_id: '', status: 'all', from: monthStart, to: today });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const limit = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/transactions', { params: { ...filters, type: 'expense', page, limit } });
      setRows(data.rows); setTotal(data.total); setSum(data.sum);
    } catch { toast('Gagal memuat laporan pengeluaran', 'danger'); }
    finally { setLoading(false); }
  }, [filters, page, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/transaction-categories', { params: { type: 'expense' } })
      .then(({ data }) => setCategories(data.rows.filter((c) => c.is_active)))
      .catch(() => toast('Gagal memuat kategori pengeluaran', 'danger'));
  }, [toast]);

  const pendingCount = useMemo(() => rows.filter((row) => row.status === 'pending').length, [rows]);
  const updateFilter = (key, value) => { setFilters((old) => ({ ...old, [key]: value })); setPage(1); };
  const resetFilters = () => { setFilters({ q: '', category_id: '', status: 'all', from: monthStart, to: today }); setPage(1); };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(emptyForm); };
  const openEdit = (row) => { setForm({ category_id: row.category_id || '', amount: row.amount, tx_date: row.tx_date, description: row.description || '', requires_approval: '' }); setEditId(row.id); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const fd = new FormData(); fd.append('type', 'expense');
      ['category_id', 'amount', 'tx_date', 'description', 'requires_approval'].forEach((key) => fd.append(key, form[key] || ''));
      if (form._file) fd.append('attachment', form._file);
      if (editId) await api.put(`/transactions/${editId}`, fd); else await api.post('/transactions', fd);
      toast(editId ? 'Pengeluaran diperbarui' : 'Pengeluaran berhasil dicatat', 'success'); closeForm(); load();
    } catch (err) { toast(err.response?.data?.message || 'Gagal menyimpan pengeluaran', 'danger'); }
    finally { setSaving(false); }
  };

  const remove = async (row) => {
    if (!(await confirm({ title: 'Hapus Pengeluaran', message: `Catatan ${fmtIDR(row.amount)} akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`, confirmText: 'Ya, Hapus', tone: 'danger', icon: Trash2 }))) return;
    try { await api.delete(`/transactions/${row.id}`); toast('Pengeluaran dihapus', 'success'); load(); }
    catch (err) { toast(err.response?.data?.message || 'Gagal menghapus pengeluaran', 'danger'); }
  };
  const approve = async (id) => {
    try { await api.post(`/transactions/${id}/approve`); toast('Pengeluaran disetujui', 'success'); load(); }
    catch (err) { toast(err.response?.data?.message || 'Gagal menyetujui pengeluaran', 'danger'); }
  };
  const exportCsv = async () => {
    try {
      const { data } = await api.get('/transactions/export', { params: { ...filters, type: 'expense' }, responseType: 'blob' });
      const url = URL.createObjectURL(data); const link = document.createElement('a');
      link.href = url; link.download = `laporan-pengeluaran-${filters.from || 'semua'}-${filters.to || 'semua'}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch { toast('Gagal mengekspor laporan', 'danger'); }
  };

  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-orange-50 p-5 shadow-soft dark:border-rose-900/50 dark:from-rose-950/25 dark:via-navy-800 dark:to-orange-950/20">
      <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-rose-300/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-rose-600 dark:text-rose-300"><WalletCards size={14} /> Keuangan operasional</p><h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white">Laporan Pengeluaran</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pantau, catat, dan audit biaya operasional bisnis dalam satu tempat.</p></div><div className="flex flex-wrap gap-2">{can('transactions', 'export') && <Button variant="outline" onClick={exportCsv}><Download size={16} /> Ekspor CSV</Button>}{can('transactions', 'create') && <Button onClick={() => setShowForm(true)}><Plus size={17} /> Catat Pengeluaran</Button>}</div></div>
    </section>

    <div className="grid gap-4 md:grid-cols-3"><StatCard icon={WalletCards} label="Total pengeluaran" value={fmtIDR(sum)} sub={`${total} catatan dalam periode`} color="bg-rose-500/10 text-rose-600 dark:text-rose-300" /><StatCard icon={ReceiptText} label="Rata-rata per catatan" value={fmtIDR(total ? sum / total : 0)} sub="Berdasarkan filter aktif" color="bg-orange-500/10 text-orange-600 dark:text-orange-300" /><StatCard icon={CheckCircle2} label="Menunggu persetujuan" value={pendingCount} sub="Dari halaman data saat ini" color="bg-amber-500/10 text-amber-600 dark:text-amber-300" /></div>

    <Card className="p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} className="text-accent-blue" /> Filter laporan</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"><div className="relative xl:col-span-2"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9" value={filters.q} onChange={(e) => updateFilter('q', e.target.value)} placeholder="Cari keterangan atau kategori..." /></div><select className="input" value={filters.category_id} onChange={(e) => updateFilter('category_id', e.target.value)}><option value="">Semua kategori</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select className="input" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}><option value="all">Semua status</option><option value="approved">Disetujui</option><option value="pending">Menunggu</option></select><input className="input" type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} aria-label="Tanggal mulai" /><div className="flex gap-2"><input className="input min-w-0" type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} aria-label="Tanggal akhir" /><Button variant="ghost" onClick={resetFilters}>Reset</Button></div></div></Card>

    <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-navy-700"><div><h2 className="font-bold">Rincian Pengeluaran</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Data langsung dari catatan transaksi operasional.</p></div><span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{total} catatan</span></div><div className="overflow-x-auto"><table className="w-full min-w-[820px]"><thead><tr className="border-b border-slate-100 bg-slate-50/70 dark:border-navy-700 dark:bg-navy-900/30"><th className="th">Tanggal</th><th className="th">Kategori & keterangan</th><th className="th">Dicatat oleh</th><th className="th">Status</th><th className="th text-right">Jumlah</th><th className="th text-right">Aksi</th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="py-16 text-center"><Loader2 className="mx-auto animate-spin text-accent-blue" /><p className="mt-2 text-sm text-slate-500">Memuat laporan...</p></td></tr> : rows.map((row) => <tr key={row.id} className="table-row"><td className="td whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtDate(row.tx_date)}</td><td className="td"><p className="font-semibold text-slate-700 dark:text-slate-100">{row.category_name || 'Tanpa kategori'}</p><p className="mt-0.5 max-w-md truncate text-xs text-slate-500 dark:text-slate-400">{row.description || 'Tidak ada keterangan'}</p></td><td className="td text-sm text-slate-500 dark:text-slate-400">{row.created_by_name || '-'}</td><td className="td"><Badge value={row.status} label={statusLabel[row.status]} /></td><td className="td text-right font-bold text-rose-600 dark:text-rose-300">{fmtIDR(row.amount)}</td><td className="td"><div className="flex justify-end gap-1">{row.status === 'pending' && can('transactions', 'edit') && <Button size="sm" variant="ghost" title="Setujui" onClick={() => approve(row.id)}><CheckCircle2 size={15} className="text-accent-green" /></Button>}{can('transactions', 'edit') && <Button size="sm" variant="ghost" title="Edit" onClick={() => openEdit(row)}><Pencil size={15} /></Button>}{can('transactions', 'delete') && <Button size="sm" variant="ghost" title="Hapus" onClick={() => remove(row)}><Trash2 size={15} className="text-accent-red" /></Button>}</div></td></tr>)}</tbody></table></div>{!loading && !rows.length && <Empty text="Belum ada pengeluaran pada periode ini" />}<Pagination page={page} total={total} limit={limit} onPage={setPage} /></Card>

    <Modal open={showForm} onClose={closeForm} title={editId ? 'Edit Pengeluaran' : 'Catat Pengeluaran'} className="max-w-2xl">
      <form onSubmit={save} className="space-y-5">
        <div className="relative overflow-hidden rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-orange-50 p-4 dark:border-rose-900/50 dark:from-rose-950/30 dark:to-orange-950/20">
          <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-rose-300/20 blur-2xl" />
          <div className="relative flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white shadow-lg shadow-rose-500/20"><WalletCards size={19} /></span><div><p className="font-semibold text-slate-800 dark:text-white">Detail pengeluaran</p><p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Lengkapi informasi biaya agar laporan operasional tetap akurat.</p></div></div>
        </div>

        <div className="space-y-4">
          <div><label className="label">Kategori pengeluaran <span className="text-rose-500">*</span></label><select className="input" value={form.category_id} onChange={(e) => setForm((old) => ({ ...old, category_id: e.target.value }))} required><option value="">Pilih kategori pengeluaran</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="grid gap-4 sm:grid-cols-5"><div className="sm:col-span-3"><label className="label">Jumlah pengeluaran <span className="text-rose-500">*</span></label><div className="relative"><span className="pointer-events-none absolute inset-y-1.5 left-1.5 flex items-center rounded-md bg-rose-50 px-2.5 text-xs font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">Rp</span><input className="input pl-12 font-semibold tabular-nums" type="number" min="1" inputMode="numeric" value={form.amount} onChange={(e) => setForm((old) => ({ ...old, amount: e.target.value }))} placeholder="0" required /></div></div><div className="sm:col-span-2"><label className="label">Tanggal <span className="text-rose-500">*</span></label><input className="input" type="date" value={form.tx_date} onChange={(e) => setForm((old) => ({ ...old, tx_date: e.target.value }))} required /></div></div>
          <div><div className="mb-1.5 flex items-center justify-between"><label className="label !mb-0">Keterangan</label><span className="text-[11px] text-slate-400">Opsional</span></div><textarea className="input" rows="3" value={form.description} onChange={(e) => setForm((old) => ({ ...old, description: e.target.value }))} placeholder="Contoh: pembelian kabel untuk perbaikan area Selatan" /></div>
        </div>

        {!editId && <div className="grid gap-3 sm:grid-cols-2"><label className="group cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 transition hover:border-accent-blue hover:bg-accent-blue/5 dark:border-navy-600 dark:bg-navy-900/30 dark:hover:border-accent-blue"><input className="sr-only" type="file" accept="image/*,application/pdf" onChange={(e) => setForm((old) => ({ ...old, _file: e.target.files[0] }))} /><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-accent-blue shadow-sm dark:bg-navy-700"><FileText size={17} /></span><span className="min-w-0"><span className="block text-xs font-semibold text-slate-700 dark:text-slate-100">{form._file?.name || 'Tambah bukti'}</span><span className="block truncate text-[11px] text-slate-400">JPG, PNG, atau PDF</span></span></div></label><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-amber-300 hover:bg-amber-50/60 dark:border-navy-700 dark:bg-navy-900/30 dark:hover:border-amber-700"><input type="checkbox" checked={form.requires_approval === '1'} onChange={(e) => setForm((old) => ({ ...old, requires_approval: e.target.checked ? '1' : '' }))} /><span><span className="block text-xs font-semibold text-slate-700 dark:text-slate-100">Perlu persetujuan</span><span className="block text-[11px] text-slate-400">Tahan finalisasi oleh owner</span></span></label></div>}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-navy-700"><Button type="button" variant="ghost" onClick={closeForm} disabled={saving}>Batal</Button><Button type="submit" className="min-w-40" disabled={saving}>{saving && <Loader2 size={15} className="animate-spin" />}{saving ? 'Menyimpan...' : editId ? 'Simpan Perubahan' : 'Simpan Pengeluaran'}</Button></div>
      </form>
    </Modal>
  </div>;
}