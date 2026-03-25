const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/grn?po_id=&status=&center_id= ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { po_id, status, center_id } = req.query;
    const conds = ['pr.active = true'];
    const params = [];
    if (po_id)     { params.push(po_id);     conds.push(`pr.po_id = $${params.length}`); }
    if (status)    { params.push(status);    conds.push(`pr.status = $${params.length}`); }
    if (center_id) { params.push(center_id); conds.push(`pr.center_id = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT pr.*, po.po_number, po.vendor_name, c.name AS center_name, c.code AS center_code,
              u.name AS received_by_name
       FROM purchase_receipts pr
       JOIN procurement_orders po ON po.id = pr.po_id
       JOIN centers c ON c.id = pr.center_id
       LEFT JOIN users u ON u.id = pr.received_by
       WHERE ${conds.join(' AND ')}
       ORDER BY pr.receipt_date DESC, pr.id DESC`,
      params
    );
    res.json({ success: true, receipts: rows });
  } catch (e) {
    logger.error('GRN list error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/grn/pending-capitalisation ──────────────────────────────────────
// Returns posted GRN line items of type FIXED_ASSET not yet linked to an asset_master
router.get('/pending-capitalisation', async (req, res) => {
  try {
    const { center_id } = req.query;
    const conds = [`pr.status IN ('APPROVED','POSTED','COMPLETED')`, `pr.active = true`, `im.item_type = 'FIXED_ASSET'`];
    const params = [];
    if (center_id) { params.push(center_id); conds.push(`pr.center_id = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT pr.id AS grn_id, pr.grn_number, pr.receipt_date, pr.center_id,
              c.name AS center_name, po.vendor_name,
              pri.id AS grn_item_id, pri.item_name, pri.received_qty, pri.amount,
              pri.unit_rate, pri.batch_number, pri.expiry_date,
              im.id AS item_master_id, im.item_type,
              ic.id AS category_id, ic.code AS cat_code, ic.parent_id AS cat_parent_id
       FROM purchase_receipts pr
       JOIN procurement_orders po ON po.id = pr.po_id
       JOIN centers c ON c.id = pr.center_id
       JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
       JOIN item_master im ON im.id = pri.item_master_id
       LEFT JOIN item_categories ic ON ic.id = im.category_id
       WHERE ${conds.join(' AND ')}
         AND (
           SELECT COUNT(*) FROM asset_master am WHERE am.grn_item_id = pri.id
         ) < pri.received_qty
       ORDER BY pr.receipt_date DESC, pr.id DESC`,
      params
    );
    res.json({ success: true, items: rows });
  } catch (e) {
    logger.error('GRN pending capitalisation error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/grn/:id ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows: hdr } = await pool.query(
      `SELECT pr.*, po.po_number, po.vendor_name, po.total_amount AS po_total,
              c.name AS center_name, u.name AS received_by_name
       FROM purchase_receipts pr
       JOIN procurement_orders po ON po.id = pr.po_id
       JOIN centers c ON c.id = pr.center_id
       LEFT JOIN users u ON u.id = pr.received_by
       WHERE pr.id = $1 AND pr.active = true`,
      [req.params.id]
    );
    if (!hdr.length) return res.status(404).json({ error: 'GRN not found' });

    const { rows: items } = await pool.query(
      `SELECT pri.*, ic.code AS category_code, ic.name AS category_name
       FROM purchase_receipt_items pri
       LEFT JOIN item_master im ON im.id = pri.item_master_id
       LEFT JOIN item_categories ic ON ic.id = im.category_id
       WHERE pri.receipt_id = $1`,
      [req.params.id]
    );
    res.json({ success: true, receipt: hdr[0], items });
  } catch (e) {
    logger.error('GRN get error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/grn/po/:po_id/pending-items ─────────────────────────────────────
// Returns PO items with qty outstanding (ordered - already received)
router.get('/po/:po_id/pending-items', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT poi.*, poi.quantity - COALESCE(poi.received_qty, 0) AS pending_qty,
              im.item_code AS item_master_code, ic.name AS category_name
       FROM procurement_order_items poi
       LEFT JOIN item_master im ON im.id = poi.item_master_id
       LEFT JOIN item_categories ic ON ic.id = im.category_id
       WHERE poi.po_id = $1 AND poi.quantity > COALESCE(poi.received_qty, 0)`,
      [req.params.po_id]
    );
    res.json({ success: true, items: rows });
  } catch (e) {
    logger.error('GRN pending items error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/grn — Create + auto-approve GRN in one step ────────────────────
router.post('/', authorizePermission('GRN_WRITE'), [
  body('po_id').isInt({ min: 1 }),
  body('receipt_date').isDate(),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.po_item_id').isInt({ min: 1 }),
  body('items.*.received_qty').isFloat({ min: 0.01 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { po_id, receipt_date, notes, items } = req.body;

    // Get PO
    const { rows: poRows } = await pool.query(
      `SELECT po.*, c.name AS center_name
       FROM procurement_orders po JOIN centers c ON c.id = po.center_id
       WHERE po.id = $1 AND po.active = true`,
      [po_id]
    );
    if (!poRows.length) return res.status(404).json({ error: 'PO not found' });
    const po = poRows[0];
    if (po.status === 'CANCELLED')
      return res.status(400).json({ error: 'Cannot receive against a cancelled PO' });

    // Validate received quantities and STOCK config
    const { rows: poItems } = await pool.query(
      `SELECT id, item_name, uom, quantity, unit_rate, gst_rate, gst_amount,
              COALESCE(received_qty, 0) AS received_qty, item_master_id
       FROM procurement_order_items WHERE po_id = $1`, [po_id]
    );
    const poItemMap = Object.fromEntries(poItems.map(i => [i.id, i]));

    for (const item of items) {
      const poi = poItemMap[item.po_item_id];
      if (!poi) return res.status(400).json({ error: `PO item ${item.po_item_id} not found` });
      const pending = parseFloat(poi.quantity) - parseFloat(poi.received_qty);
      if (parseFloat(item.received_qty) > pending + 0.001)
        return res.status(400).json({ error: `Over-receipt: ${poi.item_name} — max pending ${pending}` });

      if (poi.item_master_id) {
        const { rows: [imCheck] } = await pool.query(
          `SELECT im.item_type, csc.item_id IS NOT NULL AS configured, csc.is_readonly
           FROM item_master im
           LEFT JOIN center_stock_config csc
             ON csc.item_id = im.id AND csc.center_id = $2 AND csc.is_active = true
           WHERE im.id = $1`,
          [poi.item_master_id, po.center_id]
        );
        if (imCheck?.item_type === 'STOCK') {
          if (imCheck.is_readonly)
            return res.status(400).json({ error: `${poi.item_name} is managed by corporate — GRN must be raised against the corporate center` });
          if (!imCheck.configured)
            return res.status(400).json({ error: `${poi.item_name} is not configured for this center — add it in Stock → Configure first` });
        }
        if (imCheck?.item_type === 'FIXED_ASSET' && !Number.isInteger(Number(item.received_qty)))
          return res.status(400).json({ error: `Fixed asset "${poi.item_name}" must have whole-number quantity` });
      }
    }

    // Generate GRN number
    const { rows: [{ nextval }] } = await pool.query(`SELECT nextval('grn_number_seq')`);
    const grn_number = `GRN-${receipt_date.slice(0,4)}-${String(nextval).padStart(4,'0')}`;

    const totalQty   = items.reduce((s, i) => s + parseFloat(i.received_qty), 0);
    const totalValue = items.reduce((s, i) => {
      const poi = poItemMap[i.po_item_id];
      const amt = parseFloat(i.received_qty) * parseFloat(poi.unit_rate);
      const gst = amt * parseFloat(poi.gst_rate || 0) / 100;
      return s + amt + gst;
    }, 0);

    // Pre-fetch item types + category for all items
    const allItemMasterIds = [...new Set(poItems.map(p => p.item_master_id).filter(Boolean))];
    let itemTypeMap = {};
    if (allItemMasterIds.length) {
      const { rows: imRows } = await pool.query(
        `SELECT id, item_type, category_id FROM item_master WHERE id = ANY($1)`, [allItemMasterIds]
      );
      itemTypeMap = Object.fromEntries(imRows.map(r => [r.id, r]));
    }

    const warnings = [];
    let receipt, insertedItems, poCompleted = false;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert GRN header as APPROVED directly
      const { rows: [rcpt] } = await client.query(
        `INSERT INTO purchase_receipts
           (grn_number, po_id, center_id, receipt_date, received_by, notes, total_qty, total_value,
            status, approved_by, approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'APPROVED',$9,NOW()) RETURNING *`,
        [grn_number, po_id, po.center_id, receipt_date, req.user?.id || null, notes || null,
         totalQty, totalValue, req.user?.id || null]
      );
      receipt = rcpt;
      insertedItems = [];

      for (const item of items) {
        const poi = poItemMap[item.po_item_id];
        const amt    = parseFloat(item.received_qty) * parseFloat(poi.unit_rate);
        const gstAmt = amt * parseFloat(poi.gst_rate || 0) / 100;

        // Insert line item
        const { rows: [priRow] } = await client.query(
          `INSERT INTO purchase_receipt_items
             (receipt_id, po_item_id, item_master_id, item_name, uom,
              ordered_qty, received_qty, unit_rate, gst_rate, gst_amount, amount,
              batch_number, expiry_date, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [receipt.id, item.po_item_id, poi.item_master_id, poi.item_name, poi.uom,
           poi.quantity, item.received_qty, poi.unit_rate, poi.gst_rate || 0,
           gstAmt, amt + gstAmt,
           item.batch_number || null, item.expiry_date || null, item.notes || null]
        );
        insertedItems.push(priRow);

        // Update PO item received_qty (concurrent over-receipt guard)
        const { rowCount } = await client.query(
          `UPDATE procurement_order_items
           SET received_qty = COALESCE(received_qty,0) + $1
           WHERE id = $2 AND COALESCE(received_qty,0) + $1 <= quantity`,
          [item.received_qty, item.po_item_id]
        );
        if (rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Over-receipt prevented: "${poi.item_name}" — ordered quantity exceeded` });
        }

        if (poi.item_master_id) {
          const imMeta = itemTypeMap[poi.item_master_id];
          const itemType = imMeta?.item_type;

          if (itemType === 'STOCK') {
            const { rows: [im] } = await client.query(
              `SELECT uom_conversion, standard_rate, COALESCE(current_stock,0) AS current_stock
               FROM item_master WHERE id = $1`, [poi.item_master_id]
            );
            const conv = parseFloat(im?.uom_conversion || 1);
            const stockQty = parseFloat(item.received_qty) * conv;
            const newUnitCost = conv > 1 ? parseFloat(poi.unit_rate) / conv : parseFloat(poi.unit_rate);
            const existingQty = parseFloat(im?.current_stock || 0);
            const existingRate = parseFloat(im?.standard_rate || 0);
            const totalQ = existingQty + stockQty;
            const wac = totalQ > 0 ? ((existingQty * existingRate) + (stockQty * newUnitCost)) / totalQ : newUnitCost;
            const unitCostRounded = Math.round(wac * 10000) / 10000;

            const { rows: [updated] } = await client.query(
              `UPDATE item_master SET current_stock = COALESCE(current_stock,0) + $1,
               standard_rate = $2, updated_at = NOW() WHERE id = $3 RETURNING current_stock`,
              [stockQty, unitCostRounded, poi.item_master_id]
            );
            await client.query(
              `INSERT INTO inventory_movements
                 (item_id, center_id, movement_type, reference_type, reference_number,
                  quantity, unit_cost, current_stock, created_by)
               VALUES ($1,$2,'STOCK_IN','GRN',$3,$4,$5,$6,$7)`,
              [poi.item_master_id, po.center_id, grn_number,
               stockQty, unitCostRounded, updated.current_stock, req.user?.id || null]
            );
          }

          if (itemType === 'FIXED_ASSET') {
            const qty = parseInt(item.received_qty) || 1;
            // Resolve asset category code
            let assetType = 'FA_MED_NEW';
            if (imMeta.category_id) {
              const { rows: [catRow] } = await client.query(
                `SELECT COALESCE(parent_ic.code, ic.code) AS cat_code
                 FROM item_categories ic
                 LEFT JOIN item_categories parent_ic ON parent_ic.id = ic.parent_id
                 WHERE ic.id = $1`, [imMeta.category_id]
              );
              if (catRow?.cat_code) assetType = catRow.cat_code;
            }
            const unitCost = parseFloat(poi.unit_rate || 0);
            for (let i = 0; i < qty; i++) {
              const assetName = qty > 1 ? `${poi.item_name} (${i + 1}/${qty})` : poi.item_name;
              await client.query('SAVEPOINT asset_insert');
              try {
                const { rows: [{ next_id }] } = await client.query(`SELECT nextval('asset_master_id_seq') AS next_id`);
                const assetCode = `AST-${String(next_id).padStart(3, '0')}`;
                await client.query(
                  `INSERT INTO asset_master
                     (id, asset_code, asset_name, asset_type, center_id, purchase_cost, current_value,
                      purchase_date, grn_id, grn_item_id, asset_ownership, status, active, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,'CENTER','ACTIVE',true,NOW(),NOW())`,
                  [next_id, assetCode, assetName, assetType, po.center_id, unitCost, receipt_date, receipt.id, priRow.id]
                );
                await client.query('RELEASE SAVEPOINT asset_insert');
                logger.info('Asset created from GRN', { asset_code: assetCode, item: assetName });
              } catch (assetErr) {
                await client.query('ROLLBACK TO SAVEPOINT asset_insert');
                warnings.push(`Asset not created for "${poi.item_name}" unit ${i + 1}: ${assetErr.message}`);
              }
            }
          }
        }
      }

      // Mark PO COMPLETED if fully received
      const { rows: [fullCheck] } = await client.query(
        `SELECT COUNT(*) FILTER (WHERE quantity > COALESCE(received_qty,0)) AS pending
         FROM procurement_order_items WHERE po_id = $1`, [po_id]
      );
      if (parseInt(fullCheck.pending) === 0) {
        await client.query(`UPDATE procurement_orders SET status='COMPLETED', updated_at=NOW() WHERE id=$1`, [po_id]);
        poCompleted = true;
      }

      await client.query('COMMIT');
      logger.info('GRN created and approved', { grn_number, po_id });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    // Post Finance JE + vendor_bill (non-critical)
    try {
      const je = await financeService.postGRNJE(receipt, insertedItems, po, req.user?.id);
      if (je) {
        await pool.query(`UPDATE purchase_receipts SET journal_entry_id=$1 WHERE id=$2`, [je.id, receipt.id]);
        // Post capitalisation JEs for each asset
        const { rows: grnAssets } = await pool.query(
          `SELECT am.*, pri.item_master_id FROM asset_master am
           LEFT JOIN purchase_receipt_items pri ON pri.id = am.grn_item_id
           WHERE am.grn_id = $1 AND am.purchase_je_id IS NULL`, [receipt.id]
        );
        for (const asset of grnAssets) {
          try {
            const assetJe = await financeService.postAssetPurchaseJE(asset, req.user?.id || null);
            if (assetJe) {
              await pool.query(
                `UPDATE asset_master SET purchase_je_id=$1, journal_entry_id=$1, updated_at=NOW() WHERE id=$2`,
                [assetJe.id, asset.id]
              );
            }
          } catch (assetJeErr) {
            warnings.push(`Asset JE failed for ${asset.asset_code}: ${assetJeErr.message}`);
          }
        }
      }
    } catch (jeErr) {
      logger.error('GRN JE failed (non-critical)', { grn_number, error: jeErr.message });
      await pool.query(`UPDATE purchase_receipts SET je_error=$1 WHERE id=$2`, [jeErr.message, receipt.id]).catch(() => {});
    }

    const resp = { success: true, receipt: { id: receipt.id, grn_number }, po_completed: poCompleted };
    if (warnings.length) resp.warnings = warnings;
    res.status(201).json(resp);
  } catch (e) {
    logger.error('GRN create error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/grn/:id/post — Post GRN (update stock + PO) ────────────────────
router.post('/:id/post', authorizePermission('GRN_WRITE'), async (req, res) => {
  try {
    const warnings = [];
    const client = await pool.connect();
    let receipt, items;
    try {
      await client.query('BEGIN');

      // Fetch + lock receipt inside transaction to prevent double-post race condition
      const { rows: [row] } = await client.query(
        `SELECT pr.*, po.status AS po_status
         FROM purchase_receipts pr
         JOIN procurement_orders po ON po.id = pr.po_id
         WHERE pr.id = $1 AND pr.active = true
         FOR UPDATE OF pr`,
        [req.params.id]
      );
      if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'GRN not found' }); }
      if (row.status !== 'DRAFT') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'GRN already posted or cancelled' }); }
      receipt = row;

      const { rows: itemRows } = await client.query(
        `SELECT * FROM purchase_receipt_items WHERE receipt_id = $1`, [req.params.id]
      );
      items = itemRows;

      // Prefetch item_types for all items in one query (avoids N+1 and used for Fix J + processing)
      const itemMasterIds = [...new Set(items.map(i => i.item_master_id).filter(Boolean))];
      let itemTypeMap = {};
      if (itemMasterIds.length) {
        const { rows: imRows } = await client.query(
          `SELECT id, item_type FROM item_master WHERE id = ANY($1)`, [itemMasterIds]
        );
        itemTypeMap = Object.fromEntries(imRows.map(r => [r.id, r.item_type]));
      }

      // Fix J: validate FIXED_ASSET items have integer quantities
      for (const item of items) {
        if (item.item_master_id && itemTypeMap[item.item_master_id] === 'FIXED_ASSET') {
          if (!Number.isInteger(Number(item.received_qty))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Fixed asset "${item.item_name}" must have whole-number quantity` });
          }
        }
      }

      // Update GRN status
      await client.query(
        `UPDATE purchase_receipts SET status='POSTED', updated_at=NOW() WHERE id=$1`, [req.params.id]
      );

      for (const item of items) {
        // Update PO item received_qty — conditional WHERE prevents over-receipt even under concurrent posts
        const { rowCount } = await client.query(
          `UPDATE procurement_order_items
           SET received_qty = COALESCE(received_qty,0) + $1
           WHERE id = $2
             AND COALESCE(received_qty,0) + $1 <= quantity`,
          [item.received_qty, item.po_item_id]
        );
        if (rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: `Over-receipt prevented: "${item.item_name}" — another GRN was posted concurrently or the ordered quantity has been exceeded.`,
          });
        }

        if (item.item_master_id) {
          const itemType = itemTypeMap[item.item_master_id];

          if (itemType === 'STOCK') {
            // Fetch conversion factor for this item
            const { rows: [itemMeta] } = await client.query(
              `SELECT uom_conversion, standard_rate, COALESCE(current_stock, 0) AS current_stock FROM item_master WHERE id = $1`,
              [item.item_master_id]
            );
            const convFactor = parseFloat(itemMeta?.uom_conversion || 1);
            const stockQtyToAdd = parseFloat(item.received_qty) * convFactor;
            const newUnitCost = convFactor > 1
              ? parseFloat(item.unit_rate || 0) / convFactor
              : parseFloat(item.unit_rate || 0);

            // Weighted Average Cost: (existing_stock × old_rate + new_qty × new_rate) / total_qty
            const existingStock = parseFloat(itemMeta?.current_stock || 0);
            const existingRate = parseFloat(itemMeta?.standard_rate || 0);
            const totalQty = existingStock + stockQtyToAdd;
            const weightedAvgCost = totalQty > 0
              ? ((existingStock * existingRate) + (stockQtyToAdd * newUnitCost)) / totalQty
              : newUnitCost;
            const unitCostPerConsumptionUnit = Math.round(weightedAvgCost * 10000) / 10000; // 4 decimal places

            const { rows: [updated] } = await client.query(
              `UPDATE item_master
               SET current_stock = COALESCE(current_stock, 0) + $1,
                   standard_rate = $2,
                   updated_at = NOW()
               WHERE id = $3
               RETURNING current_stock`,
              [stockQtyToAdd, unitCostPerConsumptionUnit, item.item_master_id]
            );
            // Record STOCK_IN movement with the PO's center so per-center
            // balances can be derived from inventory_movements
            // quantity and unit_cost are stored in secondary (consumption) UOM
            await client.query(
              `INSERT INTO inventory_movements
                 (item_id, center_id, movement_type, reference_type, reference_number,
                  quantity, unit_cost, current_stock, created_by)
               VALUES ($1,$2,'STOCK_IN','GRN',$3,$4,$5,$6,$7)`,
              [item.item_master_id, receipt.center_id, receipt.grn_number,
               stockQtyToAdd, unitCostPerConsumptionUnit,
               updated.current_stock, req.user?.id || null]
            );
          }
          if (itemType === 'FIXED_ASSET') {
            // Auto-create one asset_master record per received unit
            try {
              const qty = parseInt(item.received_qty) || 1;

              const { rows: [{ cnt }] } = await client.query(
                `SELECT COUNT(*) AS cnt FROM asset_master WHERE grn_item_id = $1`,
                [item.id]
              );
              const alreadyCreated = parseInt(cnt);

              if (alreadyCreated < qty) {
                // Resolve asset_type from item's L1 category code (FA_MED_REFURB, FA_IT, etc.)
                const { rows: [catRow] } = await client.query(
                  `SELECT COALESCE(parent_ic.code, ic.code) AS cat_code
                   FROM item_master im
                   LEFT JOIN item_categories ic ON ic.id = im.category_id
                   LEFT JOIN item_categories parent_ic ON parent_ic.id = ic.parent_id
                   WHERE im.id = $1`,
                  [item.item_master_id]
                );
                const assetType = catRow?.cat_code || 'FA_MED_NEW';
                const unitCost = parseFloat(item.unit_rate || 0);
                const purchaseDate = receipt.receipt_date || new Date().toLocaleDateString('en-CA');

                for (let i = alreadyCreated; i < qty; i++) {
                  const assetName = qty > 1 ? `${item.item_name} (${i + 1}/${qty})` : item.item_name;
                  // Use nextval to pre-compute the ID — avoids UNIQUE conflict on a temporary code
                  const { rows: [{ next_id }] } = await client.query(`SELECT nextval('asset_master_id_seq') AS next_id`);
                  const assetCode = `AST-${String(next_id).padStart(3, '0')}`;
                  await client.query(
                    `INSERT INTO asset_master
                       (id, asset_code, asset_name, asset_type, center_id, purchase_cost, current_value,
                        purchase_date, grn_id, grn_item_id, asset_ownership, status, active,
                        created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,'CENTER','ACTIVE',true,NOW(),NOW())`,
                    [next_id, assetCode, assetName, assetType, receipt.center_id,
                     unitCost, purchaseDate, receipt.id, item.id]
                  );
                  logger.info('Asset created from GRN', { asset_code: assetCode, item: assetName, asset_type: assetType });
                }
              }
            } catch (assetErr) {
              logger.warn('GRN: asset_master creation failed (non-critical)', { error: assetErr.message });
              warnings.push(`Asset record not created for "${item.item_name}": ${assetErr.message}`);
            }
          }
          // EXPENSE: no stock update — GL entry handled by postGRNJE below
        }
      }

      // Check if PO is fully received → mark COMPLETED
      const { rows: [fullCheck] } = await client.query(
        `SELECT COUNT(*) FILTER (WHERE quantity > COALESCE(received_qty,0)) AS pending
         FROM procurement_order_items WHERE po_id = $1`,
        [receipt.po_id]
      );
      if (parseInt(fullCheck.pending) === 0) {
        await client.query(
          `UPDATE procurement_orders SET status='COMPLETED', updated_at=NOW() WHERE id=$1`,
          [receipt.po_id]
        );
      }

      // Commit stock + PO updates first — physical receipt must not be blocked by GL issues
      await client.query('COMMIT');
      logger.info('GRN posted', { id: req.params.id, grn_number: receipt.grn_number });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    // Post Finance JE in a separate operation so a GL config issue never rolls back the GRN
    try {
      const { rows: [po] } = await pool.query(
        `SELECT * FROM procurement_orders WHERE id=$1`, [receipt.po_id]
      );
      const je = await financeService.postGRNJE(receipt, items, po, req.user?.id);
      if (je) {
        await pool.query(
          `UPDATE purchase_receipts SET journal_entry_id=$1 WHERE id=$2`,
          [je.id, req.params.id]
        );
        logger.info('Finance JE posted for GRN', { grn_id: req.params.id, je_id: je.id });

        // Post capitalisation JE (DR Fixed Asset / CR CWIP) for each auto-created asset
        const { rows: grnAssets } = await pool.query(
          `SELECT am.*, pri.item_master_id
             FROM asset_master am
             LEFT JOIN purchase_receipt_items pri ON pri.id = am.grn_item_id
            WHERE am.grn_id = $1 AND am.purchase_je_id IS NULL`,
          [receipt.id]
        );
        const cwipFailures = [];
        for (const asset of grnAssets) {
          try {
            const assetJe = await financeService.postAssetPurchaseJE(asset, req.user?.id || null);
            if (assetJe) {
              await pool.query(
                `UPDATE asset_master SET purchase_je_id=$1, journal_entry_id=$1, updated_at=NOW() WHERE id=$2`,
                [assetJe.id, asset.id]
              );
              logger.info('Asset capitalisation JE posted', { asset_id: asset.id, asset_code: asset.asset_code, je_id: assetJe.id });
            }
          } catch (assetJeErr) {
            logger.warn('Asset capitalisation JE failed', { asset_id: asset.id, asset_code: asset.asset_code, error: assetJeErr.message });
            cwipFailures.push({ asset_id: asset.id, asset_code: asset.asset_code, error: assetJeErr.message });
          }
        }
        if (cwipFailures.length > 0) {
          logger.error('CWIP STRANDED — capitalisation JEs failed; manual reconciliation required', {
            grn_id: req.params.id, grn_number: receipt.grn_number,
            failed_count: cwipFailures.length, failed_assets: cwipFailures,
            action_required: 'Post DR Fixed-Asset-GL / CR CWIP-1280 JEs manually for these asset IDs',
          });
        }
      }
    } catch (jeErr) {
      // JE failure is non-critical — GRN is already posted, flag for manual reconciliation
      logger.error('GRN JE failed (non-critical)', {
        grn_id: req.params.id, grn_number: receipt.grn_number, error: jeErr.message
      });
      await pool.query(
        `UPDATE purchase_receipts SET je_error=$1 WHERE id=$2`,
        [jeErr.message, req.params.id]
      ).catch(() => {}); // best-effort — don't fail if column doesn't exist yet
    }

    const resp = { success: true, message: 'GRN posted — stock updated' };
    if (warnings.length) resp.warnings = warnings;
    res.json(resp);
  } catch (e) {
    logger.error('GRN post error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/grn/:id/approve — Approve GRN: update stock + PO + post JE ──────
router.post('/:id/approve', authorizePermission('GRN_WRITE'), async (req, res) => {
  try {
    const warnings = [];
    const client = await pool.connect();
    let receipt, items;
    try {
      await client.query('BEGIN');

      const { rows: [row] } = await client.query(
        `SELECT pr.*, po.status AS po_status
         FROM purchase_receipts pr
         JOIN procurement_orders po ON po.id = pr.po_id
         WHERE pr.id = $1 AND pr.active = true
         FOR UPDATE OF pr`,
        [req.params.id]
      );
      if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'GRN not found' }); }
      if (row.status !== 'POSTED') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Only POSTED GRNs can be approved' }); }
      receipt = row;

      const { rows: itemRows } = await client.query(
        `SELECT * FROM purchase_receipt_items WHERE receipt_id = $1`, [req.params.id]
      );
      items = itemRows;

      const itemMasterIds = [...new Set(items.map(i => i.item_master_id).filter(Boolean))];
      let itemTypeMap = {};
      if (itemMasterIds.length) {
        const { rows: imRows } = await client.query(
          `SELECT id, item_type FROM item_master WHERE id = ANY($1)`, [itemMasterIds]
        );
        itemTypeMap = Object.fromEntries(imRows.map(r => [r.id, r.item_type]));
      }

      for (const item of items) {
        if (item.item_master_id && itemTypeMap[item.item_master_id] === 'FIXED_ASSET') {
          if (!Number.isInteger(Number(item.received_qty))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Fixed asset "${item.item_name}" must have whole-number quantity` });
          }
        }
      }

      // Update GRN status to APPROVED
      await client.query(
        `UPDATE purchase_receipts SET status='APPROVED', approved_by=$2, approved_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [req.params.id, req.user?.id || null]
      );

      for (const item of items) {
        const { rowCount } = await client.query(
          `UPDATE procurement_order_items
           SET received_qty = COALESCE(received_qty,0) + $1
           WHERE id = $2 AND COALESCE(received_qty,0) + $1 <= quantity`,
          [item.received_qty, item.po_item_id]
        );
        if (rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: `Over-receipt prevented: "${item.item_name}" — ordered quantity exceeded.`,
          });
        }

        if (item.item_master_id) {
          const itemType = itemTypeMap[item.item_master_id];

          if (itemType === 'STOCK') {
            const { rows: [itemMeta] } = await client.query(
              `SELECT uom_conversion, standard_rate, COALESCE(current_stock, 0) AS current_stock FROM item_master WHERE id = $1`,
              [item.item_master_id]
            );
            const convFactor = parseFloat(itemMeta?.uom_conversion || 1);
            const stockQtyToAdd = parseFloat(item.received_qty) * convFactor;
            const newUnitCost = convFactor > 1
              ? parseFloat(item.unit_rate || 0) / convFactor
              : parseFloat(item.unit_rate || 0);

            const existingStock = parseFloat(itemMeta?.current_stock || 0);
            const existingRate = parseFloat(itemMeta?.standard_rate || 0);
            const totalQty = existingStock + stockQtyToAdd;
            const weightedAvgCost = totalQty > 0
              ? ((existingStock * existingRate) + (stockQtyToAdd * newUnitCost)) / totalQty
              : newUnitCost;
            const unitCostPerConsumptionUnit = Math.round(weightedAvgCost * 10000) / 10000;

            const { rows: [updated] } = await client.query(
              `UPDATE item_master SET current_stock = COALESCE(current_stock,0) + $1, standard_rate = $2, updated_at = NOW()
               WHERE id = $3 RETURNING current_stock`,
              [stockQtyToAdd, unitCostPerConsumptionUnit, item.item_master_id]
            );
            await client.query(
              `INSERT INTO inventory_movements
                 (item_id, center_id, movement_type, reference_type, reference_number, quantity, unit_cost, current_stock, created_by)
               VALUES ($1,$2,'STOCK_IN','GRN',$3,$4,$5,$6,$7)`,
              [item.item_master_id, receipt.center_id, receipt.grn_number,
               stockQtyToAdd, unitCostPerConsumptionUnit, updated.current_stock, req.user?.id || null]
            );
          }

          if (itemType === 'FIXED_ASSET') {
            const qty = parseInt(item.received_qty) || 1;
            const { rows: [{ cnt }] } = await client.query(
              `SELECT COUNT(*) AS cnt FROM asset_master WHERE grn_item_id = $1`, [item.id]
            );
            if (parseInt(cnt) < qty) {
              const { rows: [catRow] } = await client.query(
                `SELECT COALESCE(parent_ic.code, ic.code) AS cat_code
                 FROM item_master im
                 LEFT JOIN item_categories ic ON ic.id = im.category_id
                 LEFT JOIN item_categories parent_ic ON parent_ic.id = ic.parent_id
                 WHERE im.id = $1`, [item.item_master_id]
              );
              const assetType = catRow?.cat_code || 'FA_MED_NEW';
              const unitCost = parseFloat(item.unit_rate || 0);
              const purchaseDate = receipt.receipt_date || new Date().toLocaleDateString('en-CA');
              for (let i = parseInt(cnt); i < qty; i++) {
                const assetName = qty > 1 ? `${item.item_name} (${i + 1}/${qty})` : item.item_name;
                await client.query('SAVEPOINT asset_insert');
                try {
                  const { rows: [{ next_id }] } = await client.query(`SELECT nextval('asset_master_id_seq') AS next_id`);
                  const assetCode = `AST-${String(next_id).padStart(3, '0')}`;
                  await client.query(
                    `INSERT INTO asset_master (id, asset_code, asset_name, asset_type, center_id, purchase_cost, current_value,
                       purchase_date, grn_id, grn_item_id, asset_ownership, status, active, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,'CENTER','ACTIVE',true,NOW(),NOW())`,
                    [next_id, assetCode, assetName, assetType, receipt.center_id, unitCost, purchaseDate, receipt.id, item.id]
                  );
                  await client.query('RELEASE SAVEPOINT asset_insert');
                  logger.info('Asset created from GRN approval', { asset_code: assetCode });
                } catch (assetErr) {
                  await client.query('ROLLBACK TO SAVEPOINT asset_insert');
                  warnings.push(`Asset record not created for "${item.item_name}" unit ${i + 1}: ${assetErr.message}`);
                }
              }
            }
          }
        }
      }

      // Mark PO COMPLETED if fully received
      const { rows: [fullCheck] } = await client.query(
        `SELECT COUNT(*) FILTER (WHERE quantity > COALESCE(received_qty,0)) AS pending
         FROM procurement_order_items WHERE po_id = $1`, [receipt.po_id]
      );
      if (parseInt(fullCheck.pending) === 0) {
        await client.query(`UPDATE procurement_orders SET status='COMPLETED', updated_at=NOW() WHERE id=$1`, [receipt.po_id]);
      }

      await client.query('COMMIT');
      logger.info('GRN approved', { id: req.params.id, grn_number: receipt.grn_number });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    // Post Finance JE (non-critical — GRN already approved if this fails)
    try {
      const { rows: [po] } = await pool.query(`SELECT * FROM procurement_orders WHERE id=$1`, [receipt.po_id]);
      const je = await financeService.postGRNJE(receipt, items, po, req.user?.id);
      if (je) {
        await pool.query(`UPDATE purchase_receipts SET journal_entry_id=$1 WHERE id=$2`, [je.id, req.params.id]);
        const { rows: grnAssets } = await pool.query(
          `SELECT am.*, pri.item_master_id FROM asset_master am
           LEFT JOIN purchase_receipt_items pri ON pri.id = am.grn_item_id
           WHERE am.grn_id = $1 AND am.purchase_je_id IS NULL`, [receipt.id]
        );
        for (const asset of grnAssets) {
          try {
            const assetJe = await financeService.postAssetPurchaseJE(asset, req.user?.id || null);
            if (assetJe) {
              await pool.query(
                `UPDATE asset_master SET purchase_je_id=$1, journal_entry_id=$1, updated_at=NOW() WHERE id=$2`,
                [assetJe.id, asset.id]
              );
            }
          } catch (assetJeErr) {
            warnings.push(`Asset JE failed for ${asset.asset_code}: ${assetJeErr.message}`);
          }
        }
      }
    } catch (jeErr) {
      logger.error('GRN JE failed (non-critical)', { grn_id: req.params.id, error: jeErr.message });
      await pool.query(`UPDATE purchase_receipts SET je_error=$1 WHERE id=$2`, [jeErr.message, req.params.id]).catch(() => {});
    }

    const resp = { success: true, message: 'GRN approved' };
    if (warnings.length) resp.warnings = warnings;
    res.json(resp);
  } catch (e) {
    logger.error('GRN approve error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/grn/:id/cancel ───────────────────────────────────────────────────
router.put('/:id/cancel', authorizePermission('GRN_WRITE', 'PO_APPROVE'), async (req, res) => {
  try {
    const { rows: [r] } = await pool.query(
      `SELECT status FROM purchase_receipts WHERE id=$1 AND active=true`, [req.params.id]
    );
    if (!r) return res.status(404).json({ error: 'GRN not found' });
    if (r.status === 'APPROVED') return res.status(400).json({ error: 'Approved GRNs cannot be cancelled' });
    await pool.query(
      `UPDATE purchase_receipts SET status='CANCELLED', active=false, updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
