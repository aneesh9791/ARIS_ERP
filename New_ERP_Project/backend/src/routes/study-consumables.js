'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('STUDY_CONSUMABLE_VIEW'));

// GET /api/study-consumables?study_definition_id=
router.get('/', async (req, res) => {
  try {
    const { study_definition_id } = req.query;
    if (!study_definition_id) {
      return res.status(400).json({ error: 'study_definition_id required' });
    }
    const { rows } = await pool.query(
      `SELECT sc.*, im.item_name, im.uom, im.current_stock, im.standard_rate AS unit_cost,
              im.item_code, ic.name AS category_name
       FROM study_consumables sc
       JOIN item_master im ON im.id = sc.item_master_id
       LEFT JOIN item_categories ic ON ic.id = im.category_id
       WHERE sc.study_definition_id = $1 AND sc.active = true
       ORDER BY im.item_name`,
      [study_definition_id]
    );
    res.json({ success: true, consumables: rows });
  } catch (e) {
    logger.error('Study consumables GET error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/study-consumables/study-definitions — list study definitions with is_contrast_study flag
router.get('/study-definitions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, study_code, study_name, study_type, modality, is_contrast_study, active
       FROM study_definitions
       WHERE active = true
       ORDER BY study_name`
    );
    res.json({ success: true, definitions: rows });
  } catch (e) {
    logger.error('Study definitions GET error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/study-consumables
router.post('/', [
  body('study_definition_id').isInt({ min: 1 }),
  body('item_master_id').isInt({ min: 1 }),
  body('default_qty').isFloat({ min: 0.001 }),
  body('scope').optional().isIn(['per_study', 'per_patient']),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { study_definition_id, item_master_id, default_qty, notes, scope } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes, scope)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (study_definition_id, item_master_id) DO UPDATE
         SET default_qty = $3, notes = $4, scope = $5, active = true, updated_at = NOW()
       RETURNING *`,
      [study_definition_id, item_master_id, default_qty, notes || null, scope || 'per_study']
    );
    res.status(201).json({ success: true, consumable: rows[0] });
  } catch (e) {
    logger.error('Study consumables POST error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/study-consumables/:id
router.put('/:id', [
  body('default_qty').isFloat({ min: 0 }),
  body('scope').optional().isIn(['per_study', 'per_patient']),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { default_qty, notes, scope } = req.body;
    const { rows } = await pool.query(
      `UPDATE study_consumables SET default_qty=$1, notes=$2, scope=COALESCE($3, scope), updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [default_qty, notes || null, scope || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, consumable: rows[0] });
  } catch (e) {
    logger.error('Study consumables PUT error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/study-consumables/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      `UPDATE study_consumables SET active=false, updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    logger.error('Study consumables DELETE error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
