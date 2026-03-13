-- STUDY MASTER TABLE
CREATE TABLE study_master (
  id SERIAL PRIMARY KEY,
  study_code VARCHAR(20) NOT NULL UNIQUE,
  study_name VARCHAR(100) NOT NULL,
  modality VARCHAR(20) NOT NULL,
  description TEXT,
  center_id INTEGER REFERENCES centers(id),
  payment_method_id INTEGER REFERENCES payment_methods(id),
  base_rate DECIMAL(10,2) NOT NULL,
  insurance_rate DECIMAL(10,2) NOT NULL,
  self_pay_rate DECIMAL(10,2) NOT NULL,
  contrast_rate DECIMAL(10,2) DEFAULT 0,
  emergency_rate DECIMAL(10,2) DEFAULT 0,
  weekend_rate DECIMAL(10,2) DEFAULT 0,
  tax_rate DECIMAL(5,4) DEFAULT 0,
  billing_code VARCHAR(20) NOT NULL,
  cpt_code VARCHAR(10) NOT NULL,
  revenue_category VARCHAR(50) NOT NULL,
  cost_category VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- PAYMENT METHODS TABLE
CREATE TABLE payment_methods (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- ASSET MASTER TABLE
CREATE TABLE asset_master (
  id SERIAL PRIMARY KEY,
  asset_code VARCHAR(20) NOT NULL UNIQUE,
  asset_name VARCHAR(100) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,
  description TEXT,
  center_id INTEGER REFERENCES centers(id),
  manufacturer VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(50),
  purchase_date DATE NOT NULL,
  purchase_cost DECIMAL(12,2) NOT NULL,
  current_value DECIMAL(12,2),
  depreciation_rate DECIMAL(5,4) DEFAULT 0,
  warranty_expiry DATE,
  location VARCHAR(100),
  assigned_to VARCHAR(100),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- ASSET TYPES TABLE
CREATE TABLE asset_types (
  id SERIAL PRIMARY KEY,
  type_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  depreciation_method VARCHAR(20) DEFAULT 'STRAIGHT_LINE',
  useful_life_years INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- ASSET MAINTENANCE TABLE
CREATE TABLE asset_maintenance (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER REFERENCES asset_master(id),
  maintenance_type VARCHAR(20) NOT NULL,
  description TEXT,
  scheduled_date DATE,
  completed_date DATE,
  cost DECIMAL(10,2),
  vendor VARCHAR(100),
  status VARCHAR(20) DEFAULT 'SCHEDULED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- REFERRING PHYSICIAN MASTER TABLE
CREATE TABLE referring_physician_master (
  id SERIAL PRIMARY KEY,
  physician_code VARCHAR(20) NOT NULL UNIQUE,
  physician_name VARCHAR(100) NOT NULL,
  specialty VARCHAR(50) NOT NULL,
  qualification VARCHAR(100),
  license_number VARCHAR(50),
  center_id INTEGER REFERENCES centers(id),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(100),
  address VARCHAR(200),
  commission_rate DECIMAL(5,4) DEFAULT 0,
  contract_type VARCHAR(20),
  contract_start_date DATE,
  contract_end_date DATE,
  bank_account VARCHAR(50),
  tax_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- VOLUME REWARD TIERS TABLE
CREATE TABLE volume_reward_tiers (
  id SERIAL PRIMARY KEY,
  tier_name VARCHAR(20) NOT NULL,
  min_referrals INTEGER NOT NULL,
  max_referrals INTEGER,
  reward_rate DECIMAL(5,4) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- PATIENTS TABLE (Updated for referring physician)
CREATE TABLE patients (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  phone VARCHAR(20),
  dob DATE,
  gender VARCHAR(10),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  emergency_contact VARCHAR(100),
  center_id INTEGER REFERENCES centers(id),
  referring_physician_code VARCHAR(20) REFERENCES referring_physician_master(physician_code),
  insurance_provider VARCHAR(100),
  policy_number VARCHAR(50),
  payment_method VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- RADIOLOGIST MASTER TABLE
CREATE TABLE radiologist_master (
  id SERIAL PRIMARY KEY,
  radiologist_code VARCHAR(20) NOT NULL UNIQUE,
  radiologist_name VARCHAR(100) NOT NULL,
  specialty VARCHAR(50) NOT NULL,
  qualification VARCHAR(100),
  license_number VARCHAR(50),
  center_id INTEGER REFERENCES centers(id),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(100),
  address VARCHAR(200),
  per_study_rate DECIMAL(10,2) DEFAULT 0,
  contract_type VARCHAR(20) NOT NULL,
  contract_start_date DATE,
  contract_end_date DATE,
  bank_account VARCHAR(50),
  tax_id VARCHAR(50),
  certifications TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- STUDIES TABLE (Updated for financial reconciliation)
CREATE TABLE studies (
  id VARCHAR(36) PRIMARY KEY,
  patient_id VARCHAR(36) REFERENCES patients(id),
  study_code VARCHAR(20) REFERENCES study_master(study_code),
  accession_number VARCHAR(50) NOT NULL,
  study_instance_uid VARCHAR(100) NOT NULL,
  requested_procedure TEXT,
  actual_procedure TEXT,
  scanner_type VARCHAR(20),
  status VARCHAR(20) DEFAULT 'scheduled',
  appointment_date DATE NOT NULL,
  appointment_time VARCHAR(5) NOT NULL,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration INTEGER,
  radiologist_code VARCHAR(20) REFERENCES radiologist_master(radiologist_code),
  referring_physician_code VARCHAR(20) REFERENCES referring_physician_master(physician_code),
  findings TEXT,
  images_count INTEGER DEFAULT 0,
  dicom_images_path TEXT,
  contrast_used BOOLEAN DEFAULT false,
  emergency_study BOOLEAN DEFAULT false,
  payment_type VARCHAR(20) DEFAULT 'self_pay',
  center_id INTEGER REFERENCES centers(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- FINANCIAL RECONCILIATION TABLE
CREATE TABLE financial_reconciliation (
  id SERIAL PRIMARY KEY,
  study_id VARCHAR(36) REFERENCES studies(id),
  center_id INTEGER REFERENCES centers(id),
  reconciliation_date DATE NOT NULL,
  gross_revenue DECIMAL(12,2) NOT NULL,
  commission_amount DECIMAL(12,2) DEFAULT 0,
  radiologist_cost DECIMAL(12,2) DEFAULT 0,
  net_revenue DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  reconciled_by VARCHAR(100),
  reconciled_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- Insert sample data
INSERT INTO payment_methods (name, type, description) VALUES
('Cash', 'CASH', 'Cash payment'),
('Credit Card', 'CARD', 'Credit card payment'),
('Insurance', 'INSURANCE', 'Insurance payment'),
('Self Pay', 'SELF', 'Patient self payment'),
('Corporate', 'CORPORATE', 'Corporate account payment');

INSERT INTO asset_types (type_code, name, description, depreciation_method, useful_life_years) VALUES
('SCANNER', 'Medical Scanner', 'MRI, CT, X-Ray scanners', 'STRAIGHT_LINE', 10),
('COMPUTER', 'Computer System', 'Desktop and laptop computers', 'STRAIGHT_LINE', 3),
('WORKSTATION', 'Workstation', 'Medical imaging workstations', 'STRAIGHT_LINE', 5),
('PRINTER', 'Printer', 'Medical image printers', 'STRAIGHT_LINE', 3),
('NETWORK', 'Network Equipment', 'Routers, switches, servers', 'STRAIGHT_LINE', 5),
('FURNITURE', 'Furniture', 'Office and medical furniture', 'STRAIGHT_LINE', 7),
('VEHICLE', 'Vehicle', 'Company vehicles', 'STRAIGHT_LINE', 5),
('OTHER', 'Other Assets', 'Miscellaneous assets', 'STRAIGHT_LINE', 5);

-- Sample study master data
INSERT INTO study_master (
  study_code, study_name, modality, description, center_id, payment_method_id,
  base_rate, insurance_rate, self_pay_rate, contrast_rate, emergency_rate, weekend_rate,
  tax_rate, billing_code, cpt_code, revenue_category, cost_category
) VALUES
('MRI_BRAIN', 'MRI Brain', 'MRI', 'MRI Brain scan without contrast', 1, 1,
  800.00, 1200.00, 600.00, 200.00, 300.00, 100.00,
  0.08, 'MRI001', '70551', 'MRI_REVENUE', 'MRI_COST'),
('CT_CHEST', 'CT Chest', 'CT', 'CT Chest scan', 1, 1,
  400.00, 600.00, 300.00, 0.00, 150.00, 50.00,
  0.08, 'CT001', '71250', 'CT_REVENUE', 'CT_COST'),
('XRAY_KNEE', 'X-Ray Knee', 'XRAY', 'X-Ray Knee examination', 1, 1,
  150.00, 225.00, 100.00, 0.00, 75.00, 25.00,
  0.08, 'XR001', '73560', 'XRAY_REVENUE', 'XRAY_COST'),
('US_ABDOMEN', 'Ultrasound Abdomen', 'ULTRASOUND', 'Abdominal ultrasound', 1, 1,
  250.00, 375.00, 200.00, 0.00, 100.00, 50.00,
  0.08, 'US001', '76700', 'US_REVENUE', 'US_COST'),
('MAMMO_BILATERAL', 'Mammography Bilateral', 'MAMMOGRAPHY', 'Bilateral mammogram', 1, 1,
  300.00, 450.00, 250.00, 0.00, 150.00, 75.00,
  0.08, 'MG001', '77067', 'MAMMO_REVENUE', 'MAMMO_COST');

-- Insert volume reward tiers
INSERT INTO volume_reward_tiers (tier_name, min_referrals, max_referrals, reward_rate, description) VALUES
('BRONZE', 0, 49, 0.015, 'Entry level tier for new referring physicians'),
('SILVER', 50, 99, 0.02, 'Intermediate tier for established physicians'),
('GOLD', 100, 199, 0.025, 'Premium tier for high-volume physicians'),
('PLATINUM', 200, NULL, 0.03, 'Elite tier for top-performing physicians');

-- Sample referring physician data (updated with optional commission)
INSERT INTO referring_physician_master (
  physician_code, physician_name, specialty, qualification, license_number, center_id,
  contact_phone, contact_email, address, commission_rate, contract_type
) VALUES
('DR001', 'Dr. John Smith', 'Neurology', 'MD', 'MD12345', 1,
  '+1-555-123-4567', 'drsmith@email.com', '123 Medical Blvd, Suite 100', 0.10, 'PER_STUDY'),
('DR002', 'Dr. Jane Johnson', 'Orthopedics', 'MD', 'MD67890', 1,
  '+1-555-234-5678', 'drjohnson@email.com', '456 Health Ave, Suite 200', NULL, 'VOLUME_BASED'),
('DR003', 'Dr. Robert Davis', 'Cardiology', 'MD', 'MD11111', 1,
  '+1-555-345-6789', 'drdavis@email.com', '789 Clinic Rd, Suite 300', NULL, 'VOLUME_BASED');

-- Sample radiologist data
INSERT INTO radiologist_master (
  radiologist_code, radiologist_name, specialty, qualification, license_number, center_id,
  contact_phone, contact_email, address, per_study_rate, contract_type
) VALUES
('RAD001', 'Dr. Michael Wilson', 'Neuroradiology', 'MD', 'RAD22222', 1,
  '+1-555-456-7890', 'drwilson@email.com', '321 Imaging Way, Suite 100', 50.00, 'PER_STUDY'),
('RAD002', 'Dr. Sarah Brown', 'Musculoskeletal', 'MD', 'RAD33333', 1,
  '+1-555-567-8901', 'drbrown@email.com', '654 Radiology Dr, Suite 200', 45.00, 'PER_STUDY'),
('RAD003', 'Dr. James Taylor', 'Body Imaging', 'MD', 'RAD44444', 1,
  '+1-555-678-9012', 'drtaylor@email.com', '987 Scan Blvd, Suite 300', 55.00, 'PER_STUDY');

-- Sample asset data
INSERT INTO asset_master (
  asset_code, asset_name, asset_type, description, center_id, manufacturer, model,
  serial_number, purchase_date, purchase_cost, depreciation_rate, warranty_expiry,
  location, assigned_to, status
) VALUES
('MRI001', 'Siemens MRI Scanner', 'SCANNER', '3T MRI Scanner', 1, 'Siemens', 'Magnetom Skyra',
  'SN123456', '2020-01-15', 2500000.00, 0.10, '2025-01-15',
  'MRI Suite 1', 'Radiology Department', 'ACTIVE'),
('CT001', 'GE CT Scanner', 'SCANNER', '64-slice CT Scanner', 1, 'GE', 'Revolution Evo',
  'SN789012', '2021-03-20', 1200000.00, 0.15, '2026-03-20',
  'CT Suite 1', 'Radiology Department', 'ACTIVE'),
('XRAY001', 'Philips X-Ray', 'SCANNER', 'Digital X-Ray System', 1, 'Philips', 'DigitalDiagnost',
  'SN345678', '2019-06-10', 450000.00, 0.20, '2024-06-10',
  'X-Ray Room 1', 'Radiology Department', 'ACTIVE'),
('WS001', 'Dell Workstation', 'WORKSTATION', 'Medical Imaging Workstation', 1, 'Dell', 'Precision 5820',
  'SN567890', '2022-01-10', 3500.00, 0.25, '2025-01-10',
  'Reading Room 1', 'Dr. Wilson', 'ACTIVE');

-- Create indexes for performance
CREATE INDEX idx_study_master_center_modality ON study_master(center_id, modality);
CREATE INDEX idx_asset_master_center_type ON asset_master(center_id, asset_type);
CREATE INDEX idx_referring_physician_center_specialty ON referring_physician_master(center_id, specialty);
CREATE INDEX idx_radiologist_center_specialty ON radiologist_master(center_id, specialty);
CREATE INDEX idx_studies_center_date ON studies(center_id, appointment_date);
CREATE INDEX idx_financial_reconciliation_center_date ON financial_reconciliation(center_id, reconciliation_date);
