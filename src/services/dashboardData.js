import { isExpiringSoon } from './expiry.js';
import { dayKey, saleDate, toPaise } from './dailySales.js';

export function dashboardData({ medicines, sales, orders, prescriptions, customers, suppliers }, now = new Date()) {
  const today = dayKey(now);
  const low = medicines.filter(m => m.stock_quantity <= m.reorder_level);
  const expiry = medicines.filter(m => isExpiringSoon(m, now)).sort((a,b) => a.expiry_date.localeCompare(b.expiry_date));
  const completed = sales.filter(s => s.status === 'completed' && Number.isFinite(saleDate(s.created_at).getTime()));
  const todayPayments = { cash: 0, card: 0, upi: 0, bank_transfer: 0, unrecorded: 0 };
  for (const sale of completed) {
    if (dayKey(saleDate(sale.created_at)) !== today) continue;
    const method = sale.payment?.method;
    if (['cash', 'card', 'upi', 'bank_transfer'].includes(method) && sale.payment.amount != null) {
      todayPayments[method] += toPaise(sale.payment.amount);
    } else todayPayments.unrecorded += toPaise(sale.total_amount);
  }
  for (const method of Object.keys(todayPayments)) todayPayments[method] /= 100;
  const salesByPeriod = {};
  for (const period of ['This Week', 'This Month', 'This Year']) {
    const start = new Date(`${today}T12:00:00`);
    if (period === 'This Week') start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    else if (period === 'This Month') start.setDate(1);
    else start.setMonth(0, 1);
    const buckets = new Map();
    for (const date = new Date(start); dayKey(date) <= today; period === 'This Year' ? date.setMonth(date.getMonth()+1) : date.setDate(date.getDate()+1)) {
      const key = dayKey(date).slice(0, period === 'This Year' ? 7 : 10);
      buckets.set(key, { name: date.toLocaleDateString('en-IN', period === 'This Year' ? {month:'short'} : {day:'numeric',month:'short'}), units:0, revenue:0 });
    }
    for (const sale of completed) {
      const key = dayKey(saleDate(sale.created_at)).slice(0, period === 'This Year' ? 7 : 10);
      const bucket = buckets.get(key);
      if (bucket && dayKey(saleDate(sale.created_at)) <= today) { bucket.units += sale.items.reduce((n,i)=>n+i.quantity,0); bucket.revenue += toPaise(sale.total_amount); }
    }
    salesByPeriod[period] = [...buckets.values()].map(b=>({...b,revenue:b.revenue/100}));
  }
  const stockByCategory = [
    {name:'Available',value:0,color:'#4a9b8f'}, {name:'Low stock',value:0,color:'#dfc251'}, {name:'Expired',value:0,color:'#cb3886'},
  ];
  for (const m of medicines) stockByCategory[m.expiry_date < today ? 2 : m.stock_quantity <= m.reorder_level ? 1 : 0].value += Math.max(0,m.stock_quantity);
  const catalog = new Map(medicines.map(m=>[m.id,m]));
  const units = new Map();
  for (const sale of completed) for (const item of sale.items) units.set(item.medicine_id,(units.get(item.medicine_id)||0)+item.quantity);
  const top = [...units].sort((a,b)=>b[1]-a[1]).slice(0,5);
  const customerMap = new Map(customers.map(c=>[c.id,c.full_name]));
  const supplierMap = new Map(suppliers.map(s=>[s.id,s.name]));
  return {
    todayPayments,
    todaySales:completed.filter(s=>dayKey(saleDate(s.created_at))===today).reduce((sum,s)=>sum+toPaise(s.total_amount),0)/100,
    totalMedicines:medicines.length, pendingOrders:orders.filter(o=>['pending_approval','approved','ordered','partially_received'].includes(o.status)).length,
    low, expiry, salesByPeriod, stockByCategory, totalStock:stockByCategory.reduce((n,c)=>n+c.value,0),
    recentPrescriptions:[...prescriptions].sort((a,b)=>b.prescribed_on.localeCompare(a.prescribed_on)||b.id-a.id).slice(0,5).map(p=>{
      const name=customerMap.get(p.customer_id)||`Patient #${p.customer_id}`;
      const items=completed.filter(s=>s.prescription_id===p.id).flatMap(s=>s.items);
      return [name,`PR-${p.id}`,items.map(i=>catalog.get(i.medicine_id)?.name||`Medicine #${i.medicine_id}`).join(', ')||'Not recorded',p.doctor_name,p.status,'View',name.split(' ').map(n=>n[0]).slice(0,2).join('')];
    }),
    expiryAlerts:expiry.slice(0,5).map(m=>{const days=Math.round((new Date(`${m.expiry_date}T12:00:00`)-new Date(`${today}T12:00:00`))/86400000);return [m.name,`Batch ${m.batch_number}`,`${days} days`,days<=7?'critical':'warning',m.id];}),
    lowStockMedicines:low.slice(0,5).map(m=>[m.name,m.batch_number,m.stock_quantity,m.reorder_level,supplierMap.get(m.supplier_id)||'Not assigned',m.id]),
    topSellingMedicines:top.map(([id,n])=>[catalog.get(id)?.name||`Medicine #${id}`,`${n} units`,n/top[0][1]*100,id]),
    supplierRows:suppliers.map(s=>{const count=orders.filter(o=>o.supplier_id===s.id&&o.created_at&&dayKey(saleDate(o.created_at)).slice(0,7)===today.slice(0,7)).length;return [s.name,`${count} orders this month`,'','',s.id,count];}).sort((a,b)=>b[5]-a[5]).slice(0,5),
  };
}


export function salesTrendForDates(sales, from, to) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00`).getTime()) && dayKey(new Date(`${value}T12:00:00`)) === value;
  if (!valid(from) || !valid(to) || from > to) return [];
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const monthly = (end - start) / 86400000 > 92;
  const buckets = new Map();
  if (monthly) start.setDate(1);
  for (const date = new Date(start); dayKey(date) <= to; monthly ? date.setMonth(date.getMonth()+1) : date.setDate(date.getDate()+1)) {
    const key = dayKey(date).slice(0, monthly ? 7 : 10);
    buckets.set(key, {name:date.toLocaleDateString('en-IN', monthly ? {month:'short',year:'numeric'} : {day:'numeric',month:'short'}), units:0, revenue:0});
  }
  for (const sale of sales) {
    if (sale.status !== 'completed') continue;
    const date = saleDate(sale.created_at);
    if (!Number.isFinite(date.getTime())) continue;
    const day = dayKey(date);
    if (day < from || day > to) continue;
    const bucket = buckets.get(day.slice(0, monthly ? 7 : 10));
    if (bucket) { bucket.units += sale.items.reduce((sum,item)=>sum+item.quantity,0); bucket.revenue += toPaise(sale.total_amount); }
  }
  return [...buckets.values()].map(bucket=>({...bucket,revenue:bucket.revenue/100}));
}
