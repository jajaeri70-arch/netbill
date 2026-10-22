import { getSettings } from '../utils/helper.js';
import { decrypt } from '../utils/crypto.js';
import { exec } from '../db.js';
import config from '../config.js';

/**
 * Service WhatsApp/SMS/Email gateway (PRD 5.2 reminder).
 * Mendukung Fonnte & Wablas; jika belum dikonfigurasi, pesan dicatat
 * ke log (mode "log") agar alur reminder tetap bisa diuji.
 */

export async function sendWhatsApp(phone, message) {
  const s = await getSettings();
  const provider = s.wa_gateway || 'log';
  const token = decrypt(s.wa_token) || s.wa_token || '';
  const target = normalizePhone(phone);
  if (!target) {
    console.log('[WA] nomor kosong, pesan dilewati');
    return { ok: false, reason: 'no-phone' };
  }
  try {
    if (provider === 'fonnte') {
      if (!token) return { ok: false, provider, reason: 'token-missing' };
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, message }),
        signal: AbortSignal.timeout(15000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status === false) return { ok: false, provider, reason: json.reason || json.message || `HTTP ${res.status}` };
      console.log(`[WA:Fonnte] -> ${target}: ${json.status || 'terkirim'}`);
      return { ok: true, provider, response: json };
    }
    if (provider === 'wablas') {
      if (!token || !s.wa_domain) return { ok: false, provider, reason: 'gateway-config-missing' };
      const domain = String(s.wa_domain).replace(/^https?:\/\//, '').replace(/\/$/, '');
      const res = await fetch(`https://${domain}/api/send-message`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: target, message }),
        signal: AbortSignal.timeout(15000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status === false) return { ok: false, provider, reason: json.message || `HTTP ${res.status}` };
      console.log(`[WA:Wablas] -> ${target}`);
      return { ok: true, provider, response: json };
    }
    if (provider !== 'log') return { ok: false, provider, reason: 'provider-invalid' };
    // Mode log — simulasikan pengiriman
    console.log(`[WA:log] -> ${target}: ${message.replace(/\n/g, ' | ').slice(0, 140)}`);
    return { ok: true, provider: 'log' };
  } catch (err) {
    console.error('[WA] gagal kirim:', err.message);
    return { ok: false, reason: err.message };
  }
}

export function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[^0-9+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = '62' + p.slice(1);
  return p.startsWith('62') && p.length >= 10 ? p : null;
}

/** Isi template pesan: {nama}, {tagihan}, {jatuh_tempo}, {periode}, {perusahaan} */
export function renderTemplate(tpl, vars) {
  let out = tpl || '';
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v ?? '');
  }
  return out;
}

export function miberPayload(eventType, phone, vars, miber = config.miber) {
  const templateName = miber.templates[eventType];
  if (!templateName) return null;
  let components;
  try {
    components = JSON.parse(miber.components[eventType] || '[]');
  } catch {
    throw new Error(`MIBER_TEMPLATE_${eventType.toUpperCase()}_COMPONENTS bukan JSON valid`);
  }
  if (!Array.isArray(components)) throw new Error(`MIBER_TEMPLATE_${eventType.toUpperCase()}_COMPONENTS harus JSON array`);
  return {
    whatsapp_account_id: miber.whatsappAccountId,
    to: normalizePhone(phone),
    template_name: templateName,
    language_code: miber.languageCode,
    components: replaceMiberVariables(components, vars),
  };
}

function replaceMiberVariables(value, vars) {
  if (Array.isArray(value)) return value.map((item) => replaceMiberVariables(item, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceMiberVariables(item, vars)]));
  if (typeof value !== 'string') return value;
  return value.replace(/{{([a-z_]+)}}/g, (_, key) => String(vars[key] ?? ''));
}

export function isTemporaryMiberFailure(status) {
  return status === 408 || status === 429 || status >= 500;
}

/** Bentuk endpoint tanpa membuang path API pada Base URL, mis. /api/v1/external. */
export function miberEndpoint(baseUrl, path) {
  return new URL(String(path).replace(/^\/+/, ''), `${String(baseUrl).replace(/\/+$/, '')}/`).toString();
}

