"use client";

import { useState } from "react";
import { BadgeCheck, Send } from "lucide-react";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CtaSection } from "@/components/landing/cta-section";
import { ContactForm } from "./contact-form";
import { CONTACT_CHANNELS, COMPANY } from "@/lib/content";

const ICONS = { Phone, Mail, MapPin, Clock } as const;

export default function KontakPage() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    // Demo tanpa backend: tampilkan konfirmasi setelah jeda singkat.
    window.setTimeout(() => {
      setSending(false);
      setSent(true);
    }, 700);
  }

  return (
    <>
      <section className="hero-glow">
        <div className="container-page py-16 text-center md:py-20">
          <Badge className="mb-4">Kontak</Badge>
          <h1 className="text-4xl font-heading font-bold tracking-display md:text-5xl">
            Mari <span className="text-gradient">berkenalan</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Ada pertanyaan tentang paket, integrasi, atau migrasi data? Tim kami siap membantu.
          </p>
        </div>
      </section>

      <section className="pb-16 md:pb-20">
        <div className="container-page grid gap-8 lg:grid-cols-5">
          <ChannelsGrid />
          <ContactForm sent={sent} sending={sending} onSent={() => setSent(true)} onSending={(v) => setSending(v)} onSubmit={handleSubmit} />
        </div>
      </section>

      <CtaSection />
    </>
  );
}

function ChannelsGrid() {
  return (
    <div className="space-y-4 lg:col-span-2">
      {CONTACT_CHANNELS.map((channel) => {
        const Icon = ICONS[channel.icon as keyof typeof ICONS] ?? MapPin;
        return (
          <Card key={channel.title} className="card-hover transition-all">
            <CardContent className="flex items-start gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
                  {channel.title}
                </p>
                <p className="mt-0.5 font-semibold">{channel.detail}</p>
                <p className="text-[13px] text-muted-foreground">{channel.note}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}