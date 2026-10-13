# Supplier import — 12 October 2026

Imported 564 supplier contact records from `Surya_Pharmacy.dbo.vendorProfile`
through DBeaver's `master` connection into the backend's local `temp.db`.
The pre-existing supplier was preserved: the local total is 565.
The source was queried read-only. Nothing was uploaded to Supabase.

Mapping: vendorName → name; contactPerson → contact_person; first available
contactNo1/2/3 → phone; emailId → email. Address, city and state are combined
in address, followed by any additional phone numbers. Punctuation-only
placeholders are treated as empty. Four duplicate-name groups retain separate
records with their vendor IDs appended to the names.

The local `supplier_import_sources` table retains original contact records,
source IDs, destination IDs, export checksum and import time. No supplier data
is stored in this repository. A database backup exists in the backend's ignored
`backups/` directory, named `before-supplier-import-20261012T050251946535Z.sqlite3`.

`scripts/import_suppliers.py` defaults to dry-run. It validates source records,
refuses existing name collisions or changed previously imported records, and
skips unchanged imported source IDs. `--apply` creates a backup and imports in
one transaction. Use it only for this source and while cloud sync is disabled.

Validation completed: all 564 mapped records matched the export, database
integrity and foreign keys passed, the supplier API query and response schema
returned 565 records, and a repeat import inserted zero records. Copy-based
tests also checked preservation of existing suppliers and refusal of modified
source records. This import covers supplier contacts, not purchase balances,
stock, invoices or patient information.
