# Offline editing with Supabase synchronization

Status (October 19, 2026): the enrolled local installation uses automatic backend synchronization. Committed changes wake a background worker; it drains batches, pulls cloud updates, and retries temporary failures with backoff. Browser online/focus events also wake it. The backend must remain running. One normal online sign-in after upgrading authorizes encrypted session persistence across restarts; logout removes it. No manual Sync action is required.

Supported records include suppliers, customers, medicines, prescriptions, sales/invoices, purchase orders, and shared pharmacy/notification preferences. Stock allocation and conflict checks remain enforced. Printer preferences, passwords, PINs and identity administration retain their separate security workflows. Hosted PostgreSQL mode saves directly to its cloud database; it does not provide the local SQLite offline workflow. The bulk, sale-payment and automatic-business-sync migrations are applied to the enrolled sync cloud.

## Confirmed requirements

- Multiple devices share pharmacy data.
- Each device can create and edit records while disconnected.
- Changes synchronize after reconnecting.
- User creation, deletion, and resetting another user's password remain restricted to superadmins.
- Preserve existing local data during migration.
- Desktop/laptop deployment with local FastAPI and SQLite on each device.
- User supplied the existing Supabase project: https://nosqyzumgkripfqnqknw.supabase.co

## Decisions needed before implementation

1. Desktop runtime is confirmed. Package and start the local backend alongside the frontend; retain durable SQLite storage per installation.
2. Use the supplied existing Supabase project. Direct PostgreSQL administration access has been verified. Do not commit cloud secrets or distribute privileged database credentials to desktop clients.
3. Confirmed: allocate stock per device. Offline sales may consume only that device's allowance. Additional allocation requires an online superadmin operation. Do not reclaim an offline device's allocation before reconciling its sales.
4. Confirmed: 24 hours of offline access after online verification. A disconnected device learns about revocation when it reconnects; expired leases require online sign-in.

## Proposed data architecture

Keep durable storage on every device. Supabase PostgreSQL stores the shared authoritative data; switching the existing DATABASE_URL to a remote database alone would break offline use.

Use globally unique UUIDs for cloud record, device, and operation identities. Preserve current integer IDs locally during migration and add a unique sync UUID mapping. All relationships must use mapped UUIDs when crossing device boundaries.

Add a pharmacy/tenant ID to synchronized entities and constrain foreign keys to the same tenant. User membership and tenant assignment must be established by trusted server code. Do not allow clients to self-assign a role or pharmacy.

Current domain tables to map:

- employee_table: employee profile data and roles, with a separate cloud identity mapping.
- suppliers, customers, medicines, prescriptions.
- sales, sale_items, stock_movements.
- pharmacy_settings, notification_preferences.

Authentication sessions, password reset tokens, password hashes, PIN hashes, and device-local preferences are not ordinary synchronized business records. Cloud identity and offline authentication require an explicit enrollment and revocation design. Do not bulk-upload the local database.

Additional synchronization tables:

- pharmacies and pharmacy_memberships: tenant ownership and authorized role assignments.
- registered_devices: enrolled device identity and revocation status.
- local_outbox: operations committed in the same local transaction as their business changes.
- processed_operations: cloud deduplication keyed by tenant, device, and operation UUID.
- change_log: durable server-ordered changes with pagination and resumable cursors.
- local_sync_state: last applied server cursor and retry state.
- sync_conflicts: rejected edits with enough detail for explicit resolution.

## Push and pull protocol

1. Commit a local edit and its outbox operation atomically. Never report saved before durable local commit.
2. Upload pending operations with a stable operation UUID and base record version.
3. On the cloud, authorize tenant, device, user, role, and operation before applying changes. Check permissions at sync time, not only at the time of the local edit.
4. Apply each operation and its deduplication receipt in one transaction. Sales, line items, and associated stock movements form one operation.
5. Return the same result when an operation is retried after a lost response.
6. Pull ordered changes after the stored cursor. Apply each page and advance the local cursor atomically.
7. Retain tombstones for deletion until the retention/enrollment policy allows removal. A long-offline device may need a fresh snapshot before replaying its pending operations.
8. Use exponential backoff with jitter, automatic reconnection retries, and clear pending/conflict counts. Realtime notifications may trigger a pull but never replace the durable change log.

