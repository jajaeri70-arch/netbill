"use client";

/**
 * Sidebar — versi shadcn/ui yang diringkas untuk kebutuhan Dashboard Shell (Task 1.5).
 * API kompatibel: SidebarProvider, Sidebar, SidebarHeader, SidebarContent,
 * SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem,
 * SidebarMenuButton, SidebarTrigger, SidebarInset.
 * - Desktop: sidebar fixed di kiri, bisa diciutkan (collapsed)
 * - Mobile: slide-over memakai Radix Dialog (Sheet)
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

interface SidebarContextValue {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar harus dipakai di dalam SidebarProvider.");
  return ctx;
}

function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const value = React.useMemo(
    () => ({
      collapsed,
      toggleCollapsed: () => setCollapsed((v) => !v),
      mobileOpen,
      setMobileOpen,
    }),
    [collapsed, mobileOpen]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

function Sidebar({ children, className }: { children: React.ReactNode; className?: string }) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();

  const nav = (
    <div className="flex h-full flex-col overflow-hidden">{children}</div>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        data-collapsed={collapsed}
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-200 md:block",
          collapsed ? "w-[72px]" : "w-64",
          className
        )}
      >
        {nav}
      </aside>

      {/* Mobile slide-over */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
          <div className="flex h-full flex-col overflow-hidden">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex h-16 shrink-0 items-center border-b border-border px-4", className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-y-auto px-3 py-4", className)} {...props} />;
}

function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shrink-0 border-t border-border p-3", className)} {...props} />;
}

function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4", className)} {...props} />;
}

function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1", className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("", className)} {...props} />;
}

interface SidebarMenuButtonProps extends React.ComponentProps<typeof Button> {
  isActive?: boolean;
  asChild?: boolean;
}

function SidebarMenuButton({ isActive, className, asChild = false, ...props }: SidebarMenuButtonProps) {
  if (asChild) {
    return (
      <Slot
        className={cn(
          buttonVariants({
            variant: isActive ? "secondary" : "ghost",
            size: "default",
            className: cn("h-10 w-full justify-start gap-2.5 px-3 font-medium", isActive && "bg-primary/10 font-semibold text-primary hover:bg-primary/15", className),
          })
        )}
        {...props}
      />
    );
  }
  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      size="default"
      className={cn(
        "h-10 w-full justify-start gap-2.5 px-3 font-medium",
        isActive && "bg-primary/10 font-semibold text-primary hover:bg-primary/15",
        className
      )}
      {...props}
    />
  );
}

function SidebarTrigger({ className }: { className?: string }) {
  const { collapsed, toggleCollapsed, setMobileOpen } = useSidebar();
  return (
    <>
      {/* Mobile */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("md:hidden", className)}
        aria-label="Buka menu"
        onClick={() => setMobileOpen(true)}
      >
        <PanelLeftOpen className="h-5 w-5" />
      </Button>
      {/* Desktop */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("hidden md:inline-flex", className)}
        aria-label={collapsed ? "Perlebar sidebar" : "Ciutkan sidebar"}
        onClick={toggleCollapsed}
      >
        {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </Button>
    </>
  );
}

function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn("min-h-svh transition-all duration-200", collapsed ? "md:pl-[72px]" : "md:pl-64", className)}
      {...props}
    />
  );
}

export {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
};
