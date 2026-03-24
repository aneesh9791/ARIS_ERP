-- Migration 021: GST Schema Update — Service-Specific GST and CD Printing Support
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/backend/migrations/update_gst_schema.sql
-- Fix applied: ALTER TABLE ADD CONSTRAINT for chk_study_gst_rate, chk_study_cess_rate,
--   chk_item_gst_rate, chk_item_cess_rate wrapped in DO blocks (duplicate_object safe).
-- Fix applied: tax_configuration CREATE TABLE IF NOT EXISTS — table already exists from
--   019/020. This migration drops the 021-specific CREATE TABLE and instead uses
--   ALTER TABLE to add missing columns (hsn_code, sac_code, gst_percentage, etc.) with
--   an UNIQUE constraint for the ON CONFLICT target.
-- Fix applied: GRANT to billing_role removed from migration (role may not exist in all
--   environments — grants should be applied separately by DBAs).
-- Fix applied: COMMIT statement removed.

-- Extend study_master for GST configuration
ALTER TABLE study_master ADD COLUMN IF NOT EXISTS study_type     VARCHAR(50) DEFAULT 'SERVICE';
ALTER TABLE study_master ADD COLUMN IF NOT EXISTS category       VARCHAR(50);
ALTER TABLE study_master ADD COLUMN IF NOT EXISTS gst_rate       DECIMAL(5,4) DEFAULT 0.1800;
ALTER TABLE study_master ADD COLUMN IF NOT EXISTS is_taxable     BOOLEAN DEFAULT true;
ALTER TABLE study_master ADD COLUMN IF NOT EXISTS cess_rate      DECIMAL(5,4) DEFAULT 0.0000;
ALTER TABLE study_master ADD COLUMN IF NOT EXISTS hsn_code       VARCHAR(8);
ALTER TABLE study_master ADD COLUMN IF NOT EXISTS sac_code       VARCHAR(8);
ALTER TABLE study_master ADD COLUMN IF NOT EXISTS gst_applicable BOOLEAN DEFAULT true;
ALTER TABLE study_master ADD COLUMN IF NOT EXISTS tax_category   VARCHAR(50) DEFAULT 'STANDARD';

-- Extend accounting_bills for GST details
ALTER TABLE accounting_bills ADD COLUMN IF NOT EXISTS payment_source   VARCHAR(20) DEFAULT 'PATIENT';
ALTER TABLE accounting_bills ADD COLUMN IF NOT EXISTS customer_gstin   VARCHAR(15);
ALTER TABLE accounting_bills ADD COLUMN IF NOT EXISTS customer_name    VARCHAR(100);
ALTER TABLE accounting_bills ADD COLUMN IF NOT EXISTS customer_state   VARCHAR(50);
ALTER TABLE accounting_bills ADD COLUMN IF NOT EXISTS place_of_supply  VARCHAR(50);
ALTER TABLE accounting_bills ADD COLUMN IF NOT EXISTS reverse_charge   BOOLEAN DEFAULT false;
ALTER TABLE accounting_bills ADD COLUMN IF NOT EXISTS e_commerce_gstin VARCHAR(15);

-- Extend accounting_bill_items for GST details
ALTER TABLE accounting_bill_items ADD COLUMN IF NOT EXISTS hsn_code    VARCHAR(8);
ALTER TABLE accounting_bill_items ADD COLUMN IF NOT EXISTS sac_code    VARCHAR(8);
ALTER TABLE accounting_bill_items ADD COLUMN IF NOT EXISTS is_taxable  BOOLEAN DEFAULT true;
ALTER TABLE accounting_bill_items ADD COLUMN IF NOT EXISTS cess_rate   DECIMAL(5,4) DEFAULT 0.0000;

