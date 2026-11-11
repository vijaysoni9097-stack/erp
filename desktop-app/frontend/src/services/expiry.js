import { dayKey } from './dailySales.js';

export const EXPIRY_SOON_DAYS = 30;
export function isExpiringSoon(medicine, now = new Date()) {
  const today = dayKey(now);
  const cutoff = new Date(`${today}T12:00:00`);
  cutoff.setDate(cutoff.getDate() + EXPIRY_SOON_DAYS);
  return Number(medicine.stock_quantity) > 0 && Boolean(medicine.expiry_date)
    && medicine.expiry_date >= today && medicine.expiry_date <= dayKey(cutoff);
}
export function expiryDaysRemaining(value, now = new Date()) {
  const [year,month,day] = dayKey(now).split('-').map(Number);
  const [expiryYear,expiryMonth,expiryDay] = value.split('-').map(Number);
  return Math.round((Date.UTC(expiryYear,expiryMonth-1,expiryDay)-Date.UTC(year,month-1,day))/86400000);
}
