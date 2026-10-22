import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { request } from './httpclient.js';

test('HTTP deadline bounds a continuously streaming upstream', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200);
    const timer = setInterval(() => res.write(' '), 10);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(request({ url: `http://127.0.0.1:${server.address().port}`, timeout: 1000, deadlineMs: 100 }), { code: 'ETIMEDOUT' });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP error exposes status without altering successful JSON serialization', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/error' ? 502 : 202);
    res.end(JSON.stringify({ _id: 'task-1' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(request({ url: `${url}/error` }), { statusCode: 502 });
    const result = await request({ url });
    assert.equal(result._httpStatus, 202);
    assert.equal(JSON.stringify(result), '{"_id":"task-1"}');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});