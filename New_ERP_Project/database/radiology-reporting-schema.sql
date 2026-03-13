-- RADIOLOGY REPORTING DATABASE SCHEMA (Unified Radiologist Master)

-- UNIFIED RADIOLOGIST MASTER TABLE (includes both individual radiologists and teleradiology companies)
CREATE TABLE radiologist_master (
  id SERIAL PRIMARY KEY,
  radiologist_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  specialty VARCHAR(50) NOT NULL,
  qualification VARCHAR(100),
  license_number VARCHAR(50),
  center_id INTEGER REFERENCES centers(id),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(100),
  address VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(6),
  reporting_rates JSONB NOT NULL,
  bank_account_number VARCHAR(50),
  bank_name VARCHAR(100),
  ifsc_code VARCHAR(11),
  gst_number VARCHAR(15),
  pan_number VARCHAR(10),
  contact_person VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- RADIOLOGIST PAYMENTS TABLE
CREATE TABLE radiologist_payments (
  id SERIAL PRIMARY KEY,
  payment_id VARCHAR(20) NOT NULL UNIQUE,
  radiologist_code VARCHAR(20) REFERENCES radiologist_master(radiologist_code),
  payment_date DATE NOT NULL,
  payment_mode VARCHAR(20) NOT NULL,
  amount_paid DECIMAL(15,2) NOT NULL,
  study_ids INTEGER[],
  bank_account_id INTEGER REFERENCES bank_accounts(id),
  transaction_reference VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- Update studies table to include radiologist reporting fields
ALTER TABLE studies ADD COLUMN IF NOT EXISTS radiologist_code VARCHAR(20) REFERENCES radiologist_master(radiologist_code);
ALTER TABLE studies ADD COLUMN IF NOT EXISTS report_date DATE;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS reporting_rate DECIMAL(10,2);
ALTER TABLE studies ADD COLUMN IF NOT EXISTS report_status VARCHAR(20);
ALTER TABLE studies ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE studies ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS payment_id VARCHAR(20);

-- Sample data for unified radiologist master

-- Individual radiologists
INSERT INTO radiologist_master (
  radiologist_code, name, type, specialty, qualification, license_number,
  center_id, contact_phone, contact_email, address, city, state, postal_code,
  reporting_rates, bank_account_number, bank_name, ifsc_code, gst_number,
  pan_number, contact_person, notes
) VALUES
('RAD001', 'Dr. Michael Wilson', 'INDIVIDUAL', 'Neuroradiology', 'MD', 'RAD22222',
 1, '+1-555-456-7890', 'drwilson@email.com', '321 Imaging Way, Suite 100', 'Kochi', 'Kerala', '682024',
  '[{"modality": "MRI", "rate": 50.00, "currency": "INR"}, {"modality": "CT", "rate": 40.00, "currency": "INR"}]',
  '1234567890123456', 'State Bank of India', 'SBIN0000001', '29AAAPM1234C1ZV', 'AAAPM1234C',
  'Dr. Michael Wilson', 'Senior neuroradiologist with 10+ years experience'),

('RAD002', 'Dr. Sarah Brown', 'INDIVIDUAL', 'Musculoskeletal', 'MD', 'RAD33333',
 1, '+1-555-567-8901', 'drbrown@email.com', '654 Radiology Dr, Suite 200', 'Kochi', 'Kerala', '682025',
  '[{"modality": "MRI", "rate": 45.00, "currency": "INR"}, {"modality": "XRAY", "rate": 25.00, "currency": "INR"}]',
  '2345678901234567', 'HDFC Bank', 'HDFC0000001', '29AAAPM5678C1ZV', 'AAAPM5678C',
  'Dr. Sarah Brown', 'Musculoskeletal imaging specialist'),

('RAD003', 'Dr. James Taylor', 'INDIVIDUAL', 'Body Imaging', 'MD', 'RAD44444',
 2, '+1-555-678-9012', 'drtaylor@email.com', '987 Scan Blvd, Suite 300', 'Trivandrum', 'Kerala', '695001',
  '[{"modality": "CT", "rate": 35.00, "currency": "INR"}, {"modality": "ULTRASOUND", "rate": 30.00, "currency": "INR"}]',
  '3456789012345678', 'ICICI Bank', 'ICIC0000001', '29AAAPM9012C1ZV', 'AAAPM9012C',
  'Dr. James Taylor', 'Body imaging and abdominal radiology'),

('RAD004', 'Dr. Emily Davis', 'INDIVIDUAL', 'Neuroradiology', 'MD', 'RAD55555',
 3, '+1-555-789-0123', 'drdavis@email.com', '456 Medical Plaza, Suite 150', 'Calicut', 'Kerala', '673001',
  '[{"modality": "MRI", "rate': 48.00, "currency": "INR"}, {"modality": "CT", "rate": 38.00, "currency": "INR"}]',
  '4567890123456789', 'Federal Bank', 'FDRL0000001', '29AAAPM3456C1ZV', 'AAAPM3456C',
  'Dr. Emily Davis', 'Neuroradiology and head imaging specialist'),

