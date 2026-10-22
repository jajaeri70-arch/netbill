"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearSession, initialsOf, ROLE_LABELS, type Role } from "@/lib/session";

interface AppHeaderProps {
  name: string;
  email: string;
  role: Role;
}

/** Header kecil dashboard: SidebarTrigger + tema + avatar user (Task 1.2 & 1.5). */
export function AppHeader({ name, email, role }: AppHeaderProps) {
  const router = useRouter();

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6">
      <SidebarTrigger />

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2.5 rounded-full pl-1.5 pr-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initialsOf(name) || "NB"}</AvatarFallback>
              </Avatar>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[140px] truncate text-[13px] font-semibold leading-tight">
                  {name}
                </span>
                <span className="block max-w-[140px] truncate text-[11px] leading-tight text-muted-foreground">
                  {email}
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <p className="truncate">{name}</p>
              <Badge variant="default" className="mt-1">
                {ROLE_LABELS[role]}
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserRound />
              Profil Saya
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings />
              Pengaturan Akun
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
              <LogOut />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
