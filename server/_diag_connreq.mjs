// Cek kredensial connection request di pohon data: working vs failing
import * as genieacs from '/www/wwwroot/billing/server/src/services/genieacs.js';
import fs from 'fs';

const TARGETS = [
  { id: '00259E-HG8145V5-4857544349AC3AAD', tag: 'GAGAL (202 cepat)' },
  { id: '000AC2-HG6145D2-FHTT9E7CFDA0', tag: 'GAGAL (timeout)' },
  { id: '000AC2-HG6145D2-FHTTC1F73776', tag: 'BERHASIL' },
  { id: 'DC5193-F679L-ZTEGD77E52CC', tag: 'BERHASIL' },
  { id: '000AC2-HG6245N-FHTTC1E91DC0', tag: 'BERHASIL' },
  { id: '843C99-F672Y-ZTEGD8166708', tag: 'BERHASIL' },
];

const out = [];
for (const t of TARGETS) {
  out.push(`===== ${t.id} [${t.tag}] =====`);
  try {
    const raw = await genieacs.fetchDevice(t.id);
    if (!raw) { out.push('  tidak ditemukan'); continue; }
    const root = raw.InternetGatewayDevice ? 'InternetGatewayDevice' : 'Device';
    const ms = raw[root]?.ManagementServer || {};
    for (const k of ['ConnectionRequestURL', 'ConnectionRequestUsername', 'ConnectionRequestPassword', 'PeriodicInformEnable', 'PeriodicInformInterval', '_lastInform']) {
      const node = ms[k];
      if (k === '_lastInform') { out.push(`  ${k} = ${raw._lastInform ?? null}`); continue; }
      if (!node || typeof node !== 'object') { out.push(`  ${k} = (tidak ada di pohon)`); continue; }
      const hasVal = node._value !== undefined;
      out.push(`  ${k} = ${hasVal ? JSON.stringify(node._value).slice(0, 60) : '(parameter ada, nilai disembunyikan)'}${node._writable ? ' [writable]' : ''}`);
    }
  } catch (e) { out.push(`  GAGAL: ${e.message}`); }
}
fs.writeFileSync('/tmp/diag_creds.log', out.join('\n'));
console.log('selesai');


