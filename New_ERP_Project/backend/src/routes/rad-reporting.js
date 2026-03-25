const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('RADIOLOGY_REPORT_VIEW'));

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

    const billConds = ["pb.payment_status = 'PAID'", "pb.active = true"];
    const params = [];

    if (center_id) { params.push(center_id); billConds.push(`pb.center_id = $${params.length}`); }

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
         COALESCE(
           sd.study_name,
           (SELECT STRING_AGG(COALESCE(sd2.study_name, bi.study_name), ', ' ORDER BY bi.id)
            FROM bill_items bi
            LEFT JOIN study_definitions sd2 ON sd2.study_code = bi.study_code AND sd2.active = true
            WHERE bi.bill_id = pb.id AND bi.active = true AND bi.item_type = 'STUDY'),
           pb.notes,
           pb.invoice_number
         )                                                        AS study_name,
         COALESCE(
           sd.modality,
           (SELECT COALESCE(sd2.modality, bi.modality)
            FROM bill_items bi
            LEFT JOIN study_definitions sd2 ON sd2.study_code = bi.study_code AND sd2.active = true
            WHERE bi.bill_id = pb.id AND bi.active = true AND bi.item_type = 'STUDY' LIMIT 1)
         )                                                        AS modality,
         COALESCE(
           sd.id,
           (SELECT sd2.id FROM bill_items bi
            JOIN study_definitions sd2 ON sd2.study_code = bi.study_code AND sd2.active = true
            WHERE bi.bill_id = pb.id AND bi.active = true LIMIT 1)
         )                                                         AS study_definition_id,
         c.name                                                   AS center_name,
         rm.radiologist_name                                      AS reporter_name,
         rm.reporter_type                                         AS reporter_type
       FROM patient_bills pb
       LEFT JOIN patients p            ON p.id::text = pb.patient_id::text
       LEFT JOIN studies s             ON s.id = pb.study_id AND s.active = true
       LEFT JOIN study_definitions sd  ON sd.study_code = s.study_code AND sd.active = true
       LEFT JOIN centers c             ON c.id = pb.center_id
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

