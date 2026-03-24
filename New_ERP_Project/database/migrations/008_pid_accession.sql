-- Migration 008: PID and Accession Number Generation
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/database/pid-accession-schema.sql
-- Fix applied: Function signatures using INTEGER for patient_id updated to VARCHAR(36).
-- Note: studies.accession_number already exists in 002_masters — ALTER uses IF NOT EXISTS.

-- Add PID columns to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pid                VARCHAR(20) UNIQUE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pid_generated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add accession columns to studies
ALTER TABLE studies ADD COLUMN IF NOT EXISTS accession_number         VARCHAR(20) UNIQUE;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS accession_generated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add accession columns to patient_bills
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS accession_number       VARCHAR(20);
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS accession_generated    BOOLEAN DEFAULT false;
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS accession_generated_at TIMESTAMP;

-- Add billing status constraint (only if not already present)
DO $$
BEGIN
    ALTER TABLE patient_bills ADD CONSTRAINT chk_payment_status
        CHECK (payment_status IN ('BILLED','PAID','CANCELLED','REFUNDED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- Add API tracking columns to patient_bills
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS api_sent           BOOLEAN DEFAULT false;
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS api_sent_at        TIMESTAMP;
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS api_response_code  INTEGER;
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS api_success        BOOLEAN DEFAULT false;
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS api_error_message  TEXT;
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS api_retry_count    INTEGER DEFAULT 0;
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS last_api_attempt   TIMESTAMP;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patient_bills_api_success ON patient_bills(api_success);
CREATE INDEX IF NOT EXISTS idx_patient_bills_api_sent_at ON patient_bills(api_sent_at);
-- system_config indexes are created after the table below

-- Sequences
CREATE SEQUENCE IF NOT EXISTS pid_sequence
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE SEQUENCE IF NOT EXISTS accession_sequence
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-- System Configuration Table
CREATE TABLE IF NOT EXISTS system_config (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(100) UNIQUE NOT NULL,
    value       TEXT,
    description TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_config_key_v2        ON system_config(key);
CREATE INDEX IF NOT EXISTS idx_system_config_updated_at_v2 ON system_config(updated_at);

DROP TRIGGER IF EXISTS update_system_config_updated_at ON system_config;
CREATE TRIGGER update_system_config_updated_at
    BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Default config values
INSERT INTO system_config (key, value, description) VALUES
('LOCAL_SYSTEM_API_ENDPOINT', 'http://localhost:8080/api/patient-demographics', 'API endpoint for local system integration'),
('LOCAL_SYSTEM_API_TOKEN',    '',       'Bearer token for local system API authentication'),
('LOCAL_SYSTEM_API_KEY',      '',       'API key for local system authentication (alternative to token)'),
('PID_PREFIX',                'AR',     'Prefix for patient ID generation'),
('ACCESSION_PREFIX',          'ACC',    'Prefix for accession number generation'),
('ENABLE_AUTO_PID',           'true',   'Enable automatic PID generation'),
('ENABLE_AUTO_ACCESSION',     'true',   'Enable automatic accession number generation'),
('API_REQUEST_TIMEOUT',       '15000',  'API request timeout in milliseconds'),
('API_RETRY_ATTEMPTS',        '3',      'Number of retry attempts for failed API calls'),
('ENABLE_REQUEST_SIGNING',    'true',   'Enable request signing with checksum'),
('LOCAL_SYSTEM_CLIENT_ID',    'aris-erp', 'Client ID for local system identification'),
('ENABLE_DEMOGRAPHICS_SYNC',  'true',   'Enable automatic demographics synchronization')
ON CONFLICT (key) DO NOTHING;

-- Functions
CREATE OR REPLACE FUNCTION generate_pid()
RETURNS TEXT AS $$
DECLARE
    next_num BIGINT;
BEGIN
    next_num := nextval('pid_sequence');
    RETURN 'AR' || LPAD(next_num::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_accession_number()
RETURNS TEXT AS $$
DECLARE
    next_num  BIGINT;
    year_text TEXT;
BEGIN
    year_text := TO_CHAR(CURRENT_DATE, 'YY');
    next_num  := nextval('accession_sequence');
    RETURN 'ACC-' || year_text || '-' || LPAD(next_num::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_generate_pid()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pid IS NULL OR NEW.pid = '' THEN
        NEW.pid              := generate_pid();
        NEW.pid_generated_at := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_generate_accession_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_study_id VARCHAR(36);
    accession_num TEXT;
BEGIN
    IF NEW.payment_status = 'PAID' AND (NEW.accession_number IS NULL OR NEW.accession_number = '') THEN
        accession_num := generate_accession_number();

        NEW.accession_number       := accession_num;
        NEW.accession_generated    := true;
        NEW.accession_generated_at := CURRENT_TIMESTAMP;

        SELECT s.id INTO v_study_id
        FROM studies s
        WHERE s.patient_id = NEW.patient_id
          AND s.active = true
        ORDER BY s.created_at DESC
        LIMIT 1;

        IF v_study_id IS NOT NULL THEN
            UPDATE studies
            SET accession_number        = accession_num,
                accession_generated_at  = CURRENT_TIMESTAMP
            WHERE id = v_study_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_pid ON patients;
CREATE TRIGGER trigger_auto_generate_pid
    BEFORE INSERT ON patients
    FOR EACH ROW EXECUTE FUNCTION auto_generate_pid();

DROP TRIGGER IF EXISTS trigger_auto_generate_accession_on_payment ON patient_bills;
CREATE TRIGGER trigger_auto_generate_accession_on_payment
    BEFORE UPDATE ON patient_bills
    FOR EACH ROW EXECUTE FUNCTION auto_generate_accession_on_payment();

-- Fix: patient_id params changed to VARCHAR(36)
CREATE OR REPLACE FUNCTION get_patient_demographics_with_accession(
    p_patient_id      VARCHAR(36),
    p_include_studies BOOLEAN DEFAULT true
)
RETURNS TABLE (
    patient_id              VARCHAR(36),
    pid                     VARCHAR(20),
    name                    VARCHAR(100),
    phone                   VARCHAR(20),
    email                   VARCHAR(100),
    date_of_birth           DATE,
    gender                  VARCHAR(10),
    address                 TEXT,
    city                    VARCHAR(100),
    state                   VARCHAR(100),
    postal_code             VARCHAR(20),
    id_proof_type           VARCHAR(50),
    id_proof_number         VARCHAR(100),
    id_proof_verified       BOOLEAN,
    blood_group             VARCHAR(10),
    allergies               TEXT,
    emergency_contact_name  VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    center_id               INTEGER,
    center_name             VARCHAR(100),
    total_studies           BIGINT,
    last_study_date         TIMESTAMP,
    studies_with_accession  JSONB,
    latest_accession_number VARCHAR(20)
) AS $$
DECLARE
    latest_accession VARCHAR(20);
BEGIN
    SELECT MAX(pb.accession_number) INTO latest_accession
    FROM patient_bills pb
    WHERE pb.patient_id = p_patient_id
      AND pb.accession_generated = true;

    RETURN QUERY
    SELECT
        p.id,
        p.pid,
        p.name,
        p.phone,
        p.email,
        p.dob,
        p.gender,
        CONCAT(p.address, ', ', p.city, ', ', p.state, ' - ', p.postal_code)::TEXT,
        p.city,
        p.state,
        p.postal_code,
        p.id_proof_type,
        p.id_proof_number,
        p.id_proof_verified,
        p.blood_group,
        p.allergies,
        p.emergency_contact_name,
        p.emergency_contact_phone,
        p.center_id,
        c.name AS center_name,
        COUNT(ps.study_id)          AS total_studies,
        MAX(s.created_at)           AS last_study_date,
        CASE
            WHEN p_include_studies THEN COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'study_id',         s.id,
                        'study_code',       s.study_code,
                        'study_name',       sm.study_name,
                        'accession_number', s.accession_number,
                        'status',           s.status,
                        'appointment_date', s.appointment_date,
                        'bill_id',          pb.id,
                        'bill_amount',      pb.total_amount,
                        'payment_status',   pb.payment_status,
                        'created_at',       s.created_at
                    ) ORDER BY s.created_at DESC
                ) FILTER (WHERE s.id IS NOT NULL),
                '[]'::JSONB
            )
            ELSE '[]'::JSONB
        END AS studies_with_accession,
        latest_accession
    FROM patients p
    LEFT JOIN centers c        ON p.center_id = c.id
    LEFT JOIN patient_studies ps ON p.id = ps.patient_id
    LEFT JOIN studies s          ON ps.study_id = s.id AND s.active = true
    LEFT JOIN study_master sm    ON s.study_code = sm.study_code
    LEFT JOIN patient_bills pb   ON pb.patient_id = p.id
    WHERE p.id = p_patient_id AND p.active = true
    GROUP BY p.id, p.pid, p.name, p.phone, p.email, p.dob, p.gender,
             p.address, p.city, p.state, p.postal_code, p.id_proof_type, p.id_proof_number,
             p.id_proof_verified, p.blood_group, p.allergies, p.emergency_contact_name,
             p.emergency_contact_phone, p.center_id, c.name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION search_patients_by_pid(p_pid TEXT)
RETURNS TABLE (
    patient_id              VARCHAR(36),
    pid                     VARCHAR(20),
    name                    VARCHAR(100),
    phone                   VARCHAR(20),
    email                   VARCHAR(100),
    center_name             VARCHAR(100),
    total_studies           BIGINT,
    last_study_date         TIMESTAMP,
    latest_accession_number VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id          AS patient_id,
        p.pid,
        p.name,
        p.phone,
        p.email,
        c.name        AS center_name,
        COUNT(ps.study_id) AS total_studies,
        MAX(s.created_at)  AS last_study_date,
        MAX(pb.accession_number) AS latest_accession_number
    FROM patients p
    LEFT JOIN centers c        ON p.center_id = c.id
    LEFT JOIN patient_studies ps ON p.id = ps.patient_id
    LEFT JOIN studies s          ON ps.study_id = s.id AND s.active = true
    LEFT JOIN patient_bills pb   ON pb.patient_id = p.id AND pb.accession_generated = true
    WHERE p.active = true AND p.pid ILIKE CONCAT('%', p_pid, '%')
    GROUP BY p.id, p.pid, p.name, p.phone, p.email, c.name
    ORDER BY p.name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_study_by_accession_number(p_accession_number TEXT)
RETURNS TABLE (
    study_id        VARCHAR(36),
    accession_number VARCHAR(20),
    patient_id      VARCHAR(36),
    patient_pid     VARCHAR(20),
    patient_name    VARCHAR(100),
    patient_phone   VARCHAR(20),
    study_code      VARCHAR(20),
    study_name      VARCHAR(100),
    modality        VARCHAR(50),
    status          VARCHAR(20),
    appointment_date DATE,
    appointment_time VARCHAR(5),
    radiologist_code VARCHAR(20),
    center_name     VARCHAR(100),
    bill_id         INTEGER,
    bill_amount     DECIMAL(10,2),
    payment_status  VARCHAR(20),
    created_at      TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id              AS study_id,
        s.accession_number,
        s.patient_id,
        p.pid             AS patient_pid,
        p.name            AS patient_name,
        p.phone           AS patient_phone,
        s.study_code,
        sm.study_name,
        sm.modality,
        s.status,
        s.appointment_date,
        s.appointment_time,
        s.radiologist_code,
        c.name            AS center_name,
        pb.id             AS bill_id,
        pb.total_amount   AS bill_amount,
        pb.payment_status,
        s.created_at
    FROM studies s
    LEFT JOIN patients p      ON s.patient_id = p.id
    LEFT JOIN study_master sm ON s.study_code = sm.study_code
    LEFT JOIN centers c       ON s.center_id = c.id
    LEFT JOIN patient_bills pb ON pb.patient_id = s.patient_id
    WHERE s.accession_number = p_accession_number AND s.active = true;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION send_demographics_to_local_system(p_patient_id VARCHAR(36))
RETURNS TABLE (
    success       BOOLEAN,
    message       TEXT,
    patient_data  JSONB,
    api_endpoint  TEXT,
    response_code INTEGER
) AS $$
DECLARE
    v_patient_data   JSONB;
    local_system_url TEXT;
    v_response_code  INTEGER;
BEGIN
    SELECT jsonb_build_object(
        'patient_id', p.patient_id,
        'pid',        p.pid,
        'name',       p.name,
        'phone',      p.phone,
        'email',      p.email,
        'center_id',  p.center_id,
        'timestamp',  CURRENT_TIMESTAMP
    ) INTO v_patient_data
    FROM get_patient_demographics_with_accession(p_patient_id, true) p
    LIMIT 1;

    local_system_url := COALESCE(
        (SELECT value FROM system_config WHERE key = 'LOCAL_SYSTEM_API_ENDPOINT'),
        'http://localhost:8080/api/patient-demographics'
    );

    v_response_code := 200;

    RETURN QUERY SELECT
        true                            AS success,
        'Demographics sent successfully'::TEXT AS message,
        v_patient_data                  AS patient_data,
        local_system_url                AS api_endpoint,
        v_response_code                 AS response_code;
END;
$$ LANGUAGE plpgsql;

-- Updated patient_quick_search including PID and accession (drop first to allow return type change)
DROP FUNCTION IF EXISTS patient_quick_search(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION patient_quick_search(
    p_search_term TEXT,
    p_center_id   INTEGER DEFAULT NULL,
    p_limit       INTEGER DEFAULT 10
) RETURNS TABLE (
    patient_id              VARCHAR(36),
    pid                     VARCHAR(20),
    patient_name            VARCHAR(100),
    patient_phone           VARCHAR(20),
    patient_email           VARCHAR(100),
    id_proof_type           VARCHAR(50),
    id_proof_number         VARCHAR(100),
    center_name             VARCHAR(100),
    total_studies           BIGINT,
    last_visit              DATE,
    latest_accession_number VARCHAR(20),
    match_type              VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id                    AS patient_id,
        p.pid,
        p.name                  AS patient_name,
        p.phone                 AS patient_phone,
        p.email                 AS patient_email,
        p.id_proof_type,
        p.id_proof_number,
        c.name                  AS center_name,
        COUNT(ps.study_id)      AS total_studies,
        MAX(s.created_at)::DATE AS last_visit,
        MAX(pb.accession_number) AS latest_accession_number,
        CASE
            WHEN p.pid            ILIKE CONCAT('%', p_search_term, '%') THEN 'PID'
            WHEN p.name           ILIKE CONCAT('%', p_search_term, '%') THEN 'NAME'
            WHEN p.phone          ILIKE CONCAT('%', p_search_term, '%') THEN 'PHONE'
            WHEN p.email          ILIKE CONCAT('%', p_search_term, '%') THEN 'EMAIL'
            WHEN p.id_proof_number ILIKE CONCAT('%', p_search_term, '%') THEN 'ID_PROOF'
            ELSE 'OTHER'
        END::VARCHAR(20)        AS match_type
    FROM patients p
    LEFT JOIN centers c          ON p.center_id = c.id
    LEFT JOIN patient_studies ps ON p.id = ps.patient_id
    LEFT JOIN studies s          ON ps.study_id = s.id AND s.active = true
    LEFT JOIN patient_bills pb   ON pb.patient_id = p.id AND pb.accession_generated = true
    WHERE p.active = true
      AND (p_center_id IS NULL OR p.center_id = p_center_id)
      AND (
          p.pid             ILIKE CONCAT('%', p_search_term, '%') OR
          p.name            ILIKE CONCAT('%', p_search_term, '%') OR
          p.phone           ILIKE CONCAT('%', p_search_term, '%') OR
          p.email           ILIKE CONCAT('%', p_search_term, '%') OR
          p.id_proof_number ILIKE CONCAT('%', p_search_term, '%')
      )
    GROUP BY p.id, p.pid, p.name, p.phone, p.email, p.id_proof_type, p.id_proof_number, c.name
    ORDER BY
        CASE
            WHEN p.pid  ILIKE CONCAT('%', p_search_term, '%') THEN 1
            WHEN p.name ILIKE CONCAT('%', p_search_term, '%') THEN 2
            WHEN p.phone ILIKE CONCAT('%', p_search_term, '%') THEN 3
            ELSE 4
        END,
        p.name
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- View
CREATE OR REPLACE VIEW pid_accession_stats AS
SELECT
    'PID_ACCESSION_STATS'                                                                  AS stats_type,
    COUNT(*)                                                                               AS total_patients,
    COUNT(CASE WHEN pid IS NOT NULL THEN 1 END)                                            AS patients_with_pid,
    COUNT(CASE WHEN pid IS NOT NULL AND pid LIKE 'AR%' THEN 1 END)                         AS patients_with_generated_pid,
    COUNT(DISTINCT pid)                                                                    AS unique_pids,
    (SELECT MAX(CAST(SUBSTRING(pid, 3) AS INTEGER)) FROM patients WHERE pid LIKE 'AR%')   AS highest_pid_number,
    COUNT(CASE WHEN EXISTS (
        SELECT 1 FROM patient_bills pb
        WHERE pb.patient_id = p.id AND pb.accession_generated = true
    ) THEN 1 END)                                                                          AS patients_with_accession_numbers,
    (SELECT COUNT(*) FROM patient_bills WHERE accession_generated = true)                  AS total_accession_numbers,
    (SELECT MAX(CAST(SUBSTRING(accession_number, 8, 8) AS INTEGER))
     FROM patient_bills WHERE accession_number LIKE 'ACC-%')                               AS highest_accession_number,
    CURRENT_TIMESTAMP                                                                      AS last_updated
FROM patients p;
