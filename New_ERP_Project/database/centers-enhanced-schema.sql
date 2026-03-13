-- ENHANCED CENTERS TABLE WITH MODALITY SUPPORT

-- Update centers table to include additional fields
ALTER TABLE centers ADD COLUMN IF NOT EXISTS gst_number VARCHAR(15);
ALTER TABLE centers ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10);
ALTER TABLE centers ADD COLUMN IF NOT EXISTS license_number VARCHAR(50);
ALTER TABLE centers ADD COLUMN IF NOT EXISTS established_year INTEGER;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS logo_path VARCHAR(500);

-- CENTER MODALITIES TABLE
CREATE TABLE center_modalities (
  id SERIAL PRIMARY KEY,
  center_id INTEGER REFERENCES centers(id),
  modality VARCHAR(50) NOT NULL,
  description TEXT,
  equipment_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true,
  UNIQUE(center_id, modality)
);

-- Sample data for Kerala centers with modalities

-- Update existing centers with additional information
UPDATE centers SET 
  gst_number = '29AAACM1234C1ZV',
  pan_number = 'AAACM1234C',
  license_number = 'DLK2024001',
  established_year = 2010
WHERE id = 1;

-- Insert center modalities for existing centers
INSERT INTO center_modalities (center_id, modality, description, equipment_count) VALUES
(1, 'MRI', 'Magnetic Resonance Imaging - 1.5T and 3T scanners', 2),
(1, 'CT', 'Computed Tomography - 64-slice and 128-slice scanners', 2),
(1, 'XRAY', 'Digital X-Ray and Fluoroscopy', 3),
(1, 'ULTRASOUND', 'Advanced Ultrasound Imaging', 4),
(1, 'MAMMOGRAPHY', 'Digital Mammography', 1);

-- Sample Kerala centers with complete information
INSERT INTO centers (
  id, name, code, address, city, state, postal_code, country, phone, email,
  manager_name, manager_email, manager_phone, operating_hours, emergency_contact,
  capacity_daily, specialties, insurance_providers, gst_number, pan_number,
  license_number, established_year, created_at, updated_at, active
) VALUES
('CTR2', 'Trivandrum Medical Imaging', 'TVR001', 
 'Medical Complex, Puliyarakonam, Kowdiar', 'Trivandrum', 'Kerala', '695024', 'India',
 '+91-471-2345678', 'trivandrum@medicalimaging.com', 'Dr. Rajesh Nair',
 'rajesh.nair@medicalimaging.com', '+91-471-2345679', '8:00 AM - 8:00 PM',
 '+91-471-98765432', 150, ARRAY['MRI', 'CT', 'XRAY', 'ULTRASOUND'],
 ARRAY['Star Health', 'ICICI Lombard', 'HDFC Ergo', 'New India Assurance'],
 '29AAATV1234C1ZV', 'AAATV1234C', 'DLK2024002', 2012, NOW(), NOW(), true),
('CTR3', 'Kochi Diagnostic Center', 'COK001', 
 'Lulu International Hospital, Edappally', 'Kochi', 'Kerala', '682024', 'India',
 '+91-484-3456789', 'kochi@diagnostic.com', 'Dr. Anjali Menon',
 'anjali.menon@diagnostic.com', '+91-484-3456790', '24/7 Emergency Services',
 '+91-484-87654321', 200, ARRAY['MRI', 'CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY'],
 ARRAY['Bajaj Allianz', 'Reliance General', 'United India', 'National Insurance'],
 '29AAACK1234C1ZV', 'AAACK1234C', 'DLK2024003', 2015, NOW(), NOW(), true),
('CTR4', 'Calicut Medical Center', 'CLT001', 
 'Medical College Road, Calicut', 'Calicut', 'Kerala', '673008', 'India',
 '+91-495-4567890', 'calicut@medical.com', 'Dr. Suresh Kumar',
 'suresh.kumar@medical.com', '+91-495-4567891', '7:00 AM - 9:00 PM',
 '+91-495-76543210', 120, ARRAY['CT', 'XRAY', 'ULTRASOUND'],
 ARRAY['IFFCO Tokio', 'Royal Sundaram', 'Cholamandalam MS', 'SBI General'],
 '29AAACL1234C1ZV', 'AAACL1234C', 'DLK2024004', 2018, NOW(), NOW(), true),
('CTR5', 'Thrissur Imaging Center', 'TCR001', 
 'Jubilee Mission Road, Thrissur', 'Thrissur', 'Kerala', '680001', 'India',
 '+91-487-5678901', 'thrissur@imaging.com', 'Dr. Priya Chandran',
 'priya.chandran@imaging.com', '+91-487-5678902', '8:00 AM - 8:00 PM',
 '+91-487-65432109', 100, ARRAY['MRI', 'CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY'],
 ARRAY['Oriental Insurance', 'Max Bupa', 'Apollo Munich', 'HDFC Ergo'],
 '29AAACT1234C1ZV', 'AAACT1234C', 'DLK2024005', 2020, NOW(), NOW(), true);

-- Insert modalities for new centers
INSERT INTO center_modalities (center_id, modality, description, equipment_count) VALUES
('CTR2', 'MRI', '3T MRI Scanner with advanced neuro imaging', 1),
('CTR2', 'CT', '128-slice CT Scanner', 1),
('CTR2', 'XRAY', 'Digital X-Ray and Portable X-Ray', 2),
('CTR2', 'ULTRASOUND', '4D Ultrasound and Doppler', 3),
('CTR2', 'MAMMOGRAPHY', 'Digital Mammography with Biopsy', 1),

