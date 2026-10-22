import { useEffect, useMemo, useState } from 'react';
import { Landmark, User } from 'lucide-react';
import api from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Button, Badge } from '../components/ui.jsx';
import { fmtDate, fmtIDR, fmtNum, periodLabel } from '../utils/format.js';

/** Input Rupiah: prefix "Rp" + pemisah ribuan otomatis */
function RpInput({ value, onChange, ...props }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        className="input pl-10 pr-3 text-right text-lg font-bold tracking-wide"
        value={value === '' || value == null ? '' : fmtNum(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '');
          onChange(digits === '' ? 0 : Number(digits));
        }}
        {...props}
      />
    </div>
  );
}

/**
 * Modal catat pembayaran (PRD 5.2): cicilan/sebagian, metode tunai/QRIS/gateway
 * dan transfer yang terintegrasi Master Bank (tanpa upload bukti).
 */
export default function PaymentForm({ invoice, onClose, onDone, onNew, preset }) {
  const { toast } = useToast();
  const total = Number(invoice?.total || preset?.total || 0);
  const remaining = total - Number(invoice?.paid_amount || 0);
  const servicePeriod = invoice?.service_start
    ? `${fmtDate(invoice.service_start)} – ${fmtDate(invoice.service_end)}`
    : periodLabel(invoice?.period);
  const [amount, setAmount] = useState(remaining > 0 ? remaining : total);
  const [method, setMethod] = useState('cash'); // cash | qris | gateway | bank:<id>
  const [banks, setBanks] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/banks', { params: { active: 1 } })
      .then(({ data }) => setBanks(data.rows || []))
      .catch(() => setBanks([])); // dropdown tetap terpakai meski master bank gagal dimuat
  }, []);

  const selBank = useMemo(
    () => (method.startsWith('bank:') ? banks.find((b) => String(b.id) === method.slice(5)) : null),
    [method, banks]
  );

  const save = async (e, addNew = false) => {
    e?.preventDefault();
    setBusy(true);
    try {
      await api.post('/payments', {
        invoice_id: invoice?.id || preset?.invoice_id,
        amount,
        method: selBank ? 'transfer' : method,
        bank_id: selBank?.id,
        note,
      });
      toast('Pembayaran tercatat. Jika pelanggan terisolir, layanan akan diaktifkan otomatis.', 'success');
      (addNew ? onNew : onDone)?.();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal mencatat pembayaran', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={invoice ? `Catat Pembayaran — ${invoice.number}` : 'Catat Pembayaran'} className="max-w-md">
      <form onSubmit={save} className="space-y-4">
        {/* Ringkasan tagihan */}
        <div className="rounded-xl border border-slate-200/70 dark:border-navy-600 bg-gradient-to-br from-slate-100/80 to-slate-50 dark:from-navy-700/80 dark:to-navy-700/40 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-blue/15 text-accent-blue">
                <User size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{invoice?.customer_name || '-'}</p>
                <p className="text-xs text-slate-400 font-mono truncate">{invoice?.number || '-'}</p>
              </div>
            </div>
            {invoice?.area && <Badge value="info" label={invoice.area} />}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div className="rounded-lg bg-white/60 dark:bg-navy-800/50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Periode Pemakaian</p>
              <p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-100">{servicePeriod}</p>
            </div>
            <div className="rounded-lg bg-white/60 dark:bg-navy-800/50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Jatuh Tempo</p>
              <p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-100">{fmtDate(invoice?.due_date)}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3.5 text-center">
            <div className="rounded-lg bg-white/80 dark:bg-navy-800/70 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Tagihan</p>
              <p className="text-sm font-bold">{fmtIDR(total)}</p>
            </div>
            <div className="rounded-lg bg-white/80 dark:bg-navy-800/70 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Dibayar</p>
              <p className="text-sm font-bold text-accent-green">{fmtIDR(invoice?.paid_amount || 0)}</p>
            </div>
            <div className="rounded-lg bg-white/80 dark:bg-navy-800/70 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Sisa</p>
              <p className="text-sm font-bold text-accent-red">{fmtIDR(remaining)}</p>
            </div>
          </div>
        </div>

        {/* Jumlah pembayaran */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">Jumlah Pembayaran</label>
            <button type="button" onClick={() => setAmount(remaining)}
              className="text-xs font-semibold text-accent-blue hover:underline">
              Bayar Penuh ({fmtIDR(remaining)})
            </button>
          </div>
          <RpInput value={amount} onChange={setAmount} min={1} required autoFocus />
          <p className="text-[11px] text-slate-400 mt-1">Boleh sebagian/cicilan — sisa tagihan tercatat otomatis</p>
        </div>

        {/* Metode — terintegrasi Master Bank */}
        <div>
          <label className="label">Metode Pembayaran</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Tunai</option>
            <option value="qris">QRIS</option>
            <option value="gateway">Payment Gateway</option>
            {banks.length > 0 && (
              <optgroup label="Transfer Bank">
                {banks.map((b) => (
                  <option key={b.id} value={`bank:${b.id}`}>
                    {b.name} · {b.account_number} (a.n. {b.account_name})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {selBank ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/5 px-3 py-2 text-xs">
              <Landmark size={14} className="text-accent-blue shrink-0" />
              <span>
                Transfer ke <strong>{selBank.name} {selBank.account_number}</strong> a.n. {selBank.account_name}
              </span>
            </div>
          ) : banks.length === 0 && (
            <p className="text-[11px] text-slate-400 mt-1">
              Belum ada rekening transfer — tambahkan di menu Keuangan → Master Bank
            </p>
          )}
        </div>

        {/* Catatan */}
        <div>
          <label className="label">Catatan</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="misal: cicilan ke-1" />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
          <Button type="submit" variant="green" disabled={busy || !(amount > 0)}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
          <Button type="button" variant="primary" onClick={() => save(null, true)} disabled={busy || !(amount > 0)}>
            Simpan & Tambah Baru
          </Button>
        </div>
      </form>
    </Modal>
  );
}
