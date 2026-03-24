const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('INSURANCE_VIEW'));

// SIMPLE INSURANCE MANAGEMENT - Just tracking if patient has insurance and provider

// Get all insurance providers (simple list)
router.get('/providers', async (req, res) => {
  try {
    const { active_only = 'true', center_id } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND center_id = $1';
      queryParams.push(center_id);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND active = true';
    }

    const query = `
      SELECT 
        id, name, code, phone, email, city, state, center_id, active
      FROM simple_insurance_providers
      WHERE ${whereClause}
      ORDER BY name
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

// Create simple insurance provider
router.post('/providers', [
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('code').trim().isLength({ min: 2, max: 20 }),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 }),
  body('center_id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      code,
      phone,
      email,
      city,
      state,
      center_id
    } = req.body;

    // Check if provider code already exists
    const existingProvider = await pool.query(
      'SELECT id FROM simple_insurance_providers WHERE code = $1 AND active = true',
      [code]
    );

    if (existingProvider.rows.length > 0) {
      return res.status(400).json({ error: 'Insurance provider code already exists' });
    }

    const query = `
      INSERT INTO simple_insurance_providers (
        name, code, phone, email, city, state, center_id, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [name, code, phone, email, city, state, center_id]);

    logger.info(`Simple insurance provider created: ${name} (${code})`);

    res.status(201).json({
      message: 'Insurance provider created successfully',
      insurance_provider: {
        name,
        code,
        phone,
        email,
        city,
        state,
        center_id
      }
    });

  } catch (error) {
    logger.error('Create insurance provider error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update patient insurance information
router.put('/patients/:patient_id/insurance', [
  body('has_insurance').isBoolean(),
  body('insurance_provider_id').optional().isInt(),
  body('policy_number').optional().trim().isLength({ min: 5, max: 50 }),
  body('insured_name').optional().trim().isLength({ min: 3, max: 100 }),
  body('relationship').optional().trim().isLength({ min: 3, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { patient_id } = req.params;
    const {
      has_insurance,
      insurance_provider_id,
      policy_number,
      insured_name,
      relationship
    } = req.body;

    // Check if patient exists
    const patientQuery = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND active = true',
      [patient_id]
    );

    if (patientQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // If has_insurance is true, provider_id is required
    if (has_insurance && !insurance_provider_id) {
      return res.status(400).json({ error: 'Insurance provider is required when patient has insurance' });
    }

    // Update patient insurance information
    const updateQuery = `
      UPDATE patients SET 
        has_insurance = $1, insurance_provider_id = $2, policy_number = $3,
        insured_name = $4, relationship = $5, updated_at = NOW()
      WHERE id = $6 AND active = true
    `;

    await pool.query(updateQuery, [
      has_insurance,
      has_insurance ? insurance_provider_id : null,
      has_insurance ? policy_number : null,
      has_insurance ? insured_name : null,
      has_insurance ? relationship : null,
      patient_id
    ]);

    logger.info(`Patient insurance updated: ${patient_id} - Has Insurance: ${has_insurance}`);

    res.json({
      message: 'Patient insurance information updated successfully',
      patient_insurance: {
        patient_id,
        has_insurance,
        insurance_provider_id: has_insurance ? insurance_provider_id : null,
        policy_number: has_insurance ? policy_number : null,
        insured_name: has_insurance ? insured_name : null,
        relationship: has_insurance ? relationship : null
      }
    });

  } catch (error) {
    logger.error('Update patient insurance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient insurance information
router.get('/patients/:patient_id/insurance', async (req, res) => {
  try {
    const { patient_id } = req.params;

    const query = `
      SELECT 
        p.id as patient_id,
        p.name as patient_name,
        p.has_insurance,
        p.insurance_provider_id,
        p.policy_number,
        p.insured_name,
        p.relationship,
        sip.name as insurance_provider_name,
        sip.code as insurance_provider_code,
        sip.phone as provider_phone,
        sip.email as provider_email
      FROM patients p
      LEFT JOIN simple_insurance_providers sip ON p.insurance_provider_id = sip.id AND sip.active = true
      WHERE p.id = $1 AND p.active = true
    `;

    const result = await pool.query(query, [patient_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patientInsurance = result.rows[0];

    res.json({
      success: true,
      patient_insurance: {
        patient_id: patientInsurance.patient_id,
        patient_name: patientInsurance.patient_name,
        has_insurance: patientInsurance.has_insurance,
        insurance_provider_id: patientInsurance.insurance_provider_id,
        insurance_provider_name: patientInsurance.insurance_provider_name,
        insurance_provider_code: patientInsurance.insurance_provider_code,
        provider_phone: patientInsurance.provider_phone,
        provider_email: patientInsurance.provider_email,
        policy_number: patientInsurance.policy_number,
        insured_name: patientInsurance.insured_name,
        relationship: patientInsurance.relationship
      }
    });

  } catch (error) {
    logger.error('Get patient insurance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patients with insurance (simple list)
router.get('/patients', async (req, res) => {
  try {
    const { center_id, has_insurance, provider_id, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    if (center_id) {
      whereClause += ' AND p.center_id = $1';
      queryParams.push(center_id);
    }

    if (has_insurance !== undefined) {
      whereClause += ' AND p.has_insurance = $' + (queryParams.length + 1);
      queryParams.push(has_insurance === 'true');
    }

    if (provider_id) {
      whereClause += ' AND p.insurance_provider_id = $' + (queryParams.length + 1);
      queryParams.push(provider_id);
    }

    const query = `
      SELECT 
        p.id as patient_id,
        p.name as patient_name,
        p.phone as patient_phone,
        p.email as patient_email,
        p.has_insurance,
        p.insurance_provider_id,
        p.policy_number,
        p.insured_name,
        p.relationship,
        sip.name as insurance_provider_name,
        sip.code as insurance_provider_code,
        c.name as center_name
      FROM patients p
      LEFT JOIN simple_insurance_providers sip ON p.insurance_provider_id = sip.id AND sip.active = true
      LEFT JOIN centers c ON p.center_id = c.id
      WHERE ${whereClause} AND p.active = true
      ORDER BY p.name
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const result = await pool.query(query, [...queryParams, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM patients p 
      WHERE ${whereClause} AND p.active = true
    `;
    const countResult = await pool.query(countQuery, queryParams);

    const patients = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      patients,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        center_id,
        has_insurance,
        provider_id
      }
    });

  } catch (error) {
    logger.error('Get patients with insurance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get insurance statistics (simple)
router.get('/statistics', async (req, res) => {
  try {
    const { center_id } = req.query;
    
    let centerFilter = center_id ? `WHERE p.center_id = ${center_id}` : '';

    const query = `
      SELECT 
        COUNT(*) as total_patients,
        COUNT(CASE WHEN p.has_insurance = true THEN 1 END) as patients_with_insurance,
        COUNT(CASE WHEN p.has_insurance = false THEN 1 END) as patients_without_insurance,
        COUNT(DISTINCT p.insurance_provider_id) as active_providers,
        COUNT(DISTINCT CASE WHEN p.has_insurance = true THEN p.insurance_provider_id END) as providers_with_patients
      FROM patients p
      LEFT JOIN simple_insurance_providers sip ON p.insurance_provider_id = sip.id AND sip.active = true
      ${centerFilter} AND p.active = true
    `;

    const result = await pool.query(query);

    // Provider breakdown
    const providerQuery = `
      SELECT 
        sip.name as provider_name,
        sip.code as provider_code,
        COUNT(p.id) as patient_count
      FROM simple_insurance_providers sip
      LEFT JOIN patients p ON sip.id = p.insurance_provider_id AND p.active = true
      WHERE sip.active = true ${center_id ? `AND sip.center_id = ${center_id}` : ''}
      GROUP BY sip.id, sip.name, sip.code
      HAVING COUNT(p.id) > 0
      ORDER BY patient_count DESC
    `;

    const providerResult = await pool.query(providerQuery);

    res.json({
      success: true,
      statistics: result.rows[0],
      provider_breakdown: providerResult.rows,
      filters: {
        center_id
      }
    });

  } catch (error) {
    logger.error('Get insurance statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update insurance provider
router.put('/providers/:id', [
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('code').trim().isLength({ min: 2, max: 20 }),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      name,
      code,
      phone,
      email,
      city,
      state
    } = req.body;

    // Check if provider exists
    const existingProvider = await pool.query(
      'SELECT id FROM simple_insurance_providers WHERE id = $1 AND active = true',
      [id]
    );

    if (existingProvider.rows.length === 0) {
      return res.status(404).json({ error: 'Insurance provider not found' });
    }

    // Check if code conflicts with another provider
    const codeConflict = await pool.query(
      'SELECT id FROM simple_insurance_providers WHERE code = $1 AND id != $2 AND active = true',
      [code, id]
    );

    if (codeConflict.rows.length > 0) {
      return res.status(400).json({ error: 'Insurance provider code already exists' });
    }

    // Update provider
    await pool.query(
      `UPDATE simple_insurance_providers SET 
        name = $1, code = $2, phone = $3, email = $4, city = $5, state = $6, updated_at = NOW() 
      WHERE id = $7 AND active = true`,
      [name, code, phone, email, city, state, id]
    );

    logger.info(`Insurance provider updated: ${name} (${code})`);

    res.json({
      message: 'Insurance provider updated successfully',
      insurance_provider: {
        id,
        name,
        code,
        phone,
        email,
        city,
        state
      }
    });

  } catch (error) {
    logger.error('Update insurance provider error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete insurance provider (soft delete)
router.delete('/providers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if provider exists
    const existingProvider = await pool.query(
      'SELECT id FROM simple_insurance_providers WHERE id = $1 AND active = true',
      [id]
    );

    if (existingProvider.rows.length === 0) {
      return res.status(404).json({ error: 'Insurance provider not found' });
    }

    // Check if provider has patients
    const patientsWithProvider = await pool.query(
      'SELECT COUNT(*) as count FROM patients WHERE insurance_provider_id = $1 AND active = true',
      [id]
    );

    if (parseInt(patientsWithProvider.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete provider with associated patients' });
    }

    // Soft delete provider
    await pool.query(
      'UPDATE simple_insurance_providers SET active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    logger.info(`Insurance provider deleted: ${id}`);

    res.json({
      message: 'Insurance provider deleted successfully'
    });

  } catch (error) {
    logger.error('Delete insurance provider error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
