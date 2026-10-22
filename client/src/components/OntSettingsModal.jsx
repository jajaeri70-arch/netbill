import { useEffect, useState } from 'react';
import { Plus, Wifi, Router, Network, EthernetPort, Trash2 } from 'lucide-react';
import api from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { Button, Modal } from './ui.jsx';
import WifiModal from './WifiModal.jsx';
import { DeviceDetailContent } from './DeviceDetailModal.jsx';

export default function OntSettingsModal({ device, onClose, onSaved }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [form, setForm] = useState({ name: 'Internet_PPPoE', username: '', password: '', vlanEnabled: false, vlan: '' });
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editWan, setEditWan] = useState(null);
  const [wifiOpen, setWifiOpen] = useState(false);
  const [interfaces, setInterfaces] = useState([]);
  const [bindings, setBindings] = useState([]);

  useEffect(() => {
    let active = true;
    setCreateOpen(false);
    setEditWan(null);
    setInterfaces([]);
    setBindings([]);
    if (device?.id) api.get(`/devices/${device.id}/detail`).then(({ data }) => {
      if (active) setInterfaces((data?.detail?.interfaces || []).filter((item) => item.type === 'lan' || item.type === 'ssid'));
    }).catch(() => {});
    return () => { active = false; };
  }, [device?.id]);

  const createWanPpp = async (e) => {
    e.preventDefault();
    if (!device || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/devices/${device.id}/wan`, { type: 'ppp', ...form, bindings }, { timeout: 180000 });
      toast(data.bindings_skipped?.length
        ? `WAN PPP berhasil dibuat; ${data.bindings_skipped.length} binding tidak didukung ONT`
        : 'WAN PPP berhasil dikirim ke GenieACS', data.bindings_skipped?.length ? 'warning' : 'success');
      setForm({ name: 'Internet_PPPoE', username: '', password: '', vlanEnabled: false, vlan: '' });
      setBindings([]);
      setCreateOpen(false);
      onSaved?.();
    } catch (err) {
      const data = err.response?.data;
      const details = typeof data === 'string'
        ? data
        : data?.message || data?.error || data?.detail || (err.code === 'ECONNABORTED'
          ? `${err.message}. ONT may still be processing request; refresh WAN list before retrying.`
          : err.message);
      const message = [
        `Gagal membuat WAN PPP${err.response?.status ? ` (HTTP ${err.response.status})` : ''}`,
        details,
        data?.code && `Kode: ${data.code}`,
      ].filter(Boolean).join('\n');
      toast(message, 'danger');
    } finally { setBusy(false); }
  };

  const updateWanPpp = async (e) => {
    e.preventDefault();
    if (!device || !editWan || busy) return;
    setBusy(true);
    try {
      await api.put(`/devices/${device.id}/wan-ppp`, {
        path: editWan.base_path,
        username: form.username,
        password: form.password,
        vlan: form.vlan,
        vlanEnabled: form.vlanEnabled,
      }, { timeout: 180000 });
      toast('WAN PPP berhasil diperbarui', 'success');
      setEditWan(null);
      setForm({ name: 'Internet_PPPoE', username: '', password: '', vlanEnabled: false, vlan: '' });
      onSaved?.();
    } catch (err) {
      const data = err.response?.data;
      toast(data?.message || data?.error || err.message || 'Gagal memperbarui WAN PPP', 'danger');
    } finally { setBusy(false); }
  };

  const openEditWan = (wan) => {
    setEditWan(wan);
    setForm({
      name: wan.name || '',
      username: wan.username || '',
      password: '',
      vlanEnabled: /^(1|true)$/i.test(String(wan.vlan_enabled ?? '')),
      vlan: wan.vlan ?? '',
    });
  };

  const deleteWan = async (wan) => {
    if (!(await confirm({
      title: 'Hapus koneksi WAN',
      message: `Koneksi "${wan.name}" akan dihapus permanen dari ONT. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Ya, Hapus',
      tone: 'danger',
      icon: Trash2,
    }))) return false;
    try {
      await api.delete(`/devices/${device.id}/wan`, { data: { path: wan.base_path }, timeout: 180000 });
      toast(`WAN "${wan.name}" berhasil dihapus`, 'success');
      onSaved?.();
      return true;
    } catch (err) {
      toast(err.response?.data?.message || 'Gagal menghapus WAN', 'danger');
      return false;
    }
  };

  return <>
    <Modal open={!!device} onClose={onClose} title={`Setting ONT — ${device?.serial || ''}`} wide>
      {device && <div className="space-y-5">
        <section>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Konfigurasi WAN dan SSID</h3><Button size="sm" variant="secondary" onClick={() => setWifiOpen(true)}><Wifi size={14} /> Ubah SSID / password WiFi</Button></div>
          <DeviceDetailContent deviceId={device.id} onAddWan={() => setCreateOpen(true)} onEditWan={openEditWan} onDeleteWan={deleteWan} />
        </section>
      </div>}
    </Modal>
    <Modal open={!!device && createOpen} onClose={() => setCreateOpen(false)} title={`Add WAN PPPoE — ${device?.serial || ''}`}>
      {device && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white px-5 py-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><Router size={20} /></div>
            <div><h3 className="font-semibold text-slate-900">Buat WAN PPPoE</h3><p className="mt-0.5 text-xs text-slate-500">Atur koneksi internet untuk perangkat ONT</p></div>
          </div>
          <form onSubmit={createWanPpp} className="grid grid-cols-1 gap-x-5 gap-y-4 p-5 md:grid-cols-2">
            <label><span className="label">Nama koneksi</span><input className="input transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="Contoh: Internet_PPPoE" required maxLength={64} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label><span className="label">Username PPPoE</span><input className="input transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="Masukkan username" autoComplete="username" required maxLength={128} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label><span className="label">Password PPPoE</span><input className="input transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="Masukkan password" autoComplete="new-password" type="password" maxLength={128} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <div className="flex min-h-[68px] flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 self-end">
              <label htmlFor={`wan-vlan-${device.id}`} className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"><input id={`wan-vlan-${device.id}`} className="h-4 w-4 accent-violet-600" type="checkbox" checked={form.vlanEnabled} onChange={(e) => setForm({ ...form, vlanEnabled: e.target.checked })} /><Network size={16} className="text-slate-500" />Aktifkan VLAN</label>
              {form.vlanEnabled && <input className="input !w-28" type="number" min="0" max="4094" required aria-label="VLAN ID" placeholder="VLAN ID" value={form.vlan} onChange={(e) => setForm({ ...form, vlan: e.target.value })} />}
            </div>
            {interfaces.length > 0 && <fieldset className="rounded-xl border border-slate-200 p-4 md:col-span-2">
              <legend className="px-1 text-sm font-semibold text-slate-700">Binding interface</legend>
              <p className="mb-3 text-xs text-slate-500">Pilih port LAN dan jaringan WiFi yang menggunakan koneksi WAN ini.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {['lan', 'ssid'].map((type) => {
                  const options = interfaces.filter((item) => item.type === type);
                  if (!options.length) return null;
                  return <div key={type}>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{type === 'lan' ? <EthernetPort size={14} /> : <Wifi size={14} />}{type === 'lan' ? 'Port binding' : 'SSID binding'}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{options.map((item, index) => {
                      const selected = bindings.includes(item.path);
                      const number = item.label.match(/\d+/)?.[0] || String(index + 1);
                      return <label key={item.path} className="group flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-slate-200/80 p-3 text-center transition hover:border-emerald-400 hover:bg-emerald-50/50">
                        <input type="checkbox" className="sr-only" checked={selected} onChange={(e) => setBindings((current) => e.target.checked ? [...current, item.path] : current.filter((path) => path !== item.path))} />
                        <span className={`grid h-9 w-9 place-items-center rounded-md border text-xs font-bold transition ${selected ? 'border-emerald-600 bg-emerald-500 text-white shadow-sm shadow-emerald-500/25' : 'border-slate-300 bg-white text-slate-500 group-hover:border-emerald-300'}`}>{number}</span>
                        <span className={`text-[10px] font-medium ${selected ? 'text-emerald-700' : 'text-slate-500'}`}>{item.label}{item.ssid ? ` (${item.ssid})` : ''}</span>
                      </label>;
                    })}</div>
                  </div>;
                })}
              </div>
            </fieldset>}
            {!interfaces.length && <p className="text-xs text-slate-400 md:col-span-2">Data port dan SSID belum tersedia; WAN akan dibuat tanpa binding interface.</p>}
            <div className="flex justify-end border-t border-slate-100 pt-4 md:col-span-2"><Button type="submit" disabled={busy}><Plus size={15} /> {busy ? 'Mengirim…' : 'Buat WAN PPP'}</Button></div>
          </form>
        </section>}
    </Modal>
    <Modal open={!!device && !!editWan} onClose={() => setEditWan(null)} title={`Edit WAN PPPoE — ${editWan?.name || ''}`}>
      {device && editWan && <form onSubmit={updateWanPpp} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label><span className="label">Username PPPoE</span><input className="input" autoComplete="username" required maxLength={128} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label><span className="label">Password baru PPPoE</span><input className="input" autoComplete="new-password" type="password" maxLength={128} placeholder="Kosongkan jika tidak diubah" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <div className="flex min-h-[68px] flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <label htmlFor={`edit-wan-vlan-${device.id}`} className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"><input id={`edit-wan-vlan-${device.id}`} className="h-4 w-4 accent-violet-600" type="checkbox" checked={form.vlanEnabled} onChange={(e) => setForm({ ...form, vlanEnabled: e.target.checked })} /><Network size={16} className="text-slate-500" />Aktifkan VLAN</label>
          {form.vlanEnabled && <input className="input !w-28" type="number" min="0" max="4094" required aria-label="VLAN ID" placeholder="VLAN ID" value={form.vlan} onChange={(e) => setForm({ ...form, vlan: e.target.value })} />}
        </div>
        <p className="self-center text-xs text-slate-500">Nama koneksi dan binding interface tidak dapat diubah dari form ini.</p>
        <div className="flex justify-end border-t border-slate-100 pt-4 md:col-span-2"><Button type="submit" disabled={busy}><Plus size={15} /> {busy ? 'Menyimpan…' : 'Simpan perubahan'}</Button></div>
      </form>}
    </Modal>
    <WifiModal open={wifiOpen} device={device} onClose={() => setWifiOpen(false)} onSaved={() => { setWifiOpen(false); onSaved?.(); }} />
  </>;
}