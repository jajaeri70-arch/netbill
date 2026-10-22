"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GoogleButton } from "@/components/auth/google-button";
import { RegisterFields } from "@/components/auth/register-fields";
import { ROLE_LABELS, saveSession, type Role } from "@/lib/session";

const ROLE_OPTIONS: Role[] = ["owner", "finance", "kasir", "teknisi"];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    role: "owner" as Role,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!form.name.trim()) return setError("Nama wajib diisi.");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError("Format email tidak valid.");
    if (form.password.length < 6) return setError("Password minimal 6 karakter.");
    if (form.password !== form.confirm) return setError("Konfirmasi password tidak sama.");

    setLoading(true);
    // Demo tanpa backend — simpan sesi lalu arahkan ke login-redirect (Task 1.5).
    window.setTimeout(() => {
      saveSession({ name: form.name.trim(), email: form.email, role: form.role });
      router.push("/login-redirect");
    }, 700);
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Buat akun NetBill</CardTitle>
        <CardDescription>Gratis untuk 30 pelanggan pertama — tanpa kartu kredit.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <GoogleButton label="Daftar dengan Google" />

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">atau</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <RegisterFields
            form={form}
            update={update}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((v) => !v)}
          />

          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Membuat akun…" : "Buat Akun"}
          </Button>

          <p className="text-center text-[13px] text-muted-foreground">
            Dengan mendaftar, Anda menyetujui Syarat Layanan dan Kebijakan Privasi NetBill.
          </p>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Sudah punya akun?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Masuk di sini
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}