const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/db');
const { logger } = require('../config/logger');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;


// Authentication middleware
const authenticateToken = async (req, res, next) => {
  // If app.js already authenticated this request, skip
  if (req.user) return next();

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      error: 'TOKEN_MISSING'
    });
  }

  try {
    const result = await pool.query('SELECT validate_session_token($1) AS session', [token]);
    const session = result.rows[0]?.session;

    if (!session || !session.valid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session',
        error: 'TOKEN_INVALID'
      });
    }

    const userResult = await pool.query(
      `SELECT u.id, u.username, u.email, u.role, u.center_id, u.department_id,
              u.active AS is_active,
              COALESCE(ur.is_corporate_role, false) AS is_corporate_role,
              COALESCE(ur.permissions, '[]'::jsonb) AS permissions
       FROM users u
       LEFT JOIN user_roles ur ON ur.role = u.role AND ur.active = true
       WHERE u.id = $1`,
      [session.user_id]
    );

    if (!userResult.rows.length || !userResult.rows[0].is_active) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive',
        error: 'USER_INACTIVE'
      });
    }

    req.user = userResult.rows[0];

    // Helper routes can call inside a transaction: await req.setAuditUser(client)
    // Sets a session-level variable the fn_audit_trail trigger reads to capture user_id
    req.setAuditUser = async (client) => {
      await client.query(`SELECT set_config('app.current_user_id', $1::text, true)`, [req.user.id]);
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: 'INTERNAL_ERROR'
    });
  }
};

// Role-based authorization middleware
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required', error: 'AUTH_REQUIRED' });
    }
    const userPerms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (!roles.includes(req.user.role) && !userPerms.includes('ALL_ACCESS')) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions', error: 'INSUFFICIENT_PERMISSIONS', required_roles: roles, user_role: req.user.role });
    }
    next();
  };
};

// Permission-based authorization middleware
// Passes if user has ALL_ACCESS or any one of the listed permissions
const authorizePermission = (...perms) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required', error: 'AUTH_REQUIRED' });
    }
    const userPerms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (userPerms.includes('ALL_ACCESS') || perms.some(p => userPerms.includes(p))) return next();
    logger.warn('Permission denied', {
      userId: req.user.id,
      role: req.user.role,
      required: perms,
      method: req.method,
      path: req.path,
    });
    return res.status(403).json({ success: false, message: 'Insufficient permissions', error: 'INSUFFICIENT_PERMISSIONS', required_permissions: perms });
  };
};

// Center-based authorization middleware
const authorizeCenter = (_centerIds) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'AUTH_REQUIRED'
      });
    }

    // Admin can access all centers
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Check if user has access to requested center
    const userCenterId = req.user.center_id;
    const requestedCenterId = req.body.center_id || req.query.center_id || req.params.center_id;

    if (userCenterId && requestedCenterId && userCenterId !== requestedCenterId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this center',
        error: 'CENTER_ACCESS_DENIED',
        user_center: userCenterId,
        requested_center: requestedCenterId
      });
    }

    next();
  };
};

// Login function
const login = async (email, password, ipAddress) => {
  try {
    const userResult = await pool.query(
      `SELECT u.*, ur.is_corporate_role, ur.permissions AS role_permissions
       FROM users u
       LEFT JOIN user_roles ur ON ur.role = u.role
       WHERE u.email = $1 AND u.active = true`,
      [email]
    );

    if (!userResult.rows.length) {
      logger.warn('Login failed (user not found)', { email, ip: ipAddress });
      return { success: false, message: 'Invalid credentials' };
    }

    const user = userResult.rows[0];

    if (user.locked_until && user.locked_until > new Date()) {
      return { success: false, message: 'Account locked. Try again later.' };
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      await pool.query(
        `UPDATE users SET
          failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE WHEN failed_login_attempts + 1 >= 5
            THEN NOW() + INTERVAL '30 minutes' ELSE NULL END
        WHERE id = $1`,
        [user.id]
      );
      logger.warn('Login failed (wrong password)', { email, ip: ipAddress });
      return { success: false, message: 'Invalid credentials' };
    }

    await pool.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO user_sessions (user_id, session_token, expires_at, ip_address)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours', $3)`,
      [user.id, token, ipAddress]
    );

    logger.info('User logged in', { email, ip: ipAddress });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        center_id: user.center_id,
        department_id: user.department_id,
        is_corporate_role: user.is_corporate_role || false,
        permissions: user.role_permissions || []
      }
    };
  } catch (error) {
    logger.error('Login error:', error);
    throw error;
  }
};