## Conflicts and stock

Use version checks for profile, supplier, and medicine edits. Surface conflicting changes; do not resolve conflicts using device timestamps, which may be wrong.

Represent stock changes as immutable movements and preserve sale identifiers across retries. Do not synchronize stock_quantity with last-write-wins. Inventory summaries must derive from accepted movements and account for pending local operations without double-counting.

Offline stock overselling needs a chosen business policy. If sales remain provisional until cloud acceptance, label them clearly. If strict prevention is required, allocate stock to devices or require connectivity for the affected transaction.

Voids and corrections should create compensating operations rather than erase financial history.

## Authorization

Enable RLS and explicit grants for any Supabase tables exposed through its Data API. Test cross-tenant access and role escalation. If sync is implemented through a privileged cloud API, that API must enforce equivalent checks itself; RLS must not be assumed to protect requests using a bypass credential.

Admin operations require online authorization in the proposed design. Local-only administrator access cannot by itself authorize cloud-wide account changes. Offline access is limited to enrolled users under the chosen offline authorization policy.

## Delivery and verification

1. Confirm device runtime and stock/offline authorization policies.
2. Use the existing project supplied by the user (connection verified).
3. Add versioned, reviewed schema migrations and authorization tests.
4. Implement identity enrollment and local schema migration with backups.
5. Implement and test sync for suppliers first, then extend to transactional domains.
6. Replace remaining demo frontend data with durable API operations.
7. Verify two-device offline edits, process restarts, retries after lost acknowledgments, conflicting updates, deletions, expired credentials, user revocation, and tenant isolation.
8. Verify stock and sales conservation under duplicate and reordered delivery before production use.

Supabase references:
- https://supabase.com/docs/guides/database/tables
- https://supabase.com/docs/guides/database/postgres/row-level-security


## Applied and tested

- `supabase/migrations/202610110001_offline_schema.sql`: 18 pharmacy-scoped tables, composite foreign keys, RLS, no direct client table grants.
- `202610110002_sync_api.sql`: optimistic versions, idempotent operation receipts, conflict records, ordered pull cursors and 24-hour leases.
- `202610110003_stock_sync.sql`: online receipt/allocation and atomic allocated sales; duplicate delivery does not duplicate inventory movements.
- `202610110004_device_credentials.sql`: device secret verification before any public RPC. Only digests are stored in the cloud.
- `scripts/cloud_migrate.py`: checksum-verified migrations; validates in a rolled-back transaction unless `--apply` is specified.
- `scripts/test_cloud_sync.py`: cloud integration checks with temporary data; all fixture changes roll back.
- Backend: outbox + local record saved in one transaction; stable retry envelope; atomic pull/cursor; preserved conflicts; allocation refresh; offline lease checks; status/run/conflict APIs.
- Frontend: Synchronization page, background retries, and live local supplier create/edit/delete.

## Activation prerequisites

The development backend `.env` still needs `SUPABASE_PUBLISHABLE_KEY` and the
admin-only `SUPABASE_SECRET_KEY` for Supabase Auth provisioning. Do not share the
secret key in chat or ship it to desktops. Device runtime needs only the
publishable key, signed-in user's short-lived access token, and its own random
installation credential.

Remaining work before activation:

1. Provision cloud Auth identities and pharmacy membership using the supported Auth API. Local hashes cannot be treated as cloud credentials.
2. Implement cloud account administration so create/delete/reset applies centrally; current local-only identity mutation endpoints are blocked if sync mode is enabled to avoid divergence.
3. Enroll each installation and save its device ID, pharmacy ID, and random secret locally; store only the secret hash in the cloud.
4. Migrate current records with UUID mappings and opening stock exactly once, then allocate stock to the initial device. Do not enable against existing un-mapped records.
5. Finish API integration for business pages that still show demo data. Supplier UI is connected; do not assume the whole ERP is integrated.
6. Verify live two-device authentication, reconnection, inventory allocations, and initial-data migration before enabling `SYNC_ENABLED`.

Current local mode intentionally continues unchanged while these prerequisites
are pending. Cloud tables contain schema only, not migrated pharmacy records.
