import { Link } from 'react-router-dom';
import { Check, Gauge, Zap } from 'lucide-react';
import { CtaSection } from '../components/landing/CtaSection.jsx';
import { usePageTitle } from '../components/public/PublicLayout.jsx';
import { PLANS, PLAN_COMPARISON, FAQS } from '../data/landing.js';
import { fmtIDR } from '../utils/format.js';

/** Halaman publik /paket — grid paket + tabel perbandingan + FAQ (porting paket/page.tsx). */
export default function LandingPackages() {
  usePageTitle('Paket Internet — NetBill');

  return (
    <>
      <section className="hero-glow">
        <div className="container-page py-16 text-center md:py-20">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <Gauge className="h-3.5 w-3.5" />
            4 pilihan paket — unlimited tanpa FUP
          </span>
          <h1 className="text-4xl font-heading font-bold tracking-display md:text-5xl">
            Pilih paket yang <span className="text-gradient">paling pas</span> untuk Anda
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Semua paket memakai koneksi fiber optik 1:1 dengan dukungan teknisi lokal. Aktivasi hanya
            1–3 hari kerja setelah pendaftaran.
          </p>
        </div>
      </section>

      <section className="pb-16 md:pb-20">
        <div className="container-page grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`card card-hover relative flex flex-col ${
                plan.popular ? 'border-primary/50 shadow-lg shadow-indigo-500/10 ring-1 ring-primary/30' : ''
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary shadow-sm backdrop-blur">
                  <Zap className="mr-1 inline h-3 w-3" />
                  Paling Populer
                </span>
              )}
              <div className="p-6 pb-4">
                <h3 className="font-heading text-lg font-semibold tracking-tight">{plan.name}</h3>
                <p className="mt-1 text-[13px] text-muted">{plan.tagline}</p>
              </div>
              <div className="flex-1 px-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tracking-display">{fmtIDR(plan.price)}</span>
                  <span className="text-sm text-muted">/bln</span>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-primary">{plan.speed} Mbps</p>
                <ul className="mt-4 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
                      <span className="text-muted">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-6 pt-6">
                <Link
                  to="/login"
                  className={`btn w-full py-2.5 text-sm ${plan.popular ? 'btn-primary' : 'btn-outline'}`}
                >
                  Pilih Paket
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ComparisonSection />
      <FaqSection />
      <CtaSection />
    </>
  );
}
function ComparisonSection() {
  return (
    <section className="border-y border-border bg-card/40 py-16">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-heading font-bold tracking-display md:text-4xl">
            Perbandingan lengkap
          </h2>
          <p className="mt-3 text-muted">Detail perbedaan antar paket agar Anda tidak salah pilih.</p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50/70 dark:bg-navy-800/50">
                  <th className="th w-[220px]">Fitur</th>
                  {PLANS.map((plan) => (
                    <th key={plan.id} className="th text-center">
                      {plan.name}
                      <span className="block text-[11px] font-normal normal-case tracking-normal text-muted">
                        {plan.speed} Mbps · {fmtIDR(plan.price)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_COMPARISON.map((row) => (
                  <tr key={row.label} className="table-row">
                    <td className="td font-medium">{row.label}</td>
                    {PLANS.map((plan) => (
                      <td key={plan.id} className="td text-center">
                        {row.values[plan.id] === '✓' ? (
                          <Check className="mx-auto h-4 w-4 text-success" strokeWidth={2.5} />
                        ) : (
                          row.values[plan.id]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="py-16 md:py-20">
      <div className="container-page mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-heading font-bold tracking-display">Pertanyaan umum</h2>
        <div className="mt-10 space-y-5">
          {FAQS.map((faq) => (
            <div key={faq.q} className="card">
              <div className="p-5">
                <p className="font-heading font-bold">{faq.q}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

