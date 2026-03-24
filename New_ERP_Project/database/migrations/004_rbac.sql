-- Migration 004: Role-Based Access Control (RBAC)
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/database/rbac-schema.sql

-- USER ROLES TABLE
CREATE TABLE IF NOT EXISTS user_roles (
    id                     SERIAL PRIMARY KEY,
    role                   VARCHAR(50) NOT NULL UNIQUE,
    role_name              VARCHAR(100) NOT NULL,
    description            TEXT,
    permissions            JSONB NOT NULL,
    dashboard_widgets      JSONB NOT NULL,
    report_access          JSONB NOT NULL,
    is_corporate_role      BOOLEAN DEFAULT false,
    can_access_all_centers BOOLEAN DEFAULT false,
    allowed_centers        INTEGER[],
    notes                  TEXT,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                 BOOLEAN DEFAULT true
);

-- Add columns to users if not already present (001_foundation already creates most)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS center_id INTEGER REFERENCES centers(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_role      ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_active     ON user_roles(active);
CREATE INDEX IF NOT EXISTS idx_user_roles_corporate  ON user_roles(is_corporate_role);
CREATE INDEX IF NOT EXISTS idx_users_role_rbac       ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_center_id_rbac  ON users(center_id);
CREATE INDEX IF NOT EXISTS idx_users_active_rbac     ON users(active);

-- Sample roles
INSERT INTO user_roles (
    role, role_name, description, permissions, dashboard_widgets, report_access,
    is_corporate_role, can_access_all_centers, allowed_centers, notes
) VALUES
(
    'SUPER_ADMIN', 'Super Administrator',
    'Full system access with all permissions across all centers',
    '["ALL_ACCESS"]', '["ALL_WIDGETS"]', '["ALL_REPORTS"]',
    true, true, NULL,
    'Super administrator with complete system access'
),
(
    'CENTER_MANAGER', 'Center Manager',
    'Can manage all centers but with limited system functions',
    '["USER_VIEW","USER_CREATE","USER_UPDATE","USER_ASSIGN_ROLE","PATIENT_VIEW","PATIENT_CREATE","PATIENT_UPDATE","PATIENT_BILLING","STUDY_VIEW","STUDY_CREATE","STUDY_UPDATE","STUDY_REPORT","BILLING_VIEW","BILLING_CREATE","BILLING_UPDATE","BILLING_PRINT","CENTER_VIEW","CENTER_UPDATE","RADIOLOGIST_VIEW","RADIOLOGIST_CREATE","RADIOLOGIST_UPDATE","RADIOLOGIST_PAYMENT","EMPLOYEE_VIEW","EMPLOYEE_CREATE","EMPLOYEE_UPDATE","EMPLOYEE_ATTENDANCE","EMPLOYEE_PAYROLL","VENDOR_VIEW","VENDOR_CREATE","VENDOR_UPDATE","VENDOR_BILLING","VENDOR_PAYMENT","INVENTORY_VIEW","INVENTORY_UPDATE","INVENTORY_PURCHASE","INVENTORY_STOCK","REPORTS_VIEW","REPORTS_PATIENT","REPORTS_BILLING","REPORTS_RADIOLOGY","REPORTS_EMPLOYEE","REPORTS_FINANCIAL","REPORTS_DOWNLOAD","DASHBOARD_VIEW","DASHBOARD_ADMIN","DASHBOARD_FINANCIAL","DASHBOARD_CLINICAL","DASHBOARD_OPERATIONAL"]',
    '["PATIENT_COUNT","STUDY_COUNT","PENDING_REPORTS","COMPLETED_REPORTS","RADIOLOGIST_WORKLOAD","MODALITY_BREAKDOWN","REVENUE_SUMMARY","BILLING_SUMMARY","PAYMENT_STATUS","EXPENSE_SUMMARY","PROFIT_LOSS","REVENUE_CHART","CENTER_UTILIZATION","SCANNER_UTILIZATION","STAFF_ATTENDANCE","INVENTORY_STATUS","VENDOR_PAYMENTS","USER_ACTIVITY","SYSTEM_STATUS"]',
    '["ALL_REPORTS"]',
    true, true, NULL,
    'Corporate center manager with access to all centers'
),
(
    'RADIOLOGIST', 'Radiologist',
    'Can view and report studies, limited to assigned center',
    '["PATIENT_VIEW","STUDY_VIEW","STUDY_REPORT","REPORTS_VIEW","REPORTS_RADIOLOGY","DASHBOARD_VIEW","DASHBOARD_CLINICAL"]',
    '["PATIENT_COUNT","STUDY_COUNT","PENDING_REPORTS","COMPLETED_REPORTS","RADIOLOGIST_WORKLOAD","MODALITY_BREAKDOWN"]',
    '["STUDY_REPORTS","RADIOLOGIST_PERFORMANCE","MODALITY_UTILIZATION"]',
    false, false, NULL,
    'Individual radiologist with study reporting access'
),
(
    'TECHNICIAN', 'Technician',
    'Can manage studies and patient information, limited to assigned center',
    '["PATIENT_VIEW","PATIENT_CREATE","PATIENT_UPDATE","STUDY_VIEW","STUDY_CREATE","STUDY_UPDATE","STUDY_ASSIGN_RADIOLOGIST","REPORTS_VIEW","REPORTS_RADIOLOGY","DASHBOARD_VIEW","DASHBOARD_CLINICAL","DASHBOARD_OPERATIONAL"]',
    '["PATIENT_COUNT","STUDY_COUNT","PENDING_REPORTS","COMPLETED_REPORTS","MODALITY_BREAKDOWN","SCANNER_UTILIZATION"]',
    '["STUDY_REPORTS","MODALITY_UTILIZATION","REPORTING_TAT"]',
    false, false, NULL,
    'Technician with study management access'
),
(
    'RECEPTIONIST', 'Receptionist',
    'Can manage patient registration and billing, limited to assigned center',
    '["PATIENT_VIEW","PATIENT_CREATE","PATIENT_UPDATE","PATIENT_BILLING","PATIENT_INSURANCE","BILLING_VIEW","BILLING_CREATE","BILLING_UPDATE","BILLING_PRINT","REPORTS_VIEW","REPORTS_PATIENT","REPORTS_BILLING","DASHBOARD_VIEW","DASHBOARD_ADMIN","DASHBOARD_FINANCIAL"]',
    '["PATIENT_COUNT","BILLING_SUMMARY","PAYMENT_STATUS","REVENUE_CHART","USER_ACTIVITY"]',
    '["PATIENT_DEMOGRAPHICS","PATIENT_HISTORY","PATIENT_BILLING","BILLING_REPORT","REVENUE_REPORT"]',
    false, false, NULL,
    'Receptionist with patient and billing access'
),
(
    'ACCOUNTANT', 'Accountant',
    'Can manage billing, payments, and financial reports',
    '["BILLING_VIEW","BILLING_CREATE","BILLING_UPDATE","BILLING_PRINT","BILLING_PAYMENT","RADIOLOGIST_PAYMENT","VENDOR_BILLING","VENDOR_PAYMENT","EMPLOYEE_VIEW","EMPLOYEE_PAYROLL","REPORTS_VIEW","REPORTS_BILLING","REPORTS_FINANCIAL","REPORTS_DOWNLOAD","DASHBOARD_VIEW","DASHBOARD_FINANCIAL"]',
    '["REVENUE_SUMMARY","BILLING_SUMMARY","PAYMENT_STATUS","EXPENSE_SUMMARY","PROFIT_LOSS","REVENUE_CHART","VENDOR_PAYMENTS"]',
    '["BILLING_REPORT","PAYMENT_REPORT","EXPENSE_REPORT","PROFIT_LOSS_REPORT","TAX_REPORT"]',
    false, false, NULL,
    'Accountant with financial and billing access'
),
(
    'HR_MANAGER', 'HR Manager',
    'Can manage employees, attendance, and payroll across all centers',
    '["USER_VIEW","USER_CREATE","USER_UPDATE","USER_ASSIGN_ROLE","EMPLOYEE_VIEW","EMPLOYEE_CREATE","EMPLOYEE_UPDATE","EMPLOYEE_ATTENDANCE","EMPLOYEE_PAYROLL","REPORTS_VIEW","REPORTS_EMPLOYEE","REPORTS_DOWNLOAD","DASHBOARD_VIEW","DASHBOARD_ADMIN","DASHBOARD_OPERATIONAL"]',
    '["USER_ACTIVITY","STAFF_ATTENDANCE","SYSTEM_STATUS","COMPLIANCE_STATUS"]',
    '["EMPLOYEE_ATTENDANCE","EMPLOYEE_PAYROLL","EMPLOYEE_PERFORMANCE","STAFF_SALARY","USER_ACTIVITY_REPORT"]',
    true, true, NULL,
    'HR manager with employee management access'
),
(
    'LAB_TECHNICIAN', 'Lab Technician',
    'Can manage lab studies and reports, limited to assigned center',
    '["PATIENT_VIEW","STUDY_VIEW","STUDY_CREATE","STUDY_UPDATE","STUDY_REPORT","REPORTS_VIEW","REPORTS_RADIOLOGY","DASHBOARD_VIEW","DASHBOARD_CLINICAL"]',
    '["PATIENT_COUNT","STUDY_COUNT","PENDING_REPORTS","COMPLETED_REPORTS","MODALITY_BREAKDOWN"]',
    '["STUDY_REPORTS","MODALITY_UTILIZATION"]',
    false, false, NULL,
    'Lab technician with study management access'
),
(
    'INVENTORY_MANAGER', 'Inventory Manager',
    'Can manage inventory, vendors, and purchases across all centers',
    '["VENDOR_VIEW","VENDOR_CREATE","VENDOR_UPDATE","VENDOR_BILLING","VENDOR_PAYMENT","INVENTORY_VIEW","INVENTORY_CREATE","INVENTORY_UPDATE","INVENTORY_PURCHASE","INVENTORY_STOCK","REPORTS_VIEW","REPORTS_DOWNLOAD","DASHBOARD_VIEW","DASHBOARD_OPERATIONAL"]',
    '["INVENTORY_STATUS","VENDOR_PAYMENTS","MAINTENANCE_SCHEDULE"]',
    '["INVENTORY_STOCK","INVENTORY_PURCHASE","INVENTORY_CONSUMPTION","VENDOR_REPORT"]',
    true, true, NULL,
    'Inventory manager with supply chain access'
)
ON CONFLICT (role) DO NOTHING;

-- Apply default role to admin user
UPDATE users SET role = 'SUPER_ADMIN', center_id = NULL WHERE email = 'admin@aris.com' AND role IS NULL;

-- Functions
CREATE OR REPLACE FUNCTION check_user_permission(
    p_user_id   INTEGER,
    p_permission VARCHAR(100)
) RETURNS BOOLEAN AS $$
DECLARE
    user_permissions JSONB;
BEGIN
    SELECT ur.permissions
    INTO user_permissions
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    WHERE u.id = p_user_id AND u.active = true AND ur.active = true;

    RETURN user_permissions ? p_permission OR user_permissions ? 'ALL_ACCESS';
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_user_center_access(
    p_user_id  INTEGER,
    p_center_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    user_role              VARCHAR(50);
    user_center_id         INTEGER;
    is_corporate_role      BOOLEAN;
    can_access_all_centers BOOLEAN;
    allowed_centers        INTEGER[];
BEGIN
    SELECT u.role, u.center_id, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers
    INTO user_role, user_center_id, is_corporate_role, can_access_all_centers, allowed_centers
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    WHERE u.id = p_user_id AND u.active = true AND ur.active = true;

    IF is_corporate_role OR can_access_all_centers THEN
        RETURN TRUE;
    END IF;

    IF allowed_centers IS NOT NULL THEN
        RETURN p_center_id = ANY(allowed_centers);
    END IF;

    RETURN user_center_id = p_center_id;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_dashboard_widgets(p_user_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_dashboard_widgets JSONB;
BEGIN
    SELECT ur.dashboard_widgets
    INTO v_dashboard_widgets
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    WHERE u.id = p_user_id AND u.active = true AND ur.active = true;

    RETURN COALESCE(v_dashboard_widgets, '[]'::JSONB);
EXCEPTION
    WHEN OTHERS THEN
        RETURN '[]'::JSONB;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_report_access(p_user_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_report_access JSONB;
BEGIN
    SELECT ur.report_access
    INTO v_report_access
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    WHERE u.id = p_user_id AND u.active = true AND ur.active = true;

    RETURN COALESCE(v_report_access, '[]'::JSONB);
EXCEPTION
    WHEN OTHERS THEN
        RETURN '[]'::JSONB;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_accessible_centers(p_user_id INTEGER)
RETURNS TABLE (
    center_id   INTEGER,
    center_name VARCHAR(100),
    city        VARCHAR(100),
    state       VARCHAR(100)
) AS $$
DECLARE
    user_role              VARCHAR(50);
    user_center_id         INTEGER;
    is_corporate_role      BOOLEAN;
    can_access_all_centers BOOLEAN;
    allowed_centers        INTEGER[];
BEGIN
    SELECT u.role, u.center_id, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers
    INTO user_role, user_center_id, is_corporate_role, can_access_all_centers, allowed_centers
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    WHERE u.id = p_user_id AND u.active = true AND ur.active = true;

    IF is_corporate_role OR can_access_all_centers THEN
        RETURN QUERY
        SELECT c.id, c.name, c.city, c.state
        FROM centers c WHERE c.active = true ORDER BY c.name;
    ELSIF allowed_centers IS NOT NULL THEN
        RETURN QUERY
        SELECT c.id, c.name, c.city, c.state
        FROM centers c WHERE c.id = ANY(allowed_centers) AND c.active = true ORDER BY c.name;
    ELSE
        RETURN QUERY
        SELECT c.id, c.name, c.city, c.state
        FROM centers c WHERE c.id = user_center_id AND c.active = true ORDER BY c.name;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_role_assignment()
RETURNS TRIGGER AS $$
DECLARE
    role_info RECORD;
BEGIN
    SELECT ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers
    INTO role_info
    FROM user_roles ur
    WHERE ur.role = NEW.role AND ur.active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role % does not exist', NEW.role;
    END IF;

    IF NOT role_info.is_corporate_role AND NOT role_info.can_access_all_centers THEN
        IF role_info.allowed_centers IS NOT NULL AND NEW.center_id IS NOT NULL THEN
            IF NOT (NEW.center_id = ANY(role_info.allowed_centers)) THEN
                RAISE EXCEPTION 'User does not have access to center %', NEW.center_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error validating role assignment: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_role_assignment ON users;
CREATE TRIGGER trigger_validate_role_assignment
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION validate_role_assignment();

CREATE OR REPLACE FUNCTION update_user_login(
    p_user_id       INTEGER,
    p_login_success BOOLEAN DEFAULT true
) RETURNS VOID AS $$
BEGIN
    IF p_login_success THEN
        UPDATE users
        SET last_login = CURRENT_TIMESTAMP,
            failed_login_attempts = 0,
            locked_until = NULL
        WHERE id = p_user_id;
    ELSE
        UPDATE users
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE
                WHEN failed_login_attempts >= 4 THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
                ELSE NULL
            END
        WHERE id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Views
CREATE OR REPLACE VIEW user_permissions_summary AS
SELECT
    u.id            AS user_id,
    u.name          AS user_name,
    u.email         AS user_email,
    u.role,
    ur.role_name,
    ur.is_corporate_role,
    ur.can_access_all_centers,
    ur.allowed_centers,
    ur.permissions,
    ur.dashboard_widgets,
    ur.report_access,
    c.name          AS center_name,
    u.last_login,
    u.failed_login_attempts,
    u.locked_until
FROM users u
LEFT JOIN user_roles ur ON u.role = ur.role
LEFT JOIN centers c ON u.center_id = c.id
WHERE u.active = true AND ur.active = true;

CREATE OR REPLACE VIEW rbac_statistics AS
SELECT
    'RBAC_STATS'                                                                                   AS stats_type,
    (SELECT COUNT(*) FROM user_roles WHERE active = true)                                           AS total_roles,
    (SELECT COUNT(*) FROM user_roles WHERE is_corporate_role = true AND active = true)              AS corporate_roles,
    (SELECT COUNT(*) FROM user_roles WHERE can_access_all_centers = true AND active = true)         AS all_center_roles,
    (SELECT COUNT(*) FROM users WHERE active = true)                                                AS total_users,
    (SELECT COUNT(*) FROM users WHERE role = 'SUPER_ADMIN' AND active = true)                       AS super_admin_count,
    (SELECT COUNT(*) FROM users WHERE role = 'CENTER_MANAGER' AND active = true)                    AS manager_count,
    (SELECT COUNT(*) FROM users WHERE role = 'RADIOLOGIST' AND active = true)                       AS radiologist_count,
    (SELECT COUNT(*) FROM users WHERE role = 'TECHNICIAN' AND active = true)                        AS technician_count,
    (SELECT COUNT(*) FROM users WHERE role = 'RECEPTIONIST' AND active = true)                      AS receptionist_count,
    (SELECT COUNT(*) FROM users WHERE role = 'ACCOUNTANT' AND active = true)                        AS accountant_count,
    (SELECT COUNT(*) FROM users WHERE role = 'HR_MANAGER' AND active = true)                        AS hr_manager_count,
    (SELECT COUNT(*) FROM users WHERE role = 'LAB_TECHNICIAN' AND active = true)                    AS lab_technician_count,
    (SELECT COUNT(*) FROM users WHERE role = 'INVENTORY_MANAGER' AND active = true)                 AS inventory_manager_count,
    (SELECT COUNT(DISTINCT center_id) FROM users WHERE center_id IS NOT NULL AND active = true)     AS centers_with_users,
    CURRENT_TIMESTAMP                                                                               AS last_updated;
