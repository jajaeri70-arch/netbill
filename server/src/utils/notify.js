import { q, exec } from '../db.js';
import { emit } from './events.js';

/**
 * Buat notifikasi (simpan DB + push realtime via socket)
 * @param {object} n { userId|null, title, message, type }
 */
export async function notify({ userId = null, title, message = '', type = 'info' }) {
  try {
    const result = await exec(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)',
      [userId, title, message, type]
    );
    const notification = {
      id: result.insertId,
      user_id: userId,
      title,
      message,
      type,
      is_read: 0,
      created_at: new Date().toISOString(),
    };
    emit('notification:new', notification);
    return notification;
  } catch (err) {
    console.error('[notify] gagal:', err.message);
    return null;
  }
}

/** Notifikasi broadcast */
export const notifyAll = (n) => notify({ ...n, userId: null });
