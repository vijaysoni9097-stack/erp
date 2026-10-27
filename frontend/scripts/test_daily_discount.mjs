import assert from 'node:assert/strict';
import {validDiscount,readDailyDiscount,saveDailyDiscount,applyBillDiscount} from '../src/services/dailyDiscount.js';
const map=new Map();const storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
assert.equal(saveDailyDiscount(storage,1,'2026-10-25','12.5'),true);
assert.equal(readDailyDiscount(storage,1,'2026-10-25'),'12.5');
assert.equal(readDailyDiscount(storage,2,'2026-10-25'),'0');
assert.equal(readDailyDiscount(storage,1,'2026-10-26'),'0');
assert.equal(validDiscount(0),true);assert.equal(validDiscount('100'),true);
for(const bad of ['',-1,101,'1.001',null,'NaN']) assert.equal(validDiscount(bad),false);
const lines=[{id:1,quantity:2,discount_percent:5},{id:2,quantity:1,discount_percent:0}];
const changed=applyBillDiscount(lines,'15');
assert.equal(changed[0].discount_percent,15);assert.equal(changed[1].discount_percent,15);
assert.equal(lines[0].discount_percent,5);
// Customer-only overrides never replace the stored daily default.
assert.equal(readDailyDiscount(storage,1,'2026-10-25'),'12.5');
assert.equal(saveDailyDiscount({setItem:()=>{throw Error();}},1,'2026-10-25',10),false);
console.log('Daily discount checks passed: user/day isolation, zero default, validation, all-line application, independent customer overrides and unavailable storage.');

assert.equal(readDailyDiscount({getItem:()=>{throw Error();}},1,'2026-10-27'),'0');
assert.equal(readDailyDiscount({getItem:()=> 'bad'},1,'2026-10-27'),'0');
