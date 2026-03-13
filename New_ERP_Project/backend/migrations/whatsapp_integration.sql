-- WhatsApp Integration Database Schema
-- Created for comprehensive WhatsApp notification system

-- WhatsApp Notifications Table
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    entity_id INTEGER NOT NULL, -- Can be bill_id, study_id, report_id, appointment_id, service_id
    notification_type VARCHAR(50) NOT NULL, -- BILL_NOTIFICATION, STUDY_COMPLETION, REPORT_READY, etc.
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, failed
    message_id VARCHAR(100), -- WhatsApp message ID
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Promotions Table
CREATE TABLE IF NOT EXISTS whatsapp_promotions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    discount_percentage DECIMAL(5,2),
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL,
    service_types TEXT[], -- Array of service types this promotion applies to
    target_audience VARCHAR(50) DEFAULT 'all', -- all, recent_patients, active_patients
    image_url VARCHAR(500), -- Optional promotional image
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, expired
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- WhatsApp Promotional Campaigns Table
CREATE TABLE IF NOT EXISTS whatsapp_promotional_campaigns (
    id SERIAL PRIMARY KEY,
    promotion_id INTEGER REFERENCES whatsapp_promotions(id) ON DELETE CASCADE,
    total_targets INTEGER NOT NULL,
    successful_sends INTEGER NOT NULL DEFAULT 0,
    failed_sends INTEGER NOT NULL DEFAULT 0,
    campaign_date DATE NOT NULL DEFAULT CURRENT_DATE,
    results_summary JSONB, -- Detailed results of the campaign
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Templates Table (for pre-approved message templates)
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL UNIQUE,
    template_type VARCHAR(50) NOT NULL, -- BILL_NOTIFICATION, STUDY_COMPLETION, etc.
    message_template TEXT NOT NULL, -- Template with placeholders like {{patient_name}}, {{bill_amount}}
    variables JSONB, -- Array of variable names used in template
    status VARCHAR(20) DEFAULT 'active', -- active, inactive
    whatsapp_template_id VARCHAR(100), -- Official WhatsApp template ID
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- WhatsApp Settings Table
CREATE TABLE IF NOT EXISTS whatsapp_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Rate Limiting Table
CREATE TABLE IF NOT EXISTS whatsapp_rate_limits (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL,
    message_count INTEGER DEFAULT 1,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    window_end TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_patient_id ON whatsapp_notifications(patient_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_entity_id ON whatsapp_notifications(entity_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_type ON whatsapp_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_status ON whatsapp_notifications(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_sent_at ON whatsapp_notifications(sent_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_promotions_status ON whatsapp_promotions(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_promotions_valid_dates ON whatsapp_promotions(valid_from, valid_to);

CREATE INDEX IF NOT EXISTS idx_whatsapp_promotional_campaigns_date ON whatsapp_promotional_campaigns(campaign_date);
CREATE INDEX IF NOT EXISTS idx_whatsapp_promotional_campaigns_promotion ON whatsapp_promotional_campaigns(promotion_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_type ON whatsapp_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status ON whatsapp_templates(status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_rate_limits_phone ON whatsapp_rate_limits(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_rate_limits_window ON whatsapp_rate_limits(window_start, window_end);

-- Insert Default WhatsApp Settings
INSERT INTO whatsapp_settings (setting_key, setting_value, description, is_encrypted) VALUES
('whatsapp_api_key', '', 'WhatsApp Business API Key', true),
('whatsapp_phone_number_id', '', 'WhatsApp Phone Number ID', false),
('whatsapp_webhook_url', '', 'WhatsApp Webhook URL', false),
('whatsapp_version', 'v18.0', 'WhatsApp API Version', false),
('max_daily_messages', '1000', 'Maximum messages per day', false),
('message_delay_seconds', '1', 'Delay between messages in seconds', false),
('enable_promotional_messages', 'true', 'Enable promotional messages', false),
('enable_appointment_reminders', 'true', 'Enable appointment reminders', false),
('enable_bill_notifications', 'true', 'Enable bill notifications', false),
('enable_study_notifications', 'true', 'Enable study completion notifications', false),
('business_hours_start', '09:00', 'Business hours start time', false),
('business_hours_end', '18:00', 'Business hours end time', false),
('timezone', 'Asia/Kolkata', 'Timezone for scheduling', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Insert Default WhatsApp Templates
INSERT INTO whatsapp_templates (template_name, template_type, message_template, variables, status) VALUES
('bill_notification', 'BILL_NOTIFICATION', 
'🏥 *Bill Notification*\n\nDear {{patient_name}},\n\nYour bill has been generated:\n📄 Bill Number: {{bill_number}}\n💰 Amount: ₹{{bill_amount}}\n📅 Due Date: {{due_date}}\n💳 Payment Method: {{payment_method}}\n📊 Status: {{status}}\n\nThank you for choosing our services!\nFor queries, please contact our billing department.',
'["patient_name", "bill_number", "bill_amount", "due_date", "payment_method", "status"]', 'active'),

('study_completion', 'STUDY_COMPLETION',
'🔬 *Study Completed*\n\nDear {{patient_name}},\n\nYour study has been completed:\n📋 Accession Number: {{accession_number}}\n🏥 Procedure: {{procedure}}\n📊 Study Type: {{study_type}}\n📍 Center: {{center_name}}\n✅ Completed At: {{completion_time}}\n\nYour reports are ready for collection.\nPlease visit the center to collect your reports.\n\nFor any queries, contact our radiology department.',
'["patient_name", "accession_number", "procedure", "study_type", "center_name", "completion_time"]', 'active'),

('report_ready', 'REPORT_READY',
'📋 *Report Ready*\n\nDear {{patient_name}},\n\nYour radiology report is ready:\n📄 Report Number: {{report_number}}\n📋 Accession Number: {{accession_number}}\n🏥 Procedure: {{procedure}}\n📊 Study Type: {{study_type}}\n📍 Center: {{center_name}}\n✅ Generated At: {{generation_time}}\n📊 Status: {{status}}\n\nYour report is ready for collection.\nPlease visit the center to collect your report.\n\nFor any queries, contact our radiology department.',
'["patient_name", "report_number", "accession_number", "procedure", "study_type", "center_name", "generation_time", "status"]', 'active'),

('appointment_reminder', 'APPOINTMENT_REMINDER',
'⏰ *Appointment Reminder*\n\nDear {{patient_name}},\n\nThis is a reminder for your upcoming appointment:\n📅 Date: {{appointment_date}}\n⏰ Time: {{appointment_time}}\n🏥 Procedure: {{procedure}}\n📍 Center: {{center_name}}\n\nPlease arrive 15 minutes before your appointment time.\nBring your ID and any previous medical records.\n\nFor any changes, please call us at {{contact_number}}.\n\nWe look forward to seeing you!',
'["patient_name", "appointment_date", "appointment_time", "procedure", "center_name", "contact_number"]', 'active'),

('service_status_update', 'SERVICE_STATUS',
'📊 *Service Status Update*\n\nDear {{patient_name}},\n\nYour service status has been updated:\n🏥 Service: {{service_name}}\n📊 Status: {{status}}\n🕐 Updated At: {{update_time}}\n\n{{additional_message}}\n\nFor any queries, please contact our support team.',
'["patient_name", "service_name", "status", "update_time", "additional_message"]', 'active'),

('promotional_message', 'PROMOTIONAL',
'🎉 *Special Offer*\n\n{{promotion_title}}\n\n{{promotion_message}}\n💰 Discount: {{discount_percentage}}% OFF\n📅 Valid From: {{valid_from}}\n📅 Valid Until: {{valid_to}}\n\n📍 Visit our center to avail this offer!\n📞 For appointments: {{contact_number}}\n\nTerms and conditions apply.',
'["promotion_title", "promotion_message", "discount_percentage", "valid_from", "valid_to", "contact_number"]', 'active')
ON CONFLICT (template_name) DO NOTHING;

-- Create Trigger for Updated At Timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to all relevant tables
CREATE TRIGGER update_whatsapp_notifications_updated_at 
    BEFORE UPDATE ON whatsapp_notifications 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_promotions_updated_at 
    BEFORE UPDATE ON whatsapp_promotions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_promotional_campaigns_updated_at 
    BEFORE UPDATE ON whatsapp_promotional_campaigns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_templates_updated_at 
    BEFORE UPDATE ON whatsapp_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_settings_updated_at 
    BEFORE UPDATE ON whatsapp_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_rate_limits_updated_at 
    BEFORE UPDATE ON whatsapp_rate_limits 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create Function for Rate Limiting Check
CREATE OR REPLACE FUNCTION check_whatsapp_rate_limit(p_phone_number VARCHAR(20))
RETURNS BOOLEAN AS $$
DECLARE
    v_count INTEGER;
    v_window_start TIMESTAMP;
    v_window_end TIMESTAMP;
BEGIN
    -- Check if there's an existing rate limit record
    SELECT message_count, window_start, window_end 
    INTO v_count, v_window_start, v_window_end
    FROM whatsapp_rate_limits 
    WHERE phone_number = p_phone_number 
    AND window_end > CURRENT_TIMESTAMP;
    
    IF FOUND THEN
        -- If within the window, check if limit exceeded
        IF v_count >= 10 THEN -- 10 messages per hour limit
            RETURN FALSE;
        ELSE
            -- Increment the count
            UPDATE whatsapp_rate_limits 
            SET message_count = message_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE phone_number = p_phone_number;
            RETURN TRUE;
        END IF;
    ELSE
        -- Create new rate limit record
        INSERT INTO whatsapp_rate_limits (phone_number, message_count, window_start, window_end)
        VALUES (p_phone_number, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour');
        RETURN TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create Function for Clean Up Old Rate Limits
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS VOID AS $$
BEGIN
    DELETE FROM whatsapp_rate_limits 
    WHERE window_end < CURRENT_TIMESTAMP - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Create View for Notification Statistics
CREATE OR REPLACE VIEW whatsapp_notification_stats AS
SELECT 
    notification_type,
    COUNT(*) as total_sent,
    COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
    ROUND(
        (COUNT(CASE WHEN status = 'sent' THEN 1 END) * 100.0 / COUNT(*)), 2
    ) as success_rate,
    DATE(sent_at) as notification_date
FROM whatsapp_notifications
GROUP BY notification_type, DATE(sent_at);

-- Create View for Campaign Performance
CREATE OR REPLACE VIEW whatsapp_campaign_performance AS
SELECT 
    wp.title as promotion_title,
    wp.valid_from,
    wp.valid_to,
    wpc.total_targets,
    wpc.successful_sends,
    wpc.failed_sends,
    ROUND(
        (wpc.successful_sends * 100.0 / wpc.total_targets), 2
    ) as delivery_rate,
    wpc.campaign_date
FROM whatsapp_promotional_campaigns wpc
JOIN whatsapp_promotions wp ON wpc.promotion_id = wp.id
ORDER BY wpc.campaign_date DESC;

-- Grant Permissions (adjust based on your database user)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_notifications TO your_db_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_promotions TO your_db_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_promotional_campaigns TO your_db_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_templates TO your_db_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_settings TO your_db_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_rate_limits TO your_db_user;

-- Grant usage on sequences
-- GRANT USAGE ON SEQUENCE whatsapp_notifications_id_seq TO your_db_user;
-- GRANT USAGE ON SEQUENCE whatsapp_promotions_id_seq TO your_db_user;
-- GRANT USAGE ON SEQUENCE whatsapp_promotional_campaigns_id_seq TO your_db_user;
-- GRANT USAGE ON SEQUENCE whatsapp_templates_id_seq TO your_db_user;
-- GRANT USAGE ON SEQUENCE whatsapp_settings_id_seq TO your_db_user;
-- GRANT USAGE ON SEQUENCE whatsapp_rate_limits_id_seq TO your_db_user;

-- Grant select on views
-- GRANT SELECT ON whatsapp_notification_stats TO your_db_user;
-- GRANT SELECT ON whatsapp_campaign_performance TO your_db_user;

COMMENT ON TABLE whatsapp_notifications IS 'Stores all WhatsApp notifications sent to patients';
COMMENT ON TABLE whatsapp_promotions IS 'Stores promotional messages and campaigns';
COMMENT ON TABLE whatsapp_promotional_campaigns IS 'Tracks promotional campaign execution and results';
COMMENT ON TABLE whatsapp_templates IS 'Pre-approved message templates for different notification types';
COMMENT ON TABLE whatsapp_settings IS 'Configuration settings for WhatsApp integration';
COMMENT ON TABLE whatsapp_rate_limits IS 'Rate limiting to prevent WhatsApp API abuse';

COMMENT ON COLUMN whatsapp_notifications.entity_id IS 'ID of related entity (bill, study, report, etc.)';
COMMENT ON COLUMN whatsapp_notifications.notification_type IS 'Type of notification sent';
COMMENT ON COLUMN whatsapp_promotions.target_audience IS 'Target audience for promotional messages';
COMMENT ON COLUMN whatsapp_templates.variables IS 'JSON array of placeholder variables in template';
COMMENT ON COLUMN whatsapp_settings.is_encrypted IS 'Whether the setting value should be encrypted';
COMMENT ON COLUMN whatsapp_rate_limits.window_end IS 'End of the rate limiting window';
