-- Migration 023: User-Friendly Settings and Configuration System
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/backend/migrations/user_friendly_settings.sql

-- Fixes applied:
--   ON CONFLICT (action_name) in quick_actions INSERT requires a UNIQUE constraint on
--     quick_actions.action_name — added via DO block (duplicate_object safe).
--   ON CONFLICT (widget_name) in dashboard_widgets INSERT requires a UNIQUE constraint on
--     dashboard_widgets.widget_name — added via DO block.
--   ON CONFLICT (template_name) in notification_templates INSERT requires a UNIQUE constraint on
--     notification_templates.template_name — added via DO block.
--   ON CONFLICT (form_name, field_name) in form_configurations INSERT requires a composite
--     UNIQUE constraint on (form_name, field_name) — added via DO block.
--   ON CONFLICT (option_group, option_value) in dropdown_options already handled by the
--     source's inline UNIQUE(option_group, option_value) — no extra fix needed.
--   All GRANT statements left as comments (role-dependent; apply manually in target env).
--   json_extract_path_text cast: display_options is JSONB so the call is valid in PostgreSQL.

-- ============================================================
-- TABLES
-- ============================================================

-- System settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_name VARCHAR(100) NOT NULL,
    setting_category VARCHAR(50) NOT NULL,
    setting_type VARCHAR(20) NOT NULL, -- TEXT, NUMBER, BOOLEAN, SELECT, MULTI_SELECT, DATE, JSON
    setting_value TEXT,
    default_value TEXT,
    description TEXT,
    validation_rules JSONB, -- Validation rules for the setting
    display_options JSONB, -- Dropdown options, labels, etc.
    is_required BOOLEAN DEFAULT false,
    is_user_specific BOOLEAN DEFAULT false,
    is_center_specific BOOLEAN DEFAULT false,
    is_department_specific BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    preference_key VARCHAR(100) NOT NULL,
    preference_value TEXT,
    preference_category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, preference_key)
);

-- Center settings table
CREATE TABLE IF NOT EXISTS center_settings (
    id SERIAL PRIMARY KEY,
    center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    setting_category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(center_id, setting_key)
);

-- Department settings table
CREATE TABLE IF NOT EXISTS department_settings (
    id SERIAL PRIMARY KEY,
    department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    setting_category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(department_id, setting_key)
);

-- Dropdown options table
CREATE TABLE IF NOT EXISTS dropdown_options (
    id SERIAL PRIMARY KEY,
    option_group VARCHAR(50) NOT NULL,
    option_value VARCHAR(100) NOT NULL,
    option_label VARCHAR(100) NOT NULL,
    option_description TEXT,
    parent_option_value VARCHAR(100), -- For hierarchical dropdowns
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(option_group, option_value)
);

