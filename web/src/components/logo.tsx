import Link from "next/link";
import { Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  href?: string;
  className?: string;
  /** Ukuran ikon badge logo */
  size?: "sm" | "md";
}

/** Logo NetBill — badge gradient indigo→violet→purple khas Bab 4. */
export function Logo({ href = "/", className, size = "md" }: LogoProps) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 transition group-hover:brightness-110",
          size === "md" ? "h-9 w-9" : "h-8 w-8"
        )}
      >
        <Wifi className={size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4"} strokeWidth={2.4} />
      </span>
      <span className="font-heading text-lg font-bold tracking-display text-foreground">
        Net<span className="text-gradient">Bill</span>
      </span>
    </Link>
  );
}
