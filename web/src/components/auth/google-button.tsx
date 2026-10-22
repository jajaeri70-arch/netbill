"use client";

import { svg } from "./google-logo";

interface GoogleButtonProps {
  label: string;
  onClick?: () => void;
}

/** Tombol Login/daftar Google — demo: langsung membuat sesi di /auth/callback. */
export function GoogleButton({ label }: GoogleButtonProps) {
  function handleGoogle() {
    // Demo tanpa backend: sesi dummy dibuat, lalu halaman callback yang mengalihkan.
    import("@/lib/session").then(({ saveSession }) => {
      saveSession({
        name: "Finance NetBill",
        email: "finance@netbill.id",
        role: "finance",
      });
      window.location.href = "/auth/callback";
    });
  }

  return (
    <button
      type="button"
      onClick={handleGoogle}
      className="flex h-10 w-full items-center justify-center gap-2.5 rounded-xl border border-input bg-card px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span dangerouslySetInnerHTML={{ __html: svg }} aria-hidden />
      {label}
    </button>
  );
}
