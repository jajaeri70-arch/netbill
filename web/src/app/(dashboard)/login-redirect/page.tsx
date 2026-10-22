"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/session";

/**
 * /login-redirect — Task 1.5.
 * Membaca role dari sesi lalu mengalihkan ke dashboard yang sesuai.
 */
export default function LoginRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session = getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      // Semua role memakai /dashboard; konten & menu sudah berbeda per role.
      router.replace("/dashboard");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo href="/" />
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="font-heading font-bold">Menyiapkan dashboard Anda…</p>
        <p className="text-sm text-muted-foreground">Menyesuaikan menu sesuai peran akun.</p>
      </div>
    </div>
  );
}
