import { useEffect, useState, useCallback, useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarDays, Download, FilterX, Landmark, Layers3, MapPinned, Phone, ReceiptText, RefreshCw, Search, ShieldAlert, TriangleAlert, TrendingUp, TrendingDown, UsersRound, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, StatCard, Empty, Button } from '../components/ui.jsx';
import { DonutChart, SimpleBar, TrendArea } from '../components/charts.jsx';
import { fmtIDR, fmtNum, fmtDate, periodLabel } from '../utils/format.js';

const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const filterParams = (filters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value));

/** Laporan Pemasukan (PRD 5.7): per periode, paket, area + grafik harian */
export function IncomeReport() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ from: '', to: '', package_id: '', area: '' });
  const [draft, setDraft] = useState(filters);
  const [packages, setPackages] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: report } = await api.get('/reports/income', { params: filterParams(filters) });
      setData(report);
    } finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([api.get('/packages'), api.get('/areas')]).then(([packageRes, areaRes]) => {
      setPackages(packageRes.data.rows || []);
      setAreas(areaRes.data.rows || []);
    }).catch(() => {});
  }, []);

  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const setRange = (range) => {
    const today = new Date();
    let next;
    if (range === 'today') next = { ...draft, from: isoDate(today), to: isoDate(today) };
    else if (range === 'week') { const start = new Date(today); start.setDate(today.getDate() - 6); next = { ...draft, from: isoDate(start), to: isoDate(today) }; }
    else if (range === 'month') next = { ...draft, from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDate(today) };
    else next = { from: '', to: '', package_id: '', area: '' };
    setDraft(next); setFilters(next);
  };
  const exportUrl = `/api/reports/income/export?${new URLSearchParams(filterParams(filters)).toString()}`;
  const periodLabel = filters.from || filters.to ? `${filters.from ? fmtDate(filters.from) : 'Awal data'} — ${filters.to ? fmtDate(filters.to) : 'Hari ini'}` : 'Semua periode';
  const daily = useMemo(() => (data?.daily || []).map((d) => ({ label: fmtDate(d.date), value: d.total })), [data]);
  const total = data?.summary.total || 0;
  const topPackage = data?.byPackage[0];
  const topArea = data?.byArea[0];

  if (!data && loading) return <div className="min-h-[360px] grid place-items-center"><RefreshCw className="animate-spin text-accent-blue" size={24} /></div>;
  if (!data) return <Empty text="Laporan pemasukan belum dapat dimuat" />;

  return (
    <div className="income-report">
      <PageHeader
        title="Laporan Pemasukan"
        subtitle="Pantau performa penagihan per periode, paket, dan area."
        actions={can('finance', 'export') && (
          <a href={exportUrl}><Button variant="outline"><Download size={15} /> Export CSV</Button></a>
        )}
      />

      <section className="income-hero mb-5">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_10px_#16a36a]" />Data pembayaran tervalidasi</div><p className="text-sm text-slate-300">Periode aktif: <strong className="font-semibold text-white">{periodLabel}</strong></p></div>
          <div className="flex flex-wrap gap-2">{[['today', 'Hari ini'], ['week', '7 hari'], ['month', 'Bulan ini']].map(([value, label]) => <button key={value} type="button" onClick={() => setRange(value)} className="income-preset">{label}</button>)}<button type="button" onClick={() => setRange('all')} className="income-preset"><FilterX size={14} /> Reset</button></div>
        </div>
      </section>

      <Card className="mb-5 overflow-hidden" bodyClass="!p-0">
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end">
          <div><label className="label"><CalendarDays size={13} className="mr-1 inline" />Dari</label><input type="date" className="input" value={draft.from} onChange={(e) => updateDraft('from', e.target.value)} /></div>
          <div><label className="label"><CalendarDays size={13} className="mr-1 inline" />Sampai</label><input type="date" className="input" value={draft.to} onChange={(e) => updateDraft('to', e.target.value)} /></div>
          <div><label className="label"><Layers3 size={13} className="mr-1 inline" />Paket</label><select className="input" value={draft.package_id} onChange={(e) => updateDraft('package_id', e.target.value)}><option value="">Semua paket</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div><label className="label"><MapPinned size={13} className="mr-1 inline" />Area</label><select className="input" value={draft.area} onChange={(e) => updateDraft('area', e.target.value)}><option value="">Semua area</option>{areas.map((item) => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}</select></div>
          <Button onClick={() => setFilters(draft)} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Terapkan</Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <StatCard label="Total Pemasukan" value={fmtIDR(total)} sub={periodLabel} color="bg-accent-green/15 text-accent-green" icon={TrendingUp} />
        <StatCard label="Pembayaran Terkonfirmasi" value={fmtNum(data.summary.count)} sub="Transaksi berhasil" color="bg-accent-blue/15 text-accent-blue" icon={ReceiptText} />
        <StatCard label="Rata-rata per Transaksi" value={fmtIDR(data.summary.count ? total / data.summary.count : 0)} sub="Nilai pembayaran" color="bg-accent-purple/15 text-accent-purple" icon={Landmark} />
        <StatCard label="Paket Teratas" value={topPackage?.name || '-'} sub={topPackage ? `${fmtIDR(topPackage.total)} · ${topPackage.count} transaksi` : 'Belum ada data'} color="bg-accent-orange/15 text-accent-orange" icon={Layers3} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Tren Pemasukan Harian" right={<span className="text-xs text-slate-400">{daily.length} titik data</span>}>
          {daily.length > 1 ? <SimpleBar data={daily} keys={[{ key: 'value', name: 'Pemasukan' }]} height={300} /> : <Empty text="Belum cukup data tren untuk ditampilkan" />}
        </Card>
        <Card className="xl:col-span-2" title="Kontribusi per Paket" right={<span className="text-xs text-slate-400">Urut pendapatan</span>} bodyClass="!p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200/60 dark:border-navy-700 text-left text-xs text-slate-400"><th className="px-4 py-3">Paket</th><th className="px-4 py-3 text-right">Pendapatan</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
              {data.byPackage.map((item) => { const share = total ? Math.round((item.total / total) * 100) : 0; return <tr key={item.name} className="hover:bg-slate-50/70 dark:hover:bg-navy-700/30"><td className="px-4 py-3"><p className="font-medium">{item.name}</p><div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700"><div className="h-full rounded-full bg-gradient-to-r from-accent-blue to-accent-purple" style={{ width: `${share}%` }} /></div><span className="text-[11px] text-slate-400">{share}%</span></div><p className="mt-1 text-xs text-slate-400">{item.count} transaksi</p></td><td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{fmtIDR(item.total)}</td></tr>; })}
            </tbody>
          </table>
          {data.byPackage.length === 0 && <Empty />}
        </Card>
        <Card className="xl:col-span-5" title="Performa Area" right={topArea && <span className="text-xs text-slate-400">Area teratas: <strong className="text-accent-green">{topArea.area}</strong></span>} bodyClass="!p-0 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b border-slate-200/60 dark:border-navy-700 text-left text-xs text-slate-400"><th className="px-4 py-3">Area</th><th className="px-4 py-3">Transaksi</th><th className="px-4 py-3">Kontribusi</th><th className="px-4 py-3 text-right">Total Pemasukan</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
              {data.byArea.map((item) => { const share = total ? Math.round((item.total / total) * 100) : 0; return <tr key={item.area} className="hover:bg-slate-50/70 dark:hover:bg-navy-700/30"><td className="px-4 py-3 font-medium">{item.area}</td><td className="px-4 py-3">{fmtNum(item.count)}</td><td className="px-4 py-3 min-w-[170px]"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700"><div className="h-full rounded-full bg-accent-green" style={{ width: `${share}%` }} /></div><span className="text-xs text-slate-400">{share}%</span></div></td><td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{fmtIDR(item.total)}</td></tr>; })}
            </tbody>
          </table>
          {data.byArea.length === 0 && <Empty />}
        </Card>
      </div>
    </div>
  );
}

/** Piutang/Tunggakan aging report (PRD 5.7) */
export function AgingReport() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('all');
  const [bucket, setBucket] = useState('all');
  const [sort, setSort] = useState('total');
  useEffect(() => {
    api.get('/reports/aging').then(({ data }) => setData(data)).catch(() => {});
  }, []);
  if (!data) return <div className="min-h-[360px] grid place-items-center"><RefreshCw className="animate-spin text-accent-blue" size={24} /></div>;
  const b = data.buckets;
  const areas = [...new Set(data.rows.map((row) => row.area || '-'))].sort();
  const filteredRows = data.rows.filter((row) => {
    const term = query.toLowerCase();
    const matchesQuery = !term || [row.name, row.code, row.phone, row.package_name].some((value) => String(value || '').toLowerCase().includes(term));
    const matchesArea = area === 'all' || (row.area || '-') === area;
    const matchesBucket = bucket === 'all' || Number(row[`b${bucket}`]) > 0;
    return matchesQuery && matchesArea && matchesBucket;
  }).sort((first, second) => sort === 'oldest' ? new Date(first.oldest_due) - new Date(second.oldest_due) : Number(second.total) - Number(first.total));
  const criticalCount = data.rows.filter((row) => Number(row.b60p) > 0).length;
  const criticalShare = b.total ? Math.round((b.b60p / b.total) * 100) : 0;
  const topArea = data.rows.reduce((totals, row) => ({ ...totals, [row.area || '-']: (totals[row.area || '-'] || 0) + Number(row.total) }), {});
  const [topAreaName, topAreaTotal] = Object.entries(topArea).sort(([, first], [, second]) => second - first)[0] || ['-', 0];

  return (
    <div className="aging-report">
      <PageHeader title="Piutang / Tunggakan" subtitle="Prioritaskan penagihan berdasarkan usia dan nilai piutang." actions={<Link to="/tagihan?status=unpaid"><Button variant="outline"><ReceiptText size={15} /> Buka Tagihan</Button></Link>} />
      <section className="aging-hero mb-5">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-orange-100"><span className={`h-1.5 w-1.5 rounded-full ${criticalCount ? 'bg-accent-red shadow-[0_0_10px_#dc4c58]' : 'bg-accent-green shadow-[0_0_10px_#16a36a]'}`} />{criticalCount ? 'Perlu perhatian penagihan' : 'Tidak ada piutang kritis'}</div><p className="text-sm text-slate-300">{criticalCount ? <><strong className="text-white">{criticalCount} pelanggan</strong> memiliki tunggakan lebih dari 60 hari.</> : 'Semua tagihan tertunggak masih dalam tahap awal.'}</p></div>
          <div className="rounded-xl border border-white/10 bg-slate-950/25 px-4 py-3"><p className="text-xs uppercase tracking-wider text-slate-400">Eksposur risiko &gt;60 hari</p><p className="mt-1 text-2xl font-bold text-white">{criticalShare}%</p><div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-accent-orange to-accent-red" style={{ width: `${criticalShare}%` }} /></div></div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-4 mb-5 xl:grid-cols-4">
        <StatCard label="0–30 Hari" value={fmtIDR(b.b0_30)} sub="Tindak lanjut awal" color="bg-accent-yellow/15 text-accent-yellow" icon={ReceiptText} />
        <StatCard label="31–60 Hari" value={fmtIDR(b.b31_60)} sub="Butuh penagihan aktif" color="bg-accent-orange/15 text-accent-orange" icon={TriangleAlert} />
        <StatCard label="> 60 Hari" value={fmtIDR(b.b60p)} sub={`${criticalCount} pelanggan kritis`} color="bg-accent-red/15 text-accent-red" icon={ShieldAlert} />
        <StatCard label="Total Piutang" value={fmtIDR(b.total)} sub={`${b.count} pelanggan tertunggak`} color="bg-accent-blue/15 text-accent-blue" icon={UsersRound} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_310px]">
        <Card className="overflow-hidden" bodyClass="!p-0">
          <div className="grid gap-3 border-b border-slate-200/60 p-4 md:grid-cols-2 xl:grid-cols-[1fr_180px_160px_150px] dark:border-navy-700">
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari pelanggan, kode, telepon, paket…" /></div>
            <select className="input" value={area} onChange={(event) => setArea(event.target.value)}><option value="all">Semua area</option>{areas.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <select className="input" value={bucket} onChange={(event) => setBucket(event.target.value)}><option value="all">Semua usia</option><option value="0_30">0–30 hari</option><option value="31_60">31–60 hari</option><option value="60p">&gt;60 hari</option></select>
            <select className="input" value={sort} onChange={(event) => setSort(event.target.value)}><option value="total">Nilai tertinggi</option><option value="oldest">Terlama jatuh tempo</option></select>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
          <thead className="border-b border-slate-200/60 dark:border-navy-700">
            <tr>
              <th className="th">Pelanggan</th><th className="th">Area</th><th className="th">Status Risiko</th><th className="th">Tagihan</th>
              <th className="th">0–30</th><th className="th">31–60</th><th className="th">&gt;60</th><th className="th text-right">Total</th><th className="th text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {filteredRows.map((r) => {
              const risk = Number(r.b60p) > 0 ? ['Kritis', 'bg-accent-red/15 text-accent-red'] : Number(r.b31_60) > 0 ? ['Tinggi', 'bg-accent-orange/15 text-accent-orange'] : ['Perlu tindak lanjut', 'bg-accent-yellow/15 text-accent-yellow'];
              return (
              <tr key={r.customer_id} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
                <td className="td"><p className="font-medium">{r.name}</p><p className="text-xs text-slate-400">{r.code} · {r.package_name || '-'}</p></td>
                <td className="td text-sm">{r.area || '-'}</td>
                <td className="td"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${risk[1]}`}>{risk[0]}</span></td>
                <td className="td text-sm">{r.invoice_count}x<br /><span className="text-xs text-slate-400">sejak {fmtDate(r.oldest_due)}</span></td>
                <td className="td text-sm">{fmtIDR(r.b0_30)}</td>
                <td className="td text-sm">{fmtIDR(r.b31_60)}</td>
                <td className="td text-sm">{fmtIDR(r.b60p)}</td>
                <td className="td text-right font-bold text-accent-red">{fmtIDR(r.total)}</td>
                <td className="td text-right"><div className="inline-flex gap-1">{r.phone && <a href={`tel:${r.phone}`} title={`Hubungi ${r.name}`} className="inline-flex rounded-lg p-2 text-accent-green hover:bg-accent-green/10"><Phone size={15} /></a>}<Link to="/tagihan?status=unpaid" title="Lihat tagihan"><span className="inline-flex rounded-lg p-2 text-accent-blue hover:bg-accent-blue/10"><ReceiptText size={15} /></span></Link></div></td>
              </tr>
              );
            })}
          </tbody>
        </table>
          </div>
          {filteredRows.length === 0 && <Empty text={data.rows.length ? 'Tidak ada data sesuai filter' : 'Tidak ada piutang menunggak'} />}
        </Card>
        <div className="space-y-4">
          <Card title="Prioritas Penagihan"><div className="space-y-4"><div className="rounded-xl border border-accent-red/20 bg-accent-red/5 p-3"><p className="text-xs font-semibold text-accent-red">SEGERA DITINDAKLANJUTI</p><p className="mt-1 text-lg font-bold">{fmtIDR(b.b60p)}</p><p className="mt-1 text-xs text-slate-400">Piutang berusia lebih dari 60 hari.</p></div><div><p className="text-xs text-slate-400">Area dengan piutang tertinggi</p><p className="mt-1 font-semibold">{topAreaName}</p><p className="text-sm text-accent-orange">{fmtIDR(topAreaTotal)}</p></div><div className="border-t border-slate-200/60 pt-3 text-xs leading-relaxed text-slate-500 dark:border-navy-700 dark:text-slate-400">Urutan default berdasarkan nilai piutang agar tim dapat memaksimalkan pemulihan kas.</div></div></Card>
          <Card title="Legenda Usia"><div className="space-y-3 text-sm"><p className="flex items-center justify-between"><span className="text-slate-500">0–30 hari</span><span className="font-medium text-accent-yellow">Awal</span></p><p className="flex items-center justify-between"><span className="text-slate-500">31–60 hari</span><span className="font-medium text-accent-orange">Tinggi</span></p><p className="flex items-center justify-between"><span className="text-slate-500">&gt;60 hari</span><span className="font-medium text-accent-red">Kritis</span></p></div></Card>
        </div>
      </div>
    </div>
  );
}


/** Arus kas aktual: pembayaran confirmed + transaksi approved. */
export function CashFlow() {
  const today = isoDate(new Date());
  const monthStart = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [filters, setFilters] = useState({ from: monthStart, to: today });
  const [draft, setDraft] = useState(filters);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const { can } = useAuth();
  const { toast } = useToast();
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await api.get('/reports/cashflow', { params: filterParams(filters) });
      const report = response.data;
      if (!report || !report.totals || !Array.isArray(report.daily) || !Array.isArray(report.expenseByCategory) || !Array.isArray(report.recent)) {
        throw new Error('Format laporan Arus Kas dari server belum diperbarui. Muat ulang layanan API.');
      }
      setData({
        ...report,
        totals: { income: 0, billing: 0, nonBilling: 0, expense: 0, net: 0, ...report.totals },
      });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Laporan arus kas tidak dapat dimuat');
    }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  if (!data && !error) return <div className="min-h-[360px] grid place-items-center"><RefreshCw className="animate-spin text-accent-blue" size={24} /></div>;
  if (!data) return <div className="min-h-[360px] grid place-items-center text-center"><div><p className="font-semibold text-accent-red">Gagal memuat Arus Kas</p><p className="mt-1 text-sm text-slate-500">{error}</p><Button className="mt-4" onClick={load}><RefreshCw size={15} /> Coba lagi</Button></div></div>;
  const { totals } = data;
  const expenseDonut = data.expenseByCategory.map((row) => ({ name: row.name, value: row.total }));
  const periodLabel = `${fmtDate(data.from)} — ${fmtDate(data.to)}`;
  const setRange = (preset) => {
    const now = new Date();
    const next = preset === 'month' ? { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) }
      : preset === 'week' ? { from: isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: isoDate(now) }
        : { from: isoDate(new Date(now.getFullYear(), 0, 1)), to: isoDate(now) };
    setDraft(next); setFilters(next);
  };
  const exportUrl = `/api/reports/cashflow/export?${new URLSearchParams(filterParams(filters)).toString()}`;

  return (
    <div className="cashflow-report">
      <PageHeader title="Arus Kas" subtitle="Kas aktual dari pembayaran terkonfirmasi dan transaksi yang disetujui." actions={can('finance', 'export') && <a href={exportUrl}><Button variant="outline"><Download size={15} /> Export CSV</Button></a>} />
      <section className="cashflow-hero mb-5"><div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-cyan-200">Posisi Kas Bersih</p><p className={`mt-1 text-3xl font-bold ${totals.net >= 0 ? 'text-white' : 'text-red-200'}`}>{fmtIDR(totals.net)}</p><p className="mt-1 text-sm text-slate-300">Periode {periodLabel}</p></div><div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-white/10 bg-slate-950/25 px-4 py-3"><p className="text-xs text-slate-400">Cash in</p><p className="mt-1 font-bold text-accent-green">{fmtIDR(totals.income)}</p></div><div className="rounded-xl border border-white/10 bg-slate-950/25 px-4 py-3"><p className="text-xs text-slate-400">Cash out</p><p className="mt-1 font-bold text-accent-red">{fmtIDR(totals.expense)}</p></div></div></div></section>
      <Card className="mb-5"><div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]"><input type="date" className="input" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /><input type="date" className="input" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /><Button onClick={() => { if (draft.from && draft.to && draft.from > draft.to) return toast('Tanggal mulai tidak boleh melebihi tanggal akhir', 'warning'); setFilters(draft); }}><Search size={15} /> Terapkan</Button></div><div className="mt-3 flex flex-wrap gap-2"><button className="income-preset" onClick={() => setRange('week')}>7 hari terakhir</button><button className="income-preset" onClick={() => setRange('month')}>Bulan ini</button><button className="income-preset" onClick={() => setRange('year')}>Tahun ini</button></div></Card>
      <div className="grid grid-cols-2 gap-4 mb-5 xl:grid-cols-4"><StatCard label="Pemasukan Tagihan" value={fmtIDR(totals.billing)} sub="Pembayaran confirmed" color="bg-accent-green/15 text-accent-green" icon={ArrowUpRight} /><StatCard label="Pemasukan Lain" value={fmtIDR(totals.nonBilling)} sub="Transaksi approved" color="bg-accent-blue/15 text-accent-blue" icon={Landmark} /><StatCard label="Pengeluaran" value={fmtIDR(totals.expense)} sub="Transaksi approved" color="bg-accent-red/15 text-accent-red" icon={ArrowDownRight} /><StatCard label="Arus Kas Bersih" value={fmtIDR(totals.net)} sub={totals.net >= 0 ? 'Surplus kas periode ini' : 'Defisit kas periode ini'} color={totals.net >= 0 ? 'bg-accent-purple/15 text-accent-purple' : 'bg-accent-red/15 text-accent-red'} icon={WalletCards} /></div>
      <div className="grid gap-4 xl:grid-cols-3 mb-4"><Card title="Tren Kas Harian" right={<span className="text-xs text-slate-400">Masuk vs keluar</span>} className="xl:col-span-2">{data.daily.length ? <TrendArea data={data.daily} keys={[{ key: 'income', name: 'Pemasukan' }, { key: 'expense', name: 'Pengeluaran' }]} /> : <Empty text="Belum ada arus kas dalam periode ini" />}</Card><Card title="Komposisi Pengeluaran">{expenseDonut.length ? <DonutChart data={expenseDonut} height={260} /> : <Empty text="Tidak ada pengeluaran" />}</Card></div>
      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <Card title="Ringkasan Arus Kas">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Pemasukan</span><strong className="text-accent-green">{fmtIDR(totals.income)}</strong></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Pengeluaran</span><strong className="text-accent-red">{fmtIDR(totals.expense)}</strong></div>
            <div className="flex justify-between border-t border-slate-100 pt-3 font-bold dark:border-navy-700"><span>Kas bersih</span><span className={totals.net >= 0 ? 'text-accent-purple' : 'text-accent-red'}>{fmtIDR(totals.net)}</span></div>
          </div>
        </Card>
        <Card title="Transaksi Terbaru">
          {data.recent.length ? <div className="space-y-3">{data.recent.slice(0, 5).map((item, index) => <div key={`${item.tx_date}-${item.category}-${index}`} className="flex items-start justify-between gap-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{item.description || item.category}</p><p className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(item.tx_date)} · {item.category}</p></div><strong className={item.type === 'expense' ? 'text-accent-red' : 'text-accent-green'}>{item.type === 'expense' ? '-' : '+'}{fmtIDR(item.amount)}</strong></div>)}</div> : <Empty text="Belum ada transaksi" />}
        </Card>
      </div>
    </div>
  );
}

/** Laba Rugi (PRD 5.8) */
export function ProfitLoss() {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState(null);
  const [error, setError] = useState('');
  const { can } = useAuth();
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const year = period.slice(0, 4);
  const load = useCallback(async () => {
    setError('');
    try {
      const [p, t] = await Promise.all([api.get('/reports/profit-loss', { params: { period } }), api.get('/reports/pl-trend', { params: { year } })]);
      setData(p.data); setTrend(t.data);
    } catch (err) { setError(err.response?.data?.message || 'Laporan laba rugi tidak dapat dimuat'); }
  }, [period, year]);
  useEffect(() => { load(); }, [load]);
  if (!data && !error) return <div className="min-h-[360px] grid place-items-center"><RefreshCw className="animate-spin text-accent-purple" size={24} /></div>;
  if (!data) return <div className="min-h-[360px] grid place-items-center text-center"><div><p className="font-semibold text-accent-red">Gagal memuat Laba Rugi</p><p className="mt-1 text-sm text-slate-500">{error}</p><Button className="mt-4" onClick={load}><RefreshCw size={15} /> Coba lagi</Button></div></div>;
  const donut = data.expenses.map((e) => ({ name: e.name, value: e.total }));
  const trendData = trend?.monthly.map((m) => ({ label: m.label, revenue: m.revenue, expense: m.expense, net: m.net })) || [];
  const margin = data.revenue.total ? (data.net / data.revenue.total) * 100 : 0;
  const topExpense = data.expenses[0];
  const expenseShare = topExpense && data.totalExpense ? (topExpense.total / data.totalExpense) * 100 : 0;
  const navigatePeriod = (offset) => {
    const [y, m] = period.split('-').map(Number); const next = new Date(y, m - 1 + offset, 1);
    setPeriod(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };
  const exportCsv = async () => {
    try {
      const response = await api.get('/reports/profit-loss/export', { params: { period }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a');
      link.href = url; link.download = `laba-rugi-${period}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch { setError('Export laporan laba rugi gagal'); }
  };
  return (
    <div className="profit-loss-report">
      <PageHeader title="Laba Rugi" subtitle="Pantau kesehatan pendapatan, beban, dan profitabilitas bisnis." actions={<div className="flex gap-2"><input aria-label="Pilih periode laporan" type="month" className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} />{can('finance', 'export') && <Button variant="outline" onClick={exportCsv}><Download size={15} /> Export CSV</Button>}</div>} />
      <section className="profit-hero mb-5"><div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-200">Laba Bersih · {periodLabel(period)}</p><p className={`mt-1 text-3xl font-bold ${data.net >= 0 ? 'text-white' : 'text-red-200'}`}>{fmtIDR(data.net)}</p><div className="mt-3 flex flex-wrap gap-2"><span className={`profit-pill ${data.net >= 0 ? 'profit-pill-good' : 'profit-pill-risk'}`}>{data.net >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{data.net >= 0 ? 'Profit positif' : 'Defisit periode ini'}</span>{data.growth !== null && <span className="profit-pill"><TrendingUp size={14} />{Math.abs(data.growth).toFixed(1)}% MoM</span>}</div></div><div className="text-sm text-slate-300">Margin laba <strong className="text-white">{margin.toFixed(1)}%</strong></div></div></section>
      <Card className="mb-5"><div className="flex flex-wrap items-center gap-2"><CalendarDays size={16} className="text-accent-purple" /><span className="mr-2 text-sm font-medium">Navigasi periode</span><button className="income-preset" onClick={() => navigatePeriod(-1)}>Bulan sebelumnya</button><button className="income-preset" onClick={load}>Muat ulang</button><button className="income-preset" onClick={() => navigatePeriod(1)}>Bulan berikutnya</button></div></Card>
      <div className="grid grid-cols-2 gap-4 mb-5 xl:grid-cols-4"><StatCard label="Pendapatan Tagihan" value={fmtIDR(data.revenue.billing)} sub="Pembayaran confirmed" color="bg-accent-green/15 text-accent-green" icon={ArrowUpRight} /><StatCard label="Pendapatan Non-Tagihan" value={fmtIDR(data.revenue.nonBilling)} sub="Transaksi approved" color="bg-accent-blue/15 text-accent-blue" icon={Landmark} /><StatCard label="Total Beban" value={fmtIDR(data.totalExpense)} sub={`${data.expenses.length} kategori beban`} color="bg-accent-red/15 text-accent-red" icon={ArrowDownRight} /><StatCard label="Margin Laba" value={`${margin.toFixed(1)}%`} sub={data.growth !== null ? `${data.growth >= 0 ? 'Naik' : 'Turun'} ${Math.abs(data.growth).toFixed(1)}% MoM` : 'Belum ada pembanding'} color={data.net >= 0 ? 'bg-accent-purple/15 text-accent-purple' : 'bg-accent-red/15 text-accent-red'} icon={WalletCards} /></div>
      <div className="grid gap-4 xl:grid-cols-3 mb-4"><Card title="Tren Profitabilitas" right={<span className="text-xs text-slate-400">Tahun {year}</span>} className="xl:col-span-2"><SimpleBar data={trendData} keys={[{ key: 'revenue', name: 'Pendapatan' }, { key: 'expense', name: 'Beban' }]} /></Card><Card title="Komposisi Beban">{donut.length ? <DonutChart data={donut} height={260} /> : <Empty text="Tidak ada beban periode ini" />}</Card></div>
      <div className="grid gap-4 xl:grid-cols-[1fr_330px]"><Card title="Rincian Laba Rugi" right={<span className="text-xs text-slate-400">{periodLabel(period)}</span>} bodyClass="!p-0"><div className="divide-y divide-slate-100 dark:divide-navy-700/50"><div className="px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-accent-green">Pendapatan</p><div className="mt-2 space-y-2 text-sm"><div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Tagihan pelanggan</span><strong>{fmtIDR(data.revenue.billing)}</strong></div><div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Pendapatan non-tagihan</span><strong>{fmtIDR(data.revenue.nonBilling)}</strong></div><div className="flex justify-between border-t border-slate-100 pt-2 font-semibold dark:border-navy-700"><span>Total pendapatan</span><span className="text-accent-green">{fmtIDR(data.revenue.total)}</span></div></div></div><div className="px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-accent-red">Beban</p>{data.expenses.length ? <div className="mt-2 space-y-2 text-sm">{data.expenses.map((item) => <div key={item.name} className="flex justify-between gap-4"><span className="truncate text-slate-500 dark:text-slate-400">{item.name}</span><strong>{fmtIDR(item.total)}</strong></div>)}</div> : <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Tidak ada beban disetujui.</p>}<div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold dark:border-navy-700"><span>Total beban</span><span className="text-accent-red">{fmtIDR(data.totalExpense)}</span></div></div><div className="flex justify-between bg-slate-50 px-4 py-4 font-bold dark:bg-navy-900/40"><span>Laba bersih</span><span className={data.net >= 0 ? 'text-accent-purple' : 'text-accent-red'}>{fmtIDR(data.net)}</span></div></div></Card><Card title="Insight Periode"><div className="space-y-3 text-sm"><div className="profit-insight"><TrendingUp size={17} className="text-accent-purple" /><p>Margin laba periode ini <strong>{margin.toFixed(1)}%</strong>.</p></div>{topExpense && <div className="profit-insight"><ArrowDownRight size={17} className="text-accent-red" /><p><strong>{topExpense.name}</strong> menjadi beban terbesar, {expenseShare.toFixed(1)}% dari total beban.</p></div>}<div className="profit-insight">{data.net >= 0 ? <TrendingUp size={17} className="text-accent-green" /> : <TrendingDown size={17} className="text-accent-red" />}<p>{data.growth === null ? 'Belum ada data bulan sebelumnya untuk perbandingan.' : `Laba bersih ${data.growth >= 0 ? 'naik' : 'turun'} ${Math.abs(data.growth).toFixed(1)}% dibanding bulan sebelumnya.`}</p></div></div></Card></div>
    </div>
  );
}
