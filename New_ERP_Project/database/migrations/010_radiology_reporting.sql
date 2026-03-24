-- Migration 010: Radiology Reporting - Unified Radiologist Master, Payments, Studies Extensions
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/database/radiology-reporting-schema.sql
-- Fix applied: Removed duplicate `CREATE TABLE radiologist_master` — already created in 002_masters.sql.
--   Added ALTER TABLE statements to ADD additional columns to the existing table instead.
-- Fix applied: RAD004 INSERT had `"rate': 48.00` (mixed quote) — corrected to `"rate": 48.00`.

-- radiologist_master was already created in 002_masters.sql.
-- Add new columns needed by the enhanced reporting schema.
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS type             VARCHAR(20);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS city             VARCHAR(100);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS state            VARCHAR(100);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS postal_code      VARCHAR(6);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS reporting_rates  JSONB;
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS bank_name        VARCHAR(100);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS ifsc_code        VARCHAR(11);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS gst_number       VARCHAR(15);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS pan_number       VARCHAR(10);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS contact_person   VARCHAR(100);
ALTER TABLE radiologist_master ADD COLUMN IF NOT EXISTS notes            TEXT;

-- RADIOLOGIST PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS radiologist_payments (
    id                    SERIAL PRIMARY KEY,
    payment_id            VARCHAR(20) NOT NULL UNIQUE,
    radiologist_code      VARCHAR(20) REFERENCES radiologist_master(radiologist_code),
    payment_date          DATE NOT NULL,
    payment_mode          VARCHAR(20) NOT NULL,
    amount_paid           DECIMAL(15,2) NOT NULL,
    study_ids             TEXT[],
    bank_account_id       INTEGER REFERENCES bank_accounts(id),
    transaction_reference VARCHAR(100),
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                BOOLEAN DEFAULT true
);

-- Extend studies table with reporting fields
ALTER TABLE studies ADD COLUMN IF NOT EXISTS radiologist_code VARCHAR(20) REFERENCES radiologist_master(radiologist_code);
ALTER TABLE studies ADD COLUMN IF NOT EXISTS report_date      DATE;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS reporting_rate   DECIMAL(10,2);
ALTER TABLE studies ADD COLUMN IF NOT EXISTS report_status    VARCHAR(20);
ALTER TABLE studies ADD COLUMN IF NOT EXISTS payment_status   VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE studies ADD COLUMN IF NOT EXISTS payment_date     DATE;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS payment_id       VARCHAR(20);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_radiologist_master_center_id         ON radiologist_master(center_id);
CREATE INDEX IF NOT EXISTS idx_radiologist_master_type              ON radiologist_master(type);
CREATE INDEX IF NOT EXISTS idx_radiologist_master_active            ON radiologist_master(active);
CREATE INDEX IF NOT EXISTS idx_radiologist_master_code              ON radiologist_master(radiologist_code);
CREATE INDEX IF NOT EXISTS idx_radiologist_payments_code            ON radiologist_payments(radiologist_code);
CREATE INDEX IF NOT EXISTS idx_radiologist_payments_payment_date    ON radiologist_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_radiologist_payments_active          ON radiologist_payments(active);
CREATE INDEX IF NOT EXISTS idx_studies_radiologist_code             ON studies(radiologist_code);
CREATE INDEX IF NOT EXISTS idx_studies_report_date                  ON studies(report_date);
CREATE INDEX IF NOT EXISTS idx_studies_report_status                ON studies(report_status);
CREATE INDEX IF NOT EXISTS idx_studies_payment_status               ON studies(payment_status);

-- Update existing radiologist records with the new type/reporting_rates columns
UPDATE radiologist_master SET type = 'INDIVIDUAL' WHERE type IS NULL;

-- Sample data: update/insert individual radiologists with enhanced fields
-- (Using ON CONFLICT to update if already exists from 002_masters.sql)
INSERT INTO radiologist_master (
    radiologist_code, radiologist_name, type, specialty, qualification, license_number,
    center_id, contact_phone, contact_email, address, city, state, postal_code,
    reporting_rates, bank_account_number, bank_name, ifsc_code, gst_number, pan_number,
    contact_person, notes, contract_type, per_study_rate
) VALUES
('RAD001', 'Dr. Michael Wilson', 'INDIVIDUAL', 'Neuroradiology', 'MD', 'RAD22222',
 1, '+1-555-456-7890', 'drwilson@email.com', '321 Imaging Way, Suite 100', 'Kochi', 'Kerala', '682024',
 '[{"modality": "MRI", "rate": 50.00, "currency": "INR"}, {"modality": "CT", "rate": 40.00, "currency": "INR"}]',
 '1234567890123456', 'State Bank of India', 'SBIN0000001', '29AAAPM1234C1ZV', 'AAAPM1234C',
 'Dr. Michael Wilson', 'Senior neuroradiologist with 10+ years experience', 'PER_STUDY', 50.00),
