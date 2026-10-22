import { HeartHandshake, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { CtaSection } from '../components/landing/CtaSection.jsx';
import { usePageTitle } from '../components/public/PublicLayout.jsx';
import { MILESTONES, TEAM, VALUES } from '../data/landing.js';

const VALUE_ICONS = { ShieldCheck, HeartHandshake, Sparkles };

/** Halaman publik /tentang — misi, milestone, nilai, tim (porting tentang/page.tsx). */
export default function LandingAbout() {
  usePageTitle('Tentang Kami — NetBill');

  return (
    <>
      <section className="hero-glow">
        <div className="container-page py-16 text-center md:py-20">
          <span className="mb-4 inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Tentang Kami
          </span>
          <h1 className="mx-auto max-w-3xl text-4xl font-heading font-bold tracking-display md:text-5xl">
            Teknologi billing yang <span className="text-gradient">memanusiakan</span> pengelola jaringan
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted">
            NetBill berdiri untuk satu alasan sederhana: pengelola internet RT/RW tidak seharusnya
            menghabiskan malam mencatat tagihan manual. Kami membangun alat yang membuat operasional
            harian berjalan sendiri, agar waktu Anda kembali untuk komunitas.
          </p>
        </div>
      </section>

      <MissionSection />
      <ValuesSection />
      <TeamSection />
      <CtaSection />
    </>
  );
}

function MissionSection() {
  return (
    <section className="py-14">
      <div className="container-page grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[.14em] text-primary">Misi Kami</p>
          <h2 className="mt-2 text-3xl font-heading font-bold tracking-display">
            Otomatisasi yang adil untuk jaringan berskala komunitas
          </h2>
          <p className="mt-4 leading-relaxed text-muted">
            Banyak ISP RT/RW masih mengandalkan buku tulis dan WhatsApp pribadi. Akibatnya tagihan
            bocor, tunggakan menumpuk, dan pelanggan kecewa tanpa alasan yang jelas. NetBill
            menghadirkan tingkat profesionalitas sistem enterprise ke skala komunitas — mudah
            dipakai, terjangkau, dan berbahasa Indonesia.
          </p>
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <Target className="h-5 w-5" />
            </span>
            <p className="text-sm leading-relaxed text-muted">
              <strong className="font-semibold text-foreground">Target 2026:</strong> membantu 100
              komunitas jaringan mencapai penagihan 100% terotomatisasi dengan tunggakan di bawah 5%.
            </p>
          </div>
        </div>

        <ol className="relative space-y-6 border-l border-border pl-6">
          {MILESTONES.map((item) => (
            <li key={item.year} className="relative">
              <span className="absolute -left-[31px] flex h-3 w-3 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 ring-4 ring-background" />
              <p className="text-[13px] font-bold uppercase tracking-wide text-primary">{item.year}</p>
              <p className="mt-1 font-heading font-bold">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ValuesSection() {
  return (
    <section className="border-y border-border bg-card/40 py-14">
      <div className="container-page">
        <h2 className="text-center text-3xl font-heading font-bold tracking-display">
          Nilai yang kami pegang
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {VALUES.map((value) => {
            const Icon = VALUE_ICONS[value.icon] ?? ShieldCheck;
            return (
              <div key={value.title} className="card card-hover">
                <div className="p-6 text-center">
                  <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-heading text-lg font-bold">{value.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{value.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TeamSection() {
  return (
    <section className="py-14">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-heading font-bold tracking-display">Tim di balik NetBill</h2>
          <p className="mt-3 text-muted">
            Orang-orang yang setiap hari membangun dan merawat platform untuk Anda.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((member) => (
            <div key={member.name} className="card card-hover text-center">
              <div className="p-6">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary">
                  {member.initials}
                </span>
                <p className="mt-4 font-heading font-bold">{member.name}</p>
                <p className="text-[13px] text-muted">{member.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
