import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('NetBill render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen items-center justify-center p-6">
          <section className="card w-full max-w-md p-6 text-center">
            <h1 className="text-lg font-bold">Halaman gagal dimuat</h1>
            <p className="mt-2 text-sm text-muted">Terjadi kesalahan saat memuat aplikasi. Muat ulang halaman untuk mencoba lagi.</p>
            <p className="mt-3 break-words rounded-lg bg-secondary px-3 py-2 font-mono text-xs text-muted">
              {this.state.error.message || 'Kesalahan aplikasi tidak diketahui.'}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button type="button" className="btn btn-outline" onClick={() => { window.location.href = '/login'; }}>Masuk</button>
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Muat Ulang</button>
            </div>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>
);
