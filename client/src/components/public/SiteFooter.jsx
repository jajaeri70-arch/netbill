import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Logo } from './Logo.jsx';
import { COMPANY } from '../../data/landing.js';

const PRODUCT_LINKS = [
  { to: '/paket', label: 'Paket Internet' },
  { to: '/#keunggulan', label: 'Fitur Unggulan' },
  { to: '/#harga', label: 'Harga & Layanan' },
  { to: '/register', label: 'Daftar Akun' },
  { to: '/login', label: 'Masuk Aplikasi' },
];

const COMPANY_LINKS = [
  { to: '/tentang', label: 'Tentang Kami' },
  { to: '/kontak', label: 'Hubungi Kami' },
];

/** Footer publik — porting dari prototype web/src/components/public/site-footer.tsx. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">{COMPANY.tagline}</p>
          <ul className="mt-5 space-y-2.5 text-sm text-muted">
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {COMPANY.address}
            </li>
            <li className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 shrink-0 text-primary" />
              {COMPANY.phone}
            </li>
            <li className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 shrink-0 text-primary" />
              {COMPANY.email}
            </li>
          </ul>
        </div>

        <div>
          <p className="mb-4 text-[13px] font-bold uppercase tracking-wide text-foreground">Produk</p>
          <ul className="space-y-2.5 text-sm">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.label}>
                <Link to={link.to} className="text-muted transition hover:text-primary">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-4 text-[13px] font-bold uppercase tracking-wide text-foreground">Perusahaan</p>
          <ul className="space-y-2.5 text-sm">
            {COMPANY_LINKS.map((link) => (
              <li key={link.label}>
                <Link to={link.to} className="text-muted transition hover:text-primary">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-[13px] text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} {COMPANY.name}. Seluruh hak cipta dilindungi.</p>
          <p>Dibangun untuk komunitas RT/RW Net Indonesia.</p>
        </div>
      </div>
    </footer>
  );
}
