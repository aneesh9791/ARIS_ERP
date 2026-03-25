const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
// GET endpoints are open to any authenticated user (centers are needed as
// dropdowns in billing, stock, studies, etc. across all operational roles).
// CENTER_VIEW is only required for write/management operations.
router.post('/', authorizePermission('CENTER_WRITE'));
router.delete('/:id', authorizePermission('CENTER_WRITE'));
router.post('/:id/modalities', authorizePermission('CENTER_WRITE'));
router.put('/:id/modalities/:modality_id', authorizePermission('CENTER_WRITE'));
router.delete('/:id/modalities/:modality_id', authorizePermission('CENTER_WRITE'));

// Get all diagnostic centers
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', active_only = 'true', operational_only = 'false' } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        c.*,
        COUNT(p.id) as patient_count,
        COUNT(i.id) as invoice_count,
        COUNT(s.id) as scanner_count,
        COUNT(staff.id) as staff_count,
        STRING_AGG(DISTINCT cm.modality, ', ') as available_modalities
      FROM centers c
      LEFT JOIN patients p ON c.id = p.center_id AND p.active = true
      LEFT JOIN invoices i ON c.id = i.center_id AND i.active = true
      LEFT JOIN scanners s ON c.id = s.center_id AND s.active = true
      LEFT JOIN users staff ON c.id = staff.center_id AND staff.active = true
      LEFT JOIN center_modalities cm ON c.id = cm.center_id AND cm.active = true
      WHERE c.active = true
    `;

    // operational_only=true excludes corporate entities (Feenixtech etc.)
    // Used by patient registration, billing, study scheduling dropdowns
    if (operational_only === 'true') query += ` AND c.is_corporate = false`;

    let queryParams = [];
    if (search) {
      query += ` AND (c.name ILIKE $1 OR c.city ILIKE $1 OR c.state ILIKE $1)`;
      queryParams.push(`%${search}%`);
    }

    query += ` GROUP BY c.id ORDER BY c.name ASC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    const corpFilter = operational_only === 'true' ? ' AND is_corporate = false' : '';
    const countQuery = `
      SELECT COUNT(*) FROM centers
      WHERE active = true${corpFilter} ${search ? `AND (name ILIKE $1 OR city ILIKE $1 OR state ILIKE $1)` : ''}
    `;
    const countResult = await pool.query(countQuery, search ? [`%${search}%`] : []);

    const centers = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      centers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get centers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single center with details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        c.*,
        COUNT(DISTINCT p.id) as patient_count,
        COUNT(DISTINCT i.id) as invoice_count,
        COUNT(DISTINCT s.id) as scanner_count,
        COUNT(DISTINCT staff.id) as staff_count,
        COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END), 0) as total_revenue,
        COUNT(DISTINCT CASE WHEN p.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN p.id END) as new_patients_30d
      FROM centers c
      LEFT JOIN patients p ON c.id = p.center_id AND p.active = true
      LEFT JOIN invoices i ON c.id = i.center_id AND i.status = 'paid'
      LEFT JOIN scanners s ON c.id = s.center_id AND s.active = true
      LEFT JOIN users staff ON c.id = staff.center_id AND staff.active = true
      WHERE c.id = $1 AND c.active = true
      GROUP BY c.id
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Center not found' });
    }

    // Get center scanners/equipment
    const scannerQuery = `
      SELECT * FROM scanners 
      WHERE center_id = $1 AND active = true 
      ORDER BY scanner_type, name
    `;
    const scannerResult = await pool.query(scannerQuery, [id]);

    // Get center staff
    const staffQuery = `
      SELECT u.id, u.name, u.role, u.email, u.phone 
      FROM users u 
      WHERE u.center_id = $1 AND u.active = true 
      ORDER BY u.role, u.name
    `;
    const staffResult = await pool.query(staffQuery, [id]);

    const centerData = {
      ...result.rows[0],
      scanners: scannerResult.rows,
      staff: staffResult.rows
    };

    res.json(centerData);

  } catch (error) {
    logger.error('Get center error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new diagnostic center
router.post('/', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('code').trim().isLength({ min: 2, max: 20 }),
  body('address').trim().isLength({ min: 10, max: 500 }),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 }),
  body('postal_code').trim().isLength({ min: 6, max: 6 }),
  body('country').trim().isLength({ min: 2, max: 100 }),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('manager_name').trim().isLength({ min: 2, max: 100 }),
  body('manager_email').trim().isEmail().normalizeEmail(),
  body('manager_phone').trim().isLength({ min: 10, max: 20 }),
  body('operating_hours').trim().isLength({ min: 5, max: 100 }),
  body('emergency_contact').trim().isLength({ min: 10, max: 20 }),
  body('capacity_daily').isInt({ min: 1, max: 1000 }),
  body('specialties').isArray(),
  body('insurance_providers').isArray(),
  body('gst_number').optional().trim().isLength({ min: 15, max: 15 }),
  body('modalities').isArray(),
  body('pan_number').optional().trim().isLength({ min: 10, max: 10 }),
  body('license_number').optional().trim().isLength({ min: 5, max: 50 }),
  body('established_year').optional().isInt({ min: 1900, max: new Date().getFullYear() })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      code,
      address,
      city,
      state,
      postal_code,
      country,
      phone,
      email,
      manager_name,
      manager_email,
      manager_phone,
      operating_hours,
      emergency_contact,
      capacity_daily,
      specialties,
      insurance_providers,
      gst_number,
      modalities,
      pan_number,
      license_number,
      established_year
    } = req.body;

    // Check if center code already exists
    const existingCenter = await pool.query(
      'SELECT id FROM centers WHERE code = $1 AND active = true',
      [code]
    );

    if (existingCenter.rows.length > 0) {
      return res.status(400).json({ error: 'Center code already exists' });
    }

    // Generate center ID
    const centerId = 'CTR' + Date.now().toString(36).substr(2, 9).toUpperCase();

    // Insert center
    const result = await pool.query(
      `INSERT INTO centers (
        id, name, code, address, city, state, postal_code, country, phone, email,
        manager_name, manager_email, manager_phone, operating_hours, emergency_contact,
        capacity_daily, specialties, insurance_providers, gst_number, pan_number,
        license_number, established_year, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, NOW(), NOW(), true
      ) RETURNING id`,
      [
        centerId, name, code, address, city, state, postal_code, country, phone, email,
        manager_name, manager_email, manager_phone, operating_hours, emergency_contact,
        capacity_daily, specialties, insurance_providers, gst_number, pan_number,
        license_number, established_year
      ]
    );

    const newCenterId = result.rows[0].id;

    // Add modalities to center
    if (modalities && modalities.length > 0) {
      for (const modality of modalities) {
        await pool.query(
          `INSERT INTO center_modalities (
            center_id, modality, description, equipment_count, created_at, updated_at, active
          ) VALUES (
            $1, $2, $3, $4, NOW(), NOW(), true
          )`,
          [newCenterId, modality.modality, modality.description || '', modality.equipment_count || 0]
        );
      }
    }

    logger.info(`Center created: ${name} (${code}) with modalities: ${modalities?.map(m => m.modality).join(', ') || 'None'}`);

    res.status(201).json({
      message: 'Center created successfully',
      center: {
        id: centerId,
        name,
        code,
        address,
        city,
        state,
        postal_code,
        country,
        phone,
        email,
        manager_name,
        manager_email,
        manager_phone,
        operating_hours,
        emergency_contact,
        capacity_daily,
        specialties,
        insurance_providers,
        gst_number,
        pan_number,
        license_number,
        established_year,
        modalities
      }
    });

  } catch (error) {
    logger.error('Create center error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete center (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if center exists
    const existingCenter = await pool.query(
      'SELECT id FROM centers WHERE id = $1 AND active = true',
      [id]
    );

    if (existingCenter.rows.length === 0) {
      return res.status(404).json({ error: 'Center not found' });
    }

    // Soft delete center
    await pool.query(
      'UPDATE centers SET active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    // Soft delete associated modalities
    await pool.query(
      'UPDATE center_modalities SET active = false, updated_at = NOW() WHERE center_id = $1',
      [id]
    );

    logger.info(`Center deleted: ${id}`);

    res.json({
      message: 'Center deleted successfully'
    });

  } catch (error) {
    logger.error('Delete center error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get center modalities
router.get('/:id/modalities', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        cm.*,
        COUNT(s.id) as scanner_count
      FROM center_modalities cm
      LEFT JOIN scanners s ON cm.center_id = s.center_id AND s.modality = cm.modality AND s.active = true
      WHERE cm.center_id = $1 AND cm.active = true
      GROUP BY cm.id
      ORDER BY cm.modality
    `;

    const result = await pool.query(query, [id]);

    res.json({
      success: true,
      modalities: result.rows
    });

  } catch (error) {
    logger.error('Get center modalities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add modality to center
router.post('/:id/modalities', [
  body('modality').trim().isLength({ min: 2, max: 50 }),
  body('description').optional().trim().isLength({ min: 5, max: 500 }),
  body('equipment_count').isInt({ min: 0, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { modality, description, equipment_count } = req.body;

    // Check if center exists
    const existingCenter = await pool.query(
      'SELECT id FROM centers WHERE id = $1 AND active = true',
      [id]
    );

    if (existingCenter.rows.length === 0) {
      return res.status(404).json({ error: 'Center not found' });
    }

    // Upsert: reactivate if soft-deleted row exists (UNIQUE constraint on center_id+modality)
    await pool.query(
      `INSERT INTO center_modalities (center_id, modality, description, equipment_count, created_at, updated_at, active)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), true)
       ON CONFLICT (center_id, modality) DO UPDATE
         SET active = true, description = EXCLUDED.description,
             equipment_count = EXCLUDED.equipment_count, updated_at = NOW()`,
      [id, modality, description || '', equipment_count || 0]
    );

    logger.info(`Modality added to center: ${modality} to center ${id}`);

    res.status(201).json({
      message: 'Modality added successfully',
      modality: {
        center_id: id,
        modality,
        description,
        equipment_count
      }
    });

  } catch (error) {
    logger.error('Add modality to center error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update center modality
router.put('/:id/modalities/:modality_id', [
  body('description').optional().trim().isLength({ min: 5, max: 500 }),
  body('equipment_count').isInt({ min: 0, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, modality_id } = req.params;
    const { description, equipment_count } = req.body;

    // Check if center exists
    const existingCenter = await pool.query(
      'SELECT id FROM centers WHERE id = $1 AND active = true',
      [id]
    );

    if (existingCenter.rows.length === 0) {
      return res.status(404).json({ error: 'Center not found' });
    }

    // Check if modality exists
    const existingModality = await pool.query(
      'SELECT id FROM center_modalities WHERE id = $1 AND center_id = $2 AND active = true',
      [modality_id, id]
    );

    if (existingModality.rows.length === 0) {
      return res.status(404).json({ error: 'Modality not found' });
    }

    // Update modality
    await pool.query(
      `UPDATE center_modalities SET 
        description = $1, equipment_count = $2, updated_at = NOW() 
      WHERE id = $3 AND center_id = $4 AND active = true`,
      [description, equipment_count, modality_id, id]
    );

    logger.info(`Center modality updated: ${modality_id} for center ${id}`);

    res.json({
      message: 'Modality updated successfully',
      modality: {
        id: modality_id,
        center_id: id,
        description,
        equipment_count
      }
    });

  } catch (error) {
    logger.error('Update center modality error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove modality from center
router.delete('/:id/modalities/:modality_id', async (req, res) => {
  try {
    const { id, modality_id } = req.params;

    // Check if center exists
    const existingCenter = await pool.query(
      'SELECT id FROM centers WHERE id = $1 AND active = true',
      [id]
    );

    if (existingCenter.rows.length === 0) {
      return res.status(404).json({ error: 'Center not found' });
    }

    // Check if modality exists
    const existingModality = await pool.query(
      'SELECT id FROM center_modalities WHERE id = $1 AND center_id = $2 AND active = true',
      [modality_id, id]
    );

    if (existingModality.rows.length === 0) {
      return res.status(404).json({ error: 'Modality not found' });
    }

    // Soft delete modality
    await pool.query(
      'UPDATE center_modalities SET active = false, updated_at = NOW() WHERE id = $1',
      [modality_id]
    );

    logger.info(`Center modality removed: ${modality_id} from center ${id}`);

    res.json({
      message: 'Modality removed successfully'
    });

  } catch (error) {
    logger.error('Remove center modality error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available modalities for selection
router.get('/modalities/available', async (req, res) => {
  try {
    const query = `
      SELECT 
        modality, 
        description,
        COUNT(*) as center_count
      FROM center_modalities 
      WHERE active = true
      GROUP BY modality, description
      ORDER BY modality
    `;

    const result = await pool.query(query);

    // Pull canonical list from modalities master table
    const masterResult = await pool.query(
      'SELECT code, name, description FROM modalities WHERE active = true ORDER BY code'
    );

    const modalities = masterResult.rows.map(mod => {
      const existing = result.rows.find(r => r.modality === mod.code);
      return {
        modality: mod.code,
        name: mod.name,
        description: mod.description,
        center_count: existing ? parseInt(existing.center_count) : 0
      };
    });

    res.json({
      success: true,
      modalities
    });

  } catch (error) {
    logger.error('Get available modalities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get center statistics with modality breakdown
router.get('/:id/statistics', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, date_range } = req.query;

    let dateFilter = 'CURRENT_DATE - INTERVAL \'30 days\'';
    let queryParams = [id];
    if (date_range === '7') {
      dateFilter = 'CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (date_range === '30') {
      dateFilter = 'CURRENT_DATE - INTERVAL \'30 days\'';
    } else if (date_range === '90') {
      dateFilter = 'CURRENT_DATE - INTERVAL \'90 days\'';
    } else if (start_date) {
      dateFilter = `'${start_date}'::DATE`;
    }

    const query = `
      SELECT 
        COUNT(DISTINCT p.id) as total_patients,
        COUNT(DISTINCT CASE WHEN p.created_at >= ${dateFilter} THEN p.id END) as new_patients,
        COUNT(DISTINCT i.id) as total_invoices,
        COUNT(DISTINCT CASE WHEN i.status = 'paid' AND i.created_at >= ${dateFilter} THEN i.id END) as paid_invoices,
        COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN i.status = 'paid' AND i.created_at >= ${dateFilter} THEN i.amount ELSE 0 END), 0) as period_revenue,
        COUNT(DISTINCT s.id) as active_scanners,
        COUNT(DISTINCT st.id) as active_staff,
        COUNT(DISTINCT CASE WHEN a.appointment_date >= CURRENT_DATE THEN a.id END) as today_appointments
      FROM centers c
      LEFT JOIN patients p ON c.id = p.center_id AND p.active = true
      LEFT JOIN invoices i ON c.id = i.center_id
      LEFT JOIN scanners s ON c.id = s.center_id AND s.active = true
      LEFT JOIN users st ON c.id = st.center_id AND st.active = true
      LEFT JOIN appointments a ON c.id = a.center_id AND a.active = true
      WHERE c.id = $1 AND c.active = true
      GROUP BY c.id
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Center not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Get center statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
