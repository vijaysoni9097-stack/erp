// The API's timezone-less timestamps are UTC database timestamps.
export function saleDate(value) {
  const iso = String(value || '').replace(' ', 'T');
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`);
}

export function dayKey(date = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export const toPaise = value => Math.round(Number(value) * 100);
export const hasCollection = sale => sale.payment?.amount != null && Number.isFinite(Number(sale.payment.amount));

export function summarizeDailySales(sales, day = dayKey(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const invoices = sales.filter(sale => {
    const date = saleDate(sale.created_at);
    return sale.status === 'completed' && Number.isFinite(date.getTime()) && dayKey(date, timeZone) === day;
  }).sort((a, b) => saleDate(b.created_at) - saleDate(a.created_at) || Number(b.id) - Number(a.id));
  return {
    invoices,
    total: invoices.reduce((sum, sale) => sum + toPaise(sale.total_amount), 0) / 100,
    collected: invoices.reduce((sum, sale) => sum + (hasCollection(sale) ? toPaise(sale.payment.amount) : 0), 0) / 100,
    unrecorded: invoices.filter(sale => !hasCollection(sale)).length,
  };
}
