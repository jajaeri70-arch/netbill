import Link from "next/link";
import { Check, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS } from "@/lib/data";
import { cn, formatIDR } from "@/lib/utils";

/** Section harga/layanan — Task 1.3. */
export function Pricing() {
  return (
    <section id="harga" className="border-y border-border bg-card/40 py-16 md:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-bold uppercase tracking-[.14em] text-primary">Harga & Layanan</p>
          <h2 className="mt-2 text-3xl font-heading font-bold tracking-display md:text-4xl">
            Paket internet untuk setiap kebutuhan
          </h2>
          <p className="mt-4 text-muted-foreground">
            Harga transparan per bulan, tanpa biaya tersembunyi. Naik atau turun kelas paket kapan saja
            dari dashboard pelanggan.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
                  <span className="text-4xl font-bold tracking-display">{formatIDR(plan.price)}</span>
                  <span className="text-sm text-muted-foreground">/bln</span>
                </div>
                <p className="mt-2 text-[13px] font-semibold text-primary">
                  Kecepatan {plan.speed} Mbps
                </p>
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
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  asChild
                >
                  <Link href={`/register?plan=${plan.id}`}>Pilih Paket</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
