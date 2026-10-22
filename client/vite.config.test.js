import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import config from './vite.config.js';

test('dev API proxy uses the backend port, including server/.env, for all endpoints', () => {
  const previousUrl = process.env.VITE_BACKEND_URL;
  const previousPort = process.env.PORT;
  try {
    delete process.env.VITE_BACKEND_URL;
    delete process.env.PORT;
    const port = loadEnv('development', fileURLToPath(new URL('../server/', import.meta.url)), 'PORT').PORT || 3020;
    const dev = config({ mode: 'development' });
    for (const route of ['/api', '/uploads', '/socket.io']) {
      assert.equal(dev.server.proxy[route].target, `http://localhost:${port}`);
    }
    process.env.VITE_BACKEND_URL = 'http://backend.test:9876';
    const custom = config({ mode: 'development' });
    assert.equal(custom.server.proxy['/api'].target, 'http://backend.test:9876');
  } finally {
    if (previousUrl === undefined) delete process.env.VITE_BACKEND_URL;
    else process.env.VITE_BACKEND_URL = previousUrl;
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
  }
});