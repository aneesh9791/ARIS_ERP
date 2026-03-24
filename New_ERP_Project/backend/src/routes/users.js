'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorize } = require('../middleware/auth');

const router = express.Router();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

// Roles that may manage users
const USER_ADMIN_ROLES = ['SUPER_ADMIN', 'CENTER_MANAGER', 'HR_MANAGER'];
// Only SUPER_ADMIN may assign privileged roles
const PRIVILEGED_ROLES = ['SUPER_ADMIN', 'CENTER_MANAGER', 'FINANCE_MANAGER'];

// ── GET /api/users ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { role, center_id, active = 'true', search } = req.query;
    const conds = [];
    const params = [];

    if (active !== 'all') {
      conds.push(`u.active = $${params.length + 1}`);
      params.push(active !== 'false');
    }
    if (role) {
      conds.push(`u.role = $${params.length + 1}`);
      params.push(role);
    }
    if (center_id) {
      conds.push(`u.center_id = $${params.length + 1}`);
      params.push(parseInt(center_id));
    }
    if (search) {
      conds.push(`(u.name ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1} OR u.username ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    // Non-super-admins can only see users at their own center
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'CENTER_MANAGER') {
      conds.push(`u.center_id = $${params.length + 1}`);
      params.push(req.user.center_id);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.center_id,
              u.department_id, u.active, u.last_login, u.failed_login_attempts,
              u.locked_until, u.created_at,
              ur.role_name, c.name AS center_name
         FROM users u
         LEFT JOIN user_roles ur ON ur.role = u.role
         LEFT JOIN centers c ON c.id = u.center_id
         ${where}
         ORDER BY u.name`,
      params
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    logger.error('users GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/users/me ─────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.center_id, u.department_id,
              ur.role_name, ur.permissions, ur.dashboard_widgets, ur.report_access,
              ur.is_corporate_role, ur.can_access_all_centers,
              c.name AS center_name
         FROM users u
         LEFT JOIN user_roles ur ON ur.role = u.role
         LEFT JOIN centers c ON c.id = u.center_id
         WHERE u.id = $1 AND u.active = true`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    logger.error('users me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.center_id,
              u.department_id, u.active, u.last_login, u.failed_login_attempts,
              u.locked_until, u.created_at,
              ur.role_name, ur.permissions, ur.is_corporate_role, ur.can_access_all_centers,
              c.name AS center_name
         FROM users u
         LEFT JOIN user_roles ur ON ur.role = u.role
         LEFT JOIN centers c ON c.id = u.center_id
         WHERE u.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    // Non-admin users can only view themselves or same-center users
    const target = rows[0];
    if (
      req.user.role !== 'SUPER_ADMIN' &&
      req.user.role !== 'CENTER_MANAGER' &&
      req.user.id !== target.id &&
      req.user.center_id !== target.center_id
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ success: true, user: target });
  } catch (err) {
    logger.error('users GET/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/users ────────────────────────────────────────────────────────────
router.post('/', authorize(USER_ADMIN_ROLES), [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username 3–50 chars'),
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').notEmpty().withMessage('Role is required'),
  body('center_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('department_id').optional({ nullable: true }).isInt({ min: 1 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { username, name, email, password, role, center_id = null, department_id = null } = req.body;

    // Only SUPER_ADMIN can create other SUPER_ADMINs or CENTER_MANAGERs
    if (PRIVILEGED_ROLES.includes(role) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: `Only SUPER_ADMIN can create users with role ${role}` });
    }

    // Verify the role exists
    const { rows: roleCheck } = await pool.query(
      'SELECT role FROM user_roles WHERE role = $1 AND active = true', [role]
    );
    if (!roleCheck.length) return res.status(400).json({ error: `Role '${role}' not found or inactive` });

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { rows } = await pool.query(
      `INSERT INTO users (username, name, email, password_hash, role, center_id, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, name, email, role, center_id, department_id, active, created_at`,
      [username, name, email, password_hash, role, center_id || null, department_id || null]
    );
    logger.info('User created', { by: req.user.id, new_user: rows[0].id, role });
    res.status(201).json({ success: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      const field = err.detail?.includes('email') ? 'email' : 'username';
      return res.status(409).json({ error: `${field} already in use` });
    }
    logger.error('users POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/users/:id ────────────────────────────────────────────────────────
router.put('/:id', authorize(USER_ADMIN_ROLES), [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().notEmpty(),
  body('center_id').optional({ nullable: true }).custom(v => v === null || (Number.isInteger(Number(v)) && Number(v) >= 1)),
  body('department_id').optional({ nullable: true }).custom(v => v === null || (Number.isInteger(Number(v)) && Number(v) >= 1)),
  body('active').optional().isBoolean().toBoolean(),
  body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { id } = req.params;
    const { name, email, role, center_id, department_id, active, password } = req.body;

    // Only SUPER_ADMIN can assign/change to privileged roles
    if (role && PRIVILEGED_ROLES.includes(role) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: `Only SUPER_ADMIN can assign role ${role}` });
    }

    // Verify new role exists if provided
    if (role) {
      const { rows: roleCheck } = await pool.query(
        'SELECT role FROM user_roles WHERE role = $1 AND active = true', [role]
      );
      if (!roleCheck.length) return res.status(400).json({ error: `Role '${role}' not found or inactive` });
    }

    let password_hash = undefined;
    if (password) {
      password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    const { rows } = await pool.query(
      `UPDATE users SET
         name          = COALESCE($1, name),
         email         = COALESCE($2, email),
         role          = COALESCE($3, role),
         center_id     = CASE WHEN $4  THEN $5::integer ELSE center_id END,
         department_id = CASE WHEN $6  THEN $7::integer ELSE department_id END,
         active        = COALESCE($8, active),
         password_hash = COALESCE($9, password_hash),
         updated_at    = NOW()
       WHERE id = $10
       RETURNING id, username, name, email, role, center_id, department_id, active`,
      [
        name || null,
        email || null,
        role || null,
        'center_id' in req.body, center_id != null ? parseInt(center_id) : null,
        'department_id' in req.body, department_id != null ? parseInt(department_id) : null,
        active !== undefined ? active : null,
        password_hash || null,
        id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    logger.info('User updated', { by: req.user.id, target: id });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    logger.error('users PUT error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/users/:id (soft delete) ───────────────────────────────────────
router.delete('/:id', authorize(['SUPER_ADMIN', 'HR_MANAGER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const { rows } = await pool.query(
      `UPDATE users SET active = false, updated_at = NOW()
       WHERE id = $1 AND active = true RETURNING id`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found or already inactive' });

    // Invalidate all sessions for this user
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [id]);

    logger.info('User deactivated', { by: req.user.id, target: id });
    res.json({ success: true });
  } catch (err) {
    logger.error('users DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/users/:id/unlock ────────────────────────────────────────────────
router.post('/:id/unlock', authorize(USER_ADMIN_ROLES), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET locked_until = NULL, failed_login_attempts = 0, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    logger.info('User unlocked', { by: req.user.id, target: req.params.id });
    res.json({ success: true });
  } catch (err) {
    logger.error('users unlock error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
