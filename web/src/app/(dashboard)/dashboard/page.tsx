"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardSummary } from "@/components/dashboard/summary";
import { ApiError, api } from "@/lib/api";
import { getSession, type Session } from "@/lib/session";

export interface DashboardStats {
  cards: {
    activeCustomers: number;
    onlineUsers: number;
    offlineUsers: number;
    isolatedCustomers: number;
    revenueThisMonth: number;
    subscriptionRevenue: number;
    newCustomersWithoutInvoice: number;
    arrearsTotal: number;
    arrearsCount: number;
  };
  widgets: { invoicesThisMonth: { count: number }; paymentsThisMonth: number };
  recentPayments: Array<{ id: number; number: string; customer_name: string; method: string; amount: number }>;
}

export type InstallationPeriod = "day" | "month" | "year";
export interface InstallationTrend {
  period: InstallationPeriod;
  total: number;
  series: Array<{ label: string; value: number }>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<DashboardStats | null>(null);
  const [installationPeriod, setInstallationPeriod] = useState<InstallationPeriod>("month");
  const [installationTrend, setInstallationTrend] = useState<InstallationTrend>({ period: "month", total: 0, series: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    const existing = getSession();
    if (!existing) {
      router.replace("/login");
      return;
    }
    setSession(existing);
    api<DashboardStats>("/dashboard/stats")
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Gagal memuat dashboard.");
      });
  }, [router]);

  useEffect(() => {
    api<InstallationTrend>(`/dashboard/installation-trend?period=${installationPeriod}`)
      .then(setInstallationTrend)
      .catch(() => setInstallationTrend({ period: installationPeriod, total: 0, series: [] }));
  }, [installationPeriod]);

  return <DashboardSummary role={session?.role ?? "finance"} data={data} error={error} installationPeriod={installationPeriod} installationTrend={installationTrend} onInstallationPeriodChange={setInstallationPeriod} />;
}
