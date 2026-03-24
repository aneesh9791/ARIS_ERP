const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('CENTER_VIEW'));

// GET all centers — auth applied at app level for /api/center-master
router.get('/', async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;

    const whereClause = active_only === 'true'
      ? 'WHERE c.active = true'
      : '';

    const result = await pool.query(`
      SELECT
        c.id, c.name, c.code, c.address, c.business_model,
        c.status, c.active, c.corporate_entity_id, c.created_at, c.updated_at,
        COUNT(u.id) AS user_count
      FROM centers c
      LEFT JOIN users u ON c.id = u.center_id AND u.active = true
      ${whereClause}
      GROUP BY c.id, c.name, c.code, c.address, c.business_model,
               c.status, c.active, c.corporate_entity_id, c.created_at, c.updated_at
      ORDER BY c.name
    `);

    res.json({ success: true, centers: result.rows });
  } catch (error) {
    logger.error('Get centers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CREATE new center
router.post('/', [
  body('name').trim().isLength({ min: 2, max: 255 }),
  body('code').trim().isLength({ min: 2, max: 50 }),
  body('address').optional().trim().isLength({ max: 500 }),
  body('business_model').optional().trim().isIn(['OWNED','EQUIPMENT_LEASE','REVENUE_SHARE','MIN_GUARANTEE','FRANCHISE','JOINT_VENTURE','']),
  body('status').optional().isIn(['active', 'inactive'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, code, address = '', business_model = null, status = 'active' } = req.body;

    const isActive = status !== 'inactive';
    const result = await pool.query(`
      INSERT INTO centers (name, code, address, business_model, status, active, corporate_entity_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6,
        (SELECT id FROM corporate_entities WHERE active = true ORDER BY id LIMIT 1),
        NOW(), NOW())
      RETURNING *
    `, [name, code, address, business_model, status, isActive]);

    logger.info('Center created', { code, name });
    res.status(201).json({ success: true, message: 'Center created successfully', center: result.rows[0] });
  } catch (error) {
    logger.error('Create center error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE center
router.put('/:id', [
  body('name').trim().isLength({ min: 2, max: 255 }),
  body('code').trim().isLength({ min: 2, max: 50 }),
  body('address').optional().trim().isLength({ max: 500 }),
  body('business_model').optional().trim().isIn(['OWNED','EQUIPMENT_LEASE','REVENUE_SHARE','MIN_GUARANTEE','FRANCHISE','JOINT_VENTURE','']),
  body('status').optional().isIn(['active', 'inactive'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, code, address = '', business_model = null, status = 'active' } = req.body;
    const isActive = status !== 'inactive';

    const result = await pool.query(`
      UPDATE centers
      SET name=$1, code=$2, address=$3, business_model=$4, status=$5, active=$6, updated_at=NOW()
      WHERE id=$7
      RETURNING *
    `, [name, code, address, business_model, status, isActive, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Center not found' });
    }

    logger.info('Center updated', { code, name });
    res.json({ success: true, message: 'Center updated successfully', center: result.rows[0] });
  } catch (error) {
    logger.error('Update center error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE center (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE centers SET active = false, status = 'inactive', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Center not found' });
    }

    logger.info('Center deleted', { id, code: result.rows[0].code });
    res.json({ success: true, message: 'Center deleted successfully' });
  } catch (error) {
    logger.error('Delete center error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
