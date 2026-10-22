import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Download, Receipt, Zap, Landmark, RotateCcw, Trash2 } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { PageHeader, Card, Badge, Button, Modal, Pagination, Empty } from '../components/ui.jsx';
import { fmtIDR, fmtDateTime, statusLabel } from '../utils/format.js';
import PaymentForm from './PaymentForm.jsx';

/** Opsi jumlah baris per halaman untuk tabel Pembayaran (disimpan di URL agar tahan reload) */
const LIMIT_OPTIONS = [15, 25, 50, 100];

export default function Payments() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState(0);
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [unpaid, setUnpaid] = useState([]);
  const [selInv, setSelInv] = useState('');
  const [invQ, setInvQ] = useState('');
  const [invLoading, setInvLoading] = useState(false);
  const [bankId, setBankId] = useState('all');
  const [banks, setBanks] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  // State pagination (halaman & jumlah baris) disimpan di URL → bertahan saat reload,
  // tombol back/forward browser berfungsi, dan alamat bisa dibagikan langsung
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = LIMIT_OPTIONS.includes(Number(params.get('limit'))) ? Number(params.get('limit')) : LIMIT_OPTIONS[0];

  /** Simpan satu parameter pagination ke URL (parameter lain tetap terjaga) */
  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === null || value === undefined || value === '' || value === 'all') next.delete(key);
    else next.set(key, String(value));
    if (key !== 'page') next.delete('page'); // ganti jumlah baris → kembali ke halaman 1
    setParams(next, { replace: true });
  };
  const setPage = (p) => setParam('page', p === 1 ? null : p);
  const setLimit = (n) => setParam('limit', n === LIMIT_OPTIONS[0] ? null : n);

  const load = useCallback(async () => {
    const { data } = await api.get('/payments', {
      params: {
        q, method, bank_id: bankId !== 'all' ? bankId : undefined,
        from: from || undefined, to: to || undefined, page, limit,
      },
    });
    setRows(data.rows);
    setTotal(data.total);
    setSum(data.sum);
  }, [q, method, bankId, from, to, page, limit]);

  useEffect(() => {
    api.get('/banks').then(({ data }) => setBanks(data.rows || [])).catch(() => {});
  }, []);

  // Jaga halaman tetap valid (mis. data berkurang atau URL memuat ?page di luar jangkauan)
  useEffect(() => {
    const pages = Math.ceil(total / limit);
    if (page > 1 && (total === 0 || page > pages)) setPage(Math.max(1, pages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, page, limit]);

  // Kaskade kategori → rekening: rekening hanya berarti untuk Transfer.
  // Ganti ke metode lain ATAU "Semua Metode" → filter rekening ikut direset.
  const bankLocked = method === 'cash' || method === 'qris' || method === 'gateway';
  useEffect(() => {
    if (method !== 'transfer' && bankId !== 'all') setBankId('all');
  }, [method]);

  // ---- Widget pencarian cepat (rentang tanggal) ----
  const [rangeType, setRangeType] = useState('all');
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const applyRange = (type) => {
    const now = new Date();
    let from = ''; let to = '';
    if (type === 'today') { from = isoDate(now); to = isoDate(now); }
    else if (type === '7d') { const s = new Date(now); s.setDate(s.getDate() - 6); from = isoDate(s); to = isoDate(now); }
    else if (type === 'month') { from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1)); to = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)); }
    else if (type === 'lastMonth') { from = isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)); to = isoDate(new Date(now.getFullYear(), now.getMonth(), 0)); }
    setRangeType(type); setFrom(from); setTo(to); setPage(1);
  };
  const resetFilters = () => {
    setQ(''); setMethod('all'); setBankId('all'); setFrom(''); setTo(''); setRangeType('all'); setPage(1);
  };

  // Judul total menyesuaikan kategori/rekening yang dipilih (penjumlahan otomatis per kategori)
  const selBank = banks.find((b) => String(b.id) === String(bankId));
  const methodNames = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS', gateway: 'Gateway' };
  const categoryLabel = selBank
    ? `Transfer · ${selBank.name}`
    : (method !== 'all' ? (methodNames[method] || method) : null);

  /** Muat semua pelanggan bertagihan, satu tagihan terbuka paling awal tiap pelanggan. */
  const loadUnpaid = useCallback(async (search) => {
    setInvLoading(true);
    try {
      const { data } = await api.get('/payments/open-invoices', {
        params: { q: search || undefined },
      });
      setUnpaid(data.rows);
    } catch { /* abaikan — daftar tetap kosong */ }
    setInvLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (params.get('new') === '1') { setShowForm(true); setParams({}, { replace: true }); }
  }, [params, setParams]);

  // Saat popup "Pilih Tagihan yang Dibayar" terbuka (atau kata kunci berubah) → cari dengan debounce
  useEffect(() => {
    if (!showForm) return undefined;
    const t = setTimeout(() => loadUnpaid(invQ), invQ ? 300 : 0);
    return () => clearTimeout(t);
  }, [invQ, showForm, loadUnpaid]);

  const remove = async (payment) => {
    if (!(await confirm({
      title: 'Hapus Pembayaran',
      message: `Pembayaran ${fmtIDR(payment.amount)} untuk tagihan ${payment.invoice_number} akan dihapus. Status tagihan akan dihitung ulang dari sisa pembayaran.`,
      confirmText: 'Ya, Hapus Pembayaran',
      tone: 'danger',
      icon: Trash2,
    }))) return;
    setDeletingId(payment.id);
    try {
      const { data } = await api.delete(`/payments/${payment.id}`);
      toast('Pembayaran dihapus. Tagihan dikembalikan ke daftar tagihan.', 'success');
      navigate(`/tagihan?status=${data.invoice_status}`);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menghapus pembayaran', 'danger');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Pembayaran"
        subtitle={categoryLabel
          ? `${categoryLabel}: ${fmtIDR(sum)} — ${total} transaksi`
          : `Total tercatat: ${fmtIDR(sum)}`}
        actions={
          <>
            {can('payments', 'export') && (
              <a href="/api/payments/export"><Button variant="outline"><Download size={15} /> Export</Button></a>
            )}
            {can('payments', 'create') && (
              <Button variant="green" onClick={() => setShowForm(true)} title="Pilih dari daftar tagihan terbuka">
                <Zap size={15} /> Dari Daftar Tagihan
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cari pelanggan / no tagihan…"
              value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <select className="input" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}>
            <option value="all">Semua Metode</option>
            <option value="cash">Tunai</option>
            <option value="transfer">Transfer</option>
            <option value="qris">QRIS</option>
            <option value="gateway">Gateway</option>
          </select>
          <select
            className={`input ${bankLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
            value={bankId}
            disabled={bankLocked}
            onChange={(e) => {
              const v = e.target.value;
              setBankId(v);
              if (v !== 'all' && method !== 'transfer') setMethod('transfer'); // kaskade: pilih rekening → kategori Transfer
              setPage(1);
            }}
            title={bankLocked ? 'Rekening hanya berlaku untuk metode Transfer' : 'Filter rekening tujuan (transfer)'}>
            <option value="all">{bankLocked ? '— tidak berlaku —' : 'Semua Rekening'}</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.name} · {b.account_number}</option>
            ))}
          </select>
          <input type="date" className="input" value={from}
            onChange={(e) => { setFrom(e.target.value); setRangeType(''); setPage(1); }} title="Dari tanggal" />
          <input type="date" className="input" value={to}
            onChange={(e) => { setTo(e.target.value); setRangeType(''); setPage(1); }} title="Sampai tanggal" />
        </div>

        {/* Widget tombol pencarian cepat */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Pencarian cepat:</span>
          {[['today', 'Hari Ini'], ['7d', '7 Hari'], ['month', 'Bulan Ini'], ['lastMonth', 'Bulan Lalu'], ['all', 'Semua']].map(([t, label]) => (
            <button key={t} type="button" onClick={() => applyRange(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${rangeType === t
                ? 'bg-accent-blue text-white shadow-soft'
                : 'bg-slate-100 dark:bg-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-navy-600'}`}>
              {label}
            </button>
          ))}
          <button type="button" onClick={resetFilters} title="Bersihkan semua filter"
            className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-navy-600">
            <RotateCcw size={12} /> Reset Filter
          </button>
        </div>
      </Card>

      <Card bodyClass="!p-0 overflow-x-auto">
        <table className="w-full min-w-[880px]">
          <thead className="border-b border-slate-200/60 dark:border-navy-700">
            <tr>
              <th className="th">Tanggal</th>
              <th className="th">Pelanggan</th>
              <th className="th">Tagihan</th>
              <th className="th">Metode</th>
              <th className="th">Rekening</th>
              <th className="th">Status</th>
              <th className="th">Kasir</th>
              <th className="th text-right">Jumlah</th>
              <th className="th text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
                <td className="td text-sm">{fmtDateTime(p.payment_date)}</td>
                <td className="td">
                  <p className="font-medium">{p.customer_name}</p>
                  <p className="text-xs text-slate-400">{p.code}</p>
                </td>
                <td className="td text-xs font-mono">{p.invoice_number}</td>
                <td className="td"><Badge value={p.method} label={statusLabel[p.method]} /></td>
                <td className="td">
                  {p.bank_name ? (
                    <>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Landmark size={13} className="text-accent-blue" /> {p.bank_name}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">{p.bank_account}</p>
                    </>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
                <td className="td"><Badge value={p.status} label={statusLabel[p.status]} /></td>
                <td className="td text-sm">{p.created_by_name || '-'}</td>
                <td className="td text-right font-semibold text-accent-green">{fmtIDR(p.amount)}</td>
                <td className="td text-right">
                  <div className="inline-flex gap-1">
                    <a href={`/pembayaran/kwitansi/${p.id}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" title="Cetak Kwitansi"><Receipt size={14} /></Button>
                    </a>
                    {can('payments', 'delete') && (
                      <Button size="sm" variant="ghost" title="Hapus pembayaran" disabled={deletingId === p.id} onClick={() => remove(p)}>
                        <Trash2 size={14} className="text-accent-red" /> {deletingId === p.id ? 'Menghapus…' : 'Hapus'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="Belum ada pembayaran" />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[320px]">
            <Pagination page={page} total={total} limit={limit} onPage={setPage} />
          </div>
          <label className="flex items-center gap-2 px-4 pb-3 text-xs text-slate-500 dark:text-slate-400">
            Tampilkan
            <select
              className="input !w-auto !py-1.5"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label="Jumlah pembayaran per halaman"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            per halaman
          </label>
        </div>
      </Card>

      {showForm && !selInv && (
        <Modal open onClose={() => { setShowForm(false); setInvQ(''); }} title="Pilih Tagihan yang Dibayar">
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Cari nama pelanggan… (juga bisa kode / no tagihan)"
              value={invQ}
              onChange={(e) => setInvQ(e.target.value)}
              autoFocus
            />
            {invQ && (
              <button
                type="button" tabIndex={-1} aria-label="Hapus pencarian"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                onClick={() => setInvQ('')}
              >
                ✕
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {invLoading && (
              <div className="py-8 text-center text-sm text-slate-400">Mencari tagihan…</div>
            )}
            {!invLoading && unpaid.length === 0 && (
              <Empty text={invQ ? `Tagihan yang dapat dibayar atas “${invQ}” tidak ditemukan` : 'Tidak ada tagihan yang dapat dibayar 🎉'} />
            )}
            {!invLoading && unpaid.map((i) => (
              <button key={i.id}
                onClick={() => setSelInv(i)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 dark:border-navy-600 hover:border-accent-blue/50 text-left">
                <div>
                  <p className="text-sm font-medium">
                    {i.customer_name} <span className="text-xs text-slate-400">{i.code}</span>
                    {i.area && <span className="text-xs font-medium text-accent-blue"> · {i.area}</span>}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">{i.number} · Jatuh tempo {fmtDateTime(i.due_date)}</p>
                </div>
                <span className="text-sm font-bold text-accent-red">{fmtIDR(i.total - i.paid_amount)}</span>
              </button>
            ))}
          </div>
          {!invLoading && unpaid.length > 0 && (
            <p className="text-xs text-slate-400 mt-2.5">
              Menampilkan tagihan periode paling awal dari {unpaid.length} pelanggan
            </p>
          )}
        </Modal>
      )}
      {showForm && selInv && (
        <PaymentForm
          invoice={selInv}
          onClose={() => { setShowForm(false); setSelInv(''); setInvQ(''); }}
          onDone={() => { setShowForm(false); setSelInv(''); setInvQ(''); load(); }}
          onNew={() => { setSelInv(''); setInvQ(''); load(); }}
        />
      )}
    </div>
  );
}
