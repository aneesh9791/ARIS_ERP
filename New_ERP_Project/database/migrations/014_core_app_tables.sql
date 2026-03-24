-- Migration 014: Core Application Tables - Departments, Services, Assets, Inventory, Vendors, Purchase Orders, Bills
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/backend/migrations/init.sql
-- Fix applied: appointments.patient_id, medical_records.patient_id, bills.patient_id changed
--   from INTEGER to VARCHAR(36) to match patients.id (VARCHAR(36)).
-- Note: users, centers, patients tables already exist from 001/002 — skipped here.
-- Note: bill_items already defined in 003_billing.sql — using IF NOT EXISTS.
-- Note: update_updated_at_column() already defined — using CREATE OR REPLACE.

-- DEPARTMENTS TABLE
CREATE TABLE IF NOT EXISTS departments (
    id          SERIAL PRIMARY KEY,
    uuid        UUID DEFAULT uuid_generate_v4() UNIQUE,
    center_id   INTEGER REFERENCES centers(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50),
    description TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SERVICES TABLE
CREATE TABLE IF NOT EXISTS services (
    id          SERIAL PRIMARY KEY,
    uuid        UUID DEFAULT uuid_generate_v4() UNIQUE,
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50) UNIQUE,
    category    VARCHAR(100),
    description TEXT,
    price       DECIMAL(10,2) NOT NULL,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- APPOINTMENTS TABLE (fix: patient_id is VARCHAR(36))
CREATE TABLE IF NOT EXISTS appointments (
    id               SERIAL PRIMARY KEY,
    uuid             UUID DEFAULT uuid_generate_v4() UNIQUE,
    patient_id       VARCHAR(36) REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    center_id        INTEGER REFERENCES centers(id) ON DELETE CASCADE,
    department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    appointment_date TIMESTAMP NOT NULL,
    appointment_time TIME NOT NULL,
    duration         INTEGER DEFAULT 30,
    status           VARCHAR(20) DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MEDICAL RECORDS TABLE (fix: patient_id is VARCHAR(36))
CREATE TABLE IF NOT EXISTS medical_records (
    id             SERIAL PRIMARY KEY,
    uuid           UUID DEFAULT uuid_generate_v4() UNIQUE,
    patient_id     VARCHAR(36) REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
    chief_complaint TEXT,
    diagnosis      TEXT,
    treatment      TEXT,
    prescription   TEXT,
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BILLS TABLE (fix: patient_id is VARCHAR(36))
-- Note: Different from patient_bills (003_billing.sql) — this is a simpler generic bills table.
CREATE TABLE IF NOT EXISTS bills (
    id             SERIAL PRIMARY KEY,
    uuid           UUID DEFAULT uuid_generate_v4() UNIQUE,
    bill_number    VARCHAR(50) UNIQUE NOT NULL,
    patient_id     VARCHAR(36) REFERENCES patients(id) ON DELETE CASCADE,
    center_id      INTEGER REFERENCES centers(id) ON DELETE CASCADE,
    doctor_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    total_amount   DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount     DECIMAL(10,2) DEFAULT 0,
    final_amount   DECIMAL(10,2) NOT NULL,
    status         VARCHAR(20) DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','cancelled','refunded')),
    payment_method VARCHAR(50),
    payment_date   TIMESTAMP,
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BILL ITEMS TABLE (generic; IF NOT EXISTS since 003 may have already created bill_items for patient_bills)
-- This version references bills(id) not patient_bills(id), so it is a separate concern.
-- Renamed to generic_bill_items to avoid collision.
CREATE TABLE IF NOT EXISTS generic_bill_items (
    id           SERIAL PRIMARY KEY,
    uuid         UUID DEFAULT uuid_generate_v4() UNIQUE,
    bill_id      INTEGER REFERENCES bills(id) ON DELETE CASCADE,
    service_id   INTEGER REFERENCES services(id) ON DELETE SET NULL,
    service_name VARCHAR(255) NOT NULL,
    quantity     INTEGER NOT NULL DEFAULT 1,
    unit_price   DECIMAL(10,2) NOT NULL,
    total_price  DECIMAL(10,2) NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ASSETS TABLE (simple version; more detailed in 016/017)
CREATE TABLE IF NOT EXISTS assets (
    id            SERIAL PRIMARY KEY,
    uuid          UUID DEFAULT uuid_generate_v4() UNIQUE,
    name          VARCHAR(255) NOT NULL,
    asset_code    VARCHAR(50) UNIQUE,
    category      VARCHAR(100),
    description   TEXT,
    purchase_date DATE,
    purchase_price DECIMAL(10,2),
    current_value  DECIMAL(10,2),
    location      VARCHAR(255),
    status        VARCHAR(20) DEFAULT 'active'
                  CHECK (status IN ('active','maintenance','retired','lost')),
    center_id     INTEGER REFERENCES centers(id) ON DELETE CASCADE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INVENTORY TABLE
CREATE TABLE IF NOT EXISTS inventory (
    id            SERIAL PRIMARY KEY,
    uuid          UUID DEFAULT uuid_generate_v4() UNIQUE,
    item_name     VARCHAR(255) NOT NULL,
    item_code     VARCHAR(50) UNIQUE,
    category      VARCHAR(100),
    description   TEXT,
    unit          VARCHAR(50),
    current_stock INTEGER NOT NULL DEFAULT 0,
    minimum_stock INTEGER NOT NULL DEFAULT 0,
    maximum_stock INTEGER NOT NULL DEFAULT 0,
    unit_price    DECIMAL(10,2),
    center_id     INTEGER REFERENCES centers(id) ON DELETE CASCADE,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VENDORS TABLE (simple version; billing_schema has vendor_master)
CREATE TABLE IF NOT EXISTS vendors (
    id             SERIAL PRIMARY KEY,
    uuid           UUID DEFAULT uuid_generate_v4() UNIQUE,
    name           VARCHAR(255) NOT NULL,
    code           VARCHAR(50) UNIQUE,
    contact_person VARCHAR(255),
    phone          VARCHAR(20),
    email          VARCHAR(255),
    address        TEXT,
    is_active      BOOLEAN DEFAULT true,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PURCHASE ORDERS TABLE
CREATE TABLE IF NOT EXISTS purchase_orders (
    id            SERIAL PRIMARY KEY,
    uuid          UUID DEFAULT uuid_generate_v4() UNIQUE,
    order_number  VARCHAR(50) UNIQUE NOT NULL,
    vendor_id     INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
    center_id     INTEGER REFERENCES centers(id) ON DELETE CASCADE,
    order_date    DATE NOT NULL,
    expected_date DATE,
    status        VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','received','cancelled')),
    total_amount  DECIMAL(10,2),
    notes         TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PURCHASE ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                  SERIAL PRIMARY KEY,
    uuid                UUID DEFAULT uuid_generate_v4() UNIQUE,
    purchase_order_id   INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
    inventory_id        INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
    item_name           VARCHAR(255) NOT NULL,
    quantity            INTEGER NOT NULL,
    unit_price          DECIMAL(10,2) NOT NULL,
    total_price         DECIMAL(10,2) NOT NULL,
    received_quantity   INTEGER DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_departments_center_id    ON departments(center_id);
CREATE INDEX IF NOT EXISTS idx_departments_active       ON departments(is_active);
CREATE INDEX IF NOT EXISTS idx_services_code            ON services(code);
CREATE INDEX IF NOT EXISTS idx_services_category        ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_active          ON services(is_active);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id  ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id   ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_center_id   ON appointments(center_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date        ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status      ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_medical_records_patient  ON medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_doctor   ON medical_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number        ON bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_patient_id         ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_center_id          ON bills(center_id);
CREATE INDEX IF NOT EXISTS idx_bills_date               ON bills(created_at);
CREATE INDEX IF NOT EXISTS idx_bills_status             ON bills(status);
CREATE INDEX IF NOT EXISTS idx_generic_bill_items       ON generic_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_assets_code              ON assets(asset_code);
CREATE INDEX IF NOT EXISTS idx_assets_center_id         ON assets(center_id);
CREATE INDEX IF NOT EXISTS idx_assets_status            ON assets(status);
CREATE INDEX IF NOT EXISTS idx_inventory_item_code      ON inventory(item_code);
CREATE INDEX IF NOT EXISTS idx_inventory_center_id      ON inventory(center_id);
CREATE INDEX IF NOT EXISTS idx_inventory_active         ON inventory(is_active);
CREATE INDEX IF NOT EXISTS idx_vendors_code             ON vendors(code);
CREATE INDEX IF NOT EXISTS idx_vendors_active           ON vendors(is_active);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_number   ON purchase_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor   ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_center   ON purchase_orders(center_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date     ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status   ON purchase_orders(status);

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_departments_updated_at    ON departments;
DROP TRIGGER IF EXISTS update_services_updated_at       ON services;
DROP TRIGGER IF EXISTS update_appointments_updated_at   ON appointments;
DROP TRIGGER IF EXISTS update_medical_records_updated_at ON medical_records;
DROP TRIGGER IF EXISTS update_bills_updated_at          ON bills;
DROP TRIGGER IF EXISTS update_assets_updated_at         ON assets;
DROP TRIGGER IF EXISTS update_inventory_updated_at      ON inventory;
DROP TRIGGER IF EXISTS update_vendors_updated_at        ON vendors;
DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;

CREATE TRIGGER update_departments_updated_at     BEFORE UPDATE ON departments     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_services_updated_at        BEFORE UPDATE ON services        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at    BEFORE UPDATE ON appointments    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_medical_records_updated_at BEFORE UPDATE ON medical_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bills_updated_at           BEFORE UPDATE ON bills           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assets_updated_at          BEFORE UPDATE ON assets          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at       BEFORE UPDATE ON inventory       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendors_updated_at         BEFORE UPDATE ON vendors         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data
INSERT INTO departments (center_id, name, code, description) VALUES
(1, 'General Medicine', 'GM',  'General medical services'),
(1, 'Radiology',        'RAD', 'Diagnostic imaging services'),
(1, 'Laboratory',       'LAB', 'Laboratory testing services')
ON CONFLICT DO NOTHING;

INSERT INTO services (name, code, category, price) VALUES
('Consultation', 'CONS001', 'Medical',    500.00),
('Blood Test',   'BT001',   'Laboratory', 200.00),
('X-Ray',        'XR001',   'Radiology',  300.00),
('Ultrasound',   'US001',   'Radiology',  800.00)
ON CONFLICT (code) DO NOTHING;
