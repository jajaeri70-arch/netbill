import mysql from 'mysql2/promise';
import config from './config.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
  dateStrings: true,
  // Seluruh timestamp aplikasi memakai WIB (UTC+7) — parameter JS Date ditulis
  // sebagai wall-clock WIB. dateStrings menjaga hasil baca DATETIME tetap string
  // mentah apa adanya (diteruskan ke client tanpa konversi zona waktu).
  timezone: '+07:00',
});

// NOW()/CURRENT_TIMESTAMP di sisi MySQL juga mengikuti WIB agar konsisten dengan
// client yang menafsirkan string datetime DB sebagai jam WIB. Event 'connection'
// dipancarkan pool mysql2 setiap kali koneksi baru dibuat (base/pool.js:102).
// Ditautkan ke core pool (pool.pool) agar handler menerima koneksi callback API.
pool.pool.on('connection', (conn) => {
  try {
    conn.query("SET time_zone = '+07:00'", () => {});
  } catch { /* jangan biarkan koneksi gagal karena ini */ }
});

/** Query returning rows */
export async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Query returning exec result (insertId, affectedRows) */
export async function exec(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** Run callback inside a transaction */
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export default pool;
