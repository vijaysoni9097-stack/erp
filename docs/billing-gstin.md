# Registered company and invoice discounts

Settings → Company Registration (`/settings/company`) stores the software
customer's company name, registered address and GSTIN. The new
`company_registration` table is created by normal SQLAlchemy startup on SQLite
and Render PostgreSQL. Administrators and superadmins may update it;
authenticated users may view it. GSTIN is format-checked, not verified against
a registration service. GET/PUT `/api/v1/settings/company` exposes these details.
Legacy `/settings/billing` remains compatible and reads company GSTIN first;
existing `billing_settings` is a fallback until company registration is saved.

New sales snapshot company identity in `sale_company_snapshots`. Invoice
reprints use the snapshot, never current company details. Older invoices without
a snapshot show details as not recorded. Company registration itself is stored
per application database, so separate local and Render databases need separate
configuration. Invoice snapshots travel with synchronized sales.

Each selected medicine accepts 0–100% discount with at most two decimal places.
The server uses the saved original selling price, multiplies by quantity, then
applies the line percentage and rounds once to two decimals with ROUND_HALF_UP.
Example: 2 × 3.25 less 10% gives 5.85, saving 0.65. The UI mirrors that calculation
using integer paise. Editing a discount clears payment confirmation.

`SaleItem.unit_price` remains the original price; `line_total` is the net
amount after discount. `sale_line_discounts` saves original price and percentage;
computed API fields expose discount_amount. Existing undiscounted records need
no backfill. No columns are added to existing local application tables: all
three new tables are created at startup, including on PostgreSQL. Company
updates cannot rewrite snapshots. Payment, change, dashboard totals and saved
invoice details use the net bill total. Existing tax calculations are unchanged.

The full cloud sync schema needs
`supabase/migrations/202610250001_company_invoice_discounts.sql` before upgraded
invoices can synchronize. It preserves allocation enforcement and idempotency,
stores company and discount snapshots and adds an authenticated capability RPC.
The backend refuses to upload company or discount metadata to an older server;
saved records stay pending instead of losing those details. This cloud migration
is separate from Render's private erp_app schema and must not be run against it.

During this change the sync cloud connection timed out, so the new cloud
migration and modified rollback integration tests could not be executed remotely.
Validate with scripts/test_cloud_sync.py and scripts/cloud_migrate.py before
applying the migration. It has NOT been applied. The Render direct-PostgreSQL
workflow does not require this sync-cloud migration. Deploy the backend first,
then the UI; startup creates the new application tables. No code was pushed or
Render deployment triggered as part of this change.
