const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('PHYSICIAN_VIEW'));

// GET /api/referring-physicians
router.get('/', async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;
    const where = active_only === 'true' ? 'WHERE active = true' : '';
    const result = await pool.query(`
      SELECT id, physician_code, first_name, last_name, specialty,
             contact_phone, address, status, active, created_at, updated_at
      FROM referring_physician_master
      ${where}
      ORDER BY last_name, first_name
    `);
    res.json({ success: true, physicians: result.rows });
  } catch (err) {
    logger.error('Get referring physicians error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const validators = [
  body('first_name').trim().isLength({ min: 1, max: 100 }).withMessage('First name is required'),
  body('last_name').trim().isLength({ min: 1, max: 100 }).withMessage('Last name is required'),
  body('specialty').trim().isLength({ min: 1, max: 100 }).withMessage('Specialty is required'),
  body('contact_phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
  body('address').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  body('status').optional().isIn(['active', 'inactive']),
];

// POST /api/referring-physicians
router.post('/', validators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { first_name, last_name, specialty, contact_phone = null, address = null, status = 'active' } = req.body;
    const physician_name = `${first_name.trim()} ${last_name.trim()}`;
    const active = status !== 'inactive';

    // Generate a unique physician_code (PHY0001, PHY0002, …)
    const seqRes = await pool.query(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(physician_code FROM 4) AS INTEGER)), 0) + 1 AS next FROM referring_physician_master WHERE physician_code ~ '^PHY[0-9]+$'"
    );
    const physician_code = `PHY${String(seqRes.rows[0].next).padStart(4, '0')}`;

    const result = await pool.query(`
      INSERT INTO referring_physician_master
        (physician_code, physician_name, first_name, last_name, specialty,
         contact_phone, address, status, active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
      RETURNING *
    `, [physician_code, physician_name, first_name.trim(), last_name.trim(),
        specialty, contact_phone, address, status, active]);

    logger.info('Referring physician created', { physician_code });
    res.status(201).json({ success: true, physician: result.rows[0] });
  } catch (err) {
    logger.error('Create referring physician error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/referring-physicians/:id
router.put('/:id', validators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { id } = req.params;
    const { first_name, last_name, specialty, contact_phone = null, address = null, status = 'active' } = req.body;
    const physician_name = `${first_name.trim()} ${last_name.trim()}`;
    const active = status !== 'inactive';

    const result = await pool.query(`
      UPDATE referring_physician_master
      SET first_name=$1, last_name=$2, physician_name=$3, specialty=$4,
          contact_phone=$5, address=$6, status=$7, active=$8, updated_at=NOW()
      WHERE id=$9
      RETURNING *
    `, [first_name.trim(), last_name.trim(), physician_name, specialty,
        contact_phone, address, status, active, id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Physician not found' });
    logger.info('Referring physician updated', { id });
    res.json({ success: true, physician: result.rows[0] });
  } catch (err) {
    logger.error('Update referring physician error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/referring-physicians/:id  (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      UPDATE referring_physician_master
      SET active = false, status = 'inactive', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Physician not found' });
    logger.info('Referring physician deleted', { id });
    res.json({ success: true });
  } catch (err) {
    logger.error('Delete referring physician error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
