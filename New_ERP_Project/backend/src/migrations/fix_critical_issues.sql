-- Fix Critical Issues - Database Schema and Security Fixes
-- This migration addresses the most critical database and security issues

-- Create missing core tables
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    role VARCHAR(20) DEFAULT 'USER' CHECK (role IN ('ADMIN', 'MANAGER', 'USER', 'DOCTOR', 'NURSE', 'RECEPTIONIST')),
    center_id INTEGER REFERENCES centers(id),
    department_id INTEGER REFERENCES departments(id),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    description TEXT,
    center_id INTEGER REFERENCES centers(id),
    manager_id INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS centers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    address TEXT,
    city VARCHAR(50),
    state VARCHAR(50),
    postal_code VARCHAR(10),
    country VARCHAR(50) DEFAULT 'India',
    phone VARCHAR(20),
    email VARCHAR(100),
    website VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fix data type inconsistencies in expense_items_master
ALTER TABLE expense_items_master 
ALTER COLUMN current_stock TYPE INTEGER USING (current_stock::INTEGER),
ALTER COLUMN minimum_stock_level TYPE INTEGER USING (minimum_stock_level::INTEGER),
ALTER COLUMN maximum_stock_level TYPE INTEGER USING (maximum_stock_level::INTEGER),
ALTER COLUMN reorder_quantity TYPE INTEGER USING (reorder_quantity::INTEGER),
ALTER COLUMN average_monthly_consumption TYPE INTEGER USING (average_monthly_consumption::INTEGER);

-- Add missing foreign key constraints
ALTER TABLE asset_master 
ADD CONSTRAINT IF NOT EXISTS fk_asset_center 
FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE SET NULL;

ALTER TABLE asset_master 
ADD CONSTRAINT IF NOT EXISTS fk_asset_vendor 
FOREIGN KEY (vendor_id) REFERENCES asset_vendors(id) ON DELETE SET NULL;

ALTER TABLE expense_items_master 
ADD CONSTRAINT IF NOT EXISTS fk_expense_category 
FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL;

ALTER TABLE expense_item_vendors 
ADD CONSTRAINT IF NOT EXISTS fk_eiv_expense_item 
FOREIGN KEY (expense_item_id) REFERENCES expense_items_master(id) ON DELETE CASCADE;

ALTER TABLE expense_item_vendors 
ADD CONSTRAINT IF NOT EXISTS fk_eiv_vendor 
FOREIGN KEY (vendor_id) REFERENCES asset_vendors(id) ON DELETE CASCADE;

ALTER TABLE loaner_asset_assignments 
ADD CONSTRAINT IF NOT EXISTS fk_la_asset 
FOREIGN KEY (loaner_asset_id) REFERENCES asset_master(id) ON DELETE CASCADE;

ALTER TABLE loaner_asset_assignments 
ADD CONSTRAINT IF NOT EXISTS fk_la_consumable 
FOREIGN KEY (consumable_item_id) REFERENCES expense_items_master(id) ON DELETE CASCADE;

ALTER TABLE loaner_asset_assignments 
ADD CONSTRAINT IF NOT EXISTS fk_la_center 
FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE loaner_asset_assignments 
ADD CONSTRAINT IF NOT EXISTS fk_la_assigned_user 
FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Add critical indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

CREATE INDEX IF NOT EXISTS idx_departments_center ON departments(center_id);
CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active);

CREATE INDEX IF NOT EXISTS idx_centers_active ON centers(is_active);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date_status ON journal_entries(entry_date, status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by ON journal_entries(created_by);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_id);

CREATE INDEX IF NOT EXISTS idx_asset_master_center ON asset_master(center_id);
CREATE INDEX IF NOT EXISTS idx_asset_master_vendor ON asset_master(vendor_id);
CREATE INDEX IF NOT EXISTS idx_asset_master_status ON asset_master(status);
CREATE INDEX IF NOT EXISTS idx_asset_master_active ON asset_master(active);

