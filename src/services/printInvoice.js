import { saleDate } from './dailySales';

// Print a saved invoice in an isolated document so navigation and dialogs stay out.
export function printInvoice(invoice, medicines, money) {
  const frame = document.createElement('iframe');
  frame.title = 'Invoice print document';
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const style = doc.createElement('style');
  style.textContent = 'body{font:14px Arial,sans-serif;color:#182e29;margin:24px}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:10px 6px;border-bottom:1px solid #ddd}th:not(:first-child),td:not(:first-child){text-align:right}p{line-height:1.6}@page{margin:12mm}';
  doc.head.appendChild(style);
  const add = (tag, text, parent = doc.body) => {
    const node = doc.createElement(tag); node.textContent = text; parent.appendChild(node); return node;
  };
  const number = `INV-${String(invoice.id).padStart(6, '0')}`;
  doc.title = number;
  add('h1', `Pharmacy bill · ${number}`);
  if (invoice.company?.company_name) add('h2', invoice.company.company_name);
  if (invoice.company?.address) add('p', invoice.company.address);
  add('p', `GSTIN: ${invoice.company?.gstin || 'Not recorded on this invoice'}`);
  add('p', `Date: ${saleDate(invoice.created_at).toLocaleString('en-IN')}`);
  if (invoice.patient) add('p', `Patient: ${invoice.patient}`);
  if (invoice.doctor) add('p', `Prescribed by: ${invoice.doctor}`);
  const table = add('table', '');
  const head = add('tr', '', add('thead', '', table));
  ['Medicine / batch', 'Quantity', 'Original unit price', 'Discount %', 'Amount'].forEach(label => add('th', label, head));
  const body = add('tbody', '', table);
  const catalog = new Map(medicines.map(m => [m.id, m]));
  invoice.items.forEach(item => {
    const medicine = catalog.get(item.medicine_id);
    const row = add('tr', '', body);
    [medicine ? `${medicine.name} · Batch ${medicine.batch_number}` : `Medicine #${item.medicine_id}`, item.quantity, money(item.original_unit_price ?? item.unit_price), `${Number(item.discount_percent || 0)}%`, money(item.line_total)].forEach(value => add('td', value, row));
  });
  const discount = invoice.items.reduce((sum,item)=>sum+Math.round(Number(item.discount_amount||0)*100),0)/100;
  add('p', `Discount saved: ${money(discount)}`);
  add('p', `Subtotal: ${money(invoice.subtotal)} · GST / tax recorded: ${money(invoice.tax_amount)}`);
  add('h2', `Bill total: ${money(invoice.total_amount)}`);
  if (invoice.payment) {
    const p = invoice.payment;
    add('p', `Payment: ${p.method.replaceAll('_', ' ')} · Collected: ${money(p.amount)} · Tendered: ${money(p.tendered)} · Change: ${money(p.change)}`);
    if (p.reference) add('p', `Payment reference: ${p.reference}`);
  } else add('p', 'Payment collection not recorded.');
  const cleanup = () => frame.remove();
  frame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
  // Give the isolated document a frame to finish layout before opening print.
  frame.contentWindow.requestAnimationFrame(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch { cleanup(); }
  });
}
