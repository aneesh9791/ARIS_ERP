-- Migration 005: Password Settings and Policy Management
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/database/password-settings-schema.sql
-- Fix applied: password_changed column is TIMESTAMP (not BOOLEAN).
--   All occurrences of `password_changed = true`  replaced with `password_changed IS NOT NULL`
--   All occurrences of `password_changed = false` replaced with `password_changed IS NULL`
--   Timestamp comparisons (>= date, < date) remain valid and are unchanged.
--   In admin_reset_password, `password_changed = NOT p_force_change` replaced with conditional TIMESTAMP assignment.

-- PASSWORD SETTINGS TABLE
CREATE TABLE IF NOT EXISTS password_settings (
    id                       SERIAL PRIMARY KEY,
    min_length               INTEGER DEFAULT 8,
    require_uppercase        BOOLEAN DEFAULT true,
    require_lowercase        BOOLEAN DEFAULT true,
    require_numbers          BOOLEAN DEFAULT true,
    require_special_chars    BOOLEAN DEFAULT true,
    prevent_common_passwords BOOLEAN DEFAULT true,
    prevent_reuse            BOOLEAN DEFAULT true,
    max_reuse_count          INTEGER DEFAULT 5,
    session_timeout          INTEGER DEFAULT 30,
    lockout_threshold        INTEGER DEFAULT 5,
    lockout_duration         INTEGER DEFAULT 30,
    password_expiry_days     INTEGER DEFAULT 90,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                   BOOLEAN DEFAULT true
);