('RAD005', 'Dr. Robert Chen', 'INDIVIDUAL', 'Cardiac Imaging', 'MD', 'RAD66666',
 4, '+1-555-890-1234', 'drchen@email.com', '789 Imaging Center, Suite 200', 'Thrissur', 'Kerala', '680001',
  '[{"modality": "MRI", "rate": 55.00, "currency": "INR"}, {"modality": "CT", "rate": 45.00, "currency": "INR"}]',
  '5678901234567890', 'Axis Bank', 'UTIB0000001', '29AAAPM7890C1ZV', 'AAAPM7890C',
  'Dr. Robert Chen', 'Cardiac imaging and interventional radiology');

-- Teleradiology companies
INSERT INTO radiologist_master (
  radiologist_code, name, type, specialty, qualification, license_number,
  center_id, contact_phone, contact_email, address, city, state, postal_code,
  reporting_rates, bank_account_number, bank_name, ifsc_code, gst_number,
  pan_number, contact_person, notes
) VALUES
('TEL001', 'Global Teleradiology Services', 'TELERADIOLOGY_COMPANY', 'Multi-Specialty', 'N/A', 'N/A',
 1, '+1-555-111-2222', 'info@globalteleradiology.com', '100 Tech Park, Building A', 'Kochi', 'Kerala', '682024',
  '[{"modality": "MRI", "rate": 35.00, "currency": "INR"}, {"modality": "CT", "rate": 25.00, "currency": "INR"}, {"modality": "XRAY", "rate": 15.00, "currency": "INR"}]',
  '9876543210987654', 'State Bank of India', 'SBIN0000001', '29AAAGT1234C1ZV', 'AAAGT1234C',
  'John Smith', '24/7 teleradiology service with global coverage'),

('TEL002', 'Radiology Partners Ltd', 'TELERADIOLOGY_COMPANY', 'Diagnostic Radiology', 'N/A', 'N/A',
 2, '+1-555-222-3333', 'contact@radiologypartners.com', '200 Business Park, Block B', 'Trivandrum', 'Kerala', '695001',
  '[{"modality": "MRI", "rate": 32.00, "currency": "INR"}, {"modality": "CT", "rate": 22.00, "currency": "INR"}, {"modality": "ULTRASOUND", "rate": 20.00, "currency": "INR"}]',
  '8765432109876543', 'HDFC Bank', 'HDFC0000001', '29AAARP2345C1ZV', 'AAARP2345C',
  'Mary Johnson', 'Specialized teleradiology for diagnostic centers'),

('TEL003', 'MediRead Teleradiology', 'TELERADIOLOGY_COMPANY', 'Multi-Specialty', 'N/A', 'N/A',
 3, '+1-555-333-4444', 'support@mediread.com', '300 Medical Hub, Suite 400', 'Calicut', 'Kerala', '673001',
  '[{"modality": "MRI", "rate": 30.00, "currency": "INR"}, {"modality": "CT", "rate": 20.00, "currency": "INR"}, {"modality": "XRAY", "rate": 12.00, "currency": "INR"}]',
  '7654321098765432', 'ICICI Bank', 'ICIC0000001', '29AAARM3456C1ZV', 'AAARM3456C',
  'David Wilson', 'Fast turnaround teleradiology services'),

('TEL004', 'NightHawk Radiology', 'TELERADIOLOGY_COMPANY', 'Emergency Radiology', 'N/A', 'N/A',
 4, '+1-555-444-5555', 'emergency@nighthawk.com', '400 Tech Center, Suite 500', 'Thrissur', 'Kerala', '680001',
  '[{"modality": "MRI", "rate": 40.00, "currency": "INR"}, {"modality": "CT", "rate": 30.00, "currency": "INR"}, {"modality": "ULTRASOUND", "rate": 25.00, "currency": "INR"}]',
  '6543210987654321', 'Axis Bank', 'UTIB0000001', '29AAARN4567C1ZV', 'AAARN4567C',
  'Sarah Anderson', '24/7 emergency radiology reporting service');

