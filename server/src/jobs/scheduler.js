import cron from 'node-cron';
import { exec as spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { generateInvoices, applyLateFees, autoIsolate, autoDisable, sendReminders } from '../services/billing.js';
import { todayLocal } from '../utils/helper.js';

/**
 * Job scheduler (PRD 8.1) — generate tagihan otomatis, reminder,
 * denda + auto isolir, dan backup database harian.
 */
export function startScheduler() {
  // Tangkap pelanggan/siklus yang sudah jatuh tempo saat server baru menyala;
  // generateInvoices idempoten karena invoice unik per pelanggan dan periode.
  safe(dailyGenerate, 'startupGenerate');
  cron.schedule('10 0 * * *', () => safe(dailyGenerate, 'dailyGenerate'), { timezone: 'Asia/Jakarta' });
  cron.schedule('0 0 * * *', () => safe(dailyPrepaidGenerate, 'dailyPrepaidGenerate'), { timezone: 'Asia/Jakarta' });

  // Reminder WA H-3/H-1/H-H/overdue tiap hari 08:00
  cron.schedule('0 8 * * *', () => safe(sendReminders, 'reminders'), { timezone: 'Asia/Jakarta' });

  // Denda keterlambatan + auto isolir tiap hari 23:00
  cron.schedule('0 23 * * *', () => safe(dailyFeesAndIsolation, 'lateFees+autoIsolate'), { timezone: 'Asia/Jakarta' });

  // Backup database harian 01:00
  cron.schedule('0 1 * * *', () => safe(backupDatabase, 'backup'), { timezone: 'Asia/Jakarta' });

  console.log('[jobs] scheduler aktif WIB (prabayar 00:00, pascabayar 00:10, reminder 08:00, isolir 23:00, backup 01:00)');
}

async function safe(fn, name) {
  try {
    await fn();
  } catch (err) {
    console.error(`[jobs:${name}] gagal:`, err.message);
  }
}

/** Generate tagihan otomatis sesuai siklus langganan tiap pelanggan (Tanggal Aktif → Tanggal Berakhir, idempoten) */
export async function dailyGenerate() {
  return generateInvoices(null, null, false, 'pascabayar');
}

/** Generate tagihan prabayar H-1 sebelum Tanggal Aktif, idempoten. */
export async function dailyPrepaidGenerate() {
  return generateInvoices(null, null, false, 'prabayar');
}

async function dailyFeesAndIsolation() {
  const fees = await applyLateFees(null);
  const isol = await autoIsolate(null);
  const dis = await autoDisable(null);
  console.log(`[jobs] denda: ${fees.applied}, isolir: ${isol.isolated}, disable: ${dis.disabled}`);
}

/** Backup database harian via mysqldump (retensi 30 hari) */
async function backupDatabase() {
  const candidates = [
    'C:\\laragon\\bin\\mysql\\mysql-8.4.3-winx64\\bin\\mysqldump.exe',
    'C:\\laragon\\bin\\mysql\\mysqldump.exe',
    'mysqldump',
  ];
  const backupDir = path.resolve('backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `netbill-${todayLocal()}.sql`);
  const db = process.env.DB_NAME || 'netbill';
  let done = false;
  for (const bin of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const cmd = `"${bin}" --host=${process.env.DB_HOST || '127.0.0.1'} --user=${process.env.DB_USER || 'root'} ${process.env.DB_PASS ? `--password=${process.env.DB_PASS}` : ''} ${db} > "${file}"`;
        spawn(cmd, { shell: true, windowsHide: true }).on('exit', (code) =>
          code === 0 ? resolve() : reject(new Error(`exit ${code}`))
        );
      });
      done = true;
      break;
    } catch {
      /* coba kandidat berikutnya */
    }
  }
  if (done && fs.existsSync(file) && fs.statSync(file).size > 100) {
    // retensi 30 hari
    for (const f of fs.readdirSync(backupDir)) {
      if (f.startsWith('netbill-') && f.endsWith('.sql')) {
        const stat = fs.statSync(path.join(backupDir, f));
        if (Date.now() - stat.mtimeMs > 30 * 86400000) fs.unlinkSync(path.join(backupDir, f));
      }
    }
    console.log('[jobs:backup] backup harian berhasil:', file);
  } else {
    console.log('[jobs:backup] mysqldump tidak tersedia — backup dilewati');
  }
}

export default startScheduler;
