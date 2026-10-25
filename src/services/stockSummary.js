// Catalog quantities only. Imported backup rows are not current inventory.
export const isZeroStock = medicine => medicine.stock_quantity === 0;
export const isLowStock = medicine => medicine.stock_quantity > 0 && medicine.stock_quantity <= medicine.reorder_level;
export function summarizeStock(medicines) {
  return {zero:medicines.filter(isZeroStock).length, low:medicines.filter(isLowStock).length,
    positive:medicines.filter(m=>m.stock_quantity>0).length,
    units:medicines.reduce((sum,m)=>sum+(Number.isFinite(m.stock_quantity)?m.stock_quantity:0),0)};
}
