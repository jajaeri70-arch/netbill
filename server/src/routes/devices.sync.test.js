import test from 'node:test';
import assert from 'node:assert/strict';
import { syncDeviceHandler } from './devices.js';

async function invoke({ status = 202, submitError = false, readError = false, auditError = false, missing = false } = {}) {
  const writes = [];
  let submissions = 0;
  const handler = syncDeviceHandler({
    query: async () => missing ? [] : [{ id: 13394, genieacs_device_id: 'test-ont' }],
    execute: async (...args) => writes.push(args),
    audit: async () => { if (auditError) throw new Error('audit unavailable'); },
    acs: {
      summonDevice: async () => {
        submissions++;
        if (submitError) throw new Error('secret upstream error');
        return { _id: 'task-1', _httpStatus: status };
      },
      fetchDevice: async () => { if (readError) throw new Error('read failed'); return {}; },
      normalizeDevice: () => ({ last_inform: '2026-10-21 10:00:00' }),
    },
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: '13394' } }, res);
  return { ...res, writes, submissions };
}

test('queued sync returns 202 without polling or marking local data fresh', async () => {
  const res = await invoke();
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.command_status, 'queued');
  assert.equal(res.body.responded, false);
  assert.equal(res.body.task_id, 'task-1');
  assert.equal(res.body.retry_safe, false);
  assert.equal(res.writes.length, 0);
  assert.equal(res.submissions, 1);
});

test('completed task refreshes local data', async () => {
  const res = await invoke({ status: 200 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.command_status, 'completed');
  assert.equal(res.body.responded, true);
  assert.equal(res.writes.length, 1);
});

test('submission failures and malformed upstream responses are unknown, never retried', async () => {
  for (const options of [{ submitError: true }, { status: 204 }]) {
    const res = await invoke(options);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, 'ONT_SYNC_STATUS_UNKNOWN');
    assert.equal(res.body.retry_safe, false);
    assert.equal(res.submissions, 1);
    assert.doesNotMatch(res.body.message, /secret/);
  }
});

test('readback failure preserves completed command status', async () => {
  const res = await invoke({ status: 200, readError: true });
  assert.equal(res.body.code, 'ONT_SYNC_READBACK_FAILED');
  assert.equal(res.body.command_status, 'completed');
  assert.equal(res.body.responded, true);
});

test('audit failure does not change acceptance; missing device never submits', async () => {
  assert.equal((await invoke({ auditError: true })).statusCode, 202);
  const res = await invoke({ missing: true });
  assert.equal(res.statusCode, 404);
  assert.equal(res.submissions, 0);
});