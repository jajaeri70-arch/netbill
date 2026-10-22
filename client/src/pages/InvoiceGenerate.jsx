import { useState } from 'react';
import api from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Button } from '../components/ui.jsx';
import { fmtIDR } from '../utils/format.js';

/**
 * Modal generate tagihan dengan dukungan dry-run (PRD #11 mitigasi risiko).
 * Batch otomatis selalu membuat tagihan bulan berjalan. Tagihan pertama periode tersebut
 * dihitung prorata dari Tanggal Aktif bila aktif di tengah siklus.
 */
export default function InvoiceGenerate({ onClose, onDone }) {
  const { toast } = useToast();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const dryRun = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/invoices/generate', { dryRun: true });
      setPreview(data);
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal simulasi', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/invoices/generate', {});
      toast(`${data.created} tagihan berhasil dibuat`, 'success');
      onDone();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal generate', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Generate Tagihan">
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Tagihan <strong className="text-slate-700 dark:text-slate-200">pascabayar</strong> dibuat otomatis mengikuti siklus langganan tiap pelanggan.
          Generate otomatis selalu membuat periode <strong className="text-slate-700 dark:text-slate-200">bulan berjalan</strong>
          (contoh: Oktober membuat tagihan Oktober) dan melewati tagihan yang sudah ada. Tagihan <strong className="text-slate-700 dark:text-slate-200">pertama</strong> dihitung prorata dari Tanggal Aktif sampai akhir siklus bila aktif pada periode tersebut; tagihan berikutnya penuh, dengan jatuh tempo pada Tanggal Berakhir siklus.
          Pelanggan <strong className="text-slate-700 dark:text-slate-200">prabayar</strong> tidak disertakan (tagihannya dibuat lewat alur pembayaran/kasir).
        </p>

        {preview && (
          <div className="rounded-lg bg-accent-blue/10 border border-accent-blue/30 p-3 text-sm space-y-1">
            <p><strong>Simulasi (dry-run):</strong></p>
            <p>Tagihan akan dibuat: <strong>{preview.wouldCreate}</strong></p>
            <p>Termasuk prorata: <strong>{preview.prorated ?? 0}</strong></p>
            <p>Prabayar dikecualikan: <strong>{preview.prepaid ?? 0}</strong></p>
            <p>Estimasi nilai: <strong>{fmtIDR(preview.estimated)}</strong></p>
            <p>Dilewati (sudah ada): {preview.skipped}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button variant="outline" onClick={dryRun} disabled={busy}>Simulasikan</Button>
          <Button variant="orange" onClick={generate} disabled={busy}>
            {busy ? 'Memproses…' : 'Generate Sekarang'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

