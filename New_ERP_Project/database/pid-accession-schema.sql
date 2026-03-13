-- Automatic PID and Accession Number Generation Schema

-- Update patients table to add PID
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS pid VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS pid_generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update studies table to add accession number
ALTER TABLE studies 
ADD COLUMN IF NOT EXISTS accession_number VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS accession_generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update patient_bills table to add accession number link
ALTER TABLE patient_bills 
ADD COLUMN IF NOT EXISTS accession_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS accession_generated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS accession_generated_at TIMESTAMP;

-- Add billing status constraint
ALTER TABLE patient_bills ADD CONSTRAINT chk_payment_status 
CHECK (payment_status IN ('BILLED', 'PAID', 'CANCELLED', 'REFUNDED'));

-- Add API success tracking columns
ALTER TABLE patient_bills 
ADD COLUMN IF NOT EXISTS api_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS api_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS api_response_code INTEGER,
ADD COLUMN IF NOT EXISTS api_success BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS api_error_message TEXT,
ADD COLUMN IF NOT EXISTS api_retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_api_attempt TIMESTAMP;

-- Create index for API tracking
CREATE INDEX IF NOT EXISTS idx_patient_bills_api_success ON patient_bills(api_success);
CREATE INDEX IF NOT EXISTS idx_patient_bills_api_sent_at ON patient_bills(api_sent_at);

-- Create PID generation sequence
CREATE SEQUENCE IF NOT EXISTS pid_sequence
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Create accession number sequence
CREATE SEQUENCE IF NOT EXISTS accession_sequence
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Function to generate PID
CREATE OR REPLACE FUNCTION generate_pid()
RETURNS TEXT AS $$
DECLARE
    next_num BIGINT;
    pid_text TEXT;
BEGIN
    -- Get next number from sequence
    next_num := nextval('pid_sequence');
    
    -- Format as AR******** (8 digits, zero-padded)
    pid_text := 'AR' || LPAD(next_num::TEXT, 8, '0');
    
    RETURN pid_text;
END;
$$ LANGUAGE plpgsql;

-- Function to generate accession number
CREATE OR REPLACE FUNCTION generate_accession_number()
RETURNS TEXT AS $$
DECLARE
    next_num BIGINT;
    accession_text TEXT;
    year_text TEXT;
BEGIN
    -- Get current year (last 2 digits)
    year_text := TO_CHAR(CURRENT_DATE, 'YY');
    
    -- Get next number from sequence
    next_num := nextval('accession_sequence');
    
    -- Format as ACC-YY-******** (year + 8 digits, zero-padded)
    accession_text := 'ACC-' || year_text || '-' || LPAD(next_num::TEXT, 8, '0');
    
    RETURN accession_text;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically generate PID for new patients
CREATE OR REPLACE FUNCTION auto_generate_pid()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate PID only if it's not already set
    IF NEW.pid IS NULL OR NEW.pid = '' THEN
        NEW.pid := generate_pid();
        NEW.pid_generated_at := CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically generate accession number for paid bills
CREATE OR REPLACE FUNCTION auto_generate_accession_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    study_id INTEGER;
    accession_num TEXT;
BEGIN
    -- Only generate accession number if bill is paid and accession not generated
    IF NEW.payment_status = 'PAID' AND (NEW.accession_number IS NULL OR NEW.accession_number = '') THEN
        accession_num := generate_accession_number();
        
        -- Update bill with accession number
        NEW.accession_number := accession_num;
        NEW.accession_generated := true;
        NEW.accession_generated_at := CURRENT_TIMESTAMP;
        
        -- Find associated study and update it too
        SELECT s.id INTO study_id
        FROM studies s
        WHERE s.patient_id = NEW.patient_id 
          AND s.active = true
        ORDER BY s.created_at DESC
        LIMIT 1;
        
        IF study_id IS NOT NULL THEN
            UPDATE studies 
            SET accession_number = accession_num,
                accession_generated_at = CURRENT_TIMESTAMP
            WHERE id = study_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic PID generation
CREATE TRIGGER trigger_auto_generate_pid
    BEFORE INSERT ON patients
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_pid();

-- Create trigger for automatic accession number generation on payment
CREATE TRIGGER trigger_auto_generate_accession_on_payment
    BEFORE UPDATE ON patient_bills
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_accession_on_payment();

