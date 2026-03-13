-- SIMPLE INSURANCE DATABASE SCHEMA - Just tracking if patient has insurance and provider

-- SIMPLE INSURANCE PROVIDERS TABLE
CREATE TABLE simple_insurance_providers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  center_id INTEGER REFERENCES centers(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- Update patients table to include simple insurance fields
ALTER TABLE patients ADD COLUMN IF NOT EXISTS has_insurance BOOLEAN DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_provider_id INTEGER REFERENCES simple_insurance_providers(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS policy_number VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insured_name VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS relationship VARCHAR(50);

-- Sample data for Kerala insurance providers (Simple)
INSERT INTO simple_insurance_providers (
  name, code, phone, email, city, state, center_id
) VALUES
('Star Health and Allied Insurance', 'SH001', '+91-484-2345678', 'kochi@starhealth.com', 'Kochi', 'Kerala', 1),
('New India Assurance', 'NIA001', '+91-471-3456789', 'trivandrum@newindia.com', 'Trivandrum', 'Kerala', 2),
('United India Insurance', 'UII001', '+91-495-4567890', 'calicut@unitedindia.com', 'Calicut', 'Kerala', 3),
('HDFC Ergo General Insurance', 'HDFC001', '+91-487-5678901', 'thrissur@hdfcergo.com', 'Thrissur', 'Kerala', 4),
('ICICI Lombard General Insurance', 'ICI001', '+91-484-7890123', 'kochi@icicilombard.com', 'Kochi', 'Kerala', 1),
('Bajaj Allianz General Insurance', 'BAJ001', '+91-471-8901234', 'trivandrum@bajajallianz.com', 'Trivandrum', 'Kerala', 2),
('Reliance General Insurance', 'REL001', '+91-495-9012345', 'calicut@reliancegeneral.com', 'Calicut', 'Kerala', 3),
('Oriental Insurance', 'ORI001', '+91-487-0123456', 'thrissur@orientalinsurance.com', 'Thrissur', 'Kerala', 4),
('IFFCO Tokio General Insurance', 'IFF001', '+91-484-3456780', 'kochi@iffcotokio.com', 'Kochi', 'Kerala', 1),
('Royal Sundaram General Insurance', 'RSG001', '+91-471-2345670', 'trivandrum@royalsundaram.com', 'Trivandrum', 'Kerala', 2),
('Cholamandalam MS General Insurance', 'CHM001', '+91-495-4567880', 'calicut@cholams.com', 'Calicut', 'Kerala', 3),
('SBI General Insurance', 'SBI001', '+91-487-5678890', 'thrissur@sbigen.com', 'Thrissur', 'Kerala', 4),
('Max Bupa Health Insurance', 'MAX001', '+91-484-2345690', 'kochi@maxbupa.com', 'Kochi', 'Kerala', 1),
('Apollo Munich Health Insurance', 'APL001', '+91-471-3456790', 'trivandrum@apollo.com', 'Trivandrum', 'Kerala', 2),
('HDFC Health Insurance', 'HDFH001', '+91-495-4567891', 'calicut@hdfchealth.com', 'Calicut', 'Kerala', 3),
('Niva Bupa Health Insurance', 'NIV001', '+91-487-5678902', 'thrissur@nivabupa.com', 'Thrissur', 'Kerala', 4);

-- Sample patient insurance updates
UPDATE patients SET 
  has_insurance = true, 
  insurance_provider_id = 1, 
  policy_number = 'SH123456789', 
  insured_name = 'John Doe', 
  relationship = 'Self'
WHERE id = 'PAT123456';

UPDATE patients SET 
  has_insurance = true, 
  insurance_provider_id = 2, 
  policy_number = 'NIA987654321', 
  insured_name = 'Jane Smith', 
  relationship = 'Self'
WHERE id = 'PAT123457';

UPDATE patients SET 
  has_insurance = false
WHERE id = 'PAT123458';

UPDATE patients SET 
  has_insurance = true, 
  insurance_provider_id = 3, 
  policy_number = 'UII456789012', 
  insured_name = 'Robert Johnson', 
  relationship = 'Self'
WHERE id = 'PAT123459';

-- Create indexes for performance
CREATE INDEX idx_simple_insurance_providers_center_id ON simple_insurance_providers(center_id);
CREATE INDEX idx_simple_insurance_providers_active ON simple_insurance_providers(active);
CREATE INDEX idx_patients_has_insurance ON patients(has_insurance);
CREATE INDEX idx_patients_insurance_provider_id ON patients(insurance_provider_id);

-- Create function to get simple insurance statistics
CREATE OR REPLACE FUNCTION get_simple_insurance_statistics(p_center_id INTEGER DEFAULT NULL)
RETURNS TABLE (
  total_patients INTEGER,
  patients_with_insurance INTEGER,
  patients_without_insurance INTEGER,
  insurance_percentage DECIMAL(5,2),
  active_providers INTEGER,
  providers_with_patients INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_patients,
    COUNT(CASE WHEN has_insurance = true THEN 1 END) as patients_with_insurance,
    COUNT(CASE WHEN has_insurance = false THEN 1 END) as patients_without_insurance,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(CASE WHEN has_insurance = true THEN 1 END) * 100.0 / COUNT(*)), 2)
      ELSE 0 
    END as insurance_percentage,
    COUNT(DISTINCT sip.id) as active_providers,
    COUNT(DISTINCT CASE WHEN has_insurance = true THEN insurance_provider_id END) as providers_with_patients
  FROM patients p
  LEFT JOIN simple_insurance_providers sip ON p.insurance_provider_id = sip.id AND sip.active = true
  WHERE p.active = true AND (p_center_id IS NULL OR p.center_id = p_center_id);
END;
$$ LANGUAGE plpgsql;

-- Create view for simple insurance dashboard
CREATE OR REPLACE VIEW simple_insurance_dashboard AS
SELECT 
  'SIMPLE_INSURANCE' as dashboard_type,
  (SELECT COUNT(*) FROM patients WHERE active = true) as total_patients,
  (SELECT COUNT(*) FROM patients WHERE active = true AND has_insurance = true) as patients_with_insurance,
  (SELECT COUNT(*) FROM patients WHERE active = true AND has_insurance = false) as patients_without_insurance,
  (SELECT COUNT(*) FROM simple_insurance_providers WHERE active = true) as total_providers,
  (SELECT COUNT(DISTINCT insurance_provider_id) FROM patients WHERE active = true AND has_insurance = true) as providers_with_patients,
  CURRENT_TIMESTAMP as last_updated;

-- Create function to get provider patient count
CREATE OR REPLACE FUNCTION get_provider_patient_count(p_center_id INTEGER DEFAULT NULL)
RETURNS TABLE (
  provider_name VARCHAR(100),
  provider_code VARCHAR(20),
  patient_count INTEGER,
  center_name VARCHAR(100)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sip.name as provider_name,
    sip.code as provider_code,
    COUNT(p.id) as patient_count,
    c.name as center_name
  FROM simple_insurance_providers sip
  LEFT JOIN patients p ON sip.id = p.insurance_provider_id AND p.active = true
  LEFT JOIN centers c ON sip.center_id = c.id
  WHERE sip.active = true AND (p_center_id IS NULL OR sip.center_id = p_center_id)
  GROUP BY sip.id, sip.name, sip.code, c.name
  HAVING COUNT(p.id) > 0
  ORDER BY patient_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to ensure insurance provider is valid when patient has insurance
CREATE OR REPLACE FUNCTION validate_insurance_provider()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.has_insurance = true AND NEW.insurance_provider_id IS NULL THEN
    RAISE EXCEPTION 'Insurance provider is required when patient has insurance';
  END IF;
  
  IF NEW.has_insurance = false THEN
    NEW.insurance_provider_id := NULL;
    NEW.policy_number := NULL;
    NEW.insured_name := NULL;
    NEW.relationship := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_validate_insurance_provider
  BEFORE INSERT OR UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION validate_insurance_provider();

-- Create function to update patient insurance status
CREATE OR REPLACE FUNCTION update_patient_insurance(
  p_patient_id VARCHAR(36),
  p_has_insurance BOOLEAN,
  p_insurance_provider_id INTEGER DEFAULT NULL,
  p_policy_number VARCHAR(50) DEFAULT NULL,
  p_insured_name VARCHAR(100) DEFAULT NULL,
  p_relationship VARCHAR(50) DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  patient_exists BOOLEAN;
BEGIN
  -- Check if patient exists
  SELECT EXISTS(SELECT 1 FROM patients WHERE id = p_patient_id AND active = true) INTO patient_exists;
  
  IF NOT patient_exists THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;
  
  -- Update patient insurance information
  UPDATE patients SET 
    has_insurance = p_has_insurance,
    insurance_provider_id = CASE WHEN p_has_insurance = true THEN p_insurance_provider_id ELSE NULL END,
    policy_number = CASE WHEN p_has_insurance = true THEN p_policy_number ELSE NULL END,
    insured_name = CASE WHEN p_has_insurance = true THEN p_insured_name ELSE NULL END,
    relationship = CASE WHEN p_has_insurance = true THEN p_relationship ELSE NULL END,
    updated_at = NOW()
  WHERE id = p_patient_id AND active = true;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error updating patient insurance: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Sample usage of the function
-- SELECT update_patient_insurance('PAT123456', true, 1, 'SH123456789', 'John Doe', 'Self');
-- SELECT update_patient_insurance('PAT123458', false);

-- Create function to get patients by insurance status
CREATE OR REPLACE FUNCTION get_patients_by_insurance_status(
  p_has_insurance BOOLEAN,
  p_center_id INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
  patient_id VARCHAR(36),
  patient_name VARCHAR(100),
  patient_phone VARCHAR(20),
  patient_email VARCHAR(100),
  has_insurance BOOLEAN,
  insurance_provider_name VARCHAR(100),
  insurance_provider_code VARCHAR(20),
  policy_number VARCHAR(50),
  insured_name VARCHAR(100),
  relationship VARCHAR(50),
  center_name VARCHAR(100)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as patient_id,
    p.name as patient_name,
    p.phone as patient_phone,
    p.email as patient_email,
    p.has_insurance,
    sip.name as insurance_provider_name,
    sip.code as insurance_provider_code,
    p.policy_number,
    p.insured_name,
    p.relationship,
    c.name as center_name
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
