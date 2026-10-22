import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, ChevronDown, Check, ArrowUp, ArrowDown, ChevronsUpDown, Inbox } from 'lucide-react';

// ---------- Badge status berwarna (PRD 4.4) ----------
// Lunas/Online → hijau (success) · Pending/proses → amber (warning)
// Overdue/Offline → merah (danger) · Aktif → biru (info)
const BADGE_MAP = {
  active: 'bg-success/15 text-success',
  paid: 'bg-success/15 text-success',
  online: 'bg-success/15 text-success',
  resolved: 'bg-success/15 text-success',
  closed: 'bg-success/15 text-success',
  confirmed: 'bg-success/15 text-success',
  approved: 'bg-success/15 text-success',
  success: 'bg-success/15 text-success',
  isolated: 'bg-danger/15 text-danger',
  isolir: 'bg-danger/15 text-danger',
  disabled: 'bg-danger/15 text-danger',
  overdue: 'bg-danger/15 text-danger',
  unpaid: 'bg-warning/15 text-warning',
  warning: 'bg-warning/15 text-warning',
  offline: 'bg-danger/15 text-danger',
  void: 'bg-slate-400/15 text-slate-500 dark:text-slate-400',
  inactive: 'bg-slate-400/15 text-slate-500 dark:text-slate-400',
  partial: 'bg-info/15 text-info',
  in_progress: 'bg-info/15 text-info',
  assigned: 'bg-info/15 text-info',
  on_the_way: 'bg-info/15 text-info',
  transfer: 'bg-info/15 text-info',
  info: 'bg-info/15 text-info',
  open: 'bg-warning/15 text-warning',
  pending: 'bg-warning/15 text-warning',
  gateway: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  qris: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  danger: 'bg-danger/15 text-danger',
  high: 'bg-danger/15 text-danger',
  critical: 'bg-danger/15 text-danger',
  normal: 'bg-info/15 text-info',
  low: 'bg-slate-400/15 text-slate-500 dark:text-slate-400',
};

export function Badge({ value, label, className = '' }) {
  const cls = BADGE_MAP[value] || 'bg-slate-400/15 text-slate-500 dark:text-slate-400';
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls} ${className}`}>
      {label || value}
    </span>
  );
}

// ---------- Kualitas RX Power / redaman optik (PRD 5.6) ----------
/** Klasifikasi kualitas sinyal RX — ambang sama dengan backend:
 *  Bagus: rx >= -20 dBm · Sedang: -25 <= rx < -20 dBm · Buruk: rx < -25 dBm */
export function rxQuality(rx) {
  const n = rx == null ? null : Number(rx);
  if (n == null || Number.isNaN(n)) return { label: 'N/A', cls: 'text-slate-400', bg: 'bg-slate-400/15', tooltip: null };
  if (n >= -20) return { label: 'Bagus', cls: 'text-success', bg: 'bg-success/15', tooltip: 'Bagus' };
  if (n >= -25) return { label: 'Sedang', cls: 'text-warning', bg: 'bg-warning/15', tooltip: 'Sedang' };
  return { label: 'Buruk', cls: 'text-danger', bg: 'bg-danger/15', tooltip: 'Buruk' };
}

/** Nilai RX Power berwarna + tooltip kualitas:
 *  ≥ -20 dBm hijau "Bagus" · -20 s/d -25 dBm kuning "Sedang" · < -25 dBm merah "Buruk" */
export function RxPowerValue({ value, decimals = 2, unit = ' dBm', className = '' }) {
  if (value == null) return <span className={`text-slate-400 ${className}`}>-</span>;
  const q = rxQuality(value);
  return (
    <span title={q.tooltip} className={`${q.cls} ${q.label === 'Buruk' ? 'font-semibold' : ''} ${className}`}>
      {Number(value).toFixed(decimals)}{unit}
    </span>
  );
}

// ---------- Kartu statistik / widget (PRD 4.4: angka besar text-3xl, ikon kotak membulat) ----------
export function StatCard({ icon: Icon, label, value, sub, color = 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400', onClick, title, compact = false }) {
  const clickable = typeof onClick === 'function';
  return (
    <div
      className={`card card-hover flex items-center ${compact ? 'gap-2 p-3' : 'gap-3 p-4 sm:gap-4 sm:p-5'} ${clickable ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40' : ''}`}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? (title || 'Klik untuk melihat daftar') : title}
    >
      {Icon && (
        <div className={`${compact ? 'p-2' : 'p-3'} rounded-xl shrink-0 ${color}`}>
          <Icon size={compact ? 18 : 22} />
        </div>
      )}
      <div className="min-w-0">
        <p className={`${compact ? 'text-[11px] leading-tight' : 'text-[13px]'} font-medium text-muted break-words`}>{label}</p>
        <p className={`${compact ? 'text-lg leading-6 tracking-normal whitespace-nowrap' : 'text-2xl sm:text-3xl tracking-display'} font-bold mt-0.5 ${compact ? '' : 'break-words'}`}>{value}</p>
        {sub && <p className={`${compact ? 'text-[11px] leading-tight' : 'text-[13px]'} text-muted mt-1 break-words`}>{sub}</p>}
      </div>
    </div>
  );
}

