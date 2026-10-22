// Diagnostik summon: riwayat kegagalan + uji bertahap + uji route API end-to-end
import * as genieacs from '/www/wwwroot/billing/server/src/services/genieacs.js';
import { q, pool } from '/www/wwwroot/billing/server/src/db.js';
import { request } from '/www/wwwroot/billing/server/src/services/httpclient.js';
import config from '/www/wwwroot/billing/server/src/config.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';

const out = [];
const wib = (ms) => new Date(ms + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);

// 1) Riwayat summon dari log aktivitas
const logs = await q("SELECT created_at, action, description FROM activity_logs WHERE action LIKE 'devices.summon%' ORDER BY id DESC LIMIT 15");
out.push('=== RIWAYAT SUMMON TERAKHIR (log aktivitas) ===');
for (const l of logs) out.push(`${l.created_at}  ${l.action}  ${l.description}`);

// 2) Cari perangkat dengan summon gagal terakhir
const failRows = await q("SELECT description, created_at FROM activity_logs WHERE action='devices.summon' AND description LIKE '%tidak merespons%' ORDER BY id DESC LIMIT 5");
const failedIds = failRows.map((r) => (r.description.match(/Summon perangkat (\S+) via/) || [])[1]).filter(Boolean);
out.push(`\nperangkat gagal terakhir: ${JSON.stringify(failedIds)}`);

// 3) Uji bertahap pada perangkat gagal (atau perangkat online pertama bila tak ada)
let targetId = failedIds[0];
if (!targetId) {
  const any = await q("SELECT genieacs_device_id FROM devices WHERE status='online' AND genieacs_device_id IS NOT NULL ORDER BY last_inform DESC LIMIT 1");
  targetId = any[0]?.genieacs_device_id;
}
if (targetId) {
  out.push(`\n=== UJI TERARAH: ${targetId} ===`);
  const t0 = Date.now();
  let before = null;
  try { before = await genieacs.fetchDeviceLastInform(targetId); } catch (e) { out.push(`before GAGAL: ${e.message}`); }
  out.push(`[1] before = ${before ? wib(before) : null} (${Date.now() - t0}ms)`);

  const t1 = Date.now();
  let fulfilled = null, taskInfo = '';
  try {
    await genieacs.summonDevice(targetId);
    fulfilled = 'connreq terkirim';
  } catch (e) { out.push(`[2] summon GAGAL: ${e.message}`); }
  out.push(`[2] summon selesai ${((Date.now() - t1) / 1000).toFixed(1)}dtk ${fulfilled} ${taskInfo}`);

  const t2 = Date.now();
  let after = null;
  try { after = await genieacs.fetchDeviceLastInform(targetId); } catch (e) { out.push(`[3] after GAGAL: ${e.message}`); }
  const responded = after != null && (before == null || after > before);
  out.push(`[3] after = ${after ? wib(after) : null} (${Date.now() - t2}ms) responded=${responded}`);

  if (!responded) {
    const t3 = Date.now();
    const polled = await genieacs.waitForInform(targetId, before, 15000, 2500);
    out.push(`[4] poll ${((Date.now() - t3) / 1000).toFixed(1)}dtk → ${polled ? wib(polled) : 'tidak ada inform'}`);
  }

  // 4) Uji route API end-to-end dengan JWT (owner)
  const users = await q("SELECT id FROM users WHERE is_active = 1 AND role = 'owner' LIMIT 1");
  if (users[0]) {
    const token = jwt.sign({ id: users[0].id }, config.jwt.secret, { expiresIn: '10m' });
    const dev = await q('SELECT id FROM devices WHERE genieacs_device_id = ? LIMIT 1', [targetId]);
    if (dev[0]) {
      const t4 = Date.now();
      try {
        const res = await request({
          url: `http://127.0.0.1:3000/api/devices/${dev[0].id}/sync`,
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          timeout: 90000,
        });
        out.push(`[5] ROUTE API selesai ${((Date.now() - t4) / 1000).toFixed(1)}dtk → ${JSON.stringify(res).slice(0, 400)}`);
      } catch (e) { out.push(`[5] ROUTE API GAGAL: ${e.message}`); }
    }
  }
} else {
  out.push('tidak ada perangkat untuk diuji');
}

fs.writeFileSync('/tmp/diag_summon.log', out.join('\n'));
await pool.end();
console.log('diagnostik selesai');
