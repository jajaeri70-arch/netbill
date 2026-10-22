import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import CustomerPortal from './pages/CustomerPortal.jsx';
import Register from './pages/Register.jsx';
import PublicLayout from './components/public/PublicLayout.jsx';
import Landing from './pages/Landing.jsx';
import LandingPackages from './pages/LandingPackages.jsx';
import LandingAbout from './pages/LandingAbout.jsx';
import LandingContact from './pages/LandingContact.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Areas from './pages/Areas.jsx';
import Packages from './pages/Packages.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoicePrint from './pages/InvoicePrint.jsx';
import InvoiceAdjustments from './pages/InvoiceAdjustments.jsx';
import Payments from './pages/Payments.jsx';
import PaymentTransaction from './pages/PaymentTransaction.jsx';
import ReceiptPrint from './pages/ReceiptPrint.jsx';
import Monitoring from './pages/Monitoring.jsx';
import Devices from './pages/Devices.jsx';
import Mapping from './pages/Mapping.jsx';
import Tickets from './pages/Tickets.jsx';
import { IncomeReport, AgingReport, CashFlow, ProfitLoss } from './pages/Reports.jsx';
import Transactions from './pages/Transactions.jsx';
import Categories from './pages/Categories.jsx';
import Banks from './pages/Banks.jsx';
import Users from './pages/Users.jsx';
import Routers from './pages/Routers.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import Settings from './pages/Settings.jsx';
import SendMessage from './pages/SendMessage.jsx';

/** Guard menu berdasarkan izin RBAC */
function Guard({ menu, action = 'view', children }) {
  const { can } = useAuth();
  if (!can(menu, action)) {
    return (
      <div className="card p-10 text-center">
        <h2 className="text-lg font-bold text-accent-red">Akses Ditolak</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Role Anda tidak memiliki izin mengakses menu ini.
        </p>
      </div>
    );
  }
  return children;
}

function FinanceGuard({ children }) {
  const { user } = useAuth();
  if (!['owner', 'finance'].includes(user?.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AppRoutes() {
  const { token, user, loading } = useAuth();
  if (loading) return <Spinner full />;

  // Pengunjung publik (belum login): landing page + halaman informasi, aplikasi di /login.
  // Tree route publik & aplikasi tidak pernah aktif bersamaan sehingga
  // path publik (/paket, dst.) tidak bentrok dengan menu aplikasi.
  if (!token || !user) {
    return (
      <Routes>
        <Route path="/portal/*" element={<CustomerPortal />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/paket" element={<LandingPackages />} />
          <Route path="/tentang" element={<LandingAbout />} />
          <Route path="/kontak" element={<LandingContact />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/portal/*" element={<CustomerPortal />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Guard menu="dashboard"><Dashboard /></Guard>} />
        <Route path="pelanggan" element={<Guard menu="customers"><Customers /></Guard>} />
        <Route path="pelanggan/:id" element={<Guard menu="customers"><CustomerDetail /></Guard>} />
        <Route path="area" element={<Guard menu="customers"><Areas /></Guard>} />
        <Route path="paket" element={<Guard menu="packages"><Packages /></Guard>} />
        <Route path="tagihan" element={<Guard menu="invoices"><Invoices /></Guard>} />
        <Route path="tagihan/:id/cetak" element={<Guard menu="invoices"><InvoicePrint /></Guard>} />
        <Route path="tagihan/:id/penyesuaian" element={<Guard menu="invoices" action="edit"><InvoiceAdjustments /></Guard>} />
        <Route path="pembayaran" element={<FinanceGuard><Guard menu="payments"><Payments /></Guard></FinanceGuard>} />
        <Route path="pembayaran/transaksi" element={<FinanceGuard><Guard menu="payments"><PaymentTransaction /></Guard></FinanceGuard>} />
        <Route path="pembayaran/kwitansi/:id" element={<FinanceGuard><Guard menu="payments"><ReceiptPrint /></Guard></FinanceGuard>} />
        <Route path="monitoring" element={<Guard menu="monitoring"><Monitoring /></Guard>} />
        <Route path="perangkat" element={<Guard menu="devices"><Devices /></Guard>} />
        <Route path="mapping" element={<Guard menu="mapping"><Mapping /></Guard>} />
        <Route path="gangguan" element={<Guard menu="tickets"><Tickets /></Guard>} />
        <Route path="keuangan/pemasukan" element={<FinanceGuard><Guard menu="finance"><IncomeReport /></Guard></FinanceGuard>} />
        <Route path="keuangan/piutang" element={<FinanceGuard><Guard menu="finance"><AgingReport /></Guard></FinanceGuard>} />
        <Route path="keuangan/arus-kas" element={<FinanceGuard><Guard menu="finance"><CashFlow /></Guard></FinanceGuard>} />
        <Route path="keuangan/laba-rugi" element={<FinanceGuard><Guard menu="finance"><ProfitLoss /></Guard></FinanceGuard>} />
        <Route path="keuangan/transaksi" element={<FinanceGuard><Guard menu="transactions"><Transactions /></Guard></FinanceGuard>} />
        <Route path="keuangan/kategori" element={<FinanceGuard><Guard menu="categories"><Categories /></Guard></FinanceGuard>} />
        <Route path="bank" element={<FinanceGuard><Guard menu="banks"><Banks /></Guard></FinanceGuard>} />
        <Route path="pengguna" element={<Guard menu="users"><Users /></Guard>} />
        <Route path="router" element={<Guard menu="routers"><Routers /></Guard>} />
        <Route path="log" element={<Guard menu="activity"><ActivityLog /></Guard>} />
        <Route path="pengaturan" element={<Guard menu="settings"><Settings /></Guard>} />
        <Route path="kirim-pesan" element={<Guard menu="settings"><SendMessage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function AppContent() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <ConfirmProvider>
          <SocketProvider>
            <AppRoutes />
          </SocketProvider>
          </ConfirmProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}
