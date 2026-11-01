// Checkout values are validated again against current prices by the API.
export function checkoutPayment({mode, method, received, total, confirmed, reference, phone}) {
  const tendered=mode==='credit'?0:mode==='partial'||method==='cash'?Number(received):total;
  const outstanding=Math.max(0,Math.round((total-tendered)*100)/100);
  const precise=Number.isFinite(tendered)&&tendered>=0&&Number.isSafeInteger(Math.round(tendered*100))&&Math.abs(tendered*100-Math.round(tendered*100))<0.00001;
  const valid=precise&&(mode==='credit'?total>0:mode==='partial'?received!==''&&tendered>0&&tendered<total: (method!=='cash'||received!=='')&&tendered>=total)&&
    (tendered===0||confirmed)&&(tendered===0||method==='cash'||Boolean(reference.trim()))&&(outstanding===0||Boolean(phone));
  return {tendered,outstanding,valid};
}

export const customerDues = (items, name) => items.filter(invoice =>
  invoice.customer_name.trim().toLowerCase() === name.trim().toLowerCase() && Number(invoice.outstanding) > 0);

export const duesTotal = items => items.reduce((cents, invoice) => cents + Math.round(Number(invoice.outstanding) * 100), 0) / 100;

// Fetch every page so "all" also includes invoices beyond the account preview.
export async function loadCustomerDues(get, phone, name) {
  const items = new Map();
  let offset = 0;
  while (true) {
    const {data} = await get('/credits', {timeout:90000, params:{phone, offset, limit:100}});
    for (const invoice of customerDues(data.items, name)) items.set(invoice.sale_id, invoice);
    offset += data.items.length;
    if (offset >= data.count) break;
    if (!data.items.length) throw new Error('Credit records changed. Retry selection.');
  }
  return [...items.values()];
}
