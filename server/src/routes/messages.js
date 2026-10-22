import { Router } from 'express';
import { can } from '../middleware/auth.js';
import { logActivity } from '../utils/helper.js';
import { getMiberConfiguration, miberEndpoint, miberErrorMessage, miberTemplates, normalizePhone } from '../services/whatsapp.js';

const r = Router();

/** GET /api/messages/templates — daftar template approved tanpa membocorkan kredensial Miber. */
r.get('/templates', can('settings'), async (req, res) => {
  try {
    const miber = await getMiberConfiguration();
    if (!miber.apiKey) return res.status(400).json({ message: 'API key MiberConnect belum dikonfigurasi' });
    const response = await fetch(miberEndpoint(miber.baseUrl, 'templates'), {
      headers: { Authorization: `Bearer ${miber.apiKey}` }, signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    const body = raw ? JSON.parse(raw) : {};
    if (!response.ok) return res.status(response.status).json({ message: miberErrorMessage(body, raw || `MiberConnect merespons HTTP ${response.status}`) });
    res.json({ templates: miberTemplates(body), language_code: miber.languageCode });
  } catch (err) {
    const message = err instanceof SyntaxError ? 'MiberConnect mengembalikan respons bukan JSON valid' : err.message;
    res.status(502).json({ message: `Gagal memuat template MiberConnect: ${message}` });
  }
});

/** POST /api/messages/template — kirim template approved lewat kredensial server. */
r.post('/template', can('settings', 'edit'), async (req, res) => {
  try {
    const { to, template_name: templateName, components = [] } = req.body || {};
    const recipient = normalizePhone(to);
    if (!recipient) return res.status(400).json({ message: 'Nomor WhatsApp Indonesia valid wajib diisi' });
    if (!/^[a-z0-9_]{1,512}$/i.test(String(templateName || ''))) return res.status(400).json({ message: 'Nama template tidak valid' });
    if (!Array.isArray(components)) return res.status(400).json({ message: 'Components harus JSON array valid' });

    const miber = await getMiberConfiguration();
    if (!miber.apiKey || !miber.whatsappAccountId) return res.status(400).json({ message: 'Konfigurasi MiberConnect belum lengkap' });
    const payload = {
      whatsapp_account_id: miber.whatsappAccountId,
      to: recipient,
      template_name: String(templateName),
      language_code: miber.languageCode,
      components,
    };
    const response = await fetch(miberEndpoint(miber.baseUrl, 'messages/send/template'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${miber.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    const body = raw ? JSON.parse(raw) : {};
    if (!response.ok) return res.status(response.status).json({ message: miberErrorMessage(body, raw || `MiberConnect merespons HTTP ${response.status}`) });
    await logActivity({ req, action: 'messages.template.send', module: 'settings', description: `Mengirim template ${payload.template_name} ke ${recipient}` });
    res.json({ ok: true, message: 'Pesan template dikirim', message_id: body.message_id || body.id || body.data?.message_id || body.data?.id || null });
  } catch (err) {
    const message = err instanceof SyntaxError ? 'MiberConnect mengembalikan respons bukan JSON valid' : err.message;
    res.status(502).json({ message: `Gagal mengirim pesan MiberConnect: ${message}` });
  }
});

export default r;