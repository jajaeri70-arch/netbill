"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SECTION_META } from "@/lib/dashboard-nav";
import { SECTION_ROWS } from "@/lib/dashboard-data";

type TicketCategory = "Pemasangan Baru" | "Gangguan";
type Ticket = { main: string; sub: string; status: string; statusVariant: "info"; amount: string };
const TICKET_STORAGE_KEY = "netbill_tickets";

/** Konten generik tiap section dashboard dengan data dummy nyata. */
export function SectionContent({ section }: { section: string }) {
  const [tickets, setTickets] = useState<Ticket[]>(SECTION_ROWS.tiket as Ticket[]);
  const [category, setCategory] = useState<TicketCategory>("Gangguan");
  const [customer, setCustomer] = useState("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TICKET_STORAGE_KEY);
      if (saved) setTickets(JSON.parse(saved) as Ticket[]);
    } catch {
      // Gunakan data demo bila storage kosong atau tidak valid.
    }
  }, []);

  function openTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextNumber = 452 + tickets.length - SECTION_ROWS.tiket.length;
    const ticket: Ticket = {
      main: `TKT-${String(nextNumber).padStart(4, "0")}`,
      sub: `${category} · ${customer.trim()} — ${details.trim()}`,
      status: "Open",
      statusVariant: "info",
      amount: "Baru",
    };
    const updated = [ticket, ...tickets];
    setTickets(updated);
    try {
      localStorage.setItem(TICKET_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Tiket tetap tampil selama sesi ini bila storage tidak tersedia.
    }
    setCustomer("");
    setDetails("");
  }

  const meta = SECTION_META[section] ?? { title: section, description: "Modul NetBill." };
  const rows = section === "tiket" ? tickets : SECTION_ROWS[section] ?? [];

  return (
    <>
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-display md:text-3xl">{meta.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
      </div>

      {section === "tiket" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Buka tiket baru</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={openTicket} className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Jenis tiket
                <select className="h-10 rounded-xl border border-input bg-card px-3" value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)}>
                  <option>Pemasangan Baru</option>
                  <option>Gangguan</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Nama pelanggan
                <Input required maxLength={100} value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Nama pelanggan" />
              </label>
              <label className="grid gap-2 text-sm font-medium sm:col-span-2">
                Detail / alamat
                <Textarea required maxLength={500} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Jelaskan kebutuhan pemasangan atau gangguan dan alamat pelanggan" />
              </label>
              <div><Button type="submit">Buka tiket</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <CardTitle className="text-base">Daftar {meta.title.toLowerCase()}</CardTitle>
          <Badge variant="secondary">{rows.length} entri</Badge>
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
              {rows.map((row) => (
                <TableRow key={row.main}>
                  <TableCell className="font-semibold">{row.main}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{row.sub}</TableCell>
                  <TableCell>
                    <Badge variant={row.statusVariant}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{row.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