-- CHECK constraints (idempotent)
DO $$
BEGIN
    ALTER TABLE study_master ADD CONSTRAINT chk_study_gst_rate
        CHECK (gst_rate >= 0 AND gst_rate <= 0.28);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE study_master ADD CONSTRAINT chk_study_cess_rate
        CHECK (cess_rate >= 0 AND cess_rate <= 0.28);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE accounting_bill_items ADD CONSTRAINT chk_item_gst_rate
        CHECK (gst_rate >= 0 AND gst_rate <= 0.28);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE accounting_bill_items ADD CONSTRAINT chk_item_cess_rate
        CHECK (cess_rate >= 0 AND cess_rate <= 0.28);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_study_master_gst    ON study_master(gst_applicable, is_taxable, gst_rate);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_gst ON accounting_bills(payment_source, bill_date, billing_status);
CREATE INDEX IF NOT EXISTS idx_bill_items_gst       ON accounting_bill_items(gst_rate, is_taxable, hsn_code, sac_code);
CREATE INDEX IF NOT EXISTS idx_payments_gst         ON accounting_payments(payment_date, payment_method, bill_id);

-- Extend tax_configuration table with GST-specific columns (table was created in 019)
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS hsn_code                    VARCHAR(8);
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS sac_code                    VARCHAR(8);
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS gst_percentage              DECIMAL(5,4);
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS cess_percentage             DECIMAL(5,4) DEFAULT 0.0000;
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS is_reverse_charge_applicable BOOLEAN DEFAULT false;
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS gst_type                    VARCHAR(20) DEFAULT 'SERVICES';
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS effective_from              DATE DEFAULT CURRENT_DATE;
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS effective_to                DATE;

-- UNIQUE constraint for ON CONFLICT (hsn_code, sac_code, effective_from) target
DO $$
BEGIN
    ALTER TABLE tax_configuration
        ADD CONSTRAINT tax_config_unique UNIQUE (hsn_code, sac_code, effective_from);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- GST-specific CHECK constraints on tax_configuration
DO $$
BEGIN
    ALTER TABLE tax_configuration ADD CONSTRAINT tax_config_gst_rate
        CHECK (gst_percentage >= 0 AND gst_percentage <= 0.28);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE tax_configuration ADD CONSTRAINT tax_config_cess_rate
        CHECK (cess_percentage >= 0 AND cess_percentage <= 0.28);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- GST REPORTS TABLE
CREATE TABLE IF NOT EXISTS gst_reports (
    id            SERIAL PRIMARY KEY,
    report_type   VARCHAR(20) NOT NULL,
    report_name   VARCHAR(100) NOT NULL,
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    report_data   JSONB,
    file_path     VARCHAR(500),
    generated_by  INTEGER REFERENCES users(id),
    generated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status        VARCHAR(20) DEFAULT 'GENERATED',
    CONSTRAINT gst_reports_type CHECK (report_type IN ('GSTR1','GSTR3B','GST_SUMMARY','GST_PAID','GST_ARIS_PAID'))
);

-- GST AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS gst_audit_log (
    id          SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL,
    entity_id   INTEGER NOT NULL,
    action      VARCHAR(50) NOT NULL,
    old_values  JSONB,
    new_values  JSONB,
    user_id     INTEGER REFERENCES users(id),
    ip_address  INET,
    user_agent  TEXT,
    session_id  VARCHAR(100),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT gst_audit_entity_type
        CHECK (entity_type IN ('STUDY_MASTER','TAX_CONFIG','ACCOUNTING_BILL','BILL_ITEM'))
);

