import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, maskPhone, createSessionStore } from './portal-session.js';

test('normalizes Indonesian phone formats and rejects malformed input', () => {
  for (const value of ['081234567890', '6281234567890', '+62 812-3456-7890']) assert.equal(normalizePhone(value), '6281234567890');
  for (const value of [null, {}, 812, '', '123', 'abc081234567890', '+62812+34567890']) assert.equal(normalizePhone(value), null);
  assert.equal(maskPhone('6281234567890'), '6281******890');
});

test('sessions use database owner name, random identifiers, expiration and server logout', () => {
  let now = 0;
  const store = createSessionStore(() => now);
  const token = store.create({ id: 12, name: 'Siti' });
  assert.equal(store.get(token).name, 'Siti');
  assert.equal(store.get(token).customerId, 12);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(store.create({ id: 12, name: 'Siti' }), token);
  now = 86400000;
  assert.equal(store.get(token), null);
  const next = store.create({ id: 13, name: 'Budi' });
  store.delete(next);
  assert.equal(store.get(next), null);
});