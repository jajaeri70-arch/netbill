import test from 'node:test';
import assert from 'node:assert/strict';
import { generateApiKey, hashApiKey, safeHashEqual } from './mobileApiKey.js';

test('API key mobile kuat, berformat benar, dan diverifikasi konstan-waktu', () => {
  const first = generateApiKey();
  const second = generateApiKey();
  assert.match(first, /^nb_live_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(safeHashEqual(hashApiKey(first), hashApiKey(first)), true);
  assert.equal(safeHashEqual(hashApiKey(first), hashApiKey(second)), false);
  assert.equal(safeHashEqual(hashApiKey(first), 'rusak'), false);
});
