# Migrating a new pharmacy

Sign in using a **superadmin** account and open **Settings → Import Existing Data**.
Developer/operator accounts use the existing superadmin role; this application has no separate developer login role. Both the UI and API restrict this feature to superadmins.

1. Export records from the previous software as **CSV UTF-8**. Excel exports must be saved as CSV UTF-8 before uploading.
2. Choose the data type and download its CSV template. Copy the exported values into the corresponding template columns. Imports do not accept another application's database IDs.
3. Import **suppliers first**, then **medicines and current opening stock**, then **customers/patients**, then **historical sales** and **opening customer balances**. Each file may contain up to 5,000 CSV data rows and 2 MB of UTF-8 data. Split larger exports into files with the same headers, keeping all lines of an invoice together.
4. Select a file and click **Validate and Preview**. Correct any reported errors in the CSV and preview it again. The preview shows up to ten valid records; validation checks the entire file.
5. Review the preview and click **Import … Records**. The whole file is saved in one database transaction. A failed validation or database write saves no records from that request.

The feature adds master records, historical invoices and customer receivables to the current pharmacy database. Historical invoices may include the original prescriber and company details. It uses the application's existing sales and credit workflows. Standalone prescription histories, purchasing documents, supplier payables, returns, employee credentials and application settings have separate data models and are outside these five templates.

## Columns

All templates use comma separators and a header row. Optional columns can be omitted or left blank. Extra and repeated columns are rejected. Quote values containing commas or line breaks using standard CSV quoting. Medicine expiry dates and dates of birth use `YYYY-MM-DD`. Financial timestamps require a timezone, for example `2025-03-31T12:00:00+05:30` or `2025-03-31T06:30:00Z`, and cannot be in the future. Timestamps are stored in UTC. Prices use plain decimal values with up to two decimal places, without grouping separators or currency symbols.

| Type | Required columns | Optional columns |
| --- | --- | --- |
| Suppliers | `name` | `contact_person`, `phone`, `email`, `address` |
| Medicines | `name`, `sku`, `batch_number`, `expiry_date`, `purchase_price`, `selling_price` | `generic_name`, `stock_quantity`, `reorder_level`, `unit`, `supplier_name` |
| Customers | `full_name` | `phone`, `email`, `date_of_birth` |
| Historical sales | `invoice_ref`, `line_ref`, `sold_at`, `balance_as_of`, `sku`, `quantity`, `unit_price`, `invoice_total`, `outstanding_amount` | `customer_name`, `customer_phone`, `discount_percent`, `line_total`, `tax_amount`, `initial_paid_amount`, `payment_method`, `payment_reference`, `status`, `prescribed_by`, `company_name`, `company_address`, `company_gstin`, `notes` |
| Opening customer balances | `balance_ref`, `as_of`, `customer_name`, `customer_phone`, `amount` | `notes` |

Medicine quantities are whole, nonnegative numbers. Opening stock defaults to zero, reorder level to ten, and unit to `number`. Each SKU must be unique across the catalog; give separate batches separate SKUs. `supplier_name` must match exactly one active supplier, ignoring letter case and surrounding whitespace. Opening quantities produce stock ledger entries labeled `Migration opening stock`.

Customer mobiles use the same normalization as checkout: ten-digit Indian numbers default to `+91`; international numbers should include the country code. Customers sharing a mobile number can have different names. Duplicate detection compares normalized name, phone, email and date of birth together. Review potential duplicates with different details before importing.

Existing supplier names and medicine SKUs (including archived records) and duplicate records within the file are rejected, ignoring case and surrounding whitespace. Imports never overwrite existing records or top up existing stock. Use the stock adjustment/receipt workflow for existing medicines.

## Historical sales

Use one row per medicine line, with a unique `line_ref` within each `invoice_ref`. Repeat all invoice-level fields identically on every row of an invoice. Every SKU must match exactly one active medicine. Customer name and mobile must resolve to exactly one active customer; if a fully paid anonymous invoice has no customer details, leave both blank. A prescriber requires a customer.

