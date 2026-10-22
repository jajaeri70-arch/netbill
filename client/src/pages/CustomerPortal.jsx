import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wifi, Phone, Loader2 } from 'lucide-react';
import { ThemeToggle } from '../components/public/ThemeToggle.jsx';

async function request(path, body) {
  const response = await fetch(`/api/portal/${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json', 'X-Portal-CSRF': '1' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.message || 'Permintaan gagal'); error.status = response.status; throw error; }
  return data;
}

export default function CustomerPortal() {
  const [customer, setCustomer] = useState(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    request('me').then(data => { if (active) setCustomer(data.customer); })
      .catch(err => { if (active && err.status !== 401) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('');
    try { const data = await request('login', { phone }); setCustomer(data.customer); setPhone(''); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  async function logout() {
    setLoading(true); setError('');
    try { await request('logout', {}); setCustomer(null); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  return (
    <main className="login-shell min-h-screen px-4 py-12 text-foreground">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-md flex-col justify-center">
        <header className="mb-8 text-center">
          <Wifi className="mx-auto mb-4 text-violet-400" size={42} />
          <h1 className="text-3xl font-bold">Portal Pelanggan</h1>
          <p className="mt-2 text-sm text-muted">NetBill • Layanan internet Anda</p>
        </header>
        <section className="login-card rounded-3xl border p-7 backdrop-blur-xl" aria-busy={loading}>
          {error && <p role="alert" className="mb-5 rounded-xl bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
          {customer ? <>
            <h2 className="text-2xl font-semibold break-words">Selamat datang, {customer.name}</h2>
            <p className="mt-3 text-muted">{customer.phone}</p>
            <p className="mt-5 text-sm text-muted">Anda masuk sebagai pemilik nomor HP yang terdaftar. Sesi berlaku selama 24 jam.</p>
            <button onClick={logout} disabled={loading} className="mt-6 w-full rounded-xl bg-violet-600 py-3 font-semibold text-white disabled:opacity-50">Keluar</button>
          </> : <form onSubmit={submit}>
            <h2 className="text-xl font-semibold">Masuk dengan nomor HP</h2>
            <p className="mb-6 mt-2 text-sm text-muted">Gunakan nomor yang terdaftar pada layanan Anda.</p>
            <label htmlFor="portal-phone" className="mb-2 block text-sm font-semibold">Nomor HP</label>
            <div className="relative">
              <Phone size={18} className="absolute left-3 top-3.5 text-muted" />
              <input id="portal-phone" type="tel" autoComplete="tel" inputMode="tel" required maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} placeholder="08xxxxxxxxxx" disabled={loading} className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-3 text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <p className="mt-2 text-xs text-muted">Format: 08xx, 628xx, atau +628xx.</p>
            <button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 font-semibold text-white disabled:opacity-50">{loading && <Loader2 size={18} className="animate-spin" />}Masuk</button>
            <p className="mt-4 text-xs text-muted">Login saat ini tanpa OTP. Jangan gunakan perangkat bersama tanpa keluar setelah selesai.</p>
          </form>}
        </section>
        <Link to="/" className="mt-6 text-center text-sm text-muted hover:text-violet-400">Kembali ke beranda</Link>
      </div>
    </main>
  );
}