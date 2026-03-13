-- BILL PRINTING AND CONFIGURATION DATABASE SCHEMA

-- BILL CONFIGURATION TABLE
CREATE TABLE bill_configuration (
  id SERIAL PRIMARY KEY,
  center_id INTEGER REFERENCES centers(id),
  template_name VARCHAR(100) NOT NULL,
  header_text TEXT NOT NULL,
  footer_text TEXT NOT NULL,
  terms_conditions TEXT NOT NULL,
  show_logo BOOLEAN DEFAULT true,
  show_center_details BOOLEAN DEFAULT true,
  show_patient_details BOOLEAN DEFAULT true,
  show_breakdown BOOLEAN DEFAULT true,
  show_gst_breakdown BOOLEAN DEFAULT true,
  show_payment_details BOOLEAN DEFAULT true,
  show_terms BOOLEAN DEFAULT true,
  show_signature BOOLEAN DEFAULT true,
  logo_position VARCHAR(10) DEFAULT 'CENTER',
  font_size INTEGER DEFAULT 12,
  paper_size VARCHAR(10) DEFAULT 'A4',
  orientation VARCHAR(10) DEFAULT 'PORTRAIT',
  margin_top DECIMAL(3,1) DEFAULT 1.0,
  margin_bottom DECIMAL(3,1) DEFAULT 1.0,
  margin_left DECIMAL(3,1) DEFAULT 1.0,
  margin_right DECIMAL(3,1) DEFAULT 1.0,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- CENTER LOGOS TABLE
CREATE TABLE center_logos (
  id SERIAL PRIMARY KEY,
  center_id INTEGER REFERENCES centers(id),
  logo_name VARCHAR(100) NOT NULL,
  logo_path VARCHAR(500) NOT NULL,
  logo_type VARCHAR(10) NOT NULL,
  position VARCHAR(10) DEFAULT 'CENTER',
  file_size INTEGER,
  file_extension VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- BILL TEMPLATES TABLE
CREATE TABLE bill_templates (
  id SERIAL PRIMARY KEY,
  template_name VARCHAR(100) NOT NULL,
  template_type VARCHAR(20) NOT NULL,
  html_content TEXT NOT NULL,
  css_content TEXT,
  variables TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- PRINT JOBS TABLE
CREATE TABLE print_jobs (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES patient_bills(id),
  configuration_id INTEGER REFERENCES bill_configuration(id),
  printer_name VARCHAR(100),
  copies INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'PENDING',
  file_path VARCHAR(500),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- BILL HISTORY TABLE
CREATE TABLE bill_history (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES patient_bills(id),
  action_type VARCHAR(20) NOT NULL,
  action_details TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- Sample data for bill configuration

-- Default bill configuration for center 1
INSERT INTO bill_configuration (
  center_id, template_name, header_text, footer_text, terms_conditions,
  show_logo, show_center_details, show_patient_details, show_breakdown,
  show_gst_breakdown, show_payment_details, show_terms, show_signature,
  logo_position, font_size, paper_size, orientation, margin_top,
  margin_bottom, margin_left, margin_right, is_default
) VALUES
(1, 'Standard Template', 'MEDICAL IMAGING CENTER', 
 'Thank you for choosing our services. For any queries, please contact us.',
 '1. Payment due within 30 days\n2. Late payment charges applicable @ 18% per annum\n3. Goods once sold cannot be returned\n4. Subject to Kochi jurisdiction\n5. GSTIN: 29AAACM1234C1ZV',
 true, true, true, true, true, true, true, true, 'CENTER', 12, 'A4', 'PORTRAIT',
 1.0, 1.0, 1.0, 1.0, true),
(1, 'Simple Template', 'DIAGNOSTIC CENTER', 
 'We appreciate your business',
 '1. Payment due within 15 days\n2. No returns or exchanges',
 true, true, true, false, false, false, false, false, 'LEFT', 10, 'A4', 'PORTRAIT',
 1.5, 1.5, 1.5, 1.5, false),
(1, 'Detailed Template', 'ADVANCED MEDICAL IMAGING', 
 'Your health is our priority',
 '1. Payment due within 45 days\n2. Late payment charges @ 24% per annum\n3. All disputes subject to Kerala High Court jurisdiction\n4. Comprehensive insurance coverage available\n5. Emergency services available 24/7',
 true, true, true, true, true, true, true, true, 'RIGHT', 14, 'A4', 'LANDSCAPE',
 0.5, 0.5, 0.5, 0.5, false);

-- Sample bill templates
INSERT INTO bill_templates (
  template_name, template_type, html_content, css_content, variables
) VALUES
('Standard Medical Bill', 'PATIENT_BILL', 
'<html><head><style>body{font-family:Arial,sans-serif;}</style></head><body>{{content}}</body></html>',
'body{font-family:Arial,sans-serif;margin:20px;}',
'{{logo}} {{center_name}} {{patient_name}} {{bill_number}} {{amount}}'),
('Insurance Bill', 'INSURANCE_BILL',
'<html><head><style>body{font-family:Arial,sans-serif;}</style></head><body>{{content}}</body></html>',
'body{font-family:Arial,sans-serif;margin:20px;}',
'{{logo}} {{center_name}} {{insurance_name}} {{patient_name}} {{bill_number}} {{amount}}'),
('Receipt Template', 'RECEIPT',
'<html><head><style>body{font-family:Arial,sans-serif;}</style></head><body>{{content}}</body></html>',
'body{font-family:Arial,sans-serif;margin:20px;}',
'{{logo}} {{center_name}} {{receipt_number}} {{amount}} {{date}}');

-- Sample logos (placeholder paths)
INSERT INTO center_logos (
  center_id, logo_name, logo_path, logo_type, position, file_size, file_extension
) VALUES
(1, 'Main Logo', '/uploads/logos/logo_1_1234567890.jpg', 'HEADER', 'CENTER', 150000, '.jpg'),
(1, 'Watermark Logo', '/uploads/logos/watermark_1_1234567891.png', 'WATERMARK', 'CENTER', 50000, '.png'),
(1, 'Footer Logo', '/uploads/logos/footer_1_1234567892.gif', 'FOOTER', 'CENTER', 75000, '.gif');

-- Create indexes for performance
CREATE INDEX idx_bill_configuration_center_id ON bill_configuration(center_id);
CREATE INDEX idx_bill_configuration_is_default ON bill_configuration(is_default);
CREATE INDEX idx_center_logos_center_id ON center_logos(center_id);
CREATE INDEX idx_center_logos_type ON center_logos(logo_type);
CREATE INDEX idx_print_jobs_bill_id ON print_jobs(bill_id);
CREATE INDEX idx_print_jobs_status ON print_jobs(status);
CREATE INDEX idx_bill_history_bill_id ON bill_history(bill_id);
CREATE INDEX idx_bill_history_action_type ON bill_history(action_type);

-- Create uploads directory for logos
-- This should be created programmatically in the application
-- mkdir -p uploads/logos
