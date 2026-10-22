import { Router } from 'express';
import { q, exec } from '../db.js';
import { num } from '../utils/helper.js';
import { authenticate } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);

/** GET /api/notifications/mine — milik user + broadcast */
r.get('/mine', async (req, res) => {
  try {
    const rows = await q(
      `SELECT * FROM notifications WHERE user_id IS NULL OR user_id = ?
       ORDER BY id DESC LIMIT 30`,
      [req.user.id]
    );
    const unread = await q(
      `SELECT COUNT(*) n FROM notifications
       WHERE (user_id IS NULL OR user_id = ?) AND is_read = 0`,
      [req.user.id]
    );
    res.json({ rows, unread: num(unread[0]?.n) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/notifications/read-all */
r.post('/read-all', async (req, res) => {
  try {
    await exec(
      'UPDATE notifications SET is_read = 1 WHERE user_id IS NULL OR user_id = ?',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/notifications/:id/read */
r.post('/:id/read', async (req, res) => {
  try {
    await exec('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
