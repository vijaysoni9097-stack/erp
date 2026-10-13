-- Initial cloud schema. Local SQLite remains the source for offline operations.
-- Private schema: no direct client grants. Sync access is enabled separately,
-- after enrolled-device authorization and conflict policies are configured.
CREATE SCHEMA IF NOT EXISTS erp;
REVOKE ALL ON SCHEMA erp FROM PUBLIC, anon, authenticated;

CREATE TABLE erp.pharmacies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE erp.employee_profiles (
    pharmacy_id uuid NOT NULL REFERENCES erp.pharmacies(id),
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    auth_user_id uuid UNIQUE REFERENCES auth.users(id),
    first_name varchar(100) NOT NULL,
    last_name varchar(100) NOT NULL,
    email varchar(150) NOT NULL,
    role text NOT NULL CHECK (role IN ('doctor','superadmin','admin','pharmacist','nurse','receptionist')),
    phone varchar(30), license_number varchar(100) NOT NULL,
    pharmacy_name varchar(150) NOT NULL, qualification varchar(150),
    years_experience integer CHECK (years_experience BETWEEN 0 AND 80),
    shift_timing varchar(50), address_line_1 varchar(200), address_line_2 varchar(200),
    country varchar(100), state varchar(100), city varchar(100), postal_code varchar(20),
    professional_bio text CHECK (length(professional_bio) <= 5000),
    photo_path text,
    disabled_at timestamptz,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (pharmacy_id,id), UNIQUE(pharmacy_id,license_number)
);
CREATE UNIQUE INDEX employee_email_unique ON erp.employee_profiles(pharmacy_id,lower(email));

CREATE TABLE erp.registered_devices (
    pharmacy_id uuid NOT NULL REFERENCES erp.pharmacies(id),
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    enrolled_by uuid NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz,
    PRIMARY KEY(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,enrolled_by) REFERENCES erp.employee_profiles(pharmacy_id,id)
);

