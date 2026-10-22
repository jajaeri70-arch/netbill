import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePingTarget } from './ping.js';

test('normalisasi target ping hanya menerima IP atau hostname valid', () => {
  assert.equal(normalizePingTarget(' 8.8.8.8 '), '8.8.8.8');
  assert.equal(normalizePingTarget('2001:4860:4860::8888'), '2001:4860:4860::8888');
  assert.equal(normalizePingTarget('router.netbill.local'), 'router.netbill.local');
  assert.equal(normalizePingTarget('8.8.8.8; reboot'), null);
  assert.equal(normalizePingTarget('https://example.com'), null);
  assert.equal(normalizePingTarget('-c 10'), null);
});