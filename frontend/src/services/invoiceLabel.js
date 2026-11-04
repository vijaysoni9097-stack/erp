export function invoiceLabel(invoice) {
  const details = invoice.import_details;
  if (details?.kind === 'opening_balances') return `Opening balance · ${details.source_reference}`;
  return details?.source_reference || `INV-${String(invoice.id ?? invoice.sale_id).padStart(6, '0')}`;
}
