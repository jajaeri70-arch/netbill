"use client";

import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppHeader } from "@/components/dashboard/app-header";
import { getSession, type Session } from "@/lib/session";

/**
 * Dashboard Shell (Task 1.5): sidebar kiri responsif + header kecil
 * dengan tombol tema dan avatar user. Menu mengikuti role pada sesi.
 */
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(getSession());
  }, []);

  // Nilai default agar sidebar tetap tampil sebelum sesi terbaca (demo).
  const name = session?.name ?? "Pengguna NetBill";
  const email = session?.email ?? "demo@netbill.id";
  const role = session?.role ?? "finance";

  return (
    <SidebarProvider>
      <AppSidebar role={role} name={name} />
      <SidebarInset>
        <AppHeader name={name} email={email} role={role} />
        <main className="flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
