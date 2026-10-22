import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wallet, ReceiptText, AlertOctagon, Router, AlertTriangle, ArrowRight, Users, CircleDollarSign,
  UserPlus, PlusCircle, ShieldBan, Activity, Radio, Search,
  FileText, Loader2, HousePlus, Wrench, SlidersHorizontal,
} from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Card, Badge, Button, Empty, Modal, Pagination, Spinner } from '../components/ui.jsx';
import { TrendArea, DonutChart, InstallationBar } from '../components/charts.jsx';
import { fmtIDR, fmtNum, fmtDate, fmtDateTime, fmtUptime, statusLabel } from '../utils/format.js';
import CustomerForm from './CustomerForm.jsx';
import PaymentForm from './PaymentForm.jsx';
import InvoiceAdjustmentModal from '../components/InvoiceAdjustmentModal.jsx';

const NETWORK_POPUPS = {
  customers: ['Total Pelanggan', 'customers'],
  online: ['User Online', 'online'],
  offline: ['User Offline', 'offline'],
};

const ADJUSTMENT_LIMITS = [5, 10, 25];

/** Kartu ringkasan bisnis berwarna, mengikuti referensi dashboard. */
function MetricCard({ color, icon: Icon, label, value, hint, to }) {
  const body = (
    <div className={`relative min-h-[130px] overflow-hidden rounded-2xl bg-gradient-to-br ${color} px-5 py-4 text-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift`}>
      <span aria-hidden className="absolute -right-5 -top-10 h-32 w-32 rounded-full bg-white/15" />
      <span aria-hidden className="absolute -bottom-11 right-6 h-24 w-24 rounded-full bg-white/15" />
      <div className="relative">
        <div className="flex items-center gap-2.5 text-[13px] font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20"><Icon size={18} strokeWidth={2} /></span>
          <p className="truncate">{label}</p>
        </div>
        <p className="mt-2 text-[29px] font-extrabold leading-tight tracking-display">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs font-medium text-white/90">{hint}</p>}
      </div>
    </div>
  );
  const cls = 'block overflow-hidden rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Kotak status ringkas (Online/Offline/Suspend, Aktif/Isolir/Nonaktif) */
function StatusTile({ dot = 'bg-slate-400', label, value, hint, valueCls = '', onClick, to }) {
  const body = (
    <>
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{label}</span>
      </p>
      <p className={`mt-1.5 text-xl font-extrabold tracking-display sm:text-2xl ${valueCls}`}>{fmtNum(value)}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted">{hint}</p>
    </>
  );
  const cls = 'block rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-left transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 hover:border-accent-blue/40 dark:border-navy-600 dark:bg-navy-800/60 dark:hover:border-accent-blue/50';
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} hover:bg-white hover:shadow-soft dark:hover:bg-navy-700`}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { snapshot, customersUpdatedAt } = useSocket();
  const { toast } = useToast();
  const canViewBusinessSummary = ['owner', 'finance'].includes(user?.role);
  const [data, setData] = useState(null);
  const [businessSummary, setBusinessSummary] = useState(null);
  const [invoiceAdjustments, setInvoiceAdjustments] = useState([]);
  const [adjustmentTotal, setAdjustmentTotal] = useState(0);
  const [adjustmentPage, setAdjustmentPage] = useState(1);
  const [adjustmentLimit, setAdjustmentLimit] = useState(ADJUSTMENT_LIMITS[0]);
  const [adjustmentQ, setAdjustmentQ] = useState('');
  const [installationPeriod, setInstallationPeriod] = useState('month');
  const [installationTrend, setInstallationTrend] = useState({ total: 0, series: [] });
  const [popup, setPopup] = useState(null);
  const [popupRows, setPopupRows] = useState([]);
  const [popupTotal, setPopupTotal] = useState(0);
  const [popupPage, setPopupPage] = useState(1);
  const [popupQ, setPopupQ] = useState('');
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupError, setPopupError] = useState('');
  const [quickAction, setQuickAction] = useState(null);
  const [quickInvoices, setQuickInvoices] = useState([]);
  const [quickCustomers, setQuickCustomers] = useState([]);
  const [quickCategories, setQuickCategories] = useState([]);
  const [quickInvoice, setQuickInvoice] = useState(null);
  const [quickInvoiceQ, setQuickInvoiceQ] = useState('');
  const [adjustmentInvoices, setAdjustmentInvoices] = useState([]);
  const [adjustmentInvoiceQ, setAdjustmentInvoiceQ] = useState('');
  const [adjustmentInvoice, setAdjustmentInvoice] = useState(null);
  const [quickCustomer, setQuickCustomer] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const emptyExpense = { category_id: '', amount: '', tx_date: new Date().toISOString().slice(0, 10), description: '', requires_approval: '' };
  const [expense, setExpense] = useState(emptyExpense);
  const popupLimit = 8;

  const loadStats = useCallback(() => {
    api.get('/dashboard/stats').then(({ data: result }) => setData(result)).catch(() => {});
  }, []);

  const loadInvoiceAdjustments = useCallback(() => {
    if (!canViewBusinessSummary) {
      setInvoiceAdjustments([]);
      setAdjustmentTotal(0);
      return;
    }
    api.get('/dashboard/invoice-adjustments', { params: { q: adjustmentQ || undefined, page: adjustmentPage, limit: adjustmentLimit } })
      .then(({ data: result }) => { setInvoiceAdjustments(result.rows || []); setAdjustmentTotal(result.total || 0); })
      .catch(() => { setInvoiceAdjustments([]); setAdjustmentTotal(0); });
  }, [adjustmentQ, adjustmentPage, adjustmentLimit, canViewBusinessSummary]);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (!customersUpdatedAt) return;
    loadStats();
    if (canViewBusinessSummary) {
      api.get('/dashboard/business-summary').then(({ data: result }) => setBusinessSummary(result)).catch(() => {});
    }
  }, [customersUpdatedAt, loadStats, canViewBusinessSummary]);

  useEffect(() => {
    if (canViewBusinessSummary) {
      api.get('/dashboard/business-summary').then(({ data: result }) => setBusinessSummary(result)).catch(() => {});
    } else {
      setBusinessSummary(null);
    }
  }, [canViewBusinessSummary]);

  useEffect(() => { loadInvoiceAdjustments(); }, [loadInvoiceAdjustments]);

  useEffect(() => {
    api.get('/dashboard/installation-trend', { params: { period: installationPeriod } })
      .then(({ data: result }) => setInstallationTrend(result))
      .catch(() => setInstallationTrend({ total: 0, series: [] }));
  }, [installationPeriod]);

  const loadPopup = useCallback(async () => {
    if (!popup) return;
    setPopupLoading(true);
    setPopupError('');
    try {
      const { data: result } = await api.get('/dashboard/network-users', {
        params: { status: NETWORK_POPUPS[popup][1], q: popupQ, page: popupPage, limit: popupLimit },
      });
      setPopupRows(result.rows || []);
      setPopupTotal(result.total || 0);
    } catch {
      setPopupRows([]);
      setPopupTotal(0);
      setPopupError('Gagal memuat rincian pelanggan. Coba lagi.');
    } finally {
      setPopupLoading(false);
    }
  }, [popup, popupPage, popupQ]);

  useEffect(() => { loadPopup(); }, [loadPopup, snapshot?.at]);

  useEffect(() => {
    if (!canViewBusinessSummary && ['payment', 'expense', 'adjustment'].includes(quickAction)) {
      closeQuick();
      return undefined;
    }
    if (quickAction === 'payment') {
      const timer = setTimeout(() => {
        api.get('/payments/open-invoices', { params: { q: quickInvoiceQ || undefined } })
          .then(({ data: result }) => setQuickInvoices(result.rows || []))
          .catch(() => setQuickInvoices([]));
      }, quickInvoiceQ ? 300 : 0);
      return () => clearTimeout(timer);
    }
    if (quickAction === 'isolate') api.get('/customers', { params: { status: 'active', limit: 100 } }).then(({ data: result }) => setQuickCustomers(result.rows || [])).catch(() => setQuickCustomers([]));
    if (quickAction === 'expense') api.get('/transaction-categories', { params: { type: 'expense' } }).then(({ data: result }) => setQuickCategories((result.rows || []).filter((c) => c.is_active))).catch(() => setQuickCategories([]));
    return undefined;
  }, [quickAction, quickInvoiceQ, canViewBusinessSummary]);

  useEffect(() => {
    if (!canViewBusinessSummary || quickAction !== 'adjustment') return undefined;
    const timer = setTimeout(() => {
      api.get('/invoices', { params: { status: 'unpaid', q: adjustmentInvoiceQ || undefined, limit: 50 } })
        .then(({ data: result }) => setAdjustmentInvoices((result.rows || []).filter((invoice) => Number(invoice.paid_amount) === 0)))
        .catch(() => setAdjustmentInvoices([]));
    }, adjustmentInvoiceQ ? 300 : 0);
    return () => clearTimeout(timer);
  }, [quickAction, adjustmentInvoiceQ, canViewBusinessSummary]);

  if (!data) return null;
  const { cards } = data;
  const summary = {
    incomeToday: businessSummary?.incomeToday ?? 0,
    incomeThisMonth: businessSummary?.incomeThisMonth || { count: 0, total: cards.revenueThisMonth },
    invoicesThisMonth: businessSummary?.invoicesThisMonth || { count: 0, total: 0 },
    unpaid: businessSummary?.unpaid || { count: cards.arrearsCount, total: cards.arrearsTotal },
    previousPeriodUnpaid: businessSummary?.previousPeriodUnpaid || { period: '', count: 0, total: 0 },
    totalBills: businessSummary?.totalBills || { count: cards.totalCustomers, total: 0 },
    totalCustomers: businessSummary?.totalCustomers ?? cards.totalCustomers,
    inactiveCustomers: businessSummary?.inactiveCustomers ?? cards.inactiveCustomers,
    notInstalledCustomers: businessSummary?.notInstalledCustomers ?? 0,
  };
  const widgets = data.widgets || {
    cashToday: {},
    invoicesThisMonth: { count: 0, total: 0 }, paymentsThisMonth: 0,
  };
  const network = snapshot?.summary || data.network || {
    total: cards.onlineUsers + cards.offlineUsers,
    online: cards.onlineUsers,
    offline: cards.offlineUsers,
    isolir: cards.isolatedCustomers,
  };
  const networkReady = network.integrated !== false;
  const totalUser = Number(network.total) || Number(network.online) + Number(network.offline) || 0;
  const onlinePct = totalUser ? Math.round((Number(network.online) / totalUser) * 100) : 0;
  const cash = widgets.cashToday || {};
  const invoicesMonth = widgets.invoicesThisMonth || { count: 0, total: 0 };
  const paymentsMonth = widgets.paymentsThisMonth || 0;
  const openPopup = (type) => { setPopupQ(''); setPopupPage(1); setPopupError(''); setPopup(type); };
  const closeQuick = () => { setQuickAction(null); setQuickInvoice(null); setQuickInvoiceQ(''); setAdjustmentInvoices([]); setAdjustmentInvoiceQ(''); setAdjustmentInvoice(null); setQuickCustomer(''); setExpense(emptyExpense); };
  const saveExpense = async (e) => {
    e.preventDefault();
    setQuickSaving(true);
    try {
      const fd = new FormData();
      fd.append('type', 'expense');
      ['category_id', 'amount', 'tx_date', 'description', 'requires_approval'].forEach((key) => fd.append(key, expense[key] || ''));
      if (expense._file) fd.append('attachment', expense._file);
      await api.post('/transactions', fd);
      toast('Pengeluaran tersimpan', 'success');
      closeQuick();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan pengeluaran', 'danger');
    } finally {
      setQuickSaving(false);
    }
  };
  const isolateCustomer = async () => {
    if (!quickCustomer) return;
    setQuickSaving(true);
    try {
      await api.post(`/customers/${quickCustomer}/status`, { status: 'isolated' });
      toast('Pelanggan berhasil diisolir', 'success');
      closeQuick();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal mengisolir pelanggan', 'danger');
    } finally {
      setQuickSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {canViewBusinessSummary && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-heading font-bold tracking-display md:text-3xl">Ringkasan bisnis</h1>
              <p className="mt-1 text-sm text-muted">Selamat datang kembali — berikut kondisi terkini jaringan dan keuangan Anda.</p>
            </div>
            <Link to="/tagihan"><Button>Kelola Tagihan <ArrowRight size={14} /></Button></Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard color="from-blue-500 to-cyan-600" icon={Users} label="Total Pelanggan"
              value={fmtNum(summary.totalCustomers)} hint="Semua pelanggan terdaftar" to="/pelanggan" />
            <MetricCard color="from-slate-500 to-slate-600" icon={UserPlus} label="Belum Ada Invoice"
              value={fmtNum(cards.newCustomersWithoutInvoice)} hint="Pelanggan baru pascabayar tanpa tagihan" to="/pelanggan?without_invoice=current_month" />
            <MetricCard color="from-violet-500 to-purple-600" icon={Wrench} label="Belum Terpasang / Belum Aktif"
              value={fmtNum(summary.notInstalledCustomers + summary.inactiveCustomers)} hint={`${fmtNum(summary.notInstalledCustomers)} belum pasang · ${fmtNum(summary.inactiveCustomers)} nonaktif`} to="/pelanggan?installation_status=attention" />
            <MetricCard color="from-amber-500 to-orange-600" icon={ReceiptText} label="Total Tagihan"
              value={fmtIDR(summary.totalBills.total)} hint={`${fmtNum(summary.totalBills.count)} paket pelanggan`} to="/pelanggan" />
            <MetricCard color="from-amber-500 to-orange-500" icon={ReceiptText} label="Tagihan Bulan Ini"
              value={fmtIDR(summary.invoicesThisMonth.total)} hint={`${fmtNum(summary.invoicesThisMonth.count)} faktur terbit`} to="/tagihan" />
            <MetricCard color="from-rose-500 to-red-600" icon={Wallet} label="Sisa Tagihan"
              value={fmtIDR(summary.previousPeriodUnpaid.total)} hint={`${fmtNum(summary.previousPeriodUnpaid.count)} tagihan belum lunas`} to={`/tagihan?status=unpaid&period=${summary.previousPeriodUnpaid.period}`} />
            <MetricCard color="from-red-500 to-rose-600" icon={AlertOctagon} label="Belum Bayar"
              value={fmtNum(summary.previousPeriodUnpaid.count)} hint={`${fmtIDR(summary.previousPeriodUnpaid.total)} periode sebelumnya`} to={`/tagihan?status=unpaid&period=${summary.previousPeriodUnpaid.period}`} />
            <MetricCard color="from-emerald-500 to-emerald-600" icon={CircleDollarSign} label="Pendapatan Hari Ini"
              value={fmtIDR(summary.incomeToday)} hint="Pembayaran terkonfirmasi hari ini" to="/pembayaran" />
          </div>
        </>
      )}

      {/* Banner alert (PRD 7) */}
      {canViewBusinessSummary && cards.overdueCustomers > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-orange/30 bg-accent-orange/10 px-5 py-4 dark:border-accent-orange/40 dark:bg-accent-orange/15">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-accent-orange" />
            <p className="text-sm">
              <span className="font-bold text-accent-orange">{cards.overdueCustomers} pelanggan menunggak</span>{' '}
              dengan total piutang {fmtIDR(cards.arrearsTotal)} — segera tindak lanjuti.
            </p>
          </div>
          <Link to="/tagihan?status=unpaid">
            <Button size="sm" variant="orange">Lihat Tagihan <ArrowRight size={14} /></Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* Ringkasan koneksi PPPoE realtime */}
      <section className="card p-3.5 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 sm:h-12 sm:w-12">
              <Router size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold sm:text-lg">User PPPoE</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted sm:text-sm">
                Statistik koneksi real-time
                <span className={`inline-flex min-w-0 max-w-[9rem] items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${networkReady ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-yellow/15 text-accent-yellow'}`}>
                  <i className={`h-1.5 w-1.5 shrink-0 rounded-full ${networkReady ? 'animate-pulse bg-accent-green' : 'bg-accent-yellow'}`} />
                  <span className="truncate">{networkReady ? network.router?.name || 'MikroTik terhubung' : network.reason || 'MikroTik belum terhubung'}</span>
                </span>
              </p>
            </div>
          </div>
          <button type="button" onClick={() => openPopup('customers')}
            className="rounded-xl px-2 py-1 text-right transition hover:bg-secondary/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40">
            <span className="block text-2xl font-extrabold leading-none tracking-display sm:text-4xl">{fmtNum(network.total)}</span>
            <span className="mt-1 block text-[11px] text-muted sm:text-xs">Total User</span>
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatusTile dot="bg-accent-green" label="Online" value={network.online} hint={`${onlinePct}% aktif`} onClick={() => openPopup('online')} />
          <StatusTile dot="bg-slate-400 dark:bg-slate-500" label="Offline" value={network.offline} hint="tidak terhubung" onClick={() => openPopup('offline')} />
          <StatusTile dot="bg-accent-orange" label="Suspend" value={network.isolir ?? cards.isolatedCustomers} hint="isolir / menunggak" valueCls="text-accent-orange" to="/pelanggan?status=isolated" />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 dark:border-navy-700">
          <div className="flex items-center gap-2.5">
            <HousePlus size={18} className="text-accent-green" />
            <h2 className="text-base font-bold sm:text-lg">Tren PSB</h2>
          </div>
          <span className="rounded-full bg-accent-green/15 px-3 py-1 text-xs font-semibold text-accent-green">{fmtNum(installationTrend.total)} periode ini</span>
        </div>
        <div className="flex justify-end px-4 pt-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-navy-800" role="group" aria-label="Filter tren pemasangan">
            {[['day', 'Hari'], ['month', 'Bulan'], ['year', 'Tahun']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={installationPeriod === value} onClick={() => setInstallationPeriod(value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${installationPeriod === value ? 'bg-white text-slate-900 shadow-sm dark:bg-navy-600 dark:text-white' : 'text-muted hover:text-primary'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-3 pb-3 pt-1"><InstallationBar data={installationTrend.series} height={180} /></div>
      </section>
      </div>

      {canViewBusinessSummary && <Card title="Diskon & Biaya Tambahan" bodyClass="!p-0">
        <div className="border-b border-border p-4">
          <div className="relative max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Filter nama atau kode pelanggan…" value={adjustmentQ} onChange={(e) => { setAdjustmentQ(e.target.value); setAdjustmentPage(1); }} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-sm">
            <thead className="border-b border-slate-200/60 dark:border-navy-700">
              <tr className="text-left text-xs text-slate-400">
                <th className="th">Pelanggan</th>
                <th className="th">Tanggal Tagihan</th>
                <th className="th text-right">Diskon</th>
                <th className="th text-right">Biaya Tambahan</th>
                <th className="th text-center">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
              {invoiceAdjustments.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50/80 dark:hover:bg-navy-700/40">
                  <td className="td"><Link to={`/pelanggan/${invoice.customer_id}`} className="font-medium hover:text-accent-blue">{invoice.customer_name}</Link><p className="font-mono text-xs text-slate-400">{invoice.customer_code}</p></td>
                  <td className="td whitespace-nowrap">{fmtDate(invoice.invoice_date)}</td>
                  <td className="td whitespace-nowrap text-right font-medium text-rose-600 dark:text-rose-300">{Number(invoice.discount) > 0 ? fmtIDR(invoice.discount) : '-'}</td>
                  <td className="td whitespace-nowrap text-right font-medium text-violet-600 dark:text-violet-300">{Number(invoice.additional_fee) > 0 ? fmtIDR(invoice.additional_fee) : '-'}</td>
                  <td className="td whitespace-nowrap text-center"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${invoice.status === 'paid' ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-orange/15 text-accent-orange'}`}>{invoice.status === 'paid' ? 'Selesai' : 'Belum selesai'}</span></td>
                </tr>
              ))}
              {!invoiceAdjustments.length && <tr><td colSpan={5} className="td py-8 text-center text-slate-400">Belum ada diskon atau biaya tambahan pada tagihan.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={adjustmentPage} total={adjustmentTotal} limit={adjustmentLimit} onPage={setAdjustmentPage} onLimit={(limit) => { setAdjustmentLimit(limit); setAdjustmentPage(1); }} limits={ADJUSTMENT_LIMITS} />
      </Card>}

      {/* Aksi cepat (PRD 7) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {[
          { action: 'customer', icon: UserPlus, label: 'Tambah Pelanggan', chip: 'bg-accent-blue/15 text-accent-blue', ring: 'hover:border-accent-blue/40' },
          ...(canViewBusinessSummary ? [{ action: 'adjustment', icon: SlidersHorizontal, label: 'Diskon & Biaya Tambahan', chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', ring: 'hover:border-violet-500/40' }] : []),
          ...(canViewBusinessSummary ? [
            { action: 'payment', icon: ReceiptText, label: 'Catat Pembayaran', chip: 'bg-accent-green/15 text-accent-green', ring: 'hover:border-accent-green/40' },
            { action: 'expense', icon: PlusCircle, label: 'Catat Pengeluaran', chip: 'bg-accent-orange/15 text-accent-orange', ring: 'hover:border-accent-orange/40' },
          ] : []),
          { action: 'isolate', icon: ShieldBan, label: 'Isolir Manual', chip: 'bg-accent-red/15 text-accent-red', ring: 'hover:border-accent-red/40' },
        ].map((a) => (
          <button key={a.action} onClick={() => a.to ? navigate(a.to) : setQuickAction(a.action)}
            className={`card group flex items-center gap-2.5 p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-soft ${a.ring}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${a.chip}`}>
              <a.icon size={17} />
            </span>
            <span className="text-[13px] font-semibold leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Grafik tren & proporsi */}
      {canViewBusinessSummary && <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Tren Pemasukan vs Pengeluaran (6 bulan)" className="lg:col-span-2">
          <TrendArea
            data={data.revenueTrend}
            keys={[
              { key: 'pemasukan', name: 'Pemasukan' },
              { key: 'pengeluaran', name: 'Pengeluaran' },
            ]}
          />
        </Card>
        <Card title="Proporsi Paket Langganan">
          <DonutChart data={data.packageDistribution} />
        </Card>
      </div>}

      {/* Panel bawah (PRD 7) */}
      <div className={`grid grid-cols-1 gap-4 ${canViewBusinessSummary ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}>
        {canViewBusinessSummary && <>
        <Card title="Pelanggan Menunggak" bodyClass="!p-0"
          right={<Link to="/tagihan?status=unpaid" className="text-xs text-accent-blue hover:underline">Semua</Link>}>
          <div className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {data.arrearsList.length === 0 && <p className="p-4 text-sm text-slate-400">Tidak ada tunggakan 🎉</p>}
            {data.arrearsList.slice(0, 6).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{inv.customer_name}</p>
                  <p className="text-xs text-slate-400">{inv.number} · Jatuh tempo {fmtDate(inv.due_date)}</p>
                </div>
                <span className="text-sm font-semibold text-accent-red shrink-0 ml-2">
                  {fmtIDR(Number(inv.total || 0) - Number(inv.paid_amount || 0))}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Pembayaran Terakhir" bodyClass="!p-0"
          right={<Link to="/pembayaran" className="text-xs text-accent-blue hover:underline">Semua</Link>}>
          <div className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {data.recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.customer_name}</p>
                  <p className="text-xs text-slate-400">{p.number} · {statusLabel[p.method]}</p>
                </div>
                <span className="text-sm font-semibold text-accent-green shrink-0 ml-2">{fmtIDR(p.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
        </>}

        <Card title="Log Aktivitas Terakhir" bodyClass="!p-0"
          right={<Link to="/log" className="text-xs text-accent-blue hover:underline">Semua</Link>}>
          <div className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {data.recentActivity.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <Activity size={14} className="mt-0.5 text-accent-blue shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm truncate">{a.description || a.action}</p>
                  <p className="text-xs text-slate-400">{a.user_name} · {fmtDateTime(a.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={!!popup} onClose={() => setPopup(null)} className="max-w-3xl"
        title={popup ? `${NETWORK_POPUPS[popup][0]} — ${fmtNum(popupTotal)} pelanggan` : ''}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-navy-700/60 dark:text-slate-300"><Radio size={14} className="text-accent-green" />{popup === 'customers' ? 'Daftar pelanggan terdaftar di NetBill.' : 'Data sesi langsung dari sinkronisasi MikroTik.'}</div>
          <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder={popup === 'customers' ? 'Cari nama, kode, nomor telepon, atau username…' : 'Cari nama, username, atau IP…'} value={popupQ} onChange={(e) => { setPopupQ(e.target.value); setPopupPage(1); }} /></div>
          <div className="overflow-x-auto rounded-xl border border-slate-200/70 dark:border-navy-700">{popupLoading ? <Spinner /> : <><table className="w-full min-w-[650px]"><thead><tr><th className="th">Pelanggan</th><th className="th">IP / Router</th><th className="th">Uptime</th>{popup === 'offline' && <th className="th">Logout Terakhir</th>}<th className="th text-right">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">{popupRows.map((row) => <tr key={row.id || row.username} className="hover:bg-slate-50/80 dark:hover:bg-navy-700/40"><td className="td">{row.customer_id ? <Link to={`/pelanggan/${row.customer_id}`} onClick={() => setPopup(null)} className="font-semibold hover:text-accent-blue">{row.customer_name || row.username}</Link> : <p className="font-medium">{row.customer_name || row.username}</p>}<p className="font-mono text-xs text-slate-400">{row.username || row.customer_code || '-'}</p></td><td className="td"><p className="font-mono text-xs">{row.ip || '-'}</p><p className="text-xs text-slate-400">{row.router_name || row.package_name || '-'}</p></td><td className="td">{row.status === 'online' ? fmtUptime(row.uptime) : '-'}</td>{popup === 'offline' && <td className="td whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{fmtDateTime(row.last_logout)}</td>}<td className="td text-right"><Badge value={row.status} label={statusLabel[row.status]} /></td></tr>)}</tbody></table>{!popupRows.length && <Empty text={popupError || network.reason || 'Belum ada data pelanggan'} />}</>}</div>
          <Pagination page={popupPage} total={popupTotal} limit={popupLimit} onPage={setPopupPage} />
        </div>
      </Modal>

      {quickAction === 'customer' && <CustomerForm onClose={closeQuick} onSaved={() => { closeQuick(); api.get('/dashboard/stats').then(({ data: result }) => setData(result)).catch(() => {}); }} />}

      {canViewBusinessSummary && quickAction === 'payment' && !quickInvoice && (
        <Modal open onClose={closeQuick} title="Pilih Tagihan yang Dibayar">
          <div className="relative mb-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cari nama, kode, atau area…" value={quickInvoiceQ} onChange={(e) => setQuickInvoiceQ(e.target.value)} autoFocus />
            {quickInvoiceQ && <button type="button" tabIndex={-1} aria-label="Hapus pencarian" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setQuickInvoiceQ('')}>✕</button>}
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {quickInvoices.map((invoice) => <button key={invoice.id} type="button" onClick={() => setQuickInvoice(invoice)} className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-accent-blue/50 dark:border-navy-600"><div><p className="text-sm font-medium">{invoice.customer_name} <span className="text-xs text-slate-400">{invoice.code}</span>{invoice.area && <span className="text-xs font-medium text-accent-blue"> · {invoice.area}</span>}</p><p className="text-xs text-slate-400 font-mono">{invoice.number} · Jatuh tempo {fmtDate(invoice.due_date)}</p></div><span className="text-sm font-bold text-accent-red">{fmtIDR(invoice.total - invoice.paid_amount)}</span></button>)}
            {!quickInvoices.length && <Empty text={quickInvoiceQ ? `Tagihan yang dapat dibayar atas “${quickInvoiceQ}” tidak ditemukan` : 'Tidak ada tagihan yang dapat dibayar'} />}
          </div>
        </Modal>
      )}
      {canViewBusinessSummary && quickAction === 'payment' && quickInvoice && <PaymentForm invoice={quickInvoice} onClose={closeQuick} onDone={closeQuick} onNew={() => { setQuickInvoice(null); setQuickInvoiceQ(''); }} />}

      {canViewBusinessSummary && quickAction === 'adjustment' && !adjustmentInvoice && (
        <Modal open onClose={closeQuick} title="Pilih Pelanggan untuk Diskon atau Biaya Tambahan">
          <div className="relative mb-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cari nama, kode, area, atau nomor tagihan…" value={adjustmentInvoiceQ} onChange={(e) => setAdjustmentInvoiceQ(e.target.value)} autoFocus />
            {adjustmentInvoiceQ && <button type="button" tabIndex={-1} aria-label="Hapus pencarian" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setAdjustmentInvoiceQ('')}>✕</button>}
          </div>
          <p className="mb-3 text-xs text-muted">Pilih pelanggan dengan tagihan belum dibayar untuk mengatur diskon atau biaya tambahan.</p>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {adjustmentInvoices.map((invoice) => <button key={invoice.id} type="button" onClick={() => setAdjustmentInvoice(invoice)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left transition hover:border-violet-500/50 dark:border-navy-600"><div className="min-w-0"><p className="truncate text-sm font-medium">{invoice.customer_name} <span className="text-xs text-slate-400">{invoice.code}</span>{invoice.area && <span className="text-xs font-medium text-accent-blue"> · {invoice.area}</span>}</p><p className="text-xs text-slate-400">{invoice.number} · Jatuh tempo {fmtDate(invoice.due_date)}</p></div><span className="ml-3 shrink-0 text-sm font-bold text-violet-600 dark:text-violet-400">{fmtIDR(invoice.total)}</span></button>)}
            {!adjustmentInvoices.length && <Empty text={adjustmentInvoiceQ ? `Pelanggan dengan tagihan aktif untuk “${adjustmentInvoiceQ}” tidak ditemukan` : 'Tidak ada tagihan yang dapat disesuaikan'} />}
          </div>
        </Modal>
      )}
      {canViewBusinessSummary && quickAction === 'adjustment' && adjustmentInvoice && <InvoiceAdjustmentModal invoiceId={adjustmentInvoice.id} onClose={closeQuick} onDone={() => { closeQuick(); loadStats(); loadInvoiceAdjustments(); }} />}

      {canViewBusinessSummary && quickAction === 'expense' && (
        <Modal open onClose={closeQuick} className="max-w-xl" title="Catat Pengeluaran">
          <form onSubmit={saveExpense} className="space-y-5">
            <div className="-mx-6 -mt-6 bg-gradient-to-br from-rose-600 via-rose-500 to-orange-400 px-6 py-5 text-white"><div className="flex items-start gap-3"><span className="rounded-xl bg-white/15 p-2.5"><FileText size={20} /></span><div><p className="text-base font-bold">Catat pengeluaran baru</p><p className="mt-0.5 text-xs leading-relaxed text-white/80">Lengkapi informasi biaya agar laporan operasional tetap akurat.</p></div></div></div>
            <div className="space-y-4">
              <div><label className="label">Kategori pengeluaran <span className="text-rose-500">*</span></label><select className="input" value={expense.category_id} onChange={(e) => setExpense((v) => ({ ...v, category_id: e.target.value }))} required><option value="">Pilih kategori pengeluaran</option>{quickCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div className="grid gap-4 sm:grid-cols-5"><div className="sm:col-span-3"><label className="label">Jumlah pengeluaran <span className="text-rose-500">*</span></label><div className="relative"><span className="pointer-events-none absolute inset-y-1.5 left-1.5 flex items-center rounded-md bg-rose-50 px-2.5 text-xs font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">Rp</span><input className="input pl-12 font-semibold tabular-nums" type="number" min="1" inputMode="numeric" value={expense.amount} onChange={(e) => setExpense((v) => ({ ...v, amount: e.target.value }))} placeholder="0" required /></div></div><div className="sm:col-span-2"><label className="label">Tanggal <span className="text-rose-500">*</span></label><input className="input" type="date" value={expense.tx_date} onChange={(e) => setExpense((v) => ({ ...v, tx_date: e.target.value }))} required /></div></div>
              <div><div className="mb-1.5 flex items-center justify-between"><label className="label !mb-0">Keterangan</label><span className="text-[11px] text-slate-400">Opsional</span></div><textarea className="input" rows="3" value={expense.description} onChange={(e) => setExpense((v) => ({ ...v, description: e.target.value }))} placeholder="Contoh: pembelian kabel untuk perbaikan area Selatan" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="group cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 transition hover:border-accent-blue hover:bg-accent-blue/5 dark:border-navy-600 dark:bg-navy-900/30 dark:hover:border-accent-blue"><input className="sr-only" type="file" accept="image/*,application/pdf" onChange={(e) => setExpense((old) => ({ ...old, _file: e.target.files[0] }))} /><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-accent-blue shadow-sm dark:bg-navy-700"><FileText size={17} /></span><span className="min-w-0"><span className="block text-xs font-semibold text-slate-700 dark:text-slate-100">{expense._file?.name || 'Tambah bukti'}</span><span className="block truncate text-[11px] text-slate-400">JPG, PNG, atau PDF</span></span></div></label><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-amber-300 hover:bg-amber-50/60 dark:border-navy-700 dark:bg-navy-900/30 dark:hover:border-amber-700"><input type="checkbox" checked={expense.requires_approval === '1'} onChange={(e) => setExpense((old) => ({ ...old, requires_approval: e.target.checked ? '1' : '' }))} /><span><span className="block text-xs font-semibold text-slate-700 dark:text-slate-100">Perlu persetujuan</span><span className="block text-[11px] text-slate-400">Tahan finalisasi oleh owner</span></span></label></div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-navy-700"><Button type="button" variant="ghost" onClick={closeQuick} disabled={quickSaving}>Batal</Button><Button type="submit" className="min-w-40" disabled={quickSaving}>{quickSaving && <Loader2 size={15} className="animate-spin" />}{quickSaving ? 'Menyimpan...' : 'Simpan Pengeluaran'}</Button></div>
          </form>
        </Modal>
      )}

      {quickAction === 'isolate' && (
        <Modal open onClose={closeQuick} title="Isolir Manual">
          <div className="space-y-4"><div><label className="label">Pelanggan Aktif</label><select className="input" value={quickCustomer} onChange={(e) => setQuickCustomer(e.target.value)}><option value="">- Pilih Pelanggan -</option>{quickCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} · {customer.name}</option>)}</select></div><p className="text-xs text-slate-400">Layanan pelanggan terpilih akan diisolir sekarang.</p><div className="flex justify-end gap-2"><Button variant="ghost" onClick={closeQuick}>Batal</Button><Button variant="danger" disabled={!quickCustomer || quickSaving} onClick={isolateCustomer}>{quickSaving ? 'Memproses…' : 'Isolir'}</Button></div></div>
        </Modal>
      )}
    </div>
  );
}
