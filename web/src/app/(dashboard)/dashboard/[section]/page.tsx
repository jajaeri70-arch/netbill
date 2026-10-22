"use client";

import { useParams } from "next/navigation";
import { SectionContent } from "@/components/dashboard/section-content";

/** Halaman generik untuk setiap section dashboard (pelanggan, tagihan, dst.). */
export default function DashboardSectionPage() {
  const params = useParams<{ section: string }>();
  return <SectionContent section={params.section} />;
}
