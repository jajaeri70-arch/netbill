# NetBill Web — Next.js 15 (Landing, Auth, Dashboard Shell)

Implementasi Task 1.1–1.5: fondasi design system NetBill (Bab 4), tema light/dark,
public layout + landing, halaman auth, dan dashboard shell berbasis role.

## Menjalankan

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run build    # build produksi
npm start        # jalankan hasil build
```

## Struktur

```
src/
├─ app/
│  ├─ (public)/            # Public Layout (Header + Footer)
│  │  ├─ page.tsx          # / Beranda (hero, keunggulan, harga, testimoni, CTA)
│  │  ├─ paket/            # /paket (grid + tabel perbandingan + FAQ)
│  │  ├─ tentang/          # /tentang (misi, milestone, nilai, tim)
│  │  └─ kontak/           # /kontak (kanal + form)
│  ├─ (auth)/              # Kartu di tengah + panel brand
│  │  ├─ login/            # /login (form + Google)
│  │  ├─ register/         # /register (form + pilih peran + Google)
│  │  └─ auth/callback/    # /auth/callback (redirect setelah OAuth)
│  ├─ (dashboard)/         # Dashboard Shell (sidebar + header)
│  │  ├─ dashboard/        # /dashboard + /dashboard/[section]
│  │  └─ login-redirect/   # /login-redirect (ke dashboard sesuai role)
│  ├─ layout.tsx           # Font (Inter, Plus Jakarta Sans) + ThemeProvider
│  └─ globals.css          # Design tokens Bab 4 (light/dark, HSL)
├─ components/
│  ├─ ui/                  # shadcn/ui: button, card, input, label, dialog, sheet,
│  │                       # table, badge, dropdown-menu, tabs, select, textarea,
│  │                       # avatar, skeleton, separator, sidebar
│  ├─ landing/             # hero, features, pricing, testimonials, cta
│  ├─ public/              # site-header, site-footer
│  ├─ dashboard/           # app-sidebar, app-header, summary, section-content
│  ├─ auth/                # google-button (logo Google inline), register-fields
│  ├─ theme-provider.tsx   # next-themes (class strategy, default system)
│  └─ theme-toggle.tsx     # tombol Sun/Moon
└─ lib/
   ├─ data.ts, content.ts  # Data dummy (paket, fitur, testimoni, dst.)
   ├─ dashboard-nav.ts     # Menu sidebar per role
   ├─ dashboard-data.ts    # Tabel dummy tiap section
   ├─ session.ts           # Sesi demo (localStorage) + role
   └─ utils.ts             # cn(), formatIDR()
```

## Catatan

- **Role demo**: login dengan email diawali `owner|finance|kasir|teknisi|pelanggan`
  (mis. `kasir@netbill.id`) untuk melihat menu dashboard berbeda; tombol Google
   membuat sesi `finance`. Saat backend siap, ganti `lib/session.ts`.
- **Tema**: `next-themes` strategy `class`, default mengikuti sistem, tersimpan di localStorage.
- **Warna**: seluruh token Bab 4 didefinisikan sebagai CSS variables di `globals.css`
  dan dipetakan ke Tailwind di `tailwind.config.ts`.