// ---------- Kartu section ----------
export function Card({ title, right, children, className = '', bodyClass = '' }) {
  return (
    <div className={`card ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
          <h3 className="text-base font-heading font-bold tracking-tight">{title}</h3>
          {right}
        </div>
      )}
      <div className={`p-5 ${bodyClass}`}>{children}</div>
    </div>
  );
}
/** Judul seksi form dengan ikon & garis — dipakai modal form (Paket, Pengguna, dst.) */
export function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"><Icon size={14} /></span>
      <h4 className="text-[13px] font-heading font-bold uppercase tracking-wide text-muted">{title}</h4>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, wide = false, className = '' }) {
  // ESC menutup modal + scroll body dikunci selama modal terbuka (UX konsisten untuk semua modal)
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} />
      <div className={`card relative w-full max-h-[90vh] flex flex-col shadow-lift ${wide ? 'max-w-[min(96vw,1400px)]' : (className || 'max-w-lg')}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-heading font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} aria-label="Tutup" className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-secondary transition">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ---------- Button (PRD 4.2: warna menarik yang mengundang klik) ----------
export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none';
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm' };
  const variants = {
    // Utama: gradient indigo → violet → purple dengan hover shadow (PRD 4.2)
    primary: 'bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white shadow-sm hover:shadow-lg hover:shadow-indigo-500/25 hover:brightness-110 active:brightness-95',
    success: 'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 hover:shadow-lg hover:shadow-emerald-500/25',
    info: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25',
    cyan: 'bg-cyan-500 text-white shadow-sm hover:bg-cyan-600 hover:shadow-lg hover:shadow-cyan-500/25',
    violet: 'bg-violet-600 text-white shadow-sm hover:bg-violet-700 hover:shadow-lg hover:shadow-violet-500/25',
    warning: 'bg-amber-500 text-white shadow-sm hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/25',
    orange: 'bg-amber-500 text-white shadow-sm hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/25',
    green: 'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 hover:shadow-lg hover:shadow-emerald-500/25',
    danger: 'bg-rose-500 text-white shadow-sm hover:bg-rose-600 hover:shadow-lg hover:shadow-rose-500/25',
    ghost: 'bg-secondary text-foreground hover:bg-secondary/70',
    outline: 'border border-border bg-card text-foreground shadow-sm hover:bg-secondary hover:shadow-sm',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}

// ---------- Pagination ----------
// Props: page, total, limit, onPage — wajib; onLimit + limits = opsional (selector baris/halaman).
export function Pagination({ page, total, limit, onPage, onLimit, limits = [10, 25, 50, 100] }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const pageItems = pages <= 7
    ? Array.from({ length: pages }, (_, i) => i + 1)
    : [1, page > 3 ? '…' : 2, ...[page - 1, page, page + 1].filter((n) => n > 2 && n < pages - 1), page < pages - 2 ? '…' : pages - 1, pages]
      .filter((item, i, list) => item === '…' || list.indexOf(item) === i);
  const navCls = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed';
  const go = (p) => onPage(Math.min(Math.max(1, p), pages));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-muted">
          {total === 0 ? 'Tidak ada data' : (
            <>Menampilkan <span className="font-semibold text-foreground">{from}–{to}</span> dari <span className="font-semibold text-foreground">{total}</span> data</>
          )}
        </p>
        {onLimit && (
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            Tampil
            <select
              className="input h-8 w-auto py-0 pl-2 pr-6 text-xs"
              value={limit}
              onChange={(e) => onLimit(Number(e.target.value) || limits[0])}
              aria-label="Baris per halaman"
            >
              {limits.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            / halaman
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button" className={`${navCls} text-muted hover:bg-secondary hover:text-foreground`}
          disabled={page <= 1} onClick={() => go(1)} title="Halaman pertama" aria-label="Halaman pertama"
        >
          <ChevronsLeft size={15} />
        </button>
        <button
          type="button" className={`${navCls} text-muted hover:bg-secondary hover:text-foreground`}
          disabled={page <= 1} onClick={() => go(page - 1)} title="Halaman sebelumnya" aria-label="Halaman sebelumnya"
        >
          <ChevronLeft size={15} />
        </button>
        {pageItems.map((item, index) => item === '…' ? (
          <span key={`ellipsis-${index}`} className="px-1 text-xs text-muted">…</span>
        ) : (
          <button
            key={item} type="button" onClick={() => go(item)} aria-current={item === page ? 'page' : undefined}
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-semibold transition ${item === page ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted hover:bg-secondary hover:text-foreground'}`}
          >
            {item}
          </button>
        ))}
        <button
          type="button" className={`${navCls} text-muted hover:bg-secondary hover:text-foreground`}
          disabled={page >= pages} onClick={() => go(page + 1)} title="Halaman berikutnya" aria-label="Halaman berikutnya"
        >
          <ChevronRight size={15} />
        </button>
        <button
          type="button" className={`${navCls} text-muted hover:bg-secondary hover:text-foreground`}
          disabled={page >= pages} onClick={() => go(pages)} title="Halaman terakhir" aria-label="Halaman terakhir"
        >
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ---------- Header kolom tabel yang bisa diurutkan (klik: asc → desc) ----------
export function SortTh({ label, field, sort, dir, onSort, className = '' }) {
  const active = sort === field;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th className={`th ${className}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(field)}
        title={`Urutkan berdasarkan ${label}`}
        className={`inline-flex items-center gap-1 transition hover:text-foreground ${active ? 'text-primary' : ''}`}
      >
        {label}
        <Icon size={12} className={active ? '' : 'opacity-40'} />
      </button>
    </th>
  );
}

// ---------- Empty state: ilustrasi ikon besar + CTA (PRD 4.4) ----------
export function Empty({ text = 'Belum ada data', title, icon: Icon = Inbox, action, hint }) {
  return (
    <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-slate-400 dark:bg-navy-700">
        <Icon size={32} strokeWidth={1.6} />
      </div>
      {title && <p className="text-base font-heading font-bold tracking-tight">{title}</p>}
      <p className="mt-1 max-w-sm text-sm text-muted">{title ? (hint || text) : text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ full = false }) {
  const el = (
    <div className="flex items-center justify-center py-10">
      <div className="w-7 h-7 border-primary border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
    </div>
  );
  return full ? <div className="min-h-screen flex items-center justify-center">{el}</div> : el;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-3xl md:text-[36px] leading-tight font-heading font-bold tracking-display">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- SearchSelect: dropdown dengan pencarian manual (ketik untuk filter) ----------
// options: [{ value, label, hint? }] — kompatibel pengganti <select> untuk daftar panjang.
export function SearchSelect({ value, onChange, options = [], placeholder = 'Pilih…', disabled = false, loading = false, emptyText = 'Tidak ditemukan', className = '' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => String(o.label).toLowerCase().includes(q) || (o.hint && String(o.hint).toLowerCase().includes(q)))
    : options;

  // Tutup saat klik di luar kotak
  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Ikuti highlight navigasi keyboard
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const openList = () => {
    if (disabled) return;
    const idx = options.findIndex((o) => String(o.value) === String(value));
    setActive(idx >= 0 ? idx : 0);
    setQuery('');
    setOpen(true);
  };

  const pick = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          className="input pl-8 pr-8"
          value={open ? query : (selected?.label || '')}
          placeholder={loading ? 'Memuat…' : placeholder}
          disabled={disabled}
          onFocus={() => { if (!open) openList(); }}
          onMouseDown={() => { if (!open) openList(); }}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        <button type="button" tabIndex={-1} aria-label={open ? 'Tutup' : value ? 'Hapus pilihan' : 'Buka daftar'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-foreground"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { if (open) { setOpen(false); setQuery(''); } else if (value) onChange(''); else openList(); }}>
          {open || value ? <X size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {open && (
        <div ref={listRef} className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-border bg-card shadow-lift">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted">Memuat…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted">“{query}” — {emptyText}</div>
          ) : filtered.map((o, i) => (
            <button
              key={String(o.value)}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition
                ${i === active ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
            >
              <span className="truncate">{o.label}</span>
              <span className="flex items-center gap-2 shrink-0">
                {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
                {String(o.value) === String(value) && <Check size={13} className="text-success" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

