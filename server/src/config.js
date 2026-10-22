import 'dotenv/config';

// Zona waktu aplikasi: WIB (Asia/Jakarta) — cron scheduler, NOW() MySQL, dan seluruh
// timestamp ditulis/dinilai dalam jam WIB agar konsisten dengan browser pengguna (UTC+7).
// Bisa dioverride lewat env TZ bila dibutuhkan.
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_JWT_EXPIRES = '12h';

/** Nilai expiresIn jsonwebtoken: detik positif atau satu durasi ms-style. */
export function jwtExpires(value = process.env.JWT_EXPIRES) {
  const expires = String(value || '').trim();
  if (/^[1-9]\d*$/.test(expires) || /^[1-9]\d*\s*(ms|s|m|h|d|w|y)$/i.test(expires)) {
    return expires;
  }
  if (expires) console.warn(`JWT_EXPIRES tidak valid (${expires}); memakai ${DEFAULT_JWT_EXPIRES}`);
  return DEFAULT_JWT_EXPIRES;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3020', 10),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'netbill',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'netbill-jwt-dev-secret',
    expires: jwtExpires(),
  },
  appKey: process.env.APP_KEY || 'NetBillStaticKey_ChangeInProduction32',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  miber: {
    baseUrl: (process.env.MIBER_BASE_URL || 'https://meta.miber.id/api/v1/external').replace(/\/$/, ''),
    apiKey: process.env.MIBER_API_KEY || '',
    whatsappAccountId: process.env.MIBER_WHATSAPP_ACCOUNT_ID || '',
    languageCode: process.env.MIBER_LANGUAGE_CODE || 'id',
    templates: {
      invoice: process.env.MIBER_TEMPLATE_INVOICE || '',
      h7: process.env.MIBER_TEMPLATE_H7 || '',
      h3: process.env.MIBER_TEMPLATE_H3 || '',
      h1: process.env.MIBER_TEMPLATE_H1 || '',
      due: process.env.MIBER_TEMPLATE_DUE || '',
      overdue: process.env.MIBER_TEMPLATE_OVERDUE || '',
      paid: process.env.MIBER_TEMPLATE_PAID || '',
    },
    components: Object.fromEntries(['invoice', 'h7', 'h3', 'h1', 'due', 'overdue', 'paid'].map((event) => [
      event, process.env[`MIBER_TEMPLATE_${event.toUpperCase()}_COMPONENTS`] || '[]',
    ])),
  },
  uploadDir: path.join(__dirname, '..', 'uploads'),
};

export default config;
