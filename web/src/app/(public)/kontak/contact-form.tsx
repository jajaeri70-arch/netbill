"use client";

import { BadgeCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COMPANY } from "@/lib/content";

interface ContactFormProps {
  sent: boolean;
  sending: boolean;
  onSent: () => void;
  onSending: (v: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function ContactForm({ sent, sending, onSent, onSubmit }: ContactFormProps) {
  if (sent) {
    return (
      <Card className="lg:col-span-3">
        <CardContent className="p-6">
          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
              <BadgeCheck className="h-8 w-8" />
            </span>
            <h2 className="mt-5 font-heading text-xl font-bold">Pesan terkirim!</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Terima kasih. Tim NetBill akan menghubungi Anda melalui email atau WhatsApp maksimal
              dalam 1×24 jam kerja.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => onSent()}>
              Kirim pesan lain
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-3">
      <CardContent className="p-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <h2 className="font-heading text-xl font-bold">Kirim pesan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Isi formulir di bawah — semua kolom bertanda * wajib diisi.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nama">Nama lengkap *</Label>
              <Input id="nama" name="nama" placeholder="cth. Budi Santoso" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kebutuhan">Kebutuhan *</Label>
              <Input id="kebutuhan" name="kebutuhan" placeholder="cth. Pasang baru 20 Mbps" required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" name="email" type="email" placeholder="nama@email.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telepon">Nomor WhatsApp</Label>
              <Input id="telepon" name="telepon" type="tel" placeholder="08xx-xxxx-xxxx" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pesan">Pesan *</Label>
            <Textarea
              id="pesan"
              name="pesan"
              rows={5}
              placeholder="Ceritakan kebutuhan Anda: jumlah pelanggan, lokasi, atau pertanyaan seputar paket…"
              required
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">
              Atau email langsung ke {COMPANY.email}
            </p>
            <Button type="submit" disabled={sending}>
              <Send className="h-4 w-4" />
              {sending ? "Mengirim…" : "Kirim Pesan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export { ContactForm };
