import assert from 'node:assert/strict';
import {populateInvoice} from '../src/services/printInvoice.js';
import {invoiceLabel} from '../src/services/invoiceLabel.js';
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
const imported = makeDoc();
const details = {kind:'sales',source_reference:'OLD-2020-1 <script>',balance_as_of:'2025-03-31T18:29:59',paid_before_import:'2.00',notes:'Original record <b>notes</b>'};
populateInvoice(imported,{...invoice,import_details:details,outstanding_amount:'1',paid_amount:'4.85'},[],String);
assert.equal(imported.title, details.source_reference);
for(const text of ['IMPORTED HISTORICAL INVOICE','OLD-2020-1 <script>','Paid before migration','Original record <b>notes</b>','Paid to date']) assert.ok(imported.body.text.includes(text),text);
const opening=makeDoc();
populateInvoice(opening,{...invoice,items:[],payment:null,import_details:{...details,kind:'opening_balances',source_reference:'OPEN-1',paid_before_import:0},outstanding_amount:'4.85',paid_amount:'1'},[],String);
assert.equal(opening.title,'Opening balance · OPEN-1');
for(const text of ['OPENING CUSTOMER BALANCE','Opening balance','Outstanding credit','balance statement']) assert.ok(opening.body.text.includes(text),text);
assert.ok(!opening.body.text.includes('RETAIL PHARMACY INVOICE'));
assert.ok(!opening.body.text.includes('Gross amount'));
assert.ok(!opening.body.children.some(node=>node.tag==='table'));
assert.equal(invoiceLabel({sale_id:4}),'INV-000004');
assert.equal(invoiceLabel({sale_id:4,import_details:details}),details.source_reference);
console.log('Invoice checks passed: saved customer, mobile, prescriber, medicine/batch/expiry, discounts, totals, payment and literal untrusted text.');
