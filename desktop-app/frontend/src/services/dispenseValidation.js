import { discountLine } from './discounts.js';
import { isSellable } from './stockSummary.js';
import { dayKey } from './dailySales.js';

export function sellableMedicines(medicines, now = new Date()) {
  // Array.filter passes its row index as argument two; never pass isSellable directly.
  return medicines.filter(medicine => isSellable(medicine, now));
}

export function validateDispenseLine(item, medicine, now = new Date()) {
  if (!medicine) return 'Medicine is no longer available. Remove it and refresh stock.';
  if (!medicine.expiry_date) return 'Expiry date is missing. This medicine cannot be sold.';
  if (medicine.expiry_date < dayKey(now)) return `Batch ${medicine.batch_number} expired on ${medicine.expiry_date}. Remove it from the bill.`;
  if (!isSellable(medicine, now)) return 'No sellable stock remains. Remove it or refresh stock.';
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) return 'Enter a whole quantity of at least 1.';
  if (item.quantity > medicine.stock_quantity) return `Only ${medicine.stock_quantity} units are available; reduce the quantity or refresh stock.`;
  if (!discountLine(medicine.selling_price, item.quantity, item.discount_percent)) return 'Check the selling price and enter a discount from 0–100% with at most two decimal places.';
  return null;
}
