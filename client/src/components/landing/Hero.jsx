import { Link } from 'react-router-dom';
import { ArrowRight, Gauge, ShieldCheck, Wifi } from 'lucide-react';
import { HERO_STATS } from '../../data/landing.js';

/** Hero beranda — mockup kartu dashboard + strip statistik (porting hero.tsx). */
export function Hero() {
  return (
    <section className="hero-glow relative overflow-hidden">
      <div className="container-page grid gap-12 py-16 md:py-24 lg:grid-cols-2 lg:items-center">
        <div className="animate-fade-up">
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Platform billing RT/RW Net terpercaya
          </span>
          <h1 className="text-4xl font-heading font-bold leading-[1.1] tracking-display md:text-5xl lg:text-[56px]">
            Kelola Billing &amp; Jaringan RT/RW dalam <span className="text-gradient">Satu Dashboard</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted md:text-lg">
            Tagihan otomatis, pembayaran multi-channel, isolir pintar, dan monitoring PPPoE realtime —
            semua digabung dalam aplikasi yang ringan digunakan pemula dan lengkap untuk teknisi.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register" className="btn btn-primary px-6 py-3 text-sm">
              Mulai Sekarang
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/paket" className="btn btn-outline px-6 py-3 text-sm">
              <Gauge className="h-4 w-4" />
              Lihat Paket Layanan
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-muted">
            Gratis untuk 30 pelanggan pertama — tanpa kartu kredit.
          </p>
        </div>

        {/* Mockup kartu dashboard */}
        <div className="relative animate-fade-up [animation-delay:150ms]">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-cyan-500/10 blur-2xl" />
          <div className="card rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-white">
                  <Wifi className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[13px] font-bold">NetBill Command Center</p>
                  <p className="text-[11px] text-muted">Ringkasan operasional hari ini</p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                Live
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Pelanggan aktif</p>
                <p className="mt-1 text-2xl font-bold tracking-display">428</p>
                <p className="mt-1 text-[11px] text-success">+12 bulan ini</p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Tagihan lunas</p>
                <p className="mt-1 text-2xl font-bold tracking-display">86%</p>
                <p className="mt-1 text-[11px] text-info">Periode Juli</p>
              </div>
            </div>

            {/* Mini bar chart penggunaan bandwidth */}
            <div className="mt-3 rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Trafik jaringan (jam 06–18)
                </p>
                <p className="text-[11px] font-semibold text-primary">312 Mbps puncak</p>
              </div>
              <div className="mt-3 flex h-20 items-end gap-1.5">
                {[35, 48, 42, 60, 55, 72, 66, 84, 78, 92, 86, 74].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className="flex-1 rounded-t-md bg-gradient-to-t from-indigo-500/40 to-violet-500/80"
                  />
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-success" />
                <div>
                  <p className="text-[13px] font-semibold">412 PPPoE online</p>
                  <p className="text-[11px] text-muted">16 offline · 2 isolir</p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                99,9% uptime
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Strip statistik */}
      <div className="border-y border-border bg-card/60">
        <div className="container-page grid grid-cols-2 gap-6 py-8 md:grid-cols-4">
          {HERO_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold tracking-display text-gradient">{stat.value}</p>
              <p className="mt-1 text-[13px] text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
