import Link from "next/link";
import { Activity, BarChart3, ShieldCheck, Wifi } from "lucide-react";
import { Logo } from "@/components/logo";

/** Layout halaman auth: kartu di tengah + panel fitur di sisi kanan (Task 1.4). */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh">
      {/* Panel kiri — brand & keunggulan (desktop) */}
      <aside className="hero-glow relative hidden w-1/2 flex-col justify-between overflow-hidden bg-card p-10 lg:flex">
        <Logo href="/" />
        <div>
          <h2 className="max-w-md text-3xl font-heading font-bold leading-tight tracking-display">
            Satu aplikasi untuk <span className="text-gradient">billing, pembayaran,</span> dan
            jaringan RT/RW Anda
          </h2>
          <ul className="mt-8 space-y-4">
            {[
              { icon: Wifi, text: "Isolir & aktivasi PPPoE otomatis via Mikrotik" },
              { icon: BarChart3, text: "Laporan pemasukan, arus kas, dan laba rugi real-time" },
              { icon: Activity, text: "Monitoring online/offline & redaman optik pelanggan" },
              { icon: ShieldCheck, text: "Hak akses per peran dengan log aktivitas lengkap" },
            ].map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                <p className="pt-1.5 text-sm text-muted-foreground">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-muted-foreground">
          © {new Date().getFullYear()} NetBill — Billing RT/RW Net terintegrasi.
        </p>
      </aside>

      {/* Panel kanan — form */}
      <main className="flex w-full flex-col items-center justify-center bg-background px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo href="/" />
          </div>
          {children}
          <p className="mt-8 text-center text-[13px] text-muted-foreground">
            <Link href="/" className="font-medium text-primary hover:underline">
              ← Kembali ke beranda
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
