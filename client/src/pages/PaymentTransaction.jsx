import { useCallback, useEffect, useState } from 'react';
import { Printer, Phone, Loader2 } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, Button, Badge, SearchSelect } from '../components/ui.jsx';
import { fmtDate, fmtIDR, fmtNum, statusLabel } from '../utils/format.js';

/** Input Rupiah: prefix "Rp" + pemisah ribuan otomatis (tampilan seperti form billing lama) */
function RpInput({ value, onChange, readOnly = false, bold = false, className = '' }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        className={`input pl-9 text-right ${readOnly ? 'bg-slate-50 dark:bg-navy-700/60' : ''} ${bold ? 'font-bold' : ''} ${className}`}
        value={value === '' || value == null ? '' : fmtNum(value)}
        readOnly={readOnly}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '');
          onChange(digits === '' ? 0 : Number(digits));
        }}
      />
    </div>
  );
}

const RO = 'bg-slate-50 dark:bg-navy-700/60'; // style input readonly (info pelanggan)

/**
 * Transaksi Pembayaran Tagihan (alur kasir otomatis):
 * pilih pelanggan → rincian terisi otomatis (identitas, paket, tagihan terbuka/siklus berjalan),
 * kasir cukup sesuaikan biaya tambahan/diskon/PPN bila perlu → BAYAR.
 * Tagihan belum ada dibuat otomatis oleh backend saat pembayaran disimpan.
 */
