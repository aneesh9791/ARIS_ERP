const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  login,
  logout,
  refreshToken,
  changePassword,
  getUserPermissions,
  authenticateToken,
  rateLimiter,
  clearLoginAttempts
} = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', rateLimiter(20, 15 * 60 * 1000), [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
const result = await login(req.body.email, req.body.password, ipAddress);

    if (!result.success) {
      return res.status(401).json({ success: false, error: result.message || 'Invalid credentials' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    await logout(token);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token required' });

    const result = await refreshToken(token);
    res.json(result);
  } catch (error) {
    res.status(401).json({ success: false, error: 'Token refresh failed' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticateToken, [
  body('currentPassword').isLength({ min: 1 }),
  body('newPassword').isLength({ min: 8 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    await changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    const isClientError = error.message === 'Current password is incorrect';
    res.status(isClientError ? 400 : 500).json({ success: false, error: error.message });
  }
});

// GET /api/auth/me — returns current user with live permissions from DB
router.get('/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// POST /api/auth/clear-attempts — admin utility to clear rate limit lockout
router.post('/clear-attempts', async (req, res) => {
  clearLoginAttempts();
  res.json({ success: true, message: 'Login attempt counters cleared' });
});

module.exports = router;