// GET /api/rad-reporting/reporters?study_id=  (study_id is bill_id)
// Returns reporters with total_rate = sum of rates for ALL studies in the bill
router.get('/reporters', async (req, res) => {
  try {
    const { study_id } = req.query;

    const { rows } = await pool.query(
      `SELECT id, radiologist_code, radiologist_name AS name, reporter_type AS type, specialty
       FROM radiologist_master WHERE active = true ORDER BY reporter_type, radiologist_name`
    );

    if (!study_id) {
      return res.json({ success: true, reporters: [] });
    }

    // Sum rates across ALL studies in the bill for each reporter
    // Only returns reporters who have rates configured for at least one study in this bill
    const { rows: rateRows } = await pool.query(
      `SELECT
         rsr.radiologist_id,
         SUM(rsr.rate)      AS total_rate,
         COUNT(bi.id)       AS study_count
       FROM bill_items bi
       JOIN study_definitions sd ON sd.study_code = bi.study_code AND sd.active = true
       JOIN radiologist_study_rates rsr
         ON rsr.study_id = sd.id
        AND (rsr.effective_to IS NULL OR rsr.effective_to >= CURRENT_DATE)
       WHERE bi.bill_id = $1 AND bi.item_type = 'STUDY'
       GROUP BY rsr.radiologist_id
       HAVING SUM(rsr.rate) > 0`,
      [study_id]
    );

    const rateMap = Object.fromEntries(
      rateRows.map(r => [r.radiologist_id, { total_rate: parseFloat(r.total_rate), study_count: parseInt(r.study_count) }])
    );

    // Only include reporters who have at least one rate for studies in this bill
    const reporters = rows
      .filter(r => rateMap[r.id])
      .map(r => ({
        id: r.id, code: r.radiologist_code, name: r.name, type: r.type, specialty: r.specialty,
        total_rate: rateMap[r.id].total_rate,
        study_count: rateMap[r.id].study_count,
      }));

    res.json({ success: true, reporters });
  } catch (e) {
    logger.error('Reporters GET:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rad-reporting/:id/exam-complete  (:id is bill_id)
// Body: { reporter_radiologist_id, rate_snapshot, consumables: [{item_master_id, qty_used}] }
// Actions: assign reporter + process consumables (stock out + GL) + status → EXAM_COMPLETED
router.put('/:id/exam-complete', async (req, res) => {
  const { reporter_radiologist_id, rate_snapshot, consumables = [] } = req.body;
  if (!reporter_radiologist_id) return res.status(400).json({ error: 'Reporter is required' });

  const billId = parseInt(req.params.id, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch bill
    const { rows: [bill] } = await client.query(
      `SELECT * FROM patient_bills WHERE id = $1 AND active = true`, [billId]
    );
    if (!bill) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bill not found' }); }

    // Fetch reporter
    const { rows: [rep] } = await client.query(
      `SELECT id, radiologist_code, radiologist_name, reporter_type FROM radiologist_master WHERE id = $1`, [reporter_radiologist_id]
    );
    if (!rep) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Reporter not found' }); }

    // Find or auto-create studies row
    let studyId = bill.study_id;
    if (!studyId) {
      const { rows: [newStudy] } = await client.query(
        `INSERT INTO studies
           (id, patient_id, center_id, payment_status, exam_workflow_status,
            accession_number, active, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, 'PAID', 'EXAM_SCHEDULED', $3, true, NOW(), NOW())
         RETURNING id`,
        [bill.patient_id, bill.center_id, bill.accession_number || null]
      );
      studyId = newStudy.id;
      await client.query(`UPDATE patient_bills SET study_id = $1 WHERE id = $2`, [studyId, billId]);
    }

    const { rows: [curStudy] } = await client.query(
      `SELECT exam_workflow_status FROM studies WHERE id = $1`, [studyId]
    );
    if (curStudy?.exam_workflow_status === 'REPORT_COMPLETED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Report already completed' });
    }

    // Compute total reporting rate = sum of rates for all studies in the bill
    const { rows: [rateSum] } = await client.query(
      `SELECT COALESCE(SUM(rsr.rate), 0) AS total_rate
       FROM bill_items bi
       JOIN study_definitions sd ON sd.study_code = bi.study_code AND sd.active = true
       JOIN radiologist_study_rates rsr
         ON rsr.radiologist_id = $1 AND rsr.study_id = sd.id
        AND (rsr.effective_to IS NULL OR rsr.effective_to >= CURRENT_DATE)
       WHERE bi.bill_id = $2`,
      [reporter_radiologist_id, billId]
    );
    const totalRate = parseFloat(rateSum.total_rate) || parseFloat(rate_snapshot) || null;

    // Update status + assign reporter
    await client.query(
      `UPDATE studies
       SET exam_workflow_status    = 'EXAM_COMPLETED',
           reporter_radiologist_id = $1,
           rate_snapshot           = $2,
           radiologist_code        = $3,
           reporting_rate          = $2,
           updated_at              = NOW()
       WHERE id = $4`,
      [reporter_radiologist_id, totalRate, rep.radiologist_code, studyId]
    );

    // Process consumables: stock out + GL + bill_consumables record
    for (const c of consumables) {
      const qty = parseInt(c.qty_used) || 0;
      if (qty <= 0) continue;
      const itemId = parseInt(c.item_master_id, 10);

      const { rows: [item] } = await client.query(
        `SELECT im.*, ic.expense_gl_id, ic.asset_gl_id
         FROM item_master im
         LEFT JOIN item_categories ic ON ic.id = im.category_id
         WHERE im.id = $1 AND im.active = true`, [itemId]
      );
      if (!item) { logger.warn(`exam-complete: item ${itemId} not found — skipping`); continue; }
      const unitCost = parseFloat(item.standard_rate || 0);

      const { rows: [mov] } = await client.query(
        `INSERT INTO inventory_movements
           (movement_number, item_id, center_id, movement_type, reference_type,
            reference_number, quantity, unit_cost, current_stock, notes, bill_id)
         VALUES ('', $1, $2, 'STOCK_OUT', 'CONSUMABLE', $3, $4, $5,
                 (SELECT COALESCE(current_stock,0) - $4 FROM item_master WHERE id=$1),
                 $6, $7)
         RETURNING *`,
        [itemId, bill.center_id, `CONS-B${billId}-${itemId}`, qty, unitCost,
         `Consumed for bill ${billId}`, billId]
      );

      await client.query(
        `UPDATE item_master SET current_stock = COALESCE(current_stock,0) - $1, updated_at=NOW() WHERE id=$2`,
        [qty, itemId]
      );

      let jeId = null;
      if (unitCost > 0) {
        try {
          const je = await financeService.postStockIssueJE(
            item, qty, unitCost,
            { id: mov.id, movement_number: mov.movement_number, center_id: bill.center_id, movement_date: bill.bill_date || new Date() },
            req.user?.id, client
          );
          if (je) {
            jeId = je.id;
            await client.query(`UPDATE inventory_movements SET journal_entry_id=$1 WHERE id=$2`, [je.id, mov.id]);
          }
        } catch (jeErr) {
          logger.error(`exam-complete: consumable JE failed item ${itemId}:`, jeErr.message);
        }
      }

      await client.query(
        `INSERT INTO bill_consumables (bill_id, item_master_id, qty_used, unit_cost, movement_id, journal_entry_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (bill_id, item_master_id) DO UPDATE
           SET qty_used=$3, unit_cost=$4, movement_id=$5, journal_entry_id=$6, updated_at=NOW()`,
        [billId, itemId, qty, unitCost, mov.id, jeId, null]
      );
    }

    await client.query('COMMIT');

    logger.info('Exam completed', { bill_id: billId, study_id: studyId, reporter_radiologist_id, consumables: consumables.length });
    res.json({ success: true, message: 'Exam completed — consumables posted to GL' });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Exam-complete PUT:', e);
    res.status(500).json({ error: 'Internal server error', detail: e.message });
  } finally {
    client.release();
  }
});

// PUT /api/rad-reporting/:id/report-complete  (:id is bill_id)
// Marks report done → creates reporter AP bill (RAD-BILL-…) + posts DR expense / CR AP
router.put('/:id/report-complete', async (req, res) => {
  try {
    const { report_notes } = req.body;
    const billId = parseInt(req.params.id, 10);

    const { rows: [bill] } = await pool.query(
      `SELECT * FROM patient_bills WHERE id = $1 AND active = true`, [billId]
    );
    if (!bill?.study_id) return res.status(404).json({ error: 'No study linked. Complete exam first.' });

    const { rows: [study] } = await pool.query(
      `SELECT s.*, rm.radiologist_name, rm.gst_number AS reporter_gst_number,
              CASE WHEN rm.type = 'TELERADIOLOGY_COMPANY' OR rm.reporter_type = 'TELERADIOLOGY'
                   THEN 'TELERADIOLOGY' ELSE COALESCE(rm.reporter_type, 'RADIOLOGIST') END AS reporter_type
       FROM studies s
       LEFT JOIN radiologist_master rm ON rm.id = s.reporter_radiologist_id
       WHERE s.id = $1 AND s.active = true`, [bill.study_id]
    );
    if (!study) return res.status(404).json({ error: 'Study not found' });
    if (study.exam_workflow_status !== 'EXAM_COMPLETED')
      return res.status(400).json({ error: 'Exam must be completed before marking report done' });
    if (!study.radiologist_code)
      return res.status(400).json({ error: 'No reporter assigned to this study' });

    await pool.query(
      `UPDATE studies
       SET exam_workflow_status = 'REPORT_COMPLETED',
           report_status        = 'COMPLETED',
           report_date          = NOW(),
           notes                = COALESCE($1, notes),
           updated_at           = NOW()
       WHERE id = $2 AND active = true`,
      [report_notes || null, bill.study_id]
    );

    // Post reporter AP bill — blocking so a failure rolls back the whole operation
    const rate = parseFloat(study.rate_snapshot || study.reporting_rate || 0);
    if (rate > 0) {
      const reporter = {
        id:               study.reporter_radiologist_id,
        radiologist_code: study.radiologist_code,
        radiologist_name: study.radiologist_name,
        reporter_type:    study.reporter_type,
        gst_number:       study.reporter_gst_number || null,
      };
      const jeResult = await financeService.postReporterPayableJE(
        { reporter, rate, bill, studyId: bill.study_id, examDate: new Date() },
        req.user?.id
      );
      if (!jeResult) {
        // Revert study status so the user can retry
        await pool.query(
          `UPDATE studies SET exam_workflow_status='EXAM_COMPLETED', report_status='PENDING',
           report_date=NULL, updated_at=NOW() WHERE id=$1`,
          [bill.study_id]
        );
        return res.status(500).json({ error: 'Failed to post reporter AP entry — report not completed. Please retry.' });
      }
      logger.info('Reporter AP bill posted', { bill_id: billId, reporter: study.radiologist_code, rate, je_id: jeResult.je_id });
    }

    logger.info('Report completed', { bill_id: billId, study_id: bill.study_id });
    res.json({ success: true, message: 'Report completed' });
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
