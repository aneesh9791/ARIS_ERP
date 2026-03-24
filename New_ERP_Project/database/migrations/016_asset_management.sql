-- Migration 016: Enhanced Asset Management
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/backend/migrations/enhanced_asset_management.sql
-- Fix applied: DATEDIFF(date1, date2) MySQL syntax replaced with
--   (date1 - CURRENT_DATE) cast to INTEGER for PostgreSQL compatibility.
--   Used in asset_contract_summary view and check_contract_expirations function.
-- Note: asset_vendors CREATE TABLE IF NOT EXISTS — stub created in 015 will be extended
--   seamlessly since this uses the same IF NOT EXISTS pattern with full columns.

-- Extend asset_master for intangible asset support
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS asset_category         VARCHAR(20) DEFAULT 'TANGIBLE';
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS asset_subtype          VARCHAR(50);
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS license_key            VARCHAR(100);
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS license_expiry         DATE;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS vendor_id              INTEGER;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS contract_start_date    DATE;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS contract_end_date      DATE;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS renewal_reminder_days  INTEGER DEFAULT 30;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS total_expenses         DECIMAL(12,2) DEFAULT 0;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS lifecycle_status       VARCHAR(20) DEFAULT 'ACTIVE';
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS performance_rating     INTEGER CHECK (performance_rating >= 1 AND performance_rating <= 5);
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS utilization_rate       DECIMAL(5,2) CHECK (utilization_rate >= 0 AND utilization_rate <= 100);
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS last_maintenance_date  DATE;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS next_maintenance_date  DATE;

-- New asset types for intangible assets
INSERT INTO asset_types (type_code, name, description, depreciation_method, useful_life_years) VALUES
('SOFTWARE',       'Software License',   'Software applications and licenses',             'STRAIGHT_LINE', 3),
('CLOUD_SERVICE',  'Cloud Service',      'Cloud-based services and subscriptions',          'STRAIGHT_LINE', 1),
('DOMAIN',         'Domain Name',        'Domain names and hosting',                        'STRAIGHT_LINE', 1),
('SSL_CERT',       'SSL Certificate',    'SSL certificates and security',                   'STRAIGHT_LINE', 1),
('DATABASE',       'Database License',   'Database management systems',                     'STRAIGHT_LINE', 5),
('ANTIVIRUS',      'Antivirus License',  'Antivirus and security software',                 'STRAIGHT_LINE', 1),
('BACKUP_SERVICE', 'Backup Service',     'Cloud backup and recovery services',              'STRAIGHT_LINE', 1),
('MONITORING',     'Monitoring Tool',    'System monitoring and analytics tools',           'STRAIGHT_LINE', 3),
('VPN_SERVICE',    'VPN Service',        'VPN and network security services',               'STRAIGHT_LINE', 1),
('ERP_LICENSE',    'ERP License',        'Enterprise resource planning licenses',           'STRAIGHT_LINE', 5)
ON CONFLICT (type_code) DO NOTHING;

-- ASSET VENDORS TABLE (full definition; stub was created in 015)
CREATE TABLE IF NOT EXISTS asset_vendors (
    id             SERIAL PRIMARY KEY,
    vendor_code    VARCHAR(20) NOT NULL UNIQUE,
    vendor_name    VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    email          VARCHAR(100),
    phone          VARCHAR(20),
    address        TEXT,
    vendor_type    VARCHAR(20) NOT NULL, -- HARDWARE, SOFTWARE, SERVICE, MAINTENANCE
    payment_terms  VARCHAR(50),
    contract_type  VARCHAR(20), -- FIXED, HOURLY, PER_INCIDENT, ANNUAL
    rating         INTEGER CHECK (rating >= 1 AND rating <= 5),
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active         BOOLEAN DEFAULT true
);

