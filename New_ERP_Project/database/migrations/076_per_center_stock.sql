-- Migration 076: Per-center stock tracking via inventory_movements
--
-- Problem: GRN post only updated item_master.current_stock (global total)
--          but never created STOCK_IN movement records.
--          stock-summary read item_master.current_stock which has no per-center breakdown.
--
-- Fix:
--   1. Backfill STOCK_IN movements from all existing posted GRNs
--   2. For items with opening stock not covered by GRNs → OPENING movements
--   3. stock-summary will now derive balance from inventory_movements per center
--   4. item_master.center_id concept removed from stock logic (master data is global)

-- ── 1. Backfill STOCK_IN movements from posted GRNs ───────────────────────────
INSERT INTO inventory_movements
  (item_id, center_id, movement_type, reference_type, reference_number,
   quantity, unit_cost, current_stock, notes, created_at)
SELECT
  pri.item_master_id,
  pr.center_id,
  'STOCK_IN',
  'GRN',
  pr.grn_number,
  pri.received_qty,
  pri.unit_rate,
  0,   -- running balance not critical; stock-summary will aggregate from movements
  'Backfilled from ' || pr.grn_number,
  pr.receipt_date::timestamp
FROM purchase_receipts pr
JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
WHERE pr.status = 'POSTED'
  AND pri.item_master_id IS NOT NULL
  -- skip if already backfilled
  AND NOT EXISTS (
    SELECT 1 FROM inventory_movements im2
    WHERE im2.reference_type = 'GRN'
      AND im2.reference_number = pr.grn_number
      AND im2.item_id = pri.item_master_id
  );

-- ── 2. OPENING movements for any remaining stock not covered by GRNs ──────────
-- (e.g. opening balances entered directly into item_master)
-- Per-center balance = STOCK_IN from GRNs - STOCK_OUT from issues.
-- If current_stock > sum(in) - sum(out), the difference is opening stock.
INSERT INTO inventory_movements
  (item_id, center_id, movement_type, reference_type, reference_number,
   quantity, unit_cost, current_stock, notes, created_at)
SELECT
  im.id,
  -- use item's center_id if set; otherwise corporate (24) for shared items
  COALESCE(im.center_id, 24),
  'OPENING',
  'SYSTEM',
  'OPENING-' || im.item_code,
  -- opening = current_stock - (total IN from movements) + (total OUT from movements)
  GREATEST(
    im.current_stock
    - COALESCE((SELECT SUM(mv.quantity) FROM inventory_movements mv
                WHERE mv.item_id = im.id
                  AND mv.movement_type IN ('STOCK_IN','OPENING','ADJUSTMENT')), 0)
    + COALESCE((SELECT SUM(mv.quantity) FROM inventory_movements mv
                WHERE mv.item_id = im.id
                  AND mv.movement_type = 'STOCK_OUT'), 0),
    0
  ),
  im.standard_rate,
  im.current_stock,
  'Opening balance migration',
  '2026-01-01 00:00:00'::timestamp
FROM item_master im
WHERE im.item_type = 'STOCK'
  AND im.active = true
  AND im.current_stock > 0
  -- only where there's an unexplained gap
  AND im.current_stock > COALESCE(
    (SELECT SUM(mv.quantity) FROM inventory_movements mv
     WHERE mv.item_id = im.id AND mv.movement_type IN ('STOCK_IN','OPENING','ADJUSTMENT'))
    - (SELECT COALESCE(SUM(mv.quantity),0) FROM inventory_movements mv
       WHERE mv.item_id = im.id AND mv.movement_type = 'STOCK_OUT'),
    0
  )
  AND NOT EXISTS (
    SELECT 1 FROM inventory_movements im2
    WHERE im2.item_id = im.id AND im2.movement_type = 'OPENING'
  );

-- ── 3. Remove center_id from item_master stock logic ──────────────────────────
-- item_master is global master data; center ownership lives in inventory_movements
-- We null out center_id on item_master so it's not used as a stock filter proxy
-- (center_id column kept for potential future use but stock queries use movements)
UPDATE item_master SET center_id = NULL WHERE item_type = 'STOCK';

-- Verify backfill
SELECT
  movement_type,
  c.name AS center_name,
  COUNT(*) AS records,
  SUM(quantity) AS total_qty
FROM inventory_movements im
LEFT JOIN centers c ON c.id = im.center_id
GROUP BY movement_type, c.name
ORDER BY movement_type, c.name;
