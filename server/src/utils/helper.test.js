import test from 'node:test';
import assert from 'node:assert/strict';
import { currentMonthNewCustomerWithoutInvoiceWhere } from './helper.js';

test('filter belum ada invoice hanya mencakup pelanggan baru pascabayar bulan berjalan', () => {
  assert.match(currentMonthNewCustomerWithoutInvoiceWhere, /c\.billing_type = 'pascabayar'/);
  assert.match(currentMonthNewCustomerWithoutInvoiceWhere, /DATE_FORMAT\(c\.created_at, '%Y-%m'\) = \?/);
  assert.match(currentMonthNewCustomerWithoutInvoiceWhere, /NOT EXISTS \(SELECT 1 FROM invoices i WHERE i\.customer_id = c\.id\)/);
  assert.doesNotMatch(currentMonthNewCustomerWithoutInvoiceWhere, /installation_date|activation_date/);
});