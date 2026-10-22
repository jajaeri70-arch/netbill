import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../db.js';
import mobileRoutes, { mobileApiStatus, pagination, paymentBanksHandler } from './mobile.js';
import dashboardRoutes from './dashboard.js';
import { authenticate, canFinance } from '../middleware/auth.js';
import bankRoutes from './banks.js';
import { requireMobileApiKey } from '../middleware/mobileApiKey.js';
import express from 'express';
import { profitLossReport } from './reports.js';

after(() => pool.end());

test('lookup rekening transfer terdaftar sebagai GET setelah API key dan JWT', () => {
  const layers = mobileRoutes.stack;
  const index = layers.findIndex((layer) => layer.route?.path === '/payments/banks');
  assert.ok(index >= 0);
  assert.equal(layers[index].route.methods.get, true);
  assert.equal(layers[index].route.stack.length, 2);
  for (const guard of [requireMobileApiKey, authenticate]) {
    const guardIndex = layers.findIndex((layer) => layer.handle === guard);
    assert.ok(guardIndex >= 0 && guardIndex < index);
  }
});

test('lookup transfer mengembalikan rows dan mempertahankan nol awal nomor rekening', async () => {
  let ready = false;
  const rows = [{ id: 7, name: 'Example Bank', account_number: '0012345678', account_name: 'Example Holder' }];
  const handler = paymentBanksHandler({
    ensureSchema: async () => { ready = true; },
    query: async (sql) => {
      assert.equal(ready, true);
      assert.equal(sql, 'SELECT id, name, account_number, account_name FROM banks WHERE is_active = 1 ORDER BY name ASC, id ASC');
      return rows;
    },
  });
  let payload;
  await handler({}, { json(value) { payload = value; } });
  assert.deepEqual(payload, { rows });
});

test('lookup transfer tanpa rekening aktif mengembalikan daftar kosong bukan 404', async () => {
  const handler = paymentBanksHandler({ ensureSchema: async () => {}, query: async () => [] });
  let payload;
  await handler({}, { json(value) { payload = value; } });
  assert.deepEqual(payload, { rows: [] });
});

test('lookup transfer meneruskan kegagalan database ke error handler', async () => {
  const error = new Error('Database unavailable');
  const handler = paymentBanksHandler({
    ensureSchema: async () => {},
    query: async () => { throw error; },
  });
  await assert.rejects(handler({}, { json() { assert.fail('tidak boleh mengirim sukses'); } }), error);
});

test('master bank mobile memakai CRUD web setelah API key, JWT, dan guard finance', () => {
  const layers = mobileRoutes.stack;
  const index = layers.findIndex((layer) => layer.handle === bankRoutes);
  assert.ok(index >= 0);
  assert.ok(layers[index].regexp.test('/banks/1'));
  assert.equal(layers[index - 1].handle, canFinance);
  assert.ok(layers[index - 1].regexp.test('/banks/1'));
  for (const guard of [requireMobileApiKey, authenticate]) {
    const guardIndex = layers.findIndex((layer) => layer.handle === guard);
    assert.ok(guardIndex >= 0 && guardIndex < index);
  }
  for (const [method, path] of [
    ['get', '/'], ['post', '/'], ['put', '/:id'], ['delete', '/:id'],
  ]) {
    const route = bankRoutes.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route;
    assert.ok(route, `${method} ${path}`);
    assert.equal(route.stack.length, 2, `${method} ${path} retains its permission guard`);
  }
});

