import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import api from '../api.js';
import { fmtIDR, fmtDate, statusLabel } from '../utils/format.js';

/** Halaman cetak invoice (PRD 5.2 — cetak/kirim invoice) */
export default function InvoicePrint() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/invoices/${id}`).then(({ data }) => setData(data)).catch(() => {});
  }, [id]);

  if (!data) return null;
  const { invoice: inv, payments, company } = data;

  return (
    <div className="min-h-screen bg-slate-200/50 dark:bg-navy-950 py-6 px-4">
      <div className="max-w-xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <Link to="/tagihan" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Kembali
        </Link>
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/85">
          <Printer size={15} /> Cetak Invoice
        </button>
      </div>

      <div id="print-area" className="max-w-xl mx-auto bg-white text-slate-900 p-8 rounded-lg shadow-soft">
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-xl font-bold">{company?.company_name || 'NetBill'}</h1>
            <p className="text-xs text-slate-600 mt-1">{company?.company_address}</p>
            <p className="text-xs text-slate-600">{company?.company_phone}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black tracking-tight text-slate-900">INVOICE</p>
            <p className="text-sm font-mono">{inv.number}</p>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${
              inv.status === 'paid' ? 'bg-green-100 text-green-700'
              : inv.status === 'partial' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
              {statusLabel[inv.status]}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-5 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Ditagihkan kepada</p>
            <p className="font-bold">{inv.customer_name}</p>
            <p className="text-slate-600">{inv.address}</p>
            <p className="text-slate-600">{inv.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-slate-600">Tanggal: <strong>{fmtDate(inv.invoice_date)}</strong></p>
            <p className="text-slate-600">Jatuh Tempo: <strong>{fmtDate(inv.due_date)}</strong></p>
            <p className="text-slate-600">Periode: <strong>{inv.service_start ? `${fmtDate(inv.service_start)} – ${fmtDate(inv.service_end)}` : inv.period}</strong></p>
          </div>
        </div>

        <table className="w-full text-sm border border-slate-300">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left px-3 py-2 border-b border-slate-300">Layanan</th>
              <th className="text-right px-3 py-2 border-b border-slate-300">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2 border-b border-slate-200">
                Layanan Internet {inv.package_name} ({inv.package_speed}) — Periode {inv.service_start ? `${fmtDate(inv.service_start)} s/d ${fmtDate(inv.service_end)}` : inv.period}
              </td>
              <td className="px-3 py-2 text-right border-b border-slate-200">{fmtIDR(inv.amount)}</td>
            </tr>
            {Number(inv.late_fee) > 0 && (
              <tr><td className="px-3 py-2 border-b border-slate-200">Denda keterlambatan</td>
                <td className="px-3 py-2 text-right border-b border-slate-200">{fmtIDR(inv.late_fee)}</td></tr>
            )}
            {Number(inv.additional_fee) > 0 && (
              <tr><td className="px-3 py-2 border-b border-slate-200">Biaya tambahan{inv.note ? ` — ${inv.note}` : ''}</td>
                <td className="px-3 py-2 text-right border-b border-slate-200">{fmtIDR(inv.additional_fee)}</td></tr>
            )}
            {Number(inv.tax) > 0 && (
              <tr><td className="px-3 py-2 border-b border-slate-200">Pajak</td>
                <td className="px-3 py-2 text-right border-b border-slate-200">{fmtIDR(inv.tax)}</td></tr>
            )}
            {Number(inv.discount) > 0 && (
              <tr><td className="px-3 py-2 border-b border-slate-200">Diskon</td>
                <td className="px-3 py-2 text-right border-b border-slate-200">- {fmtIDR(inv.discount)}</td></tr>
            )}
            <tr className="font-bold bg-slate-50">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right">{fmtIDR(inv.total)}</td>
            </tr>
            <tr>
              <td className="px-3 py-2">Sudah dibayar</td>
              <td className="px-3 py-2 text-right text-green-700">{fmtIDR(inv.paid_amount)}</td>
            </tr>
            <tr className="font-bold">
              <td className="px-3 py-2">Sisa tagihan</td>
              <td className="px-3 py-2 text-right">{fmtIDR(inv.total - inv.paid_amount)}</td>
            </tr>
          </tbody>
        </table>

        {payments.length > 0 && (
          <div className="mt-4 text-xs text-slate-600">
            <p className="font-semibold mb-1">Riwayat pembayaran:</p>
            {payments.map((p) => (
              <p key={p.id}>• {fmtDate(p.payment_date)} — {fmtIDR(p.amount)} ({statusLabel[p.method]})</p>
            ))}
          </div>
        )}

        <div className="mt-6 pt-3 border-t border-slate-300 text-xs text-slate-500">
          <p>{company?.invoice_footer || 'Pembayaran dapat dilakukan via transfer bank atau tunai di kantor.'}</p>
          <p className="mt-1">Dicetak pada {new Date().toLocaleString('id-ID')} — NetBill RT/RW Net</p>
        </div>
      </div>
    </div>
  );
}
