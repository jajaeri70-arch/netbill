import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

/**
 * Dialog konfirmasi modern — pengganti window.confirm() native browser.
 * Pemakaian:
 *   const { confirm } = useConfirm();
 *   const ok = await confirm({
 *     title: 'Hapus Data', message: '…', confirmText: 'Ya, Hapus', cancelText: 'Batal',
 *     tone: 'danger' | 'warning' | 'info', icon: Trash2,
 *   });
 * Resolve true saat dikonfirmasi, false saat dibatalkan (Batal / Esc / klik area gelap).
 */
const ConfirmContext = createContext(null);

const TONES = {
  danger: {
    icon: AlertTriangle,
    iconCls: 'bg-accent-red/10 text-accent-red ring-accent-red/20',
    buttonCls: 'bg-accent-red text-white hover:bg-accent-red/90 shadow-md',
    confirmText: 'Ya, Hapus',
  },
  warning: {
    icon: AlertTriangle,
    iconCls: 'bg-accent-yellow/10 text-accent-yellow ring-accent-yellow/20',
    buttonCls: 'bg-accent-orange text-white hover:bg-accent-orange/90 shadow-md',
    confirmText: 'Ya, Lanjutkan',
  },
  info: {
    icon: Info,
    iconCls: 'bg-accent-blue/10 text-accent-blue ring-accent-blue/20',
    buttonCls: 'bg-accent-blue text-white hover:bg-accent-blue/90 shadow-md',
    confirmText: 'Ya, Lanjutkan',
  },
};

function ConfirmDialog({ options, onSettle }) {
  const { title = 'Konfirmasi', message, confirmText, cancelText = 'Batal', tone = 'danger', icon: IconProp } = options;
  const t = TONES[tone] || TONES.danger;
  const Icon = IconProp || t.icon;
  const confirmRef = useRef(null);

  // Esc = batal · scroll body dikunci · fokus awal ke tombol konfirmasi (Enter = konfirmasi)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onSettle(false); }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => confirmRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(focusTimer);
    };
  }, [onSettle]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm animate-[fadeIn_.15s_ease-out]" onClick={() => onSettle(false)} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200/60 dark:border-navy-600 bg-white dark:bg-navy-800 shadow-soft animate-[confirmIn_.2s_cubic-bezier(.21,1.02,.73,1)]">
        <div className="flex flex-col items-center px-6 pb-1 pt-6 text-center">
          <span className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full ring-8 ${t.iconCls}`}>
            <Icon size={26} />
          </span>
          <h3 className="text-base font-bold">{title}</h3>
          {message && <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{message}</p>}
        </div>
        <div className="flex gap-2.5 px-6 pb-6 pt-5">
          <button
            type="button"
            onClick={() => onSettle(false)}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-navy-700 dark:text-slate-200 dark:hover:bg-navy-600"
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onSettle(true)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-navy-800 focus-visible:ring-accent-blue/60 ${t.buttonCls}`}
          >
            {confirmText || t.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null); // { options, resolve }

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setReq({ options: typeof options === 'string' ? { message: options } : options, resolve });
    });
  }, []);

  const settle = useCallback((result) => {
    setReq((cur) => {
      if (cur) cur.resolve(result);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {req && <ConfirmDialog options={req.options} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
