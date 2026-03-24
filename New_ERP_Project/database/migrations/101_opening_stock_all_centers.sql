-- ============================================================
-- Migration 101: Opening stock balance — all items × 4 centers
-- ============================================================
-- Centers: 1 (Kozhikode), 2 (Main Hospital), 8 (NS Hospital), 9 (Doctors Scan)
-- Excludes: id=24 (Corporate entity — not a clinical center)
--
-- Quantity formula (per center):
--   standard_rate > 2000  → GREATEST(LEAST(reorder_level×2, 10), 5)   [expensive items]
--   standard_rate > 500   → GREATEST(LEAST(reorder_level×2, 30), 10)  [high-value items]
--   standard_rate > 100   → GREATEST(LEAST(reorder_level×3, 100), 20) [medium items]
--   else                  → GREATEST(LEAST(reorder_level×3, 500), 20) [low-cost consumables]
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- Step 1: Clear any stale zero/negative current_stock
--         (negative stock from testing — reset to 0 first)
-- ──────────────────────────────────────────────────────────────
UPDATE item_master SET current_stock = 0, updated_at = NOW()
WHERE item_type = 'STOCK' AND active = true AND current_stock <= 0;

-- ──────────────────────────────────────────────────────────────
-- Step 2: Insert OPENING movements — all items × 4 centers
-- ──────────────────────────────────────────────────────────────
INSERT INTO inventory_movements (
  item_id, center_id, movement_type,
  reference_type, reference_number,
  quantity, unit_cost, current_stock,
  notes, created_by, created_at
)
SELECT
  im.id                         AS item_id,
  c.id                          AS center_id,
  'OPENING'                     AS movement_type,
  'OPENING_BALANCE'             AS reference_type,
  'OB-26-' || LPAD(im.id::text, 3, '0') || '-C' || c.id AS reference_number,

  -- Opening quantity per center
  CASE
    WHEN im.standard_rate > 2000 THEN GREATEST(LEAST(im.reorder_level * 2, 10), 5)
    WHEN im.standard_rate > 500  THEN GREATEST(LEAST(im.reorder_level * 2, 30), 10)
    WHEN im.standard_rate > 100  THEN GREATEST(LEAST(im.reorder_level * 3, 100), 20)
    ELSE                              GREATEST(LEAST(im.reorder_level * 3, 500), 20)
  END                           AS quantity,

  im.standard_rate              AS unit_cost,

  -- current_stock in movement = same as quantity (first movement for this item+center)
  CASE
    WHEN im.standard_rate > 2000 THEN GREATEST(LEAST(im.reorder_level * 2, 10), 5)
    WHEN im.standard_rate > 500  THEN GREATEST(LEAST(im.reorder_level * 2, 30), 10)
    WHEN im.standard_rate > 100  THEN GREATEST(LEAST(im.reorder_level * 3, 100), 20)
    ELSE                              GREATEST(LEAST(im.reorder_level * 3, 500), 20)
  END                           AS current_stock,

  'Opening balance — test setup Mar 2026'  AS notes,
  8                             AS created_by,
  NOW()                         AS created_at

FROM item_master im
CROSS JOIN centers c
WHERE im.item_type = 'STOCK'
  AND im.active    = true
  AND c.active     = true
  AND c.id IN (1, 2, 8, 9);   -- exclude corporate entity (id=24)

-- ──────────────────────────────────────────────────────────────
-- Step 3: Update item_master.current_stock = sum across all centers
-- ──────────────────────────────────────────────────────────────
UPDATE item_master im
SET
  current_stock = (
    SELECT COALESCE(SUM(mv.quantity), 0)
    FROM inventory_movements mv
    WHERE mv.item_id = im.id AND mv.movement_type = 'OPENING'
  ),
  updated_at = NOW()
WHERE im.item_type = 'STOCK' AND im.active = true;

COMMIT;

-- ──────────────────────────────────────────────────────────────
-- Verification
-- ──────────────────────────────────────────────────────────────
SELECT
  c.name                                      AS center,
  COUNT(DISTINCT mv.item_id)                  AS items_stocked,
  SUM(mv.quantity)                            AS total_units,
  ROUND(SUM(mv.quantity * mv.unit_cost), 0)   AS total_stock_value_inr
FROM inventory_movements mv
JOIN centers c ON c.id = mv.center_id
WHERE mv.movement_type = 'OPENING'
GROUP BY c.name
ORDER BY c.name;

SELECT
  im.category,
  COUNT(*)                                    AS items,
  SUM(im.current_stock)                       AS total_units,
  ROUND(SUM(im.current_stock * im.standard_rate), 0) AS stock_value_inr
FROM item_master im
WHERE im.item_type = 'STOCK' AND im.active = true
GROUP BY im.category
ORDER BY stock_value_inr DESC;
