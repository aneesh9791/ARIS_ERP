-- Update GST Schema for Service-Specific GST Configuration and CD Printing Support
-- This migration adds comprehensive GST management capabilities

-- Update study_master table to include GST configuration
ALTER TABLE study_master 
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,4) DEFAULT 0.1800,
ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS cess_rate DECIMAL(5,4) DEFAULT 0.0000,
ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8),
ADD COLUMN IF NOT EXISTS sac_code VARCHAR(8),
ADD COLUMN IF NOT EXISTS gst_applicable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS tax_category VARCHAR(50) DEFAULT 'STANDARD';

-- Update accounting_bills table to include payment source and GST details
ALTER TABLE accounting_bills 
ADD COLUMN IF NOT EXISTS payment_source VARCHAR(20) DEFAULT 'PATIENT',
ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS customer_state VARCHAR(50),
ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50),
ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) DEFAULT 'TAX_INVOICE',
ADD COLUMN IF NOT EXISTS e_commerce_gstin VARCHAR(15);

-- Update accounting_bill_items table to include detailed GST information
ALTER TABLE accounting_bill_items 
ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8),
ADD COLUMN IF NOT EXISTS sac_code VARCHAR(8),
ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,4) DEFAULT 0.1800,
ADD COLUMN IF NOT EXISTS cess_rate DECIMAL(5,4) DEFAULT 0.0000;

-- Add constraints for GST rates
ALTER TABLE study_master 
ADD CONSTRAINT chk_study_gst_rate CHECK (gst_rate >= 0 AND gst_rate <= 0.28),
ADD CONSTRAINT chk_study_cess_rate CHECK (cess_rate >= 0 AND cess_rate <= 0.28);

ALTER TABLE accounting_bill_items 
ADD CONSTRAINT chk_item_gst_rate CHECK (gst_rate >= 0 AND gst_rate <= 0.28),
ADD CONSTRAINT chk_item_cess_rate CHECK (cess_rate >= 0 AND cess_rate <= 0.28);

-- Create indexes for GST reporting
CREATE INDEX IF NOT EXISTS idx_study_master_gst ON study_master(gst_applicable, is_taxable, gst_rate);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_gst ON accounting_bills(payment_source, bill_date, billing_status);
CREATE INDEX IF NOT EXISTS idx_bill_items_gst ON accounting_bill_items(gst_rate, is_taxable, hsn_code, sac_code);
CREATE INDEX IF NOT EXISTS idx_payments_gst ON accounting_payments(payment_date, payment_method, bill_id);

-- Create or update tax_configuration table
CREATE TABLE IF NOT EXISTS tax_configuration (
    id SERIAL PRIMARY KEY,
    hsn_code VARCHAR(8),
    sac_code VARCHAR(8),
    gst_percentage DECIMAL(5,4) NOT NULL,
    cess_percentage DECIMAL(5,4) DEFAULT 0.0000,
    is_reverse_charge_applicable BOOLEAN DEFAULT false,
    gst_type VARCHAR(20) DEFAULT 'SERVICES',
    description TEXT,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT tax_config_unique UNIQUE (hsn_code, sac_code, effective_from),
    CONSTRAINT tax_config_gst_rate CHECK (gst_percentage >= 0 AND gst_percentage <= 0.28),
    CONSTRAINT tax_config_cess_rate CHECK (cess_percentage >= 0 AND cess_percentage <= 0.28)
);

-- Create gst_reports table for storing generated reports
CREATE TABLE IF NOT EXISTS gst_reports (
    id SERIAL PRIMARY KEY,
    report_type VARCHAR(20) NOT NULL,
    report_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    report_data JSONB,
    file_path VARCHAR(500),
    generated_by INTEGER REFERENCES users(id),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'GENERATED',
    
    CONSTRAINT gst_reports_type CHECK (report_type IN ('GSTR1', 'GSTR3B', 'GST_SUMMARY', 'GST_PAID', 'GST_ARIS_PAID'))
);

-- Create gst_audit_log table for GST-specific audit trail
CREATE TABLE IF NOT EXISTS gst_audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL,
    entity_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id INTEGER REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT gst_audit_entity_type CHECK (entity_type IN ('STUDY_MASTER', 'TAX_CONFIG', 'ACCOUNTING_BILL', 'BILL_ITEM'))
);