/** Ambil daftar template dari seluruh bentuk respons Miber yang dikenal. */
export function miberTemplates(body) {
  if (Array.isArray(body)) return body;
  for (const value of [body?.data, body?.templates, body?.rows, body?.data?.templates, body?.data?.rows]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

/** Detail error upstream aman ditampilkan ke pengguna tanpa kredensial request. */
export function miberErrorMessage(body, fallback) {
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 1000);
  if (!body || typeof body !== 'object') return fallback;
  const message = body.message || body.error || body.detail || body.error_description;
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (Array.isArray(body.errors)) return body.errors.map((error) => error.message || error.detail || String(error)).join('; ') || fallback;
  if (body.errors && typeof body.errors === 'object') return Object.values(body.errors).flat().join('; ') || fallback;
  return fallback;
}

/** Konfigurasi Miber tersimpan; environment dipakai sebagai fallback instalasi awal. */
export async function getMiberConfiguration(force = false) {
  const settings = await getSettings(force);
  const value = (key, fallback) => Object.hasOwn(settings, key) ? settings[key] : fallback;
  return {
    baseUrl: String(value('miber_base_url', config.miber.baseUrl)).trim().replace(/\/$/, ''),
    apiKey: decrypt(value('miber_api_key', '')) || value('miber_api_key', '') || config.miber.apiKey,
    whatsappAccountId: String(value('miber_whatsapp_account_id', config.miber.whatsappAccountId)).trim(),
    languageCode: String(value('miber_language_code', config.miber.languageCode)).trim() || 'id',
    templates: config.miber.templates,
    components: config.miber.components,
  };
}

/** Konfigurasi aman untuk UI; API key tidak pernah keluar dari server. */
export function miberConfigurationStatus(miber) {
  const configuredTemplates = Object.entries(miber.templates)
    .filter(([, name]) => name)
    .map(([event]) => event);
  const invalidComponents = Object.entries(miber.components)
    .filter(([, components]) => {
      try {
        return !Array.isArray(JSON.parse(components));
      } catch {
        return true;
      }
    })
    .map(([event]) => event);
  return {
    base_url: miber.baseUrl,
    api_key_configured: Boolean(miber.apiKey),
    api_key_hint: miber.apiKey ? `••••${miber.apiKey.slice(-4)}` : '',
    whatsapp_account_id: miber.whatsappAccountId,
    language_code: miber.languageCode,
    configured_templates: configuredTemplates,
    invalid_components: invalidComponents,
  };
}

/** Uji kredensial Miber tanpa mengirim pesan WhatsApp. */
export async function testMiberConnection() {
  const miber = await getMiberConfiguration();
  const status = miberConfigurationStatus(miber);
  if (!status.api_key_configured || !status.whatsapp_account_id) {
    return { ok: false, message: 'API key dan WhatsApp Account ID Miber wajib diisi di Pengaturan' };
  }
  try {
    // Endpoint daftar akun tercantum di koleksi API MiberConnect. Endpoint detail :id
    // tidak tersedia pada deployment pelanggan ini dan selalu menghasilkan 404.
    const res = await fetch(miberEndpoint(miber.baseUrl, 'whatsapp/accounts'), {
      headers: { Authorization: `Bearer ${miber.apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: body.message || body.error || `MiberConnect merespons HTTP ${res.status}` };
    return { ok: true, message: 'Koneksi MiberConnect berhasil; API key dapat membaca daftar akun WhatsApp' };
  } catch (err) {
    return { ok: false, message: `Koneksi MiberConnect gagal: ${err.message}` };
  }
}

/** Kirim event billing via template approved Miber; event_key unik mencegah pesan ganda. */
export async function sendMiberBillingNotification({ eventKey, eventType, invoiceId = null, customerId = null, phone, vars = {} }) {
  const miber = await getMiberConfiguration();
  if (!miber.apiKey || !miber.whatsappAccountId) return { ok: false, provider: 'miber', reason: 'miber-config-missing' };
  const payload = miberPayload(eventType, phone, vars, miber);
  if (!payload) return { ok: false, provider: 'miber', reason: 'template-not-configured' };
  if (!payload.to) return { ok: false, provider: 'miber', reason: 'no-phone' };
  const inserted = await exec(
    `INSERT IGNORE INTO whatsapp_notification_logs
     (event_key, invoice_id, customer_id, event_type, provider, recipient, request_payload, attempts)
     VALUES (?,?,?,?,?,?,?,1)`,
    [eventKey, invoiceId, customerId, eventType, 'miber', payload.to, JSON.stringify(payload)]
  );
  if (!inserted.affectedRows) {
    const retry = await exec(
      `UPDATE whatsapp_notification_logs SET status = 'processing', attempts = attempts + 1, error_message = NULL
       WHERE event_key = ? AND status = 'failed' AND attempts < 3 AND error_message LIKE 'temporary:%'`,
      [eventKey]
    );
    if (!retry.affectedRows) return { ok: false, provider: 'miber', reason: 'duplicate-or-not-retryable' };
  }
  try {
    const res = await fetch(miberEndpoint(miber.baseUrl, 'messages/send/template'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${miber.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    const response = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = response.message || response.error || `HTTP ${res.status}`;
      await markMiberResult(eventKey, 'failed', response, isTemporaryMiberFailure(res.status) ? `temporary:${reason}` : reason);
      return { ok: false, provider: 'miber', reason };
    }
    const messageId = response.message_id || response.id || response.data?.message_id || response.data?.id || null;
    await markMiberResult(eventKey, 'sent', response, null, messageId);
    return { ok: true, provider: 'miber', response, messageId };
  } catch (err) {
    await markMiberResult(eventKey, 'failed', {}, `temporary:${err.message}`);
    return { ok: false, provider: 'miber', reason: err.message };
  }
}

async function markMiberResult(eventKey, status, response, errorMessage, messageId = null) {
  await exec(
    `UPDATE whatsapp_notification_logs
     SET status = ?, provider_response = ?, provider_message_id = ?, error_message = ?, sent_at = IF(? = 'sent', NOW(), NULL)
     WHERE event_key = ?`,
    [status, JSON.stringify(response), messageId, errorMessage?.slice(0, 500) || null, status, eventKey]
  );
}
