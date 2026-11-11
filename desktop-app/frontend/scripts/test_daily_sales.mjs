import assert from 'node:assert/strict';
import { dayKey, hasCollection, saleDate, summarizeDailySales } from '../src/services/dailySales.js';
const zone = 'Asia/Kolkata';
const day = '2026-10-19';
const sale = (id, created_at, total_amount, payment, status = 'completed') => ({ id, created_at, total_amount, payment, status });
const invoices = [
  sale(1, '2026-10-18T18:29:59', '9.00', { amount: '9.00' }), // previous local day
  sale(2, '2026-10-18T18:30:00', '10.10', { amount: '10.10', tendered: '20.00', change: '9.90' }),
  sale(3, '2026-10-19T18:29:59Z', '20.20', { amount: '20.20' }),
  sale(4, '2026-10-19T18:30:00Z', '99.00', { amount: '99.00' }), // next local day
  sale(5, '2026-10-19T04:00:00Z', '100.00', { amount: '100.00' }, 'voided'),
  sale(6, '2026-10-19T10:00:00+05:30', '5.00', null),
  sale(7, 'bad timestamp', '200.00', { amount: '200.00' }),
];
const result = summarizeDailySales(invoices, day, zone);
assert.deepEqual(result.invoices.map(invoice => invoice.id), [3, 6, 2]);
assert.equal(result.total, 35.30);
assert.equal(result.collected, 30.30); // collected payment amount, never cash tendered
assert.equal(result.unrecorded, 1);
assert.equal(saleDate('2026-10-19 04:00:00').toISOString(), '2026-10-19T04:00:00.000Z');
assert.equal(dayKey(new Date('2026-10-18T18:30:00Z'), zone), day);
assert.equal(hasCollection({ payment: { amount: '0.00' } }), true);
assert.equal(hasCollection({ payment: {} }), false);
assert.equal(hasCollection({}), false);
assert.deepEqual(summarizeDailySales([], day, zone), { invoices: [], total: 0, collected: 0, unrecorded: 0 });
assert.deepEqual(summarizeDailySales(invoices, '2026-10-20', zone).invoices.map(invoice => invoice.id), [4]);
console.log('Daily sales checks passed: local midnight boundaries, timezone offsets, voids, missing payments, cash change, exact totals and empty days.');
