import test from 'node:test';
import assert from 'node:assert/strict';
import { isFirstOpenInvoice, paymentStatusForTotal } from './payments.js';

test('hanya tagihan terbuka paling awal yang dapat dibayar', () => {
  const september = { id: 10, period: '2026-09' };
  const october = { id: 11, period: '2026-10' };

  assert.equal(isFirstOpenInvoice(september, september), true);
  assert.equal(isFirstOpenInvoice(october, september), false);
  assert.equal(isFirstOpenInvoice(october, null), true);
});

test('hapus pembayaran menghitung ulang status tagihan dari sisa pembayaran', () => {
  assert.equal(paymentStatusForTotal(100000, 0), 'unpaid');
  assert.equal(paymentStatusForTotal(100000, 50000), 'partial');
  assert.equal(paymentStatusForTotal(100000, 100000), 'paid');
});