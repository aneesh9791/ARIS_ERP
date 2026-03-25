const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('RADIOLOGY_REPORT', 'RADIOLOGY_VIEW'));

// ── Study & Reporting Workflow ────────────────────────────────────────────────

// GET /api/rad-reporting/worklist?exam_workflow_status=&center_id=
// Returns PAID bills (not cancelled) as study workflow items.
// If the bill has a linked studies row, uses its exam_workflow_status;
// otherwise defaults to EXAM_SCHEDULED.
router.get('/worklist', async (req, res) => {
  try {
    const { exam_workflow_status, center_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Conditions on patient_bills
    const billConds = ["pb.payment_status = 'PAID'", "pb.active = true"];
    const params = [];

    if (center_id) { params.push(center_id); billConds.push(`pb.center_id = $${params.length}`); }

    // Workflow status filter (on the studies row or defaulted)
    let statusFilter = '';
    if (exam_workflow_status) {
      params.push(exam_workflow_status);
      statusFilter = `AND COALESCE(s.exam_workflow_status, 'EXAM_SCHEDULED') = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         pb.id                                                    AS bill_id,
         pb.id                                                    AS id,
         COALESCE(pb.accession_number, s.accession_number, pb.invoice_number) AS accession_number,
         pb.center_id,
         pb.bill_date                                             AS created_at,
         pb.notes                                                 AS study_name_fallback,
         COALESCE(s.exam_workflow_status, 'EXAM_SCHEDULED')       AS exam_workflow_status,
         s.id                                                     AS study_id,
         s.radiologist_code,
         s.reporter_radiologist_id,
         s.rate_snapshot,
         s.reporting_rate,
         s.report_date,
         s.reporting_posted_at,
         p.name                                                   AS patient_name,
         p.phone                                                  AS patient_phone,
         p.id                                                     AS patient_id,
         COALESCE(sm.study_name, pb.notes, pb.invoice_number)     AS study_name,
         sm.modality,
         sm.study_definition_id,
         c.name                                                   AS center_name,
         rm.name                                                  AS reporter_name,
         rm.type                                                  AS reporter_type
       FROM patient_bills pb
       LEFT JOIN patients p          ON p.id::text = pb.patient_id::text
       LEFT JOIN studies s           ON s.id = pb.study_id AND s.active = true
       LEFT JOIN study_master sm     ON sm.study_code = s.study_code AND sm.active = true
       LEFT JOIN centers c           ON c.id = pb.center_id
       LEFT JOIN radiologist_master rm ON rm.id = s.reporter_radiologist_id
       WHERE ${billConds.join(' AND ')} ${statusFilter}
       ORDER BY pb.bill_date DESC, pb.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM patient_bills pb
       LEFT JOIN studies s ON s.id = pb.study_id AND s.active = true
       WHERE ${billConds.join(' AND ')} ${statusFilter}`,
      params
    );

    res.json({ success: true, studies: rows, total: parseInt(cnt[0].count) });
  } catch (e) {
    logger.error('Worklist GET:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rad-reporting/reporters?study_id= (study_id is bill_id in new workflow)
// Returns reporters with their applicable rate for the given study/bill
router.get('/reporters', async (req, res) => {
  try {
    const { study_id } = req.query; // study_id here is actually bill_id
    let studyCode = null;
    let modality  = null;

    if (study_id) {
      // Try bill → service name → study_master match
      const { rows: billRows } = await pool.query(
        `SELECT pb.service, pb.study_id,
                sm.study_code, sm.modality
         FROM patient_bills pb
         LEFT JOIN studies s ON s.id = pb.study_id
         LEFT JOIN study_master sm ON sm.billing_code = pb.service AND sm.active = true
         WHERE pb.id = $1 LIMIT 1`, [study_id]
      );
      if (billRows[0]) {
        studyCode = billRows[0].study_code || null;
        modality  = billRows[0].modality  || null;
      }
    }

    const { rows } = await pool.query(
      `SELECT id, radiologist_code, name, type, specialty, reporting_rates
       FROM radiologist_master WHERE active = true ORDER BY type, name`
    );

    // Resolve applicable rate for each reporter — only include reporters with a configured rate
    const reporters = rows.map(r => {
      let rate = null;
      try {
        const rates = typeof r.reporting_rates === 'string'
          ? JSON.parse(r.reporting_rates) : (r.reporting_rates || []);
        // Prefer study_code match, fallback to modality match, then any rate
        const byStudy    = rates.find(x => x.study_code === studyCode);
        const byModality = rates.find(x => x.modality   === modality);
        const found = byStudy || byModality || rates[0] || null;
        rate = found ? parseFloat(found.rate) : null;
      } catch (_) {}
      return { id: r.id, code: r.radiologist_code, name: r.name, type: r.type, specialty: r.specialty, rate };
    }).filter(r => r.rate !== null && r.rate > 0);  // only show reporters with a rate for this study

    res.json({ success: true, reporters });
  } catch (e) {
    logger.error('Reporters GET:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rad-reporting/:id/exam-complete
// :id is bill_id. Mark exam done + assign reporter.
// Auto-creates a studies row linked to the bill if one does not exist.
router.put('/:id/exam-complete', async (req, res) => {
  try {
    const { reporter_radiologist_id, rate_snapshot } = req.body;
    if (!reporter_radiologist_id) return res.status(400).json({ error: 'Reporter is required' });

    const billId = parseInt(req.params.id, 10);

    // Fetch the bill
    const { rows: [bill] } = await pool.query(
      `SELECT * FROM patient_bills WHERE id = $1 AND active = true`, [billId]
    );
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    // Get reporter
    const { rows: [rep] } = await pool.query(
      `SELECT id, radiologist_code FROM radiologist_master WHERE id = $1`, [reporter_radiologist_id]
    );
    if (!rep) return res.status(404).json({ error: 'Reporter not found' });

    // Resolve study_code from bill_items (which always has study_code set at billing time)
    const { rows: [biRow] } = await pool.query(
      `SELECT study_code FROM bill_items WHERE bill_id = $1 AND study_code IS NOT NULL AND active = true LIMIT 1`,
      [billId]
    );
    const resolvedStudyCode = biRow?.study_code || null;

    // Find or auto-create a studies row for this bill
    let studyId = bill.study_id;
    if (!studyId) {
      const { rows: [newStudy] } = await pool.query(
        `INSERT INTO studies
           (patient_id, center_id, payment_status, exam_workflow_status,
            study_code, accession_number, active, created_at, updated_at)
         VALUES ($1, $2, 'PAID', 'EXAM_SCHEDULED',
                 $3, $4, true, NOW(), NOW())
         RETURNING id`,
        [bill.patient_id, bill.center_id, resolvedStudyCode, bill.accession_number || null]
      );
      studyId = newStudy.id;
      await pool.query(`UPDATE patient_bills SET study_id = $1 WHERE id = $2`, [studyId, billId]);
    }

    // Check current status; also patch study_code if it was never set
    const { rows: [study] } = await pool.query(
      `SELECT exam_workflow_status, study_code FROM studies WHERE id = $1`, [studyId]
    );
    if (study?.exam_workflow_status === 'REPORT_COMPLETED')
      return res.status(400).json({ error: 'Report already completed' });

    await pool.query(
      `UPDATE studies
       SET exam_workflow_status    = 'EXAM_COMPLETED',
           reporter_radiologist_id = $1,
           rate_snapshot           = $2,
           radiologist_code        = $3,
           reporting_rate          = $2,
           study_code              = COALESCE(study_code, $5),
           updated_at              = NOW()
       WHERE id = $4`,
      [reporter_radiologist_id, rate_snapshot || null, rep.radiologist_code, studyId, resolvedStudyCode]
    );

    logger.info('Exam completed + reporter assigned', { bill_id: billId, study_id: studyId, reporter_radiologist_id });
    res.json({ success: true, message: 'Exam completed and reporter assigned' });
  } catch (e) {
    logger.error('Exam-complete PUT:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rad-reporting/:id/report-complete
// :id is bill_id. Mark report done → auto-generate reporting payable JE.
router.put('/:id/report-complete', async (req, res) => {
  try {
    const { report_notes } = req.body;
    const billId = parseInt(req.params.id, 10);

    // Get the linked study via bill
    const { rows: [bill] } = await pool.query(
      `SELECT study_id FROM patient_bills WHERE id = $1 AND active = true`, [billId]
    );
    if (!bill?.study_id) return res.status(404).json({ error: 'No study linked to this bill. Complete exam first.' });

    const { rows: [study] } = await pool.query(
      `SELECT s.*, sm.modality FROM studies s
       LEFT JOIN study_master sm ON sm.study_code = s.study_code
       WHERE s.id = $1 AND s.active = true`, [bill.study_id]
    );
    if (!study) return res.status(404).json({ error: 'Study not found' });
    if (study.exam_workflow_status !== 'EXAM_COMPLETED')
      return res.status(400).json({ error: 'Exam must be completed before marking report done' });
    if (!study.radiologist_code)
      return res.status(400).json({ error: 'No reporter assigned to this study' });
    if (study.reporting_posted_at)
      return res.status(409).json({ error: 'Reporting payout already posted' });

    // Update study
    const now = new Date();
    await pool.query(
      `UPDATE studies
       SET exam_workflow_status = 'REPORT_COMPLETED',
           report_status = 'COMPLETED',
           report_date = $1,
           notes = COALESCE($2, notes),
           updated_at = NOW()
       WHERE id = $3 AND active = true`,
      [now, report_notes || null, req.params.id]
    );

    // Re-fetch for finance posting
    const { rows: [updated] } = await pool.query(
      'SELECT * FROM studies WHERE id = $1', [req.params.id]
    );

    // Fire reporting payout JE
    setImmediate(async () => {
      try {
        await financeService.postReportingPayoutJE(
          {
            id:               updated.id,
            study_code:       updated.study_code,
            center_id:        updated.center_id,
            radiologist_code: updated.radiologist_code,
            report_date:      updated.report_date || now,
            accession_number: updated.accession_number,
          },
          req.user?.id
        );
        logger.info('Reporting payout JE posted', { study_id: req.params.id });
      } catch (jeErr) {
        logger.error('Reporting payout JE failed:', { study_id: req.params.id, error: jeErr.message });
      }
    });

    logger.info('Report completed', { study_id: req.params.id });
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
