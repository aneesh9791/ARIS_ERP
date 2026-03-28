const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('RADIOLOGY_REPORT', 'RADIOLOGY_VIEW'));

// ── Study & Reporting Workflow ────────────────────────────────────────────────
//
// Each bill_item row is one study. The worklist returns one row per bill_item.
// :id in exam-complete / report-complete is bill_item_id (NOT bill_id).

// GET /api/rad-reporting/worklist?exam_workflow_status=&center_id=&page=&limit=
// Returns one row per bill_item (individual study), with per-study accession,
// status, and reporter assignment.
router.get('/worklist', async (req, res) => {
  try {
    const { exam_workflow_status, center_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conds  = ["pb.payment_status = 'PAID'", 'pb.active = true', 'bi.active = true'];
    const params = [];

    if (center_id) {
      params.push(center_id);
      conds.push(`pb.center_id = $${params.length}`);
    }
    if (exam_workflow_status) {
      params.push(exam_workflow_status);
      conds.push(`COALESCE(bi.exam_workflow_status, 'EXAM_SCHEDULED') = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT
         bi.id                                                        AS id,
         bi.id                                                        AS bill_item_id,
         pb.id                                                        AS bill_id,
         COALESCE(bi.accession_number, pb.accession_number,
                  pb.invoice_number)                                  AS accession_number,
         pb.center_id,
         pb.bill_date                                                 AS created_at,
         COALESCE(bi.exam_workflow_status, 'EXAM_SCHEDULED')          AS exam_workflow_status,
         bi.study_code,
         bi.study_name,
         bi.modality,
         bi.reporter_radiologist_id,
         bi.rate_snapshot,
         sm.study_definition_id,
         -- Pull reporter & JE info from linked studies row (if exists)
         s.id                                                         AS study_id,
         s.radiologist_code,
         s.reporting_rate,
         s.report_date,
         s.reporting_posted_at,
         p.name                                                       AS patient_name,
         p.phone                                                      AS patient_phone,
         p.id                                                         AS patient_id,
         c.name                                                       AS center_name,
         rm.name                                                      AS reporter_name,
         rm.type                                                      AS reporter_type
       FROM bill_items bi
       JOIN patient_bills pb         ON pb.id = bi.bill_id
       JOIN patients p               ON p.id::text = pb.patient_id::text
       JOIN centers c                ON c.id = pb.center_id
       LEFT JOIN study_master sm     ON sm.study_code = bi.study_code AND sm.active = true
       LEFT JOIN studies s           ON s.bill_item_id = bi.id AND s.active = true
       LEFT JOIN radiologist_master rm ON rm.id = bi.reporter_radiologist_id
       WHERE ${conds.join(' AND ')}
       ORDER BY pb.bill_date DESC, pb.id DESC, bi.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM bill_items bi
       JOIN patient_bills pb ON pb.id = bi.bill_id
       WHERE ${conds.join(' AND ')}`,
      params
    );

    res.json({ success: true, studies: rows, total: parseInt(cnt[0].count) });
  } catch (e) {
    logger.error('Worklist GET:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rad-reporting/reporters?bill_item_id=
// Returns reporters with their applicable rate for the given bill_item's study.
router.get('/reporters', async (req, res) => {
  try {
    const { bill_item_id, study_id } = req.query;
    let studyCode = null;
    let modality  = null;

    // bill_item_id is the primary key; fall back to legacy study_id (bill_id)
    if (bill_item_id) {
      const { rows: [bi] } = await pool.query(
        `SELECT bi.study_code, sm.modality
         FROM bill_items bi
         LEFT JOIN study_master sm ON sm.study_code = bi.study_code AND sm.active = true
         WHERE bi.id = $1`, [bill_item_id]
      );
      if (bi) { studyCode = bi.study_code; modality = bi.modality; }
    } else if (study_id) {
      // Legacy: study_id was actually bill_id
      const { rows: [bi] } = await pool.query(
        `SELECT bi.study_code, sm.modality
         FROM bill_items bi
         LEFT JOIN study_master sm ON sm.study_code = bi.study_code AND sm.active = true
         WHERE bi.bill_id = $1 LIMIT 1`, [study_id]
      );
      if (bi) { studyCode = bi.study_code; modality = bi.modality; }
    }

    const { rows } = await pool.query(
      `SELECT id, radiologist_code, name, type, specialty, reporting_rates
       FROM radiologist_master WHERE active = true ORDER BY type, name`
    );

    const reporters = rows.map(r => {
      let rate = null;
      try {
        const rates = typeof r.reporting_rates === 'string'
          ? JSON.parse(r.reporting_rates) : (r.reporting_rates || []);
        const byStudy    = rates.find(x => x.study_code === studyCode);
        const byModality = rates.find(x => x.modality   === modality);
        const found = byStudy || byModality || rates[0] || null;
        rate = found ? parseFloat(found.rate) : null;
      } catch (_) {}
      return { id: r.id, code: r.radiologist_code, name: r.name, type: r.type, specialty: r.specialty, rate };
    }).filter(r => r.rate !== null && r.rate > 0);

    res.json({ success: true, reporters });
  } catch (e) {
    logger.error('Reporters GET:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rad-reporting/:id/exam-complete
// :id is bill_item_id. Marks the individual study exam done + assigns reporter.
// Also saves consumables if provided in the request body.
// Auto-creates a studies row linked to this bill_item for JE tracking.
router.put('/:id/exam-complete', async (req, res) => {
  try {
    const { reporter_radiologist_id, rate_snapshot } = req.body;
    if (!reporter_radiologist_id) return res.status(400).json({ error: 'Reporter is required' });

    const billItemId = parseInt(req.params.id, 10);

    // Fetch the bill_item + parent bill
    const { rows: [bi] } = await pool.query(
      `SELECT bi.*, pb.center_id, pb.patient_id, pb.id AS bill_id,
              pb.accession_number AS bill_accession
       FROM bill_items bi
       JOIN patient_bills pb ON pb.id = bi.bill_id
       WHERE bi.id = $1 AND bi.active = true`, [billItemId]
    );
    if (!bi) return res.status(404).json({ error: 'Study item not found' });

    const { rows: [rep] } = await pool.query(
      `SELECT id, radiologist_code FROM radiologist_master WHERE id = $1`, [reporter_radiologist_id]
    );
    if (!rep) return res.status(404).json({ error: 'Reporter not found' });

    if (bi.exam_workflow_status === 'REPORT_COMPLETED')
      return res.status(400).json({ error: 'Report already completed for this study' });

    // Update bill_items workflow columns
    await pool.query(
      `UPDATE bill_items
       SET exam_workflow_status    = 'EXAM_COMPLETED',
           reporter_radiologist_id = $1,
           rate_snapshot           = $2,
           updated_at              = NOW()
       WHERE id = $3`,
      [reporter_radiologist_id, rate_snapshot || null, billItemId]
    );

    // Find or create a studies row for this bill_item (needed for JE posting later)
    let { rows: [study] } = await pool.query(
      `SELECT id FROM studies WHERE bill_item_id = $1 AND active = true LIMIT 1`, [billItemId]
    );
    if (!study) {
      const { rows: [newStudy] } = await pool.query(
        `INSERT INTO studies
           (patient_id, center_id, payment_status, exam_workflow_status,
            study_code, accession_number, bill_item_id, active, created_at, updated_at)
         VALUES ($1, $2, 'PAID', 'EXAM_SCHEDULED', $3, $4, $5, true, NOW(), NOW())
         RETURNING id`,
        [bi.patient_id, bi.center_id, bi.study_code,
         bi.accession_number || bi.bill_accession || null, billItemId]
      );
      study = newStudy;
    }

    await pool.query(
      `UPDATE studies
       SET exam_workflow_status    = 'EXAM_COMPLETED',
           reporter_radiologist_id = $1,
           rate_snapshot           = $2,
           radiologist_code        = $3,
           reporting_rate          = $2,
           study_code              = COALESCE(study_code, $4),
           updated_at              = NOW()
       WHERE id = $5`,
      [reporter_radiologist_id, rate_snapshot || null, rep.radiologist_code, bi.study_code, study.id]
    );

    // Note: consumables are saved separately via POST /api/bill-consumables/save
    // with bill_item_id set for per-study items or null for shared/patient-level items.

    logger.info('Exam completed + reporter assigned', { bill_item_id: billItemId, reporter_radiologist_id });
    res.json({ success: true, message: 'Exam completed and reporter assigned' });
  } catch (e) {
    logger.error('Exam-complete PUT:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rad-reporting/:id/report-complete
// :id is bill_item_id. Marks report done → generates reporting payable JE.
router.put('/:id/report-complete', async (req, res) => {
  try {
    const { report_notes } = req.body;
    const billItemId = parseInt(req.params.id, 10);

    // Find the studies row linked to this bill_item
    const { rows: [study] } = await pool.query(
      `SELECT s.*, sm.modality FROM studies s
       LEFT JOIN study_master sm ON sm.study_code = s.study_code
       WHERE s.bill_item_id = $1 AND s.active = true`, [billItemId]
    );
    if (!study) return res.status(404).json({ error: 'No study record found. Complete exam first.' });
    if (study.exam_workflow_status !== 'EXAM_COMPLETED')
      return res.status(400).json({ error: 'Exam must be completed before marking report done' });
    if (!study.radiologist_code)
      return res.status(400).json({ error: 'No reporter assigned to this study' });
    if (study.reporting_posted_at)
      return res.status(409).json({ error: 'Reporting payout already posted' });

    const now = new Date();

    // Update both studies and bill_items
    await pool.query(
      `UPDATE studies
       SET exam_workflow_status = 'REPORT_COMPLETED',
           report_status        = 'COMPLETED',
           report_date          = $1,
           notes                = COALESCE($2, notes),
           updated_at           = NOW()
       WHERE id = $3 AND active = true`,
      [now, report_notes || null, study.id]
    );

    await pool.query(
      `UPDATE bill_items SET exam_workflow_status = 'REPORT_COMPLETED', updated_at = NOW()
       WHERE id = $1`,
      [billItemId]
    );

    // Fire reporting payout JE asynchronously
    setImmediate(async () => {
      try {
        await financeService.postReportingPayoutJE(
          {
            id:               study.id,
            study_code:       study.study_code,
            center_id:        study.center_id,
            radiologist_code: study.radiologist_code,
            report_date:      study.report_date || now,
            accession_number: study.accession_number,
          },
          req.user?.id
        );
        logger.info('Reporting payout JE posted', { study_id: study.id, bill_item_id: billItemId });
      } catch (jeErr) {
        logger.error('Reporting payout JE failed:', { study_id: study.id, error: jeErr.message });
      }
    });

    logger.info('Report completed', { study_id: study.id, bill_item_id: billItemId });
    res.json({ success: true, message: 'Report completed — payout payable being generated' });
  } catch (e) {
    logger.error('Report-complete PUT:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── UNIFIED RADIOLOGIST MASTER (includes both individual radiologists and teleradiology companies) ──


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
      ORDER BY rm.type, rm.radiologist_name
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

    const reporterType = type === 'TELERADIOLOGY_COMPANY' ? 'TELERADIOLOGY' : 'RADIOLOGIST';

    const query = `
      INSERT INTO radiologist_master (
        radiologist_code, name, type, reporter_type, specialty, qualification, license_number,
        center_id, contact_phone, contact_email, address, city, state, postal_code,
        reporting_rates, bank_account_number, bank_name, ifsc_code, gst_number,
        pan_number, contact_person, notes, credit_days, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      radiologist_code, name, type, reporterType, specialty, qualification, license_number,
      center_id, contact_phone, contact_email, address, city, state, postal_code,
      JSON.stringify(reporting_rates), bank_account_number, bank_name, ifsc_code, gst_number,
      pan_number, contact_person, notes, req.body.credit_days ?? 30
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

    const reporterType = type === 'TELERADIOLOGY_COMPANY' ? 'TELERADIOLOGY' : 'RADIOLOGIST';

    // Update radiologist
    await pool.query(
      `UPDATE radiologist_master SET
        name = $1, type = $2, reporter_type = $3, specialty = $4, qualification = $5, license_number = $6,
        center_id = $7, contact_phone = $8, contact_email = $9, address = $10, city = $11,
        state = $12, postal_code = $13, reporting_rates = $14, bank_account_number = $15,
        bank_name = $16, ifsc_code = $17, gst_number = $18, pan_number = $19,
        contact_person = $20, notes = $21, credit_days = $22, updated_at = NOW()
      WHERE id = $23 AND active = true`,
      [
        name, type, reporterType, specialty, qualification, license_number, center_id, contact_phone,
        contact_email, address, city, state, postal_code, JSON.stringify(reporting_rates),
        bank_account_number, bank_name, ifsc_code, gst_number, pan_number,
        contact_person, notes, req.body.credit_days ?? 30, id
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
        rm.radiologist_name,
        rm.type,
        rm.specialty,
        jsonb_array_elements(rm.reporting_rates) as rate_data
      FROM radiologist_master rm
      WHERE ${whereClause}
      ORDER BY rm.radiologist_name
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

    // Re-fetch updated study to get all fields for finance payout
    const { rows: updatedStudyRows } = await pool.query(
      'SELECT id, study_code, center_id, radiologist_code, report_date, accession_number, reporting_posted_at FROM studies WHERE id = $1',
      [study_id]
    );
    const updatedStudy = updatedStudyRows[0];

    // Trigger radiologist payout JE only for completed/finalized reports and only if not already posted
    if (
      updatedStudy &&
      !updatedStudy.reporting_posted_at &&
      (report_status === 'COMPLETED' || report_status === 'FINALIZED' || report_status === 'APPROVED')
    ) {
      setImmediate(async () => {
        try {
          await financeService.postReportingPayoutJE(
            {
              id:               updatedStudy.id,
              study_code:       updatedStudy.study_code,
              center_id:        updatedStudy.center_id,
              radiologist_code: updatedStudy.radiologist_code,
              report_date:      updatedStudy.report_date || new Date(),
              accession_number: updatedStudy.accession_number
            },
            req.user?.id
          );
        } catch (e) {
          logger.error('Reporting payout JE failed:', e);
        }
      });
    }

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
        rm.radiologist_name as radiologist_name,
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

    // Post GL: DR AP (2113) → CR Bank/Cash
    setImmediate(async () => {
      try {
        const bankCode = (payment_mode || '').toUpperCase() === 'CASH' ? '1111' : '1112';
        // Prefer bank_accounts.gl_account_id; fall back to hardcoded COA code
        let bankGlId = null;
        if (bank_account_id) {
          const { rows: [ba] } = await pool.query(
            `SELECT gl_account_id FROM bank_accounts WHERE id = $1 AND active = true LIMIT 1`,
            [bank_account_id]
          );
          bankGlId = ba?.gl_account_id || null;
        }
        if (!bankGlId) {
          const { rows: [ba] } = await pool.query(
            `SELECT id FROM chart_of_accounts WHERE account_code=$1 AND is_active=true LIMIT 1`, [bankCode]
          );
          bankGlId = ba?.id || null;
        }
        const [{ rows: [apAcc] }] = await Promise.all([
          pool.query(`SELECT id FROM chart_of_accounts WHERE account_code='2113' AND is_active=true LIMIT 1`),
        ]);
        const bankAcc = bankGlId ? { id: bankGlId } : null;
        if (!apAcc || !bankAcc) {
          logger.warn('Radiologist payment GL: AP/Bank account not found — skipping JE');
          return;
        }
        const radiologist = radiologistQuery.rows[0];
        const amt = parseFloat(amount_paid);
        await financeService.createAndPostJE({
          sourceModule: 'REPORTING',
          sourceId:     null,
          sourceRef:    paymentId,
          narration:    `Radiologist payment: ${radiologist_code} | ${paymentId}`,
          lines: [
            { accountId: apAcc.id,   debit: amt, credit: 0,   description: `AP cleared: ${radiologist.radiologist_name || radiologist_code}` },
            { accountId: bankAcc.id, debit: 0,   credit: amt, description: `${payment_mode} payment: ${transaction_reference || paymentId}` },
          ],
          createdBy:  req.user?.id,
          postingKey: `RADPAY-${paymentId}`,
          entryDate:  new Date(payment_date),
        });
      } catch (jeErr) {
        logger.error('Radiologist payment JE failed:', { paymentId, error: jeErr.message });
      }
    });

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
        rm.radiologist_name as radiologist_name,
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
      GROUP BY rp.id, rm.radiologist_name, rm.type, rm.specialty, c.name
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
    
    const centerIdInt = center_id ? parseInt(center_id, 10) : null;
    let centerFilter = centerIdInt ? `AND rm.center_id = ${centerIdInt}` : '';
    let centerFilterStudy = centerIdInt ? `AND s.center_id = ${centerIdInt}` : '';
    let radiologistFilter = radiologist_code ? `AND rm.radiologist_code = '${radiologist_code}'` : '';
    let dateFilter = '';

    if (period === '7') {
      dateFilter = 'AND COALESCE(s.report_date, s.created_at::date) >= CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (period === '30') {
      dateFilter = 'AND COALESCE(s.report_date, s.created_at::date) >= CURRENT_DATE - INTERVAL \'30 days\'';
    } else if (period === '90') {
      dateFilter = 'AND COALESCE(s.report_date, s.created_at::date) >= CURRENT_DATE - INTERVAL \'90 days\'';
    } else if (period === '365') {
      dateFilter = 'AND COALESCE(s.report_date, s.created_at::date) >= CURRENT_DATE - INTERVAL \'365 days\'';
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
        rm.radiologist_name,
        rm.type,
        rm.specialty,
        COUNT(s.id) as studies_reported,
        COALESCE(SUM(s.reporting_rate), 0) as total_earnings,
        COALESCE(SUM(CASE WHEN s.payment_status = 'PAID' THEN s.reporting_rate ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN s.payment_status = 'PENDING' THEN s.reporting_rate ELSE 0 END), 0) as pending_amount
      FROM radiologist_master rm
      LEFT JOIN studies s ON rm.radiologist_code = s.radiologist_code AND s.active = true
      WHERE rm.active = true ${centerFilter} ${dateFilter}
      GROUP BY rm.radiologist_code, rm.radiologist_name, rm.type, rm.specialty
      HAVING COUNT(s.id) > 0
      ORDER BY total_earnings DESC
      LIMIT 10
    `;

    // Modality breakdown
    // Studies auto-created during reporter assignment may not have study_code set;
    // fall back to bill_items.modality which is always populated at billing time.
    const modalityQuery = `
      SELECT
        COALESCE(sm.modality, bi.modality, 'Unknown') AS modality,
        COUNT(s.id) as studies_reported,
        COUNT(DISTINCT s.radiologist_code) as radiologists_count,
        COALESCE(SUM(s.reporting_rate), 0) as total_earnings
      FROM studies s
      LEFT JOIN patient_bills pb ON pb.study_id = s.id AND pb.active = true
      LEFT JOIN bill_items bi    ON bi.bill_id = pb.id  AND bi.active = true
      LEFT JOIN study_master sm  ON sm.study_code = s.study_code AND sm.active = true
      WHERE s.active = true AND s.radiologist_code IS NOT NULL ${centerFilterStudy} ${dateFilter}
      GROUP BY COALESCE(sm.modality, bi.modality, 'Unknown')
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
