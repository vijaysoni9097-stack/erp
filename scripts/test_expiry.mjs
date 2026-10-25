import assert from 'node:assert/strict';
import {isExpiringSoon,expiryDaysRemaining} from '../src/services/expiry.js';
import {dashboardData} from '../src/services/dashboardData.js';
const now=new Date(2026,9,25,12);
const medicines=[
  {id:1,expiry_date:'2026-10-25',stock_quantity:1},
  {id:2,expiry_date:'2026-11-24',stock_quantity:4},
  {id:3,expiry_date:'2026-11-25',stock_quantity:4},
  {id:4,expiry_date:'2026-10-24',stock_quantity:5},
  {id:5,expiry_date:'2026-10-30',stock_quantity:0},
  {id:6,expiry_date:null,stock_quantity:5},
];
assert.deepEqual(medicines.filter(m=>isExpiringSoon(m,now)).map(m=>m.id),[1,2]);
const result=dashboardData({medicines,sales:[],orders:[],prescriptions:[],customers:[],suppliers:[]},now);
assert.equal(result.expiry.length,2);
assert.equal(expiryDaysRemaining('2026-11-24',now),30);
assert.equal(expiryDaysRemaining('2026-10-24',now),-1);
console.log('Expiry checks passed: identical dashboard predicate, today and day 30 included, expired/zero-stock/missing dates excluded.');
