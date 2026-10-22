import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity, num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';

const r = Router();

let schemaReady;
/** Pastikan tabel master bank, kolom payments.bank_id, dan izin menu tersedia (migrasi runtime) */
export async function ensureBanksSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await exec(`CREATE TABLE IF NOT EXISTS banks (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(60) NOT NULL,
        account_number VARCHAR(40) NOT NULL,
        account_name VARCHAR(100) NOT NULL,
        note VARCHAR(255) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
      const cols = await q(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'bank_id'`
      );
      if (!cols.length) await exec('ALTER TABLE payments ADD COLUMN bank_id INT UNSIGNED NULL AFTER method');
      // Izin master bank hanya untuk finance; guard router juga menegakkan batas ini.
      await exec(
        `INSERT IGNORE INTO role_permissions (role, menu, can_view, can_create, can_edit, can_delete, can_export)
         VALUES ('finance','banks',1,1,1,1,0)`
      );
    })().catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

/** GET /api/banks — daftar akun bank (?active=1 hanya yang aktif) */
r.get('/', can('banks'), async (req, res) => {
  try {
    await ensureBanksSchema();
    const where = req.query.active === '1' ? 'WHERE b.is_active = 1' : '';
    const rows = await q(
      `SELECT b.*, (SELECT COUNT(*) FROM payments p WHERE p.bank_id = b.id) payments_count
       FROM banks b ${where} ORDER BY b.name ASC, b.id ASC`
    );
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/banks — tambah akun bank */
r.post('/', can('banks', 'create'), async (req, res) => {
  try {
    await ensureBanksSchema();
    const { name, account_number, account_name, note, is_active = 1 } = req.body || {};
    if (!name || !account_number || !account_name) {
      return res.status(400).json({ message: 'Nama bank, no rekening, dan atas nama wajib diisi' });
    }
    const result = await exec(
      'INSERT INTO banks (name, account_number, account_name, note, is_active) VALUES (?,?,?,?,?)',
      [String(name).trim(), String(account_number).trim(), String(account_name).trim(), note || null, is_active ? 1 : 0]
    );
    await logActivity({ req, action: 'banks.create', module: 'banks', description: `Menambah akun bank ${name} (${account_number})` });
    res.json({ id: result.insertId, ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/banks/:id — ubah akun bank */
r.put('/:id', can('banks', 'edit'), async (req, res) => {
  try {
    const bank = (await q('SELECT * FROM banks WHERE id = ?', [req.params.id]))[0];
    if (!bank) return res.status(404).json({ message: 'Akun bank tidak ditemukan' });
    const { name, account_number, account_name, note, is_active } = req.body || {};
    if (!name || !account_number || !account_name) {
      return res.status(400).json({ message: 'Nama bank, no rekening, dan atas nama wajib diisi' });
    }
    await exec(
      'UPDATE banks SET name = ?, account_number = ?, account_name = ?, note = ?, is_active = ? WHERE id = ?',
      [String(name).trim(), String(account_number).trim(), String(account_name).trim(), note || null, is_active ? 1 : 0, bank.id]
    );
    await logActivity({ req, action: 'banks.update', module: 'banks', description: `Mengubah akun bank ${name} (${account_number})` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/banks/:id — hapus akun bank (ditolak bila sudah dipakai pembayaran) */
r.delete('/:id', can('banks', 'delete'), async (req, res) => {
  try {
    const bank = (await q('SELECT * FROM banks WHERE id = ?', [req.params.id]))[0];
    if (!bank) return res.status(404).json({ message: 'Akun bank tidak ditemukan' });
    const used = await q('SELECT COUNT(*) n FROM payments WHERE bank_id = ?', [bank.id]);
    if (num(used[0]?.n) > 0) {
      return res.status(400).json({ message: `Akun bank dipakai ${num(used[0]?.n)} pembayaran — nonaktifkan saja agar riwayat tetap utuh` });
    }
    await exec('DELETE FROM banks WHERE id = ?', [bank.id]);
    await logActivity({ req, action: 'banks.delete', module: 'banks', description: `Menghapus akun bank ${bank.name} (${bank.account_number})` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default r;
