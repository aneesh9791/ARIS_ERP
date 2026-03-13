-- Enhanced Patient Schema with ID Proof Support

-- Update patients table to include ID proof information
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS id_proof_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS id_proof_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS id_proof_issued_date DATE,
ADD COLUMN IF NOT EXISTS id_proof_expiry_date DATE,
ADD COLUMN IF NOT EXISTS id_proof_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS id_proof_document_path VARCHAR(500);

-- Add patient photo support
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS photo_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS photo_uploaded_at TIMESTAMP;

-- Add emergency contact information
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(50),
ADD COLUMN IF NOT EXISTS emergency_contact_email VARCHAR(100);

-- Add medical history fields
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10),
ADD COLUMN IF NOT EXISTS allergies TEXT,
ADD COLUMN IF NOT EXISTS chronic_diseases TEXT,
ADD COLUMN IF NOT EXISTS current_medications TEXT,
ADD COLUMN IF NOT EXISTS previous_surgeries TEXT;

-- Add consent and privacy fields
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS consent_for_treatment BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_for_data_sharing BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS privacy_preferences JSONB DEFAULT '{}';

-- Create ID proof types table
CREATE TABLE IF NOT EXISTS id_proof_types (
  id SERIAL PRIMARY KEY,
  type_code VARCHAR(20) UNIQUE NOT NULL,
  type_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert ID proof types for Kerala context
INSERT INTO id_proof_types (type_code, type_name, description) VALUES
('AADHAAR', 'Aadhaar Card', 'Unique Identification Authority of India'),
('PAN', 'PAN Card', 'Permanent Account Number'),
('PASSPORT', 'Passport', 'Indian Passport'),
('VOTER', 'Voter ID', 'Election Commission of India'),
('DRIVING', 'Driving License', 'Regional Transport Office'),
('RATION', 'Ration Card', 'Civil Supplies Department'),
('EMPLOYEE', 'Employee ID', 'Employment ID Card'),
('STUDENT', 'Student ID', 'Educational Institution ID'),
('OTHER', 'Other ID', 'Other Government Issued ID')
ON CONFLICT (type_code) DO NOTHING;

-- Create patient studies relationship table for quick access
CREATE TABLE IF NOT EXISTS patient_studies (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  study_id INTEGER REFERENCES studies(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(patient_id, study_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_id_proof_type ON patients(id_proof_type);
CREATE INDEX IF NOT EXISTS idx_patients_id_proof_number ON patients(id_proof_number);
CREATE INDEX IF NOT EXISTS idx_patients_emergency_contact ON patients(emergency_contact_phone);
CREATE INDEX IF NOT EXISTS idx_patients_blood_group ON patients(blood_group);
CREATE INDEX IF NOT EXISTS idx_patient_studies_patient_id ON patient_studies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_studies_study_id ON patient_studies(study_id);

-- Create function to search patients by ID proof
CREATE OR REPLACE FUNCTION search_patients_by_id_proof(
  p_id_proof_type VARCHAR(50),
  p_id_proof_number VARCHAR(100)
) RETURNS TABLE (
  patient_id INTEGER,
  patient_name VARCHAR(100),
  patient_phone VARCHAR(20),
  patient_email VARCHAR(100),
  id_proof_type VARCHAR(50),
  id_proof_number VARCHAR(100),
  id_proof_verified BOOLEAN,
  center_name VARCHAR(100),
  total_studies INTEGER,
  last_study_date TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as patient_id,
    p.name as patient_name,
    p.phone as patient_phone,
    p.email as patient_email,
    p.id_proof_type,
    p.id_proof_number,
    p.id_proof_verified,
    c.name as center_name,
    COUNT(ps.study_id) as total_studies,
    MAX(s.created_at) as last_study_date
  FROM patients p
  LEFT JOIN centers c ON p.center_id = c.id
  LEFT JOIN patient_studies ps ON p.id = ps.patient_id
  LEFT JOIN studies s ON ps.study_id = s.id
  WHERE p.active = true 
    AND p.id_proof_type = p_id_proof_type 
    AND p.id_proof_number = p_id_proof_number
  GROUP BY p.id, p.name, p.phone, p.email, p.id_proof_type, p.id_proof_number, p.id_proof_verified, c.name
  ORDER BY p.name;
END;
$$ LANGUAGE plpgsql;

-- Create function to get patient with all studies
CREATE OR REPLACE FUNCTION get_patient_with_studies(
  p_patient_id INTEGER
) RETURNS TABLE (
  patient_id INTEGER,
  patient_name VARCHAR(100),
  patient_phone VARCHAR(20),
  patient_email VARCHAR(100),
  patient_address TEXT,
  patient_city VARCHAR(100),
  patient_state VARCHAR(100),
  id_proof_type VARCHAR(50),
  id_proof_number VARCHAR(100),
  id_proof_verified BOOLEAN,
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  blood_group VARCHAR(10),
  allergies TEXT,
  chronic_diseases TEXT,
  current_medications TEXT,
  studies JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as patient_id,
    p.name as patient_name,
    p.phone as patient_phone,
    p.email as patient_email,
    CONCAT(p.address, ', ', p.city, ', ', p.state, ' - ', p.postal_code) as patient_address,
    p.city,
    p.state,
    p.id_proof_type,
    p.id_proof_number,
    p.id_proof_verified,
    p.emergency_contact_name,
    p.emergency_contact_phone,
    p.blood_group,
    p.allergies,
    p.chronic_diseases,
    p.current_medications,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'study_id', s.id,
          'study_code', s.study_code,
          'study_name', sm.study_name,
          'modality', sm.modality,
          'status', s.status,
          'scheduled_date', s.scheduled_date,
          'completion_date', s.completion_date,
          'report_date', s.report_date,
          'radiologist_name', rm.name
        ) ORDER BY s.created_at DESC
      ) FILTER (WHERE s.id IS NOT NULL), 
      '[]'::jsonb
    ) as studies
  FROM patients p
  LEFT JOIN patient_studies ps ON p.id = ps.patient_id
  LEFT JOIN studies s ON ps.study_id = s.id AND s.active = true
  LEFT JOIN study_master sm ON s.study_code = sm.study_code
  LEFT JOIN radiologist_master rm ON s.radiologist_code = rm.radiologist_code
  WHERE p.id = p_patient_id AND p.active = true
  GROUP BY p.id, p.name, p.phone, p.email, p.address, p.city, p.state, p.postal_code, 
           p.id_proof_type, p.id_proof_number, p.id_proof_verified, p.emergency_contact_name, 
           p.emergency_contact_phone, p.blood_group, p.allergies, p.chronic_diseases, p.current_medications;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate ID proof format
CREATE OR REPLACE FUNCTION validate_id_proof_format(
  p_id_proof_type VARCHAR(50),
  p_id_proof_number VARCHAR(100)
) RETURNS TABLE (
  is_valid BOOLEAN,
  error_message TEXT
) AS $$
BEGIN
  CASE p_id_proof_type
    WHEN 'AADHAAR' THEN
      IF p_id_proof_number ~ '^[0-9]{12}$' THEN
        RETURN QUERY SELECT true, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT false, 'Aadhaar number must be 12 digits'::TEXT;
      END IF;
    
    WHEN 'PAN' THEN
      IF p_id_proof_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$' THEN
        RETURN QUERY SELECT true, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT false, 'PAN card format: 5 letters + 4 digits + 1 letter'::TEXT;
      END IF;
    
    WHEN 'PASSPORT' THEN
      IF p_id_proof_number ~ '^[A-Z]{1}[0-9]{7}$' THEN
        RETURN QUERY SELECT true, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT false, 'Passport format: 1 letter + 7 digits'::TEXT;
      END IF;
    
    WHEN 'VOTER' THEN
      IF p_id_proof_number ~ '^[A-Z]{3}[0-9]{7}$' THEN
        RETURN QUERY SELECT true, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT false, 'Voter ID format: 3 letters + 7 digits'::TEXT;
      END IF;
    
    WHEN 'DRIVING' THEN
      IF p_id_proof_number ~ '^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$' THEN
        RETURN QUERY SELECT true, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT false, 'Driving License format: State code + RTO code + Year + Series'::TEXT;
      END IF;
    
    ELSE
      RETURN QUERY SELECT true, NULL::TEXT;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to patients table
CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to id_proof_types table
CREATE TRIGGER update_id_proof_types_updated_at
  BEFORE UPDATE ON id_proof_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create view for patient statistics with ID proof verification
CREATE OR REPLACE VIEW patient_id_proof_stats AS
SELECT 
  'ID_PROOF_STATS' as stats_type,
  COUNT(*) as total_patients,
  COUNT(CASE WHEN id_proof_type IS NOT NULL THEN 1 END) as patients_with_id_proof,
  COUNT(CASE WHEN id_proof_verified = true THEN 1 END) as patients_with_verified_id,
  COUNT(CASE WHEN id_proof_type = 'AADHAAR' THEN 1 END) as aadhaar_count,
  COUNT(CASE WHEN id_proof_type = 'PAN' THEN 1 END) as pan_count,
  COUNT(CASE WHEN id_proof_type = 'PASSPORT' THEN 1 END) as passport_count,
  COUNT(CASE WHEN id_proof_type = 'VOTER' THEN 1 END) as voter_id_count,
  COUNT(CASE WHEN id_proof_type = 'DRIVING' THEN 1 END) as driving_license_count,
  COUNT(CASE WHEN id_proof_type = 'OTHER' THEN 1 END) as other_id_count,
  COUNT(CASE WHEN photo_path IS NOT NULL THEN 1 END) as patients_with_photo,
  COUNT(CASE WHEN emergency_contact_name IS NOT NULL THEN 1 END) as patients_with_emergency_contact,
  COUNT(CASE WHEN blood_group IS NOT NULL THEN 1 END) as patients_with_blood_group,
  COUNT(CASE WHEN allergies IS NOT NULL AND allergies != '' THEN 1 END) as patients_with_allergies,
  CURRENT_TIMESTAMP as last_updated
FROM patients 
WHERE active = true;

-- Create function to get patient quick search results
CREATE OR REPLACE FUNCTION patient_quick_search(
  p_search_term TEXT,
  p_center_id INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  patient_id INTEGER,
  patient_name VARCHAR(100),
  patient_phone VARCHAR(20),
  patient_email VARCHAR(100),
  id_proof_type VARCHAR(50),
  id_proof_number VARCHAR(100),
  center_name VARCHAR(100),
  total_studies INTEGER,
  last_visit DATE,
  match_type VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as patient_id,
    p.name as patient_name,
    p.phone as patient_phone,
    p.email as patient_email,
    p.id_proof_type,
    p.id_proof_number,
    c.name as center_name,
    COUNT(ps.study_id) as total_studies,
    MAX(s.created_at)::DATE as last_visit,
    CASE 
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
  WHERE p.active = true 
    AND (p_center_id IS NULL OR p.center_id = p_center_id)
    AND (
      p.name ILIKE CONCAT('%', p_search_term, '%') OR
      p.phone ILIKE CONCAT('%', p_search_term, '%') OR
      p.email ILIKE CONCAT('%', p_search_term, '%') OR
      p.id_proof_number ILIKE CONCAT('%', p_search_term, '%')
    )
  GROUP BY p.id, p.name, p.phone, p.email, p.id_proof_type, p.id_proof_number, c.name
  ORDER BY 
    CASE 
      WHEN p.name ILIKE CONCAT('%', p_search_term, '%') THEN 1
      WHEN p.phone ILIKE CONCAT('%', p_search_term, '%') THEN 2
      ELSE 3
    END,
    p.name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
