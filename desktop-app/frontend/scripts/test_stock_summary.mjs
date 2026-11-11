import assert from 'node:assert/strict';
import {summarizeStock,isLowStock,isZeroStock,isSellable} from '../src/services/stockSummary.js';
const medicines=[{stock_quantity:0,reorder_level:10},{stock_quantity:2,reorder_level:10},{stock_quantity:10,reorder_level:10},{stock_quantity:20,reorder_level:10},{stock_quantity:null,reorder_level:10},{stock_quantity:-1,reorder_level:10}];
assert.deepEqual(summarizeStock(medicines),{zero:1,low:2,positive:3,units:31});
assert.equal(isZeroStock(medicines[4]),false);
assert.equal(isLowStock(medicines[0]),false);
assert.equal(isLowStock(medicines[5]),false);
assert.equal(summarizeStock([]).zero,0);
console.log('Stock checks passed: exact zero, positive low stock, reorder boundary, missing and negative quantities.');

const now = new Date(2026, 9, 25, 12);
assert.equal(isSellable({stock_quantity: 3, expiry_date: '2026-10-25'}, now), true);
assert.equal(isSellable({stock_quantity: 3, expiry_date: '2026-10-24'}, now), false);
assert.equal(isSellable({stock_quantity: 0, expiry_date: '2027-01-01'}, now), false);
assert.equal(isSellable({stock_quantity: 3, expiry_date: null}, now), false);
assert.equal(isSellable({stock_quantity: 3, expiry_date: '2027-01-01'}, now), true);
console.log('Sellable counts exclude expired, missing-expiry and zero-stock batches; expiry today is included.');
