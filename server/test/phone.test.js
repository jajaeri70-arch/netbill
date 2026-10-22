import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, customerPhone } from '../src/utils/phone.js';

test('customer records normalize mobile numbers and preserve legacy contacts', () => {
  for (const value of ['081234567890', '+62 (812) 3456-7890', '6281234567890', '\t081234567890\r\n']) {
    assert.equal(customerPhone(value), '081234567890');
    assert.equal(normalizePhone(value), '081234567890');
  }
  for (const value of [null, undefined, {}, ['081234567890'], 6281234567890, '', '123']) {
    assert.equal(normalizePhone(value), null);
  }
  assert.equal(customerPhone('  '), null);
  assert.equal(customerPhone('021-1234567'), '021-1234567');
  assert.equal(normalizePhone(customerPhone('021-1234567')), null);
});

test('nomor Indonesia dinormalisasi', () => {
  assert.equal(normalizePhone('0812-3456-7890'), '081234567890');
  assert.equal(normalizePhone('+6281234567890'), '081234567890');
  assert.equal(normalizePhone('6281234567890'), '081234567890');
  assert.equal(normalizePhone('0812<script>'), null);
});