import { Router } from 'express';
import { q } from '../db.js';
import { num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';

const r = Router();

/** GET /api/activity — audit trail (PRD 5.10) */
r.get('/', can('activity'), async (req, res) => {
  try {
    const { module, action, q: search, page = 1, limit = 20 } = req.query;
    const where = [];
    const params = [];
    if (module && module !== 'all') { where.push('module = ?'); params.push(module); }
    if (action && action !== 'all') { where.push('action LIKE ?'); params.push(`${action}%`); }
    if (search) {
      where.push('(user_name LIKE ? OR description LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await q(`SELECT COUNT(*) n FROM activity_logs ${w}`, params);
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const rows = await q(
      `SELECT * FROM activity_logs ${w} ORDER BY id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );
    const modules = await q('SELECT DISTINCT module FROM activity_logs ORDER BY module');
    res.json({ rows, total: num(total[0]?.n), modules: modules.map((m) => m.module) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
