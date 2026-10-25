import { saleDate } from './dailySales.js';

export function populateInvoice(doc, invoice, medicines, money) {
  const charset = doc.createElement('meta'); charset.charset = 'utf-8'; doc.head.appendChild(charset);
  const add = (tag, text, parent = doc.body, className) => {
    const node = doc.createElement(tag);
    node.textContent = String(text ?? '');
    if (className) node.className = className;
    parent.appendChild(node); return node;
  };
  const style=doc.createElement('style');
  style.textContent=`
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#111;margin:0;line-height:1.5}
    h1,h2,p{margin:0}header{border-bottom:2px solid #222;padding-bottom:14px;margin-bottom:14px;display:flex;justify-content:space-between;gap:24px}
    h1{font-size:23px;line-height:1.2;margin-bottom:6px}.address{white-space:pre-line;max-width:110mm}.document-type{font-size:12px;font-weight:700;letter-spacing:1px}
    .invoice-meta{text-align:right;white-space:nowrap}.invoice-meta strong{display:block;font-size:15px;margin:5px 0}.party{display:grid;grid-template-columns:1.3fr 1fr;gap:20px;padding:12px;border:1px solid #ccc;margin-bottom:18px}
    .label{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#555;margin-bottom:4px}.party strong{font-size:13px;overflow-wrap:anywhere}
    table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt;margin-bottom:14px}thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:8px 5px;border:1px solid #ccc;vertical-align:top;overflow-wrap:anywhere}
    th{background:#f2f2f2;font-size:8pt;text-align:left}th:nth-child(1){width:5%}th:nth-child(2){width:23%}th:nth-child(3){width:12%}th:nth-child(4){width:11%}th:nth-child(5){width:6%}th:nth-child(6){width:12%}th:nth-child(7){width:8%}th:nth-child(8){width:11%}th:nth-child(9){width:12%}
    .number{text-align:right;font-variant-numeric:tabular-nums}.summary{display:grid;grid-template-columns:1fr 75mm;gap:25px;break-inside:avoid}.totals p{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #eee}.totals .grand{font-size:15px;font-weight:bold;border-top:2px solid #222;border-bottom:2px solid #222;margin-top:6px;padding:9px 0}
    .payment p{margin:4px 0;overflow-wrap:anywhere}.status{font-weight:bold;font-size:12px}.footer{border-top:1px solid #ccc;margin-top:30px;padding-top:12px;display:flex;justify-content:space-between;gap:20px;font-size:9px}.signature{text-align:right;min-width:45mm;padding-top:22px}
    @media screen{body{max-width:186mm;margin:24px auto;padding:0 8px}}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  `;
  doc.head.appendChild(style);
  const number=`INV-${String(invoice.id).padStart(6,'0')}`;
  doc.title=number;
  const company=invoice.company || {};
  const header=add('header','');
  const issuer=add('div','',header);
  add('h1',company.company_name || 'Pharmacy',issuer);
  if(company.address)add('p',company.address,issuer,'address');
  add('p',`GSTIN: ${company.gstin || 'Not recorded'}`,issuer);
  const meta=add('div','',header,'invoice-meta');
  add('p','RETAIL PHARMACY INVOICE',meta,'document-type');
  add('strong',number,meta);
  add('p',`Date: ${saleDate(invoice.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}`,meta);
  add('p',`Time: ${saleDate(invoice.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`,meta);
  if(invoice.status==='voided')add('p','VOIDED',meta,'status');
  const party=add('section','',doc.body,'party');
  const customer=add('div','',party);
  add('p','Customer / Patient',customer,'label');
  add('strong',invoice.patient_name || invoice.patient || 'Not recorded',customer);
  add('p',`Mobile: ${invoice.customer_mobile || invoice.mobile || 'Not recorded'}`,customer);
  const prescriber=add('div','',party);
  add('p','Prescribed by',prescriber,'label');
  add('strong',invoice.prescribed_by || invoice.doctor || 'Not recorded',prescriber);
  const table=add('table','');
  const head=add('tr','',add('thead','',table));
  ['No.','Medicine','Batch','Expiry','Qty','Rate / unit','Disc. %','Discount','Net amount'].forEach((label,index)=>add('th',label,head,index>=4?'number':undefined));
  const body=add('tbody','',table);
  const catalog=new Map(medicines.map(m=>[m.id,m]));
  let grossPaise=0,discountPaise=0;
  invoice.items.forEach((item,index)=>{
    const medicine=catalog.get(item.medicine_id);
    const original=Number(item.original_unit_price ?? item.unit_price);
    const gross=Math.round(original*100)*item.quantity;
    const discount=item.discount_amount!=null?Math.round(Number(item.discount_amount)*100):gross-Math.round(Number(item.line_total)*100);
    grossPaise+=gross;discountPaise+=discount;
    const expiry=item.expiry_date || medicine?.expiry_date;
    const expiryLabel=expiry?new Date(`${expiry}T12:00:00`).toLocaleDateString('en-IN',{month:'short',year:'numeric'}):'—';
    const row=add('tr','',body);
    [index+1,item.medicine_name || medicine?.name || `Medicine #${item.medicine_id}`,item.batch_number || medicine?.batch_number || '—',expiryLabel,item.quantity,money(original),`${Number(item.discount_percent||0)}%`,money(discount/100),money(item.line_total)].forEach((value,column)=>add('td',value,row,column>=4?'number':undefined));
  });
  const summary=add('section','',doc.body,'summary');
  const payment=add('div','',summary,'payment');
  add('p','Payment details',payment,'label');
  if(invoice.payment){
    const p=invoice.payment;
    add('p',`Method: ${{cash:'Cash',upi:'UPI',card:'Card',bank_transfer:'Bank transfer'}[p.method] || p.method}`,payment);
    add('p',`Amount collected: ${money(p.amount)}`,payment,'status');
    add('p',`Tendered: ${money(p.tendered)} · Change returned: ${money(p.change)}`,payment);
    if(p.reference)add('p',`Reference: ${p.reference}`,payment);
  }else add('p','Payment collection not recorded',payment);
  const totals=add('div','',summary,'totals');
  function total(label,value,emphasis=false){const line=add('p','',totals,emphasis?'grand':undefined);add('span',label,line);add('strong',money(value),line);}
  total('Gross amount',grossPaise/100);
  total('Less discount',discountPaise/100);
  total('Subtotal',invoice.subtotal);
  total('GST / tax recorded',invoice.tax_amount);
  total('Invoice total',invoice.total_amount,true);
  const footer=add('footer','',doc.body,'footer');
  add('p','Please check the medicines, batch and expiry before use. Keep this invoice for your records.',footer);
  add('p','Pharmacist / Authorised signatory',footer,'signature');
}

// Print only the invoice, leaving application navigation out of the document.
export function printInvoice(invoice, medicines, money) {
  const frame=document.createElement('iframe');
  frame.title='Invoice print document';frame.style.cssText='position:fixed;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  try { populateInvoice(frame.contentDocument,invoice,medicines,money); }
  catch(error){frame.remove();throw error;}
  const cleanup=()=>frame.remove();
  frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});
  frame.contentWindow.requestAnimationFrame(()=>{
    try{frame.contentWindow.focus();frame.contentWindow.print();}catch{cleanup();}
  });
}
