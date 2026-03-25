const express = require('express');
const { body, validationResult } = require('express-validator');
const pool   = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('ASSET_MAINTENANCE_VIEW'));

const CONTRACT_TYPES  = ['AMC','CMC','SLA','CMS','WARRANTY','EXTENDED_WARRANTY','CALIBRATION'];
const MAINT_TYPES     = ['PREVENTIVE','CORRECTIVE','BREAKDOWN','CALIBRATION','INSPECTION','UPGRADE'];
const MAINT_STATUSES  = ['OPEN','IN_PROGRESS','COMPLETED','CANCELLED'];

// ── Auto-create a Draft PR for spare parts used in a maintenance log ──────────
async function createSparePartsDraftPR(logId, assetId, userId, maintType) {
  try {
    const parts = await pool.query(
      `SELECT part_code, part_name, quantity, unit_cost, gst_rate, item_master_id
         FROM asset_maintenance_parts WHERE maintenance_log_id = $1`, [logId]
    );
    if (!parts.rows.length) return;

    const asset = await pool.query(
      `SELECT asset_name, asset_code, center_id FROM asset_master WHERE id = $1`, [assetId]
    );
    if (!asset.rows.length) return;
    const { asset_name, asset_code, center_id } = asset.rows[0];

    const prNumRes = await pool.query('SELECT generate_pr_number()');
    const pr_number = prNumRes.rows[0].generate_pr_number;

    const total = parts.rows.reduce(
      (s, p) => s + parseFloat(p.quantity) * parseFloat(p.unit_cost || 0), 0
    );

    const prRes = await pool.query(
      `INSERT INTO purchase_requisitions
         (pr_number, title, justification, center_id, requested_by,
          department, priority, total_estimated, status)
       VALUES ($1,$2,$3,$4,$5,'Maintenance',  'NORMAL',$6,'DRAFT') RETURNING id`,
      [
        pr_number,
        `Spare Parts Replenishment — ${asset_name} (${asset_code})`,
        `Auto-generated from ${maintType} maintenance log #${logId} for asset ${asset_code}. Please review and submit for approval.`,
        center_id,
        userId,
        total,
      ]
    );
    const prId = prRes.rows[0].id;

    for (const p of parts.rows) {
      const amt = parseFloat(p.quantity) * parseFloat(p.unit_cost || 0);
      await pool.query(
        `INSERT INTO pr_items
           (pr_id, item_master_id, item_code, item_name, category, uom, quantity, estimated_rate, estimated_amount)
         VALUES ($1,$2,$3,$4,'Spare Part','PCS',$5,$6,$7)`,
        [prId, p.item_master_id || null, p.part_code || null,
         p.part_name, p.quantity, p.unit_cost || 0, amt]
      );
    }

    logger.info(`Draft PR ${pr_number} created from maintenance log ${logId}`);
  } catch (e) {
    // Non-fatal — log error but don't fail the maintenance save
    logger.error('Failed to auto-create spare parts PR:', e);
  }
}

// ── GET /api/asset-maintenance/assets ────────────────────────────────────────
// All assets with lifecycle cost summary
router.get('/assets', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM asset_lifecycle_cost_view ORDER BY asset_code`
    );
    res.json({ success: true, assets: result.rows });
  } catch (err) {
    logger.error('Asset maintenance assets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/asset-maintenance/:assetId/overview ──────────────────────────────
router.get('/:assetId/overview', async (req, res) => {
  try {
    const { assetId } = req.params;
    const [assetRes, contractRes] = await Promise.all([
      pool.query(`SELECT * FROM asset_lifecycle_cost_view WHERE asset_id = $1`, [assetId]),
      pool.query(
        `SELECT *,
           CASE
             WHEN end_date < CURRENT_DATE             THEN 'EXPIRED'
             WHEN end_date <= CURRENT_DATE + 30       THEN 'EXPIRING_SOON'
             ELSE 'ACTIVE'
           END AS computed_status
         FROM asset_maintenance_contracts
         WHERE asset_id = $1 AND active = true
         ORDER BY end_date DESC`,
        [assetId]
      ),
    ]);
    if (!assetRes.rows.length) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true, overview: assetRes.rows[0], contracts: contractRes.rows });
  } catch (err) {
    logger.error('Asset overview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/asset-maintenance/:assetId/contracts ─────────────────────────────
router.get('/:assetId/contracts', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *,
         CASE
           WHEN end_date < CURRENT_DATE             THEN 'EXPIRED'
           WHEN end_date <= CURRENT_DATE + 30       THEN 'EXPIRING_SOON'
           ELSE 'ACTIVE'
         END AS computed_status,
         (end_date - CURRENT_DATE) AS days_remaining
       FROM asset_maintenance_contracts
       WHERE asset_id = $1 AND active = true
       ORDER BY end_date DESC`,
      [req.params.assetId]
    );
    res.json({ success: true, contracts: result.rows });
  } catch (err) {
    logger.error('Contracts GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/asset-maintenance/:assetId/contracts ────────────────────────────
const contractValidators = [
  body('contract_type').isIn(CONTRACT_TYPES).withMessage('Valid contract type required'),
  body('vendor_name').trim().isLength({ min: 2, max: 200 }).withMessage('Vendor name required'),
  body('start_date').isDate().withMessage('Start date required'),
  body('end_date').isDate().withMessage('End date required'),
  body('contract_value').isFloat({ min: 0 }).toFloat(),
  body('response_time_hours').optional({ checkFalsy: true }).isInt({ min: 1 }).toInt(),
  body('resolution_time_hours').optional({ checkFalsy: true }).isInt({ min: 1 }).toInt(),
  body('uptime_guarantee_pct').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }).toFloat(),
  body('penalty_per_hour').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('preventive_visits_yr').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
];

