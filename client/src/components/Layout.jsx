import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Package, FileText, Wallet, Activity, Router as RouterIcon,
  Wrench, BarChart3, ArrowLeftRight, Tags, UserCog, Server, ScrollText, Settings,
  PanelLeftClose, PanelLeftOpen, Bell, Search, Sun, Moon, LogOut, Wifi, MapPin,
  Menu, X, Landmark, ChevronDown, MessageCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import api from '../api.js';
import { Badge, Button, Empty } from './ui.jsx';
import { roleLabel, statusLabel, fmtDateTime } from '../utils/format.js';

const MENU = [
  {
    group: 'Menu Utama',
    icon: LayoutDashboard,
    direct: true,
    items: [
      { to: '/pelanggan', label: 'Pelanggan', icon: Users, menu: 'customers' },
      { to: '/area', label: 'Daftar Area', icon: MapPin, menu: 'customers' },
      { to: '/paket', label: 'Paket Internet', icon: Package, menu: 'packages' },
      { to: '/tagihan', label: 'Tagihan', icon: FileText, menu: 'invoices' },
      { to: '/pembayaran', label: 'Pembayaran', icon: Wallet, menu: 'payments' },
    ],
  },
  {
    group: 'Jaringan',
    icon: Activity,
    items: [
      { to: '/router', label: 'Server MikroTik', icon: Server, menu: 'routers' },
      { to: '/mapping', label: 'Mapping Jaringan', icon: MapPin, menu: 'mapping' },
      { to: '/monitoring', label: 'Monitoring PPPoE', icon: Activity, menu: 'monitoring' },
      { to: '/perangkat', label: 'Perangkat ONT', icon: RouterIcon, menu: 'devices' },
      { to: '/gangguan', label: 'Tiket Gangguan', icon: Wrench, menu: 'tickets' },
    ],
  },
  {
    group: 'Keuangan',
    icon: BarChart3,
    items: [
      { to: '/keuangan/pemasukan', label: 'Laporan Pemasukan', icon: BarChart3, menu: 'finance' },
      { to: '/keuangan/transaksi', label: 'Laporan Pengeluaran', icon: ArrowLeftRight, menu: 'transactions' },
      { to: '/keuangan/piutang', label: 'Piutang/Tunggakan', icon: BarChart3, menu: 'finance' },
      { to: '/keuangan/arus-kas', label: 'Arus Kas', icon: BarChart3, menu: 'finance' },
      { to: '/keuangan/laba-rugi', label: 'Laba Rugi', icon: BarChart3, menu: 'finance' },
      { to: '/keuangan/kategori', label: 'Kategori Transaksi', icon: Tags, menu: 'categories' },
      { to: '/bank', label: 'Master Bank', icon: Landmark, menu: 'banks' },
    ],
  },
  {
    group: 'Sistem',
    icon: Settings,
    items: [
      { to: '/pengguna', label: 'Pengguna', icon: UserCog, menu: 'users' },
      { to: '/log', label: 'Log Aktivitas', icon: ScrollText, menu: 'activity' },
      { to: '/kirim-pesan', label: 'Kirim Pesan', icon: MessageCircle, menu: 'settings' },
      { to: '/pengaturan', label: 'Pengaturan', icon: Settings, menu: 'settings' },
    ],
  },
];

