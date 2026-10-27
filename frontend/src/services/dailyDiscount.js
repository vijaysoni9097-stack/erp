export function validDiscount(value) {
  return value !== '' && /^\d+(\.\d{1,2})?$/.test(String(value)) && Number(value) >= 0 && Number(value) <= 100;
}
const key = (userId, day) => `erp:daily-discount:${userId}:${day}`;
export function readDailyDiscount(storage, userId, day) {
  try {
    const value = storage.getItem(key(userId, day));
    return value !== null && validDiscount(value) ? String(value) : '0';
  } catch { return '0'; }
}
export function saveDailyDiscount(storage, userId, day, value) {
  if (!validDiscount(value)) return false;
  try { storage.setItem(key(userId, day), String(Number(value))); return true; }
  catch { return false; }
}
export const applyBillDiscount = (items, value) => items.map(item => ({...item, discount_percent:Number(value)}));
