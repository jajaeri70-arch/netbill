import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { COMPANY } from '../../data/landing.js';

/** CTA penutup landing — porting cta-section.tsx. */
export function CtaSection() {
  return (
    <section className="pb-16 md:pb-24">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950 via-violet-950 to-slate-950 px-6 py-14 text-center text-white shadow-xl md:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'linear-gradient(rgba(199,210,254,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(199,210,254,.25) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            }}
          />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-heading font-bold tracking-display md:text-4xl">
              Siap memodernisasi billing RT/RW Anda?
            </h2>
            <p className="mt-4 text-indigo-200">
              Bergabung dengan puluhan komunitas jaringan yang telah menghemat waktu puluhan jam
              per bulan berkat otomatisasi NetBill.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register" className="btn btn-primary px-6 py-3 text-sm">
                Daftar Gratis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/kontak"
                className="btn border border-white/25 bg-white/10 px-6 py-3 text-sm text-white hover:bg-white/20 hover:text-white"
              >
                <MessageCircle className="h-4 w-4" />
                Konsultasi Dulu
              </Link>
            </div>
            <p className="mt-5 text-[13px] text-indigo-300">
              Butuh bantuan? Hubungi {COMPANY.phone} — {COMPANY.hours}.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