`quantity` is a positive whole number. Each discounted line is calculated as `quantity × unit_price × (1 - discount_percent / 100)`, rounded half up to two decimals. Optional `line_total` must match that result. `invoice_total` must match the sum of every line plus `tax_amount`; tax is an invoice amount, repeated on each row. For legacy bill discounts, allocate the discount across the exported lines or use net unit prices that reconcile to the source totals. A mismatch blocks the entire file for correction.

`sold_at` is the original sale timestamp. `balance_as_of` is the migration cutoff timestamp, on or after the sale. `outstanding_amount` is the amount still unpaid at that cutoff and is required; explicitly enter zero for fully paid invoices. Positive outstanding requires the customer's name and mobile and creates a collectible Credit Accounts entry. `status` defaults to `completed`; `voided` invoices require zero outstanding and no payment and are excluded from sales totals.

`initial_paid_amount`, when known, is the net amount collected at the **original checkout**, with `payment_method` (`cash`, `upi`, `card`, `bank_transfer`) and optional `payment_reference`. Leave these fields blank when the original payment is unknown. The original checkout amount plus outstanding cannot exceed the invoice total. Any remaining paid amount is retained as **paid before migration**, excluding recorded checkout payment. This balance snapshot preserves earlier repayments without inventing their dates or cash collection entries. New repayments after migration appear in normal payment history and collection reports.

Historical invoices retain their original dates, references, prices, discounts, tax, company snapshot and prescriber where supplied. They appear in sales history and revenue for their original dates. **They do not reduce current stock or create stock movements.** Import current physical stock once with the medicine template. Neither historical invoices nor opening balances enqueue WhatsApp notifications.

Example two-line invoice (customers and SKUs must already exist):

```csv
invoice_ref,line_ref,sold_at,balance_as_of,customer_name,customer_phone,sku,quantity,unit_price,invoice_total,outstanding_amount
OLD-2025-001,1,2025-01-10T12:00:00+05:30,2025-03-31T23:59:59+05:30,Asha Sharma,9876543210,MED-BATCH-1,2,10.00,35.00,5.00
OLD-2025-001,2,2025-01-10T12:00:00+05:30,2025-03-31T23:59:59+05:30,Asha Sharma,9876543210,MED-BATCH-2,1,15.00,35.00,5.00
```

## Opening customer balances

Use opening balances when original invoice details are unavailable: one positive `amount` per customer at `as_of`. Customer name and normalized mobile must match exactly one active customer. These entries appear as **Opening balance · source reference** in Credit Accounts, support normal single/bulk collection, and print as balance statements. They are excluded from sales history, units and revenue, and never change stock.

For each customer's migrated debt, choose **unpaid historical invoices OR one opening balance**. The importer rejects an opening balance if the customer already has outstanding credit or an imported opening balance. It rejects additional unpaid historical invoices for a customer with an imported opening balance, even after that balance is paid. Fully paid historical invoices can coexist with an opening balance.

Invoice and balance source references share a unique namespace, ignoring case and surrounding whitespace. Prefix references with a source/year where the old software reused numbers, such as `OLD-2025-001`. Re-uploading an altered or reordered file with existing references is rejected.

## Audit and retries

Each completed file stores an audit receipt containing the operator ID/email, filename, type, imported record count, timestamp and content fingerprint. For historical sales, the imported count is the number of invoices, and preview also shows the source CSV row count. Retrying the same completed CSV (including after a timeout) returns the receipt and adds no records. Changing the filename or CRLF/LF line endings does not cause another import. Changed file contents are revalidated against current records.

## API

Authenticated superadmin endpoints:

- `GET /api/v1/data-import/templates/{kind}` downloads a header-only template.
- `POST /api/v1/data-import/preview` validates without saving records.
- `POST /api/v1/data-import` revalidates and commits the file atomically.

POST bodies contain `kind` (`suppliers`, `medicines`, `customers`, `sales` or `opening_balances`), `filename` and `content` (the CSV text). Validation responses include CSV `row_count`, logical `record_count`, total error count and the first 100 row errors. Successful commits return an import reference, imported count and `already_imported` flag. The new audit and invoice identity tables are created by the existing application startup schema initialization.