-- Add missing columns to stub if they don't exist yet
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS vendor_code    VARCHAR(20);
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100);
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS email          VARCHAR(100);
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS phone          VARCHAR(20);
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS address        TEXT;
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS vendor_type    VARCHAR(20);
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS payment_terms  VARCHAR(50);
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS contract_type  VARCHAR(20);
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS rating         INTEGER CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS notes          TEXT;
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE asset_vendors ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ASSET CONTRACTS TABLE
CREATE TABLE IF NOT EXISTS asset_contracts (
    id                    SERIAL PRIMARY KEY,
    asset_id              INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    contract_type         VARCHAR(20) NOT NULL, -- SLA, AMC, CMS, WARRANTY, LICENSE
    contract_number       VARCHAR(50) NOT NULL,
    vendor_id             INTEGER REFERENCES asset_vendors(id),
    contract_start_date   DATE NOT NULL,
    contract_end_date     DATE NOT NULL,
    renewal_date          DATE,
    auto_renewal          BOOLEAN DEFAULT false,
    billing_cycle         VARCHAR(20) NOT NULL, -- MONTHLY, QUARTERLY, ANNUAL
    contract_value        DECIMAL(12,2) NOT NULL,
    currency              VARCHAR(3) DEFAULT 'INR',
    service_level         TEXT,
    response_time         VARCHAR(50),
    resolution_time       VARCHAR(50),
    availability_guarantee VARCHAR(20),
    penalty_clause        TEXT,
    coverage_details      TEXT,
    exclusions            TEXT,
    status                VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, EXPIRED, TERMINATED, PENDING_RENEWAL
    reminder_sent         BOOLEAN DEFAULT false,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                BOOLEAN DEFAULT true
);