-- Insert default tax configurations
INSERT INTO tax_configuration (hsn_code, sac_code, gst_percentage, cess_percentage, gst_type, description) VALUES
('998313', NULL, 0.1800, 0.0000, 'SERVICES', 'Diagnostic and pathology services'),
('998314', NULL, 0.1800, 0.0000, 'SERVICES', 'Radiology services'),
('998315', NULL, 0.1800, 0.0000, 'SERVICES', 'Laboratory services'),
('998316', NULL, 0.0000, 0.0000, 'SERVICES', 'Healthcare services - GST exempt'),
('8523', NULL, 0.1800, 0.0000, 'GOODS', 'CD/DVD/Other recording media'),
('998311', NULL, 0.1800, 0.0000, 'SERVICES', 'Consulting services'),
('998312', NULL, 0.1800, 0.0000, 'SERVICES', 'Medical services')
ON CONFLICT (hsn_code, sac_code, effective_from) 
DO UPDATE SET 
    gst_percentage = EXCLUDED.gst_percentage,
    cess_percentage = EXCLUDED.cess_percentage,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

-- Add CD printing service to study_master
INSERT INTO study_master (
    study_code, study_name, study_type, base_rate, gst_rate, 
    is_taxable, cess_rate, hsn_code, sac_code, category, 
    gst_applicable, tax_category, active, created_at, updated_at
) VALUES (
    'CD_PRINT', 'CD Printing', 'SERVICE', 50.00, 0.1800, 
    true, 0.0000, '8523', '998313', 'MEDIA', 
    true, 'STANDARD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (study_code) DO UPDATE SET
    gst_rate = EXCLUDED.gst_rate,
    is_taxable = EXCLUDED.is_taxable,
    hsn_code = EXCLUDED.hsn_code,
    sac_code = EXCLUDED.sac_code,
    gst_applicable = EXCLUDED.gst_applicable,
    updated_at = CURRENT_TIMESTAMP;

-- Add scanning service (GST exempt)
INSERT INTO study_master (
    study_code, study_name, study_type, base_rate, gst_rate, 
    is_taxable, cess_rate, hsn_code, sac_code, category, 
    gst_applicable, tax_category, active, created_at, updated_at
) VALUES (
    'SCAN', 'Document Scanning', 'SERVICE', 0.00, 0.0000, 
    false, 0.0000, NULL, '998316', 'DOCUMENT', 
    false, 'EXEMPT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (study_code) DO UPDATE SET
    gst_rate = EXCLUDED.gst_rate,
    is_taxable = EXCLUDED.is_taxable,
    hsn_code = EXCLUDED.hsn_code,
    sac_code = EXCLUDED.sac_code,
    gst_applicable = EXCLUDED.gst_applicable,
    tax_category = EXCLUDED.tax_category,
    updated_at = CURRENT_TIMESTAMP;

-- Update existing services to have default GST configuration
UPDATE study_master 
SET 
    gst_rate = CASE 
        WHEN category IN ('RADIOLOGY', 'PATHOLOGY', 'CARDIOLOGY') THEN 0.1800
        WHEN category IN ('CONSULTATION', 'GENERAL') THEN 0.1800
        ELSE 0.0000
    END,
    is_taxable = CASE 
        WHEN category IN ('RADIOLOGY', 'PATHOLOGY', 'CARDIOLOGY', 'CONSULTATION', 'GENERAL') THEN true
        ELSE false
    END,
    hsn_code = CASE 
        WHEN category = 'RADIOLOGY' THEN '998314'
        WHEN category = 'PATHOLOGY' THEN '998315'
        WHEN category IN ('CONSULTATION', 'GENERAL') THEN '998311'
        WHEN category = 'DOCUMENT' THEN '998316'
        ELSE NULL
    END,
    sac_code = CASE 
        WHEN category IN ('RADIOLOGY', 'PATHOLOGY', 'CARDIOLOGY') THEN '998313'
        WHEN category IN ('CONSULTATION', 'GENERAL') THEN '998312'
        WHEN category = 'DOCUMENT' THEN '998316'
        ELSE NULL
    END,
    gst_applicable = CASE 
        WHEN category IN ('RADIOLOGY', 'PATHOLOGY', 'CARDIOLOGY', 'CONSULTATION', 'GENERAL') THEN true
        ELSE false
    END,
    tax_category = CASE 
        WHEN is_taxable = true THEN 'STANDARD'
        ELSE 'EXEMPT'
    END
WHERE gst_rate IS NULL OR is_taxable IS NULL;

-- Create trigger for updating audit trail
CREATE OR REPLACE FUNCTION gst_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO gst_audit_log (
            entity_type, entity_id, action, old_values, new_values, user_id, ip_address, user_agent, session_id
        ) VALUES (
            TG_TABLE_NAME, NEW.id, 'UPDATE', 
            row_to_json(OLD), row_to_json(NEW),
            current_setting('app.current_user_id', true)::INTEGER,
            current_setting('app.client_ip', true)::INET,
            current_setting('app.user_agent', true),
            current_setting('app.session_id', true)
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO gst_audit_log (
            entity_type, entity_id, action, old_values, new_values, user_id, ip_address, user_agent, session_id
        ) VALUES (
            TG_TABLE_NAME, NEW.id, 'INSERT', 
            NULL, row_to_json(NEW),
            current_setting('app.current_user_id', true)::INTEGER,
            current_setting('app.client_ip', true)::INET,
            current_setting('app.user_agent', true),
            current_setting('app.session_id', true)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO gst_audit_log (
            entity_type, entity_id, action, old_values, new_values, user_id, ip_address, user_agent, session_id
        ) VALUES (
            TG_TABLE_NAME, OLD.id, 'DELETE', 
            row_to_json(OLD), NULL,
            current_setting('app.current_user_id', true)::INTEGER,
            current_setting('app.client_ip', true)::INET,
            current_setting('app.user_agent', true),
            current_setting('app.session_id', true)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for GST audit
CREATE TRIGGER gst_study_master_audit
    AFTER INSERT OR UPDATE OR DELETE ON study_master
    FOR EACH ROW EXECUTE FUNCTION gst_audit_trigger();

CREATE TRIGGER gst_tax_config_audit
    AFTER INSERT OR UPDATE OR DELETE ON tax_configuration
    FOR EACH ROW EXECUTE FUNCTION gst_audit_trigger();

-- Create views for GST reporting
CREATE OR REPLACE VIEW v_gst_summary AS
SELECT 
    DATE_TRUNC('month', bill_date) as month,
    payment_source,
    COUNT(*) as total_bills,
    SUM(subtotal) as total_subtotal,
    SUM(taxable_amount) as total_taxable_amount,
    SUM(cgst_amount) as total_cgst,
    SUM(sgst_amount) as total_sgst,
    SUM(igst_amount) as total_igst,
    SUM(cess_amount) as total_cess,
    SUM(total_amount) as total_amount,
    SUM(amount_paid) as total_paid,
    SUM(balance_amount) as total_balance
FROM accounting_bills
WHERE active = true
GROUP BY DATE_TRUNC('month', bill_date), payment_source
ORDER BY month DESC, payment_source;

CREATE OR REPLACE VIEW v_gst_service_summary AS
SELECT 
    bi.item_code,
    bi.item_name,
    bi.gst_rate,
    bi.is_taxable,
    COUNT(DISTINCT bi.bill_id) as bill_count,
    SUM(bi.quantity) as total_quantity,
    SUM(bi.total_price) as total_revenue,
    SUM(bi.taxable_amount) as total_taxable_amount,
    SUM(bi.cgst_amount) as total_cgst,
    SUM(bi.sgst_amount) as total_sgst,
    SUM(bi.igst_amount) as total_igst,
    SUM(bi.cess_amount) as total_cess,
    SUM(bi.total_amount) as total_amount_with_gst
FROM accounting_bill_items bi
WHERE bi.active = true
GROUP BY bi.item_code, bi.item_name, bi.gst_rate, bi.is_taxable
ORDER BY total_revenue DESC;

CREATE OR REPLACE VIEW v_gst_payment_summary AS
SELECT 
    ap.payment_method,
    ab.payment_source,
    COUNT(*) as transaction_count,
    SUM(ap.amount) as total_amount,
    AVG(ap.amount) as avg_amount,
    MAX(ap.amount) as max_amount,
    MIN(ap.amount) as min_amount
FROM accounting_payments ap
INNER JOIN accounting_bills ab ON ap.bill_id = ab.id
WHERE ap.active = true AND ab.active = true
GROUP BY ap.payment_method, ab.payment_source
ORDER BY total_amount DESC;

-- Create function to calculate GST for bill items
CREATE OR REPLACE FUNCTION calculate_bill_item_gst(
    p_item_code VARCHAR(20),
    p_quantity INTEGER,
    p_unit_price DECIMAL(10,2),
    p_discount_percentage DECIMAL(5,2)
) RETURNS TABLE(
    taxable_amount DECIMAL(10,2),
    gst_rate DECIMAL(5,4),
    cgst_amount DECIMAL(10,2),
    sgst_amount DECIMAL(10,2),
    igst_amount DECIMAL(10,2),
    cess_amount DECIMAL(10,2),
    total_amount DECIMAL(10,2)
) AS $$
DECLARE
    v_service_record RECORD;
    v_total_price DECIMAL(10,2);
    v_discount_amount DECIMAL(10,2);
    v_taxable_amount DECIMAL(10,2);
    v_gst_amount DECIMAL(10,2);
    v_cess_amount DECIMAL(10,2);
BEGIN
    -- Get service configuration
    SELECT sm.gst_rate, sm.is_taxable, sm.cess_rate
    INTO v_service_record
    FROM study_master sm
    WHERE sm.study_code = p_item_code AND sm.active = true;
    
    -- Calculate total price
    v_total_price := p_quantity * p_unit_price;
    
    -- Calculate discount
    v_discount_amount := v_total_price * (p_discount_percentage / 100);
    
    -- Calculate taxable amount
    IF v_service_record.is_taxable THEN
        v_taxable_amount := v_total_price - v_discount_amount;
    ELSE
        v_taxable_amount := 0;
    END IF;
    
    -- Calculate GST amounts
    IF v_service_record.is_taxable THEN
        v_gst_amount := v_taxable_amount * v_service_record.gst_rate;
        v_cess_amount := v_taxable_amount * v_service_record.cess_rate;
    ELSE
        v_gst_amount := 0;
        v_cess_amount := 0;
    END IF;
    
    -- Return results
    RETURN QUERY SELECT 
        v_taxable_amount,
        v_service_record.gst_rate,
        v_gst_amount / 2, -- CGST
        v_gst_amount / 2, -- SGST
        0, -- IGST (for intra-state)
        v_cess_amount,
        v_total_price - v_discount_amount + v_gst_amount + v_cess_amount;
END;
$$ LANGUAGE plpgsql;

-- Create function to update bill GST totals
CREATE OR REPLACE FUNCTION update_bill_gst_totals(p_bill_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_bill_totals RECORD;
BEGIN
    -- Calculate bill totals from items
    SELECT 
        SUM(bi.total_price) as subtotal,
        SUM(bi.discount_amount) as discount_amount,
        SUM(bi.taxable_amount) as taxable_amount,
        SUM(bi.cgst_amount) as cgst_amount,
        SUM(bi.sgst_amount) as sgst_amount,
        SUM(bi.igst_amount) as igst_amount,
        SUM(bi.cess_amount) as cess_amount
    INTO v_bill_totals
    FROM accounting_bill_items bi
    WHERE bi.bill_id = p_bill_id AND bi.active = true;
    
    -- Update bill totals
    UPDATE accounting_bills 
    SET 
        subtotal = COALESCE(v_bill_totals.subtotal, 0),
        discount_amount = COALESCE(v_bill_totals.discount_amount, 0),
        taxable_amount = COALESCE(v_bill_totals.taxable_amount, 0),
        cgst_amount = COALESCE(v_bill_totals.cgst_amount, 0),
        sgst_amount = COALESCE(v_bill_totals.sgst_amount, 0),
        igst_amount = COALESCE(v_bill_totals.igst_amount, 0),
        cess_amount = COALESCE(v_bill_totals.cess_amount, 0),
        total_amount = COALESCE(v_bill_totals.subtotal, 0) - COALESCE(v_bill_totals.discount_amount, 0) + 
                      COALESCE(v_bill_totals.cgst_amount, 0) + COALESCE(v_bill_totals.sgst_amount, 0) + 
                      COALESCE(v_bill_totals.igst_amount, 0) + COALESCE(v_bill_totals.cess_amount, 0),
        balance_amount = (COALESCE(v_bill_totals.subtotal, 0) - COALESCE(v_bill_totals.discount_amount, 0) + 
                         COALESCE(v_bill_totals.cgst_amount, 0) + COALESCE(v_bill_totals.sgst_amount, 0) + 
                         COALESCE(v_bill_totals.igst_amount, 0) + COALESCE(v_bill_totals.cess_amount, 0)) - amount_paid,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_bill_id;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update bill GST totals
CREATE OR REPLACE FUNCTION trigger_update_bill_gst_totals()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        PERFORM update_bill_gst_totals(NEW.bill_id);
        RETURN COALESCE(NEW, OLD);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_bill_items_gst_update
    AFTER INSERT OR UPDATE OR DELETE ON accounting_bill_items
    FOR EACH ROW EXECUTE FUNCTION trigger_update_bill_gst_totals();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_gst_audit_log_entity ON gst_audit_log(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gst_audit_log_user ON gst_audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tax_config_effective ON tax_configuration(effective_from, effective_to, active);
CREATE INDEX IF NOT EXISTS idx_gst_reports_type_date ON gst_reports(report_type, start_date, end_date);

-- Add comments for documentation
COMMENT ON TABLE tax_configuration IS 'GST tax configuration with HSN/SAC codes and rates';
COMMENT ON TABLE gst_reports IS 'Generated GST reports storage';
COMMENT ON TABLE gst_audit_log IS 'Audit trail for GST-related changes';
COMMENT ON COLUMN study_master.gst_rate IS 'GST rate for this service (0.00 to 0.28)';
COMMENT ON COLUMN study_master.is_taxable IS 'Whether this service is taxable under GST';
COMMENT ON COLUMN study_master.cess_rate IS 'CESS rate for this service';
COMMENT ON COLUMN study_master.hsn_code IS 'HSN code for goods';
COMMENT ON COLUMN study_master.sac_code IS 'SAC code for services';
COMMENT ON COLUMN accounting_bills.payment_source IS 'Source of payment (PATIENT, ARIS, INSURANCE, CORPORATE)';
COMMENT ON COLUMN accounting_bills.customer_gstin IS 'Customer GSTIN number';
COMMENT ON COLUMN accounting_bills.place_of_supply IS 'Place of supply for GST calculation';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON tax_configuration TO billing_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gst_reports TO billing_role;
GRANT SELECT ON gst_audit_log TO billing_role;
GRANT SELECT ON v_gst_summary TO billing_role;
GRANT SELECT ON v_gst_service_summary TO billing_role;
GRANT SELECT ON v_gst_payment_summary TO billing_role;
GRANT EXECUTE ON FUNCTION calculate_bill_item_gst TO billing_role;
GRANT EXECUTE ON FUNCTION update_bill_gst_totals TO billing_role;

-- Create sample data for testing
INSERT INTO study_master (study_code, study_name, study_type, base_rate, gst_rate, is_taxable, cess_rate, hsn_code, sac_code, category, gst_applicable, tax_category, active, created_at, updated_at) VALUES
('XRAY_CHEST', 'Chest X-Ray', 'RADIOLOGY', 500.00, 0.1800, true, 0.0000, '998314', '998313', 'RADIOLOGY', true, 'STANDARD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MRI_BRAIN', 'Brain MRI', 'RADIOLOGY', 8000.00, 0.1800, true, 0.0000, '998314', '998313', 'RADIOLOGY', true, 'STANDARD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CBC_TEST', 'Complete Blood Count', 'PATHOLOGY', 300.00, 0.1800, true, 0.0000, '998315', '998313', 'PATHOLOGY', true, 'STANDARD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CONSULT_GENERAL', 'General Consultation', 'CONSULTATION', 500.00, 0.1800, true, 0.0000, '998311', '998312', 'CONSULTATION', true, 'STANDARD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (study_code) DO NOTHING;

COMMIT;