CREATE INDEX IF NOT EXISTS idx_expense_items_stock ON expense_items_master(current_stock, minimum_stock_level);
CREATE INDEX IF NOT EXISTS idx_expense_items_category ON expense_items_master(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_active ON expense_items_master(active);

CREATE INDEX IF NOT EXISTS idx_expense_consumption_item_date ON expense_consumption(expense_item_id, consumption_date);
CREATE INDEX IF NOT EXISTS idx_expense_consumption_center ON expense_consumption(center_id);

CREATE INDEX IF NOT EXISTS idx_loaner_assignments_status ON loaner_asset_assignments(assignment_status, expected_return_date);
CREATE INDEX IF NOT EXISTS idx_loaner_assignments_asset ON loaner_asset_assignments(loaner_asset_id);
CREATE INDEX IF NOT EXISTS idx_loaner_assignments_center ON loaner_asset_assignments(center_id);

CREATE INDEX IF NOT EXISTS idx_chart_accounts_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_chart_accounts_active ON chart_of_accounts(is_active);

-- Create user sessions table for authentication
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- Create audit log table for security
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(50),
    record_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Insert default admin user (password: admin123)
INSERT INTO users (username, email, password_hash, first_name, last_name, role, is_active) 
VALUES ('admin', 'admin@arishealthcare.com', '$2b$10$rQZ8ZkGZQZQZQZQZQZQZO', 'System', 'Administrator', 'ADMIN', true)
ON CONFLICT (username) DO NOTHING;

-- Insert default centers
INSERT INTO centers (name, code, address, city, state, phone, email) VALUES
('Main Hospital', 'MAIN', '123 Medical Complex, Healthcare City', 'Kochi', 'Kerala', '+91-484-1234567', 'main@arishealthcare.com'),
('Diagnostic Center', 'DIAG', '456 Diagnostic Street, Medical Hub', 'Thrissur', 'Kerala', '+91-487-7654321', 'diagnostic@arishealthcare.com'),
('Clinic Branch', 'CLINIC', '789 Clinic Road, Medical Area', 'Kozhikode', 'Kerala', '+91-495-9876543', 'clinic@arishealthcare.com')
ON CONFLICT (code) DO NOTHING;

-- Insert default departments
INSERT INTO departments (name, code, description, center_id) VALUES
('Radiology', 'RAD', 'Medical imaging and diagnostics', 1),
('Laboratory', 'LAB', 'Pathology and diagnostic testing', 1),
('Pharmacy', 'PHARM', 'Medicine dispensing', 1),
('Administration', 'ADMIN', 'Hospital administration', 1),
('Nursing', 'NURS', 'Patient care and nursing', 1),
('Reception', 'RECP', 'Patient registration and billing', 1)
ON CONFLICT (code) DO NOTHING;

-- Create function for audit logging
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (
        user_id, action, table_name, record_id, old_values, new_values
    ) VALUES (
        COALESCE(current_setting('app.current_user_id', '0')::INTEGER, 0),
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Add audit triggers to critical tables
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_centers AFTER INSERT OR UPDATE OR DELETE ON centers
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_departments AFTER INSERT OR UPDATE OR DELETE ON departments
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_asset_master AFTER INSERT OR UPDATE OR DELETE ON asset_master
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_expense_items_master AFTER INSERT OR UPDATE OR DELETE ON expense_items_master
    FOR EACH ROW EXECUTE FUNCTION log_audit();

-- Create function to check and lock user accounts
CREATE OR REPLACE FUNCTION check_user_login(p_email VARCHAR, p_password TEXT)
RETURNS JSON AS $$
DECLARE
    v_user RECORD;
    v_password_hash VARCHAR(255);
    v_is_valid BOOLEAN := false;
    v_attempts INTEGER;
BEGIN
    -- Get user record
    SELECT * INTO v_user 
    FROM users 
    WHERE email = p_email AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Invalid credentials');
    END IF;
    
    -- Check if account is locked
    IF v_user.locked_until > CURRENT_TIMESTAMP THEN
        RETURN json_build_object('success', false, 'message', 'Account locked. Try again later.');
    END IF;
    
    -- Check password
    v_is_valid := (v_user.password_hash = p_password);
    
    IF v_is_valid THEN
        -- Successful login - reset failed attempts
        UPDATE users 
        SET 
            failed_login_attempts = 0,
            locked_until = NULL,
            last_login = CURRENT_TIMESTAMP
        WHERE id = v_user.id;
        
        RETURN json_build_object(
            'success', true, 
            'user_id', v_user.id,
            'username', v_user.username,
            'role', v_user.role,
            'center_id', v_user.center_id
        );
    ELSE
        -- Failed login - increment attempts
        UPDATE users 
        SET 
            failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE 
                WHEN failed_login_attempts + 1 >= 3 THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
                ELSE NULL
            END
        WHERE id = v_user.id;
        
        v_attempts := v_user.failed_login_attempts + 1;
        
        RETURN json_build_object(
            'success', false, 
            'message', CASE 
                WHEN v_attempts >= 3 THEN 'Account locked due to too many failed attempts'
                ELSE 'Invalid credentials'
            END,
            'attempts_remaining', 3 - v_attempts
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate secure session token
CREATE OR REPLACE FUNCTION generate_session_token(p_user_id INTEGER, p_ip_address INET DEFAULT NULL)
RETURNS VARCHAR AS $$
DECLARE
    v_token VARCHAR(255);
    v_expires_at TIMESTAMP;
BEGIN
    -- Generate random token
    v_token := encode(decode(md5(random()::text || p_user_id::text || clock_timestamp()::text), 'hex');
    
    -- Set expiration to 24 hours
    v_expires_at := CURRENT_TIMESTAMP + INTERVAL '24 hours';
    
    -- Insert session
    INSERT INTO user_sessions (user_id, session_token, expires_at, ip_address)
    VALUES (p_user_id, v_token, v_expires_at, p_ip_address);
    
    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate session token
CREATE OR REPLACE FUNCTION validate_session_token(p_token VARCHAR)
RETURNS JSON AS $$
DECLARE
    v_session RECORD;
    v_current_time TIMESTAMP := CURRENT_TIMESTAMP;
BEGIN
    -- Get session record
    SELECT * INTO v_session
    FROM user_sessions 
    WHERE session_token = p_token AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN json_build_object('valid', false, 'message', 'Invalid session');
    END IF;
    
    -- Check if expired
    IF v_session.expires_at < v_current_time THEN
        UPDATE user_sessions 
        SET is_active = false 
        WHERE id = v_session.id;
        
        RETURN json_build_object('valid', false, 'message', 'Session expired');
    END IF;
    
    -- Update last accessed
    UPDATE user_sessions 
    SET last_accessed = v_current_time 
    WHERE id = v_session.id;
    
    RETURN json_build_object('valid', true, 'user_id', v_session.user_id);
END;
$$ LANGUAGE plpgsql;

-- Create function to logout user
CREATE OR REPLACE FUNCTION logout_user(p_token VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE user_sessions 
    SET is_active = false 
    WHERE session_token = p_token;
    
    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Clean up expired sessions (run daily)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < CURRENT_TIMESTAMP OR is_active = false;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON centers TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO PUBLIC;

GRANT EXECUTE ON FUNCTION check_user_login TO PUBLIC;
GRANT EXECUTE ON FUNCTION generate_session_token TO PUBLIC;
GRANT EXECUTE ON FUNCTION validate_session_token TO PUBLIC;
GRANT EXECUTE ON FUNCTION logout_user TO PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions TO PUBLIC;

COMMENT ON TABLE users IS 'System users with authentication and authorization';
COMMENT ON TABLE departments IS 'Hospital departments and divisions';
COMMENT ON TABLE centers IS 'Hospital centers and branches';
COMMENT ON TABLE user_sessions IS 'User authentication sessions';
COMMENT ON TABLE audit_logs IS 'Audit trail for all system changes';
