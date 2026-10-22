import crypto from 'crypto';
import { q, tx } from '../db.js';

const PREFIX = 'nb_live_';

export function hashApiKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function generateApiKey() {
  return PREFIX + crypto.randomBytes(32).toString('base64url');
}

export function safeHashEqual(left, right) {
  const a = Buffer.from(String(left), 'hex');
  const b = Buffer.from(String(right), 'hex');
  return a.length === 32 && b.length === 32 && crypto.timingSafeEqual(a, b);
}

function hint(key) {
  return `${PREFIX}••••${key.slice(-4)}`;
}

export async function validateMobileApiKey(key) {
  if (!/^nb_live_[A-Za-z0-9_-]{43}$/.test(String(key || ''))) return false;
  const rows = await q(
    `SELECT current_hash, previous_hash,
            previous_expires_at IS NOT NULL AND previous_expires_at > NOW() previous_valid
     FROM mobile_api_keys WHERE id = 1`
  );
  const row = rows[0];
  if (!row) return false;
  const supplied = hashApiKey(key);
  return safeHashEqual(supplied, row.current_hash) ||
    (!!row.previous_valid && safeHashEqual(supplied, row.previous_hash));
}

export async function getMobileApiKeyStatus() {
  const rows = await q(
    `SELECT current_hint, previous_expires_at, rotated_at, rotated_by
     FROM mobile_api_keys WHERE id = 1`
  );
  const row = rows[0];
  return row ? { configured: true, ...row } : { configured: false };
}

export async function rotateMobileApiKey(userId, graceHours = 24) {
  const hours = Number(graceHours);
  if (!Number.isInteger(hours) || hours < 0 || hours > 168) {
    const err = new Error('grace_hours harus bilangan bulat 0 sampai 168');
    err.status = 400;
    throw err;
  }
  const key = generateApiKey();
  await tx(async (conn) => {
    const [rows] = await conn.query('SELECT current_hash FROM mobile_api_keys WHERE id = 1 FOR UPDATE');
    const oldHash = rows[0]?.current_hash || null;
    await conn.query(
      `INSERT INTO mobile_api_keys
         (id, current_hash, current_hint, previous_hash, previous_expires_at, rotated_at, rotated_by)
       VALUES (1, ?, ?, NULL, NULL, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         previous_hash = current_hash,
         previous_expires_at = IF(? > 0, DATE_ADD(NOW(), INTERVAL ? HOUR), NOW()),
         current_hash = VALUES(current_hash), current_hint = VALUES(current_hint),
         rotated_at = NOW(), rotated_by = VALUES(rotated_by)`,
      [hashApiKey(key), hint(key), userId, hours, hours]
    );
    // Rotasi pertama tidak memiliki key lama.
    if (!oldHash) await conn.query('UPDATE mobile_api_keys SET previous_hash=NULL, previous_expires_at=NULL WHERE id=1');
  });
  return { api_key: key, hint: hint(key), grace_hours: hours };
}
