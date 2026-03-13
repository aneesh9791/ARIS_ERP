-- INSURANCE MANAGEMENT DATABASE SCHEMA (OPTIMIZED FOR LOW VOLUME)

-- INSURANCE PROVIDERS TABLE
CREATE TABLE insurance_providers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  contact_person VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100) NOT NULL,
  address VARCHAR(500) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(6) NOT NULL,
  gst_number VARCHAR(15) NOT NULL,
  pan_number VARCHAR(10) NOT NULL,
  license_number VARCHAR(50),
  settlement_days INTEGER DEFAULT 30,
  coverage_types TEXT[],
  center_id INTEGER REFERENCES centers(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- INSURANCE CLAIMS TABLE
CREATE TABLE insurance_claims (
  id SERIAL PRIMARY KEY,
  claim_id VARCHAR(20) NOT NULL UNIQUE,
  patient_id VARCHAR(36) REFERENCES patients(id),
  insurance_provider_id INTEGER REFERENCES insurance_providers(id),
  center_id INTEGER REFERENCES centers(id),
  bill_id INTEGER REFERENCES patient_bills(id),
  policy_number VARCHAR(50) NOT NULL,
  claim_number VARCHAR(50) NOT NULL,
  claim_amount DECIMAL(15,2) NOT NULL,
  approved_amount DECIMAL(15,2) DEFAULT 0,
  claim_date DATE NOT NULL,
  diagnosis_code VARCHAR(10),
  procedure_codes TEXT[],
  status VARCHAR(20) DEFAULT 'PENDING',
  rejection_reason TEXT,
  settlement_id INTEGER REFERENCES insurance_settlements(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- INSURANCE SETTLEMENTS TABLE
CREATE TABLE insurance_settlements (
  id SERIAL PRIMARY KEY,
  settlement_id VARCHAR(20) NOT NULL UNIQUE,
  insurance_provider_id INTEGER REFERENCES insurance_providers(id),
  center_id INTEGER REFERENCES centers(id),
  settlement_number VARCHAR(50) NOT NULL,
  settlement_date DATE NOT NULL,
  claim_ids INTEGER[],
  total_claim_amount DECIMAL(15,2) NOT NULL,
  total_settlement_amount DECIMAL(15,2) NOT NULL,
  payment_mode VARCHAR(20) NOT NULL,
  bank_account_id INTEGER REFERENCES bank_accounts(id),
  status VARCHAR(20) DEFAULT 'PENDING',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- Sample data for Kerala insurance providers (Low Volume Focus)

-- Insurance providers for Kerala
INSERT INTO insurance_providers (
  name, code, contact_person, phone, email, address, city, state, postal_code,
  gst_number, pan_number, license_number, settlement_days, coverage_types, center_id, notes
) VALUES
('Star Health and Allied Insurance', 'SH001', 'Ravi Kumar', '+91-484-2345678', 'kochi@starhealth.com',
 'Star Health Building, Marine Drive, Kochi', 'Kochi', 'Kerala', '682031',
 '29AAASHS1234C1ZV', 'AAASHS1234C', 'IRDA12345', 45,
  ARRAY['MRI', 'CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY'], 1,
 'Primary insurance provider for Kerala region'),
('New India Assurance', 'NIA001', 'Anita Nair', '+91-471-3456789', 'trivandrum@newindia.com',
 'New India Building, Statue, Trivandrum', 'Trivandrum', 'Kerala', '695001',
 '29AAANI1234C1ZV', 'AAANI1234C', 'IRDA23456', 60,
  ARRAY['MRI', 'CT', 'XRAY', 'ULTRASOUND'], 2,
 'Government insurance provider'),
('United India Insurance', 'UII001', 'Mohan Das', '+91-495-4567890', 'calicut@unitedindia.com',
 'United India House, Mavoor Road, Calicut', 'Calicut', 'Kerala', '673001',
 '29AAUUI1234C1ZV', 'AAUUI1234C', 'IRDA34567', 30,
  ARRAY['CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY'], 3,
 'Public sector insurance provider'),
('HDFC Ergo General Insurance', 'HDFC001', 'Priya Rajesh', '+91-487-5678901', 'thrissur@hdfcergo.com',
 'HDFC Ergo Office, Palace Road, Thrissur', 'Thrissur', 'Kerala', '680001',
 '29AAHDF1234C1ZV', 'AAHDF1234C', 'IRDA45678', 30,
  ARRAY['MRI', 'CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY'], 4,
 'Private sector insurance provider'),
('ICICI Lombard General Insurance', 'ICI001', 'Sunil Menon', '+91-484-7890123', 'kochi@icicilombard.com',
 'ICICI Lombard Office, Edappally, Kochi', 'Kochi', 'Kerala', '682024',
 '29AAICI1234C1ZV', 'AAICI1234C', 'IRDA56789', 45,
  ARRAY['MRI', 'CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY', 'PET'], 1,
 'Private sector insurance provider'),
('Bajaj Allianz General Insurance', 'BAJ001', 'Anand Pillai', '+91-471-8901234', 'trivandrum@bajajallianz.com',
 'Bajaj Allianz Office, Kowdiar, Trivandrum', 'Trivandrum', 'Kerala', '695024',
 '29AABAJ1234C1ZV', 'AABAJ1234C', 'IRDA67890', 30,
  ARRAY['CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY'], 2,
'Private sector insurance provider'),
('Reliance General Insurance', 'REL001', 'Kumar Nair', '+91-495-9012345', 'calicut@reliancegeneral.com',
 'Reliance General Office, Calicut', 'Calicut', 'Kerala', '673001',
 '29AAREL1234C1ZV', 'AAREL1234C', 'IRDA78901', 60,
  ARRAY['MRI', 'CT', 'XRAY', 'ULTRASOUND'], 3,
  'Private sector insurance provider'),
('Oriental Insurance', 'ORI001', 'Divakaran', '+91-487-0123456', 'thrissur@orientalinsurance.com',
 'Oriental Insurance Office, Thrissur', 'Thrissur', 'Kerala', '680001',
 '29AAORI1234C1ZV', 'AAORI1234C', 'IRDA89012', 30,
  ARRAY['CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY'], 4,
  'Public sector insurance provider');

-- Sample insurance claims (Low Volume)
INSERT INTO insurance_claims (
  claim_id, patient_id, insurance_provider_id, center_id, bill_id,
  policy_number, claim_number, claim_amount, approved_amount, claim_date,
  diagnosis_code, procedure_codes, status, notes
) VALUES
('CLM123ABC', 'PAT123456', 1, 1, 1,
  'SH123456789', 'SHCLM2024001', 8000.00, 7200.00, '2024-03-10',
  'M54.5', '70551', 'APPROVED', 'MRI Brain scan approved with minor deduction'),
('CLM124DEF', 'PAT123457', 2, 2, 2,
  'NIA987654321', 'NIA2024002', 4500.00, 4500.00, '2024-03-12',
  'M25.5', '71250', 'SETTLED', 'CT Chest scan fully approved'),
('CLM125GHI', 'PAT123458', 3, 3, 3,
  'UII456789012', 'UII2024003', 2500.00, 2000.00, '2024-03-13',
  'M79.3', '73560', 'APPROVED', 'X-Ray Knee approved with partial deduction'),
('CLM126JKL', 'PAT123459', 4, 4, 4,
  'HDFC789012345', 'HDFC2024004', 6500.00, 0.00, '2024-03-14',
  'M54.6', '70551', 'REJECTED', 'MRI Spine rejected - pre-existing condition'),
('CLM127MNO', 'PAT123460', 5, 5, 5,
  'ICI234567890', 'ICI2024005', 3500.00, 3500.00, '2024-03-15',
  'M54.8', '76700', 'SETTLED', 'Ultrasound Abdomen fully approved'),
('CLM128PQR', 'PAT123461', 6, 1, 6,
  'BAJ345678901', 'BAJ2024006', 12000.00, 10800.00, '2024-03-16',
  'M54.2', '70551', 'APPROVED', 'MRI Brain with contrast approved with deduction');

-- Sample insurance settlements
INSERT INTO insurance_settlements (
  settlement_id, insurance_provider_id, center_id, settlement_number,
  settlement_date, claim_ids, total_claim_amount, total_settlement_amount,
  payment_mode, bank_account_id, status, notes
) VALUES
('SET123XYZ', 2, 2, 'NIA2024001', '2024-03-20',
  ARRAY[2], 4500.00, 4500.00, 'BANK_TRANSFER', 1, 'COMPLETED',
  'Full settlement for claim NIA2024002'),
('SET456ABC', 5, 5, 'ICI2024001', '2024-03-25',
  ARRAY[7], 3500.00, 3500.00, 'BANK_TRANSFER', 2, 'COMPLETED',
  'Full settlement for claim ICI2024005'),
('SET789DEF', 1, 1, 'SH2024001', '2024-03-28',
  ARRAY[1, 6], 20000.00, 18000.00, 'BANK_TRANSFER', 1, 'COMPLETED',
  'Partial settlement for claims SHCLM2024001 and SHCLM2024006');

-- Create indexes for performance
CREATE INDEX idx_insurance_providers_center_id ON insurance_providers(center_id);
CREATE INDEX idx_insurance_providers_active ON insurance_providers(active);
CREATE INDEX idx_insurance_claims_patient_id ON insurance_claims(patient_id);
CREATE INDEX idx_insurance_claims_provider_id ON insurance_claims(insurance_provider_id);
CREATE INDEX idx_insurance_claims_center_id ON insurance_claims(center_id);
CREATE INDEX idx_insurance_claims_status ON insurance_claims(status);
CREATE INDEX idx_insurance_claims_claim_date ON insurance_claims(claim_date);
CREATE INDEX idx_insurance_settlements_provider_id ON insurance_settlements(insurance_provider_id);
CREATE INDEX idx_insurance_settlements_center_id ON insurance_settlements(center_id);
CREATE INDEX idx_insurance_settlements_settlement_date ON insurance_settlements(settlement_date);
CREATE INDEX idx_insurance_settlements_status ON insurance_settlements(status);

-- Create function to get insurance statistics (Low Volume Optimized)
CREATE OR REPLACE FUNCTION get_insurance_statistics_low_volume(p_center_id INTEGER DEFAULT NULL)
RETURNS TABLE (
  total_providers INTEGER,
  total_claims INTEGER,
  pending_claims INTEGER,
  approved_claims INTEGER,
  rejected_claims INTEGER,
  settled_claims INTEGER,
  total_claim_amount DECIMAL(15,2),
  total_approved_amount DECIMAL(15,2),
  total_settled_amount DECIMAL(15,2),
  avg_claim_amount DECIMAL(15,2),
  approval_rate DECIMAL(5,2),
  settlement_rate DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT ip.id) as total_providers,
    COUNT(ic.id) as total_claims,
    COUNT(CASE WHEN ic.status = 'PENDING' THEN 1 END) as pending_claims,
    COUNT(CASE WHEN ic.status = 'APPROVED' THEN 1 END) as approved_claims,
    COUNT(CASE WHEN ic.status = 'REJECTED' THEN 1 END) as rejected_claims,
    COUNT(CASE WHEN ic.status = 'SETTLED' THEN 1 END) as settled_claims,
    COALESCE(SUM(ic.claim_amount), 0) as total_claim_amount,
    COALESCE(SUM(ic.approved_amount), 0) as total_approved_amount,
    COALESCE(SUM(CASE WHEN ic.status = 'SETTLED' THEN ic.approved_amount ELSE 0 END), 0) as total_settled_amount,
    COALESCE(AVG(ic.claim_amount), 0) as avg_claim_amount,
    CASE 
      WHEN COUNT(ic.id) > 0 THEN 
        ROUND((COUNT(CASE WHEN ic.status = 'APPROVED' THEN 1 END) * 100.0 / COUNT(ic.id)), 2)
      ELSE 0 
    END as approval_rate,
    CASE 
      WHEN COUNT(ic.id) > 0 THEN 
        ROUND((COUNT(CASE WHEN ic.status = 'SETTLED' THEN 1 END) * 100.0 / COUNT(ic.id)), 2)
      ELSE 0 
    END as settlement_rate
  FROM insurance_providers ip
  LEFT JOIN insurance_claims ic ON ip.id = ic.insurance_provider_id AND ic.active = true
  WHERE ip.active = true AND (p_center_id IS NULL OR ip.center_id = p_center_id)
  GROUP BY ip.active;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update claim status when settlement is completed
CREATE OR REPLACE FUNCTION update_claim_status_on_settlement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE insurance_claims 
  SET status = 'SETTLED', settlement_id = NEW.id, updated_at = NOW() 
  WHERE id = ANY(NEW.claim_ids) AND active = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_update_claim_status_on_settlement
  AFTER UPDATE ON insurance_settlements
  FOR EACH ROW
  WHEN (OLD.status != 'COMPLETED' AND NEW.status = 'COMPLETED')
  EXECUTE FUNCTION update_claim_status_on_settlement();

-- Create view for insurance dashboard (Low Volume Optimized)
CREATE OR REPLACE VIEW insurance_dashboard_low_volume AS
SELECT 
  'LOW_VOLUME_INSURANCE' as dashboard_type,
  (SELECT COUNT(*) FROM insurance_providers WHERE active = true) as total_providers,
  (SELECT COUNT(*) FROM insurance_claims WHERE active = true) as total_claims,
  (SELECT COUNT(*) FROM insurance_claims WHERE active = true AND status = 'PENDING') as pending_claims,
  (SELECT COUNT(*) FROM insurance_claims WHERE active = true AND status = 'APPROVED') as approved_claims,
  (SELECT COUNT(*) FROM insurance_claims WHERE active = true AND status = 'REJECTED') as rejected_claims,
  (SELECT COUNT(*) FROM insurance_claims WHERE active = true AND status = 'SETTLED') as settled_claims,
  (SELECT COALESCE(SUM(claim_amount), 0) FROM insurance_claims WHERE active = true) as total_claim_amount,
  (SELECT COALESCE(SUM(approved_amount), 0) FROM insurance_claims WHERE active = true) as total_approved_amount,
  (SELECT COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN approved_amount ELSE 0 END), 0) FROM insurance_claims WHERE active = true) as total_settled_amount,
  (SELECT AVG(claim_amount) FROM insurance_claims WHERE active = true) as avg_claim_amount,
  CURRENT_TIMESTAMP as last_updated;

-- Create function to get provider performance metrics
CREATE OR REPLACE FUNCTION get_provider_performance(p_center_id INTEGER DEFAULT NULL)
RETURNS TABLE (
  provider_name VARCHAR(100),
  provider_code VARCHAR(20),
  claim_count INTEGER,
  approved_count INTEGER,
  rejected_count INTEGER,
  settled_count INTEGER,
  total_claim_amount DECIMAL(15,2),
  total_approved_amount DECIMAL(15,2),
  total_settled_amount DECIMAL(15,2),
  approval_rate DECIMAL(5,2),
  settlement_rate DECIMAL(5,2),
  avg_processing_days INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ip.name as provider_name,
    ip.code as provider_code,
    COUNT(ic.id) as claim_count,
    COUNT(CASE WHEN ic.status = 'APPROVED' THEN 1 END) as approved_count,
    COUNT(CASE WHEN ic.status = 'REJECTED' THEN 1 END) as rejected_count,
    COUNT(CASE WHEN ic.status = 'SETTLED' THEN 1 END) as settled_count,
    COALESCE(SUM(ic.claim_amount), 0) as total_claim_amount,
    COALESCE(SUM(ic.approved_amount), 0) as total_approved_amount,
    COALESCE(SUM(CASE WHEN ic.status = 'SETTLED' THEN ic.approved_amount ELSE 0 END), 0) as total_settled_amount,
    CASE 
      WHEN COUNT(ic.id) > 0 THEN 
        ROUND((COUNT(CASE WHEN ic.status = 'APPROVED' THEN 1 END) * 100.0 / COUNT(ic.id)), 2)
      ELSE 0 
    END as approval_rate,
    CASE 
      WHEN COUNT(ic.id) > 0 THEN 
        ROUND((COUNT(CASE WHEN ic.status = 'SETTLED' THEN 1 END) * 100.0 / COUNT(ic.id)), 2)
      ELSE 0 
    END as settlement_rate,
    COALESCE(AVG(EXTRACT(DAY FROM ic.updated_at - ic.created_at)), 0) as avg_processing_days
  FROM insurance_providers ip
  LEFT JOIN insurance_claims ic ON ip.id = ic.insurance_provider_id AND ic.active = true
  WHERE ip.active = true AND (p_center_id IS NULL OR ip.center_id = p_center_id)
  GROUP BY ip.id, ip.name, ip.code
  HAVING COUNT(ic.id) > 0
  ORDER BY total_claim_amount DESC;
END;
$$ LANGUAGE plpgsql;

-- Add foreign key constraint to patients table for insurance provider
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_provider_id INTEGER REFERENCES insurance_providers(id);

-- Add foreign key constraint to patient_bills table for insurance claims
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS insurance_claim_id INTEGER REFERENCES insurance_claims(id);

-- Create indexes for the new foreign key columns
CREATE INDEX idx_patients_insurance_provider_id ON patients(insurance_provider_id);
CREATE INDEX idx_patient_bills_insurance_claim_id ON patient_bills(insurance_claim_id);
