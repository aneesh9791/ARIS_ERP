const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('PHYSICIAN_VIEW'));

// Get referring physicians for dropdown
router.get('/referring-physicians', async (req, res) => {
  try {
    const { center_id, active_only = 'true' } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND rpm.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (active_only === 'true') {
      whereClause += ' AND rpm.active = true';
    }

    const query = `
      SELECT 
        rpm.physician_code,
        rpm.physician_name,
        rpm.specialty,
        rpm.qualification,
        rpm.contact_phone,
        rpm.contact_email,
        c.name as center_name,
        COUNT(st.id) as total_referrals,
        COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_referrals,
        COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) as total_revenue_generated,
        rpm.commission_rate,
        rpm.contract_type
      FROM referring_physician_master rpm
      LEFT JOIN centers c ON rpm.center_id = c.id
      LEFT JOIN studies st ON rpm.physician_code = st.referring_physician_code
      LEFT JOIN study_master sm ON st.study_code = sm.study_code
      WHERE ${whereClause}
      GROUP BY rpm.physician_code, rpm.physician_name, rpm.specialty, rpm.qualification, 
               rpm.contact_phone, rpm.contact_email, c.name, rpm.commission_rate, rpm.contract_type
      ORDER BY rpm.physician_name ASC
    `;

    const result = await pool.query(query, queryParams);
    
    res.json({
      success: true,
      referring_physicians: result.rows,
      filters: {
        center_id,
        active_only
      }
    });

  } catch (error) {
    logger.error('Get referring physicians dropdown error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get physician volume statistics
router.get('/physician-volume/:physician_code', async (req, res) => {
  try {
    const { physician_code } = req.params;
    const { start_date, end_date, center_id } = req.query;
    
    let whereClause = 'st.referring_physician_code = $1';
    let queryParams = [physician_code];
    
    if (center_id) {
      whereClause += ' AND st.center_id = $' + (queryParams.length + 1);
      queryParams.push(center_id);
    }
    
    if (start_date && end_date) {
      whereClause += ' AND st.appointment_date >= $' + (queryParams.length + 1) + ' AND st.appointment_date <= $' + (queryParams.length + 2);
      queryParams.push(start_date, end_date);
    }

    const query = `
      SELECT 
        rpm.physician_code,
        rpm.physician_name,
        rpm.specialty,
        rpm.commission_rate,
        rpm.contract_type,
        COUNT(st.id) as total_referrals,
        COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_referrals,
        COUNT(CASE WHEN st.appointment_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as referrals_30d,
        COUNT(CASE WHEN st.appointment_date >= CURRENT_DATE - INTERVAL '90 days' THEN 1 END) as referrals_90d,
        COUNT(CASE WHEN st.appointment_date >= CURRENT_DATE - INTERVAL '365 days' THEN 1 END) as referrals_1yr,
        COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) as total_revenue_generated,
        COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) * rpm.commission_rate as potential_commission,
        STRING_AGG(DISTINCT sm.modality, ', ') as modalities_used,
        MIN(st.appointment_date) as first_referral_date,
        MAX(st.appointment_date) as last_referral_date
      FROM referring_physician_master rpm
      LEFT JOIN studies st ON rpm.physician_code = st.referring_physician_code
      LEFT JOIN study_master sm ON st.study_code = sm.study_code
      WHERE ${whereClause}
      GROUP BY rpm.physician_code, rpm.physician_name, rpm.specialty, rpm.commission_rate, rpm.contract_type
    `;

    const result = await pool.query(query, queryParams);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Physician not found',
        physician_code 
      });
    }

    // Calculate volume-based rewards if applicable
    const physician = result.rows[0];
    let volumeRewards = {
      tier: 'BRONZE',
      reward_rate: 0,
      reward_amount: 0,
      next_tier: 'SILVER',
      next_tier_volume: 50,
      volume_to_next_tier: Math.max(0, 50 - physician.total_referrals)
    };

    // Determine reward tier based on volume
    if (physician.total_referrals >= 200) {
      volumeRewards = {
        tier: 'PLATINUM',
        reward_rate: 0.03,
        reward_amount: physician.total_revenue_generated * 0.03,
        next_tier: 'MAX',
        next_tier_volume: 200,
        volume_to_next_tier: 0
      };
    } else if (physician.total_referrals >= 100) {
      volumeRewards = {
        tier: 'GOLD',
        reward_rate: 0.025,
        reward_amount: physician.total_revenue_generated * 0.025,
        next_tier: 'PLATINUM',
        next_tier_volume: 200,
        volume_to_next_tier: Math.max(0, 200 - physician.total_referrals)
      };
    } else if (physician.total_referrals >= 50) {
      volumeRewards = {
        tier: 'SILVER',
        reward_rate: 0.02,
        reward_amount: physician.total_revenue_generated * 0.02,
        next_tier: 'GOLD',
        next_tier_volume: 100,
        volume_to_next_tier: Math.max(0, 100 - physician.total_referrals)
      };
    } else {
      volumeRewards = {
        tier: 'BRONZE',
        reward_rate: 0.015,
        reward_amount: physician.total_revenue_generated * 0.015,
        next_tier: 'SILVER',
        next_tier_volume: 50,
        volume_to_next_tier: Math.max(0, 50 - physician.total_referrals)
      };
    }

    res.json({
      success: true,
      physician_volume: {
        ...physician,
        volume_rewards: volumeRewards
      },
      filters: {
        start_date,
        end_date,
        center_id
      }
    });

  } catch (error) {
    logger.error('Get physician volume error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all physicians with volume tiers
router.get('/volume-tier-summary', async (req, res) => {
  try {
    const { center_id } = req.query;
    
    let centerFilter = center_id ? `AND st.center_id = ${center_id}` : '';

    const query = `
      SELECT 
        rpm.physician_code,
        rpm.physician_name,
        rpm.specialty,
        rpm.center_id,
        c.name as center_name,
        COUNT(st.id) as total_referrals,
        COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) as total_revenue_generated,
        CASE 
          WHEN COUNT(st.id) >= 200 THEN 'PLATINUM'
          WHEN COUNT(st.id) >= 100 THEN 'GOLD'
          WHEN COUNT(st.id) >= 50 THEN 'SILVER'
          ELSE 'BRONZE'
        END as current_tier,
        CASE 
          WHEN COUNT(st.id) >= 200 THEN 0.03
          WHEN COUNT(st.id) >= 100 THEN 0.025
          WHEN COUNT(st.id) >= 50 THEN 0.02
          ELSE 0.015
        END as reward_rate,
        CASE 
          WHEN COUNT(st.id) >= 200 THEN COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) * 0.03
          WHEN COUNT(st.id) >= 100 THEN COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) * 0.025
          WHEN COUNT(st.id) >= 50 THEN COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) * 0.02
          ELSE COALESCE(SUM(CASE WHEN st.status = 'completed' THEN sm.base_rate ELSE 0 END), 0) * 0.015
        END as volume_reward_amount
      FROM referring_physician_master rpm
      LEFT JOIN centers c ON rpm.center_id = c.id
      LEFT JOIN studies st ON rpm.physician_code = st.referring_physician_code
      LEFT JOIN study_master sm ON st.study_code = sm.study_code
      WHERE rpm.active = true ${centerFilter}
      GROUP BY rpm.physician_code, rpm.physician_name, rpm.specialty, rpm.center_id, c.name
      ORDER BY total_referrals DESC
    `;

    const result = await pool.query(query);
    
    // Calculate tier summaries
    const tierSummary = result.rows.reduce((acc, row) => {
      const tier = row.current_tier;
      if (!acc[tier]) {
        acc[tier] = {
          tier,
          physician_count: 0,
          total_referrals: 0,
          total_revenue: 0,
          total_rewards: 0
        };
      }
      acc[tier].physician_count += 1;
      acc[tier].total_referrals += parseInt(row.total_referrals);
      acc[tier].total_revenue += parseFloat(row.total_revenue_generated);
      acc[tier].total_rewards += parseFloat(row.volume_reward_amount);
      return acc;
    }, {});

    res.json({
      success: true,
      volume_tiers: result.rows,
      tier_summary: Object.values(tierSummary),
      filters: {
        center_id
      }
    });

  } catch (error) {
    logger.error('Get volume tier summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update patient registration to include referring physician
router.post('/register-with-physician', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('dob').isISO8601().toDate(),
  body('gender').isIn(['male', 'female', 'other']),
  body('address').trim().isLength({ min: 10, max: 500 }),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 }),
  body('postal_code').trim().isLength({ min: 3, max: 20 }),
  body('country').trim().isLength({ min: 2, max: 100 }),
  body('emergency_contact').trim().isLength({ min: 10, max: 100 }),
  body('center_id').isInt(),
  body('referring_physician_code').optional().trim().isLength({ min: 2, max: 20 }),
  body('insurance_provider').optional().trim().isLength({ min: 2, max: 100 }),
  body('policy_number').optional().trim().isLength({ min: 5, max: 50 }),
  body('payment_method').optional().trim().isLength({ min: 2, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      email,
      phone,
      dob,
      gender,
      address,
      city,
      state,
      postal_code,
      country,
      emergency_contact,
      center_id,
      referring_physician_code,
      insurance_provider,
      policy_number,
      payment_method
    } = req.body;

    // Generate patient ID
    const patientId = 'PAT' + Date.now().toString(36).substr(2, 9).toUpperCase();

    const query = `
      INSERT INTO patients (
        id, name, email, phone, dob, gender, address, city, state, 
        postal_code, country, emergency_contact, center_id, 
        referring_physician_code, insurance_provider, policy_number, 
        payment_method, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
        $14, $15, $16, $17, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      patientId, name, email, phone, dob, gender, address, city, state,
      postal_code, country, emergency_contact, center_id,
      referring_physician_code, insurance_provider, policy_number,
      payment_method
    ]);

    logger.info(`Patient registered with referring physician: ${patientId} - ${name} (${referring_physician_code || 'None'})`);

    res.status(201).json({
      message: 'Patient registered successfully',
      patient: {
        id: patientId,
        name,
        email,
        phone,
        dob,
        gender,
        address,
        city,
        state,
        postal_code,
        country,
        emergency_contact,
        center_id,
        referring_physician_code,
        insurance_provider,
        policy_number,
        payment_method
      }
    });

  } catch (error) {
    logger.error('Patient registration with physician error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
