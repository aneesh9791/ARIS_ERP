const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/masters.log' })
  ]
});

// STUDY MASTER - Payment configuration for each modality
router.get('/study-master', authenticateToken, async (req, res) => {
  try {
    const { center_id, modality, active_only = 'true' } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    let paramIndex = 1;
    
    if (center_id) {
      whereClause += ` AND sm.center_id = $${paramIndex++}`;
      queryParams.push(center_id);
    }
    
    if (modality) {
      whereClause += ` AND sm.modality = $${paramIndex++}`;
      queryParams.push(modality);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND sm.active = true';
    }

    const query = `
      SELECT 
        sm.*,
        c.name as center_name,
        pm.name as payment_method_name,
        pm.type as payment_method_type,
        pm.description as payment_method_description
      FROM study_master sm
      LEFT JOIN centers c ON sm.center_id = c.id
      LEFT JOIN payment_methods pm ON sm.payment_method_id = pm.id
      WHERE ${whereClause}
      ORDER BY sm.center_id, sm.modality, sm.study_code
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      study_master: result.rows,
      filters: {
        center_id,
        modality,
        active_only
      }
    });

  } catch (error) {
    logger.error('Get study master error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create study master entry
router.post('/study-master', [
  body('study_code').trim().isLength({ min: 2, max: 20 }),
  body('study_name').trim().isLength({ min: 5, max: 100 }),
  body('modality').isIn(['MRI', 'CT', 'XRAY', 'ULTRASOUND', 'MAMMOGRAPHY', 'PET', 'SPECT']),
  body('description').trim().isLength({ min: 10, max: 500 }),
  body('center_id').isInt(),
  body('payment_method_id').isInt(),
  body('base_rate').isDecimal({ min: 0 }),
  body('insurance_rate').isDecimal({ min: 0 }),
  body('self_pay_rate').isDecimal({ min: 0 }),
  body('contrast_rate').optional().isDecimal({ min: 0 }),
  body('emergency_rate').optional().isDecimal({ min: 0 }),
  body('weekend_rate').optional().isDecimal({ min: 0 }),
  body('tax_rate').isDecimal({ min: 0, max: 1 }),
  body('billing_code').trim().isLength({ min: 2, max: 20 }),
  body('cpt_code').trim().isLength({ min: 5, max: 10 }),
  body('revenue_category').trim().isLength({ min: 2, max: 50 }),
  body('cost_category').trim().isLength({ min: 2, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      study_code,
      study_name,
      modality,
      description,
      center_id,
      payment_method_id,
      base_rate,
      insurance_rate,
      self_pay_rate,
      contrast_rate,
      emergency_rate,
      weekend_rate,
      tax_rate,
      billing_code,
      cpt_code,
      revenue_category,
      cost_category
    } = req.body;

    const query = `
      INSERT INTO study_master (
        study_code, study_name, modality, description, center_id, 
        payment_method_id, base_rate, insurance_rate, self_pay_rate, 
        contrast_rate, emergency_rate, weekend_rate, tax_rate, 
        billing_code, cpt_code, revenue_category, cost_category, 
        created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      study_code, study_name, modality, description, center_id,
      payment_method_id, base_rate, insurance_rate, self_pay_rate,
      contrast_rate, emergency_rate, weekend_rate, tax_rate,
      billing_code, cpt_code, revenue_category, cost_category
    ]);

    logger.info(`Study master created: ${study_code} - ${study_name}`);

    res.status(201).json({
      message: 'Study master created successfully',
      study_master: {
        study_code,
        study_name,
        modality,
        description,
        center_id,
        payment_method_id,
        base_rate,
        insurance_rate,
        self_pay_rate,
        contrast_rate,
        emergency_rate,
        weekend_rate,
        tax_rate,
        billing_code,
        cpt_code,
        revenue_category,
        cost_category
      }
    });

  } catch (error) {
    logger.error('Create study master error:', error);
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
      whereClause += ' AND am.asset_type = $' + (queryParams.length + 1);
      queryParams.push(asset_type);
    }
    
    if (status) {
      whereClause += ' AND am.status = $' + (queryParams.length + 1);
      queryParams.push(status);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND am.active = true';
    }

    const query = `
      SELECT 
        am.*,
        c.name as center_name,
        at.name as asset_type_name,
        at.depreciation_method,
        at.useful_life_years,
        COUNT(maintenance_id) as maintenance_count
      FROM asset_master am
      LEFT JOIN centers c ON am.center_id = c.id
      LEFT JOIN asset_types at ON am.asset_type = at.type_code
      LEFT JOIN asset_maintenance amm ON am.id = amm.asset_id AND amm.active = true
      WHERE ${whereClause}
      GROUP BY am.id, c.name, at.name, at.depreciation_method, at.useful_life_years
      ORDER BY am.center_id, am.asset_type, am.asset_code
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      asset_master: result.rows,
      filters: {
        center_id,
        asset_type,
        status,
        active_only
      }
    });

  } catch (error) {
    logger.error('Get asset master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create asset master entry
router.post('/asset-master', [
  body('asset_code').trim().isLength({ min: 2, max: 20 }),
  body('asset_name').trim().isLength({ min: 5, max: 100 }),
  body('asset_type').isIn(['SCANNER', 'COMPUTER', 'WORKSTATION', 'PRINTER', 'NETWORK', 'FURNITURE', 'VEHICLE', 'OTHER']),
  body('description').trim().isLength({ min: 10, max: 500 }),
  body('center_id').isInt(),
  body('manufacturer').trim().isLength({ min: 2, max: 100 }),
  body('model').trim().isLength({ min: 2, max: 100 }),
  body('serial_number').trim().isLength({ min: 5, max: 50 }),
  body('purchase_date').isISO8601().toDate(),
  body('purchase_cost').isDecimal({ min: 0 }),
  body('current_value').optional().isDecimal({ min: 0 }),
  body('depreciation_rate').isDecimal({ min: 0, max: 1 }),
  body('warranty_expiry').optional().isISO8601().toDate(),
  body('location').trim().isLength({ min: 2, max: 100 }),
  body('assigned_to').trim().isLength({ min: 2, max: 100 }),
  body('status').isIn(['ACTIVE', 'MAINTENANCE', 'RETIRED', 'LOST', 'DAMAGED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      asset_code,
      asset_name,
      asset_type,
      description,
      center_id,
      manufacturer,
      model,
      serial_number,
      purchase_date,
      purchase_cost,
      current_value,
      depreciation_rate,
      warranty_expiry,
      location,
      assigned_to,
      status
    } = req.body;

    const query = `
      INSERT INTO asset_master (
        asset_code, asset_name, asset_type, description, center_id, 
        manufacturer, model, serial_number, purchase_date, purchase_cost, 
        current_value, depreciation_rate, warranty_expiry, location, 
        assigned_to, status, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      asset_code, asset_name, asset_type, description, center_id,
      manufacturer, model, serial_number, purchase_date, purchase_cost,
      current_value || purchase_cost, depreciation_rate, warranty_expiry, location,
      assigned_to, status
    ]);

    logger.info(`Asset master created: ${asset_code} - ${asset_name}`);

    res.status(201).json({
      message: 'Asset master created successfully',
      asset_master: {
        asset_code,
        asset_name,
        asset_type,
        description,
        center_id,
        manufacturer,
        model,
        serial_number,
        purchase_date,
        purchase_cost,
        current_value: current_value || purchase_cost,
        depreciation_rate,
        warranty_expiry,
        location,
        assigned_to,
        status
      }
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
      whereClause += ' AND rpm.specialty = $' + (queryParams.length + 1);
      queryParams.push(specialty);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND rpm.active = true';
    }

    const query = `
      SELECT 
        rpm.*,
        c.name as center_name,
        COUNT(st.id) as referral_count,
        COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_studies,
        COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) as total_revenue
      FROM referring_physician_master rpm
      LEFT JOIN centers c ON rpm.center_id = c.id
      LEFT JOIN studies st ON rpm.physician_code = st.referring_physician_code
      LEFT JOIN study_master sm ON st.study_code = sm.study_code
      WHERE ${whereClause}
      GROUP BY rpm.id, c.name
      ORDER BY rpm.center_id, rpm.specialty, rpm.physician_name
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      referring_physician_master: result.rows,
      filters: {
        center_id,
        specialty,
        active_only
      }
    });

  } catch (error) {
    logger.error('Get referring physician master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create referring physician master entry
router.post('/referring-physician-master', [
  body('physician_code').trim().isLength({ min: 2, max: 20 }),
  body('physician_name').trim().isLength({ min: 5, max: 100 }),
  body('specialty').trim().isLength({ min: 2, max: 50 }),
  body('qualification').trim().isLength({ min: 5, max: 100 }),
  body('license_number').trim().isLength({ min: 5, max: 50 }),
  body('center_id').isInt(),
  body('contact_phone').trim().isLength({ min: 10, max: 20 }),
  body('contact_email').trim().isEmail().normalizeEmail(),
  body('address').trim().isLength({ min: 10, max: 200 }),
  body('commission_rate').optional().isDecimal({ min: 0, max: 1 }),
  body('contract_type').optional().isIn(['PER_STUDY', 'PER_MONTH', 'PER_YEAR', 'SALARY', 'VOLUME_BASED']),
  body('contract_start_date').optional().isISO8601().toDate(),
  body('contract_end_date').optional().isISO8601().toDate(),
  body('bank_account').optional().trim().isLength({ min: 10, max: 50 }),
  body('tax_id').optional().trim().isLength({ min: 5, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      physician_code,
      physician_name,
      specialty,
      qualification,
      license_number,
      center_id,
      contact_phone,
      contact_email,
      address,
      commission_rate,
      contract_type,
      contract_start_date,
      contract_end_date,
      bank_account,
      tax_id
    } = req.body;

    const query = `
      INSERT INTO referring_physician_master (
        physician_code, physician_name, specialty, qualification, license_number, 
        center_id, contact_phone, contact_email, address, commission_rate, 
        contract_type, contract_start_date, contract_end_date, bank_account, 
        tax_id, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      physician_code, physician_name, specialty, qualification, license_number,
      center_id, contact_phone, contact_email, address, commission_rate,
      contract_type, contract_start_date, contract_end_date, bank_account,
      tax_id
    ]);

    logger.info(`Referring physician master created: ${physician_code} - ${physician_name}`);

    res.status(201).json({
      message: 'Referring physician master created successfully',
      referring_physician_master: {
        physician_code,
        physician_name,
        specialty,
        qualification,
        license_number,
        center_id,
        contact_phone,
        contact_email,
        address,
        commission_rate,
        contract_type,
        contract_start_date,
        contract_end_date,
        bank_account,
        tax_id
      }
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
      whereClause += ' AND rm.specialty = $' + (queryParams.length + 1);
      queryParams.push(specialty);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND rm.active = true';
    }

    const query = `
      SELECT 
        rm.*,
        c.name as center_name,
        COUNT(st.id) as study_count,
        COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_studies,
        COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) as total_earnings
      FROM radiologist_master rm
      LEFT JOIN centers c ON rm.center_id = c.id
      LEFT JOIN studies st ON rm.radiologist_code = st.radiologist_code
      LEFT JOIN study_master sm ON st.study_code = sm.study_code
      WHERE ${whereClause}
      GROUP BY rm.id, c.name
      ORDER BY rm.center_id, rm.specialty, rm.radiologist_name
    `;

    const result = await pool.query(query, queryParams);
    res.json({
      success: true,
      radiologist_master: result.rows,
      filters: {
        center_id,
        specialty,
        active_only
      }
    });

  } catch (error) {
    logger.error('Get radiologist master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create radiologist master entry
router.post('/radiologist-master', [
  body('radiologist_code').trim().isLength({ min: 2, max: 20 }),
  body('radiologist_name').trim().isLength({ min: 5, max: 100 }),
  body('specialty').trim().isLength({ min: 2, max: 50 }),
  body('qualification').trim().isLength({ min: 5, max: 100 }),
  body('license_number').trim().isLength({ min: 5, max: 50 }),
  body('center_id').isInt(),
  body('contact_phone').trim().isLength({ min: 10, max: 20 }),
  body('contact_email').trim().isEmail().normalizeEmail(),
  body('address').trim().isLength({ min: 10, max: 200 }),
  body('per_study_rate').isDecimal({ min: 0 }),
  body('contract_type').isIn(['PER_STUDY', 'PER_MONTH', 'SALARY']),
  body('contract_start_date').optional().isISO8601().toDate(),
  body('contract_end_date').optional().isISO8601().toDate(),
  body('bank_account').optional().trim().isLength({ min: 10, max: 50 }),
  body('tax_id').optional().trim().isLength({ min: 5, max: 50 }),
  body('certifications').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      radiologist_code,
      radiologist_name,
      specialty,
      qualification,
      license_number,
      center_id,
      contact_phone,
      contact_email,
      address,
      per_study_rate,
      contract_type,
      contract_start_date,
      contract_end_date,
      bank_account,
      tax_id,
      certifications
    } = req.body;

    const query = `
      INSERT INTO radiologist_master (
        radiologist_code, radiologist_name, specialty, qualification, license_number, 
        center_id, contact_phone, contact_email, address, per_study_rate, 
        contract_type, contract_start_date, contract_end_date, 
        bank_account, tax_id, certifications, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      radiologist_code, radiologist_name, specialty, qualification, license_number,
      center_id, contact_phone, contact_email, address, per_study_rate,
      contract_type, contract_start_date, contract_end_date,
      bank_account, tax_id, certifications
    ]);

    logger.info(`Radiologist master created: ${radiologist_code} - ${radiologist_name}`);

    res.status(201).json({
      message: 'Radiologist master created successfully',
      radiologist_master: {
        radiologist_code,
        radiologist_name,
        specialty,
        qualification,
        license_number,
        center_id,
        contact_phone,
        contact_email,
        address,
        per_study_rate,
        contract_type,
        contract_start_date,
        contract_end_date,
        bank_account,
        tax_id,
        certifications
      }
    });

  } catch (error) {
    logger.error('Create radiologist master error:', error);
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
      whereClause += ' AND sm.modality = $' + (queryParams.length + 1);
      queryParams.push(modality);
    }
    
    if (start_date && end_date) {
      whereClause += ' AND st.appointment_date >= $' + (queryParams.length + 1) + ' AND st.appointment_date <= $' + (queryParams.length + 2);
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
        sm.revenue_category,
        rpm.physician_name as referring_physician,
        rpm.commission_rate,
        rm.radiologist_name as reading_radiologist,
        CASE 
          WHEN rm.contract_type = 'PER_STUDY' THEN rm.per_study_rate
          ELSE 0
        END as radiologist_cost,
        CASE 
          WHEN sm.modality = 'MRI' AND st.contrast_used = true THEN sm.base_rate + sm.contrast_rate
          WHEN st.emergency_study = true THEN sm.base_rate + sm.emergency_rate
          WHEN EXTRACT(DOW FROM st.appointment_date) IN (0, 6) THEN sm.base_rate + sm.weekend_rate
          ELSE sm.base_rate
        END as applied_rate,
        CASE 
          WHEN st.payment_type = 'insurance' THEN sm.insurance_rate
          WHEN st.payment_type = 'self_pay' THEN sm.self_pay_rate
          ELSE sm.base_rate
        END as payment_rate,
        CASE 
          WHEN st.payment_type = 'insurance' THEN sm.insurance_rate
          WHEN st.payment_type = 'self_pay' THEN sm.self_pay_rate
          ELSE sm.base_rate
        END * (1 + sm.tax_rate) as gross_amount,
        (CASE 
          WHEN st.payment_type = 'insurance' THEN sm.insurance_rate
          WHEN st.payment_type = 'self_pay' THEN sm.self_pay_rate
          ELSE sm.base_rate
        END * (1 + sm.tax_rate)) * rpm.commission_rate as commission_amount,
        CASE 
          WHEN rm.contract_type = 'PER_STUDY' THEN rm.per_study_rate
          ELSE 0
        END as radiologist_earning,
        st.created_at
      FROM studies st
      LEFT JOIN patients p ON st.patient_id = p.id
      LEFT JOIN study_master sm ON st.study_code = sm.study_code
      LEFT JOIN referring_physician_master rpm ON st.referring_physician_code = rpm.physician_code
      LEFT JOIN radiologist_master rm ON st.radiologist_code = rm.radiologist_code
      WHERE ${whereClause}
        AND st.status = 'completed'
      ORDER BY st.appointment_date DESC
    `;

    const result = await pool.query(query, queryParams);
    
    // Calculate totals
    const totals = result.rows.reduce((acc, row) => ({
      total_studies: acc.total_studies + 1,
      total_revenue: acc.total_revenue + parseFloat(row.gross_amount || 0),
      total_commission: acc.total_commission + parseFloat(row.commission_amount || 0),
      total_radiologist_cost: acc.total_radiologist_cost + parseFloat(row.radiologist_earning || 0),
      net_profit: acc.net_profit + (parseFloat(row.gross_amount || 0) - parseFloat(row.commission_amount || 0) - parseFloat(row.radiologist_earning || 0))
    }), {
      total_studies: 0,
      total_revenue: 0,
      total_commission: 0,
      total_radiologist_cost: 0,
      net_profit: 0
    });

    res.json({
      success: true,
      reconciliation_data: result.rows,
      summary: totals,
      filters: {
        center_id,
        start_date,
        end_date,
        modality
      }
    });

  } catch (error) {
    logger.error('Financial reconciliation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
