-- PASSWORD SETTINGS DATABASE SCHEMA (Enhanced with Employee Types)

-- PASSWORD SETTINGS TABLE
CREATE TABLE password_settings (
  id SERIAL PRIMARY KEY,
  min_length INTEGER DEFAULT 8,
  require_uppercase BOOLEAN DEFAULT true,
  require_lowercase BOOLEAN DEFAULT true,
  require_numbers BOOLEAN DEFAULT true,
  require_special_chars BOOLEAN DEFAULT true,
  prevent_common_passwords BOOLEAN DEFAULT true,
  prevent_reuse BOOLEAN DEFAULT true,
  max_reuse_count INTEGER DEFAULT 5,
  session_timeout INTEGER DEFAULT 30,
  lockout_threshold INTEGER DEFAULT 5,
  lockout_duration INTEGER DEFAULT 30,
  password_expiry_days INTEGER DEFAULT 90,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- USER PASSWORDS TABLE (for password history)
CREATE TABLE user_passwords (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  password_history JSONB,
  changed_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- PASSWORD RESET LOG TABLE
CREATE TABLE password_reset_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  admin_id INTEGER REFERENCES users(id),
  reset_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EMPLOYEE TYPE DEFINITIONS
-- 1. Corporate Employees: is_corporate_role = true (access to all centers)
-- 2. Team-Based Employees: is_corporate_role = false, can_access_all_centers = true (access to all centers but not corporate)
-- 3. Center-Specific Employees: is_corporate_role = false, can_access_all_centers = false (access to specific centers only)

-- Insert default password settings
INSERT INTO password_settings (
  min_length, require_uppercase, require_lowercase, require_numbers,
  require_special_chars, prevent_common_passwords, prevent_reuse,
  max_reuse_count, session_timeout, lockout_threshold, lockout_duration,
  password_expiry_days, created_at, updated_at, active
) VALUES
(8, true, true, true, true, true, true, 5, 30, 5, 30, 90, NOW(), NOW(), true);

-- Create indexes for performance
CREATE INDEX idx_password_settings_active ON password_settings(active);
CREATE INDEX idx_user_passwords_user_id ON user_passwords(user_id);
CREATE INDEX idx_user_passwords_changed_by ON user_passwords(changed_by);
CREATE INDEX idx_password_reset_log_user_id ON password_reset_log(user_id);
CREATE INDEX idx_password_reset_log_admin_id ON password_reset_log(admin_id);
CREATE INDEX idx_password_reset_log_created_at ON password_reset_log(created_at);

-- Create function to validate password reset access based on employee types
CREATE OR REPLACE FUNCTION validate_password_reset_access(
  p_admin_user_id INTEGER,
  p_target_user_id INTEGER
) RETURNS TABLE (
  has_access BOOLEAN,
  error_message TEXT,
  admin_type VARCHAR(20),
  target_type VARCHAR(20)
) AS $$
DECLARE
  admin_user RECORD;
  target_user RECORD;
BEGIN
  -- Get admin user details
  SELECT u.id, u.name, u.role, u.center_id,
         ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
         ur.permissions
  INTO admin_user
  FROM users u
  LEFT JOIN user_roles ur ON u.role = ur.role
  WHERE u.id = p_admin_user_id AND u.active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Admin user not found', NULL, NULL;
    RETURN;
  END IF;
  
  -- Get target user details
  SELECT u.id, u.name, u.role, u.center_id,
         ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
         c.name as center_name
  INTO target_user
  FROM users u
  LEFT JOIN user_roles ur ON u.role = ur.role
  LEFT JOIN centers c ON u.center_id = c.id
  WHERE u.id = p_target_user_id AND u.active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Target user not found', NULL, NULL;
    RETURN;
  END IF;
  
  -- Determine employee types
  DECLARE
    admin_type VARCHAR(20);
    target_type VARCHAR(20);
  BEGIN
    admin_type := CASE 
      WHEN admin_user.is_corporate_role = true THEN 'Corporate'
      WHEN admin_user.can_access_all_centers = true THEN 'Team-Based'
      ELSE 'Center-Specific'
    END;
    
    target_type := CASE 
      WHEN target_user.is_corporate_role = true THEN 'Corporate'
      WHEN target_user.can_access_all_centers = true THEN 'Team-Based'
      ELSE 'Center-Specific'
    END;
  END;
  
  -- Super admin can reset anyone's password
  IF admin_user.role = 'SUPER_ADMIN' OR admin_user.permissions ? 'ALL_ACCESS' THEN
    RETURN QUERY SELECT true, 'Access granted (Super Admin)', admin_type, target_type;
    RETURN;
  END IF;
  
  -- Check if admin has USER_UPDATE permission
  IF NOT (admin_user.permissions ? 'USER_UPDATE') THEN
    RETURN QUERY SELECT false, 'Insufficient permissions to reset passwords', admin_type, target_type;
    RETURN;
  END IF;
  
  -- Corporate admin can reset any corporate user's password
  IF admin_user.is_corporate_role = true OR admin_user.can_access_all_centers = true THEN
    IF target_user.is_corporate_role = true OR target_user.can_access_all_centers = true THEN
      RETURN QUERY SELECT true, 'Access granted (Corporate to Corporate/Team)', admin_type, target_type;
      RETURN;
    END IF;
  END IF;
  
  -- Center manager can reset passwords for:
  -- 1. Users in their own center
  -- 2. Team-based users (if admin is team-based)
  -- 3. Center-specific users in their center
  IF admin_user.center_id IS NOT NULL THEN
    -- Same center access
    IF target_user.center_id = admin_user.center_id THEN
      RETURN QUERY SELECT true, 'Access granted (Same Center)', admin_type, target_type;
      RETURN;
    END IF;
    
    -- Team-based admin can reset team-based users
    IF admin_user.can_access_all_centers = true AND target_user.is_corporate_role = false THEN
      RETURN QUERY SELECT true, 'Access granted (Team-Based to Team-Based)', admin_type, target_type;
      RETURN;
    END IF;
  END IF;
  
  -- Check if admin has access to target user's center
  IF admin_user.allowed_centers IS NOT NULL AND target_user.center_id = ANY(admin_user.allowed_centers) THEN
    RETURN QUERY SELECT true, 'Access granted (Allowed Center)', admin_type, target_type;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT false, 'Access denied based on employee type and center access', admin_type, target_type;
END;
$$ LANGUAGE plpgsql;

-- Create function to get accessible users for password reset
CREATE OR REPLACE FUNCTION get_password_reset_accessible_users(
  p_admin_user_id INTEGER
) RETURNS TABLE (
  user_id INTEGER,
  user_name VARCHAR(100),
  user_email VARCHAR(100),
  user_role VARCHAR(50),
  role_name VARCHAR(100),
  center_id INTEGER,
  center_name VARCHAR(100),
  employee_type VARCHAR(20),
  password_status VARCHAR(20),
  has_access BOOLEAN,
  access_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH admin_info AS (
    SELECT 
      u.id, u.name, u.role, u.center_id,
      ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
      ur.permissions
    FROM users u
    LEFT JOIN user_roles ur ON u.role = ur.role
    WHERE u.id = p_admin_user_id AND u.active = true
  )
  SELECT 
    u.id as user_id,
    u.name as user_name,
    u.email as user_email,
    u.role as user_role,
    ur.role_name,
    u.center_id,
    c.name as center_name,
    CASE 
      WHEN ur.is_corporate_role = true THEN 'Corporate'
      WHEN ur.can_access_all_centers = true THEN 'Team-Based'
      ELSE 'Center-Specific'
    END as employee_type,
    CASE 
      WHEN u.password_changed = false THEN 'Default'
      WHEN u.password_changed IS NULL THEN 'Never Changed'
      ELSE 'Changed'
    END as password_status,
    access_check.has_access,
    access_check.error_message as access_reason
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

-- Create function to get employee type statistics
CREATE OR REPLACE FUNCTION get_employee_type_statistics()
RETURNS TABLE (
  total_users INTEGER,
  corporate_users INTEGER,
  team_based_users INTEGER,
  center_specific_users INTEGER,
  users_with_default_password INTEGER,
  users_with_changed_password INTEGER,
  active_users_last_7d INTEGER,
  active_users_last_30d INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN ur.is_corporate_role = true THEN 1 END) as corporate_users,
    COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = true THEN 1 END) as team_based_users,
    COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = false THEN 1 END) as center_specific_users,
    COUNT(CASE WHEN u.password_changed = false THEN 1 END) as users_with_default_password,
    COUNT(CASE WHEN u.password_changed = true THEN 1 END) as users_with_changed_password,
    COUNT(CASE WHEN u.last_login >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as active_users_last_7d,
    COUNT(CASE WHEN u.last_login >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as active_users_last_30d
  FROM users u
  LEFT JOIN user_roles ur ON u.role = ur.role
  WHERE u.active = true;
END;
$$ LANGUAGE plpgsql;

-- Create function to log password reset
CREATE OR REPLACE FUNCTION log_password_reset(
  p_user_id INTEGER,
  p_admin_id INTEGER,
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

-- Create function to update password history with employee type tracking
CREATE OR REPLACE FUNCTION update_password_history_with_type(
  p_user_id INTEGER,
  p_old_password TEXT,
  p_new_password TEXT,
  p_changed_by INTEGER,
  p_reset_reason TEXT
) RETURNS VOID AS $$
DECLARE
  policy RECORD;
  current_history JSONB;
  new_history JSONB;
  user_type VARCHAR(20);
BEGIN
  -- Get password policy
  SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
  
  IF NOT FOUND THEN
    policy.max_reuse_count := 5;
  END IF;
  
  -- Get user type
  SELECT 
    CASE 
      WHEN ur.is_corporate_role = true THEN 'Corporate'
      WHEN ur.can_access_all_centers = true THEN 'Team-Based'
      ELSE 'Center-Specific'
    END
  INTO user_type
  FROM users u
  LEFT JOIN user_roles ur ON u.role = ur.role
  WHERE u.id = p_user_id;
  
  -- Get current password history
  SELECT password_history INTO current_history 
  FROM user_passwords 
  WHERE user_id = p_user_id;
  
  -- Build new history with metadata
  IF current_history IS NULL THEN
    new_history := to_jsonb(ARRAY[p_old_password]);
  ELSE
    new_history := jsonb_array_append(current_history, to_jsonb(p_old_password));
    -- Keep only the last max_reuse_count passwords
    IF jsonb_array_length(new_history) > policy.max_reuse_count THEN
      new_history := new_history #- '0';
    END IF;
  END IF;
  
  -- Update password history with metadata
  INSERT INTO user_passwords (user_id, password_history, changed_by, notes, created_at, updated_at)
  VALUES (p_user_id, new_history, p_changed_by, 
          CONCAT('Password reset - Type: ', user_type, ', Reason: ', p_reset_reason), 
          NOW(), NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    password_history = new_history,
    changed_by = p_changed_by,
    notes = CONCAT('Password reset - Type: ', user_type, ', Reason: ', p_reset_reason),
    updated_at = NOW();
  
  -- Log the password reset
  PERFORM log_password_reset(p_user_id, p_changed_by, p_reset_reason);
END;
$$ LANGUAGE plpgsql;

-- Create view for password reset statistics by employee type
CREATE OR REPLACE VIEW password_reset_statistics AS
SELECT 
  'PASSWORD_RESET_STATS' as stats_type,
  COUNT(*) as total_resets,
  COUNT(CASE WHEN ur.is_corporate_role = true THEN 1 END) as corporate_resets,
  COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = true THEN 1 END) as team_based_resets,
  COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = false THEN 1 END) as center_specific_resets,
  COUNT(CASE WHEN prl.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as resets_last_7d,
  COUNT(CASE WHEN prl.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as resets_last_30d,
  COUNT(CASE WHEN prl.created_at >= CURRENT_DATE - INTERVAL '90 days' THEN 1 END) as resets_last_90d,
  CURRENT_TIMESTAMP as last_updated
FROM password_reset_log prl
LEFT JOIN users u ON prl.user_id = u.id
LEFT JOIN user_roles ur ON u.role = ur.role
WHERE u.active = true;

-- Create view for employee type password compliance
CREATE OR REPLACE VIEW employee_type_password_compliance AS
SELECT 
  'PASSWORD_COMPLIANCE' as compliance_type,
  COUNT(*) as total_users,
  COUNT(CASE WHEN ur.is_corporate_role = true THEN 1 END) as corporate_users,
  COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = true THEN 1 END) as team_based_users,
  COUNT(CASE WHEN ur.is_corporate_role = false AND ur.can_access_all_centers = false THEN 1 END) as center_specific_users,
  COUNT(CASE WHEN u.password_changed = true THEN 1 END) as users_with_changed_password,
  COUNT(CASE WHEN u.password_changed = false THEN 1 END) as users_with_default_password,
  COUNT(CASE WHEN u.password_changed = true AND u.password_changed >= CURRENT_DATE - INTERVAL '90 days' THEN 1 END) as users_with_current_password,
  COUNT(CASE WHEN u.password_changed = true AND u.password_changed < CURRENT_DATE - INTERVAL '90 days' THEN 1 END) as users_with_expired_password,
  COUNT(CASE WHEN u.last_login >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as active_users_last_7d,
  COUNT(CASE WHEN u.last_login >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as active_users_last_30d,
  CURRENT_TIMESTAMP as last_updated
FROM users u
LEFT JOIN user_roles ur ON u.role = ur.role
WHERE u.active = true;

-- Create function to get password reset access matrix
CREATE OR REPLACE FUNCTION get_password_reset_access_matrix()
RETURNS TABLE (
  admin_type VARCHAR(20),
  target_type VARCHAR(20),
  can_reset BOOLEAN,
  access_rule TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    admin_type.admin_type,
    target_type.target_type,
    CASE 
      WHEN admin_type.admin_type = 'Super Admin' THEN true
      WHEN admin_type.admin_type = 'Corporate' AND target_type.target_type IN ('Corporate', 'Team-Based') THEN true
      WHEN admin_type.admin_type = 'Team-Based' AND target_type.target_type IN ('Team-Based', 'Center-Specific') THEN true
      WHEN admin_type.admin_type = 'Center-Specific' AND target_type.target_type = 'Center-Specific' THEN true
      ELSE false
    END as can_reset,
    CASE 
      WHEN admin_type.admin_type = 'Super Admin' THEN 'Can reset any user password'
      WHEN admin_type.admin_type = 'Corporate' AND target_type.target_type IN ('Corporate', 'Team-Based') THEN 'Can reset corporate and team-based users'
      WHEN admin_type.admin_type = 'Team-Based' AND target_type.target_type IN ('Team-Based', 'Center-Specific') THEN 'Can reset team-based and center-specific users'
      WHEN admin_type.admin_type = 'Center-Specific' AND target_type.target_type = 'Center-Specific' THEN 'Can reset center-specific users in same center'
      ELSE 'No access'
    END as access_rule
  FROM (
    SELECT 'Super Admin' as admin_type UNION
    SELECT 'Corporate' as admin_type UNION
    SELECT 'Team-Based' as admin_type UNION
    SELECT 'Center-Specific' as admin_type
  ) admin_type
  CROSS JOIN (
    SELECT 'Corporate' as target_type UNION
    SELECT 'Team-Based' as target_type UNION
    SELECT 'Center-Specific' as target_type
  ) target_type
  ORDER BY admin_type.admin_type, target_type.target_type;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate password against policy
CREATE OR REPLACE FUNCTION validate_password_policy(
  p_password TEXT,
  p_user_id INTEGER DEFAULT NULL
) RETURNS TABLE (
  is_valid BOOLEAN,
  error_message TEXT,
  strength_score INTEGER,
  strength_level VARCHAR(20)
) AS $$
DECLARE
  policy RECORD;
  score INTEGER := 0;
  error_msg TEXT := '';
  strength_level VARCHAR(20);
BEGIN
  -- Get current password policy
  SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
  
  IF NOT FOUND THEN
    -- Use default policy
    policy.min_length := 8;
    policy.require_uppercase := true;
    policy.require_lowercase := true;
    policy.require_numbers := true;
    policy.require_special_chars := true;
    policy.prevent_common_passwords := true;
    policy.prevent_reuse := true;
    policy.max_reuse_count := 5;
  END IF;
  
  -- Check minimum length
  IF LENGTH(p_password) < policy.min_length THEN
    error_msg := error_msg || 'Password must be at least ' || policy.min_length || ' characters long. ';
  ELSE
    score := score + 20;
  END IF;
  
  -- Check uppercase requirement
  IF policy.require_uppercase AND NOT p_password ~ '[A-Z]' THEN
    error_msg := error_msg || 'Password must contain at least one uppercase letter. ';
  ELSE
    score := score + 20;
  END IF;
  
  -- Check lowercase requirement
  IF policy.require_lowercase AND NOT p_password ~ '[a-z]' THEN
    error_msg := error_msg || 'Password must contain at least one lowercase letter. ';
  ELSE
    score := score + 20;
  END IF;
  
  -- Check numbers requirement
  IF policy.require_numbers AND NOT p_password ~ '[0-9]' THEN
    error_msg := error_msg || 'Password must contain at least one number. ';
  ELSE
    score := score + 20;
  END IF;
  
  -- Check special characters requirement
  IF policy.require_special_chars AND NOT p_password ~ '[!@#$%^&*(),.?":{}|<>]' THEN
    error_msg := error_msg || 'Password must contain at least one special character. ';
  ELSE
    score := score + 20;
  END IF;
  
  -- Check common passwords
  IF policy.prevent_common_passwords THEN
    IF p_password IN ('password', '123456', '123456789', 'qwerty', 'abc123', 'password123', 'admin', 'letmein', 'welcome', 'monkey', '1234567890', 'password1', 'qwertyuiop', 'starwars', 'iloveyou', 'princess', 'dragon', 'baseball', 'football') THEN
      error_msg := error_msg || 'Password is too common. Please choose a stronger password. ';
      score := score - 20;
    END IF;
  END IF;
  
  -- Additional scoring for complexity
  IF LENGTH(p_password) >= 12 THEN
    score := score + 10;
  END IF;
  
  IF p_password ~ '(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}' THEN
    score := score + 10;
  END IF;
  
  -- Determine strength level
  IF score >= 80 THEN
    strength_level := 'Very Strong';
  ELSIF score >= 60 THEN
    strength_level := 'Strong';
  ELSIF score >= 40 THEN
    strength_level := 'Medium';
  ELSIF score >= 20 THEN
    strength_level := 'Weak';
  ELSE
    strength_level := 'Very Weak';
  END IF;
  
  RETURN QUERY SELECT 
    error_msg = '' AS is_valid,
    error_msg AS error_message,
    score AS strength_score,
    strength_level;
END;
$$ LANGUAGE plpgsql;

-- Create function to check password reuse
CREATE OR REPLACE FUNCTION check_password_reuse(
  p_user_id INTEGER,
  p_new_password TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  policy RECORD;
  password_history JSONB;
  old_password TEXT;
  is_reused BOOLEAN := FALSE;
BEGIN
  -- Get password policy
  SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
  
  IF NOT FOUND OR NOT policy.prevent_reuse THEN
    RETURN FALSE;
  END IF;
  
  -- Get user's password history
  SELECT password_history INTO password_history 
  FROM user_passwords 
  WHERE user_id = p_user_id;
  
  IF password_history IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check against password history
  FOR i IN 0..policy.max_reuse_count - 1 LOOP
    IF i < jsonb_array_length(password_history) THEN
      old_password := password_history->>i;
      -- In a real implementation, you would compare the hashed passwords
      -- For this example, we'll assume the passwords are stored in a way that allows comparison
      IF p_new_password = old_password THEN
        is_reused := TRUE;
        EXIT;
      END IF;
    END IF;
  END LOOP;
  
  RETURN is_reused;
END;
$$ LANGUAGE plpgsql;

-- Create function to update password history
CREATE OR REPLACE FUNCTION update_password_history(
  p_user_id INTEGER,
  p_old_password TEXT,
  p_new_password TEXT,
  p_changed_by INTEGER DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  policy RECORD;
  current_history JSONB;
  new_history JSONB;
BEGIN
  -- Get password policy
  SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
  
  IF NOT FOUND THEN
    policy.max_reuse_count := 5;
  END IF;
  
  -- Get current password history
  SELECT password_history INTO current_history 
  FROM user_passwords 
  WHERE user_id = p_user_id;
  
  -- Build new history
  IF current_history IS NULL THEN
    new_history := to_jsonb(ARRAY[p_old_password]);
  ELSE
    new_history := jsonb_array_append(current_history, to_jsonb(p_old_password));
    -- Keep only the last max_reuse_count passwords
    IF jsonb_array_length(new_history) > policy.max_reuse_count THEN
      new_history := new_history #- '0';
    END IF;
  END IF;
  
  -- Update password history
  INSERT INTO user_passwords (user_id, password_history, changed_by, created_at, updated_at)
  VALUES (p_user_id, new_history, p_changed_by, NOW(), NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    password_history = new_history,
    changed_by = p_changed_by,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update password history when password changes
CREATE OR REPLACE FUNCTION update_password_history_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Get old password (this would need to be stored temporarily in a session variable)
  -- For now, we'll use the NEW.password as a placeholder
  PERFORM update_password_history(NEW.id, NULL, NEW.password, NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: The trigger implementation would need to be adjusted based on how you handle password updates
-- This is a simplified version

-- Create view for password statistics
CREATE OR REPLACE VIEW password_statistics AS
SELECT 
  'PASSWORD_STATS' as stats_type,
  (SELECT COUNT(*) FROM users WHERE active = true) as total_users,
  (SELECT COUNT(*) FROM users WHERE password_changed = true AND active = true) as users_with_changed_password,
  (SELECT COUNT(*) FROM users WHERE password_changed = false AND active = true) as users_with_default_password,
  (SELECT AVG(EXTRACT(DAY FROM (CURRENT_DATE - password_changed))) 
   FROM users WHERE password_changed IS NOT NULL AND active = true) as avg_days_since_password_change,
  (SELECT COUNT(*) FROM password_settings WHERE active = true) as active_policies,
  (SELECT min_length FROM password_settings WHERE active = true) as current_min_length,
  (SELECT require_uppercase FROM password_settings WHERE active = true) as current_require_uppercase,
  (SELECT require_lowercase FROM password_settings WHERE active = true) as current_require_lowercase,
  (SELECT require_numbers FROM password_settings WHERE active = true) as current_require_numbers,
  (SELECT require_special_chars FROM password_settings WHERE active = true) as current_require_special_chars,
  (SELECT prevent_common_passwords FROM password_settings WHERE active = true) as current_prevent_common_passwords,
  (SELECT prevent_reuse FROM password_settings WHERE active = true) as current_prevent_reuse,
  (SELECT max_reuse_count FROM password_settings WHERE active = true) as current_max_reuse_count,
  (SELECT session_timeout FROM password_settings WHERE active = true) as current_session_timeout,
  (SELECT lockout_threshold FROM password_settings WHERE active = true) as current_lockout_threshold,
  (SELECT lockout_duration FROM password_settings WHERE active = true) as current_lockout_duration,
  (SELECT password_expiry_days FROM password_settings WHERE active = true) as current_password_expiry_days,
  CURRENT_TIMESTAMP as last_updated;

-- Create function to check if password needs to be changed
CREATE OR REPLACE FUNCTION check_password_expiry(
  p_user_id INTEGER
) RETURNS TABLE (
  needs_change BOOLEAN,
  days_until_expiry INTEGER,
  warning_message TEXT
) AS $$
DECLARE
  policy RECORD;
  last_changed TIMESTAMP;
  days_until_expiry INTEGER;
BEGIN
  -- Get password policy
  SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
  
  IF NOT FOUND THEN
    policy.password_expiry_days := 90;
  END IF;
  
  -- Get user's last password change date
  SELECT password_changed INTO last_changed 
  FROM users 
  WHERE id = p_user_id AND active = true;
  
  IF last_changed IS NULL THEN
    RETURN QUERY SELECT 
      true AS needs_change,
      0 AS days_until_expiry,
      'Password has never been changed. Please change it now.' AS warning_message;
  END IF;
  
  -- Calculate days until expiry
  days_until_expiry := policy.password_expiry_days - EXTRACT(DAY FROM (CURRENT_DATE - last_changed));
  
  -- Determine if change is needed
  IF days_until_expiry <= 0 THEN
    RETURN QUERY SELECT 
      true AS needs_change,
      days_until_expiry AS days_until_expiry,
      'Password has expired. Please change it immediately.' AS warning_message;
  ELSIF days_until_expiry <= 7 THEN
    RETURN QUERY SELECT 
      true AS needs_change,
      days_until_expiry AS days_until_expiry,
      'Password will expire in ' || days_until_expiry || ' days. Please change it soon.' AS warning_message;
  ELSE
    RETURN QUERY SELECT 
      false AS needs_change,
      days_until_expiry AS days_until_expiry,
      NULL AS warning_message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to get password compliance report
CREATE OR REPLACE FUNCTION get_password_compliance_report()
RETURNS TABLE (
  total_users INTEGER,
  users_with_strong_passwords INTEGER,
  users_with_weak_passwords INTEGER,
  users_with_expired_passwords INTEGER,
  users_with_default_passwords INTEGER,
  compliance_percentage DECIMAL(5,2)
) AS $$
DECLARE
  total_count INTEGER;
  strong_count INTEGER;
  weak_count INTEGER;
  expired_count INTEGER;
  default_count INTEGER;
BEGIN
  -- Get total users
  SELECT COUNT(*) INTO total_count FROM users WHERE active = true;
  
  -- Get users with strong passwords (this would require password strength calculation)
  -- For now, we'll use a simplified approach
  SELECT COUNT(*) INTO strong_count 
  FROM users 
  WHERE active = true 
    AND password_changed = true 
    AND password_changed >= CURRENT_DATE - INTERVAL '30 days';
  
  -- Get users with weak passwords
  SELECT COUNT(*) INTO weak_count 
  FROM users 
  WHERE active = true 
    AND (password_changed = false OR password_changed < CURRENT_DATE - INTERVAL '90 days');
  
  -- Get users with expired passwords
  SELECT COUNT(*) INTO expired_count 
  FROM users 
  WHERE active = true 
    AND password_changed < CURRENT_DATE - INTERVAL '90 days';
  
  -- Get users with default passwords
  SELECT COUNT(*) INTO default_count 
  FROM users 
  WHERE active = true 
    AND password_changed = false;
  
  RETURN QUERY SELECT 
    total_count AS total_users,
    strong_count AS users_with_strong_passwords,
    weak_count AS users_with_weak_passwords,
    expired_count AS users_with_expired_passwords,
    default_count AS users_with_default_passwords,
    CASE 
      WHEN total_count > 0 THEN ROUND((strong_count * 100.0 / total_count), 2)
      ELSE 0 
    END AS compliance_percentage;
END;
$$ LANGUAGE plpgsql;

-- Create function to reset user password (admin function)
CREATE OR REPLACE FUNCTION admin_reset_password(
  p_user_id INTEGER,
  p_admin_user_id INTEGER,
  p_temp_password TEXT,
  p_force_change BOOLEAN DEFAULT true
) RETURNS BOOLEAN AS $$
DECLARE
  policy RECORD;
  validation_error TEXT;
BEGIN
  -- Get password policy
  SELECT * INTO policy FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1;
  
  IF NOT FOUND THEN
    policy.min_length := 8;
    policy.require_uppercase := true;
    policy.require_lowercase := true;
    policy.require_numbers := true;
    policy.require_special_chars := true;
  END IF;
  
  -- Validate temporary password against policy
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
  
  -- Hash the temporary password
  -- This would use bcrypt in the actual implementation
  
  -- Update user password
  UPDATE users 
  SET password = p_temp_password, -- This would be the hashed password
      password_changed = NOT p_force_change,
      updated_at = NOW()
  WHERE id = p_user_id AND active = true;
  
  -- Update password history
  PERFORM update_password_history(p_user_id, NULL, p_temp_password, p_admin_user_id);
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error resetting password: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
