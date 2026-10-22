import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity, num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';

const r = Router();

/** Tarif bulanan = harga dasar + PPN */
function hitungTarif(basePrice, taxRate) {
  const base = Number(basePrice) || 0;
  const tax = Number(taxRate) || 0;
  return Math.round(base * (1 + tax / 100) * 100) / 100;
}

/** GET /api/packages */
r.get('/', can('packages'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT p.*, r.name AS router_name,
              (SELECT COUNT(*) FROM customers c WHERE c.package_id = p.id AND c.status <> 'inactive') subscribers
       FROM packages p LEFT JOIN routers r ON r.id = p.router_id
       ORDER BY p.price ASC`
    );
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/packages */
r.post('/', can('packages', 'create'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.speed) return res.status(400).json({ message: 'Nama & kecepatan wajib diisi' });
    const basePrice = Number(b.base_price ?? b.price) || 0;
    const taxRate = Number(b.tax_rate) || 0;
    const routerId = b.router_id ? Number(b.router_id) : null;
    if (routerId) {
      const router = await q('SELECT id FROM routers WHERE id = ?', [routerId]);
      if (!router[0]) return res.status(400).json({ message: 'Router tidak ditemukan' });
    }
    const result = await exec(
      `INSERT INTO packages (name, speed, price, base_price, tax_rate, agent_commission,
         allow_app_change, allow_online_payment, mikrotik_profile, router_id, description, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.name, b.speed, hitungTarif(basePrice, taxRate), basePrice, taxRate, Number(b.agent_commission) || 0,
        b.allow_app_change ? 1 : 0, b.allow_online_payment ? 1 : 0,
        b.mikrotik_profile || null, routerId, b.description || null,
        b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1]
    );
    await logActivity({ req, action: 'packages.create', module: 'packages', description: `Menambah paket ${b.name}` });
    res.json({ id: result.insertId, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/packages/:id */
r.put('/:id', can('packages', 'edit'), async (req, res) => {
  try {
    const old = (await q('SELECT * FROM packages WHERE id = ?', [req.params.id]))[0];
    if (!old) return res.status(404).json({ message: 'Paket tidak ditemukan' });
    const b = req.body || {};
    const name = b.name ?? old.name;
    const speed = b.speed ?? old.speed;
    const basePrice = b.base_price !== undefined ? Number(b.base_price) || 0 : Number(old.base_price) || 0;
    const taxRate = b.tax_rate !== undefined ? Number(b.tax_rate) || 0 : Number(old.tax_rate) || 0;
    const routerId = b.router_id !== undefined ? (b.router_id ? Number(b.router_id) : null) : old.router_id;
    if (routerId) {
      const router = await q('SELECT id FROM routers WHERE id = ?', [routerId]);
      if (!router[0]) return res.status(400).json({ message: 'Router tidak ditemukan' });
    }
    await exec(
      `UPDATE packages SET name=?, speed=?, price=?, base_price=?, tax_rate=?, agent_commission=?,
         allow_app_change=?, allow_online_payment=?, mikrotik_profile=?, router_id=?, description=?, is_active=?
       WHERE id=?`,
      [name, speed, hitungTarif(basePrice, taxRate), basePrice, taxRate,
        b.agent_commission !== undefined ? Number(b.agent_commission) || 0 : Number(old.agent_commission) || 0,
        b.allow_app_change !== undefined ? (b.allow_app_change ? 1 : 0) : old.allow_app_change,
        b.allow_online_payment !== undefined ? (b.allow_online_payment ? 1 : 0) : old.allow_online_payment,
        b.mikrotik_profile !== undefined ? (b.mikrotik_profile || null) : old.mikrotik_profile,
        routerId,
        b.description !== undefined ? (b.description || null) : old.description,
        b.is_active !== undefined ? (b.is_active ? 1 : 0) : old.is_active,
        req.params.id]
    );
    await logActivity({ req, action: 'packages.update', module: 'packages', description: `Mengubah paket #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/packages/:id */
r.delete('/:id', can('packages', 'delete'), async (req, res) => {
  try {
    const used = await q('SELECT COUNT(*) n FROM customers WHERE package_id = ?', [req.params.id]);
    if (num(used[0]?.n) > 0) {
      return res.status(400).json({ message: 'Paket masih dipakai pelanggan, nonaktifkan saja' });
    }
    await exec('DELETE FROM packages WHERE id = ?', [req.params.id]);
    await logActivity({ req, action: 'packages.delete', module: 'packages', description: `Menghapus paket #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
