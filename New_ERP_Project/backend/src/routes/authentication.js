const express = require('express');
const { body, validationResult } = require('express-validator');
const { login, logout, changePassword, refreshToken } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/auth');

const router = express.Router();

// Login endpoint
router.post('/login', 
  rateLimiter(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { email, password } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;

      const result = await login(email, password, ipAddress);

      if (result.success) {
        res.json({
          success: true,
          message: 'Login successful',
          data: result
        });
      } else {
        res.status(401).json({
          success: false,
          message: result.message,
          attempts_remaining: result.attempts_remaining
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token required for logout'
      });
    }

    const result = await logout(token);

    if (result) {
      res.json({
        success: true,
        message: 'Logout successful'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Logout failed'
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token required for refresh'
      });
    }

    const result = await refreshToken(token);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: result
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Token refresh failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Change password endpoint
router.post('/change-password', [
  body('currentPassword').isLength({ min: 6 }),
  body('newPassword').isLength({ min: 6 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // This would need authentication middleware in production
    const userId = req.user?.id || 1; // Get from authenticated user

    const { currentPassword, newPassword } = req.body;
    const result = await changePassword(userId, currentPassword, newPassword);

    if (result) {
      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Password change failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user permissions
router.get('/permissions', async (req, res) => {
  try {
    // This would need authentication middleware in production
    const userId = req.user?.id || 1; // Get from authenticated user

    const { getUserPermissions } = require('../middleware/auth');
    const result = await getUserPermissions(userId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
