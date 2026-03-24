'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('BILL_CONSUMABLE_VIEW'));

// GET /api/bill-consumables?bill_id=
router.get('/', async (req, res) => {
  try {
    const { bill_id } = req.query;
    if (!bill_id) return res.status(400).json({ error: 'bill_id required' });
    const { rows } = await pool.query(
      `SELECT bc.*, im.item_name, im.uom, im.item_code
       FROM bill_consumables bc
       JOIN item_master im ON im.id = bc.item_master_id
       WHERE bc.bill_id = $1
       ORDER BY im.item_name`,
      [bill_id]
    );
    res.json({ success: true, consumables: rows });
  } catch (e) {
    logger.error('Bill consumables GET error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bill-consumables/pending-issues?center_id=&from=&to=&limit=
// Returns bills linked to a study that has template consumables but
// no bill_consumables records yet (i.e. stock not yet issued for these studies).
// Join chain: patient_bills.study_id → studies.study_code → study_master.study_definition_id
//             → study_definitions.id → study_consumables.study_definition_id
router.get('/pending-issues', async (req, res) => {
  try {
    const { center_id, from, to, limit = 100 } = req.query;
    const conds = [
      `pb.active = true`,
      `pb.study_id IS NOT NULL`,
      // Study must resolve through study_master to a study_definition that has consumables
      `EXISTS (
         SELECT 1
         FROM studies s
         JOIN study_master sm ON sm.study_code = s.study_code
         JOIN study_consumables sc ON sc.study_definition_id = sm.study_definition_id
         WHERE s.id = pb.study_id AND sc.active = true AND sm.study_definition_id IS NOT NULL
       )`,
      // Has NOT had any bill_consumables saved yet
      `NOT EXISTS (
         SELECT 1 FROM bill_consumables bc WHERE bc.bill_id = pb.id
       )`,
    ];
    const params = [];
    if (center_id) { params.push(center_id); conds.push(`pb.center_id = $${params.length}`); }
    if (from)      { params.push(from);      conds.push(`pb.bill_date >= $${params.length}`); }
    if (to)        { params.push(to);        conds.push(`pb.bill_date <= $${params.length}`); }
    params.push(parseInt(limit, 10) || 100);

    const { rows } = await pool.query(
      `SELECT
         pb.id AS bill_id,
         pb.invoice_number AS bill_number,
         pb.bill_date,
         pb.center_id,
         c.name AS center_name,
         sm.study_definition_id,
         sd.study_name,
         sd.modality,
         pb.patient_id,
         p.name AS patient_name,
         p.phone AS patient_phone,
         pb.total_amount,
         pb.payment_status,
         -- Template items as JSON array
         (SELECT JSON_AGG(JSON_BUILD_OBJECT(
            'item_master_id', sc.item_master_id,
            'item_name',      im.item_name,
            'item_code',      im.item_code,
            'uom',            im.uom,
            'consumption_uom', im.consumption_uom,
            'uom_conversion',  im.uom_conversion,
            'default_qty',    sc.default_qty,
            'unit_cost',      im.standard_rate,
            'current_stock',  im.current_stock
          ) ORDER BY im.item_name)
          FROM study_consumables sc
          JOIN item_master im ON im.id = sc.item_master_id
          WHERE sc.study_definition_id = sm.study_definition_id AND sc.active = true
         ) AS template_items
       FROM patient_bills pb
       JOIN studies s              ON s.id = pb.study_id
       JOIN study_master sm        ON sm.study_code = s.study_code
       JOIN study_definitions sd   ON sd.id = sm.study_definition_id
       LEFT JOIN patients p        ON p.id::text = pb.patient_id::text
       LEFT JOIN centers  c        ON c.id = pb.center_id
       WHERE ${conds.join(' AND ')}
       ORDER BY pb.bill_date DESC, pb.id DESC
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
// Accepts: { bill_id, consumables: [{item_master_id, qty_used, notes}] }
//
// For each consumable item:
//   - If existing record and qty changed: reverse old stock deduction, then proceed
//   - If qty_used > 0: create STOCK_OUT movement, deduct stock, post JE, upsert bill_consumables
//   - If qty_used == 0: remove the bill_consumable record (stock was already restored above)
//
// Reversal strategy: since inventory_movements has no 'active' flag, we create a compensating
// STOCK_IN movement (with negative reference suffix) to reverse the prior STOCK_OUT, then
// create a fresh STOCK_OUT for the new quantity.
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

  // Verify bill exists
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
      const newQty = parseFloat(c.qty_used) || 0;
      const itemId = parseInt(c.item_master_id, 10);

      // Get item details with category GL accounts (includes UOM conversion fields)
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
      const item = itemRows[0];
      const unitCost = parseFloat(item.standard_rate || 0);

      // Check for existing bill_consumable record
      const { rows: existingRows } = await client.query(
        `SELECT * FROM bill_consumables WHERE bill_id=$1 AND item_master_id=$2`,
        [bill_id, itemId]
      );
      const existing = existingRows[0] || null;

      if (existing) {
        const oldQty = parseFloat(existing.qty_used);

        if (oldQty !== newQty) {
          // Reverse the old STOCK_OUT by creating a compensating STOCK_IN movement
          if (oldQty > 0) {
            await client.query(
              `INSERT INTO inventory_movements
                 (movement_number, item_id, center_id, movement_type, reference_type,
                  reference_number, quantity, unit_cost, current_stock, notes, bill_id)
               VALUES
                 ('', $1, $2, 'STOCK_IN', 'CONSUMABLE_REVERSAL',
                  $3, $4, $5,
                  (SELECT COALESCE(current_stock, 0) + $4 FROM item_master WHERE id = $1),
                  $6, $7)`,
              [
                itemId,
                bill.center_id,
                `REV-B${bill_id}-${itemId}`,
                oldQty,
                unitCost,
                `Reversal of prior consumable for bill ${bill_id}`,
                bill_id,
              ]
            );
            // Restore stock
            await client.query(
              `UPDATE item_master SET current_stock = COALESCE(current_stock, 0) + $1, updated_at = NOW()
               WHERE id = $2`,
              [oldQty, itemId]
            );
          }
        }
      }

      if (newQty <= 0) {
        // Remove record — no active consumption
        if (existing) {
          await client.query(
            `DELETE FROM bill_consumables WHERE bill_id=$1 AND item_master_id=$2`,
            [bill_id, itemId]
          );
        }
        continue;
      }

      // Skip if qty unchanged (no reversal needed, no new movement needed)
      if (existing && parseFloat(existing.qty_used) === newQty) {
        // Only update notes if provided
        if (c.notes !== undefined) {
          await client.query(
            `UPDATE bill_consumables SET notes=$1, updated_at=NOW() WHERE bill_id=$2 AND item_master_id=$3`,
            [c.notes || null, bill_id, itemId]
          );
        }
        continue;
      }

      // Create STOCK_OUT movement
      // movement_number = '' triggers auto-generation by the trg_movement_number trigger
      const { rows: movRows } = await client.query(
        `INSERT INTO inventory_movements
           (movement_number, item_id, center_id, movement_type, reference_type,
            reference_number, quantity, unit_cost, current_stock, notes, bill_id)
         VALUES
           ('', $1, $2, 'STOCK_OUT', 'CONSUMABLE',
            $3, $4, $5,
            (SELECT COALESCE(current_stock, 0) - $4 FROM item_master WHERE id = $1),
            $6, $7)
         RETURNING *`,
        [
          itemId,
          bill.center_id,
          `CONS-B${bill_id}-${itemId}`,
          newQty,
          unitCost,
          c.notes || `Consumed for bill ${bill_id}`,
          bill_id,
        ]
      );
      const movement = movRows[0];

      // Deduct stock
      await client.query(
        `UPDATE item_master SET current_stock = COALESCE(current_stock, 0) - $1, updated_at = NOW()
         WHERE id = $2`,
        [newQty, itemId]
      );

      // Post JE (only if item has a cost)
      let jeId = null;
      if (unitCost > 0) {
        try {
          const je = await financeService.postStockIssueJE(
            item,
            newQty,
            unitCost,
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
          // JE failure should not block stock movement — log and continue
          logger.error(`bill-consumables: JE failed for item ${itemId}, movement ${movement.id}:`, jeErr);
        }
      }

      // Upsert bill_consumables record
      await client.query(
        `INSERT INTO bill_consumables
           (bill_id, item_master_id, qty_used, unit_cost, movement_id, journal_entry_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (bill_id, item_master_id) DO UPDATE
           SET qty_used=$3, unit_cost=$4, movement_id=$5, journal_entry_id=$6, notes=$7, updated_at=NOW()`,
        [bill_id, itemId, newQty, unitCost, movement.id, jeId, c.notes || null]
      );
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