-- ASSET EXPENSES TABLE
CREATE TABLE IF NOT EXISTS asset_expenses (
    id              SERIAL PRIMARY KEY,
    asset_id        INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    expense_type    VARCHAR(30) NOT NULL, -- PURCHASE, MAINTENANCE, UPGRADE, LICENSE, REPAIR, DISPOSAL
    expense_category VARCHAR(30) NOT NULL, -- CAPEX, OPEX
    amount          DECIMAL(12,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'INR',
    expense_date    DATE NOT NULL,
    description     TEXT NOT NULL,
    vendor_id       INTEGER REFERENCES asset_vendors(id),
    invoice_number  VARCHAR(50),
    invoice_date    DATE,
    payment_status  VARCHAR(20) DEFAULT 'PENDING', -- PAID, PENDING, OVERDUE
    payment_date    DATE,
    approved_by     INTEGER REFERENCES users(id),
    approved_at     TIMESTAMP,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active          BOOLEAN DEFAULT true
);

-- ASSET LIFECYCLE EVENTS TABLE
CREATE TABLE IF NOT EXISTS asset_lifecycle_events (
    id                   SERIAL PRIMARY KEY,
    asset_id             INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    event_type           VARCHAR(30) NOT NULL, -- PURCHASED, DEPLOYED, MAINTENANCE, UPGRADED, RETIRED, DISPOSED
    event_date           DATE NOT NULL,
    description          TEXT NOT NULL,
    performed_by         VARCHAR(100),
    cost                 DECIMAL(12,2),
    vendor_id            INTEGER REFERENCES asset_vendors(id),
    impact_assessment    TEXT,
    next_action_required TEXT,
    next_action_date     DATE,
    created_by           INTEGER REFERENCES users(id),
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active               BOOLEAN DEFAULT true
);

-- ASSET PERFORMANCE METRICS TABLE
CREATE TABLE IF NOT EXISTS asset_performance_metrics (
    id                   SERIAL PRIMARY KEY,
    asset_id             INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    metric_date          DATE NOT NULL,
    uptime_percentage    DECIMAL(5,2),
    downtime_minutes     INTEGER,
    performance_score    INTEGER CHECK (performance_score >= 1 AND performance_score <= 100),
    user_satisfaction    INTEGER CHECK (user_satisfaction >= 1 AND user_satisfaction <= 5),
    incidents_count      INTEGER DEFAULT 0,
    maintenance_requests INTEGER DEFAULT 0,
    utilization_hours    DECIMAL(8,2),
    notes                TEXT,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active               BOOLEAN DEFAULT true
);

-- ASSET DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS asset_documents (
    id             SERIAL PRIMARY KEY,
    asset_id       INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    document_type  VARCHAR(30) NOT NULL, -- MANUAL, WARRANTY, INVOICE, CONTRACT, LICENSE, PHOTO
    document_name  VARCHAR(200) NOT NULL,
    file_path      VARCHAR(500),
    file_size      INTEGER,
    file_type      VARCHAR(20),
    upload_date    DATE DEFAULT CURRENT_DATE,
    expiry_date    DATE,
    description    TEXT,
    uploaded_by    INTEGER REFERENCES users(id),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active         BOOLEAN DEFAULT true
);

-- ASSET DISPOSAL TABLE
CREATE TABLE IF NOT EXISTS asset_disposal (
    id                   SERIAL PRIMARY KEY,
    asset_id             INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    disposal_type        VARCHAR(20) NOT NULL, -- SELL, DONATE, RECYCLE, DESTROY
    disposal_date        DATE NOT NULL,
    disposal_reason      TEXT NOT NULL,
    disposal_value       DECIMAL(12,2),
    disposal_cost        DECIMAL(12,2),
    net_proceeds         DECIMAL(12,2),
    buyer_name           VARCHAR(100),
    disposal_method      VARCHAR(50),
    environmental_impact TEXT,
    data_sanitization    BOOLEAN DEFAULT false,
    certificate_obtained BOOLEAN DEFAULT false,
    approved_by          INTEGER REFERENCES users(id),
    approved_at          TIMESTAMP,
    created_by           INTEGER REFERENCES users(id),
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active               BOOLEAN DEFAULT true
);

-- Extend asset_maintenance with additional fields
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS priority              VARCHAR(10) DEFAULT 'NORMAL';
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS estimated_cost        DECIMAL(10,2);
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS actual_cost           DECIMAL(10,2);
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS downtime_hours        DECIMAL(5,2);
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS performed_by          VARCHAR(100);
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS next_scheduled_date   DATE;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS maintenance_category  VARCHAR(20) DEFAULT 'ROUTINE';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_asset_master_category_type ON asset_master(asset_category, asset_type);
CREATE INDEX IF NOT EXISTS idx_asset_master_vendor        ON asset_master(vendor_id);
CREATE INDEX IF NOT EXISTS idx_asset_master_lifecycle     ON asset_master(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_asset_contracts_asset      ON asset_contracts(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_contracts_vendor     ON asset_contracts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_asset_contracts_expiry     ON asset_contracts(contract_end_date);
CREATE INDEX IF NOT EXISTS idx_asset_expenses_asset       ON asset_expenses(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_expenses_date        ON asset_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_asset_expenses_category    ON asset_expenses(expense_category);
CREATE INDEX IF NOT EXISTS idx_asset_lifecycle_asset      ON asset_lifecycle_events(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_lifecycle_date       ON asset_lifecycle_events(event_date);
CREATE INDEX IF NOT EXISTS idx_asset_performance_asset    ON asset_performance_metrics(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_performance_date     ON asset_performance_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_asset_documents_asset      ON asset_documents(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_disposal_asset       ON asset_disposal(asset_id);

-- Views
CREATE OR REPLACE VIEW asset_summary_view AS
SELECT
    am.id,
    am.asset_code,
    am.asset_name,
    am.asset_category,
    am.asset_type,
    am.asset_subtype,
    am.center_id,
    c.name                                                   AS center_name,
    am.manufacturer,
    am.model,
    am.purchase_cost,
    am.current_value,
    am.total_expenses,
    (am.purchase_cost + COALESCE(am.total_expenses, 0))      AS total_cost_of_ownership,
    am.depreciation_rate,
    am.warranty_expiry,
    am.contract_end_date,
    am.license_expiry,
    am.lifecycle_status,
    am.performance_rating,
    am.utilization_rate,
    at.name                                                  AS asset_type_name,
    av.vendor_name                                           AS primary_vendor,
    COUNT(DISTINCT ac.id)                                    AS active_contracts,
    COUNT(DISTINCT ae.id)                                    AS total_expenses_count,
    COUNT(DISTINCT ale.id)                                   AS lifecycle_events,
    COUNT(DISTINCT apm.id)                                   AS performance_records
FROM asset_master am
LEFT JOIN centers                c   ON am.center_id = c.id
LEFT JOIN asset_types            at  ON am.asset_type = at.type_code
LEFT JOIN asset_vendors          av  ON am.vendor_id = av.id
LEFT JOIN asset_contracts        ac  ON am.id = ac.asset_id AND ac.active = true AND ac.status = 'ACTIVE'
LEFT JOIN asset_expenses         ae  ON am.id = ae.asset_id AND ae.active = true
LEFT JOIN asset_lifecycle_events ale ON am.id = ale.asset_id AND ale.active = true
LEFT JOIN asset_performance_metrics apm ON am.id = apm.asset_id AND apm.active = true
WHERE am.active = true
GROUP BY am.id, c.name, at.name, av.vendor_name;

CREATE OR REPLACE VIEW asset_financial_summary AS
SELECT
    am.id,
    am.asset_code,
    am.asset_name,
    am.asset_category,
    am.asset_type,
    am.purchase_cost,
    COALESCE(SUM(ae.amount), 0)                                                                  AS total_expenses,
    (am.purchase_cost + COALESCE(SUM(ae.amount), 0))                                             AS total_cost_of_ownership,
    am.current_value,
    (am.purchase_cost - am.current_value)                                                        AS accumulated_depreciation,
    COALESCE(SUM(CASE WHEN ae.expense_category = 'CAPEX'       THEN ae.amount ELSE 0 END), 0)   AS capex_expenses,
    COALESCE(SUM(CASE WHEN ae.expense_category = 'OPEX'        THEN ae.amount ELSE 0 END), 0)   AS opex_expenses,
    COALESCE(SUM(CASE WHEN ae.expense_type = 'MAINTENANCE'     THEN ae.amount ELSE 0 END), 0)   AS maintenance_expenses,
    COALESCE(SUM(CASE WHEN ae.expense_type = 'LICENSE'         THEN ae.amount ELSE 0 END), 0)   AS license_expenses,
    COALESCE(SUM(CASE WHEN ae.expense_type = 'UPGRADE'         THEN ae.amount ELSE 0 END), 0)   AS upgrade_expenses
FROM asset_master am
LEFT JOIN asset_expenses ae ON am.id = ae.asset_id AND ae.active = true
WHERE am.active = true
GROUP BY am.id, am.asset_code, am.asset_name, am.asset_category,
         am.asset_type, am.purchase_cost, am.current_value;

-- Fix: DATEDIFF(date, CURRENT_DATE) → (date - CURRENT_DATE)::INTEGER for PostgreSQL
CREATE OR REPLACE VIEW asset_contract_summary AS
SELECT
    am.id,
    am.asset_code,
    am.asset_name,
    am.asset_type,
    ac.contract_type,
    ac.contract_number,
    av.vendor_name,
    ac.contract_start_date,
    ac.contract_end_date,
    ac.contract_value,
    ac.billing_cycle,
    ac.service_level,
    ac.response_time,
    ac.status,
    CASE
        WHEN ac.contract_end_date < CURRENT_DATE                              THEN 'EXPIRED'
        WHEN ac.contract_end_date <= CURRENT_DATE + INTERVAL '30 days'        THEN 'EXPIRING_SOON'
        ELSE 'ACTIVE'
    END AS contract_status_indicator,
    (ac.contract_end_date - CURRENT_DATE)::INTEGER AS days_to_expiry
FROM asset_master am
JOIN asset_contracts ac ON am.id = ac.asset_id
LEFT JOIN asset_vendors av ON ac.vendor_id = av.id
WHERE am.active = true AND ac.active = true;

-- Functions
CREATE OR REPLACE FUNCTION update_asset_total_expenses()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE asset_master
        SET total_expenses = (
            SELECT COALESCE(SUM(amount), 0)
            FROM asset_expenses
            WHERE asset_id = NEW.asset_id AND active = true
        )
        WHERE id = NEW.asset_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE asset_master
        SET total_expenses = (
            SELECT COALESCE(SUM(amount), 0)
            FROM asset_expenses
            WHERE asset_id = OLD.asset_id AND active = true
        )
        WHERE id = OLD.asset_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_asset_expenses ON asset_expenses;
CREATE TRIGGER trigger_update_asset_expenses
    AFTER INSERT OR UPDATE OR DELETE ON asset_expenses
    FOR EACH ROW EXECUTE FUNCTION update_asset_total_expenses();

-- Fix: DATEDIFF replaced with (date - CURRENT_DATE)::INTEGER
CREATE OR REPLACE FUNCTION check_contract_expirations()
RETURNS TABLE(
    asset_id      INTEGER,
    asset_name    VARCHAR,
    contract_type VARCHAR,
    days_to_expiry INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        am.id,
        am.asset_name,
        ac.contract_type,
        (ac.contract_end_date - CURRENT_DATE)::INTEGER AS days_to_expiry
    FROM asset_master am
    JOIN asset_contracts ac ON am.id = ac.asset_id
    WHERE am.active = true
      AND ac.active = true
      AND ac.status = 'ACTIVE'
      AND ac.contract_end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '90 days')
      AND ac.reminder_sent = false;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_asset_roi(p_asset_id INTEGER)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_total_cost    DECIMAL(12,2);
    v_benefit_value DECIMAL(12,2);
    v_roi           DECIMAL(10,2);
BEGIN
    SELECT (purchase_cost + COALESCE(total_expenses, 0))
    INTO v_total_cost
    FROM asset_master
    WHERE id = p_asset_id;

    SELECT COALESCE(current_value, 0) + (purchase_cost * 0.1)
    INTO v_benefit_value
    FROM asset_master
    WHERE id = p_asset_id;

    IF v_total_cost > 0 THEN
        v_roi := ((v_benefit_value - v_total_cost) / v_total_cost) * 100;
    ELSE
        v_roi := 0;
    END IF;

    RETURN v_roi;
END;
$$ LANGUAGE plpgsql;

-- Sample data: vendors
INSERT INTO asset_vendors (vendor_code, vendor_name, contact_person, email, phone, vendor_type, payment_terms, rating) VALUES
('MSFT',     'Microsoft Corporation', 'John Smith',    'sales@microsoft.com', '+1-425-882-8080', 'SOFTWARE',    'ANNUAL',  5),
('ADOBE',    'Adobe Systems',         'Jane Doe',      'sales@adobe.com',     '+1-408-536-6000', 'SOFTWARE',    'ANNUAL',  5),
('HP',       'HP Inc.',               'Mike Johnson',  'sales@hp.com',        '+1-800-752-0900', 'HARDWARE',    'NET30',   4),
('DELL',     'Dell Technologies',     'Sarah Wilson',  'sales@dell.com',      '+1-866-438-3355', 'HARDWARE',    'NET30',   4),
('ORACLE',   'Oracle Corporation',    'David Brown',   'sales@oracle.com',    '+1-650-506-7000', 'SOFTWARE',    'ANNUAL',  4),
('AWS',      'Amazon Web Services',   'Lisa Anderson', 'sales@aws.com',       '+1-206-266-1000', 'SERVICE',     'MONTHLY', 5),
('GOOGLE',   'Google Cloud',          'Tom Taylor',    'sales@google.com',    '+1-855-836-1987', 'SERVICE',     'MONTHLY', 5),
('SYMANTEC', 'Symantec Corporation',  'Chris Martin',  'sales@symantec.com',  '+1-800-721-3934', 'SOFTWARE',    'ANNUAL',  3)
ON CONFLICT (vendor_code) DO NOTHING;

-- Sample data: intangible assets
INSERT INTO asset_master (
    asset_code, asset_name, asset_type, asset_category, description, center_id,
    manufacturer, model, serial_number, purchase_date, purchase_cost,
    current_value, depreciation_rate, warranty_expiry, location,
    assigned_to, status, license_key, license_expiry, vendor_id,
    contract_start_date, contract_end_date, asset_subtype
) VALUES
('MS-OFFICE',   'Microsoft Office 365',    'SOFTWARE',     'INTANGIBLE',
 'Office productivity suite with Word, Excel, PowerPoint, Outlook', 1,
 'Microsoft', 'Office 365 Business Premium', 'OFF365-001',
 '2023-01-15', 12000.00, 12000.00, 0.3333, NULL, 'Cloud',
 'All Staff', 'ACTIVE', 'OFF365-BIZ-001', '2024-01-14', 1,
 '2023-01-15', '2024-01-14', 'Productivity Suite'),
('ADOBE-CC',    'Adobe Creative Cloud',    'SOFTWARE',     'INTANGIBLE',
 'Creative suite for design and multimedia work', 1,
 'Adobe', 'Creative Cloud All Apps', 'ADOBE-CC-001',
 '2023-02-01', 18000.00, 18000.00, 0.3333, NULL, 'Cloud',
 'Design Team', 'ACTIVE', 'ADOBE-CC-001', '2024-01-31', 2,
 '2023-02-01', '2024-01-31', 'Design Software'),
('AWS-HOSTING', 'AWS Web Hosting',         'CLOUD_SERVICE','INTANGIBLE',
 'Cloud hosting for web applications and databases', 1,
 'Amazon Web Services', 'EC2 + S3 + RDS', 'AWS-001',
 '2023-01-01', 48000.00, 48000.00, 1.0000, NULL, 'Cloud',
 'IT Department', 'ACTIVE', 'AWS-ACC-001', '2024-01-01', 6,
 '2023-01-01', '2024-01-01', 'Cloud Infrastructure'),
('SSL-CERT',    'SSL Certificate',          'SSL_CERT',     'INTANGIBLE',
 'Wildcard SSL certificate for all domains', 1,
 'Let''s Encrypt', 'Wildcard SSL', 'SSL-001',
 '2023-03-01', 3000.00, 3000.00, 1.0000, NULL, 'Cloud',
 'IT Department', 'ACTIVE', 'SSL-WILD-001', '2024-03-01', NULL,
 '2023-03-01', '2024-03-01', 'Security Certificate')
ON CONFLICT (asset_code) DO NOTHING;

-- Sample data: contracts
INSERT INTO asset_contracts (
    asset_id, contract_type, contract_number, vendor_id, contract_start_date,
    contract_end_date, billing_cycle, contract_value, service_level,
    response_time, availability_guarantee, coverage_details
) VALUES
(1, 'LICENSE', 'MS-OFFICE-2023',   1,    '2023-01-15', '2024-01-14', 'ANNUAL',  12000.00,
 '99.9% uptime guarantee',  'Within 4 hours', '99.9%',  'Full Office 365 suite with all features'),
(2, 'LICENSE', 'ADOBE-CC-2023',    2,    '2023-02-01', '2024-01-31', 'ANNUAL',  18000.00,
 '99.5% uptime guarantee',  'Within 8 hours', '99.5%',  'All Adobe Creative Cloud applications'),
(3, 'SLA',     'AWS-HOSTING-2023', 6,    '2023-01-01', '2024-01-01', 'MONTHLY',  4000.00,
 '99.99% uptime guarantee', 'Within 1 hour',  '99.99%', '24/7 support, managed services'),
(4, 'LICENSE', 'SSL-CERT-2023',    NULL, '2023-03-01', '2024-03-01', 'ANNUAL',   3000.00,
 '100% availability',       'Within 2 hours', '100%',   'Wildcard SSL for all domains')
ON CONFLICT DO NOTHING;

-- Sample data: expenses
INSERT INTO asset_expenses (
    asset_id, expense_type, expense_category, amount, expense_date, description,
    vendor_id, invoice_number, invoice_date, payment_status, payment_date
) VALUES
(1, 'LICENSE', 'OPEX', 12000.00, '2023-01-15', 'Annual Office 365 license renewal',   1, 'INV-MS-001',    '2023-01-15', 'PAID', '2023-01-20'),
(2, 'LICENSE', 'OPEX', 18000.00, '2023-02-01', 'Annual Adobe Creative Cloud license', 2, 'INV-ADOBE-001', '2023-02-01', 'PAID', '2023-02-05'),
(3, 'LICENSE', 'OPEX',  4000.00, '2023-01-01', 'Monthly AWS hosting',                 6, 'INV-AWS-001',   '2023-01-01', 'PAID', '2023-01-10'),
(3, 'LICENSE', 'OPEX',  4000.00, '2023-02-01', 'Monthly AWS hosting',                 6, 'INV-AWS-002',   '2023-02-01', 'PAID', '2023-02-10'),
(3, 'LICENSE', 'OPEX',  4000.00, '2023-03-01', 'Monthly AWS hosting',                 6, 'INV-AWS-003',   '2023-03-01', 'PAID', '2023-03-10'),
(4, 'LICENSE', 'OPEX',  3000.00, '2023-03-01', 'Annual SSL certificate',           NULL, 'INV-SSL-001',   '2023-03-01', 'PAID', '2023-03-05')
ON CONFLICT DO NOTHING;
