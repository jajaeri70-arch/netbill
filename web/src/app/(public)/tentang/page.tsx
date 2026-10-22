import type { Metadata } from "next";
import { HeartHandshake, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CtaSection } from "@/components/landing/cta-section";
import { MILESTONES, TEAM, VALUES } from "@/lib/content";

export const metadata: Metadata = {
  title: "Tentang Kami",
  description: "Kenali NetBill — tim dan misi di balik platform billing RT/RW Net.",
};

const VALUE_ICONS = [ShieldCheck, HeartHandshake, Sparkles];

export default function TentangPage() {
  return (
    <>
      <section className="hero-glow">
        <div className="container-page py-16 text-center md:py-20">
          <Badge className="mb-4">Tentang Kami</Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-heading font-bold tracking-display md:text-5xl">
            Teknologi billing yang <span className="text-gradient">memanusiakan</span> pengelola jaringan
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
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
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Banyak ISP RT/RW masih mengandalkan buku tulis dan WhatsApp pribadi. Akibatnya tagihan
            bocor, tunggakan menumpuk, dan pelanggan kecewa tanpa alasan yang jelas. NetBill
            menghadirkan tingkat profesionalitas sistem enterprise ke skala komunitas — mudah
            dipakai, terjangkau, dan berbahasa Indonesia.
          </p>
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <Target className="h-5 w-5" />
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
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
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
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
          {VALUES.map((value, index) => {
            const Icon = VALUE_ICONS[index % VALUE_ICONS.length];
            return (
              <Card key={value.title} className="card-hover transition-all">
                <CardContent className="p-6 text-center">
                  <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-heading text-lg font-bold">{value.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{value.description}</p>
                </CardContent>
              </Card>
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
          <p className="mt-3 text-muted-foreground">
            Orang-orang yang setiap hari membangun dan merawat platform untuk Anda.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((member) => (
            <Card key={member.name} className="card-hover text-center transition-all">
              <CardContent className="p-6">
                <Avatar className="mx-auto h-16 w-16">
                  <AvatarFallback className="text-base">{member.initials}</AvatarFallback>
                </Avatar>
                <p className="mt-4 font-heading font-bold">{member.name}</p>
                <p className="text-[13px] text-muted-foreground">{member.role}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}