import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPortalRouter } from '../src/routes/portal.js';

test('portal HTTP contract: login, cookie restoration, customer scope, CSRF, logout', async t => {
  const customer = { id: 7, name: 'Customer Test', code: 'C007', phone: '081234567890', address: 'Test', status: 'active', package_id: 2 };
  const query = async (sql, params) => {
    if (sql.includes('FROM customers')) {
      if (params) assert.deepEqual(params, [7]);
      return [customer];
    }
    if (sql.includes('FROM packages')) { assert.deepEqual(params, [2]); return [{ name: 'Test package', speed: '10M', price: 100000 }]; }
    if (sql.includes('FROM invoices')) { assert.deepEqual(params, [7]); return []; }
    throw new Error('Unexpected query');
  };
  const app = express();
  app.use(express.json());
  app.use('/api/portal', createPortalRouter({ query, origin: 'https://netbill.skynetwifi.site', secure: true }));
  app.use('/api', (req, res) => res.status(401).json({ message: 'staff-only' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const send = (path, options = {}) => fetch(`${base}${path}`, options);
  const post = (body, extra = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Portal-CSRF': '1', Origin: 'https://netbill.skynetwifi.site', ...extra }, body: JSON.stringify(body) });
  let response = await send('/portal/me');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'PORTAL_SESSION_REQUIRED');
  response = await send('/portal/login', post({ phone: customer.phone }, { Origin: 'https://evil.example' }));
  assert.equal(response.status, 403);
  response = await send('/portal/login', post({ phone: customer.phone }, { 'X-Portal-CSRF': '' }));
  assert.equal(response.status, 403);
  response = await send('/portal/login', post({ phone: '+6281234567890', name: 'Forged' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).name, customer.name);
  const setCookie = response.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/portal']) assert.ok(setCookie.includes(flag));
  const Cookie = setCookie.split(';')[0];
  response = await send('/portal/me', { headers: { Cookie } });
  assert.equal((await response.json()).customer.name, customer.name);
  response = await send('/portal/dashboard?customer_id=999', { headers: { Cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).profile.code, customer.code);
  response = await send('/portal/ont', { headers: { Cookie } });
  assert.equal(response.status, 501);
  response = await send('/customers', { headers: { Cookie } });
  assert.equal(response.status, 401);
  response = await send('/portal/logout', post({}, { Cookie, 'X-Portal-CSRF': '', 'X-Portal-Request': '1' }));
  assert.equal(response.status, 200);
  response = await send('/portal/me', { headers: { Cookie } });
  assert.equal(response.status, 401);
  response = await send('/portal/logout', post({}));
  assert.equal(response.status, 200);
});