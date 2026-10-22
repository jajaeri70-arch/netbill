import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

/**
 * Toast notifikasi modern.
 * Pemakaian: const { toast } = useToast(); toast('Pesan', 'success' | 'danger' | 'warning' | 'info');
 * Fitur: ikon badge berwarna, judul per tipe, progress bar auto-dismiss (pause saat hover),
 * animasi slide-in/out, dan maksimal 5 toast tampil bersamaan.
 */
const ToastContext = createContext(null);

const TYPES = {
  success: { icon: CheckCircle2, iconCls: 'bg-accent-green/15 text-accent-green', bar: 'bg-accent-green', title: 'Berhasil', duration: 3500 },
  warning: { icon: AlertTriangle, iconCls: 'bg-accent-yellow/15 text-accent-yellow', bar: 'bg-accent-yellow', title: 'Perhatian', duration: 5000 },
  danger: { icon: XCircle, iconCls: 'bg-accent-red/15 text-accent-red', bar: 'bg-accent-red', title: 'Gagal', duration: 6000 },
  info: { icon: Info, iconCls: 'bg-accent-blue/15 text-accent-blue', bar: 'bg-accent-blue', title: 'Informasi', duration: 4000 },
};

/** Satu kartu toast — timer sendiri agar bisa pause saat kursor di atasnya */
function ToastItem({ toast, onDismiss }) {
  const cfg = TYPES[toast.type] || TYPES.info;
  const Icon = cfg.icon;
  const timerRef = useRef(null);
  const startedAt = useRef(0);
  const remaining = useRef(cfg.duration);
  const [paused, setPaused] = useState(false);

  const arm = (ms) => {
    startedAt.current = Date.now();
    timerRef.current = setTimeout(() => onDismiss(toast.id), ms);
  };

  useEffect(() => {
    arm(remaining.current);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = () => {
    clearTimeout(timerRef.current);
    remaining.current -= Date.now() - startedAt.current;
    setPaused(true);
  };
  const resume = () => {
    arm(Math.max(remaining.current, 500));
    setPaused(false);
  };

  return (
    <div
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={`pointer-events-auto relative w-80 overflow-hidden rounded-xl border shadow-soft backdrop-blur transition-colors
        bg-white/95 dark:bg-navy-800/95 border-slate-200/70 dark:border-navy-600
        ${toast.leaving ? 'animate-[toastOut_.18s_ease-in_forwards]' : 'animate-[toastIn_.28s_cubic-bezier(.21,1.02,.73,1)]'}`}
    >
      <div className="flex items-start gap-3 p-3.5 pr-2">
        <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconCls}`}>
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[13px] font-semibold leading-tight">{cfg.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400 break-words">{toast.message}</p>
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Tutup notifikasi"
          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-slate-200"
        >
          <X size={14} />
        </button>
      </div>
      {/* Progress bar auto-dismiss — ikut pause saat hover */}
      <div className="h-[3px] w-full bg-slate-100 dark:bg-navy-700/70">
        <div
          className={`h-full ${cfg.bar} ${paused ? '[animation-play-state:paused]' : ''}`}
          style={{ animation: `toastProgress ${cfg.duration}ms linear forwards` }}
        />
      </div>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((message, type = 'info') => {
    const id = ++idRef.current;
    // Maksimal 5 toast tampil bersamaan — yang terlama digantikan
    setToasts((t) => [...t.slice(-4), { id, message, type, leaving: false }]);
  }, []);

  const dismiss = useCallback((id) => {
    // Mainkan animasi keluar dulu, lalu hapus dari state
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 180);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2.5">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

