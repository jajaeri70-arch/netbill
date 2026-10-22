import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Search, Download, Printer, XCircle, Calculator, CalendarDays, Trash2, SlidersHorizontal } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Badge, Button, Pagination, Empty } from '../components/ui.jsx';
import { fmtIDR, fmtDate, statusLabel, periodLabel } from '../utils/format.js';
import PayModal from './PaymentForm.jsx';
import InvoiceAdjustmentModal from '../components/InvoiceAdjustmentModal.jsx';

const FILTER_STORAGE_KEY = 'netbill_invoice_filters';

function savedFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY));
    return {
      period: typeof saved?.period === 'string' ? saved.period : 'all',
      status: typeof saved?.status === 'string' ? saved.status : 'all',
      q: typeof saved?.q === 'string' ? saved.q : '',
    };
  } catch {
    return { period: 'all', status: 'all', q: '' };
  }
}

export default function Invoices() {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const canFinance = ['owner', 'finance'].includes(user?.role);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ billed: 0, paid: 0 });
  const [page, setPage] = useState(1);
  const [periods, setPeriods] = useState([]);
  const [filters] = useState(savedFilters);
  const [period, setPeriod] = useState(filters.period);
  const [status, setStatus] = useState(filters.status);
  const [q, setQ] = useState(filters.q);
  const [payInv, setPayInv] = useState(null);
  const [adjustmentInv, setAdjustmentInv] = useState(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recalculatingDueDates, setRecalculatingDueDates] = useState(false);
  const [selected, setSelected] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [limit, setLimit] = useState(12);

  const load = useCallback(async () => {
    const { data } = await api.get('/invoices', { params: { period, status, q, page, limit } });
    setRows(data.rows);
    setTotal(data.total);
    setSummary(data.summary);
    setSelected([]);
  }, [period, status, q, page, limit]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ period, status, q }));
    } catch {
      // Storage browser tidak tersedia; filter tetap berfungsi selama halaman terbuka.
    }
  }, [period, status, q]);
  useEffect(() => {
    api.get('/invoices/periods').then(({ data }) => setPeriods(data.periods)).catch(() => {});
    const s = params.get('status');
    const p = params.get('period');
    if (s || p) {
      if (s) setStatus(s);
      if (/^\d{4}-\d{2}$/.test(p || '')) setPeriod(p);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const selectable = rows.filter((i) => (i.status === 'unpaid' || i.status === 'void') && Number(i.paid_amount) === 0).map((i) => i.id);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));
  const toggle = (id) => setSelected((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  const removeSelected = async () => {
    if (!(await confirm({
      title: 'Hapus Tagihan Terpilih',
      message: `${selected.length} tagihan akan dihapus permanen. Tagihan yang sudah memiliki pembayaran akan dilewati.`,
      confirmText: 'Ya, Hapus Permanen',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    setDeleting(true);
    try {
      const { data } = await api.delete('/invoices', { data: { ids: selected } });
      toast(`${data.deleted} tagihan dihapus${data.skipped ? `, ${data.skipped} dilewati karena sudah dibayar` : ''}`, 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menghapus tagihan', 'danger');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Tagihan"
        subtitle="Tagihan dibuat otomatis sesuai siklus pelanggan, lacak dan kelola pembayaran (PRD 5.2)"
        actions={
          <>
            {can('invoices', 'export') && (
              <a href="/api/invoices/export"><Button variant="outline"><Download size={15} /> Export</Button></a>
            )}
            {can('invoices', 'edit') && (
              <Button variant="outline" disabled={recalculatingDueDates} onClick={async () => {
                if (!(await confirm({
                  title: 'Terapkan Jatuh Tempo',
                  message: 'Sistem akan menghitung jatuh tempo dari akhir layanan ditambah Batas Waktu Pembayaran pelanggan. Hanya tagihan belum dibayar tanpa pembayaran yang diubah.',
                  confirmText: 'Terapkan Jatuh Tempo',
                  tone: 'warning',
                  icon: CalendarDays,
                }))) return;
                setRecalculatingDueDates(true);
                try {
                  const { data } = await api.post('/invoices/recalculate-due-dates');
                  toast(`${data.updated} dari ${data.checked} jatuh tempo tagihan diperbarui`, 'success');
                  load();
                } catch (err) {
                  toast(err.response?.data?.message || 'Gagal menerapkan jatuh tempo', 'danger');
                } finally {
                  setRecalculatingDueDates(false);
                }
              }}><CalendarDays size={15} /> {recalculatingDueDates ? 'Menghitung…' : 'Terapkan Jatuh Tempo'}</Button>
            )}
            {can('invoices', 'edit') && (
              <Button variant="outline" disabled={recalculating} onClick={async () => {
                if (!(await confirm({
                  title: 'Terapkan Prorata Tagihan Lama',
                  message: 'Sistem akan menghitung ulang invoice pertama pelanggan yang belum dibayar. Invoice lunas, sebagian, void, atau yang sudah memiliki pembayaran tidak diubah.',
                  confirmText: 'Terapkan Prorata',
                  tone: 'warning',
                  icon: Calculator,
                }))) return;
                setRecalculating(true);
                try {
                  const { data } = await api.post('/invoices/recalculate-prorata');
                  toast(`${data.updated} dari ${data.checked} tagihan lama diperbarui dengan prorata`, 'success');
                  load();
                } catch (err) {
                  toast(err.response?.data?.message || 'Gagal menerapkan prorata', 'danger');
                } finally {
                  setRecalculating(false);
                }
              }}><Calculator size={15} /> {recalculating ? 'Menghitung…' : 'Terapkan Prorata'}</Button>
            )}
          </>
        }
      />

      {selected.length > 0 && can('invoices', 'delete') && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900/60 dark:bg-red-950/20">
          <span><strong>{selected.length}</strong> tagihan dipilih</span>
          <Button size="sm" variant="ghost" disabled={deleting} onClick={removeSelected}><Trash2 size={14} className="text-accent-red" /> {deleting ? 'Menghapus…' : 'Hapus Terpilih'}</Button>
        </div>
      )}

      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className="input" value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }}>
            <option value="all">Semua Periode</option>
            {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="all">Semua Status</option>
            <option value="unpaid">Belum Bayar</option>
            <option value="partial">Sebagian</option>
            <option value="paid">Lunas</option>
          </select>
          <div className="col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cari no tagihan / pelanggan…"
              value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-navy-700/50 text-sm">
          <span className="text-slate-400">Total: <strong>{fmtIDR(summary.billed)}</strong></span>
          <span className="text-slate-400">Dibayar: <strong className="text-accent-green">{fmtIDR(summary.paid)}</strong></span>
          <span className="text-slate-400">Sisa: <strong className="text-accent-red">{fmtIDR(summary.billed - summary.paid)}</strong></span>
        </div>
      </Card>

      <Card bodyClass="!p-0 overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-slate-200/60 dark:border-navy-700">
            <tr>
              {can('invoices', 'delete') && <th className="th w-10"><input type="checkbox" aria-label="Pilih semua tagihan pada halaman" checked={allSelected} disabled={!selectable.length} onChange={() => setSelected(allSelected ? [] : selectable)} /></th>}
              <th className="th">No Tagihan</th>
              <th className="th">Pelanggan</th>
              <th className="th">Periode</th>
              <th className="th">Jatuh Tempo</th>
              <th className="th">Total</th>
              <th className="th">Status</th>
              <th className="th text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {rows.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
                {can('invoices', 'delete') && <td className="td"><input type="checkbox" aria-label={`Pilih ${i.number}`} checked={selected.includes(i.id)} disabled={!selectable.includes(i.id)} onChange={() => toggle(i.id)} /></td>}
                <td className="td text-xs font-mono">{i.number}</td>
                <td className="td">
                  <p className="font-medium">{i.customer_name}</p>
                  <p className="text-xs text-slate-400">{i.code} · {i.package_name || '-'}</p>
                </td>
                <td className="td text-sm" title={i.service_start ? `Periode tagihan ${periodLabel(i.period)}` : undefined}>
                  <p>{i.service_start ? `${fmtDate(i.service_start)} – ${fmtDate(i.service_end)}` : periodLabel(i.period)}</p>
                  <p className="text-xs text-slate-400">{String(i.billing_type).toLowerCase() === 'prabayar' ? 'Prabayar · bayar di muka' : 'Pascabayar · pakai dulu bayar'}</p>
                </td>
                <td className="td text-sm">{fmtDate(i.due_date)}</td>
                <td className="td font-semibold">
                  {fmtIDR(i.total)}
                  {Number(i.late_fee) > 0 && <span className="text-xs text-accent-red block">+denda {fmtIDR(i.late_fee)}</span>}
                </td>
                <td className="td"><Badge value={i.status} label={statusLabel[i.status]} /></td>
                <td className="td text-right">
                  <div className="inline-flex gap-1">
                    {(i.status === 'unpaid' || i.status === 'partial') && canFinance && can('payments', 'create') && (
                      <Button size="sm" variant="green" onClick={() => setPayInv(i)}>Bayar</Button>
                    )}
                    <Link to={`/tagihan/${i.id}/cetak`}><Button size="sm" variant="ghost" title="Cetak"><Printer size={14} /></Button></Link>
                    {i.status === 'unpaid' && Number(i.paid_amount) === 0 && can('invoices', 'edit') && (
                      <Button size="sm" variant="ghost" title="Tambah biaya atau diskon" onClick={() => setAdjustmentInv(i)}><SlidersHorizontal size={14} /></Button>
                    )}
                    {i.status === 'unpaid' && can('invoices', 'edit') && (
                      <Button size="sm" variant="ghost" title="Batalkan" onClick={async () => {
                        if (!(await confirm({
                          title: 'Batalkan Tagihan',
                          message: `Tagihan ${i.number} akan dibatalkan dan berstatus "Void".`,
                          confirmText: 'Ya, Batalkan',
                          tone: 'warning',
                          icon: XCircle,
                        }))) return;
                        await api.post(`/invoices/${i.id}/void`);
                        toast('Tagihan dibatalkan', 'success');
                        load();
                      }}><XCircle size={14} className="text-accent-red" /></Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="Tidak ada tagihan" />}
        <Pagination page={page} total={total} limit={limit} onPage={setPage} onLimit={(nextLimit) => { setLimit(nextLimit); setPage(1); }} limits={[12, 25, 50, 100]} />
      </Card>

      {payInv && <PayModal invoice={payInv} onClose={() => setPayInv(null)} onDone={() => { setPayInv(null); load(); }} onNew={() => navigate('/pembayaran?new=1')} />}
      {adjustmentInv && <InvoiceAdjustmentModal invoiceId={adjustmentInv.id} onClose={() => setAdjustmentInv(null)} onDone={load} />}
    </div>
  );
}