/** Deteksi viewport ponsel (< md / 768px) — selaras breakpoint md Tailwind, untuk auto-hide sidebar */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen, isMobile }) {
  const { can, user } = useAuth();
  const canFinance = ['owner', 'finance'].includes(user?.role);
  const navigate = useNavigate();
  const location = useLocation();
  const activeGroup = MENU.find((section) => section.items.some((item) => item.to === location.pathname))?.group;
  const [openGroup, setOpenGroup] = useState(activeGroup);
  // Di ponsel drawer selalu tampil lebar penuh; label hanya disembunyikan saat collapsed di desktop
  const hideLabels = !isMobile && collapsed;

  useEffect(() => { setOpenGroup(activeGroup); }, [activeGroup]);

  // Navigasi + auto-hide drawer di ponsel setelah memilih menu
  const openMenu = (to) => {
    navigate(to);
    if (isMobile) setMobileOpen(false);
  };

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-sidebar/80 backdrop-blur-xl transition-all duration-200 ${
      isMobile
        ? `w-64 ${mobileOpen ? 'translate-x-0 shadow-soft' : '-translate-x-full'}`
        : collapsed ? 'w-[68px]' : 'w-64'
    }`}>
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 shadow-lg shadow-indigo-500/25">
          <Wifi size={18} className="text-white" />
        </div>
        {!hideLabels && (
          <div className="min-w-0">
            <p className="font-heading font-bold tracking-display leading-tight text-foreground">NetBill</p>
            <p className="mt-0.5 text-[10px] font-medium tracking-wide text-muted">RT/RW NET BILLING</p>
          </div>
        )}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-2 rounded-lg text-muted hover:text-foreground hover:bg-secondary"
            title="Tutup Menu"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {can('dashboard') && (
          <button
            type="button"
            onClick={() => openMenu('/')}
            className={`mb-3 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 ${
              location.pathname === '/'
                ? 'bg-gradient-to-r from-indigo-500/15 to-violet-500/10 font-semibold text-primary shadow-sm dark:from-indigo-400/20 dark:to-violet-400/15'
                : 'text-muted hover:bg-secondary hover:text-foreground'
            }`}
            title={hideLabels ? 'Dashboard' : undefined}
          >
            <LayoutDashboard size={17} className="shrink-0" />
            {!hideLabels && <span>Dashboard</span>}
          </button>
        )}
        {MENU.map((section) => {
          const items = section.items.filter((it) => can(it.menu) && (section.group !== 'Keuangan' || canFinance));
          if (!items.length) return null;
          if (section.direct) return items.map((it) => {
            const active = location.pathname === it.to;
            return (
              <button
                key={it.to}
                type="button"
                onClick={() => openMenu(it.to)}
                className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-accent-blue/40 ${
                  active
                    ? 'bg-gradient-to-r from-accent-blue/15 to-accent-purple/10 font-semibold text-accent-blue shadow-sm dark:from-accent-blue/25 dark:to-accent-purple/15'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-navy-700 dark:hover:text-slate-200'
                }`}
                title={hideLabels ? it.label : undefined}
              >
                <it.icon size={17} className="shrink-0" />
                {!hideLabels && <span className="truncate">{it.label}</span>}
              </button>
            );
          });
          const isOpen = !hideLabels && openGroup === section.group;
          const groupActive = items.some((it) => it.to === location.pathname);
          return (
            <div key={section.group} className={`mb-2 rounded-2xl transition-colors ${isOpen ? 'bg-slate-50/70 p-1.5 dark:bg-navy-900/40' : ''}`}>
              <button
                type="button"
                onClick={() => {
                  if (hideLabels) setCollapsed(false);
                  else setOpenGroup(isOpen ? null : section.group);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-accent-blue/40 ${
                  groupActive
                    ? 'bg-gradient-to-r from-accent-blue/15 to-accent-purple/10 font-semibold text-accent-blue shadow-sm dark:from-accent-blue/25 dark:to-accent-purple/15'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-navy-700 dark:hover:text-slate-200'
                }`}
                title={hideLabels ? section.group : undefined}
                aria-expanded={isOpen}
              >
                <section.icon size={17} className="shrink-0" />
                {!hideLabels && <>
                  <span className="truncate">{section.group}</span>
                  <ChevronDown size={15} className={`ml-auto shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                </>}
              </button>
              {isOpen && (
                <div className="relative ml-4 mt-1.5 space-y-1 border-l border-slate-200/80 py-1 pl-3 dark:border-navy-700">
                  {items.map((it) => {
                    const active = location.pathname === it.to;
                    return (
                      <button
                        key={it.to}
                        onClick={() => openMenu(it.to)}
                        className={`relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-accent-blue/40 ${
                          active
                            ? 'bg-white font-semibold text-accent-blue shadow-sm ring-1 ring-accent-blue/10 dark:bg-navy-800 dark:ring-accent-blue/20'
                            : 'text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm dark:text-slate-400 dark:hover:bg-navy-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {active && <span className="absolute -left-[13px] h-5 w-0.5 rounded-full bg-gradient-to-b from-accent-blue to-accent-purple" />}
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-accent-blue/10 text-accent-blue dark:bg-accent-blue/20' : 'bg-slate-100 text-slate-400 dark:bg-navy-700 dark:text-slate-400'}`}>
                          <it.icon size={13} />
                        </span>
                        <span className="truncate">{it.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <button
        onClick={() => (isMobile ? setMobileOpen(false) : setCollapsed(!collapsed))}
        className="m-3 mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-slate-400 outline-none transition hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-accent-blue/40 dark:hover:bg-navy-700 dark:hover:text-slate-200"
      >
        {isMobile
          ? <><PanelLeftClose size={17} /> <span>Tutup Sidebar</span></>
          : collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /> <span>Tutup Sidebar</span></>}
      </button>
    </aside>
  );
}

function Topbar({ collapsed, isMobile, onMenu }) {
  const { user, logout, can } = useAuth();
  const { theme, toggle } = useTheme();
  const { lastNotification } = useSocket();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [notifs, setNotifs] = useState({ rows: [], unread: 0 });
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const searchRef = useRef(null);
  const profileRef = useRef(null);

  const loadNotifs = async () => {
    try {
      const { data } = await api.get('/notifications/mine');
      setNotifs(data);
    } catch { /* abaikan */ }
  };

  useEffect(() => { loadNotifs(); }, []);
  useEffect(() => { if (lastNotification) loadNotifs(); }, [lastNotification]);

  useEffect(() => {
    if (!search) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/customers?q=${encodeURIComponent(search)}&limit=5`);
        setResults(data.rows);
        setShowResults(true);
      } catch { /* abaikan */ }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false);
      if (!e.target.closest?.('[data-notif]')) setShowNotif(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!showProfile) return undefined;
    const handler = (e) => { if (e.key === 'Escape') setShowProfile(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showProfile]);

  return (
    <header className={`fixed top-0 right-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-sidebar/80 px-4 backdrop-blur-xl transition-all ${isMobile ? 'left-0' : collapsed ? 'left-[68px]' : 'left-60'}`}>
      {/* Tombol buka drawer sidebar di ponsel (auto-hide) */}
      {isMobile && (
        <button
          onClick={onMenu}
          className="p-2 -ml-1 rounded-lg hover:bg-secondary text-muted hover:text-foreground shrink-0"
          title="Buka Menu"
        >
          <Menu size={20} />
        </button>
      )}
      {/* Cek Status Pelanggan (quick search — PRD 7) */}
      <div ref={searchRef} className="relative flex-1 min-w-0 max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9 py-1.5"
          placeholder="Cek Status Pelanggan… (nama / kode / PPPoE)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => results.length && setShowResults(true)}
        />
        {showResults && results.length > 0 && (
          <div className="absolute top-full mt-2 w-full card overflow-hidden z-50">
            {results.map((r) => (
              <button
                key={r.id}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-navy-700 text-left"
                onClick={() => { navigate(`/pelanggan/${r.id}`); setShowResults(false); setSearch(''); }}
              >
                <div>
                  <p className="font-medium">{r.name} <span className="text-xs text-slate-400">{r.code}</span></p>
                  <p className="text-xs text-slate-400">{r.package_name || 'Tanpa paket'} · {r.pppoe_username || '-'}</p>
                </div>
                <Badge value={r.status} label={statusLabel[r.status]} />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {/* Theme Toggle — pilihan tersimpan ke localStorage, default ikut sistem (PRD 4.5) */}
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
          className="p-2 rounded-lg text-muted transition hover:bg-secondary hover:text-foreground"
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        {/* Notifikasi pusat (PRD 5.10) */}
        <div className="relative" data-notif>
        <button
          className="relative p-2 rounded-lg hover:bg-secondary text-muted hover:text-foreground"
          onClick={() => { setShowNotif(!showNotif); if (!showNotif) loadNotifs(); }}
        >
          <Bell size={19} />
          {notifs.unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-red text-white text-[10px] font-bold flex items-center justify-center">
              {notifs.unread > 99 ? '99+' : notifs.unread}
            </span>
          )}
        </button>
        {showNotif && (
          <div className="absolute right-0 top-full mt-2 w-96 card overflow-hidden z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60 dark:border-navy-700">
              <p className="text-sm font-semibold">Notifikasi</p>
              <button
                className="text-xs text-accent-blue hover:underline"
                onClick={async () => { await api.post('/notifications/read-all'); loadNotifs(); }}
              >
                Tandai semua dibaca
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifs.rows.length === 0 && <Empty text="Tidak ada notifikasi" />}
              {notifs.rows.map((n) => (
                <div key={n.id} className={`border-b border-slate-100 px-4 py-3 dark:border-navy-700/50 ${!n.is_read ? 'bg-accent-blue/5 dark:bg-accent-blue/10' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      n.type === 'danger' ? 'bg-accent-red' : n.type === 'warning' ? 'bg-accent-yellow'
                      : n.type === 'success' ? 'bg-accent-green' : 'bg-accent-blue'
                    }`} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{fmtDateTime(n.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>

        {/* Widget profil + dropdown akun */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setShowProfile((open) => !open)}
            aria-expanded={showProfile}
            aria-haspopup="menu"
            className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 transition hover:border-accent-purple/40 hover:bg-white hover:shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/40 dark:border-navy-700 dark:bg-navy-800 dark:hover:border-accent-purple/60 dark:hover:bg-navy-700"
          >
            <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-purple/30 to-accent-blue/20 font-bold text-sm text-accent-purple ring-1 ring-accent-purple/20">
              {user?.name?.slice(0, 1)?.toUpperCase() || '?'}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-50 bg-accent-green dark:border-navy-800" />
            </span>
            <span className="hidden min-w-0 text-left md:block">
              <span className="block max-w-32 truncate text-sm font-semibold leading-tight">{user?.name}</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-accent-purple">{roleLabel[user?.role] || user?.role}</span>
            </span>
            <ChevronDown size={15} className={`hidden text-slate-400 transition-transform md:block ${showProfile ? 'rotate-180' : ''}`} />
          </button>

          {showProfile && (
            <div role="menu" aria-label="Menu akun" className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-xl shadow-navy-950/15 backdrop-blur-xl dark:border-navy-600/80 dark:bg-navy-800/95">
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-accent-purple/15 via-accent-blue/10 to-transparent p-3">
                <div className="absolute -right-5 -top-5 h-16 w-16 rounded-full border border-accent-purple/20" />
                <div className="relative flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-purple text-base font-bold text-white shadow-lg shadow-accent-purple/25">{user?.name?.slice(0, 1)?.toUpperCase() || '?'}</div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{user?.name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{user?.username || 'akun'}</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-accent-green"><span className="h-1.5 w-1.5 rounded-full bg-accent-green" /> Sesi aktif · {roleLabel[user?.role] || user?.role}</span>
                  </div>
                </div>
              </div>

              <div className="my-2 h-px bg-slate-200/80 dark:bg-navy-700" />
              {can('settings') && (
                <button type="button" role="menuitem" onClick={() => { navigate('/pengaturan'); setShowProfile(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-accent-blue/10 hover:text-accent-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40">
                  <span className="rounded-lg bg-accent-blue/10 p-1.5 text-accent-blue"><Settings size={16} /></span>
                  Pengaturan sistem
                </button>
              )}
              <button type="button" role="menuitem" onClick={toggle} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 dark:hover:bg-navy-700">
                <span className="rounded-lg bg-accent-yellow/10 p-1.5 text-accent-yellow">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</span>
                {theme === 'dark' ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
              </button>
              <div className="my-2 h-px bg-slate-200/80 dark:bg-navy-700" />
              <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-accent-red transition hover:bg-accent-red/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/40">
                <span className="rounded-lg bg-accent-red/10 p-1.5"><LogOut size={16} /></span>
                Keluar dari akun
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  // Auto-hide: tutup drawer saat berpindah halaman di ponsel
  useEffect(() => { if (isMobile) setMobileOpen(false); }, [location.pathname, isMobile]);

  // Auto-hide: tutup drawer dengan tombol Escape
  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const handler = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobile, mobileOpen]);

  // Kunci scroll body saat drawer terbuka di ponsel
  useEffect(() => {
    document.body.style.overflow = isMobile && mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, mobileOpen]);

  return (
    <div className="min-h-screen">
      {/* Overlay drawer sidebar di ponsel — klik untuk menutup */}
      {isMobile && (
        <div
          className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-200 ${mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} isMobile={isMobile} />
      <Topbar collapsed={collapsed} isMobile={isMobile} onMenu={() => setMobileOpen(true)} />
      <main className={`pt-20 pb-8 px-4 md:px-6 transition-all ${isMobile ? 'ml-0' : collapsed ? 'ml-[68px]' : 'ml-60'}`}>
        <Outlet />
      </main>
    </div>
  );
}