('RAD002', 'Dr. Sarah Brown', 'INDIVIDUAL', 'Musculoskeletal', 'MD', 'RAD33333',
 1, '+1-555-567-8901', 'drbrown@email.com', '654 Radiology Dr, Suite 200', 'Kochi', 'Kerala', '682025',
 '[{"modality": "MRI", "rate": 45.00, "currency": "INR"}, {"modality": "XRAY", "rate": 25.00, "currency": "INR"}]',
 '2345678901234567', 'HDFC Bank', 'HDFC0000001', '29AAAPM5678C1ZV', 'AAAPM5678C',
 'Dr. Sarah Brown', 'Musculoskeletal imaging specialist', 'PER_STUDY', 45.00),
('RAD003', 'Dr. James Taylor', 'INDIVIDUAL', 'Body Imaging', 'MD', 'RAD44444',
 1, '+1-555-678-9012', 'drtaylor@email.com', '987 Scan Blvd, Suite 300', 'Trivandrum', 'Kerala', '695001',
 '[{"modality": "CT", "rate": 35.00, "currency": "INR"}, {"modality": "ULTRASOUND", "rate": 30.00, "currency": "INR"}]',
 '3456789012345678', 'ICICI Bank', 'ICIC0000001', '29AAAPM9012C1ZV', 'AAAPM9012C',
 'Dr. James Taylor', 'Body imaging and abdominal radiology', 'PER_STUDY', 35.00),
-- Fix: "rate': 48.00 corrected to "rate": 48.00
('RAD004', 'Dr. Emily Davis', 'INDIVIDUAL', 'Neuroradiology', 'MD', 'RAD55555',
 1, '+1-555-789-0123', 'drdavis@email.com', '456 Medical Plaza, Suite 150', 'Calicut', 'Kerala', '673001',
 '[{"modality": "MRI", "rate": 48.00, "currency": "INR"}, {"modality": "CT", "rate": 38.00, "currency": "INR"}]',
 '4567890123456789', 'Federal Bank', 'FDRL0000001', '29AAAPM3456C1ZV', 'AAAPM3456C',
 'Dr. Emily Davis', 'Neuroradiology and head imaging specialist', 'PER_STUDY', 48.00),
('RAD005', 'Dr. Robert Chen', 'INDIVIDUAL', 'Cardiac Imaging', 'MD', 'RAD66666',
 1, '+1-555-890-1234', 'drchen@email.com', '789 Imaging Center, Suite 200', 'Thrissur', 'Kerala', '680001',
 '[{"modality": "MRI", "rate": 55.00, "currency": "INR"}, {"modality": "CT", "rate": 45.00, "currency": "INR"}]',
 '5678901234567890', 'Axis Bank', 'UTIB0000001', '29AAAPM7890C1ZV', 'AAAPM7890C',
 'Dr. Robert Chen', 'Cardiac imaging and interventional radiology', 'PER_STUDY', 55.00)
ON CONFLICT (radiologist_code) DO UPDATE SET
    type              = EXCLUDED.type,
    city              = EXCLUDED.city,
    state             = EXCLUDED.state,
    postal_code       = EXCLUDED.postal_code,
    reporting_rates   = EXCLUDED.reporting_rates,
    bank_account_number = EXCLUDED.bank_account_number,
    bank_name         = EXCLUDED.bank_name,
    ifsc_code         = EXCLUDED.ifsc_code,
    gst_number        = EXCLUDED.gst_number,
    pan_number        = EXCLUDED.pan_number,
    contact_person    = EXCLUDED.contact_person;

