import { useState } from 'react';
import { BadgeCheck, Clock, Mail, MapPin, Phone, Send } from 'lucide-react';
import { CtaSection } from '../components/landing/CtaSection.jsx';
import { usePageTitle } from '../components/public/PublicLayout.jsx';
import { COMPANY, CONTACT_CHANNELS } from '../data/landing.js';

const ICONS = { Phone, Mail, MapPin, Clock };

/**
 * Halaman publik /kontak — kanal kontak + form pesan (porting kontak/page.tsx).
 * Form bersifat demo (tanpa backend): menampilkan kartu konfirmasi setelah dikirim.
 */
export default function LandingContact() {
  usePageTitle('Kontak — NetBill');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSending(true);
    // Demo tanpa backend: tampilkan konfirmasi setelah jeda singkat.
    window.setTimeout(() => {
      setSending(false);
      setSent(true);
    }, 700);
  };

  return (
    <>
      <section className="hero-glow">
        <div className="container-page py-16 text-center md:py-20">
          <span className="mb-4 inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Kontak
          </span>
          <h1 className="text-4xl font-heading font-bold tracking-display md:text-5xl">
            Mari <span className="text-gradient">berkenalan</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Ada pertanyaan tentang paket, integrasi, atau migrasi data? Tim kami siap membantu.
          </p>
        </div>
      </section>

      <section className="pb-16 md:pb-20">
        <div className="container-page grid gap-8 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            {CONTACT_CHANNELS.map((channel) => {
              const Icon = ICONS[channel.icon] ?? MapPin;
              return (
                <div key={channel.title} className="card card-hover">
                  <div className="flex items-start gap-4 p-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[13px] font-bold uppercase tracking-wide text-muted">
                        {channel.title}
                      </p>
                      <p className="mt-0.5 font-semibold">{channel.detail}</p>
                      <p className="text-[13px] text-muted">{channel.note}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <ContactForm sent={sent} sending={sending} onSent={() => setSent(false)} onSubmit={handleSubmit} />
        </div>
      </section>

      <CtaSection />
    </>
  );
}
function ContactForm({ sent, sending, onSent, onSubmit }) {
  if (sent) {
    return (
      <div className="card lg:col-span-3">
        <div className="p-6">
          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
              <BadgeCheck className="h-8 w-8" />
            </span>
            <h2 className="mt-5 font-heading text-xl font-bold">Pesan terkirim!</h2>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Terima kasih. Tim NetBill akan menghubungi Anda melalui email atau WhatsApp maksimal
              dalam 1×24 jam kerja.
            </p>
            <button type="button" onClick={onSent} className="btn btn-outline mt-6 px-4 py-2.5 text-sm">
              Kirim pesan lain
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card lg:col-span-3">
      <div className="p-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <h2 className="font-heading text-xl font-bold">Kirim pesan</h2>
            <p className="mt-1 text-sm text-muted">
              Isi formulir di bawah — semua kolom bertanda * wajib diisi.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="nama" className="label">Nama lengkap *</label>
              <input id="nama" name="nama" className="input" placeholder="cth. Budi Santoso" required />
            </div>
            <div>
              <label htmlFor="kebutuhan" className="label">Kebutuhan *</label>
              <input id="kebutuhan" name="kebutuhan" className="input" placeholder="cth. Pasang baru 20 Mbps" required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="label">Email *</label>
              <input id="email" name="email" type="email" className="input" placeholder="nama@email.com" required />
            </div>
            <div>
              <label htmlFor="telepon" className="label">Nomor WhatsApp</label>
              <input id="telepon" name="telepon" type="tel" className="input" placeholder="08xx-xxxx-xxxx" />
            </div>
          </div>
          <div>
            <label htmlFor="pesan" className="label">Pesan *</label>
            <textarea
              id="pesan"
              name="pesan"
              rows={5}
              className="input"
              placeholder="Ceritakan kebutuhan Anda: jumlah pelanggan, lokasi, atau pertanyaan seputar paket…"
              required
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted">Atau email langsung ke {COMPANY.email}</p>
            <button type="submit" disabled={sending} className="btn btn-primary px-4 py-2.5 text-sm">
              <Send className="h-4 w-4" />
              {sending ? 'Mengirim…' : 'Kirim Pesan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

