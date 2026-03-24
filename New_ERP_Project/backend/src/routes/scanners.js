const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('SCANNER_VIEW'));

// Get all scanners/equipment
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', center_id = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        s.*,
        c.name as center_name,
        COUNT(st.id) as total_studies,
        COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_studies,
        COALESCE(AVG(CASE WHEN st.status = 'completed' THEN st.duration END), 0) as avg_duration
      FROM scanners s
      LEFT JOIN centers c ON s.center_id = c.id
      LEFT JOIN studies st ON s.id = st.scanner_id
      WHERE s.active = true
    `;

    let queryParams = [];
    if (search) {
      query += ` AND (s.name ILIKE $1 OR s.scanner_type ILIKE $1 OR s.manufacturer ILIKE $1)`;
      queryParams.push(`%${search}%`);
    }

    if (center_id) {
      query += ` AND s.center_id = $${queryParams.length + 1}`;
      queryParams.push(center_id);
    }

    query += ` GROUP BY s.id, c.name ORDER BY s.center_id, s.scanner_type, s.name LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM scanners WHERE active = true`;
    if (search) countQuery += ` AND (name ILIKE $1 OR scanner_type ILIKE $1 OR manufacturer ILIKE $1)`;
    if (center_id) countQuery += ` AND center_id = $${search ? 2 : 1}`;
    const countParams = search && center_id ? [`%${search}%`, center_id] : search ? [`%${search}%`] : center_id ? [center_id] : [];
    const countResult = await pool.query(countQuery, countParams);

    const scanners = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      scanners,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get scanners error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get scanner details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        s.*,
        c.name as center_name,
        c.address as center_address,
        c.city as center_city,
        c.state as center_state
      FROM scanners s
      LEFT JOIN centers c ON s.center_id = c.id
      WHERE s.id = $1 AND s.active = true
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scanner not found' });
    }

    // Get recent studies for this scanner
    const studiesQuery = `
      SELECT 
        st.id,
        st.patient_id,
        st.study_date,
        st.status,
        st.duration,
        p.name as patient_name
      FROM studies st
      LEFT JOIN patients p ON st.patient_id = p.id
      WHERE st.scanner_id = $1 
      ORDER BY st.study_date DESC 
      LIMIT 10
    `;
    
    const studiesResult = await pool.query(studiesQuery, [id]);

    const scannerData = {
      ...result.rows[0],
      recent_studies: studiesResult.rows
    };

    res.json(scannerData);

  } catch (error) {
    logger.error('Get scanner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new scanner
router.post('/', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('scanner_type').isIn(['MRI', 'CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY', 'PET', 'SPECT']),
  body('manufacturer').trim().isLength({ min: 2, max: 100 }),
  body('model').trim().isLength({ min: 2, max: 100 }),
  body('serial_number').trim().isLength({ min: 5, max: 50 }),
  body('center_id').isInt(),
  body('installation_date').isISO8601().toDate(),
  body('last_maintenance_date').isISO8601().toDate(),
  body('next_maintenance_date').isISO8601().toDate(),
  body('status').isIn(['active', 'maintenance', 'offline']),
  body('capacity_daily').isInt({ min: 1 }),
  body('specialties').optional(),
  body('technical_specs').optional(),
  body('warranty_expiry').isISO8601().toDate()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      scanner_type,
      manufacturer,
      model,
      serial_number,
      center_id,
      installation_date,
      last_maintenance_date,
      next_maintenance_date,
      status,
      capacity_daily,
      specialties,
      technical_specs,
      warranty_expiry
    } = req.body;

    // Generate scanner ID
    const scannerId = 'SCN' + Date.now().toString(36).substr(2, 9).toUpperCase();

    const query = `
      INSERT INTO scanners (
        id, name, scanner_type, manufacturer, model, serial_number, 
        center_id, installation_date, last_maintenance_date, next_maintenance_date, 
        status, capacity_daily, specialties, technical_specs, warranty_expiry, 
        created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 
        $12, $13, $14, $15, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      scannerId, name, scanner_type, manufacturer, model, serial_number,
      center_id, installation_date, last_maintenance_date, next_maintenance_date,
      status, capacity_daily, specialties, technical_specs, warranty_expiry
    ]);

    logger.info(`Scanner created: ${name} (${scannerId})`);

    res.status(201).json({
      message: 'Scanner created successfully',
      scanner: {
        id: scannerId,
        name,
        scanner_type,
        manufacturer,
        model,
        serial_number,
        center_id,
        installation_date,
        last_maintenance_date,
        next_maintenance_date,
        status,
        capacity_daily,
        specialties,
        technical_specs,
        warranty_expiry
      }
    });

  } catch (error) {
    logger.error('Create scanner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update scanner
router.put('/:id', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('scanner_type').isIn(['MRI', 'CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY', 'PET', 'SPECT']),
  body('manufacturer').trim().isLength({ min: 2, max: 100 }),
  body('model').trim().isLength({ min: 2, max: 100 }),
  body('serial_number').trim().isLength({ min: 5, max: 50 }),
  body('center_id').isInt(),
  body('installation_date').isISO8601().toDate(),
  body('last_maintenance_date').isISO8601().toDate(),
  body('next_maintenance_date').isISO8601().toDate(),
  body('status').isIn(['active', 'maintenance', 'offline']),
  body('capacity_daily').isInt({ min: 1 }),
  body('specialties').optional(),
  body('technical_specs').optional(),
  body('warranty_expiry').isISO8601().toDate()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      name,
      scanner_type,
      manufacturer,
      model,
      serial_number,
      center_id,
      installation_date,
      last_maintenance_date,
      next_maintenance_date,
      status,
      capacity_daily,
      specialties,
      technical_specs,
      warranty_expiry
    } = req.body;

    const query = `
      UPDATE scanners SET 
        name = $2, scanner_type = $3, manufacturer = $4, model = $5, 
        serial_number = $6, center_id = $7, installation_date = $8, 
        last_maintenance_date = $9, next_maintenance_date = $10, status = $11, 
        capacity_daily = $12, specialties = $13, technical_specs = $14, 
        warranty_expiry = $15, updated_at = NOW() 
      WHERE id = $1 AND active = true
    `;

    await pool.query(query, [
      name, scanner_type, manufacturer, model, serial_number,
      center_id, installation_date, last_maintenance_date, next_maintenance_date,
      status, capacity_daily, specialties, technical_specs, warranty_expiry, id
    ]);

    logger.info(`Scanner updated: ${name} (${id})`);

    res.json({
      message: 'Scanner updated successfully',
      scanner: {
        id,
        name,
        scanner_type,
        manufacturer,
        model,
        serial_number,
        center_id,
        installation_date,
        last_maintenance_date,
        next_maintenance_date,
        status,
        capacity_daily,
        specialties,
        technical_specs,
        warranty_expiry
      }
    });

  } catch (error) {
    logger.error('Update scanner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete scanner (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = 'UPDATE scanners SET active = false, updated_at = NOW() WHERE id = $1';
    await pool.query(query, [id]);

    logger.info(`Scanner deleted: ${id}`);

    res.json({ message: 'Scanner deleted successfully' });

  } catch (error) {
    logger.error('Delete scanner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get scanner utilization report
router.get('/:id/utilization', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date = '', end_date = '' } = req.query;

    let query;
    let queryParams;
    if (start_date && end_date) {
      query = `
        SELECT
          DATE_TRUNC('day', st.study_date) as date,
          COUNT(*) as total_studies,
          COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_studies,
          COUNT(CASE WHEN st.status = 'cancelled' THEN 1 END) as cancelled_studies,
          COALESCE(AVG(CASE WHEN st.status = 'completed' THEN st.duration END), 0) as avg_duration,
          COALESCE(SUM(CASE WHEN st.status = 'completed' THEN st.duration END), 0) as total_duration
        FROM studies st
        WHERE st.scanner_id = $1 AND st.study_date >= $2 AND st.study_date <= $3
        GROUP BY DATE_TRUNC('day', st.study_date)
        ORDER BY date DESC
        LIMIT 30
      `;
      queryParams = [id, start_date, end_date];
    } else {
      query = `
        SELECT
          DATE_TRUNC('day', st.study_date) as date,
          COUNT(*) as total_studies,
          COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_studies,
          COUNT(CASE WHEN st.status = 'cancelled' THEN 1 END) as cancelled_studies,
          COALESCE(AVG(CASE WHEN st.status = 'completed' THEN st.duration END), 0) as avg_duration,
          COALESCE(SUM(CASE WHEN st.status = 'completed' THEN st.duration END), 0) as total_duration
        FROM studies st
        WHERE st.scanner_id = $1
        GROUP BY DATE_TRUNC('day', st.study_date)
        ORDER BY date DESC
        LIMIT 30
      `;
      queryParams = [id];
    }

    const result = await pool.query(query, queryParams);

    res.json({
      scanner_id: id,
      utilization: result.rows,
      period: {
        start_date,
        end_date
      }
    });

  } catch (error) {
    logger.error('Get scanner utilization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