-- Sample study reporting records
UPDATE studies SET 
  radiologist_code = 'RAD001', report_date = '2024-03-15', reporting_rate = 50.00, 
  report_status = 'COMPLETED', payment_status = 'PENDING'
WHERE id = 'STY123456' AND active = true;

UPDATE studies SET 
  radiologist_code = 'RAD002', report_date = '2024-03-15', reporting_rate = 45.00, 
  report_status = 'COMPLETED', payment_status = 'PENDING'
WHERE id = 'STY123457' AND active = true;

UPDATE studies SET 
  radiologist_code = 'TEL001', report_date = '2024-03-15', reporting_rate = 35.00, 
  report_status = 'COMPLETED', payment_status = 'PAID', payment_date = '2024-03-20'
WHERE id = 'STY123458' AND active = true;

UPDATE studies SET 
  radiologist_code = 'RAD003', report_date = '2024-03-15', reporting_rate = 35.00, 
  report_status = 'COMPLETED', payment_status = 'PENDING'
WHERE id = 'STY123459' AND active = true;

-- Sample radiologist payments
INSERT INTO radiologist_payments (
  payment_id, radiologist_code, payment_date, payment_mode, amount_paid,
  study_ids, bank_account_id, transaction_reference, notes
) VALUES
('RADPAY123ABC', 'TEL001', '2024-03-20', 'BANK_TRANSFER', 105.00,
  ARRAY[3], 1, 'NEFT202403200001', 'Payment for 3 studies in March'),
('RADPAY456DEF', 'RAD001', '2024-03-25', 'BANK_TRANSFER', 95.00,
  ARRAY[1, 2], 1, 'NEFT202403250002', 'Payment for 2 MRI studies'),
('RADPAY789GHI', 'RAD002', '2024-03-28', 'UPI', 45.00,
  ARRAY[2], 2, 'UPI202403280001', 'Single study payment via UPI');

-- Create indexes for performance
CREATE INDEX idx_radiologist_master_center_id ON radiologist_master(center_id);
CREATE INDEX idx_radiologist_master_type ON radiologist_master(type);
CREATE INDEX idx_radiologist_master_active ON radiologist_master(active);
CREATE INDEX idx_radiologist_master_radiologist_code ON radiologist_master(radiologist_code);
CREATE INDEX idx_radiologist_payments_radiologist_code ON radiologist_payments(radiologist_code);
CREATE INDEX idx_radiologist_payments_payment_date ON radiologist_payments(payment_date);
CREATE INDEX idx_radiologist_payments_active ON radiologist_payments(active);
CREATE INDEX idx_studies_radiologist_code ON studies(radiologist_code);
CREATE INDEX idx_studies_report_date ON studies(report_date);
CREATE INDEX idx_studies_report_status ON studies(report_status);
CREATE INDEX idx_studies_payment_status ON studies(payment_status);

