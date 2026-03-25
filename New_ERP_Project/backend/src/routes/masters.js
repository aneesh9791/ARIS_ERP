const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authenticateToken, authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('MASTER_DATA_VIEW'));

// CENTER MODALITIES — derived from active SCANNER assets registered for the center
router.get('/center-modalities', authenticateToken, async (req, res) => {
  try {
    const { center_id } = req.query;
    if (!center_id) return res.json({ success: true, modalities: [] });

    const result = await pool.query(`
      SELECT cm.modality, m.name
      FROM center_modalities cm
      LEFT JOIN modalities m ON m.code = cm.modality
      WHERE cm.center_id = $1 AND cm.active = true
      ORDER BY cm.modality
    `, [center_id]);

    const modalities = result.rows.map(r => r.modality).filter(Boolean);
    res.json({ success: true, modalities, rows: result.rows });
  } catch (error) {
    logger.error('Get center modalities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// STUDY MASTER
router.get('/study-master', authenticateToken, async (req, res) => {
  try {
    const { center_id, modality, active_only = 'true' } = req.query;
    const params = [];
    const conditions = ['1=1'];

    if (active_only === 'true') conditions.push('sm.active = true');
    if (center_id) { params.push(center_id); conditions.push(`sm.center_id = $${params.length}`); }
    if (modality)  { params.push(modality);  conditions.push(`sm.modality = $${params.length}`); }

    const result = await pool.query(`
      SELECT sm.*, c.name AS center_name
      FROM study_master sm
      LEFT JOIN centers c ON sm.center_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY sm.study_name
    `, params);

    // Return under both keys for compatibility across pages
    res.json({ success: true, studyTypes: result.rows, study_masters: result.rows });
  } catch (error) {
    logger.error('Get study master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/study-master', [
  body('study_code').trim().notEmpty().withMessage('Study code is required'),
  body('study_name').trim().notEmpty().withMessage('Study name is required'),
  body('modality').notEmpty().withMessage('Modality is required'),
  body('study_type').optional().trim(),
  body('base_rate').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('center_id').isInt().withMessage('Center is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { study_code, study_name, modality, study_type = 'Plain', base_rate, center_id } = req.body;

    // Check duplicate (study_code, center_id)
    const dup = await pool.query(
      'SELECT id FROM study_master WHERE study_code=$1 AND center_id=$2 AND active=true',
      [study_code, center_id]
    );
    if (dup.rows.length > 0) {
      return res.status(400).json({ message: 'Study Code already exists for this center' });
    }

    const result = await pool.query(`
      INSERT INTO study_master (
        study_code, study_name, modality, study_type, base_rate,
        insurance_rate, self_pay_rate, billing_code, cpt_code,
        revenue_category, cost_category, center_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5, 0,0,'','', '','', $6, NOW(), NOW())
      RETURNING *
    `, [study_code, study_name, modality, study_type, base_rate, center_id]);

    res.status(201).json({ success: true, studyType: result.rows[0] });
  } catch (error) {
    logger.error('Create study master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/study-master/:id', [
  body('study_code').trim().notEmpty(),
  body('study_name').trim().notEmpty(),
  body('modality').notEmpty(),
  body('study_type').optional().trim(),
  body('base_rate').isFloat({ min: 0 }),
  body('center_id').isInt(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;
    const { study_code, study_name, modality, study_type = 'Plain', base_rate, center_id } = req.body;

    const result = await pool.query(`
      UPDATE study_master SET
        study_code=$1, study_name=$2, modality=$3, study_type=$4,
        base_rate=$5, center_id=$6, updated_at=NOW()
      WHERE id=$7
      RETURNING *
    `, [study_code, study_name, modality, study_type, base_rate, center_id, id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, studyType: result.rows[0] });
  } catch (error) {
    logger.error('Update study master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/study-master/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE study_master SET active=false, updated_at=NOW() WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete study master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════════════
// STUDY DEFINITIONS — global study catalog (no center, no price)
// ════════════════════════════════════════════════════════════

router.get('/study-definitions', authenticateToken, async (req, res) => {
  try {
    const { modality, active_only = 'true', center_id } = req.query;
    const params = [];
    const conds = ['sd.active = true'];
    if (active_only !== 'true') conds.splice(0, 1); // remove active filter if not requested
    if (modality) { params.push(modality); conds.push(`sd.modality = $${params.length}`); }

    let query;
    if (center_id) {
      // Return only studies priced for this center, including the center price
      params.push(center_id);
      query = `
        SELECT sd.*, scp.base_rate as center_price, scp.insurance_rate, scp.self_pay_rate
        FROM study_definitions sd
        JOIN study_center_pricing scp ON scp.study_definition_id = sd.id AND scp.center_id = $${params.length}
        WHERE ${conds.join(' AND ')}
        ORDER BY sd.modality, sd.study_name
      `;
    } else {
      query = `SELECT * FROM study_definitions sd WHERE ${conds.join(' AND ')} ORDER BY sd.modality, sd.study_name`;
    }

    let { rows } = await pool.query(query, params);

    // If center_id was supplied but yielded no results (e.g. corporate/admin account
    // whose center has no pricing rows), fall back to the full catalog so billing
    // remains usable.
    if (center_id && rows.length === 0) {
      const fallbackConds = ['sd.active = true'];
      const fallbackParams = [];
      if (active_only !== 'true') fallbackConds.splice(0, 1);
      if (modality) { fallbackParams.push(modality); fallbackConds.push(`sd.modality = $${fallbackParams.length}`); }
      const fallbackQuery = `SELECT * FROM study_definitions sd WHERE ${fallbackConds.join(' AND ')} ORDER BY sd.modality, sd.study_name`;
      const fb = await pool.query(fallbackQuery, fallbackParams);
      rows = fb.rows;
    }

    res.json({ success: true, studies: rows });
  } catch (err) {
    logger.error('study-definitions GET:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/study-definitions', [
  body('study_code').trim().notEmpty().withMessage('Study code required'),
  body('study_name').trim().notEmpty().withMessage('Study name required'),
  body('modality').trim().notEmpty().withMessage('Modality required'),
  body('study_type').isIn(['Plain','Contrast','Special']).withMessage('Invalid study type'),
], authenticateToken, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { study_code, study_name, study_type, modality, description = null,
            sac_code = null, hsn_code = null,
            gst_rate = 0, gst_applicable = true } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO study_definitions
         (study_code, study_name, study_type, modality, description, sac_code, hsn_code, gst_rate, gst_applicable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [study_code.trim().toUpperCase(), study_name.trim(), study_type, modality.toUpperCase(),
       description, sac_code || null, hsn_code || null,
       parseFloat(gst_rate) || 0, gst_applicable !== false]
    );
    res.status(201).json({ success: true, study: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Study code already exists' });
    logger.error('study-definitions POST:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/study-definitions/:id', [
  body('study_code').trim().notEmpty(),
  body('study_name').trim().notEmpty(),
  body('modality').trim().notEmpty(),
  body('study_type').isIn(['Plain','Contrast','Special']),
], authenticateToken, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { study_code, study_name, study_type, modality, description = null,
            sac_code = null, hsn_code = null,
            gst_rate = 0, gst_applicable = true } = req.body;
    const { rows } = await pool.query(
      `UPDATE study_definitions SET study_code=$1, study_name=$2, study_type=$3, modality=$4,
         description=$5, sac_code=$6, hsn_code=$7, gst_rate=$8, gst_applicable=$9,
         updated_at=NOW() WHERE id=$10 AND active=true RETURNING *`,
      [study_code.trim().toUpperCase(), study_name.trim(), study_type, modality.toUpperCase(),
       description, sac_code || null, hsn_code || null,
       parseFloat(gst_rate) || 0, gst_applicable !== false, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, study: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Study code already exists' });
    logger.error('study-definitions PUT:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/study-definitions/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE study_definitions SET active=false, updated_at=NOW() WHERE id=$1 AND active=true RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('study-definitions DELETE:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════════════
// STUDY PRICING — center ↔ study price mappings
// Uses study_center_pricing table (true per-center rates, unique on study_definition_id + center_id)
// ════════════════════════════════════════════════════════════

// Bundle endpoint: returns study definitions + pricing + centers + their modalities in one round trip
router.get('/study-pricing-bundle', authenticateToken, async (req, res) => {
  try {
    const [defsRes, pricingRes, centersRes, modRes] = await Promise.all([
      pool.query(
        `SELECT id, study_code, study_name, study_type, modality, active
         FROM study_definitions WHERE active = true ORDER BY modality, study_name`
      ),
      pool.query(
        `SELECT scp.id, scp.study_definition_id, scp.center_id, scp.base_rate, scp.active
         FROM study_center_pricing scp WHERE scp.active = true`
      ),
      pool.query(`SELECT id, name, city, code, active, corporate_entity_id FROM centers ORDER BY name`),
      pool.query(
        `SELECT center_id, modality FROM center_modalities WHERE active = true`
      ),
    ]);

    // Build center → modality set map
    const centerModalities = {};
    modRes.rows.forEach(({ center_id, modality }) => {
      if (!centerModalities[center_id]) centerModalities[center_id] = [];
      centerModalities[center_id].push(modality);
    });

    res.json({
      success: true,
      studies: defsRes.rows,
      pricing: pricingRes.rows,
      centers: centersRes.rows,
      centerModalities,
    });
  } catch (err) {
    logger.error('study-pricing-bundle GET:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/study-pricing', authenticateToken, async (req, res) => {
  try {
    const { center_id, modality, active_only = 'true' } = req.query;
    const conds = ['1=1'];
    const params = [];
    if (active_only === 'true') conds.push('scp.active = true');
    if (center_id) { params.push(center_id); conds.push(`scp.center_id = $${params.length}`); }
    if (modality)  { params.push(modality);  conds.push(`sd.modality = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT scp.id, scp.study_definition_id, sd.study_code, sd.study_name, sd.study_type, sd.modality,
              scp.center_id, c.name AS center_name,
              scp.base_rate, scp.insurance_rate, scp.self_pay_rate, scp.active
       FROM study_center_pricing scp
       JOIN study_definitions sd ON sd.id = scp.study_definition_id
       LEFT JOIN centers c ON c.id = scp.center_id
       WHERE ${conds.join(' AND ')}
       ORDER BY sd.modality, sd.study_name, c.name`,
      params
    );
    res.json({ success: true, pricing: rows });
  } catch (err) {
    logger.error('study-pricing GET:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/study-pricing', [
  body('study_definition_id').isInt({ min: 1 }).withMessage('Study is required'),
  body('center_id').isInt({ min: 1 }).withMessage('Center is required'),
  body('base_rate').isFloat({ min: 0 }).withMessage('Base rate must be ≥ 0').toFloat(),
], authenticateToken, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { study_definition_id, center_id, base_rate } = req.body;
    // Upsert: insert or update rate for this (study, center) pair
    const { rows } = await pool.query(
      `INSERT INTO study_center_pricing (study_definition_id, center_id, base_rate, insurance_rate, self_pay_rate)
       VALUES ($1, $2, $3, $3, $3)
       ON CONFLICT (study_definition_id, center_id)
       DO UPDATE SET base_rate=$3, insurance_rate=$3, self_pay_rate=$3, updated_at=NOW()
       RETURNING *`,
      [study_definition_id, center_id, base_rate]
    );
    res.status(201).json({ success: true, pricing: rows[0] });
  } catch (err) {
    logger.error('study-pricing POST:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/study-pricing/:id', [
  body('base_rate').isFloat({ min: 0 }).toFloat(),
], authenticateToken, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { base_rate } = req.body;
    const { rows } = await pool.query(
      `UPDATE study_center_pricing SET base_rate=$1, insurance_rate=$1, self_pay_rate=$1, updated_at=NOW()
       WHERE id=$2 AND active=true RETURNING *`,
      [base_rate, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, pricing: rows[0] });
  } catch (err) {
    logger.error('study-pricing PUT:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch upsert — saves all centre pricing in one DB round trip
router.post('/study-pricing/batch', authenticateToken, async (req, res) => {
  const { center_id, items } = req.body;
  if (!center_id || !Array.isArray(items) || !items.length)
    return res.status(400).json({ error: 'center_id and items[] required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const { study_definition_id, base_rate } of items) {
      if (!study_definition_id || isNaN(parseFloat(base_rate)) || parseFloat(base_rate) < 0) continue;
      const { rows } = await client.query(
        `INSERT INTO study_center_pricing (study_definition_id, center_id, base_rate, insurance_rate, self_pay_rate)
         VALUES ($1, $2, $3, $3, $3)
         ON CONFLICT (study_definition_id, center_id)
         DO UPDATE SET base_rate=$3, insurance_rate=$3, self_pay_rate=$3, active=true, updated_at=NOW()
         RETURNING id, study_definition_id, center_id, base_rate`,
        [study_definition_id, center_id, parseFloat(base_rate)]
      );
      results.push(rows[0]);
    }
    await client.query('COMMIT');
    res.json({ success: true, saved: results.length, pricing: results });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('study-pricing batch POST:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.delete('/study-pricing/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE study_center_pricing SET active=false, updated_at=NOW() WHERE id=$1 AND active=true RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('study-pricing DELETE:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ASSET MASTER - Equipment and asset management
router.get('/asset-master', async (req, res) => {
  try {
    const { center_id, asset_type, status, active_only = 'true' } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND am.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (asset_type) {
      whereClause += ' AND am.asset_type = $2';
      queryParams.push(asset_type);
    }
    
    if (status) {
      whereClause += ' AND am.status = $3';
      queryParams.push(status);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND am.active = true';
    }

    const query = `
      SELECT 
        am.*,
        c.name as center_name,
        CASE 
          WHEN am.asset_type = 'SCANNER' THEN 'Medical Scanner'
          WHEN am.asset_type = 'COMPUTER' THEN 'Computer System'
          WHEN am.asset_type = 'WORKSTATION' THEN 'Workstation'
          WHEN am.asset_type = 'PRINTER' THEN 'Printer'
          WHEN am.asset_type = 'NETWORK' THEN 'Network Equipment'
          WHEN am.asset_type = 'FURNITURE' THEN 'Furniture'
          WHEN am.asset_type = 'VEHICLE' THEN 'Vehicle'
          ELSE am.asset_type
        END as asset_type_display
      FROM asset_masters am
      LEFT JOIN centers c ON am.center_id = c.id
      WHERE ${whereClause}
      ORDER BY am.asset_name
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      asset_masters: result.rows
    });

  } catch (error) {
    logger.error('Get asset masters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create asset master entry
router.post('/asset-master', [
  body('asset_code').trim().isLength({ min: 2, max: 20 }),
  body('asset_name').trim().isLength({ min: 5, max: 100 }),
  body('asset_type').isIn(['SCANNER', 'COMPUTER', 'WORKSTATION', 'PRINTER', 'NETWORK', 'FURNITURE', 'VEHICLE', 'OTHER']),
  body('manufacturer').trim().isLength({ min: 2, max: 100 }),
  body('model').trim().isLength({ min: 2, max: 100 }),
  body('serial_number').trim().isLength({ min: 2, max: 100 }),
  body('purchase_date').isDate(),
  body('warranty_expiry').optional().isDate(),
  body('center_id').isInt(),
  body('status').isIn(['active', 'maintenance', 'retired'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      asset_code, asset_name, asset_type, manufacturer, model, serial_number,
      purchase_date, warranty_expiry, center_id, status
    } = req.body;

    const query = `
      INSERT INTO asset_masters (
        asset_code, asset_name, asset_type, manufacturer, model, serial_number,
        purchase_date, warranty_expiry, center_id, status,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      asset_code, asset_name, asset_type, manufacturer, model, serial_number,
      purchase_date, warranty_expiry, center_id, status
    ]);

    logger.info(`Asset master created: ${asset_code} - ${asset_name}`);

    res.status(201).json({
      success: true,
      message: 'Asset master created successfully',
      asset_master: result.rows[0]
    });

  } catch (error) {
    logger.error('Create asset master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// REFERRING PHYSICIAN MASTER
router.get('/referring-physician-master', async (req, res) => {
  try {
    const { center_id, specialty, active_only = 'true' } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND rpm.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (specialty) {
      whereClause += ' AND rpm.specialty = $2';
      queryParams.push(specialty);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND rpm.active = true';
    }

    const query = `
      SELECT 
        rpm.*,
        c.name as center_name
      FROM referring_physician_master rpm
      LEFT JOIN centers c ON rpm.center_id = c.id
      WHERE ${whereClause}
      ORDER BY rpm.physician_name
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      referring_physician_masters: result.rows
    });

  } catch (error) {
    logger.error('Get referring physician masters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create referring physician master entry
router.post('/referring-physician-master', [
  body('physician_code').trim().isLength({ min: 2, max: 20 }),
  body('physician_name').trim().isLength({ min: 5, max: 100 }),
  body('specialty').trim().isLength({ min: 2, max: 50 }),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('address').trim().isLength({ min: 10, max: 500 }),
  body('center_id').isInt(),
  body('status').isIn(['active', 'inactive'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      physician_code, physician_name, specialty, phone, email, address, center_id, status
    } = req.body;

    const query = `
      INSERT INTO referring_physician_masters (
        physician_code, physician_name, specialty, phone, email, address,
        center_id, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      physician_code, physician_name, specialty, phone, email, address, center_id, status
    ]);

    logger.info(`Referring physician master created: ${physician_code} - ${physician_name}`);

    res.status(201).json({
      success: true,
      message: 'Referring physician master created successfully',
      referring_physician_master: result.rows[0]
    });

  } catch (error) {
    logger.error('Create referring physician master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// RADIOLOGIST MASTER
router.get('/radiologist-master', async (req, res) => {
  try {
    const { center_id, specialty, active_only = 'true' } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND rm.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (specialty) {
      whereClause += ' AND rm.specialty = $2';
      queryParams.push(specialty);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND rm.active = true';
    }

    const query = `
      SELECT 
        rm.*,
        c.name as center_name
      FROM radiologist_masters rm
      LEFT JOIN centers c ON rm.center_id = c.id
      WHERE ${whereClause}
      ORDER BY rm.radiologist_name
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      radiologist_masters: result.rows
    });

  } catch (error) {
    logger.error('Get radiologist masters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create radiologist master entry
router.post('/radiologist-master', [
  body('radiologist_code').trim().isLength({ min: 2, max: 20 }),
  body('radiologist_name').trim().isLength({ min: 5, max: 100 }),
  body('specialty').trim().isLength({ min: 2, max: 50 }),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('center_id').isInt(),
  body('status').isIn(['active', 'inactive'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      radiologist_code, radiologist_name, specialty, phone, email, center_id, status
    } = req.body;

    const query = `
      INSERT INTO radiologist_masters (
        radiologist_code, radiologist_name, specialty, phone, email,
        center_id, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      radiologist_code, radiologist_name, specialty, phone, email, center_id, status
    ]);

    logger.info(`Radiologist master created: ${radiologist_code} - ${radiologist_name}`);

    res.status(201).json({
      success: true,
      message: 'Radiologist master created successfully',
      radiologist_master: result.rows[0]
    });

  } catch (error) {
    logger.error('Create radiologist master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update radiologist master entry
router.put('/radiologist-master/:id', [
  body('radiologist_code').trim().isLength({ min: 2, max: 20 }),
  body('radiologist_name').trim().isLength({ min: 5, max: 100 }),
  body('specialty').trim().isLength({ min: 2, max: 50 }),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('center_id').isInt(),
  body('status').isIn(['active', 'inactive'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      radiologist_code, radiologist_name, specialty, phone, email, center_id, status
    } = req.body;

    const query = `
      UPDATE radiologist_masters SET
        radiologist_code = $1, radiologist_name = $2, specialty = $3,
        phone = $4, email = $5, center_id = $6, status = $7,
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `;

    const result = await pool.query(query, [
      radiologist_code, radiologist_name, specialty, phone, email, center_id, status, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Radiologist master not found' });
    }

    logger.info(`Radiologist master updated: ${radiologist_code} - ${radiologist_name}`);

    res.json({
      success: true,
      message: 'Radiologist master updated successfully',
      radiologist_master: result.rows[0]
    });

  } catch (error) {
    logger.error('Update radiologist master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete radiologist master entry
router.delete('/radiologist-master/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      UPDATE radiologist_masters 
      SET active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Radiologist master not found' });
    }

    logger.info(`Radiologist master deleted: ${result.rows[0].radiologist_code}`);

    res.json({
      success: true,
      message: 'Radiologist master deleted successfully'
    });

  } catch (error) {
    logger.error('Delete radiologist master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// USER MASTER
router.get('/user-master', authenticateToken, async (req, res) => {
  try {
    const { center_id, role, active_only = 'true' } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND u.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (role) {
      whereClause += ' AND u.role = $2';
      queryParams.push(role);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND u.active = true';
    }

    const query = `
      SELECT 
        u.id, u.username, u.email, u.name, u.first_name, u.last_name,
        u.phone, u.role, u.active, u.created_at, u.updated_at,
        c.name as center_name
      FROM users u
      LEFT JOIN centers c ON u.center_id = c.id
      WHERE ${whereClause}
      ORDER BY u.name
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      users: result.rows
    });

  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user master entry
router.post('/user-master', [
  body('username').trim().isLength({ min: 3, max: 50 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('password').trim().isLength({ min: 8, max: 100 }),
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('first_name').trim().isLength({ min: 2, max: 100 }),
  body('last_name').trim().isLength({ min: 2, max: 100 }),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('role').trim().isIn(['admin', 'doctor', 'staff', 'accountant', 'center_manager', 'radiologist', 'receptionist', 'technician']),
  body('center_id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      username, email, password, name, first_name, last_name, phone, role, center_id
    } = req.body;

    // Hash password
    const bcrypt = require('bcrypt');
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const query = `
      INSERT INTO users (
        username, email, password_hash, name, first_name, last_name,
        phone, role, center_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      username, email, hashedPassword, name, first_name, last_name, phone, role, center_id
    ]);

    logger.info(`User created: ${username} - ${name}`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: result.rows[0]
    });

  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CONSUMABLE MASTER
router.get('/consumable-master', authenticateToken, async (req, res) => {
  try {
    const { category_id, active_only = 'true' } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (category_id) {
      whereClause += ' AND cm.category_id = $1';
      queryParams.push(category_id);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND cm.active = true';
    }

    const query = `
      SELECT 
        cm.*,
        cc.category_name
      FROM consumable_masters cm
      LEFT JOIN consumable_categories cc ON cm.category_id = cc.id
      WHERE ${whereClause}
      ORDER BY cm.item_name
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      consumable_masters: result.rows
    });

  } catch (error) {
    logger.error('Get consumable masters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create consumable master entry
router.post('/consumable-master', [
  body('item_code').trim().isLength({ min: 2, max: 50 }),
  body('item_name').trim().isLength({ min: 2, max: 255 }),
  body('category_id').isInt(),
  body('description').trim().isLength({ min: 5, max: 1000 }),
  body('unit_of_measure').trim().isLength({ min: 1, max: 20 }),
  body('current_stock').isFloat({ min: 0 }),
  body('min_stock_level').isFloat({ min: 0 }),
  body('cost_per_unit').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      item_code, item_name, category_id, description, unit_of_measure,
      current_stock, min_stock_level, cost_per_unit
    } = req.body;

    const query = `
      INSERT INTO consumable_masters (
        item_code, item_name, category_id, description, unit_of_measure,
        current_stock, min_stock_level, cost_per_unit, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      item_code, item_name, category_id, description, unit_of_measure,
      current_stock, min_stock_level, cost_per_unit
    ]);

    logger.info(`Consumable master created: ${item_code} - ${item_name}`);

    res.status(201).json({
      success: true,
      message: 'Consumable created successfully',
      consumable_master: result.rows[0]
    });

  } catch (error) {
    logger.error('Create consumable error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Financial reconciliation endpoint
router.get('/financial-reconciliation', async (req, res) => {
  try {
    const { center_id, start_date, end_date, modality } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND st.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (modality) {
      whereClause += ' AND sm.modality = $2';
      queryParams.push(modality);
    }
    
    if (start_date && end_date) {
      whereClause += ' AND st.appointment_date >= $3 AND st.appointment_date <= $4';
      queryParams.push(start_date, end_date);
    }

    const query = `
      SELECT 
        st.id as study_id,
        st.accession_number,
        st.appointment_date,
        st.status,
        p.name as patient_name,
        sm.study_name,
        sm.modality,
        sm.base_rate,
        sm.insurance_rate,
        sm.self_pay_rate,
        sm.contrast_rate,
        sm.emergency_rate,
        sm.weekend_rate,
        sm.tax_rate,
        (SELECT SUM(amount) FROM invoice_items WHERE study_id = st.id) as total_amount
      FROM studies st
      LEFT JOIN patients p ON st.patient_id = p.id
      LEFT JOIN study_masters sm ON st.study_master_id = sm.id
      WHERE ${whereClause}
      ORDER BY st.appointment_date DESC
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error('Financial reconciliation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── VENDOR MASTER ──────────────────────────────────────────────────────────────
router.get('/vendor-master', authenticateToken, async (req, res) => {
  try {
    const { vendor_type, active_only = 'true' } = req.query;
    const params = [];
    const conditions = ['1=1'];
    if (active_only === 'true') conditions.push('active = true');
    if (vendor_type) { params.push(vendor_type); conditions.push(`vendor_type = $${params.length}`); }
    const result = await pool.query(
      `SELECT * FROM asset_vendors WHERE ${conditions.join(' AND ')} ORDER BY vendor_name`,
      params
    );
    res.json({ success: true, vendors: result.rows });
  } catch (error) {
    logger.error('Get vendor master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/vendor-master', [
  body('vendor_name').trim().isLength({ min: 2, max: 100 }).withMessage('Vendor name must be 2-100 characters'),
  body('vendor_type').notEmpty().withMessage('Vendor type is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
], authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      vendor_name, vendor_type,
      contact_person = '', email = '', phone = '', address = '',
      payment_terms = '', notes = '',
      gstin = '', pan_number = '',
      bank_name = '', bank_branch = '', account_name = '', account_number = '', ifsc_code = '', upi_id = '',
    } = req.body;

    // Auto-generate vendor_code: VND-0001, VND-0002, …
    const countRes = await pool.query('SELECT COUNT(*) FROM asset_vendors');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const vendor_code = `VND-${String(seq).padStart(4, '0')}`;

    const result = await pool.query(
      `INSERT INTO asset_vendors
         (vendor_code, vendor_name, vendor_type, contact_person, email, phone,
          address, payment_terms, notes,
          gstin, pan_number, bank_name, bank_branch, account_name, account_number, ifsc_code, upi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [vendor_code, vendor_name, vendor_type, contact_person, email, phone,
       address, payment_terms, notes,
       gstin, pan_number, bank_name, bank_branch, account_name, account_number, ifsc_code, upi_id]
    );
    res.status(201).json({ success: true, vendor: result.rows[0] });
  } catch (error) {
    logger.error('Create vendor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/vendor-master/:id', [
  body('vendor_name').trim().isLength({ min: 2, max: 100 }).withMessage('Vendor name must be 2-100 characters'),
  body('vendor_type').notEmpty().withMessage('Vendor type is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
], authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      vendor_name, vendor_type,
      contact_person = '', email = '', phone = '', address = '',
      payment_terms = '', notes = '',
      active = true,
      gstin = '', pan_number = '',
      bank_name = '', bank_branch = '', account_name = '', account_number = '', ifsc_code = '', upi_id = '',
    } = req.body;

    const result = await pool.query(
      `UPDATE asset_vendors
       SET vendor_name=$1, vendor_type=$2, contact_person=$3, email=$4, phone=$5,
           address=$6, payment_terms=$7, notes=$8,
           active=$9,
           gstin=$10, pan_number=$11, bank_name=$12, bank_branch=$13,
           account_name=$14, account_number=$15, ifsc_code=$16, upi_id=$17,
           updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [vendor_name, vendor_type, contact_person, email, phone,
       address, payment_terms, notes,
       active,
       gstin, pan_number, bank_name, bank_branch,
       account_name, account_number, ifsc_code, upi_id,
       req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ success: true, vendor: result.rows[0] });
  } catch (error) {
    logger.error('Update vendor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/vendor-master/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE asset_vendors SET active=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete vendor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Modalities Master ─────────────────────────────────────────────────────────
router.get('/modalities', authenticateToken, async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;
    const rows = (await pool.query(
      `SELECT m.*, COUNT(cm.id) AS center_count
       FROM modalities m
       LEFT JOIN center_modalities cm ON cm.modality = m.code AND cm.active = true
       ${active_only === 'true' ? 'WHERE m.active = true' : ''}
       GROUP BY m.id ORDER BY m.code`
    )).rows;
    res.json({ success: true, modalities: rows });
  } catch (e) {
    logger.error('Get modalities error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/modalities', [
  authenticateToken,
  body('code').trim().toUpperCase().isLength({ min: 2, max: 20 }),
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { code, name, description = '' } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO modalities (code, name, description, active, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW()) RETURNING *`,
      [code.toUpperCase(), name, description]
    );
    res.status(201).json({ success: true, modality: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Modality code already exists' });
    logger.error('Create modality error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/modalities/:id', [
  authenticateToken,
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { name, description = '', active } = req.body;
    const { rows } = await pool.query(
      `UPDATE modalities SET name=$1, description=$2, active=COALESCE($3, active), updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [name, description, active ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Modality not found' });
    res.json({ success: true, modality: rows[0] });
  } catch (e) {
    logger.error('Update modality error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/modalities/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE modalities SET active=false, updated_at=NOW() WHERE id=$1 RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Modality not found' });
    res.json({ success: true });
  } catch (e) {
    logger.error('Delete modality error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