router.post('/:assetId/contracts', authorizePermission('ASSET_MAINTENANCE_WRITE'), contractValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { assetId } = req.params;
    const {
      contract_type, contract_number = null, vendor_name,
      vendor_contact = null, vendor_email = null,
      start_date, end_date, contract_value = 0,
      response_time_hours = null, resolution_time_hours = null,
      uptime_guarantee_pct = null, penalty_per_hour = 0,
      parts_included = false, labor_included = true,
      onsite_support = true, remote_support = true,
      preventive_visits_yr = 0,
      coverage_scope = null, notes = null,
    } = req.body;

    const result = await pool.query(`
      INSERT INTO asset_maintenance_contracts
        (asset_id, contract_type, contract_number, vendor_name, vendor_contact, vendor_email,
         start_date, end_date, contract_value,
         response_time_hours, resolution_time_hours, uptime_guarantee_pct, penalty_per_hour,
         parts_included, labor_included, onsite_support, remote_support,
         preventive_visits_yr, coverage_scope, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *
    `, [assetId, contract_type, contract_number, vendor_name, vendor_contact, vendor_email,
        start_date, end_date, contract_value,
        response_time_hours, resolution_time_hours, uptime_guarantee_pct, penalty_per_hour,
        parts_included, labor_included, onsite_support, remote_support,
        preventive_visits_yr, coverage_scope, notes]);

    logger.info('Maintenance contract created', { assetId, contract_type });
    res.status(201).json({ success: true, contract: result.rows[0] });
  } catch (err) {
    logger.error('Contract POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/asset-maintenance/contracts/:id ──────────────────────────────────
router.put('/contracts/:id', authorizePermission('ASSET_MAINTENANCE_WRITE'), contractValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const {
      contract_type, contract_number = null, vendor_name,
      vendor_contact = null, vendor_email = null,
      start_date, end_date, contract_value = 0,
      response_time_hours = null, resolution_time_hours = null,
      uptime_guarantee_pct = null, penalty_per_hour = 0,
      parts_included = false, labor_included = true,
      onsite_support = true, remote_support = true,
      preventive_visits_yr = 0,
      coverage_scope = null, notes = null,
    } = req.body;

    const result = await pool.query(`
      UPDATE asset_maintenance_contracts
      SET contract_type=$1, contract_number=$2, vendor_name=$3, vendor_contact=$4,
          vendor_email=$5, start_date=$6, end_date=$7, contract_value=$8,
          response_time_hours=$9, resolution_time_hours=$10, uptime_guarantee_pct=$11,
          penalty_per_hour=$12, parts_included=$13, labor_included=$14,
          onsite_support=$15, remote_support=$16, preventive_visits_yr=$17,
          coverage_scope=$18, notes=$19, updated_at=NOW()
      WHERE id=$20 AND active=true RETURNING *
    `, [contract_type, contract_number, vendor_name, vendor_contact, vendor_email,
        start_date, end_date, contract_value,
        response_time_hours, resolution_time_hours, uptime_guarantee_pct, penalty_per_hour,
        parts_included, labor_included, onsite_support, remote_support, preventive_visits_yr,
        coverage_scope, notes, req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Contract not found' });
    res.json({ success: true, contract: result.rows[0] });
  } catch (err) {
    logger.error('Contract PUT error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/asset-maintenance/contracts/:id ───────────────────────────────
router.delete('/contracts/:id', authorizePermission('ASSET_MAINTENANCE_WRITE'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE asset_maintenance_contracts SET active=false, updated_at=NOW() WHERE id=$1 AND active=true RETURNING id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Contract not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('Contract DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/asset-maintenance/:assetId/logs ──────────────────────────────────
router.get('/:assetId/logs', async (req, res) => {
  try {
    const [logsRes] = await Promise.all([
      pool.query(
        `SELECT l.*,
           json_agg(
             json_build_object(
               'id', p.id, 'part_code', p.part_code, 'part_name', p.part_name,
               'quantity', p.quantity, 'unit_cost', p.unit_cost, 'gst_rate', p.gst_rate,
               'base_cost', p.base_cost, 'gst_amount', p.gst_amount, 'total_cost', p.total_cost,
               'notes', p.notes, 'item_master_id', p.item_master_id
             ) ORDER BY p.id
           ) FILTER (WHERE p.id IS NOT NULL) AS parts
         FROM asset_maintenance_logs l
         LEFT JOIN asset_maintenance_parts p ON p.maintenance_log_id = l.id
         WHERE l.asset_id = $1 AND l.active = true
         GROUP BY l.id
         ORDER BY l.reported_date DESC`,
        [req.params.assetId]
      ),
    ]);
    res.json({ success: true, logs: logsRes.rows });
  } catch (err) {
    logger.error('Logs GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/asset-maintenance/:assetId/logs ─────────────────────────────────
const logValidators = [
  body('maintenance_type').isIn(MAINT_TYPES).withMessage('Valid maintenance type required'),
  body('reported_date').isDate().withMessage('Reported date required'),
  body('status').optional().isIn(MAINT_STATUSES),
  body('labor_cost').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('other_cost').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('downtime_hours').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('parts').optional().isArray(),
];

router.post('/:assetId/logs', authorizePermission('ASSET_MAINTENANCE_WRITE'), logValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      maintenance_type, reference_number = null, reported_date,
      start_date = null, completion_date = null, downtime_hours = 0,
      technician_name = null, vendor_name = null,
      problem_description = null, work_performed = null, observations = null,
      next_service_date = null,
      labor_cost = 0, other_cost = 0,
      contract_id = null, status = 'OPEN',
      parts = [],
    } = req.body;

    const logRes = await client.query(`
      INSERT INTO asset_maintenance_logs
        (asset_id, contract_id, maintenance_type, reference_number,
         reported_date, start_date, completion_date, downtime_hours,
         technician_name, vendor_name, problem_description, work_performed,
         observations, next_service_date, labor_cost, other_cost, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING id
    `, [req.params.assetId, contract_id, maintenance_type, reference_number,
        reported_date, start_date || null, completion_date || null, downtime_hours,
        technician_name, vendor_name, problem_description, work_performed,
        observations, next_service_date || null,
        labor_cost, other_cost, status]);

    const logId = logRes.rows[0].id;

    for (const p of parts) {
      await client.query(`
        INSERT INTO asset_maintenance_parts
          (maintenance_log_id, item_master_id, part_code, part_name, quantity, unit_cost, gst_rate, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [logId, p.item_master_id || null, p.part_code || null,
          p.part_name, p.quantity || 1, p.unit_cost || 0, p.gst_rate || 0, p.notes || null]);
    }

    // Sync asset status based on open maintenance logs
    await client.query(`
      UPDATE asset_master SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM asset_maintenance_logs
          WHERE asset_id=$1 AND status IN ('OPEN','IN_PROGRESS') AND active=true
        ) THEN 'UNDER_MAINTENANCE' ELSE 'ACTIVE' END, updated_at=NOW()
      WHERE id=$1 AND active=true AND status != 'DISPOSED'
    `, [req.params.assetId]);

    await client.query('COMMIT');

    // Auto-create a Draft PR for replenishment if parts were used
    if (parts.length) {
      await createSparePartsDraftPR(logId, req.params.assetId, req.user?.id || 1, maintenance_type);
    }

    const full = await pool.query(
      `SELECT l.*,
         json_agg(json_build_object('id',p.id,'part_name',p.part_name,'part_code',p.part_code,
           'quantity',p.quantity,'unit_cost',p.unit_cost,'total_cost',p.total_cost))
         FILTER (WHERE p.id IS NOT NULL) AS parts
       FROM asset_maintenance_logs l
       LEFT JOIN asset_maintenance_parts p ON p.maintenance_log_id = l.id
       WHERE l.id = $1 GROUP BY l.id`, [logId]
    );
    logger.info('Maintenance log created', { assetId: req.params.assetId, logId, maintenance_type });
    res.status(201).json({ success: true, log: full.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Log POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally { client.release(); }
});

// ── PUT /api/asset-maintenance/logs/:id ───────────────────────────────────────
router.put('/logs/:id', authorizePermission('ASSET_MAINTENANCE_WRITE'), logValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      maintenance_type, reference_number = null, reported_date,
      start_date = null, completion_date = null, downtime_hours = 0,
      technician_name = null, vendor_name = null,
      problem_description = null, work_performed = null, observations = null,
      next_service_date = null, labor_cost = 0, other_cost = 0,
      contract_id = null, status = 'OPEN', parts = [],
    } = req.body;

    const res2 = await client.query(`
      UPDATE asset_maintenance_logs
      SET maintenance_type=$1, reference_number=$2, reported_date=$3,
          start_date=$4, completion_date=$5, downtime_hours=$6,
          technician_name=$7, vendor_name=$8, problem_description=$9,
          work_performed=$10, observations=$11, next_service_date=$12,
          labor_cost=$13, other_cost=$14, contract_id=$15, status=$16, updated_at=NOW()
      WHERE id=$17 AND active=true RETURNING id
    `, [maintenance_type, reference_number, reported_date,
        start_date || null, completion_date || null, downtime_hours,
        technician_name, vendor_name, problem_description, work_performed,
        observations, next_service_date || null,
        labor_cost, other_cost, contract_id, status, req.params.id]);

    if (!res2.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Log not found' }); }

    // Get asset_id for this log (needed for status sync)
    const logRow = await client.query('SELECT asset_id FROM asset_maintenance_logs WHERE id=$1', [req.params.id]);
    const assetId = logRow.rows[0]?.asset_id;

    // Replace parts
    await client.query('DELETE FROM asset_maintenance_parts WHERE maintenance_log_id=$1', [req.params.id]);
    for (const p of parts) {
      await client.query(`
        INSERT INTO asset_maintenance_parts
          (maintenance_log_id, item_master_id, part_code, part_name, quantity, unit_cost, gst_rate, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [req.params.id, p.item_master_id || null, p.part_code || null,
          p.part_name, p.quantity || 1, p.unit_cost || 0, p.gst_rate || 0, p.notes || null]);
    }

    // Sync asset status based on open maintenance logs
    if (assetId) {
      await client.query(`
        UPDATE asset_master SET status = CASE
          WHEN EXISTS (
            SELECT 1 FROM asset_maintenance_logs
            WHERE asset_id=$1 AND status IN ('OPEN','IN_PROGRESS') AND active=true
          ) THEN 'UNDER_MAINTENANCE' ELSE 'ACTIVE' END, updated_at=NOW()
        WHERE id=$1 AND active=true AND status != 'DISPOSED'
      `, [assetId]);
    }

    await client.query('COMMIT');

    // Auto-create a Draft PR for any new parts on edit (only if parts present)
    if (parts.length && assetId) {
      await createSparePartsDraftPR(req.params.id, assetId, req.user?.id || 1, maintenance_type);
    }

    const full = await pool.query(
      `SELECT l.*,
         json_agg(json_build_object('id',p.id,'part_name',p.part_name,'part_code',p.part_code,
           'quantity',p.quantity,'unit_cost',p.unit_cost,'total_cost',p.total_cost))
         FILTER (WHERE p.id IS NOT NULL) AS parts
       FROM asset_maintenance_logs l
       LEFT JOIN asset_maintenance_parts p ON p.maintenance_log_id = l.id
       WHERE l.id = $1 GROUP BY l.id`, [req.params.id]
    );
    res.json({ success: true, log: full.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Log PUT error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally { client.release(); }
});

// ── DELETE /api/asset-maintenance/logs/:id ────────────────────────────────────
router.delete('/logs/:id', authorizePermission('ASSET_MAINTENANCE_WRITE'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE asset_maintenance_logs SET active=false, updated_at=NOW() WHERE id=$1 AND active=true RETURNING id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Log not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('Log DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