-- Teleradiology companies
INSERT INTO radiologist_master (
    radiologist_code, radiologist_name, type, specialty, qualification, license_number,
    center_id, contact_phone, contact_email, address, city, state, postal_code,
    reporting_rates, bank_account_number, bank_name, ifsc_code, gst_number, pan_number,
    contact_person, notes, contract_type, per_study_rate
) VALUES
('TEL001', 'Global Teleradiology Services', 'TELERADIOLOGY_COMPANY', 'Multi-Specialty', 'N/A', 'N/A',
 1, '+1-555-111-2222', 'info@globalteleradiology.com', '100 Tech Park, Building A', 'Kochi', 'Kerala', '682024',
 '[{"modality": "MRI", "rate": 35.00, "currency": "INR"}, {"modality": "CT", "rate": 25.00, "currency": "INR"}, {"modality": "XRAY", "rate": 15.00, "currency": "INR"}]',
 '9876543210987654', 'State Bank of India', 'SBIN0000001', '29AAAGT1234C1ZV', 'AAAGT1234C',
 'John Smith', '24/7 teleradiology service with global coverage', 'PER_STUDY', 35.00),
('TEL002', 'Radiology Partners Ltd', 'TELERADIOLOGY_COMPANY', 'Diagnostic Radiology', 'N/A', 'N/A',
 1, '+1-555-222-3333', 'contact@radiologypartners.com', '200 Business Park, Block B', 'Trivandrum', 'Kerala', '695001',
 '[{"modality": "MRI", "rate": 32.00, "currency": "INR"}, {"modality": "CT", "rate": 22.00, "currency": "INR"}, {"modality": "ULTRASOUND", "rate": 20.00, "currency": "INR"}]',
 '8765432109876543', 'HDFC Bank', 'HDFC0000001', '29AAARP2345C1ZV', 'AAARP2345C',
 'Mary Johnson', 'Specialized teleradiology for diagnostic centers', 'PER_STUDY', 32.00),
('TEL003', 'MediRead Teleradiology', 'TELERADIOLOGY_COMPANY', 'Multi-Specialty', 'N/A', 'N/A',
 1, '+1-555-333-4444', 'support@mediread.com', '300 Medical Hub, Suite 400', 'Calicut', 'Kerala', '673001',
 '[{"modality": "MRI", "rate": 30.00, "currency": "INR"}, {"modality": "CT", "rate": 20.00, "currency": "INR"}, {"modality": "XRAY", "rate": 12.00, "currency": "INR"}]',
 '7654321098765432', 'ICICI Bank', 'ICIC0000001', '29AAARM3456C1ZV', 'AAARM3456C',
 'David Wilson', 'Fast turnaround teleradiology services', 'PER_STUDY', 30.00),
('TEL004', 'NightHawk Radiology', 'TELERADIOLOGY_COMPANY', 'Emergency Radiology', 'N/A', 'N/A',
 1, '+1-555-444-5555', 'emergency@nighthawk.com', '400 Tech Center, Suite 500', 'Thrissur', 'Kerala', '680001',
 '[{"modality": "MRI", "rate": 40.00, "currency": "INR"}, {"modality": "CT", "rate": 30.00, "currency": "INR"}, {"modality": "ULTRASOUND", "rate": 25.00, "currency": "INR"}]',
 '6543210987654321', 'Axis Bank', 'UTIB0000001', '29AAARN4567C1ZV', 'AAARN4567C',
 'Sarah Anderson', '24/7 emergency radiology reporting service', 'PER_STUDY', 40.00)
ON CONFLICT (radiologist_code) DO NOTHING;

-- Sample study reporting updates (ON CONFLICT-safe via WHERE)
UPDATE studies SET radiologist_code='RAD001', report_date='2024-03-15', reporting_rate=50.00, report_status='COMPLETED', payment_status='PENDING' WHERE id='STY123456' AND active=true;
UPDATE studies SET radiologist_code='RAD002', report_date='2024-03-15', reporting_rate=45.00, report_status='COMPLETED', payment_status='PENDING' WHERE id='STY123457' AND active=true;
UPDATE studies SET radiologist_code='TEL001', report_date='2024-03-15', reporting_rate=35.00, report_status='COMPLETED', payment_status='PAID', payment_date='2024-03-20' WHERE id='STY123458' AND active=true;
UPDATE studies SET radiologist_code='RAD003', report_date='2024-03-15', reporting_rate=35.00, report_status='COMPLETED', payment_status='PENDING' WHERE id='STY123459' AND active=true;

