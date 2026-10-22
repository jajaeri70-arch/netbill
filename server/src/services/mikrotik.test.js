import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePppoeUsername, pppoeUsernameFromInterface } from './mikrotik.js';

test('membaca username dari nama interface PPPoE dinamis RouterOS', () => {
  assert.equal(pppoeUsernameFromInterface('<pppoe-pelanggan01>'), 'pelanggan01');
  assert.equal(pppoeUsernameFromInterface('pppoe-pelanggan02'), 'pelanggan02');
  assert.equal(pppoeUsernameFromInterface('ether1'), null);
  assert.equal(normalizePppoeUsername('  pelanggan01 '), 'pelanggan01');
  assert.equal(normalizePppoeUsername(''), null);
});
