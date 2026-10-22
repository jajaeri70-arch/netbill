import { fmtIDR } from '../utils/format.js';
import { fmtSchemeDate } from '../utils/prorata.js';

/** Tabel pratinjau skema pembayaran + prorata — kolom mengikuti form billing lama (CEK SKEMA PEMBAYARAN) */
export default function BillSchemePreview({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-navy-600">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:bg-navy-800/60">
            <th className="th">No</th>
            <th className="th">Masa Aktif</th>
            <th className="th">Tagihan</th>
            <th className="th">Tgl Isolir</th>
            <th className="th">Untuk Pemakaian</th>
            <th className="th text-right">Nominal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-navy-700/50">
          {rows.map((r) => (
            <tr key={r.no} className="hover:bg-slate-50 dark:hover:bg-navy-700/40">
              <td className="td text-slate-400">{r.no}</td>
              <td className="td whitespace-nowrap">{r.masaAktif}</td>
              <td className="td whitespace-nowrap">{fmtSchemeDate(r.tagihan)}</td>
              <td className="td whitespace-nowrap">{fmtSchemeDate(r.isolir)}</td>
              <td className="td whitespace-nowrap">{fmtSchemeDate(r.pakai[0])} s/d {fmtSchemeDate(r.pakai[1])}</td>
              <td className="td whitespace-nowrap text-right font-medium">{fmtIDR(r.nominal)}</td>
            </tr>
          ))}
          <tr>
            <td className="td text-xs text-slate-400">Dst…</td>
            <td className="td" colSpan={5} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
