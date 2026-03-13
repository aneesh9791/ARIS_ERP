const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const winston = require('winston');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/auth.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      error: 'TOKEN_MISSING'
    });
  }

  // Validate session token using database function
  pool.query('SELECT * FROM validate_session_token($1)', [token])
    .then(result => {
      if (!result.rows[0].valid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired session',
          error: 'TOKEN_INVALID'
        });
      }

      // Get user details
      return pool.query(
        'SELECT id, username, email, role, center_id, department_id, is_active FROM users WHERE id = $1',
        [result.rows[0].user_id]
      );
    })
    .then(userResult => {
      if (!userResult.rows.length || !userResult.rows[0].is_active) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive',
          error: 'USER_INACTIVE'
        });
      }

      const user = userResult.rows[0];
      req.user = user;
      next();
    })
    .catch(error => {
      logger.error('Authentication error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authentication failed',
        error: 'INTERNAL_ERROR'
      });
    });
};

// Role-based authorization middleware
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'AUTH_REQUIRED'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        error: 'INSUFFICIENT_PERMISSIONS',
        required_roles: roles,
        user_role: req.user.role
      });
    }

    next();
  };
};

// Center-based authorization middleware
const authorizeCenter = (centerIds) => {
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
    const result = await pool.query('SELECT * FROM check_user_login($1, $2)', [email, password]);
    const loginResult = result.rows[0];

    if (!loginResult.success) {
      logger.warn(`Login failed for email: ${email} from IP: ${ipAddress}`);
      return loginResult;
    }

    // Generate session token
    const token = await pool.query(
      'SELECT * FROM generate_session_token($1, $2)',
      [loginResult.user_id, ipAddress]
    );

    logger.info(`User logged in: ${email} from IP: ${ipAddress}`);

    return {
      success: true,
      token: token.rows[0].generate_session_token,
      user: {
        id: loginResult.user_id,
        username: loginResult.username,
        email: email,
        role: loginResult.role,
        center_id: loginResult.center_id,
        department_id: loginResult.department_id
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
    // Verify current password
    const userResult = await pool.query(
      'SELECT * FROM check_user_login(email, $1)',
      [currentPassword]
    );

    if (!userResult.rows[0].success) {
      throw new Error('Current password is incorrect');
    }

    // Update password
    const hashedPassword = newPassword; // In production, use bcrypt
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
    const validationResult = await pool.query('SELECT * FROM validate_session_token($1)', [token]);
    
    if (!validationResult.rows[0].valid) {
      throw new Error('Invalid session token');
    }

    // Generate new token
    const newTokenResult = await pool.query(
      'SELECT * FROM generate_session_token($1)',
      [validationResult.rows[0].user_id]
    );

    // Invalidate old token
    await pool.query('SELECT * FROM logout_user($1)', [token]);

    return {
      success: true,
      token: newTokenResult.rows[0].generate_session_token
    };
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
      WHERE u.id = $1 AND u.is_active = true`,
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

const rateLimiter = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
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
const securityHeaders = (req, res, next) => {
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
  authorizeCenter,
  login,
  logout,
  changePassword,
  refreshToken,
  getUserPermissions,
  rateLimiter,
  securityHeaders,
  requestLogger
};
