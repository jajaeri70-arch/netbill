import { Users, ReceiptText, Activity, Wallet, BarChart3, Wrench } from 'lucide-react';
import { FEATURES } from '../../data/landing.js';

const ICONS = { Users, ReceiptText, Activity, Wallet, BarChart3, Wrench };

const TONES = [
  'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
  'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-500',
  'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400',
  'bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
  'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
];

/** Section keunggulan (id="keunggulan") — porting features.tsx. */
export function Features() {
  return (
    <section id="keunggulan" className="py-16 md:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-bold uppercase tracking-[.14em] text-primary">Keunggulan</p>
          <h2 className="mt-2 text-3xl font-heading font-bold tracking-display md:text-4xl">
            Semua yang dibutuhkan ISP RT/RW modern
          </h2>
          <p className="mt-4 text-muted">
            Dari pencatatan pelanggan sampai laporan laba rugi — NetBill menggantikan buku tulis dan
            spreadsheet dengan sistem yang rapi serta otomatis.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = ICONS[feature.icon] ?? Activity;
            return (
              <div key={feature.title} className="card card-hover">
                <div className="p-6">
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${TONES[index % TONES.length]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-heading text-lg font-bold tracking-tight">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
