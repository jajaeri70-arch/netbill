import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticInvoicePeriod, cycleForPeriod, dueDateForInvoice, invoiceCycleTerms, invoiceTotal, prepaidInvoiceCycleForDate } from './billing.js';

test('automatic invoice batch targets current WIB month', () => {
  assert.equal(automaticInvoicePeriod(new Date('2026-10-10T00:00:00+07:00')), '2026-10');
  assert.equal(automaticInvoicePeriod(new Date('2027-01-01T00:00:00+07:00')), '2027-01');
});

test('invoiceTotal includes additional fee and discount', () => {
  assert.equal(invoiceTotal({ amount: 100000, late_fee: 5000, additional_fee: 10000, tax: 1100, discount: 6000 }), 110100);
  assert.equal(invoiceTotal({ amount: 100000, late_fee: 0, additional_fee: 25000, tax: 12500, discount: 10000 }), 127500);
});

test('cycleForPeriod supports historical selected billing period', () => {
  const cycle = cycleForPeriod({ billing_day: 1 }, '2026-09');
  assert.deepEqual(cycle, { start: '2026-09-01', end: '2026-09-30', period: '2026-09' });
});

test('October batch uses October cycle and prorates October activation', () => {
  const customer = { activation_date: '2026-10-11', billing_day: 1, price: 110000 };
  const cycle = cycleForPeriod(customer, '2026-10');
  const terms = invoiceCycleTerms(customer, { refDate: cycle.start });

  assert.equal(cycle.period, '2026-10');
  assert.equal(cycle.start, '2026-10-01');
  assert.equal(terms.serviceStart, '2026-10-11');
  assert.equal(terms.amount, 74516);
});

test('dueDateForInvoice uses customer grace days and falls back to global setting', () => {
  assert.equal(dueDateForInvoice('2026-10-21', 10, 3), '2026-10-31');
  assert.equal(dueDateForInvoice('2026-10-21', null, 3), '2026-10-24');
  assert.equal(dueDateForInvoice('2026-12-31', 1, 0), '2027-01-01');
});

test('invoiceCycleTerms calculates first invoice prorata through cycle end', () => {
  const terms = invoiceCycleTerms(
    { activation_date: '2026-08-27', billing_day: 1, price: 125000 },
    { refDate: '2026-08-27' },
  );

  assert.deepEqual(terms, {
    start: '2026-08-01',
    end: '2026-08-31',
    period: '2026-08',
    serviceStart: '2026-08-27',
    amount: 20161,
    prorated: true,
    prorateDays: 5,
  });
});

test('invoiceCycleTerms skips prorata for PRABAYAR and anchors cycle to the activation date', () => {
  const terms = invoiceCycleTerms(
    { activation_date: '2026-08-27', installation_date: '2026-08-27', billing_day: 1, billing_type: 'prabayar', price: 125000 },
    { refDate: '2026-08-27' },
  );

  assert.equal(terms.start, '2026-08-27');
  assert.equal(terms.end, '2026-09-26');
  assert.equal(terms.period, '2026-08');
  assert.equal(terms.serviceStart, '2026-08-27');
  assert.equal(terms.amount, 125000);
  assert.equal(terms.prorated, false);
  assert.equal(terms.prorateDays, 0);
});

test('PRABAYAR service period and payment deadline stay separate', () => {
  const terms = invoiceCycleTerms(
    { activation_date: '2026-08-27', installation_date: '2026-08-27', billing_type: 'prabayar', price: 125000 },
    { refDate: '2026-08-27' },
  );

  assert.equal(terms.serviceStart, '2026-08-27');
  assert.equal(terms.end, '2026-09-26');
  assert.equal(dueDateForInvoice(terms.end, 5), '2026-10-01');
});