-- Create function to get radiologist rates for dropdown
CREATE OR REPLACE FUNCTION get_radiologist_rates(
  p_center_id INTEGER DEFAULT NULL,
  p_modality VARCHAR(20) DEFAULT NULL,
  p_study_code VARCHAR(20) DEFAULT NULL
) RETURNS TABLE (
  radiologist_code VARCHAR(20),
  name VARCHAR(100),
  type VARCHAR(20),
  specialty VARCHAR(50),
  modality VARCHAR(20),
  study_code VARCHAR(20),
  reporting_rate DECIMAL(10,2),
  currency VARCHAR(3)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rm.radiologist_code,
    rm.name,
    rm.type,
    rm.specialty,
    rate_data->>'modality' as modality,
    rate_data->>'study_code' as study_code,
    rate_data->>'rate' as reporting_rate,
    COALESCE(rate_data->>'currency', 'INR') as currency
  FROM radiologist_master rm, 
       jsonb_array_elements(rm.reporting_rates) as rate_data
  WHERE rm.active = true 
    AND (p_center_id IS NULL OR rm.center_id = p_center_id)
    AND (p_modality IS NULL OR rate_data->>'modality' = p_modality)
    AND (p_study_code IS NULL OR (rate_data->>'study_code' IS NOT NULL AND rate_data->>'study_code' = p_study_code))
  ORDER BY rm.name;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate radiologist earnings
CREATE OR REPLACE FUNCTION calculate_radiologist_earnings(
  p_radiologist_code VARCHAR(20),
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS TABLE (
  radiologist_code VARCHAR(20),
  radiologist_name VARCHAR(100),
  radiologist_type VARCHAR(20),
  total_studies INTEGER,
  total_earnings DECIMAL(15,2),
  paid_amount DECIMAL(15,2),
  pending_amount DECIMAL(15,2),
  average_rate DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rm.radiologist_code,
    rm.name as radiologist_name,
    rm.type as radiologist_type,
    COUNT(s.id) as total_studies,
    COALESCE(SUM(s.reporting_rate), 0) as total_earnings,
    COALESCE(SUM(CASE WHEN s.payment_status = 'PAID' THEN s.reporting_rate ELSE 0 END), 0) as paid_amount,
    COALESCE(SUM(CASE WHEN s.payment_status = 'PENDING' THEN s.reporting_rate ELSE 0 END), 0) as pending_amount,
    COALESCE(AVG(s.reporting_rate), 0) as average_rate
  FROM radiologist_master rm
  LEFT JOIN studies s ON rm.radiologist_code = s.radiologist_code 
    AND s.active = true AND s.report_status = 'COMPLETED'
    AND (p_start_date IS NULL OR s.report_date >= p_start_date)
    AND (p_end_date IS NULL OR s.report_date <= p_end_date)
  WHERE rm.radiologist_code = p_radiologist_code AND rm.active = true
  GROUP BY rm.radiologist_code, rm.name, rm.type;
END;
$$ LANGUAGE plpgsql;

-- Create function to get radiologist dashboard
CREATE OR REPLACE FUNCTION get_radiologist_dashboard(
  p_center_id INTEGER DEFAULT NULL,
  p_period VARCHAR(10) DEFAULT '30'
) RETURNS TABLE (
  total_radiologists INTEGER,
  individual_radiologists INTEGER,
  teleradiology_companies INTEGER,
  total_studies_reported INTEGER,
  completed_reports INTEGER,
  partial_reports INTEGER,
  review_reports INTEGER,
  total_reporting_amount DECIMAL(15,2),
  paid_amount DECIMAL(15,2),
  pending_amount DECIMAL(15,2)
) AS $$
DECLARE
  date_filter TEXT := '';
BEGIN
  -- Set date filter based on period
  IF p_period = '7' THEN
    date_filter := 'AND s.report_date >= CURRENT_DATE - INTERVAL ''7 days''';
  ELSIF p_period = '30' THEN
    date_filter := 'AND s.report_date >= CURRENT_DATE - INTERVAL ''30 days''';
  ELSIF p_period = '90' THEN
    date_filter := 'AND s.report_date >= CURRENT_DATE - INTERVAL ''90 days''';
  ELSIF p_period = '365' THEN
    date_filter := 'AND s.report_date >= CURRENT_DATE - INTERVAL ''365 days''';
  END IF;

  RETURN QUERY
  SELECT 
    COUNT(*) as total_radiologists,
    COUNT(CASE WHEN rm.type = 'INDIVIDUAL' THEN 1 END) as individual_radiologists,
    COUNT(CASE WHEN rm.type = 'TELERADIOLOGY_COMPANY' THEN 1 END) as teleradiology_companies,
    COUNT(s.id) as total_studies_reported,
    COUNT(CASE WHEN s.report_status = 'COMPLETED' THEN 1 END) as completed_reports,
    COUNT(CASE WHEN s.report_status = 'PARTIAL' THEN 1 END) as partial_reports,
    COUNT(CASE WHEN s.report_status = 'REVIEW' THEN 1 END) as review_reports,
    COALESCE(SUM(s.reporting_rate), 0) as total_reporting_amount,
    COALESCE(SUM(CASE WHEN s.payment_status = 'PAID' THEN s.reporting_rate ELSE 0 END), 0) as paid_amount,
    COALESCE(SUM(CASE WHEN s.payment_status = 'PENDING' THEN s.reporting_rate ELSE 0 END), 0) as pending_amount
  FROM radiologist_master rm
  LEFT JOIN studies s ON rm.radiologist_code = s.radiologist_code AND s.active = true
  WHERE rm.active = true 
    AND (p_center_id IS NULL OR rm.center_id = p_center_id)
    AND date_filter;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate reporting rates
CREATE OR REPLACE FUNCTION validate_reporting_rates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reporting_rates IS NULL OR jsonb_array_length(NEW.reporting_rates) = 0 THEN
    RAISE EXCEPTION 'At least one reporting rate is required';
  END IF;
  
  -- Validate each rate object
  FOR i IN 1..jsonb_array_length(NEW.reporting_rates) LOOP
    IF NOT (NEW.reporting_rates->>(i-1)->>'modality' IS NOT NULL AND 
           NEW.reporting_rates->>(i-1)->>'rate' IS NOT NULL) THEN
      RAISE EXCEPTION 'Each reporting rate must have modality and rate';
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_validate_reporting_rates
  BEFORE INSERT OR UPDATE ON radiologist_master
  FOR EACH ROW
  EXECUTE FUNCTION validate_reporting_rates();

-- Create view for radiologist dashboard
CREATE OR REPLACE VIEW radiologist_dashboard_view AS
SELECT 
  'RADIOLOGY_DASHBOARD' as dashboard_type,
  (SELECT COUNT(*) FROM radiologist_master WHERE active = true) as total_radiologists,
  (SELECT COUNT(*) FROM radiologist_master WHERE active = true AND type = 'INDIVIDUAL') as individual_radiologists,
  (SELECT COUNT(*) FROM radiologist_master WHERE active = true AND type = 'TELERADIOLOGY_COMPANY') as teleradiology_companies,
  (SELECT COUNT(*) FROM studies WHERE active = true AND radiologist_code IS NOT NULL) as total_studies_reported,
  (SELECT COUNT(*) FROM studies WHERE active = true AND radiologist_code IS NOT NULL AND report_status = 'COMPLETED') as completed_reports,
  (SELECT COUNT(*) FROM studies WHERE active = true AND radiologist_code IS NOT NULL AND report_status = 'PARTIAL') as partial_reports,
  (SELECT COUNT(*) FROM studies WHERE active = true AND radiologist_code IS NOT NULL AND report_status = 'REVIEW') as review_reports,
  (SELECT COALESCE(SUM(reporting_rate), 0) FROM studies WHERE active = true AND radiologist_code IS NOT NULL) as total_reporting_amount,
  (SELECT COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN reporting_rate ELSE 0 END), 0) FROM studies WHERE active = true AND radiologist_code IS NOT NULL) as paid_amount,
  (SELECT COALESCE(SUM(CASE WHEN payment_status = 'PENDING' THEN reporting_rate ELSE 0 END), 0) FROM studies WHERE active = true AND radiologist_code IS NOT NULL) as pending_amount,
  CURRENT_TIMESTAMP as last_updated;

-- Create function to process bulk radiologist payments
CREATE OR REPLACE FUNCTION process_bulk_radiologist_payments(
  p_radiologist_code VARCHAR(20),
  p_payment_date DATE,
  p_payment_mode VARCHAR(20),
  p_bank_account_id INTEGER,
  p_transaction_reference VARCHAR(100) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS VARCHAR(20) AS $$
DECLARE
  payment_id VARCHAR(20);
  total_amount DECIMAL(15,2);
  study_ids INTEGER[];
BEGIN
  -- Calculate total amount for pending studies
  SELECT COALESCE(SUM(reporting_rate), 0), ARRAY_AGG(id)
  INTO total_amount, study_ids
  FROM studies 
  WHERE radiologist_code = p_radiologist_code 
    AND payment_status = 'PENDING' 
    AND report_status = 'COMPLETED' 
    AND active = true;
  
  IF total_amount = 0 OR study_ids IS NULL THEN
    RAISE NOTICE 'No pending studies found for payment';
    RETURN NULL;
  END IF;
  
  -- Generate payment ID
  payment_id := 'RADPAY' || to_char(now(), 'YYYYMMDDHH24MISS');
  
  -- Create payment record
  INSERT INTO radiologist_payments (
    payment_id, radiologist_code, payment_date, payment_mode, amount_paid,
    study_ids, bank_account_id, transaction_reference, notes, created_at, updated_at, active
  ) VALUES (
    payment_id, p_radiologist_code, p_payment_date, p_payment_mode, total_amount,
    study_ids, p_bank_account_id, p_transaction_reference, p_notes, now(), now(), true
  );
  
  -- Update study payment status
  UPDATE studies 
  SET payment_status = 'PAID', 
      payment_date = p_payment_date, 
      payment_id = payment_id, 
      updated_at = now()
  WHERE id = ANY(study_ids) AND active = true;
  
  RETURN payment_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error processing bulk payment: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