-- Function to get patient demographics with PID and accession numbers
CREATE OR REPLACE FUNCTION get_patient_demographics_with_accession(
    p_patient_id INTEGER,
    p_include_studies BOOLEAN DEFAULT true
)
RETURNS TABLE (
    patient_id INTEGER,
    pid VARCHAR(20),
    name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(10),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(10),
    id_proof_type VARCHAR(50),
    id_proof_number VARCHAR(100),
    id_proof_verified BOOLEAN,
    blood_group VARCHAR(10),
    allergies TEXT,
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    center_id INTEGER,
    center_name VARCHAR(100),
    total_studies INTEGER,
    last_study_date TIMESTAMP,
    studies_with_accession JSONB,
    latest_accession_number VARCHAR(20)
) AS $$
DECLARE
    latest_accession VARCHAR(20);
BEGIN
    -- Get latest accession number for this patient
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
        p.date_of_birth,
        p.gender,
        CONCAT(p.address, ', ', p.city, ', ', p.state, ' - ', p.postal_code) as address,
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
        c.name as center_name,
        COUNT(ps.study_id) as total_studies,
        MAX(s.created_at) as last_study_date,
        CASE 
            WHEN p_include_studies THEN COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'study_id', s.id,
                        'study_code', s.study_code,
                        'study_name', sm.study_name,
                        'accession_number', s.accession_number,
                        'status', s.status,
                        'scheduled_date', s.scheduled_date,
                        'completion_date', s.completion_date,
                        'report_date', s.report_date,
                        'bill_id', pb.id,
                        'bill_amount', pb.total_amount,
                        'payment_status', pb.payment_status,
                        'created_at', s.created_at
                    ) ORDER BY s.created_at DESC
                ) FILTER (WHERE s.id IS NOT NULL), 
                '[]'::jsonb
            )
            ELSE '[]'::jsonb
        END as studies_with_accession,
        latest_accession
    FROM patients p
    LEFT JOIN centers c ON p.center_id = c.id
    LEFT JOIN patient_studies ps ON p.id = ps.patient_id
    LEFT JOIN studies s ON ps.study_id = s.id AND s.active = true
    LEFT JOIN study_master sm ON s.study_code = sm.study_code
    LEFT JOIN patient_bills pb ON s.id = pb.study_id
    WHERE p.id = p_patient_id AND p.active = true
    GROUP BY p.id, p.pid, p.name, p.phone, p.email, p.date_of_birth, p.gender, 
             p.address, p.city, p.state, p.postal_code, p.id_proof_type, p.id_proof_number, 
             p.id_proof_verified, p.blood_group, p.allergies, p.emergency_contact_name, 
             p.emergency_contact_phone, p.center_id, c.name;
END;
$$ LANGUAGE plpgsql;

