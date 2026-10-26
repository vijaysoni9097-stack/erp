# Purchase order creation

Purchase Orders (`/purchase-orders`) and Orders (`/orders`) use the same saved data.
The dashboard's New Purchase Order button opens `/purchase-orders?new=1` directly.

Choose an existing supplier, search and add up to 100 catalog medicines, enter whole
quantities and unit costs, and optionally enter expected delivery and notes. The
backend calculates totals using decimals, saves a numbered order in
`pending_approval`, and retains the supplier/medicine names and currency as snapshots.
Creating an order does not change inventory or send it to the supplier. Approval,
supplier dispatch and goods receiving are separate workflows.

The list has search, status filtering, pagination and refresh. Clicking a PO number
opens saved line items and totals. Dashboard figures come from saved orders; the
monthly monetary figure includes only orders in the displayed pharmacy currency
and excludes cancelled orders. It describes order value, not payment or spending.

The backend implements authenticated `GET/POST /api/v1/purchase-orders` and
`GET /api/v1/purchase-orders/{order_id}`. Pharmacist, admin and superadmin roles
can use them. POST requires a UUID `request_id`; retrying the exact request returns
the saved order, while changed payloads or another actor reusing it return 409.
After an uncertain save the form preserves and locks that request for safe retry.
Keep the page open until the save is confirmed; closing the dialog preserves the
draft, while navigating away or reloading discards an unsaved draft.

Backend files are in this repository under `backend/`:
`app/models/purchase_orders.py`, `app/schemas_purchase_orders.py`,
`app/api/purchase_orders.py`, the API registry, and
`tests/test_purchase_orders.py`. Startup creates the two new purchasing tables
through the existing SQLAlchemy schema initialization. Restart the backend after
installing these files. Orders persist locally and automatically synchronize through the durable outbox.
The cloud requires migration `202610190001_automatic_business_sync.sql`.
Creating or synchronizing an order never changes stock.

Validation: `npm test`, `npm run build`, and the
backend's `test_purchase_orders.py` and `test_auth.py` suites. A browser check
against an isolated SQLite-backed API verified creation, saved detail, exact
amounts and persistence after reload without creating real pharmacy orders.
