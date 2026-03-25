'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool   = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();

// Validate that a GL account id exists and is active; returns error message or null
async function validateGlAccount(id, label) {
  if (!id) return null; // null is allowed (clearing GL account)
  const { rows } = await pool.query(
    'SELECT id FROM chart_of_accounts WHERE id=$1 AND is_active=true', [id]
  );
  return rows.length ? null : `${label} (id ${id}) not found or inactive in chart of accounts`;
}

// Shared COA join fragment
const COA_JOIN = `
  LEFT JOIN chart_of_accounts ag ON ag.id = ic.asset_gl_id
  LEFT JOIN chart_of_accounts eg ON eg.id = ic.expense_gl_id
  LEFT JOIN chart_of_accounts ap ON ap.id = ic.ap_account_id
`;

const COA_COLS = `
  ic.*,
  ag.account_code AS asset_gl_code,  ag.account_name AS asset_gl_name,
  eg.account_code AS expense_gl_code, eg.account_name AS expense_gl_name,
  ap.account_code AS ap_account_code, ap.account_name AS ap_account_name
`;

// ── GET /api/item-categories ──────────────────────────────────────────────────
// Optional ?item_type=STOCK|EXPENSE|FIXED_ASSET  ?item_master_only=true
router.get('/', async (req, res) => {
  try {
    const { item_type, active, item_master_only } = req.query;
    const conds = [];
    const params = [];

    if (item_type && ['STOCK','EXPENSE','FIXED_ASSET'].includes(item_type)) {
      conds.push(`ic.item_type = $${params.length + 1}`);
      params.push(item_type);
    }
    if (active === 'all') {
      // no active filter — caller explicitly wants all records
    } else {
      // default to active=true; pass ?active=false to fetch inactive only
      conds.push(`ic.active = $${params.length + 1}`);
      params.push(active !== 'false');
    }
    if (item_master_only === 'true') {
      conds.push(`ic.show_in_item_master = true`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ${COA_COLS}
         FROM item_categories ic
         ${COA_JOIN}
         ${where}
         ORDER BY ic.item_type, ic.level, ic.sort_order, ic.name`,
      params
    );
    res.json({ success: true, categories: rows });
  } catch (err) {
    logger.error('item-categories GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/item-categories/tree ────────────────────────────────────────────
// Returns grouped tree: { tree: { STOCK: [...L1 with children], EXPENSE: [...], FIXED_ASSET: [...] } }
// Optional ?item_master_only=true
router.get('/tree', async (req, res) => {
  try {
    const extraWhere = req.query.item_master_only === 'true' ? ' AND ic.show_in_item_master = true' : '';
    const { rows } = await pool.query(
      `SELECT ${COA_COLS}
         FROM item_categories ic
         ${COA_JOIN}
         WHERE ic.active = true${extraWhere}
         ORDER BY ic.item_type, ic.level, ic.sort_order, ic.name`
    );

    // Build tree grouped by item_type
    const tree = { STOCK: [], EXPENSE: [], FIXED_ASSET: [] };
    const l1Map = {}; // id → l1 node with children array

    // First pass: insert all L1 nodes
    for (const row of rows) {
      if (row.level === 1) {
        const node = { ...row, children: [] };
        tree[row.item_type] = tree[row.item_type] || [];
        tree[row.item_type].push(node);
        l1Map[row.id] = node;
      }
    }

    // Second pass: attach L2 nodes to their parents
    for (const row of rows) {
      if (row.level === 2 && row.parent_id && l1Map[row.parent_id]) {
        l1Map[row.parent_id].children.push(row);
      }
    }

    res.json({ success: true, tree });
  } catch (err) {
    logger.error('item-categories tree error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/item-categories ─────────────────────────────────────────────────
router.post('/', authorizePermission('INVENTORY_WRITE'), [
  body('code').trim().isLength({ min: 1, max: 50 }).withMessage('Code is required'),
  body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Name is required'),
  body('item_type').isIn(['STOCK','EXPENSE','FIXED_ASSET']).withMessage('item_type must be STOCK, EXPENSE or FIXED_ASSET'),
  body('level').isInt({ min: 1, max: 2 }).withMessage('level must be 1 or 2'),
  body('parent_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('asset_gl_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('expense_gl_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('ap_account_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('sort_order').optional().isInt({ min: 0 }).toInt(),
  body('useful_life_years').optional({ nullable: true }).isInt({ min: 1, max: 50 }),
  body('gst_rate').optional({ nullable: true }).isFloat({ min: 0, max: 28 }).toFloat(),
  body('hsn_code').optional({ nullable: true }).trim().isLength({ max: 20 }),
  body('sac_code').optional({ nullable: true }).trim().isLength({ max: 20 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const {
      code, name, item_type, level,
      parent_id = null, asset_gl_id = null,
      expense_gl_id = null, ap_account_id = null,
      sort_order = 0, useful_life_years = null,
      gst_rate = 0, hsn_code = null, sac_code = null,
    } = req.body;

    if (parseInt(level) === 2 && !parent_id) {
      return res.status(400).json({ error: 'parent_id is required for level 2 categories' });
    }

    // Validate GL accounts exist and are active
    for (const [val, label] of [
      [asset_gl_id,   'asset_gl_id'],
      [expense_gl_id, 'expense_gl_id'],
      [ap_account_id, 'ap_account_id'],
    ]) {
      const glErr = await validateGlAccount(val, label);
      if (glErr) return res.status(400).json({ error: glErr });
    }

    const { rows } = await pool.query(
      `INSERT INTO item_categories
         (code, name, item_type, level, parent_id, asset_gl_id, expense_gl_id, ap_account_id,
          sort_order, useful_life_years, gst_rate, hsn_code, sac_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [code.trim().toUpperCase(), name, item_type, level,
       parent_id || null, asset_gl_id || null,
       expense_gl_id || null, ap_account_id || null, sort_order,
       useful_life_years || null, gst_rate || 0,
       hsn_code || null, sac_code || null]
    );
    logger.info('item-category created', { code, item_type });
    res.status(201).json({ success: true, category: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category code already exists' });
    logger.error('item-categories POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/item-categories/:id ──────────────────────────────────────────────
router.put('/:id', authorizePermission('INVENTORY_WRITE'), [
  body('name').optional().trim().isLength({ min: 2, max: 200 }),
  body('asset_gl_id').optional({ nullable: true }).custom(v => v === null || (Number.isInteger(Number(v)) && Number(v) >= 1)).withMessage('asset_gl_id must be a positive integer or null'),
  body('expense_gl_id').optional({ nullable: true }).custom(v => v === null || (Number.isInteger(Number(v)) && Number(v) >= 1)).withMessage('expense_gl_id must be a positive integer or null'),
  body('ap_account_id').optional({ nullable: true }).custom(v => v === null || (Number.isInteger(Number(v)) && Number(v) >= 1)).withMessage('ap_account_id must be a positive integer or null'),
  body('sort_order').optional().isInt({ min: 0 }).toInt(),
  body('active').optional().isBoolean().toBoolean(),
  body('useful_life_years').optional({ nullable: true }).isInt({ min: 1, max: 50 }),
  body('gst_rate').optional({ nullable: true }).isFloat({ min: 0, max: 28 }).toFloat(),
  body('hsn_code').optional({ nullable: true }).trim().isLength({ max: 20 }),
  body('sac_code').optional({ nullable: true }).trim().isLength({ max: 20 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { id } = req.params;
    const { name, asset_gl_id, expense_gl_id, ap_account_id, sort_order,
            active, useful_life_years, gst_rate, hsn_code, sac_code } = req.body;

    // Validate GL accounts exist and are active (only if present in request body)
    for (const [key, label] of [
      ['asset_gl_id',   'asset_gl_id'],
      ['expense_gl_id', 'expense_gl_id'],
      ['ap_account_id', 'ap_account_id'],
    ]) {
      if (key in req.body) {
        const glErr = await validateGlAccount(req.body[key], label);
        if (glErr) return res.status(400).json({ error: glErr });
      }
    }

    const { rows } = await pool.query(
      `UPDATE item_categories SET
         name               = COALESCE($1, name),
         asset_gl_id        = CASE WHEN $2  THEN $3::integer        ELSE asset_gl_id  END,
         expense_gl_id      = CASE WHEN $4  THEN $5::integer        ELSE expense_gl_id END,
         ap_account_id      = CASE WHEN $6  THEN $7::integer        ELSE ap_account_id END,
         sort_order         = COALESCE($8, sort_order),
         active             = COALESCE($9, active),
         useful_life_years  = CASE WHEN $10 THEN $11::integer       ELSE useful_life_years END,
         gst_rate           = CASE WHEN $12 THEN $13::numeric       ELSE gst_rate END,
         hsn_code           = CASE WHEN $14 THEN $15::varchar       ELSE hsn_code END,
         sac_code           = CASE WHEN $16 THEN $17::varchar       ELSE sac_code END,
         updated_at         = NOW()
       WHERE id = $18
       RETURNING *`,
      [
        name || null,
        'asset_gl_id'   in req.body, asset_gl_id   != null ? parseInt(asset_gl_id)   : null,
        'expense_gl_id' in req.body, expense_gl_id != null ? parseInt(expense_gl_id) : null,
        'ap_account_id' in req.body, ap_account_id != null ? parseInt(ap_account_id) : null,
        sort_order !== undefined ? sort_order : null,
        active !== undefined ? active : null,
        'useful_life_years' in req.body, useful_life_years != null ? parseInt(useful_life_years) : null,
        'gst_rate'          in req.body, gst_rate          != null ? gst_rate          : null,
        'hsn_code'          in req.body, hsn_code          || null,
        'sac_code'          in req.body, sac_code          || null,
        id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Category not found' });
    logger.info('item-category updated', { id });
    res.json({ success: true, category: rows[0] });
  } catch (err) {
    logger.error('item-categories PUT error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/item-categories/:id ──────────────────────────────────────────
// Soft delete — sets active=false
router.delete('/:id', authorizePermission('INVENTORY_WRITE'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE item_categories SET active = false, updated_at = NOW()
       WHERE id = $1 AND active = true RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Category not found or already inactive' });
    logger.info('item-category deactivated', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    logger.error('item-categories DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