// Logout function
const logout = async (token) => {
  try {
    const result = await pool.query('SELECT * FROM logout_user($1)', [token]);
    
    if (result.rows[0].logout_user) {
      logger.info('User logged out successfully');
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Logout error:', error);
    throw error;
  }
};

// Change password function
const changePassword = async (userId, currentPassword, newPassword) => {
  try {
    // Fetch user's email first
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = userResult.rows[0]?.email;
    if (!email) throw new Error('User not found');

    // Verify current password
    const userRow = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const valid = await bcrypt.compare(currentPassword, userRow.rows[0]?.password_hash || '');
    if (!valid) throw new Error('Current password is incorrect');

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query(
      'UPDATE users SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, userId]
    );

    logger.info(`Password changed for user ID: ${userId}`);
    return true;
  } catch (error) {
    logger.error('Password change error:', error);
    throw error;
  }
};

// Refresh token function
const refreshToken = async (token) => {
  try {
    // Validate current token
    const validationResult = await pool.query('SELECT validate_session_token($1) AS session', [token]);
    const session = validationResult.rows[0]?.session;

    if (!session?.valid) {
      throw new Error('Invalid session token');
    }

    const userId = session.user_id;
    const newToken = crypto.randomBytes(32).toString('hex');

    await pool.query(
      `INSERT INTO user_sessions (user_id, session_token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [userId, newToken]
    );

    await pool.query('SELECT logout_user($1)', [token]);

    return { success: true, token: newToken };
  } catch (error) {
    logger.error('Token refresh error:', error);
    throw error;
  }
};

// Get user permissions
const getUserPermissions = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT 
        u.id, u.username, u.email, u.role, u.center_id, u.department_id,
        c.name as center_name,
        d.name as department_name
      FROM users u
      LEFT JOIN centers c ON u.center_id = c.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1 AND u.active = true`,
      [userId]
    );

    if (!result.rows.length) {
      throw new Error('User not found or inactive');
    }

    const user = result.rows[0];
    
    // Define permissions based on role
    const permissions = {
      ADMIN: [
        'all:read', 'all:write', 'all:delete', 'users:manage', 'settings:manage'
      ],
      MANAGER: [
        'center:read', 'center:write', 'assets:manage', 'patients:manage', 'reports:view'
      ],
      DOCTOR: [
        'patients:read', 'patients:write', 'studies:read', 'studies:write', 'reports:view'
      ],
      NURSE: [
        'patients:read', 'patients:write', 'schedules:read', 'schedules:write'
      ],
      RECEPTIONIST: [
        'patients:read', 'patients:write', 'billing:read', 'billing:write', 'appointments:manage'
      ],
      USER: [
        'dashboard:view', 'profile:read', 'profile:write'
      ]
    };

    return {
      user,
      permissions: permissions[user.role] || []
    };
  } catch (error) {
    logger.error('Get permissions error:', error);
    throw error;
  }
};

// Rate limiting for login attempts
const loginAttempts = new Map();

const rateLimiter = (maxAttempts = 20, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [key, attempts] of loginAttempts.entries()) {
      if (attempts.firstAttempt < windowStart) {
        loginAttempts.delete(key);
      }
    }

    const attempts = loginAttempts.get(ip) || { count: 0, firstAttempt: now };

    if (attempts.count >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again later.',
        error: 'TOO_MANY_ATTEMPTS',
        retryAfter: Math.ceil((attempts.firstAttempt + windowMs - now) / 1000)
      });
    }

    // Update attempts
    loginAttempts.set(ip, {
      count: attempts.count + 1,
      firstAttempt: attempts.firstAttempt
    });

    // Set response headers
    res.set({
      'X-RateLimit-Limit': maxAttempts,
      'X-RateLimit-Remaining': Math.max(0, maxAttempts - attempts.count - 1),
      'X-RateLimit-Reset': new Date(attempts.firstAttempt + windowMs).toISOString()
    });

    next();
  };
};

// Security headers middleware
const securityHeaders = (_req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Remove server information
  res.removeHeader('X-Powered-By');

  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: duration,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    };

    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
};

module.exports = {
  authenticateToken,
  authorize,
  authorizePermission,
  authorizeCenter,
  login,
  logout,
  changePassword,
  refreshToken,
  getUserPermissions,
  rateLimiter,
  securityHeaders,
  requestLogger,
  clearLoginAttempts: () => loginAttempts.clear()
};
