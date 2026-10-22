import { Link } from 'react-router-dom';
import { Check, Zap } from 'lucide-react';
import { PLANS } from '../../data/landing.js';
import { fmtIDR } from '../../utils/format.js';

/** Section harga & layanan (id="harga") — porting pricing.tsx, memakai fmtIDR client. */
export function Pricing() {
  return (
    <section id="harga" className="border-y border-border bg-card/40 py-16 md:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-bold uppercase tracking-[.14em] text-primary">Harga &amp; Layanan</p>
          <h2 className="mt-2 text-3xl font-heading font-bold tracking-display md:text-4xl">
            Paket internet untuk setiap kebutuhan
          </h2>
          <p className="mt-4 text-muted">
            Harga transparan per bulan, tanpa biaya tersembunyi. Naik atau turun kelas paket kapan saja
            dari dashboard pelanggan.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
                  <span className="text-4xl font-bold tracking-display">{fmtIDR(plan.price)}</span>
                  <span className="text-sm text-muted">/bln</span>
                </div>
                <p className="mt-2 text-[13px] font-semibold text-primary">
                  Kecepatan {plan.speed} Mbps
                </p>
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
                  to={`/register?plan=${plan.id}`}
                  className={`btn w-full py-2.5 text-sm ${plan.popular ? 'btn-primary' : 'btn-outline'}`}
                >
                  Pilih Paket
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
