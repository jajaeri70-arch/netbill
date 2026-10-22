"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/session";

/**
 * /auth/callback — Task 1.4.
 * Titik pendaratan setelah OAuth Google. Pada implementasi nyata, tukar kode
 * otorisasi dengan token di sini. Untuk demo, sesi dummy sudah dibuat oleh
 * tombol Google, jadi halaman ini hanya menunggu lalu mengalihkan.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session = getSession();
      router.replace(session ? "/login-redirect" : "/login");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo href="/" />
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div>
          <p className="font-heading font-bold">Menyelesaikan autentikasi…</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sedang memverifikasi akun Google Anda, mohon tunggu sebentar.
          </p>
        </div>
      </div>
    </div>
  );
}
