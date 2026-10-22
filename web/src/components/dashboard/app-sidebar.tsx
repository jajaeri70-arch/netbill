"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ROLE_LABELS, type Role } from "@/lib/session";
import { ROLE_NAV } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  role: Role;
  name: string;
}

/** Sidebar kiri dashboard dengan menu sesuai role (Task 1.5). */
export function AppSidebar({ role, name }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="justify-start">
        <Logo href="/dashboard" size="sm" />
      </SidebarHeader>

      <SidebarContent>
        {ROLE_NAV[role].map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton isActive={active} asChild>
                      <Link href={item.href}>
                        <item.icon className="h-[18px] w-[18px]" />
                        {item.label}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl bg-secondary/60 px-3 py-2.5"
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-[11px] font-bold text-white">
            {name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{ROLE_LABELS[role]}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
