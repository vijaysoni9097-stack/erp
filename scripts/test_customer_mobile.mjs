import assert from 'node:assert/strict';
import {normalizeCustomerMobile} from '../src/services/customerMobile.js';
assert.equal(normalizeCustomerMobile('98765 43210'),'+919876543210');
assert.equal(normalizeCustomerMobile('+91 (98765) 43210'),'+919876543210');
assert.equal(normalizeCustomerMobile('00919876543210'),'+919876543210');
assert.equal(normalizeCustomerMobile('+44 7700 900123'),'+447700900123');
assert.equal(normalizeCustomerMobile(''),'');
for(const bad of ['abc','123','+'+'1'.repeat(16)]) assert.equal(normalizeCustomerMobile(bad),null);
console.log('Customer mobile checks passed: optional numbers, Indian/international formatting, canonical matches and invalid input.');
