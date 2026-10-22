import http from 'http';
import https from 'https';

/**
 * HTTP request helper sederhana (mendukung http & https,
 * abaikan validasi sertifikat untuk router Mikrotik self-signed).
 */
export function request({ url, method = 'GET', body = null, headers = {}, timeout = 6000, deadlineMs = null, insecure = true }) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error('URL tidak valid: ' + url));
    }
    const mod = u.protocol === 'https:' ? https : http;
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const options = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...headers,
      },
      timeout,
      ...(u.protocol === 'https:' && insecure ? { rejectUnauthorized: false } : {}),
    };
    const req = mod.request(options, (res) => {
      res.on('error', reject);
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data = raw;
        try {
          data = JSON.parse(raw);
        } catch {
          /* keep raw */
        }
        if (res.statusCode >= 400) {
          const error = new Error(`HTTP ${res.statusCode}: ${String(raw).slice(0, 200)}`);
          error.statusCode = res.statusCode;
          return reject(error);
        }
        // Sisipkan kode status HTTP tanpa mengubah bentuk data bagi pemanggil lama —
        // properti non-enumerable sehingga tidak ikut JSON.stringify/perulangan
        if (data && typeof data === 'object') {
          try { Object.defineProperty(data, '_httpStatus', { value: res.statusCode, enumerable: false }); } catch { /* abaikan */ }
        }
        resolve(data);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Timeout koneksi ke perangkat')));
    if (deadlineMs) {
      const timer = setTimeout(() => req.destroy(Object.assign(new Error('HTTP request deadline exceeded'), { code: 'ETIMEDOUT' })), deadlineMs);
      req.on('close', () => clearTimeout(timer));
    }
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Basic auth header */
export function basicAuth(user, pass) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

export default request;