-- USER PASSWORDS TABLE (password history)
CREATE TABLE IF NOT EXISTS user_passwords (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER REFERENCES users(id),
    password_history JSONB,
    changed_by       INTEGER REFERENCES users(id),
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- PASSWORD RESET LOG TABLE
CREATE TABLE IF NOT EXISTS password_reset_log (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id),
    admin_id     INTEGER REFERENCES users(id),
    reset_reason TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_password_settings_active     ON password_settings(active);
CREATE INDEX IF NOT EXISTS idx_user_passwords_user_id       ON user_passwords(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passwords_changed_by    ON user_passwords(changed_by);
CREATE INDEX IF NOT EXISTS idx_password_reset_log_user_id   ON password_reset_log(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_log_admin_id  ON password_reset_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_log_created   ON password_reset_log(created_at);

-- Default password policy
INSERT INTO password_settings (
    min_length, require_uppercase, require_lowercase, require_numbers,
    require_special_chars, prevent_common_passwords, prevent_reuse,
    max_reuse_count, session_timeout, lockout_threshold, lockout_duration,
    password_expiry_days, created_at, updated_at, active
) VALUES (8, true, true, true, true, true, true, 5, 30, 5, 30, 90, NOW(), NOW(), true);

-- Functions
CREATE OR REPLACE FUNCTION validate_password_reset_access(
    p_admin_user_id  INTEGER,
    p_target_user_id INTEGER
) RETURNS TABLE (
    has_access    BOOLEAN,
    error_message TEXT,
    admin_type    VARCHAR(20),
    target_type   VARCHAR(20)
) AS $$
DECLARE
    admin_user  RECORD;
    target_user RECORD;
    v_admin_type  VARCHAR(20);
    v_target_type VARCHAR(20);
BEGIN
    SELECT u.id, u.name, u.role, u.center_id,
           ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
           ur.permissions
    INTO admin_user
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    WHERE u.id = p_admin_user_id AND u.active = true;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Admin user not found'::TEXT, NULL::VARCHAR(20), NULL::VARCHAR(20);
        RETURN;
    END IF;

    SELECT u.id, u.name, u.role, u.center_id,
           ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
           c.name AS center_name
    INTO target_user
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    LEFT JOIN centers c ON u.center_id = c.id
    WHERE u.id = p_target_user_id AND u.active = true;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Target user not found'::TEXT, NULL::VARCHAR(20), NULL::VARCHAR(20);
        RETURN;
    END IF;

    v_admin_type := CASE
        WHEN admin_user.is_corporate_role = true   THEN 'Corporate'
        WHEN admin_user.can_access_all_centers = true THEN 'Team-Based'
        ELSE 'Center-Specific'
    END;

    v_target_type := CASE
        WHEN target_user.is_corporate_role = true   THEN 'Corporate'
        WHEN target_user.can_access_all_centers = true THEN 'Team-Based'
        ELSE 'Center-Specific'
    END;

    IF admin_user.role = 'SUPER_ADMIN' OR admin_user.permissions ? 'ALL_ACCESS' THEN
        RETURN QUERY SELECT true, 'Access granted (Super Admin)'::TEXT, v_admin_type, v_target_type;
        RETURN;
    END IF;

    IF NOT (admin_user.permissions ? 'USER_UPDATE') THEN
        RETURN QUERY SELECT false, 'Insufficient permissions to reset passwords'::TEXT, v_admin_type, v_target_type;
        RETURN;
    END IF;

    IF admin_user.is_corporate_role = true OR admin_user.can_access_all_centers = true THEN
        IF target_user.is_corporate_role = true OR target_user.can_access_all_centers = true THEN
            RETURN QUERY SELECT true, 'Access granted (Corporate to Corporate/Team)'::TEXT, v_admin_type, v_target_type;
            RETURN;
        END IF;
    END IF;

    IF admin_user.center_id IS NOT NULL THEN
        IF target_user.center_id = admin_user.center_id THEN
            RETURN QUERY SELECT true, 'Access granted (Same Center)'::TEXT, v_admin_type, v_target_type;
            RETURN;
        END IF;
        IF admin_user.can_access_all_centers = true AND target_user.is_corporate_role = false THEN
            RETURN QUERY SELECT true, 'Access granted (Team-Based to Team-Based)'::TEXT, v_admin_type, v_target_type;
            RETURN;
        END IF;
    END IF;

    IF admin_user.allowed_centers IS NOT NULL AND target_user.center_id = ANY(admin_user.allowed_centers) THEN
        RETURN QUERY SELECT true, 'Access granted (Allowed Center)'::TEXT, v_admin_type, v_target_type;
        RETURN;
    END IF;

    RETURN QUERY SELECT false, 'Access denied based on employee type and center access'::TEXT, v_admin_type, v_target_type;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_password_reset_accessible_users(
    p_admin_user_id INTEGER
) RETURNS TABLE (
    user_id        INTEGER,
    user_name      VARCHAR(100),
    user_email     VARCHAR(100),
    user_role      VARCHAR(50),
    role_name      VARCHAR(100),
    center_id      INTEGER,
    center_name    VARCHAR(100),
    employee_type  VARCHAR(20),
    password_status VARCHAR(20),
    has_access     BOOLEAN,
    access_reason  TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id                AS user_id,
        u.name              AS user_name,
        u.email             AS user_email,
        u.role              AS user_role,
        ur.role_name,
        u.center_id,
        c.name              AS center_name,
        CASE
            WHEN ur.is_corporate_role = true       THEN 'Corporate'
            WHEN ur.can_access_all_centers = true  THEN 'Team-Based'
            ELSE 'Center-Specific'
        END::VARCHAR(20)    AS employee_type,
        -- Fix: password_changed is TIMESTAMP; IS NULL = never set / IS NOT NULL = changed
        CASE
            WHEN u.password_changed IS NULL THEN 'Default'
            ELSE 'Changed'
        END::VARCHAR(20)    AS password_status,
        access_check.has_access,
        access_check.error_message AS access_reason
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    LEFT JOIN centers c ON u.center_id = c.id,
    LATERAL (
        SELECT * FROM validate_password_reset_access(p_admin_user_id, u.id)
        LIMIT 1
    ) access_check
    WHERE u.active = true
    ORDER BY u.name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_employee_type_statistics()
RETURNS TABLE (
    total_users                INTEGER,
    corporate_users            INTEGER,
    team_based_users           INTEGER,
    center_specific_users      INTEGER,
    users_with_default_password INTEGER,
    users_with_changed_password INTEGER,
    active_users_last_7d       INTEGER,
    active_users_last_30d      INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER                                                                                AS total_users,
        COUNT(CASE WHEN ur.is_corporate_role = true THEN 1 END)::INTEGER                                AS corporate_users,
        COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = true THEN 1 END)::INTEGER   AS team_based_users,
        COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = false THEN 1 END)::INTEGER  AS center_specific_users,
        -- Fix: IS NULL instead of = false
        COUNT(CASE WHEN u.password_changed IS NULL THEN 1 END)::INTEGER                                 AS users_with_default_password,
        -- Fix: IS NOT NULL instead of = true
        COUNT(CASE WHEN u.password_changed IS NOT NULL THEN 1 END)::INTEGER                             AS users_with_changed_password,
        COUNT(CASE WHEN u.last_login >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END)::INTEGER           AS active_users_last_7d,
        COUNT(CASE WHEN u.last_login >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END)::INTEGER          AS active_users_last_30d
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    WHERE u.active = true;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_password_reset(
    p_user_id     INTEGER,
    p_admin_id    INTEGER,
    p_reset_reason TEXT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO password_reset_log (user_id, admin_id, reset_reason, created_at)
    VALUES (p_user_id, p_admin_id, p_reset_reason, NOW());
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error logging password reset: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_password_history_with_type(
    p_user_id      INTEGER,
    p_old_password TEXT,
    p_new_password TEXT,
    p_changed_by   INTEGER,
    p_reset_reason TEXT
) RETURNS VOID AS $$
DECLARE
    policy        RECORD;
    current_history JSONB;
    new_history   JSONB;
    user_type     VARCHAR(20);
BEGIN
    SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN policy.max_reuse_count := 5; END IF;

    SELECT CASE
        WHEN ur.is_corporate_role = true        THEN 'Corporate'
        WHEN ur.can_access_all_centers = true   THEN 'Team-Based'
        ELSE 'Center-Specific'
    END
    INTO user_type
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    WHERE u.id = p_user_id;

    SELECT password_history INTO current_history FROM user_passwords WHERE user_id = p_user_id;

    IF current_history IS NULL THEN
        new_history := to_jsonb(ARRAY[p_old_password]);
    ELSE
        new_history := jsonb_array_append(current_history, to_jsonb(p_old_password));
        IF jsonb_array_length(new_history) > policy.max_reuse_count THEN
            new_history := new_history #- '0';
        END IF;
    END IF;

    INSERT INTO user_passwords (user_id, password_history, changed_by, notes, created_at, updated_at)
    VALUES (p_user_id, new_history, p_changed_by,
            CONCAT('Password reset - Type: ', user_type, ', Reason: ', p_reset_reason),
            NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        password_history = new_history,
        changed_by       = p_changed_by,
        notes            = CONCAT('Password reset - Type: ', user_type, ', Reason: ', p_reset_reason),
        updated_at       = NOW();

    PERFORM log_password_reset(p_user_id, p_changed_by, p_reset_reason);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_password_policy(
    p_password TEXT,
    p_user_id  INTEGER DEFAULT NULL
) RETURNS TABLE (
    is_valid       BOOLEAN,
    error_message  TEXT,
    strength_score INTEGER,
    strength_level VARCHAR(20)
) AS $$
DECLARE
    policy         RECORD;
    score          INTEGER := 0;
    error_msg      TEXT := '';
    v_strength     VARCHAR(20);
BEGIN
    SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN
        policy.min_length               := 8;
        policy.require_uppercase        := true;
        policy.require_lowercase        := true;
        policy.require_numbers          := true;
        policy.require_special_chars    := true;
        policy.prevent_common_passwords := true;
        policy.prevent_reuse            := true;
        policy.max_reuse_count          := 5;
    END IF;

    IF LENGTH(p_password) < policy.min_length THEN
        error_msg := error_msg || 'Password must be at least ' || policy.min_length || ' characters long. ';
    ELSE
        score := score + 20;
    END IF;

    IF policy.require_uppercase AND NOT p_password ~ '[A-Z]' THEN
        error_msg := error_msg || 'Password must contain at least one uppercase letter. ';
    ELSE
        score := score + 20;
    END IF;

    IF policy.require_lowercase AND NOT p_password ~ '[a-z]' THEN
        error_msg := error_msg || 'Password must contain at least one lowercase letter. ';
    ELSE
        score := score + 20;
    END IF;

    IF policy.require_numbers AND NOT p_password ~ '[0-9]' THEN
        error_msg := error_msg || 'Password must contain at least one number. ';
    ELSE
        score := score + 20;
    END IF;

    IF policy.require_special_chars AND NOT p_password ~ '[!@#$%^&*(),.?":{}|<>]' THEN
        error_msg := error_msg || 'Password must contain at least one special character. ';
    ELSE
        score := score + 20;
    END IF;

    IF policy.prevent_common_passwords THEN
        IF p_password IN ('password','123456','123456789','qwerty','abc123','password123','admin','letmein','welcome','monkey','1234567890','password1','qwertyuiop','starwars','iloveyou','princess','dragon','baseball','football') THEN
            error_msg := error_msg || 'Password is too common. Please choose a stronger password. ';
            score := score - 20;
        END IF;
    END IF;

    IF LENGTH(p_password) >= 12 THEN score := score + 10; END IF;
    IF p_password ~ '(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}' THEN score := score + 10; END IF;

    v_strength := CASE
        WHEN score >= 80 THEN 'Very Strong'
        WHEN score >= 60 THEN 'Strong'
        WHEN score >= 40 THEN 'Medium'
        WHEN score >= 20 THEN 'Weak'
        ELSE 'Very Weak'
    END;

    RETURN QUERY SELECT (error_msg = ''), error_msg, score, v_strength;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_password_reuse(
    p_user_id     INTEGER,
    p_new_password TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    policy           RECORD;
    v_history        JSONB;
    old_password     TEXT;
    is_reused        BOOLEAN := FALSE;
BEGIN
    SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND OR NOT policy.prevent_reuse THEN RETURN FALSE; END IF;

    SELECT password_history INTO v_history FROM user_passwords WHERE user_id = p_user_id;
    IF v_history IS NULL THEN RETURN FALSE; END IF;

    FOR i IN 0..policy.max_reuse_count - 1 LOOP
        IF i < jsonb_array_length(v_history) THEN
            old_password := v_history->>i;
            IF p_new_password = old_password THEN
                is_reused := TRUE;
                EXIT;
            END IF;
        END IF;
    END LOOP;

    RETURN is_reused;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_password_history(
    p_user_id      INTEGER,
    p_old_password TEXT,
    p_new_password TEXT,
    p_changed_by   INTEGER DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    policy          RECORD;
    current_history JSONB;
    new_history     JSONB;
BEGIN
    SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN policy.max_reuse_count := 5; END IF;

    SELECT password_history INTO current_history FROM user_passwords WHERE user_id = p_user_id;

    IF current_history IS NULL THEN
        new_history := to_jsonb(ARRAY[p_old_password]);
    ELSE
        new_history := jsonb_array_append(current_history, to_jsonb(p_old_password));
        IF jsonb_array_length(new_history) > policy.max_reuse_count THEN
            new_history := new_history #- '0';
        END IF;
    END IF;

    INSERT INTO user_passwords (user_id, password_history, changed_by, created_at, updated_at)
    VALUES (p_user_id, new_history, p_changed_by, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        password_history = new_history,
        changed_by       = p_changed_by,
        updated_at       = NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_password_history_trigger()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_password_history(NEW.id, NULL, NEW.password_hash, NULL);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_password_expiry(
    p_user_id INTEGER
) RETURNS TABLE (
    needs_change      BOOLEAN,
    days_until_expiry INTEGER,
    warning_message   TEXT
) AS $$
DECLARE
    policy            RECORD;
    last_changed      TIMESTAMP;
    v_days_until      INTEGER;
BEGIN
    SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN policy.password_expiry_days := 90; END IF;

    SELECT password_changed INTO last_changed FROM users WHERE id = p_user_id AND active = true;

    IF last_changed IS NULL THEN
        RETURN QUERY SELECT true, 0, 'Password has never been changed. Please change it now.'::TEXT;
        RETURN;
    END IF;

    v_days_until := policy.password_expiry_days - EXTRACT(DAY FROM (CURRENT_DATE - last_changed::DATE))::INTEGER;

    IF v_days_until <= 0 THEN
        RETURN QUERY SELECT true, v_days_until, 'Password has expired. Please change it immediately.'::TEXT;
    ELSIF v_days_until <= 7 THEN
        RETURN QUERY SELECT true, v_days_until,
            ('Password will expire in ' || v_days_until || ' days. Please change it soon.')::TEXT;
    ELSE
        RETURN QUERY SELECT false, v_days_until, NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_password_compliance_report()
RETURNS TABLE (
    total_users               INTEGER,
    users_with_strong_passwords INTEGER,
    users_with_weak_passwords  INTEGER,
    users_with_expired_passwords INTEGER,
    users_with_default_passwords INTEGER,
    compliance_percentage      DECIMAL(5,2)
) AS $$
DECLARE
    total_count   INTEGER;
    strong_count  INTEGER;
    weak_count    INTEGER;
    expired_count INTEGER;
    default_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM users WHERE active = true;

    -- Fix: IS NOT NULL instead of = true; timestamp >= comparison is fine
    SELECT COUNT(*) INTO strong_count
    FROM users
    WHERE active = true
      AND password_changed IS NOT NULL
      AND password_changed >= CURRENT_DATE - INTERVAL '30 days';

    -- Fix: IS NULL instead of = false; timestamp < comparison is fine
    SELECT COUNT(*) INTO weak_count
    FROM users
    WHERE active = true
      AND (password_changed IS NULL OR password_changed < CURRENT_DATE - INTERVAL '90 days');

    SELECT COUNT(*) INTO expired_count
    FROM users
    WHERE active = true
      AND password_changed < CURRENT_DATE - INTERVAL '90 days';

    -- Fix: IS NULL instead of = false
    SELECT COUNT(*) INTO default_count
    FROM users
    WHERE active = true
      AND password_changed IS NULL;

    RETURN QUERY SELECT
        total_count,
        strong_count,
        weak_count,
        expired_count,
        default_count,
        CASE WHEN total_count > 0 THEN ROUND((strong_count * 100.0 / total_count), 2) ELSE 0 END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_password_reset_access_matrix()
RETURNS TABLE (
    admin_type  VARCHAR(20),
    target_type VARCHAR(20),
    can_reset   BOOLEAN,
    access_rule TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.admin_type,
        t.target_type,
        CASE
            WHEN a.admin_type = 'Super Admin'    THEN true
            WHEN a.admin_type = 'Corporate'      AND t.target_type IN ('Corporate','Team-Based') THEN true
            WHEN a.admin_type = 'Team-Based'     AND t.target_type IN ('Team-Based','Center-Specific') THEN true
            WHEN a.admin_type = 'Center-Specific' AND t.target_type = 'Center-Specific' THEN true
            ELSE false
        END AS can_reset,
        CASE
            WHEN a.admin_type = 'Super Admin'    THEN 'Can reset any user password'
            WHEN a.admin_type = 'Corporate'      AND t.target_type IN ('Corporate','Team-Based') THEN 'Can reset corporate and team-based users'
            WHEN a.admin_type = 'Team-Based'     AND t.target_type IN ('Team-Based','Center-Specific') THEN 'Can reset team-based and center-specific users'
            WHEN a.admin_type = 'Center-Specific' AND t.target_type = 'Center-Specific' THEN 'Can reset center-specific users in same center'
            ELSE 'No access'
        END AS access_rule
    FROM (VALUES ('Super Admin'::VARCHAR(20)),('Corporate'::VARCHAR(20)),('Team-Based'::VARCHAR(20)),('Center-Specific'::VARCHAR(20))) AS a(admin_type)
    CROSS JOIN (VALUES ('Corporate'::VARCHAR(20)),('Team-Based'::VARCHAR(20)),('Center-Specific'::VARCHAR(20))) AS t(target_type)
    ORDER BY a.admin_type, t.target_type;
END;
$$ LANGUAGE plpgsql;

-- Fix: admin_reset_password uses TIMESTAMP for password_changed
CREATE OR REPLACE FUNCTION admin_reset_password(
    p_user_id       INTEGER,
    p_admin_user_id INTEGER,
    p_temp_password TEXT,
    p_force_change  BOOLEAN DEFAULT true
) RETURNS BOOLEAN AS $$
DECLARE
    policy RECORD;
BEGIN
    SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN
        policy.min_length            := 8;
        policy.require_uppercase     := true;
        policy.require_lowercase     := true;
        policy.require_numbers       := true;
        policy.require_special_chars := true;
    END IF;

    IF LENGTH(p_temp_password) < policy.min_length THEN
        RAISE EXCEPTION 'Temporary password must be at least % characters', policy.min_length;
    END IF;
    IF policy.require_uppercase AND NOT p_temp_password ~ '[A-Z]' THEN
        RAISE EXCEPTION 'Temporary password must contain at least one uppercase letter';
    END IF;
    IF policy.require_lowercase AND NOT p_temp_password ~ '[a-z]' THEN
        RAISE EXCEPTION 'Temporary password must contain at least one lowercase letter';
    END IF;
    IF policy.require_numbers AND NOT p_temp_password ~ '[0-9]' THEN
        RAISE EXCEPTION 'Temporary password must contain at least one number';
    END IF;
    IF policy.require_special_chars AND NOT p_temp_password ~ '[!@#$%^&*(),.?":{}|<>]' THEN
        RAISE EXCEPTION 'Temporary password must contain at least one special character';
    END IF;

    -- Update user password; if force_change then clear password_changed (NULL = needs reset),
    -- otherwise stamp with current timestamp.
    UPDATE users
    SET password_hash    = p_temp_password,   -- caller should pass bcrypt hash
        password_changed = CASE WHEN p_force_change THEN NULL ELSE CURRENT_TIMESTAMP END,
        updated_at       = NOW()
    WHERE id = p_user_id AND active = true;

    PERFORM update_password_history(p_user_id, NULL, p_temp_password, p_admin_user_id);

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error resetting password: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Views (fix: password_changed IS NOT NULL / IS NULL)
CREATE OR REPLACE VIEW password_reset_statistics AS
SELECT
    'PASSWORD_RESET_STATS'                                                                                      AS stats_type,
    COUNT(*)                                                                                                    AS total_resets,
    COUNT(CASE WHEN ur.is_corporate_role = true THEN 1 END)                                                     AS corporate_resets,
    COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = true THEN 1 END)               AS team_based_resets,
    COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = false THEN 1 END)              AS center_specific_resets,
    COUNT(CASE WHEN prl.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END)                             AS resets_last_7d,
    COUNT(CASE WHEN prl.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END)                            AS resets_last_30d,
    COUNT(CASE WHEN prl.created_at >= CURRENT_DATE - INTERVAL '90 days' THEN 1 END)                            AS resets_last_90d,
    CURRENT_TIMESTAMP                                                                                           AS last_updated
FROM password_reset_log prl
LEFT JOIN users u ON prl.user_id = u.id
LEFT JOIN user_roles ur ON u.role = ur.role
WHERE u.active = true;

CREATE OR REPLACE VIEW employee_type_password_compliance AS
SELECT
    'PASSWORD_COMPLIANCE'                                                                                                                    AS compliance_type,
    COUNT(*)                                                                                                                                 AS total_users,
    COUNT(CASE WHEN ur.is_corporate_role = true THEN 1 END)                                                                                  AS corporate_users,
    COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = true THEN 1 END)                                            AS team_based_users,
    COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = false THEN 1 END)                                           AS center_specific_users,
    -- Fix: IS NOT NULL instead of = true
    COUNT(CASE WHEN u.password_changed IS NOT NULL THEN 1 END)                                                                               AS users_with_changed_password,
    -- Fix: IS NULL instead of = false
    COUNT(CASE WHEN u.password_changed IS NULL THEN 1 END)                                                                                   AS users_with_default_password,
    -- Fix: first condition uses IS NOT NULL; timestamp comparison remains valid
    COUNT(CASE WHEN u.password_changed IS NOT NULL AND u.password_changed >= CURRENT_DATE - INTERVAL '90 days' THEN 1 END)                  AS users_with_current_password,
    COUNT(CASE WHEN u.password_changed IS NOT NULL AND u.password_changed < CURRENT_DATE - INTERVAL '90 days' THEN 1 END)                   AS users_with_expired_password,
    COUNT(CASE WHEN u.last_login >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END)                                                            AS active_users_last_7d,
    COUNT(CASE WHEN u.last_login >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END)                                                           AS active_users_last_30d,
    CURRENT_TIMESTAMP                                                                                                                        AS last_updated
FROM users u
LEFT JOIN user_roles ur ON u.role = ur.role
WHERE u.active = true;

CREATE OR REPLACE VIEW password_statistics AS
SELECT
    'PASSWORD_STATS'                                                                                                  AS stats_type,
    (SELECT COUNT(*) FROM users WHERE active = true)                                                                  AS total_users,
    -- Fix: IS NOT NULL instead of = true
    (SELECT COUNT(*) FROM users WHERE password_changed IS NOT NULL AND active = true)                                 AS users_with_changed_password,
    -- Fix: IS NULL instead of = false
    (SELECT COUNT(*) FROM users WHERE password_changed IS NULL AND active = true)                                     AS users_with_default_password,
    (SELECT AVG(CURRENT_DATE - password_changed::DATE)
     FROM users WHERE password_changed IS NOT NULL AND active = true)                                                 AS avg_days_since_password_change,
    (SELECT COUNT(*) FROM password_settings WHERE active = true)                                                      AS active_policies,
    (SELECT min_length FROM password_settings WHERE active = true LIMIT 1)                                            AS current_min_length,
    (SELECT require_uppercase FROM password_settings WHERE active = true LIMIT 1)                                     AS current_require_uppercase,
    (SELECT require_lowercase FROM password_settings WHERE active = true LIMIT 1)                                     AS current_require_lowercase,
    (SELECT require_numbers FROM password_settings WHERE active = true LIMIT 1)                                       AS current_require_numbers,
    (SELECT require_special_chars FROM password_settings WHERE active = true LIMIT 1)                                 AS current_require_special_chars,
    (SELECT prevent_common_passwords FROM password_settings WHERE active = true LIMIT 1)                              AS current_prevent_common_passwords,
    (SELECT prevent_reuse FROM password_settings WHERE active = true LIMIT 1)                                         AS current_prevent_reuse,
    (SELECT max_reuse_count FROM password_settings WHERE active = true LIMIT 1)                                       AS current_max_reuse_count,
    (SELECT session_timeout FROM password_settings WHERE active = true LIMIT 1)                                       AS current_session_timeout,
    (SELECT lockout_threshold FROM password_settings WHERE active = true LIMIT 1)                                     AS current_lockout_threshold,
    (SELECT lockout_duration FROM password_settings WHERE active = true LIMIT 1)                                      AS current_lockout_duration,
    (SELECT password_expiry_days FROM password_settings WHERE active = true LIMIT 1)                                  AS current_password_expiry_days,
    CURRENT_TIMESTAMP                                                                                                 AS last_updated;
