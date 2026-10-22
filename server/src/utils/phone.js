/** Canonical Indonesian mobile number used by customer records. */
export function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\s()-]/g, '');
  const digits = text.startsWith('+62') ? `0${text.slice(3)}` : text.startsWith('62') ? `0${text.slice(2)}` : text;
  return /^08\d{8,11}$/.test(digits) ? digits : null;
}

/** Preserve legacy landlines/contact values while normalizing mobile numbers. */
export function customerPhone(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return normalizePhone(text) || text || null;
}