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
    new winston.transports.File({ filename: 'logs/insurance.log' })
  ]
});

// INSURANCE MANAGEMENT (Optimized for Low Volume)

// Get all insurance providers
router.get('/providers', async (req, res) => {
  try {
    const { active_only = 'true', center_id } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND ip.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND ip.active = true';
    }

    const query = `
      SELECT 
        ip.*,
        COUNT(p.id) as patient_count,
        COUNT(CASE WHEN p.payment_type = 'insurance' THEN 1 END) as insurance_patient_count,
        COUNT(CASE WHEN p.payment_type = 'insurance' AND p.status = 'completed' THEN 1 END) as completed_insurance_count,
        COALESCE(SUM(CASE WHEN p.payment_type = 'insurance' AND p.status = 'completed' THEN pb.total_amount ELSE 0 END), 0) as total_insurance_revenue
      FROM insurance_providers ip
      LEFT JOIN patients p ON ip.id = p.insurance_provider_id AND p.active = true
      LEFT JOIN patient_bills pb ON p.id = pb.patient_id AND pb.payment_status = 'PAID' AND pb.active = true
      WHERE ${whereClause}
      GROUP BY ip.id
      ORDER BY ip.name
    `;

    const result = await pool.query(query, queryParams);
    
    res.json({
      success: true,
      insurance_providers: result.rows,
      filters: {
        active_only,
        center_id
      }
    });

  } catch (error) {
    logger.error('Get insurance providers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create insurance provider
router.post('/providers', [
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('code').trim().isLength({ min: 2, max: 20 }),
  body('contact_person').trim().isLength({ min: 3, max: 100 }),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('address').trim().isLength({ min: 10, max: 500 }),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 }),
  body('postal_code').trim().isLength({ min: 6, max: 6 }),
  body('gst_number').trim().isLength({ min: 15, max: 15 }),
  body('pan_number').trim().isLength({ min: 10, max: 10 }),
  body('license_number').trim().isLength({ min: 5, max: 50 }),
  body('settlement_days').isInt({ min: 7, max: 90 }),
  body('coverage_types').isArray(),
  body('center_id').isInt(),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      code,
      contact_person,
      phone,
      email,
      address,
      city,
      state,
      postal_code,
      gst_number,
      pan_number,
      license_number,
      settlement_days,
      coverage_types,
      center_id,
      notes
    } = req.body;

    // Check if provider code already exists
    const existingProvider = await pool.query(
      'SELECT id FROM insurance_providers WHERE code = $1 AND active = true',
      [code]
    );

    if (existingProvider.rows.length > 0) {
      return res.status(400).json({ error: 'Insurance provider code already exists' });
    }

    const query = `
      INSERT INTO insurance_providers (
        name, code, contact_person, phone, email, address, city, state,
        postal_code, gst_number, pan_number, license_number, settlement_days,
        coverage_types, center_id, notes, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      name, code, contact_person, phone, email, address, city, state,
      postal_code, gst_number, pan_number, license_number, settlement_days,
      coverage_types, center_id, notes
    ]);

    logger.info(`Insurance provider created: ${name} (${code})`);

    res.status(201).json({
      message: 'Insurance provider created successfully',
      insurance_provider: {
        name,
        code,
        contact_person,
        phone,
        email,
        address,
        city,
        state,
        postal_code,
        gst_number,
        pan_number,
        license_number,
        settlement_days,
        coverage_types,
        center_id,
        notes
      }
    });

  } catch (error) {
    logger.error('Create insurance provider error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get insurance claims
router.get('/claims', async (req, res) => {
  try {
    const { center_id, status, provider_id, start_date, end_date, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    if (center_id) {
      whereClause += ' AND ic.center_id = $1';
      queryParams.push(center_id);
    }

    if (status) {
      whereClause += ' AND ic.status = $' + (queryParams.length + 1);
      queryParams.push(status);
    }

    if (provider_id) {
      whereClause += ' AND ic.insurance_provider_id = $' + (queryParams.length + 1);
      queryParams.push(provider_id);
    }

    if (start_date && end_date) {
      whereClause += ' AND ic.claim_date >= $' + (queryParams.length + 1) + ' AND ic.claim_date <= $' + (queryParams.length + 2);
      queryParams.push(start_date, end_date);
    }

    const query = `
      SELECT 
        ic.*,
        p.name as patient_name,
        p.phone as patient_phone,
        ip.name as insurance_provider_name,
        ip.code as insurance_provider_code,
        c.name as center_name,
        pb.invoice_number,
        pb.total_amount as bill_amount,
        pb.payment_status as bill_payment_status
      FROM insurance_claims ic
      LEFT JOIN patients p ON ic.patient_id = p.id
      LEFT JOIN insurance_providers ip ON ic.insurance_provider_id = ip.id
      LEFT JOIN centers c ON ic.center_id = c.id
      LEFT JOIN patient_bills pb ON ic.bill_id = pb.id
      WHERE ${whereClause} AND ic.active = true
      ORDER BY ic.claim_date DESC, ic.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const result = await pool.query(query, [...queryParams, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM insurance_claims ic 
      WHERE ${whereClause} AND ic.active = true
    `;
    const countResult = await pool.query(countQuery, queryParams);

    const claims = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      claims,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        center_id,
        status,
        provider_id,
        start_date,
        end_date
      }
    });

  } catch (error) {
    logger.error('Get insurance claims error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create insurance claim
router.post('/claims', [
  body('patient_id').trim().isLength({ min: 1, max: 50 }),
  body('insurance_provider_id').isInt(),
  body('center_id').isInt(),
  body('bill_id').isInt(),
  body('policy_number').trim().isLength({ min: 5, max: 50 }),
  body('claim_number').trim().isLength({ min: 5, max: 50 }),
  body('claim_amount').isDecimal({ min: 0 }),
  body('claim_date').isISO8601().toDate(),
  body('diagnosis_code').trim().isLength({ min: 3, max: 10 }),
  body('procedure_codes').isArray(),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      patient_id,
      insurance_provider_id,
      center_id,
      bill_id,
      policy_number,
      claim_number,
      claim_amount,
      claim_date,
      diagnosis_code,
      procedure_codes,
      notes
    } = req.body;

    // Check if patient exists
    const patientQuery = await pool.query(
      'SELECT * FROM patients WHERE id = $1 AND active = true',
      [patient_id]
    );

    if (patientQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Check if insurance provider exists
    const providerQuery = await pool.query(
      'SELECT * FROM insurance_providers WHERE id = $1 AND active = true',
      [insurance_provider_id]
    );

    if (providerQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Insurance provider not found' });
    }

    // Check if bill exists
    const billQuery = await pool.query(
      'SELECT * FROM patient_bills WHERE id = $1 AND active = true',
      [bill_id]
    );

    if (billQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Generate claim ID
    const claimId = 'CLM' + Date.now().toString(36).substr(2, 9).toUpperCase();

    const query = `
      INSERT INTO insurance_claims (
        claim_id, patient_id, insurance_provider_id, center_id, bill_id,
        policy_number, claim_number, claim_amount, claim_date, diagnosis_code,
        procedure_codes, status, notes, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING', $12,
        NOW(), NOW(), true
      ) RETURNING id
    `;

    const result = await pool.query(query, [
      claimId, patient_id, insurance_provider_id, center_id, bill_id,
      policy_number, claim_number, claim_amount, claim_date, diagnosis_code,
      procedure_codes, notes
    ]);

    logger.info(`Insurance claim created: ${claimId} for patient ${patient_id}`);

    res.status(201).json({
      message: 'Insurance claim created successfully',
      claim: {
        id: result.rows[0].id,
        claim_id,
        patient_id,
        insurance_provider_id,
        center_id,
        bill_id,
        policy_number,
        claim_number,
        claim_amount,
        claim_date,
        diagnosis_code,
        procedure_codes,
        status: 'PENDING',
        notes
      }
    });

  } catch (error) {
    logger.error('Create insurance claim error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update insurance claim status
router.put('/claims/:id', [
  body('status').isIn(['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PARTIALLY_APPROVED', 'SETTLED']),
  body('approved_amount').optional().isDecimal({ min: 0 }),
  body('settlement_date').optional().isISO8601().toDate(),
  body('rejection_reason').optional().trim().isLength({ min: 5, max: 500 }),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status, approved_amount, settlement_date, rejection_reason, notes } = req.body;

    // Check if claim exists
    const existingClaim = await pool.query(
      'SELECT * FROM insurance_claims WHERE id = $1 AND active = true',
      [id]
    );

    if (existingClaim.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const updateQuery = `
      UPDATE insurance_claims SET 
        status = $1, approved_amount = $2, settlement_date = $3, 
        rejection_reason = $4, notes = $5, updated_at = NOW()
      WHERE id = $6 AND active = true
    `;

    await pool.query(updateQuery, [status, approved_amount, settlement_date, rejection_reason, notes, id]);

    logger.info(`Insurance claim updated: ${id} - Status: ${status}`);

    res.json({
      message: 'Insurance claim updated successfully',
      claim: {
        id,
        status,
        approved_amount,
        settlement_date,
        rejection_reason,
        notes
      }
    });

  } catch (error) {
    logger.error('Update insurance claim error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get insurance settlements
router.get('/settlements', async (req, res) => {
  try {
    const { center_id, provider_id, start_date, end_date, status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    if (center_id) {
      whereClause += ' AND is.center_id = $1';
      queryParams.push(center_id);
    }

    if (provider_id) {
      whereClause += ' AND is.insurance_provider_id = $' + (queryParams.length + 1);
      queryParams.push(provider_id);
    }

    if (status) {
      whereClause += ' AND is.status = $' + (queryParams.length + 1);
      queryParams.push(status);
    }

    if (start_date && end_date) {
      whereClause += ' AND is.settlement_date >= $' + (queryParams.length + 1) + ' AND is.settlement_date <= $' + (queryParams.length + 2);
      queryParams.push(start_date, end_date);
    }

    const query = `
      SELECT 
        is.*,
        ip.name as insurance_provider_name,
        ip.code as insurance_provider_code,
        c.name as center_name,
        COUNT(ic.id) as claim_count,
        COALESCE(SUM(ic.approved_amount), 0) as total_claim_amount,
        COALESCE(SUM(is.settlement_amount), 0) as total_settlement_amount
      FROM insurance_settlements is
      LEFT JOIN insurance_providers ip ON is.insurance_provider_id = ip.id
      LEFT JOIN centers c ON is.center_id = c.id
      LEFT JOIN insurance_claims ic ON is.id = ic.settlement_id AND ic.active = true
      WHERE ${whereClause} AND is.active = true
      GROUP BY is.id, ip.name, ip.code, c.name
      ORDER BY is.settlement_date DESC, is.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const result = await pool.query(query, [...queryParams, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM insurance_settlements is 
      WHERE ${whereClause} AND is.active = true
    `;
    const countResult = await pool.query(countQuery, queryParams);

    const settlements = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      settlements,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        center_id,
        provider_id,
        start_date,
        end_date,
        status
      }
    });

  } catch (error) {
    logger.error('Get insurance settlements error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create insurance settlement
router.post('/settlements', [
  body('insurance_provider_id').isInt(),
  body('center_id').isInt(),
  body('settlement_number').trim().isLength({ min: 5, max: 50 }),
  body('settlement_date').isISO8601().toDate(),
  body('claim_ids').isArray(),
  body('total_claim_amount').isDecimal({ min: 0 }),
  body('total_settlement_amount').isDecimal({ min: 0 }),
  body('payment_mode').isIn(['BANK_TRANSFER', 'CHEQUE', 'CASH']),
  body('bank_account_id').isInt(),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      insurance_provider_id,
      center_id,
      settlement_number,
      settlement_date,
      claim_ids,
      total_claim_amount,
      total_settlement_amount,
      payment_mode,
      bank_account_id,
      notes
    } = req.body;

    // Generate settlement ID
    const settlementId = 'SET' + Date.now().toString(36).substr(2, 9).toUpperCase();

    const query = `
      INSERT INTO insurance_settlements (
        settlement_id, insurance_provider_id, center_id, settlement_number,
        settlement_date, claim_ids, total_claim_amount, total_settlement_amount,
        payment_mode, bank_account_id, status, notes, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'COMPLETED', $11,
        NOW(), NOW(), true
      ) RETURNING id
    `;

    const result = await pool.query(query, [
      settlementId, insurance_provider_id, center_id, settlement_number,
      settlement_date, claim_ids, total_claim_amount, total_settlement_amount,
      payment_mode, bank_account_id, notes
    ]);

    // Update claim status to SETTLED
    await pool.query(
      `UPDATE insurance_claims SET status = 'SETTLED', settlement_id = $1, updated_at = NOW()
       WHERE id = ANY($2) AND active = true`,
      [result.rows[0].id, claim_ids]
    );

    logger.info(`Insurance settlement created: ${settlementId} for provider ${insurance_provider_id}`);

    res.status(201).json({
      message: 'Insurance settlement created successfully',
      settlement: {
        id: result.rows[0].id,
        settlement_id,
        insurance_provider_id,
        center_id,
        settlement_number,
        settlement_date,
        claim_ids,
        total_claim_amount,
        total_settlement_amount,
        payment_mode,
        bank_account_id,
        status: 'COMPLETED',
        notes
      }
    });

  } catch (error) {
    logger.error('Create insurance settlement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get insurance dashboard (optimized for low volume)
router.get('/dashboard', async (req, res) => {
  try {
    const { center_id, start_date, end_date } = req.query;
    
    let centerFilter = center_id ? `AND center_id = ${center_id}` : '';
    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = `AND created_at >= '${start_date}' AND created_at <= '${end_date}'`;
    }

    // Insurance summary (low volume focus)
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_claims,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as approved_claims,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_claims,
        COUNT(CASE WHEN status = 'SETTLED' THEN 1 END) as settled_claims,
        COALESCE(SUM(claim_amount), 0) as total_claim_amount,
        COALESCE(SUM(approved_amount), 0) as total_approved_amount,
        COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN approved_amount ELSE 0 END), 0) as total_settled_amount,
        COUNT(DISTINCT insurance_provider_id) as active_providers
      FROM insurance_claims 
      WHERE active = true ${centerFilter} ${dateFilter}
    `;

    // Provider breakdown
    const providerQuery = `
      SELECT 
        ip.name as provider_name,
        ip.code as provider_code,
        COUNT(ic.id) as claim_count,
        COUNT(CASE WHEN ic.status = 'APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN ic.status = 'REJECTED' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN ic.status = 'SETTLED' THEN 1 END) as settled_count,
        COALESCE(SUM(ic.claim_amount), 0) as total_claim_amount,
        COALESCE(SUM(ic.approved_amount), 0) as total_approved_amount,
        COALESCE(SUM(CASE WHEN ic.status = 'SETTLED' THEN ic.approved_amount ELSE 0 END), 0) as total_settled_amount
      FROM insurance_providers ip
      LEFT JOIN insurance_claims ic ON ip.id = ic.insurance_provider_id AND ic.active = true
      WHERE ip.active = true ${centerFilter}
      GROUP BY ip.id, ip.name, ip.code
      ORDER BY total_claim_amount DESC
      LIMIT 10
    `;

    // Recent claims
    const recentClaimsQuery = `
      SELECT 
        ic.claim_id,
        ic.claim_number,
        ic.claim_amount,
        ic.status,
        ic.claim_date,
        p.name as patient_name,
        ip.name as provider_name
      FROM insurance_claims ic
      LEFT JOIN patients p ON ic.patient_id = p.id
      LEFT JOIN insurance_providers ip ON ic.insurance_provider_id = ip.id
      WHERE ic.active = true ${centerFilter}
      ORDER BY ic.created_at DESC
      LIMIT 5
    `;

    // Settlement summary
    const settlementQuery = `
      SELECT 
        COUNT(*) as total_settlements,
        COALESCE(SUM(total_claim_amount), 0) as total_claimed,
        COALESCE(SUM(total_settlement_amount), 0) as total_settled,
        COALESCE(SUM(total_settlement_amount) / NULLIF(SUM(total_claim_amount), 0), 0) * 100, 0) as settlement_percentage,
        COUNT(CASE WHEN payment_mode = 'BANK_TRANSFER' THEN 1 END) as bank_transfers,
        COUNT(CASE WHEN payment_mode = 'CHEQUE' THEN 1 END) as cheques,
        COUNT(CASE WHEN payment_mode = 'CASH' THEN 1 END) as cash_payments
      FROM insurance_settlements 
      WHERE active = true AND status = 'COMPLETED' ${centerFilter} ${dateFilter}
    `;

    const [summaryResult, providerResult, recentClaimsResult, settlementResult] = await Promise.all([
      pool.query(summaryQuery),
      pool.query(providerQuery),
      pool.query(recentClaimsQuery),
      pool.query(settlementQuery)
    ]);

    res.json({
      success: true,
      summary: summaryResult.rows[0],
      providers: providerResult.rows,
      recent_claims: recentClaimsResult.rows,
      settlements: settlementResult.rows[0],
      filters: {
        center_id,
        start_date,
        end_date
      }
    });

  } catch (error) {
    logger.error('Get insurance dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get insurance statistics (low volume focused)
router.get('/statistics', async (req, res) => {
  try {
    const { center_id, period = '30' } = req.query;
    
    let centerFilter = center_id ? `AND center_id = ${center_id}` : '';
    let dateFilter = '';
    
    if (period === '7') {
      dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (period === '30') {
      dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'30 days\'';
    } else if (period === '90') {
      dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'90 days\'';
    } else if (period === '365') {
      dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'365 days\'';
    }

    // Claim statistics
    const claimStatsQuery = `
      SELECT 
        COUNT(*) as total_claims,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_claims,
        COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END) as submitted_claims,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as approved_claims,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_claims,
        COUNT(CASE WHEN status = 'PARTIALLY_APPROVED' THEN 1 END) as partially_approved_claims,
        COUNT(CASE WHEN status = 'SETTLED' THEN 1 END) as settled_claims,
        COALESCE(AVG(claim_amount), 0) as avg_claim_amount,
        COALESCE(SUM(claim_amount), 0) as total_claim_amount,
        COALESCE(SUM(approved_amount), 0) as total_approved_amount,
        COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN approved_amount ELSE 0 END), 0) as total_settled_amount
      FROM insurance_claims 
      WHERE active = true ${centerFilter} ${dateFilter}
    `;

    // Provider performance
    const providerPerformanceQuery = `
      SELECT 
        ip.name as provider_name,
        ip.code as provider_code,
        COUNT(ic.id) as claim_count,
        COUNT(CASE WHEN ic.status = 'APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN ic.status = 'REJECTED' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN ic.status = 'SETTLED' THEN 1 END) as settled_count,
        COALESCE(SUM(ic.claim_amount), 0) as total_claim_amount,
        COALESCE(SUM(ic.approved_amount), 0) as total_approved_amount,
        COALESCE(SUM(CASE WHEN ic.status = 'SETTLED' THEN ic.approved_amount ELSE 0 END), 0) as total_settled_amount,
        CASE 
          WHEN COUNT(ic.id) > 0 THEN 
            ROUND((COUNT(CASE WHEN ic.status = 'APPROVED' THEN 1 END) * 100.0 / COUNT(ic.id)), 2)
          ELSE 0 
        END as approval_rate
      FROM insurance_providers ip
      LEFT JOIN insurance_claims ic ON ip.id = ic.insurance_provider_id AND ic.active = true
      WHERE ip.active = true ${centerFilter} ${dateFilter}
      GROUP BY ip.id, ip.name, ip.code
      HAVING COUNT(ic.id) > 0
      ORDER BY total_claim_amount DESC
    `;

    // Monthly trends (for low volume, show last 12 months)
    const trendsQuery = `
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as claim_count,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN status = 'SETTLED' THEN 1 END) as settled_count,
        COALESCE(SUM(claim_amount), 0) as total_claim_amount,
        COALESCE(SUM(approved_amount), 0) as total_approved_amount,
        COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN approved_amount ELSE 0 END), 0) as total_settled_amount
      FROM insurance_claims 
      WHERE active = true AND created_at >= CURRENT_DATE - INTERVAL '12 months' ${centerFilter}
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `;

    const [claimStatsResult, providerPerformanceResult, trendsResult] = await Promise.all([
      pool.query(claimStatsQuery),
      pool.query(providerPerformanceQuery),
      pool.query(trendsQuery)
    ]);

    res.json({
      success: true,
      claim_statistics: claimStatsResult.rows[0],
      provider_performance: providerPerformanceResult.rows,
      monthly_trends: trendsResult.rows,
      filters: {
        center_id,
        period
      }
    });

  } catch (error) {
    logger.error('Get insurance statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
