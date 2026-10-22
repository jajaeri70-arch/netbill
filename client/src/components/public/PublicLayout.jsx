import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SiteHeader } from './SiteHeader.jsx';
import { SiteFooter } from './SiteFooter.jsx';

const DEFAULT_TITLE = 'NetBill — Billing RT/RW Net';

/** Set judul dokumen halaman publik + kembalikan judul default saat pindah ke aplikasi. */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}

/**
 * Layout halaman publik: header sticky + konten + footer.
 * Porting dari prototype web/src/app/(public)/layout.tsx (Outlet react-router).
 */
export default function PublicLayout() {
  const location = useLocation();

  // Scroll ke anchor (#hash) bila ada, selain itu ke atas saat berpindah halaman
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname, location.hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
