"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BadgeDollarSign,
  FileText,
  HousePlus,
  UserPlus,
  Users,
  Wallet,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Role } from "@/lib/session";
import type { DashboardStats, InstallationPeriod, InstallationTrend } from "@/app/(dashboard)/dashboard/page";
import { formatIDR } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const ROLE_GREETING: Record<Role, string> = {
  owner: "Ringkasan bisnis",
  finance: "Ringkasan keuangan",
  kasir: "Ringkasan kasir",
  teknisi: "Ringkasan jaringan",
  pelanggan: "Ringkasan akun Anda",
};

/** Konten ringkasan dashboard — berbeda penekanan per role (Task 1.5). */
export function DashboardSummary({ role, data, error, installationPeriod, installationTrend, onInstallationPeriodChange }: { role: Role; data: DashboardStats | null; error: string; installationPeriod: InstallationPeriod; installationTrend: InstallationTrend; onInstallationPeriodChange: (period: InstallationPeriod) => void }) {
  const canFinance = role === "owner" || role === "finance";
  const stats = data && [
    { icon: Users, label: "Pelanggan aktif", value: data.cards.activeCustomers.toLocaleString("id-ID"), delta: "Pelanggan layanan aktif", tone: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" },
    ...(canFinance ? [
      { icon: UserPlus, label: "Belum ada invoice", value: data.cards.newCustomersWithoutInvoice.toLocaleString("id-ID"), delta: "Pelanggan baru pascabayar tanpa tagihan", tone: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400" },
      { icon: FileText, label: "Tagihan periode ini", value: data.widgets.invoicesThisMonth.count.toLocaleString("id-ID"), delta: `${data.widgets.paymentsThisMonth} pembayaran terkonfirmasi`, tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
      { icon: Wallet, label: "Pemasukan bulan ini", value: formatIDR(data.cards.revenueThisMonth), delta: "Pembayaran terkonfirmasi", tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
      { icon: BadgeDollarSign, label: "Sisa tagihan belum dibayar", value: formatIDR(data.cards.arrearsTotal), delta: `${data.cards.arrearsCount} tagihan belum lunas`, tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400", href: "/dashboard/tagihan" },
    ] : []),
    { icon: Activity, label: "PPPoE online", value: data.cards.onlineUsers.toLocaleString("id-ID"), delta: `${data.cards.offlineUsers} offline · ${data.cards.isolatedCustomers} isolir`, tone: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-display md:text-3xl">
            {ROLE_GREETING[role]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canFinance ? "Selamat datang kembali — berikut kondisi terkini jaringan dan keuangan Anda." : "Selamat datang kembali — berikut kondisi terkini jaringan Anda."}
          </p>
        </div>
        {canFinance && <Button asChild>
          <Link href="/dashboard/tagihan">
              Kelola Tagihan
              <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {!stats && Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[116px]" />
        ))}
        {stats?.map((stat) => {
          const content = <CardContent className="flex items-center gap-4 p-5"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.tone}`}><stat.icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-[13px] font-medium text-muted-foreground">{stat.label}</p><p className="text-2xl font-bold tracking-display">{stat.value}</p><p className="truncate text-[11px] text-muted-foreground">{stat.delta}</p></div></CardContent>;
          return <Card key={stat.label} className="card-hover transition-all">{stat.href ? <Link href={stat.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</Link> : content}</Card>;
        })}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <div className="flex items-center gap-2.5"><HousePlus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /><CardTitle className="text-base">Tren PSB</CardTitle></div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">{installationTrend.total.toLocaleString("id-ID")} periode ini</span>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex justify-end"><div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Filter tren pemasangan">
            {([ ["day", "Hari"], ["month", "Bulan"], ["year", "Tahun"] ] as const).map(([period, label]) => <button key={period} type="button" aria-pressed={installationPeriod === period} onClick={() => onInstallationPeriodChange(period)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${installationPeriod === period ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
          </div></div>
          <InstallationChart series={installationTrend.series} />
        </CardContent>
      </Card>

      {canFinance && <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <CardTitle className="text-base">Aktivitas terbaru</CardTitle>
          <Badge variant="success">Realtime</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referensi</TableHead>
                <TableHead className="hidden sm:table-cell">Detail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.recentPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-semibold">{payment.number}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{payment.customer_name} · {payment.method}</TableCell>
                  <TableCell>
                    <Badge variant="success">Terkonfirmasi</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatIDR(payment.amount)}</TableCell>
                </TableRow>
              ))}
              {!data && !error && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Memuat aktivitas terbaru…</TableCell></TableRow>}
              {error && <TableRow><TableCell colSpan={4} className="py-8 text-center text-destructive">{error}</TableCell></TableRow>}
              {data?.recentPayments.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada pembayaran terbaru.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>}
    </>
  );
}

function InstallationChart({ series }: { series: InstallationTrend["series"] }) {
  const max = Math.max(1, ...series.map((item) => item.value));
  if (!series.length) return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Memuat data pemasangan…</div>;
  return <div className="h-56"><div className="flex h-48 items-end gap-1 border-b border-border px-1">
    {series.map((item) => <div key={item.label} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${item.label}: ${item.value} pemasangan`}><span className="mb-1 text-center text-[10px] font-semibold text-muted-foreground opacity-0 transition group-hover:opacity-100">{item.value}</span><div className="min-h-1 rounded-t-md bg-emerald-500/80 transition hover:bg-emerald-500" style={{ height: `${Math.max(2, (item.value / max) * 100)}%` }} /></div>)}
  </div><div className="mt-2 flex gap-1 px-1">{series.map((item, index) => <span key={item.label} className={`min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground ${series.length > 12 && index % 3 !== 0 ? "invisible" : ""}`}>{item.label}</span>)}</div></div>;
}
