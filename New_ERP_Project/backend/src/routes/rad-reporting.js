const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('RADIOLOGY_REPORT', 'RADIOLOGY_VIEW'));

// GET /api/rad-reporting/studies  — active studies from study_definitions
router.get('/studies', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, study_code, study_name, modality, is_contrast_study AS is_contrast
      FROM study_definitions
      WHERE active = true AND modality IN ('CT','MRI','XRAY','ULTRASOUND','MAMMOGRAPHY')
      ORDER BY modality, study_name
    `);
    res.json({ success: true, studies: result.rows });
  } catch (err) {
    logger.error('Get studies for rad-reporting error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rad-reporting
router.get('/', async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;
    const where = active_only === 'true' ? 'WHERE r.active = true' : '';
    const result = await pool.query(`
      SELECT r.id, r.radiologist_code, r.reporter_type,
             r.radiologist_name, r.first_name, r.last_name,
             r.specialty, r.contact_phone, r.contact_email, r.address,
             r.vendor_code, r.pan_number, r.bank_account_number, r.bank_name,
             r.ifsc_code, r.upi_id, r.tds_rate, r.status, r.active, r.created_at, r.updated_at,
             COALESCE(
               json_agg(
                 json_build_object(
                   'study_id',   s.study_id,
                   'study_name', sd.study_name,
                   'rate',       s.rate,
                   'is_contrast', sd.is_contrast_study,
                   'modality',   sd.modality
                 ) ORDER BY sd.study_name
               ) FILTER (WHERE s.id IS NOT NULL),
               '[]'::json
             ) AS study_rates
      FROM radiologist_master r
      LEFT JOIN radiologist_study_rates s ON s.radiologist_id = r.id
      LEFT JOIN study_definitions sd ON sd.id = s.study_id
      ${where}
      GROUP BY r.id
      ORDER BY r.reporter_type, r.radiologist_name
    `);
    res.json({ success: true, reporters: result.rows.map(_format) });
  } catch (err) {
    logger.error('Get rad-reporting error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const validators = [
  body('reporter_type').isIn(['RADIOLOGIST', 'TELERADIOLOGY']).withMessage('Reporter type is required'),
  body('first_name').if(body('reporter_type').equals('RADIOLOGIST'))
    .trim().isLength({ min: 1, max: 100 }).withMessage('First name is required'),
  body('last_name').if(body('reporter_type').equals('RADIOLOGIST'))
    .trim().isLength({ min: 1, max: 100 }).withMessage('Last name is required'),
  body('name').if(body('reporter_type').equals('TELERADIOLOGY'))
    .trim().isLength({ min: 2, max: 200 }).withMessage('Company name is required'),
  body('contact_phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
  body('contact_email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('address').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  body('status').optional().isIn(['active', 'inactive']),
  body('study_rates').optional().isArray(),
  body('study_rates.*.study_id').optional().isInt({ min: 1 }),
  body('study_rates.*.rate').optional().isFloat({ min: 0 }).toFloat(),
];

// POST /api/rad-reporting
router.post('/', validators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      reporter_type,
      first_name = '', last_name = '', name = '',
      contact_phone = null, contact_email = null,
      address = null, status = 'active',
      study_rates = [],
    } = req.body;

    const active = status !== 'inactive';
    const fullName = reporter_type === 'RADIOLOGIST'
      ? `${first_name} ${last_name}`.trim()
      : name;

    // Check for duplicate name
    const dupCheck = await client.query(
      `SELECT id FROM radiologist_master WHERE LOWER(radiologist_name) = LOWER($1) AND reporter_type = $2`,
      [fullName, reporter_type]
    );
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `${reporter_type === 'TELERADIOLOGY' ? 'Company' : 'Radiologist'} "${fullName}" already exists` });
    }

    // Auto-generate code
    const prefix = reporter_type === 'TELERADIOLOGY' ? 'TELE' : 'RAD';
    const seqRes = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(radiologist_code FROM ${prefix.length + 1}) AS INTEGER)), 0) + 1 AS next
       FROM radiologist_master WHERE radiologist_code ~ $1`,
      [`^${prefix}[0-9]+$`]
    );
    const code = `${prefix}${String(seqRes.rows[0].next).padStart(3, '0')}`;

    const {
      vendor_code = null, pan_number = null, bank_account_number = null,
      bank_name = null, ifsc_code = null, upi_id = null, tds_rate = 10,
    } = req.body;
    const result = await client.query(`
      INSERT INTO radiologist_master
        (radiologist_code, radiologist_name, first_name, last_name,
         specialty, reporter_type, contract_type,
         contact_phone, contact_email, address,
         per_study_rate, credit_days, status, active,
         vendor_code, pan_number, bank_account_number, bank_name, ifsc_code, upi_id, tds_rate,
         created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'PER_STUDY',$7,$8,$9,0,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
      RETURNING *
    `, [code, fullName, reporter_type === 'RADIOLOGIST' ? first_name : name,
        reporter_type === 'RADIOLOGIST' ? last_name : '',
        reporter_type === 'TELERADIOLOGY' ? 'Teleradiology' : 'Radiology',
        reporter_type, contact_phone, contact_email, address,
        parseInt(req.body.credit_days) || 30, status, active,
        vendor_code || null, pan_number || null, bank_account_number || null,
        bank_name || null, ifsc_code || null, upi_id || null, parseFloat(tds_rate) || 10]);

    const newId = result.rows[0].id;

    // Insert study rates
    for (const sr of study_rates) {
      const study = await client.query('SELECT study_name FROM study_definitions WHERE id=$1', [sr.study_id]);
      if (study.rows.length) {
        await client.query(
          `INSERT INTO radiologist_study_rates (radiologist_id, study_id, study_name, rate)
           VALUES ($1,$2,$3,$4)`,
          [newId, sr.study_id, study.rows[0].study_name, sr.rate || 0]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch with study rates for response
    const full = await _fetchOne(newId);
    logger.info('RAD reporter created', { code, reporter_type });
    res.status(201).json({ success: true, reporter: full });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Code already exists' });
    logger.error('Create rad-reporting error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// GET /api/rad-reporting/payouts  — reporter AP bills (payables)
router.get('/payouts', async (req, res) => {
  try {
    const { status } = req.query;
    const conds = ["p.payable_number LIKE 'RAD-BILL-%'", "p.active = true"];
    const params = [];
    if (status) { params.push(status); conds.push(`p.status = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT
         p.id, p.payable_number, p.amount, p.balance_amount,
         p.paid_amount, p.due_date, p.status, p.notes, p.created_at,
         rm.radiologist_name AS reporter_name,
         rm.radiologist_code AS reporter_code,
         rm.reporter_type
       FROM payables p
       LEFT JOIN radiologist_master rm ON rm.id = p.reporter_id
       WHERE ${conds.join(' AND ')}
       ORDER BY p.created_at DESC`
    , params);

    const totals = rows.reduce((acc, r) => {
      acc.total_amount    += parseFloat(r.amount);
      acc.total_pending   += r.status === 'PENDING' ? parseFloat(r.balance_amount) : 0;
      acc.total_paid      += parseFloat(r.paid_amount || 0);
      return acc;
    }, { total_amount: 0, total_pending: 0, total_paid: 0 });

    res.json({ success: true, payouts: rows, totals });
  } catch (e) {
    logger.error('Payouts GET:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rad-reporting/study-costs?from=&to=&center_id=&status=
router.get('/study-costs', async (req, res) => {
  try {
    const { from, to, center_id, status } = req.query;
    const conds = ['1=1'];
    const params = [];

    if (from)      { params.push(from);      conds.push(`bill_date >= $${params.length}`); }
    if (to)        { params.push(to);         conds.push(`bill_date <= $${params.length}`); }
    if (center_id) { params.push(center_id);  conds.push(`center_id = $${params.length}`); }
    if (status)    { params.push(status);     conds.push(`exam_status = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT *,
         ROUND((net_revenue - consumables_cost - reporter_cost)::numeric, 2) AS gross_margin,
         CASE WHEN net_revenue > 0
           THEN ROUND(((net_revenue - consumables_cost - reporter_cost) / net_revenue * 100)::numeric, 1)
           ELSE 0 END AS margin_pct
       FROM v_study_cost_summary
       WHERE ${conds.join(' AND ')}
       ORDER BY bill_date DESC`,
      params
    );

    const totals = rows.reduce((acc, r) => {
      acc.total_revenue    += parseFloat(r.net_revenue    || 0);
      acc.total_consumables+= parseFloat(r.consumables_cost || 0);
      acc.total_reporter   += parseFloat(r.reporter_cost  || 0);
      acc.total_margin     += parseFloat(r.gross_margin   || 0);
      return acc;
    }, { total_revenue: 0, total_consumables: 0, total_reporter: 0, total_margin: 0 });

    res.json({ success: true, studies: rows, totals });
  } catch (e) {
    logger.error('study-costs GET:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rad-reporting/worklist?exam_workflow_status=&center_id=
// Returns PAID bills as study workflow items
router.get('/worklist', async (req, res) => {
  try {
    const { exam_workflow_status, center_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conds  = ["pb.payment_status = 'PAID'", 'pb.active = true', 'bi.active = true', "bi.item_type = 'STUDY'"];
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
         s.id                                                         AS study_id,
         s.radiologist_code,
         s.reporting_rate,
         s.report_date,
         s.reporting_posted_at,
         p.name                                                       AS patient_name,
         p.phone                                                      AS patient_phone,
         p.id                                                         AS patient_id,
         c.name                                                       AS center_name,
         rm.radiologist_name                                          AS reporter_name,
         rm.reporter_type                                             AS reporter_type
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
       LEFT JOIN study_master sm ON sm.study_code = bi.study_code AND sm.active = true
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
// Returns all active reporters with their applicable rate for the given bill_item's study.
router.get('/reporters', async (req, res) => {
  try {
    const { bill_item_id, study_id } = req.query;
    let studyDefinitionId = null;
    let modality = null;

    if (bill_item_id) {
      const { rows: [bi] } = await pool.query(
        `SELECT bi.modality, sm.study_definition_id
         FROM bill_items bi
         LEFT JOIN study_master sm ON sm.study_code = bi.study_code AND sm.active = true
         WHERE bi.id = $1`, [bill_item_id]
      );
      if (bi) { modality = bi.modality; studyDefinitionId = bi.study_definition_id; }
    } else if (study_id) {
      // Legacy fallback: study_id was actually bill_id
      const { rows: [bi] } = await pool.query(
        `SELECT bi.modality, sm.study_definition_id
         FROM bill_items bi
         LEFT JOIN study_master sm ON sm.study_code = bi.study_code AND sm.active = true
         WHERE bi.bill_id = $1 AND bi.item_type = 'STUDY' LIMIT 1`, [study_id]
      );
      if (bi) { modality = bi.modality; studyDefinitionId = bi.study_definition_id; }
    }

    // Build rate map from radiologist_study_rates for this study definition
    let rateMap = {};
    if (studyDefinitionId) {
      const { rows: rateRows } = await pool.query(
        `SELECT radiologist_id, rate FROM radiologist_study_rates
         WHERE study_id = $1
           AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
         ORDER BY effective_from DESC`,
        [studyDefinitionId]
      );
      // First matching rate per radiologist wins (most recent effective_from)
      for (const r of rateRows) {
        if (!(r.radiologist_id in rateMap)) rateMap[r.radiologist_id] = parseFloat(r.rate);
      }
    }

    // Per-modality fallback column map
    const modalityCol = {
      CT: 'rate_ct', MRI: 'rate_mri', XRAY: 'rate_xray',
      ULTRASOUND: 'rate_usg', MAMMOGRAPHY: 'rate_mammo', FLUORO: 'rate_fluoro',
    };
    const fallbackCol = modality ? modalityCol[modality] : null;

    const { rows } = await pool.query(
      `SELECT id, radiologist_code, radiologist_name AS name, reporter_type AS type, specialty,
              rate_ct, rate_mri, rate_xray, rate_usg, rate_mammo, rate_fluoro
       FROM radiologist_master WHERE active = true ORDER BY reporter_type, radiologist_name`
    );

    const reporters = rows
      .map(r => {
        let total_rate = rateMap[r.id] ?? null;
        if (total_rate === null && fallbackCol) total_rate = parseFloat(r[fallbackCol]) || null;
        return {
          id: r.id, code: r.radiologist_code, name: r.name,
          type: r.type, specialty: r.specialty, total_rate, study_count: 1,
        };
      })
      .filter(r => r.total_rate !== null && r.total_rate > 0);

    res.json({ success: true, reporters });
  } catch (e) {
    logger.error('Reporters GET:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rad-reporting/:id/exam-complete
// :id is bill_item_id. Marks the individual study exam done + assigns reporter.
// Consumables are saved separately via POST /api/bill-consumables/save.
router.put('/:id/exam-complete', async (req, res) => {
  try {
    const { reporter_radiologist_id, rate_snapshot } = req.body;
    if (!reporter_radiologist_id) return res.status(400).json({ error: 'Reporter is required' });

    const billItemId = parseInt(req.params.id, 10);

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
           (id, patient_id, center_id, payment_status, exam_workflow_status,
            study_code, accession_number, bill_item_id, active, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, 'PAID', 'EXAM_SCHEDULED',
                 (SELECT study_code FROM study_master WHERE study_code = $3 AND active = true LIMIT 1),
                 $4, $5, true, NOW(), NOW())
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
           study_code              = COALESCE(study_code, (SELECT study_code FROM study_master WHERE study_code = $4 AND active = true LIMIT 1)),
           updated_at              = NOW()
       WHERE id = $5`,
      [reporter_radiologist_id, rate_snapshot || null, rep.radiologist_code, bi.study_code, study.id]
    );

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
            rate_snapshot:    study.rate_snapshot,
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

// PUT /api/rad-reporting/:id
router.put('/:id', validators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      reporter_type,
      first_name = '', last_name = '', name = '',
      contact_phone = null, contact_email = null,
      address = null, status = 'active',
      study_rates = [],
    } = req.body;

    const active = status !== 'inactive';
    const fullName = reporter_type === 'RADIOLOGIST'
      ? `${first_name} ${last_name}`.trim()
      : name;

    const {
      vendor_code = null, pan_number = null, bank_account_number = null,
      bank_name = null, ifsc_code = null, upi_id = null, tds_rate = 10,
    } = req.body;
    const result = await client.query(`
      UPDATE radiologist_master
      SET radiologist_name=$1, first_name=$2, last_name=$3,
          reporter_type=$4, contact_phone=$5, contact_email=$6, address=$7,
          credit_days=$8, status=$9, active=$10,
          vendor_code=$11, pan_number=$12, bank_account_number=$13,
          bank_name=$14, ifsc_code=$15, upi_id=$16, tds_rate=$17, updated_at=NOW()
      WHERE id=$18
      RETURNING *
    `, [fullName, reporter_type === 'RADIOLOGIST' ? first_name : name,
        reporter_type === 'RADIOLOGIST' ? last_name : '',
        reporter_type, contact_phone, contact_email, address,
        parseInt(req.body.credit_days) || 30, status, active,
        vendor_code || null, pan_number || null, bank_account_number || null,
        bank_name || null, ifsc_code || null, upi_id || null, parseFloat(tds_rate) || 10,
        id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reporter not found' });
    }

    // Replace study rates
    await client.query('DELETE FROM radiologist_study_rates WHERE radiologist_id=$1', [id]);
    for (const sr of study_rates) {
      const study = await client.query('SELECT study_name FROM study_definitions WHERE id=$1', [sr.study_id]);
      if (study.rows.length) {
        await client.query(
          `INSERT INTO radiologist_study_rates (radiologist_id, study_id, study_name, rate)
           VALUES ($1,$2,$3,$4)`,
          [id, sr.study_id, study.rows[0].study_name, sr.rate || 0]
        );
      }
    }

    await client.query('COMMIT');

    const full = await _fetchOne(parseInt(id));
    logger.info('RAD reporter updated', { id });
    res.json({ success: true, reporter: full });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Update rad-reporting error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/rad-reporting/:id  (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE radiologist_master SET active=false, status='inactive', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reporter not found' });
    logger.info('RAD reporter deleted', { id });
    res.json({ success: true });
  } catch (err) {
    logger.error('Delete rad-reporting error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: fetch one reporter with study rates
async function _fetchOne(id) {
  const r = await pool.query(`
    SELECT r.id, r.radiologist_code, r.reporter_type,
           r.radiologist_name, r.first_name, r.last_name,
           r.specialty, r.contact_phone, r.contact_email, r.address,
           r.vendor_code, r.pan_number, r.bank_account_number, r.bank_name,
           r.ifsc_code, r.upi_id, r.tds_rate, r.credit_days, r.status, r.active,
           COALESCE(
             json_agg(
               json_build_object('study_id', s.study_id, 'study_name', sd.study_name, 'rate', s.rate, 'is_contrast', sd.is_contrast_study, 'modality', sd.modality)
               ORDER BY sd.study_name
             ) FILTER (WHERE s.id IS NOT NULL),
             '[]'::json
           ) AS study_rates
    FROM radiologist_master r
    LEFT JOIN radiologist_study_rates s ON s.radiologist_id = r.id
    LEFT JOIN study_definitions sd ON sd.id = s.study_id
    WHERE r.id = $1
    GROUP BY r.id
  `, [id]);
  return _format(r.rows[0]);
}

// Map DB row to frontend-friendly shape
function _format(row) {
  return {
    id:               row.id,
    radiologist_code: row.radiologist_code,
    reporter_type:    row.reporter_type,
    name:             row.radiologist_name,
    first_name:       row.first_name || '',
    last_name:        row.last_name  || '',
    specialty:        row.specialty,
    contact_phone:    row.contact_phone,
    contact_email:    row.contact_email,
    address:          row.address,
    vendor_code:          row.vendor_code          || null,
    pan_number:           row.pan_number           || null,
    bank_account_number:  row.bank_account_number  || null,
    bank_name:            row.bank_name            || null,
    ifsc_code:            row.ifsc_code            || null,
    upi_id:               row.upi_id               || null,
    tds_rate:             row.tds_rate             ?? 10,
    credit_days:          row.credit_days          ?? 30,
    study_rates:          Array.isArray(row.study_rates) ? row.study_rates : (row.study_rates || []),
    status:               row.status,
    active:               row.active,
  };
}

module.exports = router;
