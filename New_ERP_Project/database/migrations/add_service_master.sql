-- Extend services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'GENERAL';
ALTER TABLE services ADD COLUMN IF NOT EXISTS modality VARCHAR(50);
ALTER TABLE services ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS gst_applicable BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20);
ALTER TABLE services ADD COLUMN IF NOT EXISTS sac_code VARCHAR(20);
ALTER TABLE services ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Extend bill_items table
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'STUDY_CHARGE';
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS service_id INTEGER REFERENCES services(id);

-- Seed default add-on services (contrast per modality + DICOM CD)
INSERT INTO services (name, code, category, item_type, modality, price, gst_rate, gst_applicable, is_active, display_order)
VALUES
  ('CT Contrast',      'CONTRAST_CT',   'ADD_ON', 'CONTRAST',  'CT',  500.00, 0,  false, true, 1),
  ('MRI Contrast',     'CONTRAST_MRI',  'ADD_ON', 'CONTRAST',  'MRI', 800.00, 0,  false, true, 2),
  ('XRAY Contrast',    'CONTRAST_XRAY', 'ADD_ON', 'CONTRAST',  'XRAY',200.00, 0,  false, true, 3),
  ('USG Contrast',     'CONTRAST_USG',  'ADD_ON', 'CONTRAST',  'USG', 300.00, 0,  false, true, 4),
  ('DICOM CD Media',   'DICOM_CD',      'ADD_ON', 'DICOM_CD',  NULL,  150.00, 18, true,  true, 10)
ON CONFLICT (code) DO NOTHING;
