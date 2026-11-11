export const purchaseOrderNumber = id => `PO-${String(id).padStart(6, '0')}`;
export const purchaseStatus = status => ({ pending_approval: 'Pending with Admin', approved: 'Approved', in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled' }[status] || status);
export function purchaseDate(value) {
  const iso = String(value).replace(' ', 'T');
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`);
}
export function purchaseLineTotal(item) {
  const cost = String(item.unit_price);
  const qty = String(item.quantity);
  if (!/^[1-9]\d*$/.test(qty) || Number(qty) > 2147483647) throw new Error('Enter a positive whole quantity for every medicine.');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(cost)) throw new Error('Enter a non-negative unit cost with up to two decimal places.');
  const [whole, fraction = ''] = cost.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  const total = cents * Number(qty);
  if (!Number.isSafeInteger(total) || total > 999999999999) throw new Error('The purchase order total is too large.');
  return total;
}
export function purchaseDraftTotal(items) {
  const total = items.reduce((sum, item) => sum + purchaseLineTotal(item), 0);
  if (total > 999999999999) throw new Error('The purchase order total is too large.');
  return total / 100;
}
export function purchasePayload(draft, currency) {
  if (!Number(draft.supplier_id)) throw new Error('Select a supplier.');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Wait for the pharmacy currency to load before saving.');
  if (draft.items.length < 1 || draft.items.length > 100) throw new Error('Add between 1 and 100 medicines.');
  if (new Set(draft.items.map(item => item.medicine_id)).size !== draft.items.length) throw new Error('Each medicine must appear only once.');
  purchaseDraftTotal(draft.items);
  return { request_id: draft.request_id, supplier_id: Number(draft.supplier_id), currency,
    expected_delivery: draft.expected_delivery || null, notes: draft.notes.trim() || null,
    items: draft.items.map(item => ({ medicine_id: item.medicine_id, quantity: Number(item.quantity), unit_price: Number(item.unit_price).toFixed(2) })) };
}
export function purchaseError(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => item.msg).join(' ');
  return 'The service did not confirm the save. Retry this same order to check safely.';
}
