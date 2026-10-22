import { useEffect, useState, useCallback } from 'react';
import { Copy, Eye, EyeOff, RefreshCw, Save } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, Button } from '../components/ui.jsx';

const GROUPS = [
  { title: 'Perusahaan', keys: ['company_name', 'company_address', 'company_phone', 'invoice_footer'],
    labels: { company_name: 'Nama Perusahaan', company_address: 'Alamat', company_phone: 'Telepon', invoice_footer: 'Catatan Kaki Invoice' } },
  { title: 'Server GenieACS (TR-069)', keys: ['genieacs_enabled', 'genieacs_host', 'genieacs_port', 'genieacs_user', 'genieacs_pass'],
    labels: { genieacs_enabled: 'Aktifkan Integrasi GenieACS', genieacs_host: 'IP Server GenieACS', genieacs_port: 'Port GenieACS', genieacs_user: 'Username', genieacs_pass: 'Password' },
    hints: { genieacs_host: 'Contoh: 192.168.1.10 atau hostname server GenieACS', genieacs_port: 'Port NBI GenieACS, umumnya 7557' } },
];

const GENIEACS_KEYS = ['genieacs_enabled', 'genieacs_host', 'genieacs_port', 'genieacs_user', 'genieacs_pass'];
const GENERAL_KEYS = ['company_name', 'company_address', 'company_phone', 'invoice_footer'];
const WHATSAPP_KEYS = ['wa_gateway', 'wa_token', 'wa_domain'];

const MOBILE_API_KEY_STORAGE = 'netbill_mobile_api_key';

const TEMPLATES = [
  { key: 'template_invoice', label: 'Tagihan Baru', hint: '{nama}, {periode}, {tagihan}, {jatuh_tempo}, {perusahaan}' },
  { key: 'template_h7', label: 'Reminder H-7', hint: 'sama seperti di atas' },
  { key: 'template_h3', label: 'Reminder H-3', hint: '{nama}, {periode}, {tagihan}, {jatuh_tempo}, {perusahaan}' },
  { key: 'template_h1', label: 'Reminder H-1', hint: 'sama seperti di atas' },
  { key: 'template_due', label: 'Reminder Hari-H', hint: 'sama seperti di atas' },
  { key: 'template_overdue', label: 'Reminder Jatuh Tempo', hint: 'sama seperti di atas' },
  { key: 'template_paid', label: 'Konfirmasi Pembayaran', hint: '{nama}, {perusahaan}' },
];

