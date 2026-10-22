import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Wifi, Eye, EyeOff, Loader2, LockKeyhole, UserRound, Mail, ArrowRight,
  ShieldCheck, ChevronDown, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { usePageTitle } from '../components/public/PublicLayout.jsx';
import { PLANS } from '../data/landing.js';
import { fmtIDR } from '../utils/format.js';
import { ThemeToggle } from '../components/public/ThemeToggle.jsx';

/** Opsi peran pendaftaran — label konsisten dengan prototype web/src/lib/session.ts */
const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'finance', label: 'Finance' },
  { value: 'kasir', label: 'Kasir/CS' },
  { value: 'teknisi', label: 'Teknisi/NOC' },
];

/**
 * Halaman daftar akun publik (/register) — porting dari prototype
 * web/src/app/(auth)/register/page.tsx ke konvensi client: react-router,
 * RegisterFields digabung inline, submit memanggil API /auth/register,
 * dan gaya visual konsisten dengan halaman Login.
 */
export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  usePageTitle('Daftar — NetBill');

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: 'owner' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Paket terpilih dari CTA harga landing (/register?plan=<id>) — opsional
  const selectedPlan = PLANS.find((p) => p.id === params.get('plan'));

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    // Validasi sama dengan prototype register page.tsx
    if (!form.name.trim()) return setError('Nama wajib diisi.');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Format email tidak valid.');
    if (form.password.length < 6) return setError('Password minimal 6 karakter.');
    if (form.password !== form.confirm) return setError('Konfirmasi password tidak sama.');

    setLoading(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password, form.role);
      toast('Akun berhasil dibuat! Silakan masuk.', 'success');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registrasi gagal, silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell min-h-screen overflow-hidden px-4 py-8 text-foreground sm:p-8">
      <div className="login-orb login-orb-one" aria-hidden="true" />
      <div className="login-orb login-orb-two" aria-hidden="true" />
      <div className="login-grid" aria-hidden="true" />
      <ThemeToggle className="absolute right-4 top-4 z-10 sm:right-8 sm:top-8" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center">
        <div className="w-full animate-[loginEnter_.6s_cubic-bezier(.21,1.02,.73,1)]">
          <header className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 shadow-[0_16px_40px_rgba(99,102,241,.4)]">
              <Wifi size={30} strokeWidth={2.4} />
            </div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[.3em] text-violet-300">Network management platform</p>
            <h1 className="text-3xl font-bold tracking-display sm:text-4xl">
              Buat akun Net<span className="text-violet-400">Bill</span>
            </h1>
            <p className="mt-2 text-sm text-muted">Gratis untuk 30 pelanggan pertama — tanpa kartu kredit.</p>
          </header>

          {selectedPlan && (
            <div className="mb-5 flex items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-[13px] font-medium text-violet-200">
              <Sparkles size={15} className="shrink-0 text-violet-300" />
              Paket dipilih: {selectedPlan.name} — {fmtIDR(selectedPlan.price)}/bln
            </div>
          )}

          <form
            onSubmit={submit}
            noValidate
            className="login-card rounded-3xl border p-5 backdrop-blur-xl sm:p-7"
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="mb-2 block text-xs font-semibold tracking-wide text-muted">Nama lengkap</label>
                <div className="relative">
                  <UserRound size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="name"
                    className="w-full rounded-xl border border-border bg-card/80 py-3 pl-11 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted hover:border-primary/50 focus:border-violet-400 focus:ring-4 focus:ring-indigo-500/20"
                    autoFocus
                    autoComplete="name"
                    placeholder="cth. Budi Santoso"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="mb-2 block text-xs font-semibold tracking-wide text-muted">Email</label>
                <div className="relative">
                  <Mail size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="email"
                    type="email"
                    className="w-full rounded-xl border border-border bg-card/80 py-3 pl-11 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted hover:border-primary/50 focus:border-violet-400 focus:ring-4 focus:ring-indigo-500/20"
                    autoComplete="email"
                    placeholder="nama@email.com"
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="password" className="mb-2 block text-xs font-semibold tracking-wide text-muted">Password</label>
                  <div className="relative">
                    <LockKeyhole size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="password"
                      className="w-full rounded-xl border border-border bg-card/80 py-3 pl-11 pr-12 text-sm text-foreground outline-none transition placeholder:text-muted hover:border-primary/50 focus:border-violet-400 focus:ring-4 focus:ring-indigo-500/20"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Minimal 6 karakter"
                      value={form.password}
                      onChange={(e) => update('password', e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 rounded-lg p-1.5 text-muted transition hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400"
                      aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm" className="mb-2 block text-xs font-semibold tracking-wide text-muted">Konfirmasi password</label>
                  <input
                    id="confirm"
                    type="password"
                    className="w-full rounded-xl border border-border bg-card/80 py-3 pl-11 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted hover:border-primary/50 focus:border-violet-400 focus:ring-4 focus:ring-indigo-500/20"
                    autoComplete="new-password"
                    placeholder="Ulangi password"
                    value={form.confirm}
                    onChange={(e) => update('confirm', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="role" className="mb-2 block text-xs font-semibold tracking-wide text-muted">Saya mendaftar sebagai</label>
                <div className="relative">
                  <select
                    id="role"
                    className="w-full appearance-none rounded-xl border border-border bg-card/80 px-4 py-3 pr-10 text-sm text-foreground outline-none transition hover:border-primary/50 focus:border-violet-400 focus:ring-4 focus:ring-indigo-500/20"
                    value={form.role}
                    onChange={(e) => update('role', e.target.value)}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-medium text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(99,102,241,.35)] transition hover:shadow-lg hover:shadow-indigo-500/40 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
              {loading ? 'Membuat akun…' : 'Buat Akun'}
            </button>

            <p className="mt-4 text-center text-[13px] leading-relaxed text-muted">
              Dengan mendaftar, Anda menyetujui Syarat Layanan dan Kebijakan Privasi NetBill.
            </p>

            <div className="mt-5 flex items-center justify-center gap-2 border-t border-border pt-5 text-sm text-muted">
              Sudah punya akun?
              <Link
                to="/login"
                className="font-semibold text-violet-400 transition hover:text-violet-300 hover:underline"
              >
                Masuk di sini
              </Link>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
              <ShieldCheck size={15} className="text-violet-400" />
              Data Anda tersimpan aman dan terenkripsi
            </div>
          </form>

          <p className="mt-6 text-center text-[13px] text-muted">
            <Link to="/" className="font-medium text-muted transition hover:text-violet-400 hover:underline">
              ← Kembali ke beranda
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}