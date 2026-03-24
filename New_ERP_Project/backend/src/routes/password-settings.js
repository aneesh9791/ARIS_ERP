const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const router = express.Router();

// PASSWORD SETTINGS MANAGEMENT

// Get password policy settings
router.get('/password-policy', async (req, res) => {
  try {
    const query = `
      SELECT 
        id, min_length, require_uppercase, require_lowercase, require_numbers,
        require_special_chars, prevent_common_passwords, prevent_reuse,
        max_reuse_count, session_timeout, lockout_threshold, lockout_duration,
        password_expiry_days, created_at, updated_at, active
      FROM password_settings
      WHERE active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query);

    if (result.rows.length === 0) {
      // Return default policy if no settings exist
      return res.json({
        success: true,
        password_policy: {
          min_length: 8,
          require_uppercase: true,
          require_lowercase: true,
          require_numbers: true,
          require_special_chars: true,
          prevent_common_passwords: true,
          prevent_reuse: true,
          max_reuse_count: 5,
          session_timeout: 30,
          lockout_threshold: 5,
          lockout_duration: 30,
          password_expiry_days: 90,
          active: true
        }
      });
    }

    res.json({
      success: true,
      password_policy: result.rows[0]
    });

  } catch (error) {
    logger.error('Get password policy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update password policy settings
router.put('/password-policy', [
  body('min_length').isInt({ min: 6, max: 50 }),
  body('require_uppercase').isBoolean(),
  body('require_lowercase').isBoolean(),
  body('require_numbers').isBoolean(),
  body('require_special_chars').isBoolean(),
  body('prevent_common_passwords').isBoolean(),
  body('prevent_reuse').isBoolean(),
  body('max_reuse_count').isInt({ min: 3, max: 20 }),
  body('session_timeout').isInt({ min: 15, max: 120 }),
  body('lockout_threshold').isInt({ min: 3, max: 10 }),
  body('lockout_duration').isInt({ min: 5, max: 120 }),
  body('password_expiry_days').isInt({ min: 30, max: 365 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      min_length,
      require_uppercase,
      require_lowercase,
      require_numbers,
      require_special_chars,
      prevent_common_passwords,
      prevent_reuse,
      max_reuse_count,
      session_timeout,
      lockout_threshold,
      lockout_duration,
      password_expiry_days
    } = req.body;

    // Deactivate existing settings
    await pool.query(
      'UPDATE password_settings SET active = false, updated_at = NOW() WHERE active = true'
    );

    // Insert new settings
    const query = `
      INSERT INTO password_settings (
        min_length, require_uppercase, require_lowercase, require_numbers,
        require_special_chars, prevent_common_passwords, prevent_reuse,
        max_reuse_count, session_timeout, lockout_threshold, lockout_duration,
        password_expiry_days, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), true
      ) RETURNING id
    `;

    const result = await pool.query(query, [
      min_length, require_uppercase, require_lowercase, require_numbers,
      require_special_chars, prevent_common_passwords, prevent_reuse,
      max_reuse_count, session_timeout, lockout_threshold, lockout_duration,
      password_expiry_days
    ]);

    logger.info(`Password policy updated: ID ${result.rows[0].id}`);

    res.json({
      message: 'Password policy updated successfully',
      password_policy: {
        id: result.rows[0].id,
        min_length,
        require_uppercase,
        require_lowercase,
        require_numbers,
        require_special_chars,
        prevent_common_passwords,
        prevent_reuse,
        max_reuse_count,
        session_timeout,
        lockout_threshold,
        lockout_duration,
        password_expiry_days
      }
    });

  } catch (error) {
    logger.error('Update password policy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password (current user)
router.post('/change-password', [
  body('current_password').trim().isLength({ min: 1 }),
  body('new_password').trim().isLength({ min: 1 }),
  body('confirm_password').trim().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { current_password, new_password, confirm_password } = req.body;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ error: 'New password and confirm password do not match' });
    }

    // Get current password policy
    const policyQuery = `
      SELECT * FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1
    `;
    const policyResult = await pool.query(policyQuery);
    const policy = policyResult.rows[0] || {
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_numbers: true,
      require_special_chars: true,
      prevent_common_passwords: true,
      prevent_reuse: true,
      max_reuse_count: 5
    };

    // Validate new password against policy
    const validationError = validatePassword(new_password, policy);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Get user's current password and password history
    const userQuery = `
      SELECT u.password, u.password_changed, 
             COALESCE(up.password_history, '[]') as password_history
      FROM users u
      LEFT JOIN user_passwords up ON u.id = up.user_id
      WHERE u.id = $1 AND u.active = true
    `;
    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const passwordHistory = user.password_history || [];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Check if new password is in history
    if (policy.prevent_reuse) {
      for (const oldPassword of passwordHistory.slice(-policy.max_reuse_count)) {
        const isOldPassword = await bcrypt.compare(new_password, oldPassword);
        if (isOldPassword) {
          return res.status(400).json({ error: `Cannot reuse passwords from the last ${policy.max_reuse_count} changes` });
        }
      }
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1, password_changed = true, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );

    // Update password history
    const newPasswordHistory = [...passwordHistory, user.password].slice(-policy.max_reuse_count);
    await pool.query(
      `INSERT INTO user_passwords (user_id, password_history, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET password_history = $2, updated_at = NOW()`,
      [userId, JSON.stringify(newPasswordHistory)]
    );

    // Clear session to force re-login
    req.session.destroy((err) => {
      if (err) {
        logger.error('Session destroy error:', err);
      }
    });

    logger.info(`Password changed for user: ${userId}`);

    res.json({
      message: 'Password changed successfully. Please login again.',
      requires_relogin: true
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Reset user password with access rights validation
router.post('/reset-password', [
  body('user_id').isInt(),
  body('new_password').trim().isLength({ min: 1 }),
  body('confirm_password').trim().isLength({ min: 1 }),
  body('force_change').isBoolean(),
  body('reset_reason').optional().trim().isLength({ min: 5, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_id, new_password, confirm_password, force_change, reset_reason } = req.body;

    if (new_password !== confirm_password) {
      return res.status(400).json({ error: 'New password and confirm password do not match' });
    }

    // Check if current user has permission to reset passwords
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get target user details
    const targetUserQuery = `
      SELECT u.id, u.name, u.email, u.role, u.center_id, u.active,
       ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
       c.name as center_name, c.city, c.state
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      LEFT JOIN centers c ON u.center_id = c.id
      WHERE u.id = $1 AND u.active = true
    `;
    const targetUserResult = await pool.query(targetUserQuery, [user_id]);

    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = targetUserResult.rows[0];

    // Validate admin access rights based on employee types and center access
    const hasAccessRights = validatePasswordResetAccess(currentUser, targetUser);
    if (!hasAccessRights.hasAccess) {
      return res.status(403).json({ error: hasAccessRights.error });
    }

    // Get password policy
    const policyQuery = `
      SELECT * FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1
    `;
    const policyResult = await pool.query(policyQuery);
    const policy = policyResult.rows[0] || {
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_numbers: true,
      require_special_chars: true,
      prevent_common_passwords: true,
      prevent_reuse: true,
      max_reuse_count: 5
    };

    // Validate new password against policy
    const validationError = validatePassword(new_password, policy);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1, password_changed = $2, updated_at = NOW() WHERE id = $3',
      [hashedPassword, !force_change, user_id]
    );

    // Update password history
    const newPasswordHistory = await updateUserPasswordHistory(user_id, null, hashedPassword, currentUser.id);

    // Log the password reset
    await logPasswordReset(user_id, currentUser.id, reset_reason);

    logger.info(`Password reset for user ${user_id} by admin ${currentUser.id} - Reason: ${reset_reason}`);

    res.json({
      message: 'Password reset successfully',
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        role_name: targetUser.role_name,
        center_id: targetUser.center_id,
        center_name: targetUser.center_name,
        employee_type: targetUser.is_corporate_role ? 'Corporate' : 
                      (targetUser.can_access_all_centers ? 'Corporate' : 'Center-Specific'),
        force_change_on_next_login: force_change,
        reset_by: currentUser.name,
        reset_reason: reset_reason
      }
    });

  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get users that admin can reset passwords for
router.get('/reset-accessible-users', async (req, res) => {
  try {
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get current user details with role information
    const currentUserQuery = `
      SELECT u.id, u.name, u.role, u.center_id,
             ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
             ur.permissions
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      WHERE u.id = $1 AND u.active = true
    `;
    const currentUserResult = await pool.query(currentUserQuery, [currentUser.id]);

    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    const adminUser = currentUserResult.rows[0];

    // Check if admin has password reset permission
    if (!adminUser.permissions.includes('USER_UPDATE')) {
      return res.status(403).json({ error: 'Insufficient permissions to reset passwords' });
    }

    // Get users that admin can reset passwords for
    const accessibleUsersQuery = `
      SELECT 
        u.id, u.name, u.email, u.role, u.center_id, u.active, u.last_login,
        ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
        c.name as center_name, c.city, c.state,
        u.password_changed,
        CASE 
          WHEN u.password_changed = false THEN 'Default'
          WHEN u.password_changed IS NULL THEN 'Never Changed'
          ELSE 'Changed'
        END as password_status
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      LEFT JOIN centers c ON u.center_id = c.id
      WHERE u.active = true
      ORDER BY u.name
    `;
    const accessibleUsersResult = await pool.query(accessibleUsersQuery);

    // Filter users based on admin's access rights
    const accessibleUsers = accessibleUsersResult.rows.filter(user => {
      return validatePasswordResetAccess(adminUser, user).hasAccess;
    });

    // Group users by employee type
    const usersByType = {
      corporate: accessibleUsers.filter(u => u.is_corporate_role),
      center_specific: accessibleUsers.filter(u => !u.is_corporate_role && !u.can_access_all_centers),
      team_based: accessibleUsers.filter(u => !u.is_corporate_role && u.can_access_all_centers)
    };

    res.json({
      success: true,
      accessible_users: accessibleUsers,
      users_by_type: usersByType,
      admin_info: {
        id: adminUser.id,
        name: adminUser.name,
        role: adminUser.role,
        role_name: adminUser.role_name,
        employee_type: adminUser.is_corporate_role ? 'Corporate' : 
                      (adminUser.can_access_all_centers ? 'Corporate' : 'Center-Specific'),
        center_id: adminUser.center_id,
        can_access_all_centers: adminUser.can_access_all_centers,
        allowed_centers: adminUser.allowed_centers
      }
    });

  } catch (error) {
    logger.error('Get accessible users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get employee type statistics
router.get('/employee-type-stats', async (req, res) => {
  try {
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const query = `
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
      WHERE u.active = true
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      statistics: result.rows[0]
    });

  } catch (error) {
    logger.error('Get employee type stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk password reset for multiple users
router.post('/bulk-reset-password', [
  body('user_ids').isArray(),
  body('new_password').trim().isLength({ min: 1 }),
  body('confirm_password').trim().isLength({ min: 1 }),
  body('force_change').isBoolean(),
  body('reset_reason').trim().isLength({ min: 5, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_ids, new_password, confirm_password, force_change, reset_reason } = req.body;

    if (new_password !== confirm_password) {
      return res.status(400).json({ error: 'New password and confirm password do not match' });
    }

    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if admin has bulk reset permission
    if (!currentUser.permissions.includes('USER_UPDATE')) {
      return res.status(403).json({ error: 'Insufficient permissions for bulk password reset' });
    }

    // Get password policy
    const policyQuery = `
      SELECT * FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1
    `;
    const policyResult = await pool.query(policyQuery);
    const policy = policyResult.rows[0] || {
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_numbers: true,
      require_special_chars: true,
      prevent_common_passwords: true,
      prevent_reuse: true,
      max_reuse_count: 5
    };

    // Validate new password against policy
    const validationError = validatePassword(new_password, policy);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Get target users
    const targetUsersQuery = `
      SELECT u.id, u.name, u.email, u.role, u.center_id,
             ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
             c.name as center_name
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      LEFT JOIN centers c ON u.center_id = c.id
      WHERE u.id = ANY($1) AND u.active = true
    `;
    const targetUsersResult = await pool.query(targetUsersQuery, [user_ids]);

    if (targetUsersResult.rows.length === 0) {
      return res.status(404).json({ error: 'No valid users found' });
    }

    // Validate access for each user
    const validUsers = [];
    const invalidUsers = [];

    for (const user of targetUsersResult.rows) {
      const hasAccess = validatePasswordResetAccess(currentUser, user);
      if (hasAccess.hasAccess) {
        validUsers.push(user);
      } else {
        invalidUsers.push({ user: user.name, reason: hasAccess.error });
      }
    }

    if (validUsers.length === 0) {
      return res.status(403).json({ 
        error: 'No users accessible for password reset',
        invalid_users: invalidUsers
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(new_password, saltRounds);

    // Reset passwords for valid users
    const resetResults = [];
    for (const user of validUsers) {
      try {
        await pool.query(
          'UPDATE users SET password = $1, password_changed = $2, updated_at = NOW() WHERE id = $3',
          [hashedPassword, !force_change, user.id]
        );

        await updateUserPasswordHistory(user.id, null, hashedPassword, currentUser.id);
        await logPasswordReset(user.id, currentUser.id, reset_reason);

        resetResults.push({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          role_name: user.role_name,
          center_name: user.center_name,
          employee_type: user.is_corporate_role ? 'Corporate' : 
                        (user.can_access_all_centers ? 'Corporate' : 'Center-Specific'),
          reset_success: true
        });
      } catch (error) {
        resetResults.push({
          id: user.id,
          name: user.name,
          email: user.email,
          reset_success: false,
          error: error.message
        });
      }
    }

    logger.info(`Bulk password reset: ${validUsers.length} users reset by admin ${currentUser.id} - Reason: ${reset_reason}`);

    res.json({
      message: `Password reset completed for ${validUsers.length} out of ${user_ids.length} users`,
      results: resetResults,
      invalid_users: invalidUsers,
      summary: {
        total_requested: user_ids.length,
        valid_users: validUsers.length,
        invalid_users: invalidUsers.length,
        successful_resets: resetResults.filter(r => r.reset_success).length,
        failed_resets: resetResults.filter(r => !r.reset_success).length
      }
    });

  } catch (error) {
    logger.error('Bulk reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
function validatePasswordResetAccess(adminUser, targetUser) {
  // Super admin can reset anyone's password
  if (adminUser.role === 'SUPER_ADMIN' || adminUser.permissions.includes('ALL_ACCESS')) {
    return { hasAccess: true };
  }

  // Check if admin has USER_UPDATE permission
  if (!adminUser.permissions.includes('USER_UPDATE')) {
    return { hasAccess: false, error: 'Insufficient permissions to reset passwords' };
  }

  // Corporate admin can reset any corporate user's password
  if (adminUser.is_corporate_role || adminUser.can_access_all_centers) {
    if (targetUser.is_corporate_role || targetUser.can_access_all_centers) {
      return { hasAccess: true };
    }
  }

  // Center manager can reset passwords for:
  // 1. Users in their own center
  // 2. Team-based users (if admin is team-based)
  // 3. Center-specific users in their center
  if (adminUser.center_id) {
    // Same center access
    if (targetUser.center_id === adminUser.center_id) {
      return { hasAccess: true };
    }

    // Team-based admin can reset team-based users
    if (adminUser.can_access_all_centers && !targetUser.is_corporate_role) {
      return { hasAccess: true };
    }
  }

  // Check if admin has access to target user's center
  if (adminUser.allowed_centers && adminUser.allowed_centers.includes(targetUser.center_id)) {
    return { hasAccess: true };
  }

  return { 
    hasAccess: false, 
    error: 'Cannot reset password for this user. Access denied based on employee type and center access.' 
  };
}

async function updateUserPasswordHistory(userId, oldPassword, newPassword, changedBy) {
  const policyQuery = `
    SELECT max_reuse_count FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1
  `;
  const policyResult = await pool.query(policyQuery);
  const policy = policyResult.rows[0] || { max_reuse_count: 5 };

  // Get current password history
  const historyQuery = `
    SELECT password_history FROM user_passwords WHERE user_id = $1
  `;
  const historyResult = await pool.query(historyQuery, [userId]);

  let passwordHistory = historyResult.rows[0]?.password_history || [];

  // Add old password to history
  if (oldPassword) {
    passwordHistory = [...passwordHistory, oldPassword].slice(-policy.max_reuse_count);
  }

  // Update password history
  await pool.query(
    `INSERT INTO user_passwords (user_id, password_history, changed_by, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (user_id) 
     DO UPDATE SET password_history = $2, changed_by = $3, updated_at = NOW()`,
    [userId, JSON.stringify(passwordHistory), changedBy]
  );

  return passwordHistory;
}

async function logPasswordReset(userId, adminId, reason) {
  const query = `
    INSERT INTO password_reset_log (user_id, admin_id, reset_reason, created_at)
    VALUES ($1, $2, $3, NOW())
  `;
  await pool.query(query, [userId, adminId, reason]);
}

function validatePassword(password, policy) {
  // Check minimum length
  if (password.length < policy.min_length) {
    return `Password must be at least ${policy.min_length} characters long`;
  }

  // Check uppercase requirement
  if (policy.require_uppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }

  // Check lowercase requirement
  if (policy.require_lowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }

  // Check numbers requirement
  if (policy.require_numbers && !/\d/.test(password)) {
    return 'Password must contain at least one number';
  }

  // Check special characters requirement
  if (policy.require_special_chars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Password must contain at least one special character';
  }

  // Check common passwords
  if (policy.prevent_common_passwords) {
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey',
      '1234567890', 'password1', 'qwertyuiop', 'starwars',
      'iloveyou', 'princess', 'dragon', 'baseball', 'football'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      return 'Password is too common. Please choose a stronger password';
    }
  }

  return null; // Password is valid
}

function calculatePasswordStrength(password, policy) {
  let score = 0;
  let feedback = [];

  // Length scoring
  if (password.length >= policy.min_length) {
    score += 20;
  } else {
    feedback.push(`Password should be at least ${policy.min_length} characters`);
  }

  // Uppercase scoring
  if (/[A-Z]/.test(password)) {
    score += 20;
  } else if (policy.require_uppercase) {
    feedback.push('Add uppercase letters');
  }

  // Lowercase scoring
  if (/[a-z]/.test(password)) {
    score += 20;
  } else if (policy.require_lowercase) {
    feedback.push('Add lowercase letters');
  }

  // Numbers scoring
  if (/\d/.test(password)) {
    score += 20;
  } else if (policy.require_numbers) {
    feedback.push('Add numbers');
  }

  // Special characters scoring
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score += 20;
  } else if (policy.require_special_chars) {
    feedback.push('Add special characters');
  }

  // Additional scoring for complexity
  if (password.length >= 12) {
    score += 10;
  }
  if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}/.test(password)) {
    score += 10;
  }

  let strength = 'Weak';
  if (score >= 80) {
    strength = 'Very Strong';
  } else if (score >= 60) {
    strength = 'Strong';
  } else if (score >= 40) {
    strength = 'Medium';
  } else if (score >= 20) {
    strength = 'Weak';
  }

  return {
    score,
    strength,
    feedback,
    meets_requirements: score >= 80
  };
}

module.exports = router;

// Get password strength indicator
router.post('/check-password-strength', [
  body('password').trim().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;

    // Get password policy
    const policyQuery = `
      SELECT * FROM password_settings WHERE active = true ORDER BY created_at DESC LIMIT 1
    `;
    const policyResult = await pool.query(policyQuery);
    const policy = policyResult.rows[0] || {
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_numbers: true,
      require_special_chars: true,
      prevent_common_passwords: true
    };

    // Calculate password strength
    const strength = calculatePasswordStrength(password, policy);

    res.json({
      success: true,
      strength: strength
    });

  } catch (error) {
    logger.error('Check password strength error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user password change history
router.get('/password-history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Check if current user has permission to view password history
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Users can only view their own history unless they have admin permissions
    if (currentUser.id !== parseInt(userId) && !currentUser.permissions.includes('USER_VIEW')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const query = `
      SELECT 
        up.id, up.user_id, up.password_changed, up.changed_by,
        u.name as changed_by_name,
        up.notes, up.created_at
      FROM user_passwords up
      LEFT JOIN users u ON up.changed_by = u.id
      WHERE up.user_id = $1
      ORDER BY up.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);

    // Get total count
    const countQuery = 'SELECT COUNT(*) FROM user_passwords WHERE user_id = $1';
    const countResult = await pool.query(countQuery, [userId]);

    const history = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      history,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get password history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
function validatePassword(password, policy) {
  // Check minimum length
  if (password.length < policy.min_length) {
    return `Password must be at least ${policy.min_length} characters long`;
  }

  // Check uppercase requirement
  if (policy.require_uppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }

  // Check lowercase requirement
  if (policy.require_lowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }

  // Check numbers requirement
  if (policy.require_numbers && !/\d/.test(password)) {
    return 'Password must contain at least one number';
  }

  // Check special characters requirement
  if (policy.require_special_chars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Password must contain at least one special character';
  }

  // Check common passwords
  if (policy.prevent_common_passwords) {
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey',
      '1234567890', 'password1', 'qwertyuiop', 'starwars',
      'iloveyou', 'princess', 'dragon', 'baseball', 'football'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      return 'Password is too common. Please choose a stronger password';
    }
  }

  return null; // Password is valid
}

function calculatePasswordStrength(password, policy) {
  let score = 0;
  let feedback = [];

  // Length scoring
  if (password.length >= policy.min_length) {
    score += 20;
  } else {
    feedback.push(`Password should be at least ${policy.min_length} characters`);
  }

  // Uppercase scoring
  if (/[A-Z]/.test(password)) {
    score += 20;
  } else if (policy.require_uppercase) {
    feedback.push('Add uppercase letters');
  }

  // Lowercase scoring
  if (/[a-z]/.test(password)) {
    score += 20;
  } else if (policy.require_lowercase) {
    feedback.push('Add lowercase letters');
  }

  // Numbers scoring
  if (/\d/.test(password)) {
    score += 20;
  } else if (policy.require_numbers) {
    feedback.push('Add numbers');
  }

  // Special characters scoring
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score += 20;
  } else if (policy.require_special_chars) {
    feedback.push('Add special characters');
  }

  // Additional scoring for complexity
  if (password.length >= 12) {
    score += 10;
  }
  if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}/.test(password)) {
    score += 10;
  }

  let strength = 'Weak';
  if (score >= 80) {
    strength = 'Very Strong';
  } else if (score >= 60) {
    strength = 'Strong';
  } else if (score >= 40) {
    strength = 'Medium';
  } else if (score >= 20) {
    strength = 'Weak';
  }

  return {
    score,
    strength,
    feedback,
    meets_requirements: score >= 80
  };
}

module.exports = router;
