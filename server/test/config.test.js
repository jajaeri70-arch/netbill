import assert from 'node:assert/strict';
import test from 'node:test';
import { jwtExpires } from '../src/config.js';

test('jwtExpires menerima format jsonwebtoken valid', () => {
  assert.equal(jwtExpires('20h'), '20h');
  assert.equal(jwtExpires('60'), '60');
  assert.equal(jwtExpires('15 m'), '15 m');
});

test('jwtExpires menolak nilai gabungan yang membuat login gagal', () => {
  assert.equal(jwtExpires('"20h", 60'), '12h');
  assert.equal(jwtExpires('0'), '12h');
});