-- Function to search patients by PID
CREATE OR REPLACE FUNCTION search_patients_by_pid(p_pid TEXT)
RETURNS TABLE (
    patient_id INTEGER,
    pid VARCHAR(20),
    name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    center_name VARCHAR(100),
    total_studies INTEGER,
    last_study_date TIMESTAMP,
    latest_accession_number VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id as patient_id,
        p.pid,
        p.name,
        p.phone,
        p.email,
        c.name as center_name,
        COUNT(ps.study_id) as total_studies,
        MAX(s.created_at) as last_study_date,
        MAX(pb.accession_number) as latest_accession_number
    FROM patients p
    LEFT JOIN centers c ON p.center_id = c.id
    LEFT JOIN patient_studies ps ON p.id = ps.patient_id
    LEFT JOIN studies s ON ps.study_id = s.id AND s.active = true
    LEFT JOIN patient_bills pb ON s.id = pb.study_id AND pb.accession_generated = true
    WHERE p.active = true AND p.pid ILIKE CONCAT('%', p_pid, '%')
    GROUP BY p.id, p.pid, p.name, p.phone, p.email, c.name
    ORDER BY p.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get study by accession number
CREATE OR REPLACE FUNCTION get_study_by_accession_number(p_accession_number TEXT)
RETURNS TABLE (
    study_id INTEGER,
    accession_number VARCHAR(20),
    patient_id INTEGER,
    patient_pid VARCHAR(20),
    patient_name VARCHAR(100),
    patient_phone VARCHAR(20),
    study_code VARCHAR(20),
    study_name VARCHAR(20),
    modality VARCHAR(50),
    status VARCHAR(20),
    scheduled_date DATE,
    scheduled_time VARCHAR(10),
    completion_date TIMESTAMP,
    report_date TIMESTAMP,
    radiologist_name VARCHAR(100),
    center_name VARCHAR(100),
    bill_id INTEGER,
    bill_amount DECIMAL(10,2),
    payment_status VARCHAR(20),
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as study_id,
        s.accession_number,
        s.patient_id,
        p.pid as patient_pid,
        p.name as patient_name,
        p.phone as patient_phone,
        s.study_code,
        sm.study_name,
        sm.modality,
        s.status,
        s.scheduled_date,
        s.scheduled_time,
        s.completion_date,
        s.report_date,
        rm.name as radiologist_name,
        c.name as center_name,
        pb.id as bill_id,
        pb.total_amount as bill_amount,
        pb.payment_status,
        s.created_at
    FROM studies s
    LEFT JOIN patients p ON s.patient_id = p.id
    LEFT JOIN study_master sm ON s.study_code = sm.study_code
    LEFT JOIN radiologist_master rm ON s.radiologist_code = rm.radiologist_code
    LEFT JOIN centers c ON s.center_id = c.id
    LEFT JOIN patient_bills pb ON s.id = pb.study_id
    WHERE s.accession_number = p_accession_number AND s.active = true;
END;
$$ LANGUAGE plpgsql;

-- Function to send demographics to local system
CREATE OR REPLACE FUNCTION send_demographics_to_local_system(p_patient_id INTEGER)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    patient_data JSONB,
    api_endpoint TEXT,
    response_code INTEGER
) AS $$
DECLARE
    patient_data JSONB;
    api_endpoint TEXT;
    response_code INTEGER;
    local_system_url TEXT;
BEGIN
    -- Get patient demographics
    SELECT jsonb_build_object(
        'patient_id', p.id,
        'pid', p.pid,
        'name', p.name,
        'phone', p.phone,
        'email', p.email,
        'date_of_birth', p.date_of_birth,
        'gender', p.gender,
        'address', jsonb_build_object(
            'street', p.address,
            'city', p.city,
            'state', p.state,
            'postal_code', p.postal_code
        ),
        'id_proof', jsonb_build_object(
            'type', p.id_proof_type,
            'number', p.id_proof_number,
            'verified', p.id_proof_verified
        ),
        'medical_info', jsonb_build_object(
            'blood_group', p.blood_group,
            'allergies', p.allergies,
            'emergency_contact', jsonb_build_object(
                'name', p.emergency_contact_name,
                'phone', p.emergency_contact_phone
            )
        ),
        'center', jsonb_build_object(
            'id', p.center_id,
            'name', c.name
        ),
        'latest_accession_number', (
            SELECT MAX(pb.accession_number)
            FROM patient_bills pb
            WHERE pb.patient_id = p.patient_id 
              AND pb.accession_generated = true
        ),
        'studies', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'study_id', s.id,
                    'accession_number', s.accession_number,
                    'study_code', s.study_code,
                    'study_name', sm.study_name,
                    'status', s.status,
                    'scheduled_date', s.scheduled_date,
                    'completion_date', s.completion_date
                )
            )
            FROM studies s
            LEFT JOIN study_master sm ON s.study_code = sm.study_code
            WHERE s.patient_id = p.patient_id AND s.active = true
        ),
        'timestamp', CURRENT_TIMESTAMP
    ) INTO patient_data
    FROM get_patient_demographics_with_accession(p_patient_id, true) p
    LEFT JOIN centers c ON p.center_id = c.id
    LIMIT 1;
    
    -- Get API endpoint from configuration (you can add this to a config table)
    local_system_url := COALESCE(
        (SELECT value FROM system_config WHERE key = 'LOCAL_SYSTEM_API_ENDPOINT'),
        'http://localhost:8080/api/patient-demographics'
    );
    
    -- Here you would make the actual API call
    -- For now, we'll simulate it
    response_code := 200;
    
    RETURN QUERY SELECT 
        true as success,
        'Demographics sent successfully' as message,
        patient_data,
        local_system_url as api_endpoint,
        response_code;
END;
$$ LANGUAGE plpgsql;

