// Apply each percentage to its medicine line, rounded once to paise.
export function discountLine(price, quantity, percent = 0) {
  const rate = Number(percent);
  if (percent === '' || !Number.isFinite(rate) || rate < 0 || rate > 100 || Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-7) return null;
  const grossUnit = Math.round(Number(price) * 100);
  if (!Number.isSafeInteger(grossUnit) || grossUnit < 0) return null;
  if (!Number.isSafeInteger(quantity) || quantity < 1) return null;
  const gross = BigInt(grossUnit) * BigInt(quantity);
  const net = (gross * BigInt(10000 - Math.round(rate * 100)) + 5000n) / 10000n;
  return { gross: Number(gross)/100, discount: Number(gross-net)/100, total: Number(net)/100 };
}
