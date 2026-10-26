import assert from 'node:assert/strict';
import {discountLine} from '../src/services/discounts.js';
assert.deepEqual(discountLine('3.25',2,10),{gross:6.5,discount:0.65,total:5.85});
assert.equal(discountLine('3.25',2,100).total,0);
assert.equal(discountLine('3.25',2,0).total,6.5);
assert.equal(discountLine('19.99',3,'12.50').total,52.47);
for (const rate of [-1,101,'',NaN,1.001]) assert.equal(discountLine('3.25',2,rate),null);
console.log('Discount checks passed: percentage bounds, per-line paise rounding, zero and full discounts.');
