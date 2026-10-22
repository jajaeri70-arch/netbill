"use client";

import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, type Role } from "@/lib/session";

interface RegisterFieldsProps {
  form: { name: string; email: string; password: string; confirm: string; role: Role };
  update: <K extends "name" | "email" | "password" | "confirm" | "role">(
    key: K,
    value: { name: string; email: string; password: string; confirm: string; role: Role }[K]
  ) => void;
  showPassword: boolean;
  onTogglePassword: () => void;
}

export function RegisterFields({ form, update, showPassword, onTogglePassword }: RegisterFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="name">Nama lengkap</Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="name"
            placeholder="cth. Budi Santoso"
            className="pl-10"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="nama@email.com"
            className="pl-10"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Minimal 6 karakter"
              className="pl-10 pr-10"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              required
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Konfirmasi password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Ulangi password"
            value={form.confirm}
            onChange={(e) => update("confirm", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Saya mendaftar sebagai</Label>
        <Select value={form.role} onValueChange={(value) => update("role", value as Role)}>
          <SelectTrigger id="role">
            <SelectValue placeholder="Pilih peran" />
          </SelectTrigger>
          <SelectContent>
            {(["owner", "finance", "kasir", "teknisi"] as Role[]).map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
