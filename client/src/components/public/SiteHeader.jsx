import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LogIn, LayoutDashboard, UserRoundPlus } from 'lucide-react';
import { Logo } from './Logo.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

const NAV = [
  { to: '/', label: 'Beranda' },
  { to: '/paket', label: 'Paket' },
  { to: '/tentang', label: 'Tentang' },
  { to: '/kontak', label: 'Kontak' },
];

/**
 * Header publik: sticky + blur, navigasi, ThemeToggle, dan aksi Masuk/Dashboard.
 * Porting dari prototype web/src/components/public/site-header.tsx — Sheet radix
 * diganti menu mobile sederhana sesuai konvensi client (tanpa dependensi baru).
 */
export function SiteHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Tutup menu mobile saat berpindah halaman
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (to) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Navigasi utama">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to) ? 'page' : undefined}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActive(item.to)
                    ? 'bg-secondary font-semibold text-primary'
                    : 'text-muted hover:bg-secondary hover:text-foreground'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className="btn btn-ghost hidden px-3.5 py-2 text-sm sm:inline-flex">
            <LogIn className="h-4 w-4" />
            Masuk
          </Link>
          <Link to="/login" className="btn btn-primary hidden px-3.5 py-2 text-sm sm:inline-flex">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>

          {/* Tombol menu mobile */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={open}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Panel menu mobile */}
      {open && (
        <div className="border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
          <nav className="container-page flex flex-col gap-1 py-3" aria-label="Navigasi mobile">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.to)
                    ? 'bg-secondary font-semibold text-primary'
                    : 'text-muted hover:bg-secondary hover:text-foreground'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="my-2 h-px bg-border" />
            <Link to="/register" className="btn btn-outline px-3 py-2.5 text-sm">
              <UserRoundPlus className="h-4 w-4" />
              Daftar Akun
            </Link>
            <Link to="/login" className="btn btn-primary px-3 py-2.5 text-sm">
              <LogIn className="h-4 w-4" />
              Masuk ke Aplikasi
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
