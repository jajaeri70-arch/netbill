import type { Metadata } from "next";
import { Check, Gauge, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CtaSection } from "@/components/landing/cta-section";
import { PLANS } from "@/lib/data";
import { PLAN_COMPARISON, FAQS } from "@/lib/content";
import { cn, formatIDR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Paket Internet",
  description: "Daftar lengkap paket internet NetBill untuk kebutuhan rumah, gaming, hingga bisnis.",
};

export default function PaketPage() {
  return (
    <>
      <section className="hero-glow">
        <div className="container-page py-16 text-center md:py-20">
          <Badge className="mb-4">
            <Gauge className="h-3.5 w-3.5" />
            4 pilihan paket — unlimited tanpa FUP
          </Badge>
          <h1 className="text-4xl font-heading font-bold tracking-display md:text-5xl">
            Pilih paket yang <span className="text-gradient">paling pas</span> untuk Anda
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Semua paket memakai koneksi fiber optik 1:1 dengan dukungan teknisi lokal. Aktivasi hanya
            1–3 hari kerja setelah pendaftaran.
          </p>
        </div>
      </section>

      <section className="pb-16 md:pb-20">
        <div className="container-page grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={cn(
                "card-hover relative flex flex-col transition-all",
                plan.popular && "border-primary/50 shadow-lg shadow-indigo-500/10 ring-1 ring-primary/30"
              )}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 shadow-sm">
                  <Zap className="h-3 w-3" />
                  Paling Populer
                </Badge>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <p className="text-[13px] text-muted-foreground">{plan.tagline}</p>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tracking-display">{formatIDR(plan.price)}</span>
                  <span className="text-sm text-muted-foreground">/bln</span>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-primary">{plan.speed} Mbps</p>
                <ul className="mt-4 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant={plan.popular ? "default" : "outline"} asChild>
                  <a href={`/register?plan=${plan.id}`}>Pilih Paket</a>
                </Button>
              </CardFooter>
            </Card>
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
          <p className="mt-3 text-muted-foreground">
            Detail perbedaan antar paket agar Anda tidak salah pilih.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">Fitur</TableHead>
                {PLANS.map((plan) => (
                  <TableHead key={plan.id} className="text-center">
                    {plan.name}
                    <span className="block text-[11px] font-normal normal-case text-muted-foreground">
                      {plan.speed} Mbps · {formatIDR(plan.price)}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PLAN_COMPARISON.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  {PLANS.map((plan) => (
                    <TableCell key={plan.id} className="text-center">
                      {row.values[plan.id] === "✓" ? (
                        <Check className="mx-auto h-4 w-4 text-success" strokeWidth={2.5} />
                      ) : (
                        row.values[plan.id]
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="py-16 md:py-20">
      <div className="container-page mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-heading font-bold tracking-display">
          Pertanyaan umum
        </h2>
        <div className="mt-10 space-y-5">
          {FAQS.map((faq) => (
            <Card key={faq.q}>
              <CardContent className="p-5">
                <p className="font-heading font-bold">{faq.q}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
