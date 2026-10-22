import { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import api from '../api.js';
import { PageHeader, Card, Badge, Pagination, Empty } from '../components/ui.jsx';
import { fmtDateTime, roleLabel } from '../utils/format.js';

export default function ActivityLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [modules, setModules] = useState([]);
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('all');
  const [q, setQ] = useState('');
  const limit = 20;

  const load = useCallback(async () => {
    const { data } = await api.get('/activity', { params: { module, q, page, limit } });
    setRows(data.rows);
    setTotal(data.total);
    setModules(data.modules);
  }, [module, q, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="Log Aktivitas" subtitle="Audit trail seluruh aksi user — siapa, kapan, aksi apa (PRD 5.10)" />
      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className="input" value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
            <option value="all">Semua Modul</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cari user / deskripsi…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
      </Card>
      <Card bodyClass="!p-0">
        <div className="divide-y divide-slate-100 dark:divide-navy-700/50">
          {rows.map((a) => (
            <div key={a.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <Badge value="info" label={a.module} />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{a.description || a.action}</p>
                <p className="text-xs text-slate-400 font-mono">{a.action}</p>
              </div>
              <div className="text-right text-xs">
                <p className="font-medium">{a.user_name} <span className="text-slate-400">({roleLabel[a.role] || a.role})</span></p>
                <p className="text-slate-400">{fmtDateTime(a.created_at)} · {a.ip || '-'}</p>
              </div>
            </div>
          ))}
        </div>
        {rows.length === 0 && <Empty text="Belum ada aktivitas" />}
        <Pagination page={page} total={total} limit={limit} onPage={setPage} />
      </Card>
    </div>
  );
}
