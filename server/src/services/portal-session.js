import { randomBytes } from 'node:crypto';

export function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^[+\d\s()-]+$/.test(value)) return null;
  let phone = value.replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (phone.startsWith('08')) phone = `62${phone.slice(1)}`;
  return /^628\d{8,11}$/.test(phone) ? phone : null;
}

export const maskPhone = phone => phone ? `${phone.slice(0, 4)}${'*'.repeat(phone.length - 7)}${phone.slice(-3)}` : 'invalid';

export function createSessionStore(now = Date.now) {
  const sessions = new Map();
  return {
    create(customer) {
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { customerId: customer.id, name: customer.name, expires: now() + 86400000 });
      return token;
    },
    get(token) {
      const session = sessions.get(token);
      if (!session || session.expires <= now()) { sessions.delete(token); return null; }
      return session;
    },
    delete(token) { sessions.delete(token); },
    prune() { for (const [token, session] of sessions) if (session.expires <= now()) sessions.delete(token); },
  };
}