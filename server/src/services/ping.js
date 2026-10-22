import { execFile } from 'child_process';
import { isIP } from 'node:net';

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export function normalizePingTarget(value) {
  const target = String(value || '').trim();
  if (!target || target.length > 253 || /\s/.test(target)) return null;
  return isIP(target) || HOSTNAME_RE.test(target) ? target : null;
}

export function pingHost(host, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const args = isWin
      ? ['-n', '1', '-w', String(timeoutMs), host]
      : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host];
    execFile('ping', args, { timeout: timeoutMs + 2000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, latency: null });
      const match = String(stdout).match(/[=<]\s?([\d.]+)\s?ms/i);
      resolve({ ok: true, latency: match ? Math.round(Number(match[1]) * 10) / 10 : 0 });
    });
  });
}