export default function PaymentTransaction() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [options, setOptions] = useState([]);
  const [optLoading, setOptLoading] = useState(true);
  const [custId, setCustId] = useState('');
  const [ctx, setCtx] = useState(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [period, setPeriod] = useState('');
  const [tariff, setTariff] = useState(0);
  const [addon, setAddon] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [ppn, setPpn] = useState(0);
  const [payMethod, setPayMethod] = useState('cash');
  const [receiver, setReceiver] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api.get('/payments/customer-options')
      .then(({ data }) => setOptions(data.rows.map((c) => ({
        value: c.id,
        // Area ditampilkan di label agar pelanggan bernama sama tidak tertukar
        label: `${c.code} ~ ${c.name}${c.area ? ` · ${c.area}` : ''}`,
        hint: c.pppoe_username ? `pppoe-${c.pppoe_username}` : c.phone || '',
      }))))
      .catch(() => toast('Gagal memuat daftar pelanggan', 'danger'))
      .finally(() => setOptLoading(false));
  }, [toast]);

  /** Muat konteks pelanggan (info + tagihan terbuka / pratinjau siklus) dan isi form otomatis */
  const loadCtx = useCallback(async (id, per, keepReceiver = true) => {
    if (!id) return;
    setCtxLoading(true);
    try {
      const { data } = await api.get(`/payments/context/${id}`, { params: per ? { period: per } : undefined });
      setCtx(data);
      setPeriod(data.invoice?.period || data.next?.period || '');
      const inv = data.invoice;
      const pkg = Number(data.customer?.package_price || 0);
      if (inv) {
        // Tarif layanan dan biaya tambahan adalah komponen invoice terpisah.
        setTariff(Number(inv.amount));
        setAddon(Number(inv.additional_fee) || 0);
        setDiscount(Number(inv.discount) || 0);
      } else {
        setTariff(Number(data.next?.amount ?? pkg));
        setAddon(0);
        setDiscount(0);
      }
      setPpn(Number(data.tax_percent) || 0);
      if (!keepReceiver || receiver === '') setReceiver(String(user?.id ?? ''));
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal memuat data pelanggan', 'danger');
    } finally {
      setCtxLoading(false);
    }
  }, [receiver, user, toast]);

  const pickCustomer = (id) => {
    setCustId(id);
    setCtx(null);
    if (id) loadCtx(id, '', false);
  };

  const reset = () => {
    setCustId('');
    setCtx(null);
    setPeriod('');
    setNote('');
    setPayMethod('cash');
    setReceiver('');
  };

  const bayar = async () => {
    if (!ctx?.customer) return;
    setBusy(true);
    try {
      const { data } = await api.post('/payments/quick', {
        customer_id: custId,
        invoice_id: ctx.invoice?.id || undefined,
        period,
        tariff, additional_fee: addon, discount,
        tax_percent: ppn,
        method: payMethod,
        note,
        receiver_id: receiver || undefined,
      });
      toast(`Pembayaran ${data.number} berhasil dicatat`, 'success');
      window.open(`/pembayaran/kwitansi/${data.id}`, '_blank', 'noopener');
      reset();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan pembayaran', 'danger');
    } finally {
      setBusy(false);
    }
  };

  // ---------- Perhitungan live (rumus sama dengan backend) ----------
  const cust = ctx?.customer;
  const inv = ctx?.invoice || null;
  const next = ctx?.next || null;
  const svc = inv || next;
  const lateFee = Number(inv?.late_fee || 0);
  const totalTarif = Math.max(0, Number(tariff || 0) + Number(addon || 0) - Number(discount || 0));
  const totalTagihan = Math.max(0, totalTarif + lateFee);
  const totalPpn = Math.round((totalTagihan * Math.max(0, Number(ppn || 0))) / 100);
  const grand = totalTagihan + totalPpn;
  const waLink = cust?.phone ? `https://wa.me/${String(cust.phone).replace(/\D/g, '').replace(/^0/, '62')}` : null;
  const svcText = svc?.service_start && svc?.service_end
    ? `${fmtDate(svc.service_start)} s/d ${fmtDate(svc.service_end)}` : '-';
  const isProrated = Boolean(next?.prorated || (inv && Number(inv.amount) < Number(cust?.package_price || 0)));

  return (
    <div>
      <PageHeader
        title="Transaksi Pembayaran Tagihan"
        actions={
          <Button variant="outline" onClick={() => window.print()} title="Cetak formulir">
            <Printer size={15} /> Cetak
          </Button>
        }
      />

      <div id="print-area">
        <Card className="max-w-5xl">
          <div className="space-y-4">
            {/* Baris 1 — Pelanggan & Telp */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">Pilih Pelanggan</label>
                <SearchSelect
                  value={custId}
                  onChange={pickCustomer}
                  options={options}
                  loading={optLoading}
                  placeholder="Ketik nama / no pelanggan / pppoe…"
                  emptyText="Pelanggan tidak ditemukan"
                />
                {ctxLoading && (
                  <p className="text-xs mt-1 text-slate-400 flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Memuat rincian…
                  </p>
                )}
                {!ctxLoading && inv && (
                  <p className="text-xs mt-1 text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    Bayar periode paling awal: <span className="font-mono">{inv.number}</span>
                    <Badge value={inv.status} label={statusLabel[inv.status]} />
                  </p>
                )}
                {!ctxLoading && !inv && next && custId && (
                  <p className="text-xs mt-1 text-accent-orange">
                    Belum ada tagihan — dibuat otomatis saat BAYAR{next.prorated ? ` (prorata ${next.prorate_days} hari)` : ''}
                  </p>
                )}
              </div>
              <div>
                <label className="label">Telp</label>
                <div className="relative">
                  <a
                    href={waLink || undefined}
                    target="_blank"
                    rel="noreferrer"
                    title={waLink ? 'Chat WhatsApp' : undefined}
                    className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 ${waLink ? 'text-accent-green hover:opacity-80' : 'text-slate-400 pointer-events-none'}`}
                  >
                    <Phone size={14} />
                  </a>
                  <input className={`input pl-9 ${RO}`} value={cust?.phone || ''} readOnly placeholder="-" />
                </div>
              </div>
            </div>

            {/* Baris 2 — Area, Mikrotik, Secret/User */}
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="label">Area</label>
                <input className={`input ${RO}`} value={cust?.area || ''} readOnly placeholder="-" />
              </div>
              <div>
                <label className="label">Mikrotik</label>
                <input className={`input ${RO}`} value={cust?.router_name || ''} readOnly placeholder="-" />
              </div>
              <div>
                <label className="label">Secret / User</label>
                <input className={`input ${RO}`} value={cust?.pppoe_username || ''} readOnly placeholder="-" />
              </div>
            </div>

            {/* Baris 3 — Alamat */}
            <div>
              <label className="label">Alamat</label>
              <textarea className={`input ${RO} resize-none`} rows={2} value={cust?.address || ''} readOnly placeholder="-" />
            </div>

            {/* Baris 4 — Paket & Masa Aktif */}
            <div className="grid md:grid-cols-[2fr_1fr] gap-4">
              <div>
                <label className="label">Paket</label>
                <input className={`input ${RO}`} value={cust?.package_name || ''} readOnly placeholder="-" />
              </div>
              <div>
                <label className="label">Masa Aktif</label>
                <input
                  className={`input ${RO}`}
                  value={cust ? '1 BULAN' : ''}
                  readOnly
                  placeholder="-"
                  title={cust?.active_until ? `Aktif s/d ${fmtDate(cust.active_until)}` : undefined}
                />
              </div>
            </div>

            {/* Baris 5 — Tarif, biaya tambahan, diskon, total tarif */}
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="label">Tarif Paket</label>
                <RpInput value={tariff} onChange={setTariff} readOnly={!ctx || isProrated} />
                {isProrated && <p className="text-[11px] text-accent-orange mt-1">Tarif prorata mengikuti periode layanan</p>}
              </div>
              <div>
                <label className="label">Biaya Tambahan</label>
                <RpInput value={addon} onChange={setAddon} readOnly={!ctx} />
              </div>
              <div>
                <label className="label">Diskon</label>
                <RpInput value={discount} onChange={setDiscount} readOnly={!ctx} />
              </div>
              <div>
                <label className="label">Total Tarif</label>
                <RpInput value={totalTarif} readOnly />
              </div>
            </div>

            {/* Baris 6 — Periode, Periode Pemakaian, Total Tagihan */}
            <div className="grid md:grid-cols-[1.2fr_1.6fr_1fr] gap-4">
              <div>
                <label className="label">Pembayaran</label>
                <input type="month" className={`input ${RO}`} value={period} readOnly disabled={!ctx} />
              </div>
              <div>
                <label className="label">Untuk Periode Pemakaian</label>
                <input className={`input ${RO}`} value={svcText} readOnly placeholder="-" />
              </div>
              <div>
                <label className="label">Total Tagihan</label>
                <RpInput value={totalTagihan} readOnly />
                {lateFee > 0 && <p className="text-[11px] text-accent-orange mt-1">termasuk denda {fmtIDR(lateFee)}</p>}
              </div>
            </div>

            {/* Baris 7 — PPN */}
            <div className="flex flex-wrap items-end justify-end gap-4">
              <div>
                <label className="label text-right">PPN</label>
                <div className="relative w-28">
                  <input
                    type="number" min={0} max={100} step="0.01"
                    className="input pr-7 text-right"
                    value={ppn}
                    onChange={(e) => setPpn(e.target.value === '' ? 0 : Number(e.target.value))}
                    disabled={!ctx}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                </div>
              </div>
              <div className="w-56">
                <label className="label">Total PPN</label>
                <RpInput value={totalPpn} readOnly />
              </div>
            </div>

            {/* Baris 8 — Metode, Penerima, Grand Total */}
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="label">Pembayaran</label>
                <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} disabled={!ctx}>
                  <option value="cash">TUNAI</option>
                  <option value="transfer">TRANSFER</option>
                  <option value="qris">QRIS</option>
                  <option value="gateway">GATEWAY</option>
                </select>
              </div>
              <div>
                <label className="label">Penerima Pembayaran</label>
                <select className="input" value={receiver} onChange={(e) => setReceiver(e.target.value)} disabled={!ctx || !ctx?.receivers?.length}>
                  {(ctx?.receivers || []).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                  {!ctx?.receivers?.length && <option value="">{user?.name || '-'}</option>}
                </select>
              </div>
              <div>
                <label className="label">Grand Total</label>
                <RpInput value={grand} readOnly bold className="ring-1 ring-accent-blue/40" />
              </div>
            </div>

            {/* Baris 9 — Catatan */}
            <div>
              <label className="label">Tambahkan Keterangan / Catatan Pembayaran</label>
              <textarea
                className="input resize-none"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="misal: bayar di kantor, kwitansi atas nama…"
                disabled={!ctx}
              />
            </div>

            {/* Aksi */}
            <div className="flex items-center gap-2 pt-1">
              <Button variant="primary" onClick={bayar} disabled={!ctx || busy || grand <= 0}>
                {busy ? 'Menyimpan…' : 'BAYAR'}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={busy}>BATAL</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