CREATE TABLE erp.suppliers (
    pharmacy_id uuid NOT NULL REFERENCES erp.pharmacies(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
    name varchar(150) NOT NULL, contact_person varchar(100), phone varchar(30), email varchar(150), address text,
    version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
    PRIMARY KEY(pharmacy_id,id)
);
CREATE UNIQUE INDEX supplier_name_unique ON erp.suppliers(pharmacy_id,lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE erp.customers (
    pharmacy_id uuid NOT NULL REFERENCES erp.pharmacies(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
    full_name varchar(150) NOT NULL, phone varchar(30), email varchar(150), date_of_birth date,
    version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
    PRIMARY KEY(pharmacy_id,id)
);

CREATE TABLE erp.medicines (
    pharmacy_id uuid NOT NULL REFERENCES erp.pharmacies(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
    name varchar(150) NOT NULL, generic_name varchar(150), sku varchar(50) NOT NULL,
    batch_number varchar(80) NOT NULL, expiry_date date NOT NULL,
    purchase_price numeric(12,2) NOT NULL CHECK(purchase_price >= 0),
    selling_price numeric(12,2) NOT NULL CHECK(selling_price >= 0),
    reorder_level integer NOT NULL DEFAULT 10 CHECK(reorder_level >= 0), supplier_id uuid,
    version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
    PRIMARY KEY(pharmacy_id,id), UNIQUE(pharmacy_id,sku),
    FOREIGN KEY(pharmacy_id,supplier_id) REFERENCES erp.suppliers(pharmacy_id,id)
);

CREATE TABLE erp.prescriptions (
    pharmacy_id uuid NOT NULL REFERENCES erp.pharmacies(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL, doctor_name varchar(150) NOT NULL, prescribed_on date NOT NULL,
    notes text, status text NOT NULL CHECK(status IN ('pending','dispensed','cancelled')),
    version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
    PRIMARY KEY(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,customer_id) REFERENCES erp.customers(pharmacy_id,id)
);

CREATE TABLE erp.sales (
    pharmacy_id uuid NOT NULL REFERENCES erp.pharmacies(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL, customer_id uuid, prescription_id uuid,
    status text NOT NULL CHECK(status IN ('completed','voided')),
    subtotal numeric(12,2) NOT NULL CHECK(subtotal >= 0),
    tax_amount numeric(12,2) NOT NULL CHECK(tax_amount >= 0),
    total_amount numeric(12,2) NOT NULL CHECK(total_amount = subtotal + tax_amount),
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,device_id) REFERENCES erp.registered_devices(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,customer_id) REFERENCES erp.customers(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,prescription_id) REFERENCES erp.prescriptions(pharmacy_id,id)
);

CREATE TABLE erp.sale_items (
    pharmacy_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
    sale_id uuid NOT NULL, medicine_id uuid NOT NULL,
    quantity integer NOT NULL CHECK(quantity > 0), unit_price numeric(12,2) NOT NULL CHECK(unit_price >= 0),
    line_total numeric(12,2) NOT NULL CHECK(line_total = quantity * unit_price),
    PRIMARY KEY(pharmacy_id,id), UNIQUE(pharmacy_id,sale_id,medicine_id),
    FOREIGN KEY(pharmacy_id,sale_id) REFERENCES erp.sales(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,medicine_id) REFERENCES erp.medicines(pharmacy_id,id)
);

-- Immutable movements, not last-write-wins stock_quantity snapshots.
CREATE TABLE erp.stock_movements (
    pharmacy_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
    medicine_id uuid NOT NULL, device_id uuid NOT NULL, sale_id uuid,
    movement_type text NOT NULL CHECK(movement_type IN ('opening','received','adjustment','sale','void','transfer_in','transfer_out')),
    quantity_change integer NOT NULL CHECK(quantity_change <> 0), note text,
    occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(pharmacy_id,id),
    CHECK (movement_type <> 'sale' OR (quantity_change < 0 AND sale_id IS NOT NULL)),
    FOREIGN KEY(pharmacy_id,medicine_id) REFERENCES erp.medicines(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,device_id) REFERENCES erp.registered_devices(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,sale_id) REFERENCES erp.sales(pharmacy_id,id)
);
CREATE INDEX stock_movements_medicine ON erp.stock_movements(pharmacy_id,medicine_id);
CREATE UNIQUE INDEX stock_sale_once ON erp.stock_movements(pharmacy_id,sale_id,medicine_id) WHERE movement_type='sale';

CREATE TABLE erp.pharmacy_settings (
    pharmacy_id uuid PRIMARY KEY REFERENCES erp.pharmacies(id),
    default_prescription_duration_days integer NOT NULL DEFAULT 7 CHECK(default_prescription_duration_days > 0),
    auto_refill_reminders boolean NOT NULL DEFAULT true, refill_reminder_lead_days integer NOT NULL DEFAULT 3,
    allow_generic_substitution boolean NOT NULL DEFAULT true, default_pharmacy_notes text,
    low_stock_threshold integer NOT NULL DEFAULT 10, low_stock_alerts_enabled boolean NOT NULL DEFAULT true,
    expiry_alert_lead_days integer NOT NULL DEFAULT 7, expiry_alerts_enabled boolean NOT NULL DEFAULT true,
    auto_reorder_enabled boolean NOT NULL DEFAULT false, default_supplier_id uuid,
    version bigint NOT NULL DEFAULT 1 CHECK(version > 0), updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(pharmacy_id,default_supplier_id) REFERENCES erp.suppliers(pharmacy_id,id)
);
-- Printer selection remains per-device/local.
CREATE TABLE erp.notification_preferences (
    pharmacy_id uuid NOT NULL REFERENCES erp.pharmacies(id),
    event_type text NOT NULL CHECK(event_type IN ('new_prescription','low_stock','expiry_alert','purchase_order_updates','supplier_delivery_updates','system_alerts')),
    email_enabled boolean NOT NULL DEFAULT true, sms_enabled boolean NOT NULL DEFAULT true, in_app_enabled boolean NOT NULL DEFAULT true,
    version bigint NOT NULL DEFAULT 1 CHECK(version > 0), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(pharmacy_id,event_type)
);

CREATE TABLE erp.processed_operations (
    pharmacy_id uuid NOT NULL, device_id uuid NOT NULL, operation_id uuid NOT NULL,
    actor_id uuid NOT NULL, payload_hash text NOT NULL CHECK(length(payload_hash)=64),
    result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(pharmacy_id,device_id,operation_id),
    FOREIGN KEY(pharmacy_id,device_id) REFERENCES erp.registered_devices(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,actor_id) REFERENCES erp.employee_profiles(pharmacy_id,id)
);

-- Allocate cursors by locking a per-pharmacy row in the write transaction.
-- Sequences alone do not guarantee commit order and can skip concurrent changes.
CREATE TABLE erp.sync_heads (
    pharmacy_id uuid PRIMARY KEY REFERENCES erp.pharmacies(id), cursor bigint NOT NULL DEFAULT 0
);
CREATE TABLE erp.change_log (
    pharmacy_id uuid NOT NULL REFERENCES erp.pharmacies(id), cursor bigint NOT NULL,
    entity text NOT NULL, record_id uuid NOT NULL, version bigint NOT NULL CHECK(version > 0),
    operation_id uuid NOT NULL, payload jsonb NOT NULL, deleted boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(pharmacy_id,cursor)
);
CREATE TABLE erp.sync_conflicts (
    pharmacy_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL, operation_id uuid NOT NULL, entity text NOT NULL, record_id uuid NOT NULL,
    reason text NOT NULL, proposed jsonb NOT NULL, current_record jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
    PRIMARY KEY(pharmacy_id,id), UNIQUE(pharmacy_id,device_id,operation_id),
    FOREIGN KEY(pharmacy_id,device_id) REFERENCES erp.registered_devices(pharmacy_id,id)
);

-- Defense in depth. No browser/device can access these until narrowly scoped
-- authorization paths are installed. No password hashes or local session tokens.
DO $$ DECLARE t record; BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='erp' LOOP
        EXECUTE format('ALTER TABLE erp.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA erp FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA erp FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp REVOKE ALL ON FUNCTIONS FROM PUBLIC;

CREATE TABLE erp.stock_allocations (
    pharmacy_id uuid NOT NULL, device_id uuid NOT NULL, medicine_id uuid NOT NULL,
    quantity_granted bigint NOT NULL DEFAULT 0 CHECK(quantity_granted >= 0),
    quantity_consumed bigint NOT NULL DEFAULT 0 CHECK(quantity_consumed >= 0 AND quantity_consumed <= quantity_granted),
    version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(pharmacy_id,device_id,medicine_id),
    FOREIGN KEY(pharmacy_id,device_id) REFERENCES erp.registered_devices(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,medicine_id) REFERENCES erp.medicines(pharmacy_id,id)
);
ALTER TABLE erp.stock_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.stock_allocations FROM PUBLIC, anon, authenticated;

CREATE TABLE erp.offline_leases (
    pharmacy_id uuid NOT NULL, device_id uuid NOT NULL, employee_id uuid NOT NULL,
    issued_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK(expires_at > issued_at AND expires_at <= issued_at + interval '24 hours'),
    PRIMARY KEY(pharmacy_id,device_id,employee_id),
    FOREIGN KEY(pharmacy_id,device_id) REFERENCES erp.registered_devices(pharmacy_id,id),
    FOREIGN KEY(pharmacy_id,employee_id) REFERENCES erp.employee_profiles(pharmacy_id,id)
);
ALTER TABLE erp.offline_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.offline_leases FROM PUBLIC, anon, authenticated;
