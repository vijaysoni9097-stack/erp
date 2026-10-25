import assert from 'node:assert/strict';
import {populateInvoice} from '../src/services/printInvoice.js';
class Element{
  constructor(tag){this.tag=tag;this.textContent='';this.children=[];}
  appendChild(node){this.children.push(node);}
  get text(){return [this.textContent,...this.children.map(c=>c.text)].join(' ');}
}
const makeDoc=()=>({head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag)});
const invoice={id:4,created_at:'2026-10-25T10:00:00',patient_name:'Saved Customer',customer_mobile:'+919876543210',prescribed_by:'self',company:{company_name:'Test Pharmacy',address:'Registered address',gstin:'27ABCDE1234F1Z5'},subtotal:'5.85',tax_amount:'0',total_amount:'5.85',items:[{medicine_id:1,medicine_name:'Saved medicine <script>',batch_number:'B1',expiry_date:'2027-01-01',quantity:2,unit_price:'3.25',original_unit_price:'3.25',discount_percent:'10',discount_amount:'.65',line_total:'5.85'}],payment:{method:'cash',amount:'5.85',tendered:'10',change:'4.15'}};
const doc=makeDoc();populateInvoice(doc,invoice,[],v=>'INR '+Number(v).toFixed(2));
for(const text of ['Saved Customer','+919876543210','self','Saved medicine <script>','B1','10%','INR 0.65','INR 5.85','Registered address','Rate / unit','Expiry']) assert.ok(doc.body.text.includes(text),text);
assert.equal(doc.title,'INV-000004');
const legacy=makeDoc();populateInvoice(legacy,{...invoice,patient_name:null,customer_mobile:null,prescribed_by:null},[],String);
assert.ok(legacy.body.text.includes('Not recorded'));
console.log('Invoice checks passed: saved customer, mobile, prescriber, medicine/batch/expiry, discounts, totals, payment and literal untrusted text.');