('CTR3', 'MRI', '1.5T and 3T MRI Scanners', 2),
('CTR3', 'CT', '64-slice and 256-slice CT Scanners', 2),
('CTR3', 'XRAY', 'Digital X-Ray and Fluoroscopy', 3),
('CTR3', 'ULTRASOUND', 'Advanced Ultrasound with Contrast', 4),
('CTR3', 'MAMMOGRAPHY', 'Digital Mammography with Tomosynthesis', 2),

('CTR4', 'CT', '64-slice CT Scanner', 1),
('CTR4', 'XRAY', 'Digital X-Ray', 2),
('CTR4', 'ULTRASOUND', 'Color Doppler Ultrasound', 2),

('CTR5', 'MRI', '1.5T MRI Scanner', 1),
('CTR5', 'CT', '128-slice CT Scanner', 1),
('CTR5', 'XRAY', 'Digital X-Ray', 2),
('CTR5', 'ULTRASOUND', '4D Ultrasound', 2),
('CTR5', 'MAMMOGRAPHY', 'Digital Mammography', 1);

-- Create indexes for performance
CREATE INDEX idx_center_modalities_center_id ON center_modalities(center_id);
CREATE INDEX idx_center_modalities_modality ON center_modalities(modality);
CREATE INDEX idx_centers_city_state ON centers(city, state);
CREATE INDEX idx_centers_active ON centers(active);
CREATE INDEX idx_center_modalities_active ON center_modalities(active);

-- Create function to get center with modalities
CREATE OR REPLACE FUNCTION get_center_with_modalities(p_center_id INTEGER)
RETURNS TABLE (
  id VARCHAR(36),
  name VARCHAR(100),
  code VARCHAR(20),
  address VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(6),
  country VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  manager_name VARCHAR(100),
  manager_email VARCHAR(100),
  manager_phone VARCHAR(20),
  operating_hours VARCHAR(100),
  emergency_contact VARCHAR(20),
  capacity_daily INTEGER,
  specialties TEXT[],
  insurance_providers TEXT[],
  gst_number VARCHAR(15),
  pan_number VARCHAR(10),
  license_number VARCHAR(50),
  established_year INTEGER,
  logo_path VARCHAR(500),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  modalities TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.*,
    STRING_AGG(cm.modality, ', ' ORDER BY cm.modality) as modalities
  FROM centers c
  LEFT JOIN center_modalities cm ON c.id = cm.center_id AND cm.active = true
  WHERE c.id = p_center_id AND c.active = true
  GROUP BY c.id, c.name, c.code, c.address, c.city, c.state, c.postal_code, c.country,
           c.phone, c.email, c.manager_name, c.manager_email, c.manager_phone, c.operating_hours,
           c.emergency_contact, c.capacity_daily, c.specialties, c.insurance_providers,
           c.gst_number, c.pan_number, c.license_number, c.established_year, c.logo_path,
           c.created_at, c.updated_at;
END;
$$ LANGUAGE plpgsql;

-- Create function to get all centers with modalities
CREATE OR REPLACE FUNCTION get_all_centers_with_modalities()
RETURNS TABLE (
  id VARCHAR(36),
  name VARCHAR(100),
  code VARCHAR(20),
  address VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(6),
  country VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  manager_name VARCHAR(100),
  manager_email VARCHAR(100),
  manager_phone VARCHAR(20),
  operating_hours VARCHAR(100),
  emergency_contact VARCHAR(20),
  capacity_daily INTEGER,
  specialties TEXT[],
  insurance_providers TEXT[],
  gst_number VARCHAR(15),
  pan_number VARCHAR(10),
  license_number VARCHAR(50),
  established_year INTEGER,
  logo_path VARCHAR(500),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  modalities TEXT,
  patient_count BIGINT,
  scanner_count BIGINT,
  staff_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.*,
    STRING_AGG(cm.modality, ', ' ORDER BY cm.modality) as modalities,
    COUNT(DISTINCT p.id) as patient_count,
    COUNT(DISTINCT s.id) as scanner_count,
    COUNT(DISTINCT staff.id) as staff_count
  FROM centers c
  LEFT JOIN center_modalities cm ON c.id = cm.center_id AND cm.active = true
  LEFT JOIN patients p ON c.id = p.center_id AND p.active = true
  LEFT JOIN scanners s ON c.id = s.center_id AND s.active = true
  LEFT JOIN users staff ON c.id = staff.center_id AND staff.active = true
  WHERE c.active = true
  GROUP BY c.id, c.name, c.code, c.address, c.city, c.state, c.postal_code, c.country,
           c.phone, c.email, c.manager_name, c.manager_email, c.manager_phone, c.operating_hours,
           c.emergency_contact, c.capacity_daily, c.specialties, c.insurance_providers,
           c.gst_number, c.pan_number, c.license_number, c.established_year, c.logo_path,
           c.created_at, c.updated_at
  ORDER BY c.name;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update center_modalities when center is deleted
CREATE OR REPLACE FUNCTION update_center_modalities_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE center_modalities 
  SET active = false, updated_at = NOW() 
  WHERE center_id = OLD.id AND active = true;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_update_center_modalities_on_delete
  BEFORE UPDATE ON centers
  FOR EACH ROW
  WHEN (OLD.active = true AND NEW.active = false)
  EXECUTE FUNCTION update_center_modalities_on_delete();
