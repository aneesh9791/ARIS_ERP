const express = require('express');
const { body, validationResult } = require('express-validator');
const pool   = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['FA_MED_NEW','FA_MED_REFURB','FA_IT','FA_FURNITURE','FA_VEHICLE','FA_CIVIL','FA_SOFTWARE','FA_APPLIANCE'];

// ── GET /api/asset-management/meta ─────────────────────────────────────────
// Bootstrap data for UI dropdowns (centers + categories)
router.get('/meta', async (_req, res) => {
  try {
    const [centersRes, catsRes] = await Promise.all([
      pool.query(`SELECT id, name, code, city FROM centers WHERE active=true ORDER BY name`),
      pool.query(
        `SELECT at.type_code, at.name, ads.useful_life_years
         FROM asset_types at
         LEFT JOIN asset_depreciation_settings ads ON ads.category_code = at.type_code
         WHERE at.type_code = ANY($1) ORDER BY at.name`,
        [CATEGORIES]
      ),
    ]);
    res.json({ success: true, centers: centersRes.rows, categories: catsRes.rows });
  } catch (err) {
    logger.error('Asset meta error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/asset-management/settings ─────────────────────────────────────
router.get('/settings', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT ads.id, ads.category_code, at.name AS category_name,
              ads.useful_life_years, ads.updated_at
       FROM asset_depreciation_settings ads
       JOIN asset_types at ON at.type_code = ads.category_code
       ORDER BY ads.useful_life_years DESC, at.name`
    );
    res.json({ success: true, settings: result.rows });
  } catch (err) {
    logger.error('Asset settings GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/asset-management/settings/:code ───────────────────────────────
router.put('/settings/:code', authorizePermission('ASSET_WRITE'),
  body('useful_life_years').isInt({ min: 1, max: 50 }).withMessage('Useful life must be 1–50 years'),
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    try {
      const { code } = req.params;
      if (!CATEGORIES.includes(code))
        return res.status(400).json({ error: 'Invalid category code' });
      const { useful_life_years } = req.body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE asset_depreciation_settings SET useful_life_years=$1, updated_at=NOW() WHERE category_code=$2`,
          [useful_life_years, code]
        );
        await client.query(
          `UPDATE asset_types SET useful_life_years=$1 WHERE type_code=$2`,
          [useful_life_years, code]
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK'); throw e;
      } finally { client.release(); }
      logger.info('Depreciation setting updated', { code, useful_life_years });
      res.json({ success: true });
    } catch (err) {
      logger.error('Asset settings PUT error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ── GET /api/asset-management ──────────────────────────────────────────────
// Params: category (code), center_id, status
router.get('/', async (req, res) => {
  try {
    const { category, center_id, status } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (category) {
      conditions.push(`category_code = $${idx++}`); params.push(category);
    }
    if (center_id) {
      conditions.push(`center_id = $${idx++}`); params.push(center_id);
    }
    if (status) {
      conditions.push(`status = $${idx++}`); params.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM asset_register_view ${where} ORDER BY category_code, asset_name`,
      params
    );
    res.json({ success: true, assets: result.rows });
  } catch (err) {
    logger.error('Asset GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Asset validators ───────────────────────────────────────────────────────
const assetValidators = [
  body('asset_name').trim().isLength({ min: 2, max: 200 }).withMessage('Asset name is required'),
  body('asset_type').isIn(CATEGORIES).withMessage('Valid category is required'),
  body('center_id').isInt({ min: 1 }).withMessage('Center is required'),
  body('purchase_cost').isFloat({ min: 0 }).withMessage('Acquisition value must be ≥ 0').toFloat(),
  body('salvage_value').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('purchase_date').isDate().withMessage('Acquisition date is required'),
  body('condition').isIn(['NEW','REFURBISHED']).withMessage('Condition is required'),
  body('status').optional().isIn(['ACTIVE','UNDER_MAINTENANCE','DISPOSED']),
  body('manufacturer').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
  body('model').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('serial_number').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('notes').optional({ checkFalsy: true }).trim(),
  body('grn_id').optional({ nullable: true }).isInt(),
  body('grn_item_id').optional({ nullable: true }).isInt(),
  body('item_category_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('coa_account_id').optional({ nullable: true }).isInt({ min: 1 }),
];

// ── POST /api/asset-management ─────────────────────────────────────────────
router.post('/', authorizePermission('ASSET_WRITE'), assetValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const {
      asset_name, asset_type, center_id,
      manufacturer = null, model = null, serial_number = null,
      condition = 'NEW', purchase_date, purchase_cost,
      salvage_value = 0, status = 'ACTIVE', notes = null,
      grn_id = null, grn_item_id = null,
      item_category_id = null, coa_account_id = null,
    } = req.body;

    // Resolve vendor + item_master from GRN item
    let vendorName   = null;
    let itemMasterId = null;
    if (grn_item_id) {
      const { rows: gi } = await pool.query(
        `SELECT pri.item_master_id, po.vendor_name
         FROM purchase_receipt_items pri
         JOIN purchase_receipts pr ON pr.id = pri.receipt_id
         JOIN procurement_orders po ON po.id = pr.po_id
         WHERE pri.id = $1`,
        [grn_item_id]
      );
      if (gi[0]) { vendorName = gi[0].vendor_name; itemMasterId = gi[0].item_master_id; }
    }

    // Auto-generate asset code: CATEGORY-NNN
    const seqRes = await pool.query(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(asset_code, '-', 2) AS INTEGER)), 0) + 1 AS next
       FROM asset_master WHERE asset_type = $1 AND asset_code ~ $2`,
      [asset_type, `^${asset_type}-[0-9]+$`]
    );
    const asset_code = `${asset_type}-${String(seqRes.rows[0].next).padStart(3, '0')}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        INSERT INTO asset_master
          (asset_code, asset_name, asset_type, asset_category, center_id,
           manufacturer, model, serial_number, condition,
           purchase_date, purchase_cost, salvage_value, current_value,
           depreciation_rate, status, active, notes, location,
           grn_id, grn_item_id, item_master_id, item_category_id, coa_account_id)
        VALUES ($1,$2,$3,'TANGIBLE',$4,$5,$6,$7,$8,$9,$10,$11,$10,0,$12,true,$13,'',$14,$15,$16,$17,$18)
        RETURNING id, asset_code
      `, [
        asset_code, asset_name, asset_type, center_id,
        manufacturer, model, serial_number, condition,
        purchase_date, purchase_cost, salvage_value,
        status === 'ACTIVE' ? 'ACTIVE' : status,
        notes, grn_id || null, grn_item_id || null, itemMasterId || null,
        item_category_id || null, coa_account_id || null,
      ]);

      const newId = result.rows[0].id;

      // Post capitalisation JE synchronously within transaction
      if (parseFloat(purchase_cost) > 0) {
        const je = await financeService.postAssetPurchaseJE(
          { id: newId, asset_code, asset_name, asset_type, center_id,
            purchase_cost, vendor_name: vendorName, item_master_id: itemMasterId },
          req.user?.id,
          client
        );
        if (je) {
          await client.query(
            `UPDATE asset_master SET journal_entry_id = $1 WHERE id = $2`,
            [je.id, newId]
          );
          logger.info('Asset capitalisation JE posted', { asset_code, je_id: je.id });
        }
      }

      await client.query('COMMIT');
      const full = await pool.query('SELECT * FROM asset_register_view WHERE id=$1', [newId]);
      logger.info('Asset created and capitalised', { asset_code, asset_type });
      res.status(201).json({ success: true, asset: full.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Asset code already exists' });
    logger.error('Asset POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/asset-management/:id ─────────────────────────────────────────
router.put('/:id', authorizePermission('ASSET_WRITE'), assetValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { id } = req.params;
    const {
      asset_name, asset_type, center_id,
      manufacturer = null, model = null, serial_number = null,
      condition = 'NEW', purchase_date, purchase_cost,
      salvage_value = 0, status = 'ACTIVE', notes = null,
      item_category_id = undefined, coa_account_id = undefined,
    } = req.body;

    const result = await pool.query(`
      UPDATE asset_master
      SET asset_name=$1, asset_type=$2, center_id=$3,
          manufacturer=$4, model=$5, serial_number=$6, condition=$7,
          purchase_date=$8, purchase_cost=$9, salvage_value=$10,
          current_value=$9, status=$11, notes=$12,
          item_category_id = CASE WHEN $14::boolean THEN $15::integer ELSE item_category_id END,
          coa_account_id   = CASE WHEN $16::boolean THEN $17::integer ELSE coa_account_id   END,
          updated_at=NOW()
      WHERE id=$13 AND active=true
      RETURNING id
    `, [
      asset_name, asset_type, center_id,
      manufacturer, model, serial_number, condition,
      purchase_date, purchase_cost, salvage_value,
      status, notes, id,
      'item_category_id' in req.body,
      item_category_id != null ? parseInt(item_category_id) : null,
      'coa_account_id' in req.body,
      coa_account_id != null ? parseInt(coa_account_id) : null,
    ]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    const full = await pool.query('SELECT * FROM asset_register_view WHERE id=$1', [id]);
    logger.info('Asset updated', { id });
    res.json({ success: true, asset: full.rows[0] });
  } catch (err) {
    logger.error('Asset PUT error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/asset-management/depreciation/run ─────────────────────────────
// Runs monthly straight-line depreciation for all active assets.
// Idempotent — safe to re-run for the same period.
router.post('/depreciation/run', authorizePermission('ASSET_WRITE'), async (req, res) => {
  try {
    const { year, month, center_id } = req.body;
    const now = new Date();
    const y = parseInt(year)  || now.getFullYear();
    const m = parseInt(month) || now.getMonth() + 1;

    if (m < 1 || m > 12) return res.status(400).json({ error: 'month must be 1–12' });

    const result = await financeService.runMonthlyDepreciation(y, m, req.user?.id, center_id || null);
    res.json({ success: true, period: `${y}-${String(m).padStart(2,'0')}`, ...result });
  } catch (err) {
    logger.error('Depreciation run error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/asset-management/depreciation/history ───────────────────────────
// List past depreciation runs
router.get('/depreciation/history', async (req, res) => {
  try {
    const { center_id, year } = req.query;
    const conds = [];
    const params = [];
    if (center_id) { params.push(parseInt(center_id)); conds.push(`am.center_id = $${params.length}`); }
    if (year)      { params.push(parseInt(year));       conds.push(`dr.period_year = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT dr.*, am.asset_code, am.asset_name, am.asset_type, am.center_id,
              je.entry_number
       FROM asset_depreciation_runs dr
       JOIN asset_master am ON am.id = dr.asset_id
       LEFT JOIN journal_entries je ON je.id = dr.journal_entry_id
       ${where}
       ORDER BY dr.period_year DESC, dr.period_month DESC, am.asset_code`,
      params
    );
    res.json({ success: true, runs: rows });
  } catch (err) {
    logger.error('Depreciation history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/asset-management/:id/dispose ────────────────────────────────
// Dispose an asset: post disposal JE (DR Accum Depr / CR Fixed Asset / G/L on sale)
// then mark asset as DISPOSED.
router.post('/:id/dispose', authorizePermission('ASSET_DISPOSE'), [
  body('disposal_date').isDate().withMessage('Disposal date is required'),
  body('sale_proceeds').isFloat({ min: 0 }).withMessage('Sale proceeds must be ≥ 0').toFloat(),
  body('notes').optional({ checkFalsy: true }).trim(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { id } = req.params;
  const { disposal_date, sale_proceeds = 0, notes = null } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT am.*, ic.asset_gl_id AS cat_asset_gl
       FROM asset_master am
       LEFT JOIN item_categories ic ON ic.id = am.item_category_id AND ic.active = true
       WHERE am.id = $1 AND am.active = true`,
      [id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Asset not found' });
    }
    const asset = rows[0];

    if (['DISPOSED', 'SOLD'].includes(asset.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Asset is already disposed' });
    }

    // Post disposal JE
    const je = await financeService.postAssetDisposalJE(
      asset,
      { disposal_date, sale_proceeds, notes },
      req.user?.id,
      client
    );

    if (!je) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Could not post disposal journal entry — check GL account configuration' });
    }

    // Stop depreciation and mark as disposed
    await client.query(
      `UPDATE asset_master
       SET status      = 'DISPOSED',
           active      = false,
           disposed_at = $1,
           notes       = CASE WHEN $2::text IS NOT NULL
                              THEN COALESCE(notes,'') || ' | Disposal: ' || $2
                              ELSE notes END,
           updated_at  = NOW()
       WHERE id = $3`,
      [disposal_date, notes, id]
    );

    await client.query('COMMIT');
    logger.info('Asset disposed', { id, disposal_date, sale_proceeds, je_id: je.id });
    res.json({
      success:       true,
      je_number:     je.entry_number,
      book_value:    parseFloat((parseFloat(asset.purchase_cost) - parseFloat(asset.accumulated_depreciation || 0)).toFixed(2)),
      sale_proceeds: parseFloat(sale_proceeds),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Asset dispose error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── DELETE /api/asset-management/:id ──────────────────────────────────────
// Soft-delete without financial entries (for data corrections only)
router.delete('/:id', authorizePermission('ASSET_DISPOSE'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE asset_master SET active=false, status='DISPOSED', updated_at=NOW() WHERE id=$1 AND active=true RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    logger.info('Asset soft-deleted (no JE)', { id });
    res.json({ success: true });
  } catch (err) {
    logger.error('Asset DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
