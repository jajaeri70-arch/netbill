import { useRef, useState } from 'react';
import { Upload, Download, FileSpreadsheet, XCircle, AlertTriangle, Loader2, Package, MapPin } from 'lucide-react';
import api from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Button } from './ui.jsx';

/** Unduh template CSV dari server — kolom sama persis dengan fitur Export */
async function downloadTemplate() {
  const { data } = await api.get('/customers/template', { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template-import-pelanggan.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function StatBox({ label, value, color }) {
  return (
    <div className={`rounded-lg p-3 text-center ${color}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

/** Modal import pelanggan via CSV migrasi — pratinjau dulu (dry-run), baru disimpan.
 *  Mendukung file ekspor billing lama: sep=, sel ="…", tanggal dd/mm/yyyy. */
export default function ImportCustomersModal({ open, onClose, onDone }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('skip');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(''); setMode('skip'); };
  const handleClose = () => { if (!importing) { reset(); onClose(); } };

  /** Unduh template import dari server (format sama dengan Export) */
  const handleDownloadTemplate = async () => {
    try {
      await downloadTemplate();
    } catch {
      toast('Gagal mengunduh template', 'danger');
    }
  };

  /** Pratinjau: kirim ke server dengan dry_run=1 (tidak ada data yang ditulis) */
  const analyze = async (f, m) => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('mode', m);
    fd.append('dry_run', '1');
    const { data } = await api.post('/customers/import', fd);
    setPreview(data);
    return data;
  };

  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFile(f); setPreview(null); setResult(null); setError(''); setBusy(true);
    try {
      await analyze(f, mode);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal membaca file CSV');
    } finally {
      setBusy(false);
    }
  };

  const changeMode = async (m) => {
    setMode(m);
    if (file && preview) {
      setBusy(true); setError('');
      try {
        await analyze(file, m);
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal memeriksa ulang file');
      } finally {
        setBusy(false);
      }
    }
  };

  const doImport = async () => {
    if (!file || importing) return;
    setImporting(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);
    try {
      const { data } = await api.post('/customers/import', fd);
      setResult(data);
      toast(`Import selesai: ${data.inserted} ditambah, ${data.updated} diperbarui, ${data.skipped} dilewati, ${data.failed} gagal`, data.failed ? 'danger' : 'success');
      onDone?.();
    } catch (err) {
      const msg = err.response?.data?.message || 'Import gagal';
      setError(msg);
      toast(msg, 'danger');
    } finally {
      setImporting(false);
    }
  };

  const r = result || preview;
  const isResult = !!result;

  return (
    <Modal open={open} onClose={handleClose} title="Import Pelanggan (CSV)" className="max-w-2xl">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-accent-blue/10 text-accent-blue p-3 text-xs leading-relaxed">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>
            Untuk migrasi dari billing lama: kolom <b>Nama</b> wajib, <b>No Pelanggan</b> dipakai sebagai kode,
            <b> Username/Password</b> sebagai kredensial PPPoE, <b>Paket+Tarif</b> dicocokkan otomatis (dibuat bila belum ada),
            <b> Masa Aktif</b> menjadi tanggal tagihan, status <b>AKTIF/SUSPEND</b> → Aktif/Isolir. Tanggal format dd/mm/yyyy.
            File hasil <b>Export</b> dapat langsung diimpor kembali tanpa diubah.
          </p>
        </div>

        <button type="button" onClick={handleDownloadTemplate} className="text-xs inline-flex items-center gap-1.5 text-accent-blue hover:underline">
          <Download size={13} /> Unduh template CSV
        </button>

        {/* Pilih file */}
        <div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={pickFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-navy-600 p-6 text-center transition hover:border-accent-blue/60 hover:bg-accent-blue/5"
          >
            <FileSpreadsheet size={22} className="mx-auto text-slate-400" />
            {file ? (
              <p className="mt-2 text-sm font-medium">{file.name} <span className="text-slate-400">({Math.ceil(file.size / 1024)} KB)</span></p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Klik untuk memilih file CSV hasil ekspor billing lama</p>
            )}
          </button>
        </div>

        {/* Mode duplikat */}
        <div>
          <p className="text-xs font-semibold mb-1.5">Bila ditemukan pelanggan yang sudah ada (Username PPPoE / No Pelanggan sama):</p>
          <div className="grid grid-cols-2 gap-2">
            <label className={`cursor-pointer rounded-lg border p-2.5 text-xs ${mode === 'skip' ? 'border-accent-blue bg-accent-blue/10' : 'border-slate-200 dark:border-navy-600'}`}>
              <input type="radio" className="hidden" checked={mode === 'skip'} onChange={() => changeMode('skip')} />
              <span className="font-medium">Lewati</span>
              <span className="block text-slate-400">Data lama tidak diubah</span>
            </label>
            <label className={`cursor-pointer rounded-lg border p-2.5 text-xs ${mode === 'update' ? 'border-accent-blue bg-accent-blue/10' : 'border-slate-200 dark:border-navy-600'}`}>
              <input type="radio" className="hidden" checked={mode === 'update'} onChange={() => changeMode('update')} />
              <span className="font-medium">Perbarui</span>
              <span className="block text-slate-400">Data lama disesuaikan dengan CSV</span>
            </label>
          </div>
        </div>

        {busy && <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Memeriksa file…</p>}
        {error && <p className="text-xs text-accent-red flex items-center gap-1.5"><XCircle size={13} /> {error}</p>}

        {/* Ringkasan pratinjau / hasil */}
        {r && !busy && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="Total baris" value={r.total} color="bg-slate-100 dark:bg-navy-700" />
              <StatBox label={r.dry_run ? 'Akan ditambah' : 'Ditambah'} value={r.inserted} color="bg-accent-green/15 text-accent-green" />
              <StatBox label={r.dry_run ? 'Akan dilewati' : 'Dilewati'} value={r.skipped} color="bg-accent-yellow/15 text-accent-yellow" />
              <StatBox label={r.dry_run ? 'Akan diperbarui' : 'Diperbarui'} value={r.updated} color="bg-accent-blue/15 text-accent-blue" />
            </div>
            {r.failed > 0 && (
              <p className="text-xs text-accent-red flex items-center gap-1.5"><XCircle size={13} /> {r.failed} baris gagal diproses (lihat rincian di bawah)</p>
            )}
            {r.packages_created?.length > 0 && (
              <p className="text-xs flex items-start gap-1.5 text-slate-500 dark:text-slate-400">
                <Package size={13} className="shrink-0 mt-0.5 text-accent-purple" />
                <span>Paket baru: {r.packages_created.join(', ')}</span>
              </p>
            )}
            {r.areas_created?.length > 0 && (
              <p className="text-xs flex items-start gap-1.5 text-slate-500 dark:text-slate-400">
                <MapPin size={13} className="shrink-0 mt-0.5 text-accent-orange" />
                <span>Area baru: {r.areas_created.join(', ')}</span>
              </p>
            )}
            {r.duplicates?.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-500 dark:text-slate-400">{r.duplicates.length} baris dilewati karena sudah terdaftar</summary>
                <ul className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto text-slate-400">
                  {r.duplicates.map((d, i) => <li key={i}>Baris {d.row}: {d.name} — {d.reason}</li>)}
                </ul>
              </details>
            )}
            {r.errors?.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-accent-red">{r.errors.length} baris bermasalah</summary>
                <ul className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto text-accent-red/80">
                  {r.errors.map((e, i) => <li key={i}>Baris {e.row}: {e.message}</li>)}
                </ul>
              </details>
            )}
            {r.dry_run && <p className="text-[11px] text-slate-400">Mode pratinjau — belum ada data yang disimpan.</p>}
          </div>
        )}

        {/* Aksi */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={handleClose} disabled={importing}>Batal</Button>
          {isResult ? (
            <Button onClick={handleClose}>Selesai</Button>
          ) : (
            <Button onClick={doImport} disabled={!file || busy || importing || !preview || preview.total === 0}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importing ? 'Mengimpor…' : `Import Sekarang${preview ? ` (${preview.total} baris)` : ''}`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}