-- Indexes for GST audit and reporting
CREATE INDEX IF NOT EXISTS idx_gst_audit_log_entity  ON gst_audit_log(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gst_audit_log_user    ON gst_audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tax_config_effective  ON tax_configuration(effective_from, effective_to, active);
CREATE INDEX IF NOT EXISTS idx_gst_reports_type_date ON gst_reports(report_type, start_date, end_date);

-- Sample data: tax configurations
INSERT INTO tax_configuration (tax_category, tax_rate, effective_date, hsn_code, sac_code, gst_percentage, cess_percentage, gst_type, description, effective_from) VALUES
('SERVICES', 0.18, CURRENT_DATE, '998313', NULL, 0.1800, 0.0000, 'SERVICES', 'Diagnostic and pathology services', CURRENT_DATE),
('SERVICES', 0.18, CURRENT_DATE, '998314', NULL, 0.1800, 0.0000, 'SERVICES', 'Radiology services',                CURRENT_DATE),
('SERVICES', 0.18, CURRENT_DATE, '998315', NULL, 0.1800, 0.0000, 'SERVICES', 'Laboratory services',               CURRENT_DATE),
('EXEMPT',   0.00, CURRENT_DATE, '998316', NULL, 0.0000, 0.0000, 'SERVICES', 'Healthcare services - GST exempt',  CURRENT_DATE),
('GOODS',    0.18, CURRENT_DATE, '8523',   NULL, 0.1800, 0.0000, 'GOODS',    'CD/DVD/Other recording media',      CURRENT_DATE),
('SERVICES', 0.18, CURRENT_DATE, '998311', NULL, 0.1800, 0.0000, 'SERVICES', 'Consulting services',               CURRENT_DATE),
('SERVICES', 0.18, CURRENT_DATE, '998312', NULL, 0.1800, 0.0000, 'SERVICES', 'Medical services',                  CURRENT_DATE)
ON CONFLICT (hsn_code, sac_code, effective_from)
DO UPDATE SET
    gst_percentage  = EXCLUDED.gst_percentage,
    cess_percentage = EXCLUDED.cess_percentage,
    description     = EXCLUDED.description,
    updated_at      = CURRENT_TIMESTAMP;

-- Sample study data: CD printing and scanning services
INSERT INTO study_master (
    study_code, study_name, modality, study_type, base_rate, insurance_rate, self_pay_rate,
    billing_code, cpt_code, revenue_category, cost_category,
    gst_rate, is_taxable, cess_rate, hsn_code, sac_code, category,
    gst_applicable, tax_category, active, created_at, updated_at
) VALUES (
    'CD_PRINT', 'CD Printing', 'OTHER', 'SERVICE', 50.00, 50.00, 50.00,
    'CD001', '99999', 'MEDIA_REVENUE', 'MEDIA_COST',
    0.1800, true, 0.0000, '8523', '998313', 'MEDIA',
    true, 'STANDARD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (study_code) DO UPDATE SET
    gst_rate       = EXCLUDED.gst_rate,
    is_taxable     = EXCLUDED.is_taxable,
    hsn_code       = EXCLUDED.hsn_code,
    sac_code       = EXCLUDED.sac_code,
    gst_applicable = EXCLUDED.gst_applicable,
    updated_at     = CURRENT_TIMESTAMP;

INSERT INTO study_master (
    study_code, study_name, modality, study_type, base_rate, insurance_rate, self_pay_rate,
    billing_code, cpt_code, revenue_category, cost_category,
    gst_rate, is_taxable, cess_rate, hsn_code, sac_code, category,
    gst_applicable, tax_category, active, created_at, updated_at
) VALUES (
    'SCAN', 'Document Scanning', 'OTHER', 'SERVICE', 0.00, 0.00, 0.00,
    'SC001', '99998', 'SCAN_REVENUE', 'SCAN_COST',
    0.0000, false, 0.0000, NULL, '998316', 'DOCUMENT',
    false, 'EXEMPT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (study_code) DO UPDATE SET
    gst_rate       = EXCLUDED.gst_rate,
    is_taxable     = EXCLUDED.is_taxable,
    hsn_code       = EXCLUDED.hsn_code,
    sac_code       = EXCLUDED.sac_code,
    gst_applicable = EXCLUDED.gst_applicable,
    tax_category   = EXCLUDED.tax_category,
    updated_at     = CURRENT_TIMESTAMP;

-- Update existing study_master rows with GST defaults
UPDATE study_master
SET
    gst_rate = CASE
        WHEN category IN ('RADIOLOGY','PATHOLOGY','CARDIOLOGY')   THEN 0.1800
        WHEN category IN ('CONSULTATION','GENERAL')               THEN 0.1800
        ELSE 0.0000
    END,
    is_taxable = CASE
        WHEN category IN ('RADIOLOGY','PATHOLOGY','CARDIOLOGY','CONSULTATION','GENERAL') THEN true
        ELSE false
    END,
    hsn_code = CASE
        WHEN category = 'RADIOLOGY'                       THEN '998314'
        WHEN category = 'PATHOLOGY'                       THEN '998315'
        WHEN category IN ('CONSULTATION','GENERAL')       THEN '998311'
        WHEN category = 'DOCUMENT'                        THEN '998316'
        ELSE NULL
    END,
    sac_code = CASE
        WHEN category IN ('RADIOLOGY','PATHOLOGY','CARDIOLOGY') THEN '998313'
        WHEN category IN ('CONSULTATION','GENERAL')             THEN '998312'
        WHEN category = 'DOCUMENT'                              THEN '998316'
        ELSE NULL
    END,
    gst_applicable = CASE
        WHEN category IN ('RADIOLOGY','PATHOLOGY','CARDIOLOGY','CONSULTATION','GENERAL') THEN true
        ELSE false
    END,
    tax_category = CASE
        WHEN is_taxable = true THEN 'STANDARD'
        ELSE 'EXEMPT'
    END
WHERE gst_rate IS NULL OR is_taxable IS NULL;

-- Sample studies with GST
INSERT INTO study_master (study_code, study_name, modality, study_type, base_rate, insurance_rate, self_pay_rate,
    billing_code, cpt_code, revenue_category, cost_category,
    gst_rate, is_taxable, cess_rate, hsn_code, sac_code, category, gst_applicable, tax_category,
    active, created_at, updated_at) VALUES
('XRAY_CHEST',     'Chest X-Ray',          'XRAY',        'RADIOLOGY',    500.00, 750.00, 400.00, 'XR002', '71046', 'XRAY_REVENUE',   'XRAY_COST',   0.1800, true,  0.0000, '998314', '998313', 'RADIOLOGY',   true,  'STANDARD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CBC_TEST',       'Complete Blood Count', 'PATHOLOGY',   'PATHOLOGY',    300.00, 450.00, 250.00, 'LAB001','85025', 'LAB_REVENUE',    'LAB_COST',    0.1800, true,  0.0000, '998315', '998313', 'PATHOLOGY',   true,  'STANDARD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CONSULT_GENERAL','General Consultation', 'CONSULTATION','CONSULTATION', 500.00, 750.00, 400.00, 'CON001','99213', 'CONSULT_REVENUE','CONSULT_COST', 0.1800, true,  0.0000, '998311', '998312', 'CONSULTATION',true,  'STANDARD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (study_code) DO NOTHING;

-- Trigger function for GST audit trail
CREATE OR REPLACE FUNCTION gst_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO gst_audit_log (
            entity_type, entity_id, action, old_values, new_values,
            user_id, ip_address, user_agent, session_id
        ) VALUES (
            TG_TABLE_NAME, NEW.id, 'UPDATE',
            row_to_json(OLD), row_to_json(NEW),
            current_setting('app.current_user_id', true)::INTEGER,
            current_setting('app.client_ip',        true)::INET,
            current_setting('app.user_agent',       true),
            current_setting('app.session_id',       true)
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO gst_audit_log (
            entity_type, entity_id, action, old_values, new_values,
            user_id, ip_address, user_agent, session_id
        ) VALUES (
            TG_TABLE_NAME, NEW.id, 'INSERT',
            NULL, row_to_json(NEW),
            current_setting('app.current_user_id', true)::INTEGER,
            current_setting('app.client_ip',        true)::INET,
            current_setting('app.user_agent',       true),
            current_setting('app.session_id',       true)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO gst_audit_log (
            entity_type, entity_id, action, old_values, new_values,
            user_id, ip_address, user_agent, session_id
        ) VALUES (
            TG_TABLE_NAME, OLD.id, 'DELETE',
            row_to_json(OLD), NULL,
            current_setting('app.current_user_id', true)::INTEGER,
            current_setting('app.client_ip',        true)::INET,
            current_setting('app.user_agent',       true),
            current_setting('app.session_id',       true)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gst_study_master_audit ON study_master;
CREATE TRIGGER gst_study_master_audit
    AFTER INSERT OR UPDATE OR DELETE ON study_master
    FOR EACH ROW EXECUTE FUNCTION gst_audit_trigger();

DROP TRIGGER IF EXISTS gst_tax_config_audit ON tax_configuration;
CREATE TRIGGER gst_tax_config_audit
    AFTER INSERT OR UPDATE OR DELETE ON tax_configuration
    FOR EACH ROW EXECUTE FUNCTION gst_audit_trigger();

-- Views
CREATE OR REPLACE VIEW v_gst_summary AS
SELECT
    DATE_TRUNC('month', bill_date) AS month,
    payment_source,
    COUNT(*)                       AS total_bills,
    SUM(subtotal)                  AS total_subtotal,
    SUM(taxable_amount)            AS total_taxable_amount,
    SUM(cgst_amount)               AS total_cgst,
    SUM(sgst_amount)               AS total_sgst,
    SUM(igst_amount)               AS total_igst,
    SUM(cess_amount)               AS total_cess,
    SUM(total_amount)              AS total_amount,
    SUM(amount_paid)               AS total_paid,
    SUM(balance_amount)            AS total_balance
FROM accounting_bills
WHERE active = true
GROUP BY DATE_TRUNC('month', bill_date), payment_source
ORDER BY month DESC, payment_source;

CREATE OR REPLACE VIEW v_gst_service_summary AS
SELECT
    bi.item_code,
    bi.item_name,
    bi.gst_rate,
    bi.is_taxable,
    COUNT(DISTINCT bi.bill_id)   AS bill_count,
    SUM(bi.quantity)             AS total_quantity,
    SUM(bi.total_price)          AS total_revenue,
    SUM(bi.taxable_amount)       AS total_taxable_amount,
    SUM(bi.cgst_amount)          AS total_cgst,
    SUM(bi.sgst_amount)          AS total_sgst,
    SUM(bi.igst_amount)          AS total_igst,
    SUM(bi.cess_amount)          AS total_cess,
    SUM(bi.total_amount)         AS total_amount_with_gst
FROM accounting_bill_items bi
WHERE bi.active = true
GROUP BY bi.item_code, bi.item_name, bi.gst_rate, bi.is_taxable
ORDER BY total_revenue DESC;

CREATE OR REPLACE VIEW v_gst_payment_summary AS
SELECT
    ap.payment_method,
    ab.payment_source,
    COUNT(*)         AS transaction_count,
    SUM(ap.amount)   AS total_amount,
    AVG(ap.amount)   AS avg_amount,
    MAX(ap.amount)   AS max_amount,
    MIN(ap.amount)   AS min_amount
FROM accounting_payments ap
INNER JOIN accounting_bills ab ON ap.bill_id = ab.id
WHERE ap.active = true AND ab.active = true
GROUP BY ap.payment_method, ab.payment_source
ORDER BY total_amount DESC;

-- Functions
CREATE OR REPLACE FUNCTION calculate_bill_item_gst(
    p_item_code           VARCHAR(20),
    p_quantity            INTEGER,
    p_unit_price          DECIMAL(10,2),
    p_discount_percentage DECIMAL(5,2)
) RETURNS TABLE(
    taxable_amount DECIMAL(10,2),
    gst_rate       DECIMAL(5,4),
    cgst_amount    DECIMAL(10,2),
    sgst_amount    DECIMAL(10,2),
    igst_amount    DECIMAL(10,2),
    cess_amount    DECIMAL(10,2),
    total_amount   DECIMAL(10,2)
) AS $$
DECLARE
    v_service_record  RECORD;
    v_total_price     DECIMAL(10,2);
    v_discount_amount DECIMAL(10,2);
    v_taxable_amount  DECIMAL(10,2);
    v_gst_amount      DECIMAL(10,2);
    v_cess_amount     DECIMAL(10,2);
BEGIN
    SELECT sm.gst_rate, sm.is_taxable, sm.cess_rate
    INTO v_service_record
    FROM study_master sm
    WHERE sm.study_code = p_item_code AND sm.active = true;

    v_total_price     := p_quantity * p_unit_price;
    v_discount_amount := v_total_price * (p_discount_percentage / 100);

    IF v_service_record.is_taxable THEN
        v_taxable_amount := v_total_price - v_discount_amount;
    ELSE
        v_taxable_amount := 0;
    END IF;

    IF v_service_record.is_taxable THEN
        v_gst_amount  := v_taxable_amount * v_service_record.gst_rate;
        v_cess_amount := v_taxable_amount * v_service_record.cess_rate;
    ELSE
        v_gst_amount  := 0;
        v_cess_amount := 0;
    END IF;

    RETURN QUERY SELECT
        v_taxable_amount,
        v_service_record.gst_rate,
        (v_gst_amount / 2)::DECIMAL(10,2),   -- CGST
        (v_gst_amount / 2)::DECIMAL(10,2),   -- SGST
        0::DECIMAL(10,2),                    -- IGST (intra-state)
        v_cess_amount,
        (v_total_price - v_discount_amount + v_gst_amount + v_cess_amount)::DECIMAL(10,2);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_bill_gst_totals(p_bill_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_bill_totals RECORD;
BEGIN
    SELECT
        SUM(bi.total_price)      AS subtotal,
        SUM(bi.discount_amount)  AS discount_amount,
        SUM(bi.taxable_amount)   AS taxable_amount,
        SUM(bi.cgst_amount)      AS cgst_amount,
        SUM(bi.sgst_amount)      AS sgst_amount,
        SUM(bi.igst_amount)      AS igst_amount,
        SUM(bi.cess_amount)      AS cess_amount
    INTO v_bill_totals
    FROM accounting_bill_items bi
    WHERE bi.bill_id = p_bill_id AND bi.active = true;

    UPDATE accounting_bills
    SET
        subtotal        = COALESCE(v_bill_totals.subtotal,         0),
        discount_amount = COALESCE(v_bill_totals.discount_amount,  0),
        taxable_amount  = COALESCE(v_bill_totals.taxable_amount,   0),
        cgst_amount     = COALESCE(v_bill_totals.cgst_amount,      0),
        sgst_amount     = COALESCE(v_bill_totals.sgst_amount,      0),
        igst_amount     = COALESCE(v_bill_totals.igst_amount,      0),
        cess_amount     = COALESCE(v_bill_totals.cess_amount,      0),
        total_amount    = COALESCE(v_bill_totals.subtotal, 0)
                        - COALESCE(v_bill_totals.discount_amount,  0)
                        + COALESCE(v_bill_totals.cgst_amount,      0)
                        + COALESCE(v_bill_totals.sgst_amount,      0)
                        + COALESCE(v_bill_totals.igst_amount,      0)
                        + COALESCE(v_bill_totals.cess_amount,      0),
        balance_amount  = (COALESCE(v_bill_totals.subtotal, 0)
                        - COALESCE(v_bill_totals.discount_amount,  0)
                        + COALESCE(v_bill_totals.cgst_amount,      0)
                        + COALESCE(v_bill_totals.sgst_amount,      0)
                        + COALESCE(v_bill_totals.igst_amount,      0)
                        + COALESCE(v_bill_totals.cess_amount,      0))
                        - amount_paid,
        updated_at      = CURRENT_TIMESTAMP
    WHERE id = p_bill_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_update_bill_gst_totals()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM update_bill_gst_totals(OLD.bill_id);
        RETURN OLD;
    ELSE
        PERFORM update_bill_gst_totals(NEW.bill_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bill_items_gst_update ON accounting_bill_items;
CREATE TRIGGER trigger_bill_items_gst_update
    AFTER INSERT OR UPDATE OR DELETE ON accounting_bill_items
    FOR EACH ROW EXECUTE FUNCTION trigger_update_bill_gst_totals();
