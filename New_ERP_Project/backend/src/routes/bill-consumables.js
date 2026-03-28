'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('BILL_CONSUMABLE_VIEW'));

// GET /api/bill-consumables?bill_id=&bill_item_id=
// If bill_item_id provided: return only that study's consumables.
// Otherwise: return all consumables for the bill (shared + per-study).
router.get('/', async (req, res) => {
  try {
    const { bill_id, bill_item_id } = req.query;
    if (!bill_id) return res.status(400).json({ error: 'bill_id required' });

    const params = [bill_id];
    let filter = '';
    if (bill_item_id) {
      params.push(bill_item_id);
      filter = `AND bc.bill_item_id = $2`;
    }

    const { rows } = await pool.query(
      `SELECT bc.*, im.item_name, im.uom, im.item_code
       FROM bill_consumables bc
       JOIN item_master im ON im.id = bc.item_master_id
       WHERE bc.bill_id = $1 ${filter}
       ORDER BY bc.bill_item_id NULLS FIRST, im.item_name`,
      params
    );
    res.json({ success: true, consumables: rows });
  } catch (e) {
    logger.error('Bill consumables GET error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bill-consumables/pending-issues?center_id=&from=&to=&limit=
// Returns bill_items that have template consumables but no bill_consumables recorded yet.
router.get('/pending-issues', async (req, res) => {
  try {
    const { center_id, from, to, limit = 100 } = req.query;
    const conds = [
      `pb.active = true`,
      `pb.payment_status = 'PAID'`,
      `bi.active = true`,
      `bi.exam_workflow_status IS NOT NULL`,
      // Study must have a template with consumables
      `EXISTS (
         SELECT 1
         FROM study_master sm2
         JOIN study_consumables sc ON sc.study_definition_id = sm2.study_definition_id
         WHERE sm2.study_code = bi.study_code AND sc.active = true
       )`,
      // Has NOT had any bill_consumables saved for this specific bill_item yet
      `NOT EXISTS (
         SELECT 1 FROM bill_consumables bc
         WHERE bc.bill_id = pb.id AND bc.bill_item_id = bi.id
       )`,
    ];
    const params = [];
    if (center_id) { params.push(center_id); conds.push(`pb.center_id = $${params.length}`); }
    if (from)      { params.push(from);      conds.push(`pb.bill_date >= $${params.length}`); }
    if (to)        { params.push(to);        conds.push(`pb.bill_date <= $${params.length}`); }
    params.push(parseInt(limit, 10) || 100);

    const { rows } = await pool.query(
      `SELECT
         pb.id          AS bill_id,
         bi.id          AS bill_item_id,
         pb.invoice_number AS bill_number,
         pb.bill_date,
         pb.center_id,
         c.name         AS center_name,
         bi.study_code,
         bi.study_name,
         bi.modality,
         bi.accession_number,
         bi.exam_workflow_status,
         pb.patient_id,
         p.name         AS patient_name,
         p.phone        AS patient_phone,
         pb.total_amount,
         sm.study_definition_id,
         -- Template items as JSON array (with scope)
         (SELECT JSON_AGG(JSON_BUILD_OBJECT(
            'item_master_id', sc.item_master_id,
            'item_name',      im.item_name,
            'item_code',      im.item_code,
            'uom',            im.uom,
            'default_qty',    sc.default_qty,
            'unit_cost',      im.standard_rate,
            'current_stock',  im.current_stock,
            'scope',          sc.scope
          ) ORDER BY sc.scope DESC, im.item_name)
          FROM study_consumables sc
          JOIN item_master im ON im.id = sc.item_master_id
          WHERE sc.study_definition_id = sm.study_definition_id AND sc.active = true
         ) AS template_items
       FROM patient_bills pb
       JOIN bill_items bi       ON bi.bill_id = pb.id
       LEFT JOIN study_master sm ON sm.study_code = bi.study_code AND sm.active = true
       LEFT JOIN patients p      ON p.id::text = pb.patient_id::text
       LEFT JOIN centers  c      ON c.id = pb.center_id
       WHERE ${conds.join(' AND ')}
       ORDER BY pb.bill_date DESC, pb.id DESC, bi.id
       LIMIT $${params.length}`,
      params
    );

    res.json({ success: true, pending: rows, count: rows.length });
  } catch (e) {
    logger.error('Pending issues GET error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/bill-consumables/save
// Accepts:
//   { bill_id, consumables: [{item_master_id, qty_used, bill_item_id, notes}] }
//
// bill_item_id = null  → per-patient/shared consumable (report cover, CD, etc.)
// bill_item_id = N     → per-study consumable for that specific bill_item
//
// Unique constraint enforcement (partial indexes):
//   Shared:    UNIQUE(bill_id, item_master_id) WHERE bill_item_id IS NULL
//   Per-study: UNIQUE(bill_id, bill_item_id, item_master_id) WHERE bill_item_id IS NOT NULL
router.post('/save', [
  body('bill_id').isInt({ min: 1 }),
  body('consumables').isArray(),
  body('consumables.*.item_master_id').isInt({ min: 1 }),
  body('consumables.*.qty_used').isFloat({ min: 0 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { bill_id, consumables } = req.body;
  if (!consumables || consumables.length === 0) {
    return res.json({ success: true, message: 'No consumables to save' });
  }

  const { rows: billRows } = await pool.query(
    `SELECT id, center_id, bill_date, study_id FROM patient_bills WHERE id=$1 AND active=true`,
    [bill_id]
  );
  if (!billRows.length) return res.status(404).json({ error: 'Bill not found' });
  const bill = billRows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const c of consumables) {
      const newQty     = parseFloat(c.qty_used) || 0;
      const itemId     = parseInt(c.item_master_id, 10);
      // null = shared/patient-level; number = per-study
      const billItemId = c.bill_item_id != null ? parseInt(c.bill_item_id, 10) : null;

      const { rows: itemRows } = await client.query(
        `SELECT im.id, im.item_name, im.uom, im.consumption_uom, im.uom_conversion,
                im.standard_rate, im.item_type, im.category_id,
                ic.expense_gl_id, ic.asset_gl_id, ic.ap_account_id, ic.item_type AS cat_item_type
         FROM item_master im
         LEFT JOIN item_categories ic ON ic.id = im.category_id
         WHERE im.id = $1 AND im.active = true`,
        [itemId]
      );
      if (!itemRows.length) {
        logger.warn(`bill-consumables: item ${itemId} not found — skipping`);
        continue;
      }
      const item     = itemRows[0];
      const unitCost = parseFloat(item.standard_rate || 0);

      // Find existing record matching bill + item + scope (bill_item_id)
      const { rows: existingRows } = await client.query(
        `SELECT * FROM bill_consumables
         WHERE bill_id=$1 AND item_master_id=$2
           AND (bill_item_id IS NOT DISTINCT FROM $3)`,
        [bill_id, itemId, billItemId]
      );
      const existing = existingRows[0] || null;

      if (existing) {
        const oldQty = parseFloat(existing.qty_used);
        if (oldQty !== newQty && oldQty > 0) {
          // Reverse the old STOCK_OUT
          await client.query(
            `INSERT INTO inventory_movements
               (movement_number, item_id, center_id, movement_type, reference_type,
                reference_number, quantity, unit_cost, current_stock, notes, bill_id, bill_item_id)
             VALUES
               ('', $1, $2, 'STOCK_IN', 'CONSUMABLE_REVERSAL',
                $3, $4, $5,
                (SELECT COALESCE(current_stock, 0) + $4 FROM item_master WHERE id = $1),
                $6, $7, $8)`,
            [
              itemId, bill.center_id,
              `REV-B${bill_id}-${itemId}-I${billItemId || 0}`,
              oldQty, unitCost,
              `Reversal of consumable for bill ${bill_id}`,
              bill_id, billItemId,
            ]
          );
          await client.query(
            `UPDATE item_master SET current_stock = COALESCE(current_stock, 0) + $1, updated_at = NOW()
             WHERE id = $2`,
            [oldQty, itemId]
          );
        }
      }

      if (newQty <= 0) {
        if (existing) {
          await client.query(
            `DELETE FROM bill_consumables
             WHERE bill_id=$1 AND item_master_id=$2
               AND (bill_item_id IS NOT DISTINCT FROM $3)`,
            [bill_id, itemId, billItemId]
          );
        }
        continue;
      }

      if (existing && parseFloat(existing.qty_used) === newQty) {
        if (c.notes !== undefined) {
          await client.query(
            `UPDATE bill_consumables SET notes=$1, updated_at=NOW()
             WHERE bill_id=$2 AND item_master_id=$3
               AND (bill_item_id IS NOT DISTINCT FROM $4)`,
            [c.notes || null, bill_id, itemId, billItemId]
          );
        }
        continue;
      }

      // Create STOCK_OUT movement
      const { rows: movRows } = await client.query(
        `INSERT INTO inventory_movements
           (movement_number, item_id, center_id, movement_type, reference_type,
            reference_number, quantity, unit_cost, current_stock, notes, bill_id, bill_item_id)
         VALUES
           ('', $1, $2, 'STOCK_OUT', 'CONSUMABLE',
            $3, $4, $5,
            (SELECT COALESCE(current_stock, 0) - $4 FROM item_master WHERE id = $1),
            $6, $7, $8)
         RETURNING *`,
        [
          itemId, bill.center_id,
          `CONS-B${bill_id}-${itemId}-I${billItemId || 0}`,
          newQty, unitCost,
          c.notes || `Consumed for bill ${bill_id}`,
          bill_id, billItemId,
        ]
      );
      const movement = movRows[0];

      await client.query(
        `UPDATE item_master SET current_stock = COALESCE(current_stock, 0) - $1, updated_at = NOW()
         WHERE id = $2`,
        [newQty, itemId]
      );

      let jeId = null;
      if (unitCost > 0) {
        try {
          const je = await financeService.postStockIssueJE(
            item, newQty, unitCost,
            {
              id: movement.id,
              movement_number: movement.movement_number,
              center_id: bill.center_id,
              movement_date: bill.bill_date || new Date(),
            },
            req.user?.id,
            client
          );
          if (je) {
            jeId = je.id;
            await client.query(
              `UPDATE inventory_movements SET journal_entry_id=$1 WHERE id=$2`,
              [je.id, movement.id]
            );
          }
        } catch (jeErr) {
          logger.error(`bill-consumables: JE failed for item ${itemId}:`, jeErr);
        }
      }

      // Upsert using partial-index-aware INSERT … ON CONFLICT
      if (billItemId === null) {
        await client.query(
          `INSERT INTO bill_consumables
             (bill_id, item_master_id, qty_used, unit_cost, movement_id, journal_entry_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (bill_id, item_master_id) WHERE bill_item_id IS NULL
           DO UPDATE SET qty_used=$3, unit_cost=$4, movement_id=$5, journal_entry_id=$6, notes=$7, updated_at=NOW()`,
          [bill_id, itemId, newQty, unitCost, movement.id, jeId, c.notes || null]
        );
      } else {
        await client.query(
          `INSERT INTO bill_consumables
             (bill_id, bill_item_id, item_master_id, qty_used, unit_cost, movement_id, journal_entry_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (bill_id, bill_item_id, item_master_id) WHERE bill_item_id IS NOT NULL
           DO UPDATE SET qty_used=$4, unit_cost=$5, movement_id=$6, journal_entry_id=$7, notes=$8, updated_at=NOW()`,
          [bill_id, billItemId, itemId, newQty, unitCost, movement.id, jeId, c.notes || null]
        );
      }
    }

    // Mark studies.contrast_used = true if any contrast item was recorded
    if (bill.study_id) {
      const anyContrast = consumables.some(c => parseFloat(c.qty_used) > 0 && c.is_contrast);
      if (anyContrast) {
        await client.query(
          `UPDATE studies SET contrast_used = true WHERE id = $1`,
          [bill.study_id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: `Consumables saved for bill ${bill_id}` });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Bill consumables save error:', e);
    res.status(500).json({ error: 'Internal server error', detail: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
