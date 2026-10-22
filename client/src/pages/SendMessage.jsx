import { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Send } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Card, PageHeader } from '../components/ui.jsx';

function templateName(template) {
  return template?.name || template?.template_name || template?.id || '';
}

export default function SendMessage() {
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ to: '', template_name: '', components: '[]' });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/messages/templates');
      const nextTemplates = Array.isArray(data.templates) ? data.templates : [];
      setTemplates(nextTemplates);
      setForm((old) => ({ ...old, template_name: old.template_name || templateName(nextTemplates[0]) }));
    } catch (err) {
      toast(err.response?.data?.message || err.message || 'Gagal memuat template', 'danger');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const send = async (e) => {
    e.preventDefault();
    let components;
    try { components = JSON.parse(form.components); } catch { toast('Components harus JSON array valid', 'danger'); return; }
    if (!Array.isArray(components)) { toast('Components harus JSON array valid', 'danger'); return; }
    if (!(await confirm({ title: 'Kirim Pesan Template', message: `Template ${form.template_name} akan dikirim ke ${form.to}.`, confirmText: 'Ya, Kirim', tone: 'warning', icon: Send }))) return;
    setSending(true);
    try {
      const { data } = await api.post('/messages/template', { to: form.to, template_name: form.template_name, components });
      toast(data.message || 'Pesan template dikirim', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal mengirim pesan', 'danger');
    } finally { setSending(false); }
  };

  return (
    <div>
      <PageHeader title="Kirim Pesan" subtitle="Kirim template WhatsApp approved melalui MiberConnect" actions={<Button variant="outline" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Muat ulang template</Button>} />
      <Card title="Pesan Template MiberConnect" className="max-w-3xl">
        <form onSubmit={send} className="space-y-4">
          <div>
            <label className="label">Nomor WhatsApp *</label>
            <input className="input" type="tel" inputMode="numeric" placeholder="0812-3456-7890 atau 628123456789" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} required disabled={!can('settings', 'edit')} />
          </div>
          <div>
            <label className="label">Template approved *</label>
            <select className="input" value={form.template_name} onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))} required disabled={loading || !can('settings', 'edit')}>
              {!templates.length && <option value="">{loading ? 'Memuat template…' : 'Tidak ada template tersedia'}</option>}
              {templates.map((template, index) => { const name = templateName(template); return <option key={`${name}-${index}`} value={name}>{name}{template.language ? ` (${template.language})` : ''}</option>; })}
            </select>
          </div>
          <div>
            <label className="label">Components JSON</label>
            <textarea className="input min-h-32 font-mono text-xs" value={form.components} onChange={(e) => setForm((f) => ({ ...f, components: e.target.value }))} disabled={!can('settings', 'edit')} spellCheck="false" />
            <p className="mt-1 text-xs text-slate-400">Gunakan <code>[]</code> bila template tanpa parameter. Format components mengikuti definisi template Meta.</p>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-accent-blue/20 bg-accent-blue/5 p-3 text-xs text-slate-600 dark:text-slate-300"><MessageCircle size={16} className="mt-0.5 shrink-0 text-accent-blue" /><p>Hanya template approved dapat memulai percakapan. Account ID, API key, dan bahasa memakai konfigurasi server.</p></div>
          {can('settings', 'edit') && <div className="flex justify-end"><Button type="submit" disabled={sending || loading || !form.template_name}><Send size={15} /> {sending ? 'Mengirim…' : 'Kirim Pesan'}</Button></div>}
        </form>
      </Card>
    </div>
  );
}