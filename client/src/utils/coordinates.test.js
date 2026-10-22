import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCoordinate } from './coordinates.js';

test('accepts decimal, compact DMS, and hemisphere coordinates', () => {
  assert.equal(parseCoordinate('-6.914741', 'latitude'), -6.914741);
  assert.ok(Math.abs(parseCoordinate('80150.8S', 'latitude') - (-8 - 1 / 60 - 50.8 / 3600)) < 1e-10);
  assert.ok(Math.abs(parseCoordinate('1123432.9E', 'longitude') - (112 + 34 / 60 + 32.9 / 3600)) < 1e-10);
  assert.ok(Math.abs(parseCoordinate('8° 1\' 50.8\" S', 'latitude') - (-8 - 1 / 60 - 50.8 / 3600)) < 1e-10);
});

test('rejects out-of-range and malformed coordinates', () => {
  assert.equal(parseCoordinate('91', 'latitude'), null);
  assert.equal(parseCoordinate('107E', 'latitude'), null);
  assert.equal(parseCoordinate('126099.0', 'latitude'), null);
  assert.equal(parseCoordinate('', 'longitude'), null);
});