import assert from 'node:assert/strict';
import { dashboardData, salesTrendForDates } from '../src/services/dashboardData.js';
const now = new Date(2026,9,19,12);
const empty = {medicines:[],sales:[],orders:[],prescriptions:[],customers:[],suppliers:[]};
const zero = dashboardData(empty,now);
assert.equal(zero.todaySales,0);
assert.equal(zero.totalStock,0);
assert.equal(zero.salesByPeriod['This Week'].length,1);
assert.equal(zero.salesByPeriod['This Year'].length,10);
const timestamp = new Date(2026,9,19,9).toISOString();
const sale = {id:1,status:'completed',created_at:timestamp,total_amount:'12.35',items:[{medicine_id:1,quantity:2}]};
const result=dashboardData({...empty,medicines:[{id:1,name:'Actual medicine',stock_quantity:3,reorder_level:5,expiry_date:'2026-10-24',batch_number:'REAL'}],sales:[sale,{...sale,id:2,status:'voided',total_amount:'999'}],orders:[{status:'pending_approval'},{status:'cancelled'}]},now);
assert.equal(result.todaySales,12.35);
assert.equal(result.salesByPeriod['This Week'][0].revenue,12.35);
assert.equal(result.salesByPeriod['This Week'][0].units,2);
assert.equal(result.pendingOrders,1);
assert.equal(result.low.length,1);
assert.equal(result.expiry.length,1);
assert.equal(result.totalStock,3);
assert.equal(result.topSellingMedicines[0][0],'Actual medicine');
assert.equal(result.topSellingMedicines[0][1],'2 units');
console.log('Dashboard checks passed: empty data, actual stock, expiry, pending orders, completed sales, exact revenue and period buckets.');

const exact = salesTrendForDates([sale, {...sale,status:'voided'}], '2026-10-19', '2026-10-19');
assert.equal(exact.length,1);
assert.equal(exact[0].revenue,12.35);
assert.equal(exact[0].units,2);
assert.equal(salesTrendForDates([sale],'2026-10-20','2026-10-21').reduce((sum,b)=>sum+b.revenue,0),0);
assert.deepEqual(salesTrendForDates([sale],'2026-10-20','2026-10-19'),[]);
assert.deepEqual(salesTrendForDates([sale],'','2026-10-19'),[]);
assert.deepEqual(salesTrendForDates([sale],'2026-02-30','2026-10-19'),[]);
const monthly = salesTrendForDates([sale],'2026-01-01','2026-12-31');
assert.equal(monthly.length,12);
assert.equal(monthly[9].revenue,12.35);
console.log('Custom sales trend checks passed: inclusive dates, invalid dates, empty days, completed-only sales and monthly grouping.');
const collections = dashboardData({...empty, sales: [
  {...sale, payment: {method:'cash', amount:'12.35', tendered:'20.00', change:'7.65'}},
  {...sale, payment: {method:'card', amount:'8.10'}},
  {...sale, payment: {method:'upi', amount:'4.20'}},
  {...sale, payment: {method:'bank_transfer', amount:'2.00'}},
  {...sale, status:'voided', payment:{method:'cash', amount:'999.00'}},
  {...sale, created_at:new Date(2026,9,18,9).toISOString(), payment:{method:'cash',amount:'999.00'}},
  sale,
]}, now).todayPayments;
assert.deepEqual(collections, {cash:12.35,card:8.10,upi:4.20,bank_transfer:2,unrecorded:12.35});
console.log('Payment collections passed: net cash after change, card, UPI, bank transfer, missing payment, voided and previous-day exclusions.');