-- Sample radiologist payments
INSERT INTO radiologist_payments (
    payment_id, radiologist_code, payment_date, payment_mode, amount_paid,
    study_ids, bank_account_id, transaction_reference, notes
) VALUES
('RADPAY123ABC', 'TEL001', '2024-03-20', 'BANK_TRANSFER', 105.00, ARRAY['STY123458'], 1, 'NEFT202403200001', 'Payment for 3 studies in March'),
('RADPAY456DEF', 'RAD001', '2024-03-25', 'BANK_TRANSFER', 95.00,  ARRAY['STY123456','STY123457'], 1, 'NEFT202403250002', 'Payment for 2 MRI studies'),
('RADPAY789GHI', 'RAD002', '2024-03-28', 'UPI',           45.00,  ARRAY['STY123457'], 2, 'UPI202403280001',   'Single study payment via UPI')
ON CONFLICT (payment_id) DO NOTHING;

-- Functions
CREATE OR REPLACE FUNCTION get_radiologist_rates(
    p_center_id  INTEGER DEFAULT NULL,
    p_modality   VARCHAR(20) DEFAULT NULL,
    p_study_code VARCHAR(20) DEFAULT NULL
) RETURNS TABLE (
    radiologist_code VARCHAR(20),
    name             VARCHAR(100),
    type             VARCHAR(20),
    specialty        VARCHAR(50),
    modality         VARCHAR(20),
    study_code       VARCHAR(20),
    reporting_rate   DECIMAL(10,2),
    currency         VARCHAR(3)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rm.radiologist_code,
        rm.radiologist_name          AS name,
        rm.type,
        rm.specialty,
        (rate_data->>'modality')::VARCHAR(20),
        (rate_data->>'study_code')::VARCHAR(20),
        (rate_data->>'rate')::DECIMAL(10,2),
        COALESCE(rate_data->>'currency', 'INR')::VARCHAR(3)
    FROM radiologist_master rm,
         jsonb_array_elements(rm.reporting_rates) AS rate_data
    WHERE rm.active = true
      AND (p_center_id IS NULL OR rm.center_id = p_center_id)
      AND (p_modality IS NULL OR rate_data->>'modality' = p_modality)
      AND (p_study_code IS NULL OR rate_data->>'study_code' = p_study_code)
    ORDER BY rm.radiologist_name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_radiologist_earnings(
    p_radiologist_code VARCHAR(20),
    p_start_date       DATE DEFAULT NULL,
    p_end_date         DATE DEFAULT NULL
) RETURNS TABLE (
    radiologist_code  VARCHAR(20),
    radiologist_name  VARCHAR(100),
    radiologist_type  VARCHAR(20),
    total_studies     BIGINT,
    total_earnings    DECIMAL(15,2),
    paid_amount       DECIMAL(15,2),
    pending_amount    DECIMAL(15,2),
    average_rate      DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rm.radiologist_code,
        rm.radiologist_name          AS radiologist_name,
        rm.type                      AS radiologist_type,
        COUNT(s.id)                  AS total_studies,
        COALESCE(SUM(s.reporting_rate), 0)::DECIMAL(15,2)                                                          AS total_earnings,
        COALESCE(SUM(CASE WHEN s.payment_status = 'PAID'    THEN s.reporting_rate ELSE 0 END), 0)::DECIMAL(15,2)   AS paid_amount,
        COALESCE(SUM(CASE WHEN s.payment_status = 'PENDING' THEN s.reporting_rate ELSE 0 END), 0)::DECIMAL(15,2)   AS pending_amount,
        COALESCE(AVG(s.reporting_rate), 0)::DECIMAL(10,2)                                                          AS average_rate
    FROM radiologist_master rm
    LEFT JOIN studies s ON rm.radiologist_code = s.radiologist_code
        AND s.active = true AND s.report_status = 'COMPLETED'
        AND (p_start_date IS NULL OR s.report_date >= p_start_date)
        AND (p_end_date   IS NULL OR s.report_date <= p_end_date)
    WHERE rm.radiologist_code = p_radiologist_code AND rm.active = true
    GROUP BY rm.radiologist_code, rm.radiologist_name, rm.type;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_reporting_rates()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.reporting_rates IS NULL OR jsonb_array_length(NEW.reporting_rates) = 0 THEN
        RAISE EXCEPTION 'At least one reporting rate is required';
    END IF;

    FOR i IN 1..jsonb_array_length(NEW.reporting_rates) LOOP
        IF NOT (NEW.reporting_rates->>(i-1)->>'modality' IS NOT NULL AND
                NEW.reporting_rates->>(i-1)->>'rate'     IS NOT NULL) THEN
            RAISE EXCEPTION 'Each reporting rate must have modality and rate';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_reporting_rates ON radiologist_master;
CREATE TRIGGER trigger_validate_reporting_rates
    BEFORE INSERT OR UPDATE ON radiologist_master
    FOR EACH ROW EXECUTE FUNCTION validate_reporting_rates();

CREATE OR REPLACE FUNCTION process_bulk_radiologist_payments(
    p_radiologist_code    VARCHAR(20),
    p_payment_date        DATE,
    p_payment_mode        VARCHAR(20),
    p_bank_account_id     INTEGER,
    p_transaction_reference VARCHAR(100) DEFAULT NULL,
    p_notes               TEXT DEFAULT NULL
) RETURNS VARCHAR(20) AS $$
DECLARE
    v_payment_id    VARCHAR(20);
    total_amount    DECIMAL(15,2);
    v_study_ids     TEXT[];
BEGIN
    SELECT COALESCE(SUM(reporting_rate), 0), ARRAY_AGG(id::TEXT)
    INTO total_amount, v_study_ids
    FROM studies
    WHERE radiologist_code = p_radiologist_code
      AND payment_status   = 'PENDING'
      AND report_status    = 'COMPLETED'
      AND active           = true;

    IF total_amount = 0 OR v_study_ids IS NULL THEN
        RAISE NOTICE 'No pending studies found for payment';
        RETURN NULL;
    END IF;

    v_payment_id := 'RADPAY' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS');

    INSERT INTO radiologist_payments (
        payment_id, radiologist_code, payment_date, payment_mode, amount_paid,
        study_ids, bank_account_id, transaction_reference, notes, created_at, updated_at, active
    ) VALUES (
        v_payment_id, p_radiologist_code, p_payment_date, p_payment_mode, total_amount,
        v_study_ids, p_bank_account_id, p_transaction_reference, p_notes, NOW(), NOW(), true
    );

    UPDATE studies
    SET payment_status = 'PAID',
        payment_date   = p_payment_date,
        payment_id     = v_payment_id,
        updated_at     = NOW()
    WHERE id = ANY(v_study_ids) AND active = true;

    RETURN v_payment_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error processing bulk payment: %', SQLERRM;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Views
CREATE OR REPLACE VIEW radiologist_dashboard_view AS
SELECT
    'RADIOLOGY_DASHBOARD'                                                                                                                    AS dashboard_type,
    (SELECT COUNT(*) FROM radiologist_master WHERE active = true)                                                                            AS total_radiologists,
    (SELECT COUNT(*) FROM radiologist_master WHERE active = true AND type = 'INDIVIDUAL')                                                    AS individual_radiologists,
    (SELECT COUNT(*) FROM radiologist_master WHERE active = true AND type = 'TELERADIOLOGY_COMPANY')                                         AS teleradiology_companies,
    (SELECT COUNT(*) FROM studies WHERE active = true AND radiologist_code IS NOT NULL)                                                      AS total_studies_reported,
    (SELECT COUNT(*) FROM studies WHERE active = true AND radiologist_code IS NOT NULL AND report_status = 'COMPLETED')                      AS completed_reports,
    (SELECT COUNT(*) FROM studies WHERE active = true AND radiologist_code IS NOT NULL AND report_status = 'PARTIAL')                        AS partial_reports,
    (SELECT COUNT(*) FROM studies WHERE active = true AND radiologist_code IS NOT NULL AND report_status = 'REVIEW')                         AS review_reports,
    (SELECT COALESCE(SUM(reporting_rate), 0) FROM studies WHERE active = true AND radiologist_code IS NOT NULL)                              AS total_reporting_amount,
    (SELECT COALESCE(SUM(CASE WHEN payment_status = 'PAID'    THEN reporting_rate ELSE 0 END), 0) FROM studies WHERE active = true AND radiologist_code IS NOT NULL) AS paid_amount,
    (SELECT COALESCE(SUM(CASE WHEN payment_status = 'PENDING' THEN reporting_rate ELSE 0 END), 0) FROM studies WHERE active = true AND radiologist_code IS NOT NULL) AS pending_amount,
    CURRENT_TIMESTAMP                                                                                                                        AS last_updated;
