import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinanceRole } from './auth.js';

test('finance role permits only owner and finance', () => {
  assert.equal(isFinanceRole('owner'), true);
  assert.equal(isFinanceRole('finance'), true);
  assert.equal(isFinanceRole('admin'), false);
  assert.equal(isFinanceRole('teknisi'), false);
  assert.equal(isFinanceRole('kasir'), false);
});