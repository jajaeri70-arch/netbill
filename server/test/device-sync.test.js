import test from 'node:test';
import assert from 'node:assert/strict';
import { syncDevicesHandler } from '../src/routes/devices.js';
import { syncDevices, deviceSyncError, DEVICE_SYNC_TIMEOUT } from '../../client/src/utils/deviceSync.js';

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

test('bulk and individual sync use the same extended timeout without retrying', async () => {
  const calls = [];
  const api = { post: async (...args) => { calls.push(args); return { data: {} }; } };
  await syncDevices(api);
  await syncDevices(api, 12);
  assert.deepEqual(calls, [
    ['/devices/sync', null, { timeout: DEVICE_SYNC_TIMEOUT }],
    ['/devices/12/sync', null, { timeout: DEVICE_SYNC_TIMEOUT }],
  ]);
  assert.ok(DEVICE_SYNC_TIMEOUT > 15000);
});

test('sync errors preserve backend detail and distinguish uncertain transport failures', () => {
  assert.equal(deviceSyncError({ response: { data: { message: 'Database unavailable' } } }), 'Database unavailable');
  assert.match(deviceSyncError({ code: 'ECONNABORTED' }), /belum dapat dipastikan/);
  assert.match(deviceSyncError({ response: { status: 502 } }), /backend/);
});

test('successful reconciliation remains successful when auditing fails', async () => {
  const res = response();
  await syncDevicesHandler({
    acs: { fetchDevices: async () => [] },
    transaction: async (fn) => fn({ query: async () => [[]] }),
    audit: async () => { throw new Error('Audit unavailable'); },
  })({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { synced: 0, removed: 0 });
});

test('upstream failure never starts reconciliation and still responds if auditing fails', async () => {
  const res = response();
  let started = false;
  await syncDevicesHandler({
    acs: { fetchDevices: async () => { throw new Error('ACS timeout'); } },
    transaction: async () => { started = true; },
    audit: async () => { throw new Error('Audit unavailable'); },
  })({}, res);
  assert.equal(started, false);
  assert.equal(res.statusCode, 502);
  assert.match(res.body.message, /ACS timeout/);
});

test('database reconciliation failure is not reported as success', async () => {
  const res = response();
  await syncDevicesHandler({
    acs: { fetchDevices: async () => [] },
    transaction: async () => { throw new Error('Transaction rolled back'); },
    audit: async () => {},
  })({}, res);
  assert.equal(res.statusCode, 502);
  assert.match(res.body.message, /Transaction rolled back/);
});