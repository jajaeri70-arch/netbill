/**
 * Sesi demo sisi klien (tanpa backend).
 * Data disimpan di localStorage agar role-based navigation dapat didemonstrasikan.
 * Saat backend siap, ganti implementasi ini dengan panggilan API yang sebenarnya.
 */

export type Role = "owner" | "finance" | "kasir" | "teknisi" | "pelanggan";

export interface Session {
  name: string;
  email: string;
  role: Role;
}

const STORAGE_KEY = "netbill_session";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  finance: "Finance",
  kasir: "Kasir/CS",
  teknisi: "Teknisi/NOC",
  pelanggan: "Pelanggan",
};

export function saveSession(session: Session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* abaikan bila storage tidak tersedia */
  }
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.email || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("netbill_token");
  } catch {
    /* abaikan */
  }
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
