const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/radiology-reporting.log' })
  ]
});

// UNIFIED RADIOLOGIST MASTER (includes both individual radiologists and teleradiology companies)

// Get all radiologists (individual and companies)
router.get('/radiologists', async (req, res) => {
  try {
    const { center_id, type, active_only = 'true' } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND rm.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (type) {
      whereClause += ' AND rm.type = $' + (queryParams.length + 1);
      queryParams.push(type);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND rm.active = true';
    }

    const query = `
      SELECT 
        rm.*,
        c.name as center_name,
        COUNT(st.id) as total_studies_reported,
        COUNT(CASE WHEN st.report_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as studies_30d,
        COUNT(CASE WHEN st.report_date >= CURRENT_DATE - INTERVAL '90 days' THEN 1 END) as studies_90d,
        COUNT(CASE WHEN st.report_date >= CURRENT_DATE - INTERVAL '365 days' THEN 1 END) as studies_1yr,
        COALESCE(SUM(st.reporting_rate), 0) as total_earnings,
        STRING_AGG(DISTINCT sm.modality, ', ') as modalities_reported
      FROM radiologist_master rm
      LEFT JOIN centers c ON rm.center_id = c.id
      LEFT JOIN studies st ON rm.radiologist_code = st.radiologist_code AND st.status = 'completed' AND st.active = true
      LEFT JOIN study_master sm ON st.study_code = sm.study_code
      WHERE ${whereClause}
      GROUP BY rm.id, c.name
      ORDER BY rm.type, rm.name
    `;

    const result = await pool.query(query, queryParams);
    
    res.json({
      success: true,
      radiologists: result.rows,
      filters: {
        center_id,
        type,
        active_only
      }
    });

  } catch (error) {
    logger.error('Get radiologists error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create radiologist (individual or company)
router.post('/radiologists', [
  body('radiologist_code').trim().isLength({ min: 2, max: 20 }),
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('type').isIn(['INDIVIDUAL', 'TELERADIOLOGY_COMPANY']),
  body('specialty').trim().isLength({ min: 2, max: 50 }),
  body('qualification').trim().isLength({ min: 5, max: 100 }),
  body('license_number').optional().trim().isLength({ min: 5, max: 50 }),
  body('center_id').isInt(),
  body('contact_phone').trim().isLength({ min: 10, max: 20 }),
  body('contact_email').trim().isEmail().normalizeEmail(),
  body('address').trim().isLength({ min: 10, max: 500 }),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 }),
  body('postal_code').trim().isLength({ min: 6, max: 6 }),
  body('reporting_rates').isArray(),
  body('bank_account_number').trim().isLength({ min: 10, max: 50 }),
  body('bank_name').trim().isLength({ min: 3, max: 100 }),
  body('ifsc_code').trim().isLength({ min: 11, max: 11 }),
  body('gst_number').optional().trim().isLength({ min: 15, max: 15 }),
  body('pan_number').optional().trim().isLength({ min: 10, max: 10 }),
  body('contact_person').optional().trim().isLength({ min: 3, max: 100 }),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      radiologist_code,
      name,
      type,
      specialty,
      qualification,
      license_number,
      center_id,
      contact_phone,
      contact_email,
      address,
      city,
      state,
      postal_code,
      reporting_rates,
      bank_account_number,
      bank_name,
      ifsc_code,
      gst_number,
      pan_number,
      contact_person,
      notes
    } = req.body;

    // Validate reporting rates
    if (!reporting_rates || reporting_rates.length === 0) {
      return res.status(400).json({ error: 'At least one reporting rate is required' });
    }

    // Check if radiologist code already exists
    const existingRadiologist = await pool.query(
      'SELECT id FROM radiologist_master WHERE radiologist_code = $1 AND active = true',
      [radiologist_code]
    );

    if (existingRadiologist.rows.length > 0) {
      return res.status(400).json({ error: 'Radiologist code already exists' });
    }

    const query = `
      INSERT INTO radiologist_master (
        radiologist_code, name, type, specialty, qualification, license_number,
        center_id, contact_phone, contact_email, address, city, state, postal_code,
        reporting_rates, bank_account_number, bank_name, ifsc_code, gst_number,
        pan_number, contact_person, notes, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      radiologist_code, name, type, specialty, qualification, license_number,
      center_id, contact_phone, contact_email, address, city, state, postal_code,
      JSON.stringify(reporting_rates), bank_account_number, bank_name, ifsc_code, gst_number,
      pan_number, contact_person, notes
    ]);

    logger.info(`Radiologist created: ${name} (${radiologist_code}) - Type: ${type}`);

    res.status(201).json({
      message: 'Radiologist created successfully',
      radiologist: {
        radiologist_code,
        name,
        type,
        specialty,
        qualification,
        license_number,
        center_id,
        contact_phone,
        contact_email,
        address,
        city,
        state,
        postal_code,
        reporting_rates,
        bank_account_number,
        bank_name,
        ifsc_code,
        gst_number,
        pan_number,
        contact_person,
        notes
      }
    });

  } catch (error) {
    logger.error('Create radiologist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update radiologist
router.put('/radiologists/:id', [
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('type').isIn(['INDIVIDUAL', 'TELERADIOLOGY_COMPANY']),
  body('specialty').trim().isLength({ min: 2, max: 50 }),
  body('qualification').trim().isLength({ min: 5, max: 100 }),
  body('license_number').optional().trim().isLength({ min: 5, max: 50 }),
  body('center_id').isInt(),
  body('contact_phone').trim().isLength({ min: 10, max: 20 }),
  body('contact_email').trim().isEmail().normalizeEmail(),
  body('address').trim().isLength({ min: 10, max: 500 }),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 }),
  body('postal_code').trim().isLength({ min: 6, max: 6 }),
  body('reporting_rates').isArray(),
  body('bank_account_number').trim().isLength({ min: 10, max: 50 }),
  body('bank_name').trim().isLength({ min: 3, max: 100 }),
  body('ifsc_code').trim().isLength({ min: 11, max: 11 }),
  body('gst_number').optional().trim().isLength({ min: 15, max: 15 }),
  body('pan_number').optional().trim().isLength({ min: 10, max: 10 }),
  body('contact_person').optional().trim().isLength({ min: 3, max: 100 }),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      name,
      type,
      specialty,
      qualification,
      license_number,
      center_id,
      contact_phone,
      contact_email,
      address,
      city,
      state,
      postal_code,
      reporting_rates,
      bank_account_number,
      bank_name,
      ifsc_code,
      gst_number,
      pan_number,
      contact_person,
      notes
    } = req.body;

    // Check if radiologist exists
    const existingRadiologist = await pool.query(
      'SELECT id FROM radiologist_master WHERE id = $1 AND active = true',
      [id]
    );

    if (existingRadiologist.rows.length === 0) {
      return res.status(404).json({ error: 'Radiologist not found' });
    }

    // Validate reporting rates
    if (!reporting_rates || reporting_rates.length === 0) {
      return res.status(400).json({ error: 'At least one reporting rate is required' });
    }

    // Update radiologist
    await pool.query(
      `UPDATE radiologist_master SET 
        name = $1, type = $2, specialty = $3, qualification = $4, license_number = $5,
        center_id = $6, contact_phone = $7, contact_email = $8, address = $9, city = $10,
        state = $11, postal_code = $12, reporting_rates = $13, bank_account_number = $14,
        bank_name = $15, ifsc_code = $16, gst_number = $17, pan_number = $18,
        contact_person = $19, notes = $20, updated_at = NOW()
      WHERE id = $21 AND active = true`,
      [
        name, type, specialty, qualification, license_number, center_id, contact_phone,
        contact_email, address, city, state, postal_code, JSON.stringify(reporting_rates),
        bank_account_number, bank_name, ifsc_code, gst_number, pan_number,
        contact_person, notes, id
      ]
    );

    logger.info(`Radiologist updated: ${name} (ID: ${id}) - Type: ${type}`);

    res.json({
      message: 'Radiologist updated successfully',
      radiologist: {
        id,
        name,
        type,
        specialty,
        qualification,
        license_number,
        center_id,
        contact_phone,
        contact_email,
        address,
        city,
        state,
        postal_code,
        reporting_rates,
        bank_account_number,
        bank_name,
        ifsc_code,
        gst_number,
        pan_number,
        contact_person,
        notes
      }
    });

  } catch (error) {
    logger.error('Update radiologist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete radiologist (soft delete)
router.delete('/radiologists/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if radiologist exists
    const existingRadiologist = await pool.query(
      'SELECT id FROM radiologist_master WHERE id = $1 AND active = true',
      [id]
    );

    if (existingRadiologist.rows.length === 0) {
      return res.status(404).json({ error: 'Radiologist not found' });
    }

    // Check if radiologist has reported studies
    const studiesWithRadiologist = await pool.query(
      'SELECT COUNT(*) as count FROM studies WHERE radiologist_code = (SELECT radiologist_code FROM radiologist_master WHERE id = $1) AND active = true',
      [id]
    );

    if (parseInt(studiesWithRadiologist.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete radiologist with reported studies' });
    }

    // Soft delete radiologist
    await pool.query(
      'UPDATE radiologist_master SET active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    logger.info(`Radiologist deleted: ${id}`);

    res.json({
      message: 'Radiologist deleted successfully'
    });

  } catch (error) {
    logger.error('Delete radiologist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get radiologist rates for dropdown
router.get('/radiologists/rates', async (req, res) => {
  try {
    const { center_id, modality, study_code } = req.query;
    
    let whereClause = 'rm.active = true';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND rm.center_id = $1';
      queryParams.push(center_id);
    }

    const query = `
      SELECT 
        rm.radiologist_code,
        rm.name,
        rm.type,
        rm.specialty,
        jsonb_array_elements(rm.reporting_rates) as rate_data
      FROM radiologist_master rm
      WHERE ${whereClause}
      ORDER BY rm.name
    `;

    const result = await pool.query(query, queryParams);
    
    // Process rates and filter by modality if specified
    let rates = [];
    for (const row of result.rows) {
      const rateData = row.rate_data;
      
      // If modality is specified, filter rates
      if (modality && rateData.modality !== modality) {
        continue;
      }
      
      // If study_code is specified, filter rates
      if (study_code && rateData.study_code && rateData.study_code !== study_code) {
        continue;
      }
      
      rates.push({
        radiologist_code: row.radiologist_code,
        name: row.name,
        type: row.type,
        specialty: row.specialty,
        modality: rateData.modality,
        study_code: rateData.study_code || null,
        reporting_rate: rateData.rate,
        currency: rateData.currency || 'INR'
      });
    }

    res.json({
      success: true,
      rates,
      filters: {
        center_id,
        modality,
        study_code
      }
    });

  } catch (error) {
    logger.error('Get radiologist rates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Record study reporting
router.post('/studies/report', [
  body('study_id').trim().isLength({ min: 1, max: 50 }),
  body('radiologist_code').trim().isLength({ min: 2, max: 20 }),
  body('report_date').isISO8601().toDate(),
  body('reporting_rate').isDecimal({ min: 0 }),
  body('report_status').isIn(['COMPLETED', 'PARTIAL', 'REVIEW']),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      study_id,
      radiologist_code,
      report_date,
      reporting_rate,
      report_status,
      notes
    } = req.body;

    // Check if study exists
    const studyQuery = await pool.query(
      'SELECT * FROM studies WHERE id = $1 AND active = true',
      [study_id]
    );

    if (studyQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Study not found' });
    }

    // Check if radiologist exists
    const radiologistQuery = await pool.query(
      'SELECT * FROM radiologist_master WHERE radiologist_code = $1 AND active = true',
      [radiologist_code]
    );

    if (radiologistQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Radiologist not found' });
    }

    // Update study with reporting information
    await pool.query(
      `UPDATE studies SET 
        radiologist_code = $1, report_date = $2, reporting_rate = $3, 
        report_status = $4, notes = $5, updated_at = NOW()
      WHERE id = $6 AND active = true`,
      [radiologist_code, report_date, reporting_rate, report_status, notes, study_id]
    );

    logger.info(`Study reported: ${study_id} by ${radiologist_code} - Rate: ${reporting_rate}`);

    res.json({
      message: 'Study reported successfully',
      study_reporting: {
        study_id,
        radiologist_code,
        radiologist_name: radiologistQuery.rows[0].name,
        radiologist_type: radiologistQuery.rows[0].type,
        report_date,
        reporting_rate,
        report_status,
        notes
      }
    });

  } catch (error) {
    logger.error('Record study reporting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get study reporting information
router.get('/studies/reporting', async (req, res) => {
  try {
    const { center_id, radiologist_code, start_date, end_date, status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    if (center_id) {
      whereClause += ' AND s.center_id = $1';
      queryParams.push(center_id);
    }

    if (radiologist_code) {
      whereClause += ' AND s.radiologist_code = $' + (queryParams.length + 1);
      queryParams.push(radiologist_code);
    }

    if (status) {
      whereClause += ' AND s.report_status = $' + (queryParams.length + 1);
      queryParams.push(status);
    }

    if (start_date && end_date) {
      whereClause += ' AND s.report_date >= $' + (queryParams.length + 1) + ' AND s.report_date <= $' + (queryParams.length + 2);
      queryParams.push(start_date, end_date);
    }

    const query = `
      SELECT 
        s.id as study_id,
        s.study_code,
        s.patient_id,
        s.radiologist_code,
        s.report_date,
        s.reporting_rate,
        s.report_status,
        s.notes as study_notes,
        p.name as patient_name,
        rm.name as radiologist_name,
        rm.type as radiologist_type,
        rm.specialty,
        sm.modality,
        sm.study_name,
        c.name as center_name
      FROM studies s
      LEFT JOIN patients p ON s.patient_id = p.id
      LEFT JOIN radiologist_master rm ON s.radiologist_code = rm.radiologist_code
      LEFT JOIN study_master sm ON s.study_code = sm.study_code
      LEFT JOIN centers c ON s.center_id = c.id
      WHERE ${whereClause} AND s.active = true AND s.radiologist_code IS NOT NULL
      ORDER BY s.report_date DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const result = await pool.query(query, [...queryParams, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM studies s
      WHERE ${whereClause} AND s.active = true AND s.radiologist_code IS NOT NULL
    `;
    const countResult = await pool.query(countQuery, queryParams);

    const studyReporting = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      study_reporting: studyReporting,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        center_id,
        radiologist_code,
        start_date,
        end_date,
        status
      }
    });

  } catch (error) {
    logger.error('Get study reporting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Payment processing for radiologists
router.post('/payments', [
  body('radiologist_code').trim().isLength({ min: 2, max: 20 }),
  body('payment_date').isISO8601().toDate(),
  body('payment_mode').isIn(['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI']),
  body('amount_paid').isDecimal({ min: 0 }),
  body('study_ids').isArray(),
  body('bank_account_id').isInt(),
  body('transaction_reference').optional().trim().isLength({ min: 2, max: 100 }),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      radiologist_code,
      payment_date,
      payment_mode,
      amount_paid,
      study_ids,
      bank_account_id,
      transaction_reference,
      notes
    } = req.body;

    // Check if radiologist exists
    const radiologistQuery = await pool.query(
      'SELECT * FROM radiologist_master WHERE radiologist_code = $1 AND active = true',
      [radiologist_code]
    );

    if (radiologistQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Radiologist not found' });
    }

    // Generate payment ID
    const paymentId = 'RADPAY' + Date.now().toString(36).substr(2, 9).toUpperCase();

    // Create payment record
    const paymentQuery = `
      INSERT INTO radiologist_payments (
        payment_id, radiologist_code, payment_date, payment_mode, amount_paid,
        study_ids, bank_account_id, transaction_reference, notes, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), true
      ) RETURNING id
    `;

    const paymentResult = await pool.query(paymentQuery, [
      paymentId, radiologist_code, payment_date, payment_mode, amount_paid,
      JSON.stringify(study_ids), bank_account_id, transaction_reference, notes
    ]);

    // Update study payment status
    await pool.query(
      `UPDATE studies SET 
        payment_status = 'PAID', payment_date = $1, payment_id = $2, updated_at = NOW()
      WHERE id = ANY($3) AND active = true`,
      [payment_date, paymentResult.rows[0].id, study_ids]
    );

    logger.info(`Radiologist payment processed: ${radiologist_code} - Amount: ${amount_paid}`);

    res.status(201).json({
      message: 'Radiologist payment processed successfully',
      payment: {
        id: paymentResult.rows[0].id,
        payment_id,
        radiologist_code,
        radiologist_name: radiologistQuery.rows[0].name,
        payment_date,
        payment_mode,
        amount_paid,
        study_ids,
        bank_account_id,
        transaction_reference,
        notes
      }
    });

  } catch (error) {
    logger.error('Process radiologist payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get radiologist payments
router.get('/payments', async (req, res) => {
  try {
    const { radiologist_code, center_id, start_date, end_date, status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    if (radiologist_code) {
      whereClause += ' AND rp.radiologist_code = $1';
      queryParams.push(radiologist_code);
    }

    if (center_id) {
      whereClause += ' AND rm.center_id = $' + (queryParams.length + 1);
      queryParams.push(center_id);
    }

    if (status) {
      whereClause += ' AND rp.status = $' + (queryParams.length + 1);
      queryParams.push(status);
    }

    if (start_date && end_date) {
      whereClause += ' AND rp.payment_date >= $' + (queryParams.length + 1) + ' AND rp.payment_date <= $' + (queryParams.length + 2);
      queryParams.push(start_date, end_date);
    }

    const query = `
      SELECT 
        rp.*,
        rm.name as radiologist_name,
        rm.type as radiologist_type,
        rm.specialty,
        c.name as center_name,
        COUNT(s.id) as study_count,
        COALESCE(SUM(s.reporting_rate), 0) as total_reporting_amount
      FROM radiologist_payments rp
      LEFT JOIN radiologist_master rm ON rp.radiologist_code = rm.radiologist_code
      LEFT JOIN centers c ON rm.center_id = c.id
      LEFT JOIN studies s ON s.id = ANY(rp.study_ids) AND s.active = true
      WHERE ${whereClause} AND rp.active = true
      GROUP BY rp.id, rm.name, rm.type, rm.specialty, c.name
      ORDER BY rp.payment_date DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const result = await pool.query(query, [...queryParams, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM radiologist_payments rp
      LEFT JOIN radiologist_master rm ON rp.radiologist_code = rm.radiologist_code
      WHERE ${whereClause} AND rp.active = true
    `;
    const countResult = await pool.query(countQuery, queryParams);

    const payments = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        radiologist_code,
        center_id,
        start_date,
        end_date,
        status
      }
    });

  } catch (error) {
    logger.error('Get radiologist payments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get radiologist dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const { center_id, radiologist_code, period = '30' } = req.query;
    
    let centerFilter = center_id ? `AND rm.center_id = ${center_id}` : '';
    let radiologistFilter = radiologist_code ? `AND rm.radiologist_code = '${radiologist_code}'` : '';
    let dateFilter = '';
    
    if (period === '7') {
      dateFilter = 'AND s.report_date >= CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (period === '30') {
      dateFilter = 'AND s.report_date >= CURRENT_DATE - INTERVAL \'30 days\'';
    } else if (period === '90') {
      dateFilter = 'AND s.report_date >= CURRENT_DATE - INTERVAL \'90 days\'';
    } else if (period === '365') {
      dateFilter = 'AND s.report_date >= CURRENT_DATE - INTERVAL \'365 days\'';
    }

    // Radiologist summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_radiologists,
        COUNT(CASE WHEN rm.type = 'INDIVIDUAL' THEN 1 END) as individual_radiologists,
        COUNT(CASE WHEN rm.type = 'TELERADIOLOGY_COMPANY' THEN 1 END) as teleradiology_companies,
        COUNT(s.id) as total_studies_reported,
        COUNT(CASE WHEN s.report_status = 'COMPLETED' THEN 1 END) as completed_reports,
        COUNT(CASE WHEN s.report_status = 'PARTIAL' THEN 1 END) as partial_reports,
        COUNT(CASE WHEN s.report_status = 'REVIEW' THEN 1 END) as review_reports,
        COALESCE(SUM(s.reporting_rate), 0) as total_reporting_amount,
        COALESCE(SUM(CASE WHEN s.payment_status = 'PAID' THEN s.reporting_rate ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN s.payment_status = 'PENDING' THEN s.reporting_rate ELSE 0 END), 0) as pending_amount
      FROM radiologist_master rm
      LEFT JOIN studies s ON rm.radiologist_code = s.radiologist_code AND s.active = true
      WHERE rm.active = true ${centerFilter} ${radiologistFilter} ${dateFilter}
    `;

    // Top performing radiologists
    const topRadiologistsQuery = `
      SELECT 
        rm.radiologist_code,
        rm.name,
        rm.type,
        rm.specialty,
        COUNT(s.id) as studies_reported,
        COALESCE(SUM(s.reporting_rate), 0) as total_earnings,
        COALESCE(SUM(CASE WHEN s.payment_status = 'PAID' THEN s.reporting_rate ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN s.payment_status = 'PENDING' THEN s.reporting_rate ELSE 0 END), 0) as pending_amount
      FROM radiologist_master rm
      LEFT JOIN studies s ON rm.radiologist_code = s.radiologist_code AND s.active = true
      WHERE rm.active = true ${centerFilter} ${dateFilter}
      GROUP BY rm.radiologist_code, rm.name, rm.type, rm.specialty
      HAVING COUNT(s.id) > 0
      ORDER BY total_earnings DESC
      LIMIT 10
    `;

    // Modality breakdown
    const modalityQuery = `
      SELECT 
        sm.modality,
        COUNT(s.id) as studies_reported,
        COUNT(DISTINCT s.radiologist_code) as radiologists_count,
        COALESCE(SUM(s.reporting_rate), 0) as total_earnings
      FROM studies s
      LEFT JOIN study_master sm ON s.study_code = sm.study_code
      WHERE s.active = true AND s.radiologist_code IS NOT NULL ${centerFilter} ${dateFilter}
      GROUP BY sm.modality
      ORDER BY total_earnings DESC
    `;

    const [summaryResult, topRadiologistsResult, modalityResult] = await Promise.all([
      pool.query(summaryQuery),
      pool.query(topRadiologistsQuery),
      pool.query(modalityQuery)
    ]);

    res.json({
      success: true,
      summary: summaryResult.rows[0],
      top_radiologists: topRadiologistsResult.rows,
      modality_breakdown: modalityResult.rows,
      filters: {
        center_id,
        radiologist_code,
        period
      }
    });

  } catch (error) {
    logger.error('Get radiologist dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