test('invoiceCycleTerms follows activation date for PRABAYAR (billing_day ignored)', () => {
  // Tanggal Aktif 1-08 walau Tanggal Pemasangan 10-08 → siklus mengikuti tanggal aktif.
  const terms = invoiceCycleTerms(
    { activation_date: '2026-08-01', installation_date: '2026-08-10', billing_day: 1, billing_type: 'prabayar', price: 125000 },
    { refDate: '2026-08-10' },
  );

  assert.equal(terms.start, '2026-08-01');
  assert.equal(terms.end, '2026-08-31');
  assert.equal(terms.serviceStart, '2026-08-01');
  assert.equal(terms.amount, 125000);
  assert.equal(terms.prorated, false);
});

test('invoiceCycleTerms falls back to activation date for PRABAYAR without installation date', () => {
  const terms = invoiceCycleTerms(
    { activation_date: '2026-08-27', billing_day: 1, billing_type: 'prabayar', price: 125000 },
    { refDate: '2026-08-27' },
  );

  assert.equal(terms.start, '2026-08-27');
  assert.equal(terms.end, '2026-09-26');
  assert.equal(terms.serviceStart, '2026-08-27');
  assert.equal(terms.prorated, false);
});

test('prepaid cycle is generated one day before activation anniversary, including month boundary', () => {
  const customer = { installation_date: '2026-08-10', activation_date: '2026-08-12', billing_type: 'prabayar' };

  assert.deepEqual(prepaidInvoiceCycleForDate(customer, '2026-09-11'), {
    start: '2026-09-12', end: '2026-10-11', period: '2026-09',
  });
  assert.equal(prepaidInvoiceCycleForDate(customer, '2026-09-10'), null);
});

test('prepaid cycle falls back to installation date when activation date is missing', () => {
  const customer = { installation_date: '2026-08-10', billing_type: 'prabayar' };

  assert.deepEqual(prepaidInvoiceCycleForDate(customer, '2026-09-09'), {
    start: '2026-09-10', end: '2026-10-09', period: '2026-09',
  });
});

test('prepaid H-1 schedule clamps monthly anniversary to month end', () => {
  const customer = { installation_date: '2026-01-31', billing_type: 'prabayar' };

  assert.deepEqual(prepaidInvoiceCycleForDate(customer, '2026-02-27'), {
    start: '2026-02-28', end: '2026-03-30', period: '2026-02',
  });
});

test('invoiceCycleTerms keeps PASCABAYAR cycle on billing_day regardless of installation date', () => {
  const terms = invoiceCycleTerms(
    { activation_date: '2026-08-27', installation_date: '2026-08-10', billing_day: 1, billing_type: 'pascabayar', price: 125000 },
    { refDate: '2026-08-27' },
  );

  assert.equal(terms.start, '2026-08-01');
  assert.equal(terms.serviceStart, '2026-08-27'); // prorata sejak Tanggal Aktif
  assert.equal(terms.prorated, true);
});

test('invoiceCycleTerms prorates the first invoice from the activation cycle even when generated later', () => {
  // Pelanggan aktif 11-09 (siklus tagihan tanggal 1) yang baru ditagih belakangan:
  // tagihan PERTAMA tetap memakai siklus 2026-09 & diprorata 20/30 hari = 73.333.
  const terms = invoiceCycleTerms(
    { activation_date: '2026-09-11', billing_day: 1, price: 110000 },
    { refDate: '2026-09-11' }, // refDate = Tanggal Aktif, bukan hari generate
  );

  assert.equal(terms.period, '2026-09');
  assert.equal(terms.start, '2026-09-01');
  assert.equal(terms.end, '2026-09-30');
  assert.equal(terms.serviceStart, '2026-09-11');
  assert.equal(terms.prorateDays, 20);
  assert.equal(terms.amount, 73333);
  assert.equal(terms.prorated, true);
});

test('invoiceCycleTerms charges full tariff after first invoice and clamps month end anchor', () => {
  const terms = invoiceCycleTerms(
    { activation_date: '2026-02-28', billing_day: 31, price: 125000 },
    { refDate: '2026-02-28', hasPriorInvoice: true },
  );

  assert.equal(terms.start, '2026-02-28');
  assert.equal(terms.end, '2026-03-30');
  assert.equal(terms.serviceStart, '2026-02-28');
  assert.equal(terms.amount, 125000);
  assert.equal(terms.prorated, false);
});