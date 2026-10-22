import { useEffect, useState } from 'react';
import { BadgeDollarSign, FileText, Percent, Save } from 'lucide-react';
import api from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Button, Modal, Spinner } from './ui.jsx';
import { fmtIDR, fmtNum } from '../utils/format.js';

const nominal = (value) => Math.max(0, Number(value) || 0);

function RpInput({ value, onChange, ...props }) {
  return <div className="relative"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">Rp</span><input type="text" inputMode="numeric" className="input py-3 pl-10 text-right text-base font-bold tabular-nums" value={value === '' ? '' : fmtNum(value)} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))} {...props} /></div>;
}

export default function InvoiceAdjustmentModal({ invoiceId, onClose, onDone }) {
  const { toast } = useToast();
  const [invoice, setInvoice] = useState(null);
  const [additionalFee, setAdditionalFee] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!invoiceId) return undefined;
    let active = true;
    setInvoice(null);
    api.get(`/invoices/${invoiceId}`).then(({ data }) => {
      if (!active) return;
      setInvoice(data.invoice); setAdditionalFee(String(data.invoice.additional_fee || 0)); setDiscount(String(data.invoice.discount || 0)); setNote(data.invoice.note || '');
    }).catch((err) => { if (active) toast(err.response?.data?.message || 'Gagal memuat tagihan', 'danger'); });
    return () => { active = false; };
  }, [invoiceId, toast]);

  if (!invoiceId) return null;
  const baseTotal = nominal(invoice?.amount) + nominal(invoice?.late_fee) + nominal(invoice?.tax);
  const beforeDiscount = baseTotal + nominal(additionalFee);
  const total = Math.max(0, beforeDiscount - nominal(discount));
  const editable = invoice?.status === 'unpaid' && nominal(invoice?.paid_amount) === 0;
  const discountTooHigh = nominal(discount) > beforeDiscount;
  const save = async (e) => {
    e.preventDefault(); if (!editable || discountTooHigh) return;
    setSaving(true);
    try {
      await api.put(`/invoices/${invoiceId}/adjustments`, { additional_fee: nominal(additionalFee), discount: nominal(discount), note });
      toast('Biaya dan diskon tagihan diperbarui', 'success'); onDone?.(); onClose();
    } catch (err) { toast(err.response?.data?.message || 'Gagal menyimpan penyesuaian', 'danger'); } finally { setSaving(false); }
  };

  return <Modal open onClose={onClose} title="Penambahan Biaya dan Diskon" className="max-w-2xl">
    {!invoice ? <Spinner /> : <form onSubmit={save} className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-violet-50 to-white p-4 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-violet-500/10 dark:to-navy-800">
        <div className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-violet-400/15 blur-2xl" />
        <div className="relative flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25"><FileText size={19} /></span><div className="min-w-0"><p className="text-sm font-bold">{invoice.number}</p><p className="mt-0.5 truncate text-xs text-muted">{invoice.customer_name}</p></div><span className="ml-auto"><Badge value={invoice.status} /></span></div>
      </div>
      {!editable && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">Tagihan yang sudah dibayar atau dibatalkan tidak dapat diubah.</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-secondary/35 p-3"><label className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground"><span className="rounded-lg bg-indigo-500/10 p-1.5 text-indigo-600 dark:text-indigo-400"><BadgeDollarSign size={15} /></span>Biaya Tambahan</label><RpInput value={additionalFee} onChange={setAdditionalFee} disabled={!editable} autoFocus /></div>
        <div className="rounded-xl border border-border bg-secondary/35 p-3"><label className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground"><span className="rounded-lg bg-rose-500/10 p-1.5 text-rose-600 dark:text-rose-400"><Percent size={15} /></span>Diskon</label><RpInput value={discount} onChange={setDiscount} disabled={!editable} />{discountTooHigh && <p className="mt-1.5 text-xs text-danger">Maksimal {fmtIDR(beforeDiscount)}</p>}</div>
      </div>
      <div><label className="label">Catatan <span className="font-normal text-slate-400">(opsional)</span></label><textarea className="input min-h-[92px]" maxLength="255" value={note} disabled={!editable} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: biaya pindah titik atau promo pelanggan" /></div>
      <section className="rounded-2xl border border-border bg-secondary/40 p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Ringkasan Total</p><p className="text-[11px] font-medium uppercase tracking-wide text-muted">Perubahan langsung</p></div><div className="space-y-2 text-sm"><div className="flex justify-between gap-4 text-muted"><span>Layanan, denda, dan pajak</span><span className="font-semibold text-foreground">{fmtIDR(baseTotal)}</span></div><div className="flex justify-between gap-4 text-indigo-600 dark:text-indigo-400"><span>Biaya tambahan</span><span className="font-semibold">+ {fmtIDR(nominal(additionalFee))}</span></div><div className="flex justify-between gap-4 text-rose-600 dark:text-rose-400"><span>Diskon</span><span className="font-semibold">- {fmtIDR(nominal(discount))}</span></div><div className="mt-3 flex justify-between border-t border-border pt-3 text-base"><strong>Total tagihan</strong><strong className="text-lg text-gradient">{fmtIDR(total)}</strong></div></div></section>
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button>{editable && <Button type="submit" disabled={saving || discountTooHigh}><Save size={15} /> {saving ? 'Menyimpan…' : 'Simpan Penyesuaian'}</Button>}</div>
    </form>}
  </Modal>;
}