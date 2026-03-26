'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool          = require('../config/db');
const { logger }    = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();

const UOM_OPTIONS = [
  'PCS','BOX','BOTTLE','VIAL','ML','MG','GM','KG','LTR','ROLL','SHEET','PAIR','SET','PACKET','REAM','UNIT',
  'HRS','SESSION','VISIT','MONTH','YEAR',
  'CREDITS','STUDIES','SCANS',
  'PIECES','BOXES','BOTTLES','PACKETS','KGS','LITERS','SETS',
];

const ITEM_TYPE_TO_CAT_TYPE = {
  STOCK:       'STOCK',
  EXPENSE:     'EXPENSE',
  FIXED_ASSET: 'FIXED_ASSET',
};

// ── GET /api/item-master/meta ───────────────────────────────────────────────
// Returns category tree from DB + uom options
router.get('/meta', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ic.*,
              ag.account_code AS asset_gl_code,  ag.account_name AS asset_gl_name,
              eg.account_code AS expense_gl_code, eg.account_name AS expense_gl_name,
              ap.account_code AS ap_account_code, ap.account_name AS ap_account_name
         FROM item_categories ic
         LEFT JOIN chart_of_accounts ag ON ag.id = ic.asset_gl_id
         LEFT JOIN chart_of_accounts eg ON eg.id = ic.expense_gl_id
         LEFT JOIN chart_of_accounts ap ON ap.id = ic.ap_account_id
         WHERE ic.active = true
         ORDER BY ic.item_type, ic.level, ic.sort_order, ic.name`
    );

    // Build tree structure for frontend consumption
    const tree = { STOCK: [], EXPENSE: [], FIXED_ASSET: [] };
    const l1Map = {};
    for (const row of rows) {
      if (row.level === 1) {
        const node = { ...row, children: [] };
        tree[row.item_type].push(node);
        l1Map[row.id] = node;
      }
    }
    for (const row of rows) {
      if (row.level === 2 && row.parent_id && l1Map[row.parent_id]) {
        l1Map[row.parent_id].children.push(row);
      }
    }

    res.json({
      success: true,
      category_tree: tree,
      uom_options: UOM_OPTIONS,
    });
  } catch (err) {
    logger.error('Item master meta error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/item-master ────────────────────────────────────────────────────
// Query params: item_type, category_id, active (default=true)
router.get('/', async (req, res) => {
  try {
    const { item_type, category_id, active = 'true', center_id } = req.query;
    const conditions = active === 'all' ? [] : ['im.active = $1'];
    const params = active === 'all' ? [] : [active === 'true'];
    let idx = active === 'all' ? 1 : 2;

    if (item_type && ['STOCK','EXPENSE','FIXED_ASSET'].includes(item_type)) {
      conditions.push(`im.item_type = $${idx++}`);
      params.push(item_type);
    }
    if (category_id) {
      conditions.push(`im.category_id = $${idx++}`);
      params.push(parseInt(category_id));
    }

    // center_id filter: for STOCK items, only return items the center has configured
    // AND exclude readonly items (corporate-managed, visible in stock view but not orderable).
    // EXPENSE and FIXED_ASSET items are always available regardless of center.
    let centerJoin = '';
    if (center_id) {
      params.push(parseInt(center_id));
      centerJoin = `
        LEFT JOIN center_stock_config csc_center
          ON csc_center.item_id = im.id
          AND csc_center.center_id = $${idx++}
          AND csc_center.is_active = true`;
      conditions.push(`(
        im.item_type != 'STOCK'
        OR (csc_center.item_id IS NOT NULL AND csc_center.is_readonly = false)
      )`);
    }

    const { rows } = await pool.query(
      `SELECT im.*,
              ic.code     AS category_code,
              ic.name     AS category_name,
              ic.gst_rate AS category_gst_rate,
              ic.hsn_code AS category_hsn_code,
              ic.sac_code AS category_sac_code,
              ic.item_type AS cat_item_type,
              COALESCE(p.gst_rate, ic.gst_rate) AS effective_category_gst_rate,
              p.code      AS l1_category_code,
              p.name      AS l1_category_name
         FROM item_master im
         LEFT JOIN item_categories ic ON ic.id = im.category_id
         LEFT JOIN item_categories p  ON p.id  = ic.parent_id
         ${centerJoin}
         ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
         ORDER BY im.item_type, ic.parent_id, ic.name, im.item_name`,
      params
    );
    res.json({ success: true, items: rows });
  } catch (err) {
    logger.error('Item master GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Validators ──────────────────────────────────────────────────────────────
const itemValidators = [
  body('item_code').trim().isLength({ min: 1, max: 50 }).withMessage('Item code is required'),
  body('item_name').trim().isLength({ min: 2, max: 200 }).withMessage('Item name is required'),
  body('item_type').isIn(['STOCK','EXPENSE','FIXED_ASSET']).withMessage('Item type must be STOCK, EXPENSE or FIXED_ASSET'),
  body('category_id').isInt({ min: 1 }).withMessage('Category is required').toInt(),
  body('uom').isIn(UOM_OPTIONS).withMessage('Valid unit of measure is required'),
  body('gst_rate').custom(v => [0, 5, 12, 18, 28].includes(parseFloat(v))).withMessage('GST rate must be one of: 0, 5, 12, 18, 28').toFloat(),
  body('standard_rate').isFloat({ min: 0 }).withMessage('Standard rate must be ≥ 0').toFloat(),
  body('reorder_level').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('minimum_stock').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('description').optional({ checkFalsy: true }).trim(),
  body('consumption_uom').optional({ checkFalsy: true }).isString().trim(),
  body('uom_conversion').optional({ checkFalsy: true }).isFloat({ min: 0.0001 }).toFloat(),
];

// Helper: validate category_id exists and matches item_type; returns category name on success
async function validateCategoryForItemType(categoryId, itemType) {
  const { rows } = await pool.query(
    `SELECT id, name, item_type FROM item_categories WHERE id = $1 AND active = true`,
    [categoryId]
  );
  if (!rows.length) return { valid: false, msg: `Category id ${categoryId} not found` };

  const expectedCatType = ITEM_TYPE_TO_CAT_TYPE[itemType];
  if (rows[0].item_type !== expectedCatType) {
    return {
      valid: false,
      msg: `Category type "${rows[0].item_type}" does not match item type "${itemType}" (expected category type "${expectedCatType}")`
    };
  }
  return { valid: true, categoryName: rows[0].name };
}

// ── Center-stock-config routes MUST be before /:id routes ───────────────────

router.get('/center-config', async (req, res) => {
  try {
    const { center_id } = req.query;
    if (!center_id) return res.status(400).json({ error: 'center_id required' });
    const { rows } = await pool.query(
      `SELECT csc.id, csc.center_id, csc.item_id, csc.is_active, csc.is_readonly,
              csc.minimum_stock, csc.reorder_level,
              im.item_code, im.item_name, im.uom, im.item_type,
              ic.name AS category_name,
              im.minimum_stock AS global_min, im.reorder_level AS global_reorder,
              csc.is_readonly AS is_corporate_item
         FROM center_stock_config csc
         JOIN item_master im ON im.id = csc.item_id
         LEFT JOIN item_categories ic ON ic.id = im.category_id
        WHERE csc.center_id = $1
        ORDER BY im.item_code`,
      [center_id]
    );
    res.json({ success: true, configs: rows });
  } catch (e) { logger.error('center-config GET:', e); res.status(500).json({ error: 'Server error' }); }
});

router.put('/center-config', authorizePermission('INVENTORY_WRITE'), async (req, res) => {
  try {
    const { center_id, item_id, minimum_stock, reorder_level, is_active = true } = req.body;
    if (!center_id || !item_id) return res.status(400).json({ error: 'center_id and item_id required' });
    const { rows: [row] } = await pool.query(
      `INSERT INTO center_stock_config
         (center_id, item_id, is_active, minimum_stock, reorder_level, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (center_id, item_id) DO UPDATE
         SET is_active     = EXCLUDED.is_active,
             minimum_stock = EXCLUDED.minimum_stock,
             reorder_level = EXCLUDED.reorder_level,
             updated_at    = NOW()
       RETURNING *`,
      [center_id, item_id, is_active,
       minimum_stock != null ? minimum_stock : null,
       reorder_level != null ? reorder_level : null]
    );
    res.json({ success: true, config: row });
  } catch (e) { logger.error('center-config PUT:', e); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/center-config/:center_id/:item_id', authorizePermission('INVENTORY_WRITE'), async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM center_stock_config WHERE center_id=$1 AND item_id=$2`,
      [req.params.center_id, req.params.item_id]
    );
    res.json({ success: true });
  } catch (e) { logger.error('center-config DELETE:', e); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /api/item-master ───────────────────────────────────────────────────
router.post('/', authorizePermission('INVENTORY_WRITE'), itemValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const {
      item_code, item_name, item_type, category_id, uom,
      l1_category = null, category = null,
      gst_rate = 0, standard_rate = 0,
      reorder_level = 0, minimum_stock = 0, description = null,
      consumption_uom = null, uom_conversion = 1,
    } = req.body;

    // Validate category matches item type
    const catCheck = await validateCategoryForItemType(category_id, item_type);
    if (!catCheck.valid) return res.status(400).json({ error: catCheck.msg });

    // Legacy `category` text column is NOT NULL — auto-populate from category name if not provided
    const resolvedCategory = category || catCheck.categoryName || item_type;

    // consumption_uom defaults to purchase uom if not provided
    const resolvedConsumptionUom = (consumption_uom && consumption_uom.trim()) ? consumption_uom.trim() : uom;

    const result = await pool.query(`
      INSERT INTO item_master
        (item_code, item_name, item_type, category_id, l1_category, category, uom,
         gst_rate, standard_rate, reorder_level, minimum_stock, description,
         consumption_uom, uom_conversion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [item_code.trim().toUpperCase(), item_name, item_type, category_id,
        l1_category, resolvedCategory, uom,
        gst_rate, standard_rate, reorder_level, minimum_stock, description,
        resolvedConsumptionUom, parseFloat(uom_conversion) || 1]);

    logger.info('Item created', { item_code: item_code.trim().toUpperCase(), item_type, category_id });
    res.status(201).json({ success: true, item: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Item code already exists' });
    logger.error('Item master POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/item-master/:id ────────────────────────────────────────────────
router.put('/:id', authorizePermission('INVENTORY_WRITE'), itemValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { id } = req.params;
    const {
      item_name, item_type, category_id, uom,
      l1_category = null, category = null,
      gst_rate = 0, standard_rate = 0,
      reorder_level = 0, minimum_stock = 0, description = null,
      consumption_uom = null, uom_conversion = 1,
    } = req.body;

    // Prevent item_type change after stock transactions exist
    const { rows: existingItem } = await pool.query(
      'SELECT item_type FROM item_master WHERE id=$1 AND active=true', [id]
    );
    if (!existingItem.length) return res.status(404).json({ error: 'Item not found' });
    if (existingItem[0].item_type !== item_type) {
      const { rows: txns } = await pool.query(
        'SELECT 1 FROM inventory_movements WHERE item_id=$1 LIMIT 1', [id]
      );
      if (txns.length) {
        return res.status(409).json({
          error: `Cannot change item type from ${existingItem[0].item_type} to ${item_type}: inventory movements exist for this item`
        });
      }
    }

    // Validate category matches item type
    const catCheck = await validateCategoryForItemType(category_id, item_type);
    if (!catCheck.valid) return res.status(400).json({ error: catCheck.msg });

    // Legacy `category` text column is NOT NULL — auto-populate from category name if not provided
    const resolvedCategory = category || catCheck.categoryName || item_type;

    // consumption_uom defaults to purchase uom if not provided
    const resolvedConsumptionUom = (consumption_uom && consumption_uom.trim()) ? consumption_uom.trim() : uom;

    const result = await pool.query(`
      UPDATE item_master
      SET item_name=$1, item_type=$2, category_id=$3,
          l1_category=$4, category=$5, uom=$6,
          gst_rate=$7, standard_rate=$8, reorder_level=$9, minimum_stock=$10,
          description=$11, consumption_uom=$12, uom_conversion=$13,
          updated_at=NOW()
      WHERE id=$14 AND active=true
      RETURNING *
    `, [item_name, item_type, category_id, l1_category, resolvedCategory, uom,
        gst_rate, standard_rate, reorder_level, minimum_stock, description,
        resolvedConsumptionUom, parseFloat(uom_conversion) || 1, id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    logger.info('Item updated', { id });
    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    logger.error('Item master PUT error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/item-master/:id ─────────────────────────────────────────────
router.delete('/:id', authorizePermission('INVENTORY_WRITE'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE item_master SET active=false, updated_at=NOW() WHERE id=$1 AND active=true RETURNING id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    logger.info('Item deactivated', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    logger.error('Item master DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════════════════
// INVENTORY MOVEMENTS
// ════════════════════════════════════════════════════════════════

// GET /api/item-master/movements?item_id=&center_id=&from=&to=&movement_type=
router.get('/movements', async (req, res) => {
  try {
    const { item_id, center_id, from, to, movement_type, page = 1, limit = 50 } = req.query;
    const conds = ['1=1'];
    const params = [];
    if (item_id)       { conds.push(`m.item_id = $${params.length+1}`);               params.push(item_id); }
    // Corporate center (id=24) movements are shared — always visible under any center filter
    if (center_id)     { conds.push(`(m.center_id = $${params.length+1} OR m.center_id = 24)`); params.push(center_id); }
    if (movement_type) { conds.push(`m.movement_type = $${params.length+1}`);         params.push(movement_type); }
    if (from)          { conds.push(`m.created_at >= $${params.length+1}`);           params.push(from); }
    if (to)            { conds.push(`m.created_at < $${params.length+1}::date + 1`);  params.push(to); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows } = await pool.query(
      `SELECT m.*, i.item_name, i.item_code, i.uom, c.name AS center_name, u.name AS created_by_name
         FROM inventory_movements m
         JOIN item_master i ON i.id = m.item_id
         LEFT JOIN centers c ON c.id = m.center_id
         LEFT JOIN users u ON u.id = m.created_by
        WHERE ${conds.join(' AND ')}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, parseInt(limit), offset]
    );
    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM inventory_movements m WHERE ${conds.join(' AND ')}`, params
    );
    res.json({ success: true, movements: rows, total: parseInt(cnt[0].count) });
  } catch (e) {
    logger.error('Movements GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/item-master/stock-summary  — current stock levels, per-center from movements
router.get('/stock-summary', async (req, res) => {
  try {
    const { center_id } = req.query;
    const params = [];

    let itemFilter, mvFilter, minStockExpr, reorderExpr;

    if (center_id) {
      // Only items the center has opted into via center_stock_config
      params.push(center_id);
      itemFilter = `JOIN center_stock_config csc ON csc.item_id = i.id AND csc.center_id = $${params.length} AND csc.is_active = true`;
      // Corporate (24) stock always available alongside center's own
      mvFilter   = `(mv.center_id = $${params.length} OR mv.center_id = 24)`;
      // Use center-specific levels when set, fall back to global item defaults
      minStockExpr = `COALESCE(csc.minimum_stock, i.minimum_stock)`;
      reorderExpr  = `COALESCE(csc.reorder_level,  i.reorder_level)`;
    } else {
      itemFilter   = '';
      mvFilter     = 'TRUE';
      minStockExpr = 'i.minimum_stock';
      reorderExpr  = 'i.reorder_level';
    }

    const { rows } = await pool.query(
      `SELECT i.id, i.item_code, i.item_name, i.category, i.uom,
              i.consumption_uom, i.uom_conversion,
              ic.name AS category_name,
              i.standard_rate,
              ${minStockExpr} AS minimum_stock,
              ${reorderExpr}  AS reorder_level,
              COALESCE(SUM(
                CASE
                  WHEN mv.movement_type IN ('STOCK_IN','OPENING','ADJUSTMENT') THEN mv.quantity
                  WHEN mv.movement_type = 'STOCK_OUT'                          THEN -mv.quantity
                  ELSE 0
                END
              ), 0) AS current_stock,
              STRING_AGG(DISTINCT c.name, ', ' ORDER BY c.name) AS center_names
         FROM item_master i
         ${itemFilter}
         LEFT JOIN item_categories ic ON ic.id = i.category_id
         LEFT JOIN inventory_movements mv ON mv.item_id = i.id AND ${mvFilter}
         LEFT JOIN centers c ON c.id = mv.center_id
        WHERE i.active = true AND i.item_type = 'STOCK'
        GROUP BY i.id, i.item_code, i.item_name, i.category, i.uom,
                 i.consumption_uom, i.uom_conversion,
                 ic.name, i.standard_rate, ${minStockExpr}, ${reorderExpr}
        ORDER BY i.item_code`,
      params
    );

    const items = rows.map(r => {
      const stock = parseFloat(r.current_stock);
      const minSt = parseFloat(r.minimum_stock || 0);
      const reord = parseFloat(r.reorder_level  || 0);
      return {
        ...r,
        current_stock: stock,
        stock_status:
          stock <= 0     ? 'OUT_OF_STOCK' :
          stock <= minSt ? 'CRITICAL'     :
          stock <= reord ? 'LOW'          : 'OK',
      };
    });

    res.json({ success: true, items });
  } catch (e) {
    logger.error('Stock summary GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/item-master/center-config?center_id= ──────────────────────────────
// POST /api/item-master/movements  — record stock-in or stock-out
router.post('/movements', authorizePermission('INVENTORY_WRITE'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      item_id, center_id, movement_type, quantity,
      unit_cost = 0, reference_type, reference_number, notes,
    } = req.body;

    if (!item_id || !movement_type || !quantity)
      return res.status(400).json({ error: 'item_id, movement_type, quantity required' });
    if (!['STOCK_IN','STOCK_OUT','ADJUSTMENT','OPENING'].includes(movement_type))
      return res.status(400).json({ error: 'Invalid movement_type' });

    const qty = parseFloat(quantity);
    if (qty <= 0) return res.status(400).json({ error: 'Quantity must be positive' });

    const { rows: itemRows } = await client.query(
      'SELECT * FROM item_master WHERE id=$1 AND active=true FOR UPDATE', [item_id]
    );
    if (!itemRows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item not found' }); }
    const item = itemRows[0];

    const delta    = movement_type === 'STOCK_OUT' ? -qty : qty;
    const newStock = parseFloat(item.current_stock || 0) + delta;

    if (movement_type === 'STOCK_OUT' && newStock < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Insufficient stock. Available: ${item.current_stock} ${item.uom}` });
    }

    const { rows: mov } = await client.query(
      `INSERT INTO inventory_movements
         (item_id, center_id, movement_type, reference_type, reference_number,
          quantity, unit_cost, current_stock, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [item_id, center_id || null, movement_type, reference_type || 'MANUAL',
       reference_number || null, qty, parseFloat(unit_cost), newStock,
       notes || null, req.user?.id]
    );

    await client.query(
      'UPDATE item_master SET current_stock=$1, updated_at=NOW() WHERE id=$2',
      [newStock, item_id]
    );

    // Post JE for stock issue (consumption)
    // Fall back to item standard_rate if caller did not supply unit_cost
    const effectiveCost = parseFloat(unit_cost) > 0 ? parseFloat(unit_cost) : parseFloat(item.standard_rate || 0);
    if (movement_type === 'STOCK_OUT' && item.item_type === 'STOCK' && effectiveCost > 0) {
      const je = await financeService.postStockIssueJE(
        item, qty, effectiveCost, mov[0], req.user?.id, client
      );
      if (je) {
        await client.query(
          'UPDATE inventory_movements SET journal_entry_id=$1 WHERE id=$2',
          [je.id, mov[0].id]
        );
      }
    }

    await client.query('COMMIT');
    logger.info('Inventory movement', { item_id, movement_type, qty, newStock });
    res.json({ success: true, movement: mov[0], new_stock: newStock });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Movements POST:', e);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

module.exports = router;