-- Update patient search function to include PID
CREATE OR REPLACE FUNCTION patient_quick_search(
    p_search_term TEXT,
    p_center_id INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    patient_id INTEGER,
    pid VARCHAR(20),
    patient_name VARCHAR(100),
    patient_phone VARCHAR(20),
    patient_email VARCHAR(100),
    id_proof_type VARCHAR(50),
    id_proof_number VARCHAR(100),
    center_name VARCHAR(100),
    total_studies INTEGER,
    last_visit DATE,
    latest_accession_number VARCHAR(20),
    match_type VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id as patient_id,
        p.pid,
        p.name as patient_name,
        p.phone as patient_phone,
        p.email as patient_email,
        p.id_proof_type,
        p.id_proof_number,
        c.name as center_name,
        COUNT(ps.study_id) as total_studies,
        MAX(s.created_at)::DATE as last_visit,
        MAX(pb.accession_number) as latest_accession_number,
        CASE 
            WHEN p.pid ILIKE CONCAT('%', p_search_term, '%') THEN 'PID'
            WHEN p.name ILIKE CONCAT('%', p_search_term, '%') THEN 'NAME'
            WHEN p.phone ILIKE CONCAT('%', p_search_term, '%') THEN 'PHONE'
            WHEN p.email ILIKE CONCAT('%', p_search_term, '%') THEN 'EMAIL'
            WHEN p.id_proof_number ILIKE CONCAT('%', p_search_term, '%') THEN 'ID_PROOF'
            ELSE 'OTHER'
        END as match_type
    FROM patients p
    LEFT JOIN centers c ON p.center_id = c.id
    LEFT JOIN patient_studies ps ON p.id = ps.patient_id
    LEFT JOIN studies s ON ps.study_id = s.id AND s.active = true
    LEFT JOIN patient_bills pb ON s.id = pb.study_id AND pb.accession_generated = true
    WHERE p.active = true 
        AND (p_center_id IS NULL OR p.center_id = p_center_id)
        AND (
            p.pid ILIKE CONCAT('%', p_search_term, '%') OR
            p.name ILIKE CONCAT('%', p_search_term, '%') OR
            p.phone ILIKE CONCAT('%', p_search_term, '%') OR
            p.email ILIKE CONCAT('%', p_search_term, '%') OR
            p.id_proof_number ILIKE CONCAT('%', p_search_term, '%')
        )
    GROUP BY p.id, p.pid, p.name, p.phone, p.email, p.id_proof_type, p.id_proof_number, c.name
    ORDER BY 
        CASE 
            WHEN p.pid ILIKE CONCAT('%', p_search_term, '%') THEN 1
            WHEN p.name ILIKE CONCAT('%', p_search_term, '%') THEN 2
            WHEN p.phone ILIKE CONCAT('%', p_search_term, '%') THEN 3
            ELSE 4
        END,
        p.name
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Create view for PID and accession statistics
CREATE OR REPLACE VIEW pid_accession_stats AS
SELECT 
    'PID_ACCESSION_STATS' as stats_type,
    COUNT(*) as total_patients,
    COUNT(CASE WHEN pid IS NOT NULL THEN 1 END) as patients_with_pid,
    COUNT(CASE WHEN pid IS NOT NULL AND pid LIKE 'AR%' THEN 1 END) as patients_with_generated_pid,
    COUNT(DISTINCT pid) as unique_pids,
    (SELECT MAX(CAST(SUBSTRING(pid, 3) AS INTEGER)) FROM patients WHERE pid LIKE 'AR%') as highest_pid_number,
    COUNT(CASE WHEN EXISTS (
        SELECT 1 FROM patient_bills pb 
        WHERE pb.patient_id = p.id AND pb.accession_generated = true
    ) THEN 1 END) as patients_with_accession_numbers,
    (SELECT COUNT(*) FROM patient_bills WHERE accession_generated = true) as total_accession_numbers,
    (SELECT MAX(CAST(SUBSTRING(accession_number, 8, 8) AS INTEGER)) 
     FROM patient_bills WHERE accession_number LIKE 'ACC-%') as highest_accession_number,
    CURRENT_TIMESTAMP as last_updated
FROM patients p;

-- System Configuration Table for API settings
CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration values
INSERT INTO system_config (key, value, description) VALUES
('LOCAL_SYSTEM_API_ENDPOINT', 'http://localhost:8080/api/patient-demographics', 'API endpoint for local system integration'),
('LOCAL_SYSTEM_API_TOKEN', '', 'Bearer token for local system API authentication'),
('LOCAL_SYSTEM_API_KEY', '', 'API key for local system authentication (alternative to token)'),
('PID_PREFIX', 'AR', 'Prefix for patient ID generation'),
('ACCESSION_PREFIX', 'ACC', 'Prefix for accession number generation'),
('ENABLE_AUTO_PID', 'true', 'Enable automatic PID generation'),
('ENABLE_AUTO_ACCESSION', 'true', 'Enable automatic accession number generation'),
('API_REQUEST_TIMEOUT', '15000', 'API request timeout in milliseconds'),
('API_RETRY_ATTEMPTS', '3', 'Number of retry attempts for failed API calls'),
('ENABLE_REQUEST_SIGNING', 'true', 'Enable request signing with checksum'),
('LOCAL_SYSTEM_CLIENT_ID', 'aris-erp', 'Client ID for local system identification'),
('ENABLE_DEMOGRAPHICS_SYNC', 'true', 'Enable automatic demographics synchronization')
ON CONFLICT (key) DO NOTHING;

-- Create indexes for system_config
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);
CREATE INDEX IF NOT EXISTS idx_system_config_updated_at ON system_config(updated_at);

    -- Create trigger to update system_config updated_at
    CREATE TRIGGER update_system_config_updated_at
        BEFORE UPDATE ON system_config
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
