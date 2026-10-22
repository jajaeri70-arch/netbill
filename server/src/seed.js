import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import config from './config.js';
import { pool } from './db.js';
import { seedCore } from './seed-core.js';
import { runDemo } from './seed-demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILES = ['schema-core.sql', 'schema-ops.sql', 'schema-radius.sql'];

async function applySchema() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
  for (const f of SCHEMA_FILES) {
    const sql = fs.readFileSync(path.join(__dirname, f), 'utf8');
    await conn.query(sql);
    console.log(`[seed] schema diterapkan: ${f}`);
  }
  await conn.end();
}

async function main() {
  const full = process.argv.includes('--full');
  console.log(`[seed] mode: ${full ? 'full (core + data demo)' : 'core'}`);
  await applySchema();
  await seedCore();
  if (full) await runDemo();
  console.log('[seed] selesai ✓');
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] gagal:', err);
  process.exit(1);
});