-- Form configurations table
CREATE TABLE IF NOT EXISTS form_configurations (
    id SERIAL PRIMARY KEY,
    form_name VARCHAR(100) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    field_type VARCHAR(20) NOT NULL, -- TEXT, NUMBER, SELECT, MULTI_SELECT, DATE, CHECKBOX, RADIO, TEXTAREA
    field_label VARCHAR(100) NOT NULL,
    field_placeholder VARCHAR(200),
    field_options JSONB, -- Dropdown options, validation rules, etc.
    is_required BOOLEAN DEFAULT false,
    is_readonly BOOLEAN DEFAULT false,
    is_visible BOOLEAN DEFAULT true,
    default_value TEXT,
    validation_rules JSONB,
    display_order INTEGER DEFAULT 0,
    depends_on_field VARCHAR(100), -- Field dependency
    depends_on_value TEXT, -- Value that triggers this field
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quick actions table
CREATE TABLE IF NOT EXISTS quick_actions (
    id SERIAL PRIMARY KEY,
    action_name VARCHAR(100) NOT NULL,
    action_category VARCHAR(50) NOT NULL,
    action_description TEXT,
    action_icon VARCHAR(50),
    action_color VARCHAR(20),
    target_module VARCHAR(50),
    target_action VARCHAR(50),
    required_permissions JSONB,
    is_favorite BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dashboard widgets table
CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id SERIAL PRIMARY KEY,
    widget_name VARCHAR(100) NOT NULL,
    widget_type VARCHAR(50) NOT NULL, -- CHART, TABLE, CARD, METRIC, CALENDAR
    widget_title VARCHAR(100),
    widget_description TEXT,
    widget_config JSONB, -- Widget configuration
    data_source VARCHAR(100), -- API endpoint or data source
    refresh_interval INTEGER DEFAULT 300, -- Seconds
    default_position JSONB, -- Default position on dashboard
    default_size JSONB, -- Default size (width, height)
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification templates table
CREATE TABLE IF NOT EXISTS notification_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    template_type VARCHAR(50) NOT NULL, -- EMAIL, SMS, PUSH, IN_APP
    template_category VARCHAR(50),
    subject_template TEXT,
    message_template TEXT,
    template_variables JSONB, -- Variables that can be used in templates
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workflow configurations table
CREATE TABLE IF NOT EXISTS workflow_configurations (
    id SERIAL PRIMARY KEY,
    workflow_name VARCHAR(100) NOT NULL,
    workflow_category VARCHAR(50) NOT NULL,
    trigger_event VARCHAR(100) NOT NULL,
    workflow_steps JSONB, -- Array of workflow steps
    approval_levels JSONB, -- Approval configuration
    notification_settings JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- UNIQUE CONSTRAINTS required for ON CONFLICT targets
-- (wrapped in DO blocks for idempotency)
-- ============================================================

-- quick_actions.action_name (needed by ON CONFLICT (action_name) DO NOTHING)
DO $$
BEGIN
    ALTER TABLE quick_actions ADD CONSTRAINT uq_quick_actions_action_name UNIQUE (action_name);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- dashboard_widgets.widget_name (needed by ON CONFLICT (widget_name) DO NOTHING)
DO $$
BEGIN
    ALTER TABLE dashboard_widgets ADD CONSTRAINT uq_dashboard_widgets_widget_name UNIQUE (widget_name);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- notification_templates.template_name (needed by ON CONFLICT (template_name) DO NOTHING)
DO $$
BEGIN
    ALTER TABLE notification_templates ADD CONSTRAINT uq_notification_templates_template_name UNIQUE (template_name);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- form_configurations (form_name, field_name) (needed by ON CONFLICT (form_name, field_name) DO NOTHING)
DO $$
BEGIN
    ALTER TABLE form_configurations ADD CONSTRAINT uq_form_configurations_form_field UNIQUE (form_name, field_name);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(setting_category);
CREATE INDEX IF NOT EXISTS idx_system_settings_active ON system_settings(is_active);
CREATE INDEX IF NOT EXISTS idx_dropdown_options_group ON dropdown_options(option_group);
CREATE INDEX IF NOT EXISTS idx_dropdown_options_parent ON dropdown_options(parent_option_value);
CREATE INDEX IF NOT EXISTS idx_form_configurations_form ON form_configurations(form_name);
CREATE INDEX IF NOT EXISTS idx_form_configurations_field ON form_configurations(field_name);
CREATE INDEX IF NOT EXISTS idx_quick_actions_category ON quick_actions(action_category);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_type ON dashboard_widgets(widget_type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON notification_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_workflow_configurations_trigger ON workflow_configurations(trigger_event);

-- ============================================================
-- SAMPLE / DEFAULT DATA
-- ============================================================

-- System settings with pre-configured values
INSERT INTO system_settings (setting_key, setting_name, setting_category, setting_type, setting_value, default_value, description, display_options, is_required) VALUES
-- General Settings
('company_name', 'Company Name', 'GENERAL', 'TEXT', 'ARIS Healthcare', 'ARIS Healthcare', 'Company name for reports and documents', '{"placeholder": "Enter company name", "maxLength": 100}', true),
('company_address', 'Company Address', 'GENERAL', 'TEXTAREA', '123 Medical Complex, Healthcare City', '123 Medical Complex, Healthcare City', 'Company address for invoices and reports', '{"placeholder": "Enter company address", "rows": 3}', false),
('company_phone', 'Company Phone', 'GENERAL', 'TEXT', '+91-9876543210', '+91-9876543210', 'Company phone number', '{"placeholder": "Enter phone number", "pattern": "^[+]?[0-9]{10,15}$"}', false),
('company_email', 'Company Email', 'GENERAL', 'EMAIL', 'info@arishealthcare.com', 'info@arishealthcare.com', 'Company email address', '{"placeholder": "Enter email address"}', false),
('company_website', 'Company Website', 'GENERAL', 'TEXT', 'www.arishealthcare.com', 'www.arishealthcare.com', 'Company website', '{"placeholder": "Enter website URL"}', false),
('logo_url', 'Company Logo', 'GENERAL', 'TEXT', '/uploads/logo.png', '/uploads/logo.png', 'Company logo file path', '{"type": "file", "accept": "image/*"}', false),

-- Financial Settings
('default_currency', 'Default Currency', 'FINANCIAL', 'SELECT', 'INR', 'INR', 'Default currency for financial transactions', '{"options": [{"value": "INR", "label": "Indian Rupee (₹)"}, {"value": "USD", "label": "US Dollar ($)"}, {"value": "EUR", "label": "Euro (€)"}]}', true),
('tax_inclusive', 'Tax Inclusive Pricing', 'FINANCIAL', 'BOOLEAN', 'true', 'true', 'Whether prices include tax by default', '{"label": "Include tax in prices"}', false),
('auto_post_journal', 'Auto Post Journal Entries', 'FINANCIAL', 'BOOLEAN', 'false', 'false', 'Automatically post approved journal entries', '{"label": "Auto-post approved entries"}', false),
('approval_threshold', 'Approval Threshold', 'FINANCIAL', 'NUMBER', '10000', '10000', 'Amount requiring approval', '{"min": 0, "step": 1000, "prefix": "₹"}', false),
('fiscal_year_start', 'Fiscal Year Start', 'FINANCIAL', 'SELECT', 'APRIL', 'APRIL', 'Month when fiscal year starts', '{"options": [{"value": "JANUARY", "label": "January"}, {"value": "APRIL", "label": "April"}, {"value": "JULY", "label": "July"}, {"value": "OCTOBER", "label": "October"}]}', true),

-- Asset Management Settings
('asset_depreciation_method', 'Depreciation Method', 'ASSET', 'SELECT', 'STRAIGHT_LINE', 'STRAIGHT_LINE', 'Default depreciation method for assets', '{"options": [{"value": "STRAIGHT_LINE", "label": "Straight Line"}, {"value": "DECLINING_BALANCE", "label": "Declining Balance"}, {"value": "SUM_OF_YEARS", "label": "Sum of Years"}]}', false),
('default_asset_life', 'Default Asset Life', 'ASSET', 'NUMBER', '5', '5', 'Default useful life in years for assets', '{"min": 1, "max": 20, "suffix": " years"}', false),
('maintenance_reminder_days', 'Maintenance Reminder', 'ASSET', 'NUMBER', '7', '7', 'Days before maintenance to send reminder', '{"min": 1, "max": 30, "suffix": " days"}', false),
('loaner_asset_deposit_days', 'Loaner Asset Return Days', 'ASSET', 'NUMBER', '30', '30', 'Default return period for loaner assets', '{"min": 1, "max": 90, "suffix": " days"}', false),

-- Inventory Settings
('low_stock_threshold', 'Low Stock Threshold', 'INVENTORY', 'NUMBER', '20', '20', 'Percentage below which stock is considered low', '{"min": 5, "max": 50, "suffix": "%"}', false),
('auto_reorder_enabled', 'Auto Reorder', 'INVENTORY', 'BOOLEAN', 'true', 'true', 'Automatically create purchase orders for low stock', '{"label": "Enable automatic reordering"}', false),
('expiry_reminder_days', 'Expiry Reminder', 'INVENTORY', 'NUMBER', '30', '30', 'Days before expiry to send reminder', '{"min": 7, "max": 90, "suffix": " days"}', false),
('batch_tracking_enabled', 'Batch Tracking', 'INVENTORY', 'BOOLEAN', 'true', 'true', 'Enable batch number tracking for consumables', '{"label": "Track batch numbers"}', false),

-- Patient Settings
('default_patient_type', 'Default Patient Type', 'PATIENT', 'SELECT', 'OUTPATIENT', 'OUTPATIENT', 'Default patient type for new registrations', '{"options": [{"value": "OUTPATIENT", "label": "Outpatient"}, {"value": "INPATIENT", "label": "Inpatient"}, {"value": "EMERGENCY", "label": "Emergency"}]}', false),
('auto_generate_patient_id', 'Auto Generate Patient ID', 'PATIENT', 'BOOLEAN', 'true', 'true', 'Automatically generate patient IDs', '{"label": "Generate patient IDs automatically"}', false),
('patient_id_prefix', 'Patient ID Prefix', 'PATIENT', 'TEXT', 'PAT', 'PAT', 'Prefix for auto-generated patient IDs', '{"placeholder": "Enter prefix", "maxLength": 10}', false),
('appointment_reminder_hours', 'Appointment Reminder', 'PATIENT', 'NUMBER', '24', '24', 'Hours before appointment to send reminder', '{"min": 1, "max": 72, "suffix": " hours"}', false),

-- Notification Settings
('email_notifications_enabled', 'Email Notifications', 'NOTIFICATION', 'BOOLEAN', 'true', 'true', 'Enable email notifications', '{"label": "Send email notifications"}', false),
('sms_notifications_enabled', 'SMS Notifications', 'NOTIFICATION', 'BOOLEAN', 'true', 'true', 'Enable SMS notifications', '{"label": "Send SMS notifications"}', false),
('notification_email', 'Notification Email', 'NOTIFICATION', 'EMAIL', 'notifications@arishealthcare.com', 'notifications@arishealthcare.com', 'Email address for system notifications', '{"placeholder": "Enter notification email"}', false),
('smtp_server', 'SMTP Server', 'NOTIFICATION', 'TEXT', 'smtp.gmail.com', 'smtp.gmail.com', 'SMTP server for email sending', '{"placeholder": "Enter SMTP server"}', false),

-- Security Settings
('password_min_length', 'Password Min Length', 'SECURITY', 'NUMBER', '8', '8', 'Minimum password length', '{"min": 6, "max": 20, "suffix": " characters"}', false),
('session_timeout', 'Session Timeout', 'SECURITY', 'NUMBER', '30', '30', 'Session timeout in minutes', '{"min": 15, "max": 120, "suffix": " minutes"}', false),
('max_login_attempts', 'Max Login Attempts', 'SECURITY', 'NUMBER', '3', '3', 'Maximum failed login attempts before lockout', '{"min": 3, "max": 10, "suffix": " attempts"}', false),
('two_factor_auth', 'Two Factor Authentication', 'SECURITY', 'BOOLEAN', 'false', 'false', 'Enable two-factor authentication', '{"label": "Require 2FA for login"}', false),

-- UI Settings
('default_theme', 'Default Theme', 'UI', 'SELECT', 'LIGHT', 'LIGHT', 'Default UI theme', '{"options": [{"value": "LIGHT", "label": "Light"}, {"value": "DARK", "label": "Dark"}, {"value": "AUTO", "label": "Auto (System)"}]}', false),
('default_language', 'Default Language', 'UI', 'SELECT', 'ENGLISH', 'ENGLISH', 'Default interface language', '{"options": [{"value": "ENGLISH", "label": "English"}, {"value": "HINDI", "label": "हिंदी"}, {"value": "GUJARATI", "label": "ગુજરાતી"}]}', false),
('items_per_page', 'Items Per Page', 'UI', 'SELECT', '25', '25', 'Default number of items per page in tables', '{"options": [{"value": "10", "label": "10"}, {"value": "25", "label": "25"}, {"value": "50", "label": "50"}, {"value": "100", "label": "100"}]}', false),
('compact_view', 'Compact View', 'UI', 'BOOLEAN', 'false', 'false', 'Use compact view for tables', '{"label": "Show compact table rows"}', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Dropdown options for various fields
INSERT INTO dropdown_options (option_group, option_value, option_label, option_description, sort_order, is_default) VALUES
-- Asset Categories
('asset_category', 'MEDICAL_EQUIPMENT', 'Medical Equipment', 'Medical and diagnostic equipment', 1, true),
('asset_category', 'FURNITURE', 'Furniture', 'Office and hospital furniture', 2, false),
('asset_category', 'COMPUTER', 'Computer Equipment', 'Computers, printers, and IT equipment', 3, false),
('asset_category', 'VEHICLE', 'Vehicle', 'Hospital vehicles and ambulances', 4, false),
('asset_category', 'BUILDING', 'Building', 'Hospital buildings and structures', 5, false),

-- Asset Status
('asset_status', 'ACTIVE', 'Active', 'Asset is in use', 1, true),
('asset_status', 'MAINTENANCE', 'Under Maintenance', 'Asset is being repaired', 2, false),
('asset_status', 'RETIRED', 'Retired', 'Asset is no longer in use', 3, false),
('asset_status', 'DISPOSED', 'Disposed', 'Asset has been disposed', 4, false),

-- Expense Categories
('expense_category', 'MEDICAL_CONSUMABLES', 'Medical Consumables', 'Syringes, gloves, masks, etc.', 1, true),
('expense_category', 'PHARMACEUTICALS', 'Pharmaceuticals', 'Medicines and drugs', 2, false),
('expense_category', 'LAB_SUPPLIES', 'Lab Supplies', 'Lab reagents and test kits', 3, false),
('expense_category', 'OFFICE_SUPPLIES', 'Office Supplies', 'Stationery and office items', 4, false),
('expense_category', 'CLEANING_SUPPLIES', 'Cleaning Supplies', 'Disinfectants and cleaning items', 5, false),
('expense_category', 'FOOD_BEVERAGES', 'Food & Beverages', 'Patient meals and refreshments', 6, false),

-- Units of Measure
('unit_of_measure', 'PIECES', 'Pieces', 'Individual items', 1, true),
('unit_of_measure', 'BOXES', 'Boxes', 'Packaged in boxes', 2, false),
('unit_of_measure', 'BOTTLES', 'Bottles', 'Liquid items in bottles', 3, false),
('unit_of_measure', 'PACKETS', 'Packets', 'Packaged items', 4, false),
('unit_of_measure', 'KGS', 'Kilograms', 'Weight in kilograms', 5, false),
('unit_of_measure', 'LITERS', 'Liters', 'Volume in liters', 6, false),
('unit_of_measure', 'SETS', 'Sets', 'Item sets', 7, false),

-- Priority Levels
('priority', 'LOW', 'Low', 'Low priority', 1, false),
('priority', 'NORMAL', 'Normal', 'Normal priority', 2, true),
('priority', 'HIGH', 'High', 'High priority', 3, false),
('priority', 'URGENT', 'Urgent', 'Urgent priority', 4, false),

-- Document Types
('document_type', 'INVOICE', 'Invoice', 'Commercial invoice', 1, true),
('document_type', 'RECEIPT', 'Receipt', 'Payment receipt', 2, false),
('document_type', 'PURCHASE_ORDER', 'Purchase Order', 'Purchase order document', 3, false),
('document_type', 'DELIVERY_NOTE', 'Delivery Note', 'Goods delivery note', 4, false),
('document_type', 'WARRANTY', 'Warranty', 'Product warranty document', 5, false),
('document_type', 'MANUAL', 'Manual', 'User manual or guide', 6, false),

-- Payment Methods
('payment_method', 'CASH', 'Cash', 'Cash payment', 1, true),
('payment_method', 'CARD', 'Card', 'Credit/Debit card', 2, false),
('payment_method', 'BANK_TRANSFER', 'Bank Transfer', 'Bank transfer/NEFT/RTGS', 3, false),
('payment_method', 'UPI', 'UPI', 'UPI payment', 4, false),
('payment_method', 'CHEQUE', 'Cheque', 'Cheque payment', 5, false),
('payment_method', 'INSURANCE', 'Insurance', 'Insurance payment', 6, false),

-- Patient Types
('patient_type', 'OUTPATIENT', 'Outpatient', 'Outpatient visit', 1, true),
('patient_type', 'INPATIENT', 'Inpatient', 'Admitted patient', 2, false),
('patient_type', 'EMERGENCY', 'Emergency', 'Emergency case', 3, false),
('patient_type', 'REFERRED', 'Referred', 'Referred patient', 4, false),

-- Appointment Types
('appointment_type', 'CONSULTATION', 'Consultation', 'Doctor consultation', 1, true),
('appointment_type', 'FOLLOWUP', 'Follow-up', 'Follow-up visit', 2, false),
('appointment_type', 'DIAGNOSTIC', 'Diagnostic', 'Diagnostic test', 3, false),
('appointment_type', 'PROCEDURE', 'Procedure', 'Medical procedure', 4, false),
('appointment_type', 'VACCINATION', 'Vaccination', 'Vaccination appointment', 5, false),

-- Report Formats
('report_format', 'PDF', 'PDF', 'PDF document format', 1, true),
('report_format', 'EXCEL', 'Excel', 'Excel spreadsheet format', 2, false),
('report_format', 'CSV', 'CSV', 'CSV data format', 3, false),
('report_format', 'WORD', 'Word', 'Word document format', 4, false),

-- Time Zones
('timezone', 'Asia/Kolkata', 'India Standard Time', 'IST (UTC+5:30)', 1, true),
('timezone', 'Asia/Dubai', 'Gulf Standard Time', 'GST (UTC+4:00)', 2, false),
('timezone', 'Europe/London', 'Greenwich Mean Time', 'GMT (UTC+0:00)', 3, false),
('timezone', 'America/New_York', 'Eastern Time', 'EST (UTC-5:00)', 4, false),

-- Languages
('language', 'EN', 'English', 'English language', 1, true),
('language', 'HI', 'हिंदी', 'Hindi language', 2, false),
('language', 'GU', 'ગુજરાતી', 'Gujarati language', 3, false),
('language', 'MR', 'मराठी', 'Marathi language', 4, false),

-- Blood Groups
('blood_group', 'A_POSITIVE', 'A+', 'A Positive blood group', 1, false),
('blood_group', 'A_NEGATIVE', 'A-', 'A Negative blood group', 2, false),
('blood_group', 'B_POSITIVE', 'B+', 'B Positive blood group', 3, false),
('blood_group', 'B_NEGATIVE', 'B-', 'B Negative blood group', 4, false),
('blood_group', 'AB_POSITIVE', 'AB+', 'AB Positive blood group', 5, false),
('blood_group', 'AB_NEGATIVE', 'AB-', 'AB Negative blood group', 6, false),
('blood_group', 'O_POSITIVE', 'O+', 'O Positive blood group', 7, true),
('blood_group', 'O_NEGATIVE', 'O-', 'O Negative blood group', 8, false),

-- Genders
('gender', 'MALE', 'Male', 'Male gender', 1, true),
('gender', 'FEMALE', 'Female', 'Female gender', 2, false),
('gender', 'OTHER', 'Other', 'Other gender', 3, false),

-- Marital Status
('marital_status', 'SINGLE', 'Single', 'Single marital status', 1, true),
('marital_status', 'MARRIED', 'Married', 'Married marital status', 2, false),
('marital_status', 'DIVORCED', 'Divorced', 'Divorced marital status', 3, false),
('marital_status', 'WIDOWED', 'Widowed', 'Widowed marital status', 4, false)
ON CONFLICT (option_group, option_value) DO NOTHING;

-- Form configurations
INSERT INTO form_configurations (form_name, field_name, field_type, field_label, field_options, is_required, display_order) VALUES
-- Asset Form
('asset_form', 'asset_code', 'TEXT', 'Asset Code', '{"placeholder": "Enter asset code", "prefix": "AST-", "maxLength": 20}', true, 1),
('asset_form', 'asset_name', 'TEXT', 'Asset Name', '{"placeholder": "Enter asset name", "maxLength": 100}', true, 2),
('asset_form', 'asset_category', 'SELECT', 'Asset Category', '{"optionGroup": "asset_category", "placeholder": "Select category"}', true, 3),
('asset_form', 'asset_type', 'SELECT', 'Asset Type', '{"optionGroup": "asset_type", "placeholder": "Select type"}', true, 4),
('asset_form', 'status', 'SELECT', 'Status', '{"optionGroup": "asset_status", "defaultValue": "ACTIVE"}', true, 5),
('asset_form', 'purchase_date', 'DATE', 'Purchase Date', '{"placeholder": "Select purchase date", "maxDate": "today"}', true, 6),
('asset_form', 'purchase_cost', 'NUMBER', 'Purchase Cost', '{"placeholder": "Enter amount", "prefix": "₹", "min": 0}', true, 7),
('asset_form', 'vendor_id', 'SELECT', 'Vendor', '{"optionGroup": "vendors", "placeholder": "Select vendor", "searchable": true}', false, 8),
('asset_form', 'warranty_expiry', 'DATE', 'Warranty Expiry', '{"placeholder": "Select expiry date", "minDate": "today"}', false, 9),
('asset_form', 'location', 'TEXT', 'Location', '{"placeholder": "Enter location", "maxLength": 100}', false, 10),
('asset_form', 'assigned_to', 'TEXT', 'Assigned To', '{"placeholder": "Enter assigned person", "maxLength": 100}', false, 11),

-- Expense Item Form
('expense_item_form', 'item_code', 'TEXT', 'Item Code', '{"placeholder": "Enter item code", "prefix": "ITM-", "maxLength": 20}', true, 1),
('expense_item_form', 'item_name', 'TEXT', 'Item Name', '{"placeholder": "Enter item name", "maxLength": 100}', true, 2),
('expense_item_form', 'category_id', 'SELECT', 'Category', '{"optionGroup": "expense_categories", "placeholder": "Select category"}', true, 3),
('expense_item_form', 'unit_of_measure', 'SELECT', 'Unit of Measure', '{"optionGroup": "unit_of_measure", "placeholder": "Select unit"}', true, 4),
('expense_item_form', 'current_stock', 'NUMBER', 'Current Stock', '{"placeholder": "Enter current stock", "min": 0}', true, 5),
('expense_item_form', 'minimum_stock', 'NUMBER', 'Minimum Stock Level', '{"placeholder": "Enter minimum stock", "min": 0}', true, 6),
('expense_item_form', 'maximum_stock', 'NUMBER', 'Maximum Stock Level', '{"placeholder": "Enter maximum stock", "min": 0}', false, 7),
('expense_item_form', 'reorder_quantity', 'NUMBER', 'Reorder Quantity', '{"placeholder": "Enter reorder quantity", "min": 0}', false, 8),
('expense_item_form', 'vendor_id', 'SELECT', 'Preferred Vendor', '{"optionGroup": "vendors", "placeholder": "Select vendor", "searchable": true}', false, 9),
('expense_item_form', 'unit_price', 'NUMBER', 'Unit Price', '{"placeholder": "Enter unit price", "prefix": "₹", "min": 0}', false, 10),
('expense_item_form', 'storage_location', 'TEXT', 'Storage Location', '{"placeholder": "Enter storage location", "maxLength": 100}', false, 11),

-- Patient Form
('patient_form', 'patient_id', 'TEXT', 'Patient ID', '{"placeholder": "Auto-generated", "readonly": true, "prefix": "PAT-"}', true, 1),
('patient_form', 'first_name', 'TEXT', 'First Name', '{"placeholder": "Enter first name", "maxLength": 50}', true, 2),
('patient_form', 'last_name', 'TEXT', 'Last Name', '{"placeholder": "Enter last name", "maxLength": 50}', true, 3),
('patient_form', 'gender', 'SELECT', 'Gender', '{"optionGroup": "gender", "placeholder": "Select gender"}', true, 4),
('patient_form', 'date_of_birth', 'DATE', 'Date of Birth', '{"placeholder": "Select date of birth", "maxDate": "today"}', true, 5),
('patient_form', 'blood_group', 'SELECT', 'Blood Group', '{"optionGroup": "blood_group", "placeholder": "Select blood group"}', false, 6),
('patient_form', 'phone', 'TEXT', 'Phone Number', '{"placeholder": "Enter phone number", "pattern": "^[+]?[0-9]{10,15}$"}', true, 7),
('patient_form', 'email', 'EMAIL', 'Email Address', '{"placeholder": "Enter email address"}', false, 8),
('patient_form', 'address', 'TEXTAREA', 'Address', '{"placeholder": "Enter address", "rows": 3}', false, 9),
('patient_form', 'patient_type', 'SELECT', 'Patient Type', '{"optionGroup": "patient_type", "defaultValue": "OUTPATIENT"}', false, 10),

-- Vendor Form
('vendor_form', 'vendor_name', 'TEXT', 'Vendor Name', '{"placeholder": "Enter vendor name", "maxLength": 100}', true, 1),
('vendor_form', 'vendor_type', 'SELECT', 'Vendor Type', '{"optionGroup": "vendor_types", "placeholder": "Select type"}', true, 2),
('vendor_form', 'contact_person', 'TEXT', 'Contact Person', '{"placeholder": "Enter contact person", "maxLength": 100}', true, 3),
('vendor_form', 'phone', 'TEXT', 'Phone Number', '{"placeholder": "Enter phone number", "pattern": "^[+]?[0-9]{10,15}$"}', true, 4),
('vendor_form', 'email', 'EMAIL', 'Email Address', '{"placeholder": "Enter email address"}', false, 5),
('vendor_form', 'address', 'TEXTAREA', 'Address', '{"placeholder": "Enter address", "rows": 3}', false, 6),
('vendor_form', 'gst_number', 'TEXT', 'GST Number', '{"placeholder": "Enter GST number", "pattern": "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9]$"}', false, 7),
('vendor_form', 'payment_terms', 'SELECT', 'Payment Terms', '{"optionGroup": "payment_terms", "defaultValue": "NET30"}', false, 8),

-- Journal Entry Form
('journal_entry_form', 'entry_date', 'DATE', 'Entry Date', '{"placeholder": "Select entry date", "defaultValue": "today"}', true, 1),
('journal_entry_form', 'transaction_type', 'SELECT', 'Transaction Type', '{"optionGroup": "transaction_types", "placeholder": "Select type"}', true, 2),
('journal_entry_form', 'reference_type', 'SELECT', 'Reference Type', '{"optionGroup": "reference_types", "placeholder": "Select reference"}', false, 3),
('journal_entry_form', 'reference_id', 'TEXT', 'Reference ID', '{"placeholder": "Enter reference ID"}', false, 4),
('journal_entry_form', 'description', 'TEXTAREA', 'Description', '{"placeholder": "Enter description", "rows": 3}', true, 5),
('journal_entry_form', 'center_id', 'SELECT', 'Center', '{"optionGroup": "centers", "placeholder": "Select center"}', false, 6),
('journal_entry_form', 'department_id', 'SELECT', 'Department', '{"optionGroup": "departments", "placeholder": "Select department"}', false, 7)
ON CONFLICT (form_name, field_name) DO NOTHING;

-- Quick actions
INSERT INTO quick_actions (action_name, action_category, action_description, action_icon, action_color, target_module, target_action, sort_order) VALUES
('Add New Asset', 'ASSET', 'Add a new asset to the system', 'plus-circle', 'green', 'assets', 'create', 1),
('Add Expense Item', 'EXPENSE', 'Add new expense item/consumable', 'package', 'blue', 'expenses', 'create', 2),
('Register Patient', 'PATIENT', 'Register a new patient', 'user-plus', 'purple', 'patients', 'create', 3),
('Create Journal Entry', 'FINANCIAL', 'Create a new journal entry', 'book', 'orange', 'accounting', 'create', 4),
('Add Vendor', 'PROCUREMENT', 'Add a new vendor', 'truck', 'red', 'vendors', 'create', 5),
('Schedule Appointment', 'CLINICAL', 'Schedule patient appointment', 'calendar', 'teal', 'appointments', 'create', 6),
('Generate Report', 'REPORTS', 'Generate system reports', 'file-text', 'indigo', 'reports', 'list', 7),
('View Dashboard', 'DASHBOARD', 'View main dashboard', 'dashboard', 'gray', 'dashboard', 'view', 8),
('Asset Maintenance', 'ASSET', 'Record asset maintenance', 'wrench', 'yellow', 'assets', 'maintenance', 9),
('Stock Replenishment', 'INVENTORY', 'Replenish low stock items', 'refresh-cw', 'cyan', 'inventory', 'reorder', 10),
('Loaner Asset Assignment', 'ASSET', 'Assign loaner asset', 'share', 'pink', 'loaner-assets', 'assign', 11),
('Patient Billing', 'FINANCIAL', 'Create patient bill', 'receipt', 'emerald', 'billing', 'create', 12)
ON CONFLICT (action_name) DO NOTHING;

-- Dashboard widgets
INSERT INTO dashboard_widgets (widget_name, widget_type, widget_title, widget_description, widget_config, data_source, default_position, default_size, is_default) VALUES
('Total Assets', 'METRIC', 'Total Assets', 'Total number of assets in the system', '{"icon": "box", "color": "blue"}', '/api/assets/count', '{"x": 0, "y": 0, "w": 3, "h": 2}', '{"width": 3, "height": 2}', true),
('Active Patients', 'METRIC', 'Active Patients', 'Number of active patients', '{"icon": "users", "color": "green"}', '/api/patients/active-count', '{"x": 3, "y": 0, "w": 3, "h": 2}', '{"width": 3, "height": 2}', true),
('Low Stock Alerts', 'METRIC', 'Low Stock Alerts', 'Items with low stock levels', '{"icon": "alert-triangle", "color": "red"}', '/api/inventory/low-stock-count', '{"x": 6, "y": 0, "w": 3, "h": 2}', '{"width": 3, "height": 2}', true),
('Pending Approvals', 'METRIC', 'Pending Approvals', 'Items requiring approval', '{"icon": "clock", "color": "orange"}', '/api/approvals/pending-count', '{"x": 9, "y": 0, "w": 3, "h": 2}', '{"width": 3, "height": 2}', true),
('Asset Status Chart', 'CHART', 'Asset Status', 'Chart showing asset status distribution', '{"chartType": "pie", "colors": ["#10b981", "#f59e0b", "#ef4444", "#6b7280"]}', '/api/assets/status-chart', '{"x": 0, "y": 2, "w": 6, "h": 4}', '{"width": 6, "height": 4}', true),
('Expense Trend', 'CHART', 'Expense Trend', 'Monthly expense trend', '{"chartType": "line", "colors": ["#3b82f6"]}', '/api/expenses/trend', '{"x": 6, "y": 2, "w": 6, "h": 4}', '{"width": 6, "height": 4}', true),
('Recent Activities', 'TABLE', 'Recent Activities', 'Recent system activities', '{"columns": ["date", "action", "user", "details"], "pageSize": 10}', '/api/activities/recent', '{"x": 0, "y": 6, "w": 12, "h": 3}', '{"width": 12, "height": 3}', true),
('Upcoming Maintenance', 'TABLE', 'Upcoming Maintenance', 'Assets requiring maintenance soon', '{"columns": ["asset", "due_date", "type", "priority"], "pageSize": 5}', '/api/assets/upcoming-maintenance', '{"x": 0, "y": 9, "w": 6, "h": 3}', '{"width": 6, "height": 3}', true),
('Loaner Asset Status', 'TABLE', 'Loaner Assets', 'Current loaner asset assignments', '{"columns": ["asset", "assigned_to", "due_date", "status"], "pageSize": 5}', '/api/loaner-assets/status', '{"x": 6, "y": 9, "w": 6, "h": 3}', '{"width": 6, "height": 3}', true)
ON CONFLICT (widget_name) DO NOTHING;

-- Notification templates
INSERT INTO notification_templates (template_name, template_type, template_category, subject_template, message_template, template_variables) VALUES
('asset_maintenance_due', 'EMAIL', 'ASSET', 'Asset Maintenance Due',
'Dear {user_name},

This is a reminder that the asset "{asset_name}" ({asset_code}) is due for maintenance on {maintenance_date}.

Asset Details:
- Name: {asset_name}
- Code: {asset_code}
- Location: {location}
- Last Maintenance: {last_maintenance_date}

Please schedule the maintenance at your earliest convenience.

Regards,
ARIS Healthcare System',
'{"user_name": "User name", "asset_name": "Asset name", "asset_code": "Asset code", "maintenance_date": "Maintenance date", "location": "Location", "last_maintenance_date": "Last maintenance date"}'),

('low_stock_alert', 'EMAIL', 'INVENTORY', 'Low Stock Alert',
'Dear {user_name},

The following item is running low on stock:

Item: {item_name}
Current Stock: {current_stock} {unit_of_measure}
Minimum Stock: {minimum_stock} {unit_of_measure}
Recommended Order: {reorder_quantity} {unit_of_measure}

Please reorder this item soon to avoid stockouts.

Regards,
ARIS Healthcare System',
'{"user_name": "User name", "item_name": "Item name", "current_stock": "Current stock", "unit_of_measure": "Unit of measure", "minimum_stock": "Minimum stock", "reorder_quantity": "Reorder quantity"}'),

('loaner_asset_overdue', 'EMAIL', 'ASSET', 'Loaner Asset Overdue',
'Dear {user_name},

The following loaner asset is overdue for return:

Asset: {asset_name}
Assigned to: {assigned_to}
Due Date: {due_date}
Days Overdue: {days_overdue}
Deposit Amount: ₹{deposit_amount}

Please follow up with the assignee for the return of this asset.

Regards,
ARIS Healthcare System',
'{"user_name": "User name", "asset_name": "Asset name", "assigned_to": "Assigned to", "due_date": "Due date", "days_overdue": "Days overdue", "deposit_amount": "Deposit amount"}'),

('appointment_reminder', 'SMS', 'PATIENT', 'Appointment Reminder',
'Dear {patient_name}, this is a reminder for your appointment on {appointment_date} at {appointment_time} with {doctor_name}. Please arrive 15 minutes early. For any changes, call {phone_number}.',
'{"patient_name": "Patient name", "appointment_date": "Appointment date", "appointment_time": "Appointment time", "doctor_name": "Doctor name", "phone_number": "Phone number"}'),

('journal_entry_approval', 'EMAIL', 'FINANCIAL', 'Journal Entry Approval Required',
'Dear {approver_name},

A journal entry requires your approval:

Entry Number: {entry_number}
Date: {entry_date}
Amount: ₹{total_amount}
Description: {description}
Created by: {created_by}

Please review and approve at your earliest convenience.

Regards,
ARIS Healthcare System',
'{"approver_name": "Approver name", "entry_number": "Entry number", "entry_date": "Entry date", "total_amount": "Total amount", "description": "Description", "created_by": "Created by"}')
ON CONFLICT (template_name) DO NOTHING;

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW user_friendly_settings AS
SELECT
    ss.setting_key,
    ss.setting_name,
    ss.setting_category,
    ss.setting_type,
    ss.setting_value,
    ss.default_value,
    ss.description,
    ss.display_options,
    ss.is_required,
    ss.sort_order,
    CASE
        WHEN ss.setting_type = 'SELECT' THEN json_extract_path_text(ss.display_options::json, 'options')
        WHEN ss.setting_type = 'BOOLEAN' THEN CASE WHEN ss.setting_value = 'true' THEN 'Yes' ELSE 'No' END
        WHEN ss.setting_type = 'NUMBER' THEN ss.setting_value
        ELSE ss.setting_value
    END as display_value
FROM system_settings ss
WHERE ss.is_active = true
ORDER BY ss.setting_category, ss.sort_order;

CREATE OR REPLACE VIEW dropdown_options_view AS
SELECT
    dopt.option_group,
    dopt.option_value,
    dopt.option_label,
    dopt.option_description,
    dopt.parent_option_value,
    dopt.sort_order,
    dopt.is_default,
    CASE
        WHEN dopt.parent_option_value IS NOT NULL THEN
            (SELECT option_label FROM dropdown_options WHERE option_group = dopt.option_group AND option_value = dopt.parent_option_value)
        ELSE NULL
    END as parent_label
FROM dropdown_options dopt
WHERE dopt.is_active = true
ORDER BY dopt.option_group, dopt.parent_option_value NULLS FIRST, dopt.sort_order;

-- ============================================================
-- TABLE COMMENTS
-- ============================================================

COMMENT ON TABLE system_settings IS 'System-wide configuration settings with pre-configured values';
COMMENT ON TABLE user_preferences IS 'User-specific preferences and settings';
COMMENT ON TABLE center_settings IS 'Center-specific configuration settings';
COMMENT ON TABLE department_settings IS 'Department-specific configuration settings';
COMMENT ON TABLE dropdown_options IS 'Pre-configured dropdown options for forms';
COMMENT ON TABLE form_configurations IS 'Form field configurations with validation and options';
COMMENT ON TABLE quick_actions IS 'Quick action buttons for easy navigation';
COMMENT ON TABLE dashboard_widgets IS 'Dashboard widget configurations';
COMMENT ON TABLE notification_templates IS 'Pre-configured notification templates';
COMMENT ON TABLE workflow_configurations IS 'Workflow configurations for business processes';