export default function Settings() {
  const { can } = useAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingGenieacs, setSavingGenieacs] = useState(false);
  const [showGenieacsPass, setShowGenieacsPass] = useState(false);
  const [mobileKey, setMobileKey] = useState({ configured: false });
  const [newApiKey, setNewApiKey] = useState(() => localStorage.getItem(MOBILE_API_KEY_STORAGE) || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [rotatingApiKey, setRotatingApiKey] = useState(false);
  const [miber, setMiber] = useState(null);
  const [savingMiber, setSavingMiber] = useState(false);
  const [testingMiber, setTestingMiber] = useState(false);
  const mobileEndpoint = `${window.location.origin}/api/mobile/v1`;

  const load = useCallback(async () => {
    const [{ data: settingsData }, { data: mobileKeyData }, { data: miberData }] = await Promise.all([
      api.get('/settings'),
      api.get('/settings/mobile-api-key'),
      api.get('/settings/miber'),
    ]);
    setSettings(settingsData.settings);
    setMobileKey(mobileKeyData);
    setMiber(miberData);
  }, []);
  useEffect(() => { load().catch((err) => toast(err.response?.data?.message || 'Gagal memuat pengaturan', 'danger')); }, [load, toast]);

  const set = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value;
    setSettings((s) => ({ ...s, [k]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = Object.fromEntries([...GENERAL_KEYS, ...WHATSAPP_KEYS, ...TEMPLATES.map((t) => t.key)].map((key) => [key, settings[key] ?? '']));
      await api.put('/settings', payload);
      toast('Pengaturan tersimpan', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const saveGenieacs = async () => {
    setSavingGenieacs(true);
    try {
      await api.put('/settings', Object.fromEntries(GENIEACS_KEYS.map((key) => [key, settings[key] ?? ''])));
      toast('Pengaturan GenieACS tersimpan', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan pengaturan GenieACS', 'danger');
    } finally {
      setSavingGenieacs(false);
    }
  };

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} disalin`, 'success');
    } catch {
      toast(`Gagal menyalin ${label.toLowerCase()}`, 'danger');
    }
  };

  const rotateApiKey = async () => {
    if (!(await confirm({
      title: mobileKey.configured ? 'Refresh API Key' : 'Buat API Key',
      message: mobileKey.configured
        ? 'API key baru langsung aktif. API key lama tetap aktif selama 24 jam agar aplikasi dapat diperbarui tanpa putus layanan.'
        : 'API key hanya ditampilkan satu kali. Salin dan simpan ke konfigurasi aplikasi mobile.',
      confirmText: mobileKey.configured ? 'Ya, Refresh' : 'Ya, Buat Key',
      tone: 'warning',
      icon: RefreshCw,
    }))) return;
    setRotatingApiKey(true);
    try {
      const { data } = await api.post('/settings/mobile-api-key/rotate', { grace_hours: 24 });
      setNewApiKey(data.api_key);
      localStorage.setItem(MOBILE_API_KEY_STORAGE, data.api_key);
      setShowApiKey(true);
      setMobileKey((current) => ({ ...current, configured: true, current_hint: data.hint }));
      toast('API key baru dibuat. Salin sekarang.', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal refresh API key', 'danger');
    } finally {
      setRotatingApiKey(false);
    }
  };

  const testMiber = async () => {
    setTestingMiber(true);
    try {
      const { data } = await api.post('/settings/miber/test');
      toast(data.message, 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Tes koneksi MiberConnect gagal', 'danger');
    } finally {
      setTestingMiber(false);
    }
  };

  const setMiberField = (key) => (e) => setMiber((current) => ({ ...current, [key]: e.target.value }));

  const saveMiber = async () => {
    setSavingMiber(true);
    try {
      const { data } = await api.put('/settings/miber', {
        base_url: miber?.base_url || '',
        api_key: miber?.api_key || '',
        whatsapp_account_id: miber?.whatsapp_account_id || '',
        language_code: miber?.language_code || 'id',
      });
      setMiber(data);
      toast('Konfigurasi MiberConnect tersimpan', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menyimpan konfigurasi MiberConnect', 'danger');
    } finally {
      setSavingMiber(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Pengaturan Sistem"
        subtitle="Konfigurasi umum, integrasi & template notifikasi (PRD 5.10)"
        actions={can('settings', 'edit') && (
          <Button variant="green" onClick={save} disabled={saving}><Save size={15} /> {saving ? 'Menyimpan…' : 'Simpan Semua'}</Button>
        )}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {GROUPS.map((g) => (
          <Card key={g.title} title={g.title} right={g.title === 'Server GenieACS (TR-069)' && can('settings', 'edit') && (
            <Button size="sm" variant="green" onClick={saveGenieacs} disabled={savingGenieacs}>
              <Save size={13} /> {savingGenieacs ? 'Menyimpan…' : 'Simpan GenieACS'}
            </Button>
          )}>
            <div className="space-y-4">
              {g.keys.map((k) => {
                const isBool = k === 'genieacs_enabled';
                const isPass = k === 'genieacs_pass';
                return (
                  <div key={k}>
                    <label className="label">{g.labels[k]}</label>
                    {isBool ? (
                      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-navy-600 dark:bg-navy-700/50 dark:text-slate-200 dark:hover:border-slate-400">
                        <span>{String(settings[k]) === '1' ? 'Integrasi aktif' : 'Integrasi nonaktif'}</span>
                        <input type="checkbox"
                          checked={String(settings[k]) === '1'} onChange={set(k)} disabled={!can('settings', 'edit')} />
                      </label>
                    ) : isPass ? (
                      <div className="relative">
                        <input
                          className="input pr-10" type={showGenieacsPass ? 'text' : 'password'}
                          value={settings[k] || ''} onChange={set(k)} disabled={!can('settings', 'edit')}
                        />
                        <button
                          type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          onClick={() => setShowGenieacsPass((visible) => !visible)}
                          title={showGenieacsPass ? 'Sembunyikan password' : 'Tampilkan password'}
                          aria-label={showGenieacsPass ? 'Sembunyikan password' : 'Tampilkan password'}
                        >
                          {showGenieacsPass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    ) : (
                      <input
                        className="input" type={k === 'genieacs_port' ? 'number' : 'text'}
                        value={settings[k] || ''} onChange={set(k)} disabled={!can('settings', 'edit')}
                      />
                    )}
                    {g.hints?.[k] && <p className="text-xs text-slate-400 mt-1">{g.hints[k]}</p>}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      <Card
        title="Akses API Mobile"
        className="mt-5"
        right={can('settings', 'edit') && (
          <Button size="sm" variant="warning" onClick={rotateApiKey} disabled={rotatingApiKey}>
            <RefreshCw size={13} className={rotatingApiKey ? 'animate-spin' : ''} />
            {rotatingApiKey ? 'Memproses…' : (mobileKey.configured ? 'Refresh API Key' : 'Buat API Key')}
          </Button>
        )}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="label">Endpoint URL</label>
            <div className="flex gap-2">
              <input className="input font-mono text-sm" value={mobileEndpoint} readOnly />
              <Button type="button" variant="outline" onClick={() => copy(mobileEndpoint, 'Endpoint URL')} title="Salin endpoint URL" aria-label="Salin endpoint URL">
                <Copy size={15} />
              </Button>
            </div>
          </div>
          <div>
            <label className="label">API Key</label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  className="input pr-10 font-mono text-sm"
                  type={showApiKey ? 'text' : 'password'}
                  value={newApiKey || mobileKey.current_hint || 'Belum dibuat'}
                  readOnly
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowApiKey((visible) => !visible)}
                  title={showApiKey ? 'Sembunyikan API key' : 'Tampilkan API key'}
                  aria-label={showApiKey ? 'Sembunyikan API key' : 'Tampilkan API key'}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <Button type="button" variant="outline" onClick={() => copy(newApiKey, 'API key')} disabled={!newApiKey} title="Salin API key" aria-label="Salin API key">
                <Copy size={15} />
              </Button>
            </div>
          </div>
        </div>
        <p className={`mt-3 text-xs ${newApiKey ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
          {newApiKey
            ? 'API key tersimpan di browser ini. Salin kapan saja; refresh API key untuk mengganti key.'
            : mobileKey.configured
              ? 'API key aktif. Demi keamanan, sistem hanya menampilkan petunjuk key; refresh untuk membuat key baru.'
              : 'API key belum dibuat. Klik Buat API Key untuk mengaktifkan akses aplikasi mobile.'}
        </p>
      </Card>

      <Card title="Template Notifikasi WhatsApp" className="mt-5">
        <div className="space-y-4">
          {TEMPLATES.map((t) => (
            <div key={t.key}>
              <label className="label">{t.label} <span className="text-slate-400 normal-case">— variabel: {t.hint}</span></label>
              <textarea className="input" rows={2} value={settings[t.key] || ''} onChange={set(t.key)} disabled={!can('settings', 'edit')} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="WhatsApp Gateway" className="mt-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label">Provider</label>
            <select className="input" value={settings.wa_gateway || 'log'} onChange={set('wa_gateway')} disabled={!can('settings', 'edit')}>
              <option value="log">Log (mode uji)</option>
              <option value="fonnte">Fonnte</option>
              <option value="wablas">Wablas</option>
              <option value="miber">MiberConnect (template)</option>
            </select>
          </div>
          <div>
            <label className="label">API Token</label>
            <input className="input" type="password" autoComplete="new-password" value={settings.wa_token || ''} onChange={set('wa_token')} disabled={!can('settings', 'edit')} />
          </div>
          <div>
            <label className="label">Domain Wablas</label>
            <input className="input" placeholder="example.wablas.com" value={settings.wa_domain || ''} onChange={set('wa_domain')} disabled={!can('settings', 'edit')} />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">Tagihan baru dikirim otomatis setelah dibuat. Reminder dikirim H-7/H-3/H-1/hari-H dan overdue pukul 08:00. Miber memakai template approved; API key, account ID, template disimpan hanya di environment server.</p>
      </Card>

      <Card
        title="Integrasi MiberConnect"
        className="mt-5"
        right={can('settings', 'edit') && <div className="flex gap-2">
          <Button size="sm" variant="green" onClick={saveMiber} disabled={savingMiber}>
            <Save size={13} /> {savingMiber ? 'Menyimpan…' : 'Simpan Miber'}
          </Button>
          <Button size="sm" variant="outline" onClick={testMiber} disabled={testingMiber || !miber?.api_key_configured || !miber?.whatsapp_account_id}>
            <RefreshCw size={13} className={testingMiber ? 'animate-spin' : ''} /> {testingMiber ? 'Menguji…' : 'Test Koneksi'}
          </Button>
        </div>}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="label">Base URL API META</label>
            <input className="input font-mono text-sm" type="url" placeholder="https://meta.miber.id/api/v1/external" value={miber?.base_url || ''} onChange={setMiberField('base_url')} disabled={!can('settings', 'edit')} />
            <p className="mt-1 text-xs text-slate-400">Harus URL HTTP atau HTTPS. Nilai tersimpan langsung di Pengaturan.</p>
          </div>
          <div>
            <label className="label">API Key</label>
            <input className="input font-mono text-sm" type="password" autoComplete="new-password" placeholder={miber?.api_key_hint || 'Masukkan API key'} value={miber?.api_key || ''} onChange={setMiberField('api_key')} disabled={!can('settings', 'edit')} />
            <p className="mt-1 text-xs text-slate-400">Kosongkan untuk mempertahankan API key tersimpan. API key dienkripsi dan tidak pernah ditampilkan ulang.</p>
          </div>
          <div>
            <label className="label">WhatsApp Account ID (WABA)</label>
            <input className="input font-mono text-sm" placeholder="UUID WhatsApp Account" value={miber?.whatsapp_account_id || ''} onChange={setMiberField('whatsapp_account_id')} disabled={!can('settings', 'edit')} />
          </div>
          <div>
            <label className="label">Bahasa Template</label>
            <input className="input" placeholder="id" value={miber?.language_code || ''} onChange={setMiberField('language_code')} disabled={!can('settings', 'edit')} />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-navy-700 dark:bg-navy-800">
          <p className="font-medium text-slate-700 dark:text-slate-200">Pemetaan Template</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {miber?.configured_templates?.length
              ? `${miber.configured_templates.length}/7 template aktif: ${miber.configured_templates.join(', ')}`
              : 'Belum ada template Miber yang dikonfigurasi.'}
            {miber?.invalid_components?.length ? ` Components JSON tidak valid: ${miber.invalid_components.join(', ')}.` : ''}
          </p>
        </div>
        <p className="mt-3 text-xs text-slate-400">Simpan Base URL, API key, Account ID, dan bahasa di sini. Nama template dan components JSON tetap di <code>/www/wwwroot/billing/server/.env</code>. Test koneksi memanggil daftar akun, tidak mengirim WhatsApp.</p>
      </Card>
    </div>
  );
}
