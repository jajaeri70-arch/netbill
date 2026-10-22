import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import api from '../api.js';
import { fmtIDR, fmtDateTime, statusLabel } from '../utils/format.js';

/** Cetak kwitansi pembayaran (PRD 5.2) */
export default function ReceiptPrint() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/payments/${id}/receipt`).then(({ data }) => setData(data)).catch(() => {});
  }, [id]);

  if (!data) return null;
  const { payment: p, company } = data;
  const num2word = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

  return (
    <div className="min-h-screen bg-slate-200/50 dark:bg-navy-950 py-6 px-4">
      <div className="max-w-md mx-auto mb-4 flex items-center justify-between print:hidden">
        <Link to="/pembayaran" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Kembali
        </Link>
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/85">
          <Printer size={15} /> Cetak Kwitansi
        </button>
      </div>

      <div id="print-area" className="max-w-md mx-auto bg-white text-slate-900 p-8 rounded-lg shadow-soft">
        <div className="text-center border-b-2 border-dashed border-slate-300 pb-4">
          <h1 className="font-bold text-lg">{company?.company_name || 'NetBill'}</h1>
          <p className="text-xs text-slate-500">{company?.company_address}</p>
          <p className="mt-2 font-black tracking-widest text-lg">KWITANSI</p>
          <p className="text-xs text-slate-500 font-mono">No: {String(p.id).padStart(6, '0')}/KWB/{p.period}</p>
        </div>

        <div className="py-4 text-sm space-y-2">
          <div className="flex justify-between"><span className="text-slate-500">Telah diterima dari</span><strong>{p.customer_name}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Kode Pelanggan</span><strong>{p.code}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Untuk pembayaran</span><strong>Tagihan {p.invoice_number} ({p.period})</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Metode</span><strong>{statusLabel[p.method]}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Tanggal</span><strong>{fmtDateTime(p.payment_date)}</strong></div>
        </div>

        <div className="bg-slate-100 rounded-lg p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">JUMLAH DITERIMA</p>
          <p className="text-2xl font-black">{num2word(p.amount)}</p>
        </div>

        {p.note && <p className="text-xs text-slate-500 mt-3">Catatan: {p.note}</p>}

        <div className="flex justify-end mt-8 text-center text-xs">
          <div>
            <p className="text-slate-500 mb-10">Kasir</p>
            <p className="border-t border-slate-400 pt-1 font-semibold">{p.created_by_name || 'NetBill'}</p>
          </div>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-6">Terima kasih telah menjadi pelanggan setia — NetBill RT/RW Net</p>
      </div>
    </div>
  );
}
