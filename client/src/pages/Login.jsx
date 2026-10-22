import { useState } from 'react';
import { Wifi, Eye, EyeOff, Loader2, LockKeyhole, UserRound, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ThemeToggle } from '../components/public/ThemeToggle.jsx';

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username.trim(), password);
      toast('Selamat datang kembali!', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Login gagal', 'danger');
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

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <div className="w-full animate-[loginEnter_.6s_cubic-bezier(.21,1.02,.73,1)]">
          <header className="mb-8 text-center sm:mb-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 shadow-[0_16px_40px_rgba(99,102,241,.4)]">
              <Wifi size={30} strokeWidth={2.4} />
            </div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[.3em] text-violet-300">Network management platform</p>
            <h1 className="text-4xl font-bold tracking-display">Net<span className="text-violet-400">Bill</span></h1>
            <p className="mt-2 text-sm text-muted">Billing dan manajemen jaringan terintegrasi.</p>
          </header>

          <form onSubmit={submit} className="login-card rounded-3xl border p-5 backdrop-blur-xl sm:p-7">
            <div className="mb-7">
              <h2 className="text-xl font-semibold tracking-tight">Selamat datang</h2>
              <p className="mt-1.5 text-sm text-muted">Masuk untuk mengelola operasional jaringan.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="mb-2 block text-xs font-semibold tracking-wide text-muted">Username atau email</label>
                <div className="relative">
                  <UserRound size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="username"
                    className="w-full rounded-xl border border-border bg-card/80 py-3 pl-11 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted hover:border-primary/50 focus:border-violet-400 focus:ring-4 focus:ring-indigo-500/20"
                    autoFocus
                    autoComplete="username"
                    placeholder="Masukkan username atau email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-xs font-semibold tracking-wide text-muted">Password</label>
                <div className="relative">
                  <LockKeyhole size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="password"
                    className="w-full rounded-xl border border-border bg-card/80 py-3 pl-11 pr-12 text-sm text-foreground outline-none transition placeholder:text-muted hover:border-primary/50 focus:border-violet-400 focus:ring-4 focus:ring-indigo-500/20"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 rounded-lg p-1.5 text-muted transition hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400"
                    aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(99,102,241,.35)] transition hover:shadow-lg hover:shadow-indigo-500/40 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
              {loading ? 'Memverifikasi...' : 'Masuk ke dashboard'}
            </button>

            <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-5 text-xs text-muted">
              <ShieldCheck size={15} className="text-violet-400" />
              Koneksi aman dan terenkripsi
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
