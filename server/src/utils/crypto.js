import crypto from 'crypto';
import config from '../config.js';

const ALGO = 'aes-256-cbc';
function key() {
  return crypto.createHash('sha256').update(config.appKey).digest();
}

/** Enkripsi string (kredensial router, dll) */
export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

/** Dekripsi string */
export function decrypt(text) {
  if (!text) return null;
  try {
    const [ivHex, dataHex] = String(text).split(':');
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

/** Mask string untuk API (jangan kirim kredensial mentah) */
export function mask(text) {
  if (!text) return '';
  const s = String(text);
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-2);
}

/** Random string alfanumerik */
export function randomString(len = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

/** Random angka */
export function randomNumber(len = 3) {
  let out = '';
  for (let i = 0; i < len; i++) out += crypto.randomInt(10);
  return out;
}
