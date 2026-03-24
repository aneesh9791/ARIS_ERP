-- Migration 012: Simple Insurance - Basic Insurance Provider Tracking
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/database/simple-insurance-schema.sql
-- Note: patients.insurance_provider_id was already added in 011_insurance.sql pointing to
--   insurance_providers. Here we add a separate simple_insurance_providers table.
--   The ALTER TABLE for insurance_provider_id below uses IF NOT EXISTS so it is safe.

-- SIMPLE INSURANCE PROVIDERS TABLE
CREATE TABLE IF NOT EXISTS simple_insurance_providers (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    code       VARCHAR(20) NOT NULL UNIQUE,
    phone      VARCHAR(20) NOT NULL,
    email      VARCHAR(100) NOT NULL,
    city       VARCHAR(100) NOT NULL,
    state      VARCHAR(100) NOT NULL,
    center_id  INTEGER REFERENCES centers(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active     BOOLEAN DEFAULT true
);

-- Extend patients table with simple insurance fields
ALTER TABLE patients ADD COLUMN IF NOT EXISTS has_insurance         BOOLEAN DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS policy_number         VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insured_name          VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS relationship          VARCHAR(50);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_simple_insurance_providers_center_id ON simple_insurance_providers(center_id);
CREATE INDEX IF NOT EXISTS idx_simple_insurance_providers_active     ON simple_insurance_providers(active);
CREATE INDEX IF NOT EXISTS idx_patients_has_insurance               ON patients(has_insurance);
CREATE INDEX IF NOT EXISTS idx_patients_insurance_provider_id_sim   ON patients(insurance_provider_id);

-- Sample data: simple insurance providers
INSERT INTO simple_insurance_providers (name, code, phone, email, city, state, center_id) VALUES
('Star Health and Allied Insurance',      'SH001',   '+91-484-2345678', 'kochi@starhealth.com',         'Kochi',      'Kerala', 1),
('New India Assurance',                   'NIA001',  '+91-471-3456789', 'trivandrum@newindia.com',      'Trivandrum', 'Kerala', 1),
('United India Insurance',                'UII001',  '+91-495-4567890', 'calicut@unitedindia.com',      'Calicut',    'Kerala', 1),
('HDFC Ergo General Insurance',           'HDFC001', '+91-487-5678901', 'thrissur@hdfcergo.com',        'Thrissur',   'Kerala', 1),
('ICICI Lombard General Insurance',       'ICI001',  '+91-484-7890123', 'kochi@icicilombard.com',       'Kochi',      'Kerala', 1),
('Bajaj Allianz General Insurance',       'BAJ001',  '+91-471-8901234', 'trivandrum@bajajallianz.com',  'Trivandrum', 'Kerala', 1),
('Reliance General Insurance',            'REL001',  '+91-495-9012345', 'calicut@reliancegeneral.com',  'Calicut',    'Kerala', 1),
('Oriental Insurance',                    'ORI001',  '+91-487-0123456', 'thrissur@orientalinsurance.com','Thrissur',  'Kerala', 1),
('IFFCO Tokio General Insurance',         'IFF001',  '+91-484-3456780', 'kochi@iffcotokio.com',         'Kochi',      'Kerala', 1),
('Royal Sundaram General Insurance',      'RSG001',  '+91-471-2345670', 'trivandrum@royalsundaram.com', 'Trivandrum', 'Kerala', 1),
('Cholamandalam MS General Insurance',    'CHM001',  '+91-495-4567880', 'calicut@cholams.com',          'Calicut',    'Kerala', 1),
('SBI General Insurance',                 'SBI001',  '+91-487-5678890', 'thrissur@sbigen.com',          'Thrissur',   'Kerala', 1),
('Max Bupa Health Insurance',             'MAX001',  '+91-484-2345690', 'kochi@maxbupa.com',            'Kochi',      'Kerala', 1),
('Apollo Munich Health Insurance',        'APL001',  '+91-471-3456790', 'trivandrum@apollo.com',        'Trivandrum', 'Kerala', 1),
('HDFC Health Insurance',                 'HDFH001', '+91-495-4567891', 'calicut@hdfchealth.com',       'Calicut',    'Kerala', 1),
('Niva Bupa Health Insurance',            'NIV001',  '+91-487-5678902', 'thrissur@nivabupa.com',        'Thrissur',   'Kerala', 1)
ON CONFLICT (code) DO NOTHING;

-- Sample patient insurance updates
UPDATE patients SET has_insurance=true,  insurance_provider_id=1, policy_number='SH123456789',   insured_name='John Doe',        relationship='Self' WHERE id='PAT123456';
UPDATE patients SET has_insurance=true,  insurance_provider_id=2, policy_number='NIA987654321',  insured_name='Jane Smith',      relationship='Self' WHERE id='PAT123457';
UPDATE patients SET has_insurance=false WHERE id='PAT123458';
UPDATE patients SET has_insurance=true,  insurance_provider_id=3, policy_number='UII456789012',  insured_name='Robert Johnson',  relationship='Self' WHERE id='PAT123459';

-- Functions
CREATE OR REPLACE FUNCTION get_simple_insurance_statistics(p_center_id INTEGER DEFAULT NULL)
RETURNS TABLE (
    total_patients              BIGINT,
    patients_with_insurance     BIGINT,
    patients_without_insurance  BIGINT,
    insurance_percentage        DECIMAL(5,2),
    active_providers            BIGINT,
    providers_with_patients     BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)                                                                             AS total_patients,
        COUNT(CASE WHEN p.has_insurance = true  THEN 1 END)                                 AS patients_with_insurance,
        COUNT(CASE WHEN p.has_insurance = false THEN 1 END)                                 AS patients_without_insurance,
        CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(CASE WHEN p.has_insurance=true THEN 1 END)*100.0/COUNT(*)), 2) ELSE 0 END AS insurance_percentage,
        COUNT(DISTINCT sip.id)                                                               AS active_providers,
        COUNT(DISTINCT CASE WHEN p.has_insurance = true THEN p.insurance_provider_id END)   AS providers_with_patients
    FROM patients p
    LEFT JOIN simple_insurance_providers sip ON p.insurance_provider_id = sip.id AND sip.active = true
    WHERE p.active = true AND (p_center_id IS NULL OR p.center_id = p_center_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_patient_insurance(
    p_patient_id             VARCHAR(36),
    p_has_insurance          BOOLEAN,
    p_insurance_provider_id  INTEGER DEFAULT NULL,
    p_policy_number          VARCHAR(50) DEFAULT NULL,
    p_insured_name           VARCHAR(100) DEFAULT NULL,
    p_relationship           VARCHAR(50) DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    patient_exists BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM patients WHERE id = p_patient_id AND active = true) INTO patient_exists;
    IF NOT patient_exists THEN
        RAISE EXCEPTION 'Patient not found';
    END IF;

    UPDATE patients SET
        has_insurance         = p_has_insurance,
        insurance_provider_id = CASE WHEN p_has_insurance = true THEN p_insurance_provider_id ELSE NULL END,
        policy_number         = CASE WHEN p_has_insurance = true THEN p_policy_number          ELSE NULL END,
        insured_name          = CASE WHEN p_has_insurance = true THEN p_insured_name           ELSE NULL END,
        relationship          = CASE WHEN p_has_insurance = true THEN p_relationship           ELSE NULL END,
        updated_at            = NOW()
    WHERE id = p_patient_id AND active = true;

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error updating patient insurance: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_patients_by_insurance_status(
    p_has_insurance BOOLEAN,
    p_center_id     INTEGER DEFAULT NULL,
    p_limit         INTEGER DEFAULT 10,
    p_offset        INTEGER DEFAULT 0
) RETURNS TABLE (
    patient_id              VARCHAR(36),
    patient_name            VARCHAR(100),
    patient_phone           VARCHAR(20),
    patient_email           VARCHAR(100),
    has_insurance           BOOLEAN,
    insurance_provider_name VARCHAR(100),
    insurance_provider_code VARCHAR(20),
    policy_number           VARCHAR(50),
    insured_name            VARCHAR(100),
    relationship            VARCHAR(50),
    center_name             VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id            AS patient_id,
        p.name          AS patient_name,
        p.phone         AS patient_phone,
        p.email         AS patient_email,
        p.has_insurance,
        sip.name        AS insurance_provider_name,
        sip.code        AS insurance_provider_code,
        p.policy_number,
        p.insured_name,
        p.relationship,
        c.name          AS center_name
    FROM patients p
    LEFT JOIN simple_insurance_providers sip ON p.insurance_provider_id = sip.id AND sip.active = true
    LEFT JOIN centers c ON p.center_id = c.id
    WHERE p.active = true
      AND p.has_insurance = p_has_insurance
      AND (p_center_id IS NULL OR p.center_id = p_center_id)
    ORDER BY p.name
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_provider_patient_count(p_center_id INTEGER DEFAULT NULL)
RETURNS TABLE (
    provider_name VARCHAR(100),
    provider_code VARCHAR(20),
    patient_count BIGINT,
    center_name   VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sip.name     AS provider_name,
        sip.code     AS provider_code,
        COUNT(p.id)  AS patient_count,
        c.name       AS center_name
    FROM simple_insurance_providers sip
    LEFT JOIN patients p ON sip.id = p.insurance_provider_id AND p.active = true
    LEFT JOIN centers c ON sip.center_id = c.id
    WHERE sip.active = true AND (p_center_id IS NULL OR sip.center_id = p_center_id)
    GROUP BY sip.id, sip.name, sip.code, c.name
    HAVING COUNT(p.id) > 0
    ORDER BY patient_count DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_insurance_provider()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.has_insurance = true AND NEW.insurance_provider_id IS NULL THEN
        RAISE EXCEPTION 'Insurance provider is required when patient has insurance';
    END IF;

    IF NEW.has_insurance = false THEN
        NEW.insurance_provider_id := NULL;
        NEW.policy_number         := NULL;
        NEW.insured_name          := NULL;
        NEW.relationship          := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_insurance_provider ON patients;
CREATE TRIGGER trigger_validate_insurance_provider
    BEFORE INSERT OR UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION validate_insurance_provider();

-- Views
CREATE OR REPLACE VIEW simple_insurance_dashboard AS
SELECT
    'SIMPLE_INSURANCE'                                                                                                              AS dashboard_type,
    (SELECT COUNT(*) FROM patients WHERE active = true)                                                                            AS total_patients,
    (SELECT COUNT(*) FROM patients WHERE active = true AND has_insurance = true)                                                    AS patients_with_insurance,
    (SELECT COUNT(*) FROM patients WHERE active = true AND has_insurance = false)                                                   AS patients_without_insurance,
    (SELECT COUNT(*) FROM simple_insurance_providers WHERE active = true)                                                          AS total_providers,
    (SELECT COUNT(DISTINCT insurance_provider_id) FROM patients WHERE active = true AND has_insurance = true)                      AS providers_with_patients,
    CURRENT_TIMESTAMP                                                                                                              AS last_updated;