test('master bank mobile menolak semua operasi tanpa API key', async () => {
  const app = express();
  app.use('/api/mobile/v1', mobileRoutes);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    for (const [method, path] of [['GET', '/banks'], ['POST', '/banks'], ['PUT', '/banks/1'], ['DELETE', '/banks/1'], ['GET', '/payments/banks']]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/mobile/v1${path}`, { method });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { message: 'API key tidak valid' });
    }
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('guard master bank menolak role non-finance sebelum handler bank', () => {
  for (const role of ['admin', 'teknisi', 'kasir', undefined]) {
    let status;
    canFinance({ user: { role } }, {
      status(value) { status = value; return this; },
      json(value) { assert.equal(typeof value.message, 'string'); },
    }, () => assert.fail('handler bank tidak boleh dipanggil'));
    assert.equal(status, 403);
  }
  for (const role of ['owner', 'finance']) {
    let allowed = false;
    canFinance({ user: { role } }, {}, () => { allowed = true; });
    assert.equal(allowed, true);
  }
});

test('mobile dashboard memakai router web setelah API key dan JWT', () => {
  const layers = mobileRoutes.stack;
  const index = layers.findIndex((layer) => layer.handle === dashboardRoutes);
  assert.ok(index >= 0);
  assert.ok(layers[index].regexp.test('/dashboard/stats'));
  for (const guard of [requireMobileApiKey, authenticate]) {
    const guardIndex = layers.findIndex((layer) => layer.handle === guard);
    assert.ok(guardIndex >= 0 && guardIndex < index);
  }
  for (const [method, path] of [
    ['get', '/stats'], ['get', '/business-summary'], ['get', '/invoice-adjustments'],
    ['get', '/installation-trend'], ['get', '/network-users'], ['post', '/ping'],
  ]) {
    const route = dashboardRoutes.stack.find((layer) => layer.route?.path === path)?.route;
    assert.ok(route?.methods[method], `${method} ${path}`);
    assert.ok(route.stack.length >= 2, `${path} retains its permission guard`);
  }
});

test('endpoint dashboard mobile menolak request tanpa API key', async () => {
  const app = express();
  app.use('/api/mobile/v1', mobileRoutes);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    for (const path of ['stats', 'business-summary', 'invoice-adjustments', 'installation-trend', 'network-users']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/mobile/v1/dashboard/${path}`);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { message: 'API key tidak valid' });
    }
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('root API mobile mengonfirmasi API key yang lolos middleware', () => {
  let payload;
  mobileApiStatus({}, { json(value) { payload = value; } });
  assert.deepEqual(payload, {
    ok: true, service: 'netbill-mobile-api', version: 'v1', api_key: 'valid',
  });
});

test('pagination memakai default dan membatasi input dari klien', () => {
  assert.deepEqual(pagination(), { page: 1, limit: 20, offset: 0 });
  assert.deepEqual(pagination({ page: '3', limit: '25' }), { page: 3, limit: 25, offset: 50 });
  assert.deepEqual(pagination({ page: '-2', limit: '9999' }), { page: 1, limit: 100, offset: 0 });
  assert.deepEqual(pagination({ page: 'abc', limit: '0' }), { page: 1, limit: 20, offset: 0 });
});

test('kontrak laba rugi memakai angka JSON dan periode sebelumnya', async () => {
  const calls = [];
  const results = [
    [{ v: '12500000.00' }],
    [{ v: '500000.00' }],
    [{ name: 'Bandwidth', v: '4000000.00' }, { name: 'Operasional', v: '1500000.00' }],
    [{ v: '7000000.00' }],
  ];
  const report = await profitLossReport('2026-01', async (sql, params) => {
    calls.push({ sql, params });
    return results.shift();
  });

  assert.deepEqual(report, {
    period: '2026-01',
    revenue: { billing: 12500000, nonBilling: 500000, total: 13000000 },
    expenses: [{ name: 'Bandwidth', total: 4000000 }, { name: 'Operasional', total: 1500000 }],
    totalExpense: 5500000,
    net: 7500000,
    previous: { period: '2025-12', net: 7000000 },
    growth: (500000 / 7000000) * 100,
  });
  assert.deepEqual(calls.map(({ params }) => params), [
    ['2026-01'], ['2026-01'], ['2026-01'], ['2025-12', '2025-12', '2025-12'],
  ]);
});

test('kontrak laba rugi menolak periode invalid sebelum query database', async () => {
  await assert.rejects(
    profitLossReport('2026-13', async () => assert.fail('query tidak boleh dipanggil')),
    (err) => err.status === 400 && err.message === 'Periode tidak valid'
  );
});
