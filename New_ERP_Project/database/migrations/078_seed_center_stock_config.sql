-- Migration 078: Seed center_stock_config
-- Rules:
--   1. All STOCK items (except TRAD-021) → enrolled in all non-corporate centers (1,2,8,9)
--      with per-center sample min/reorder levels scaled to center size
--   2. TRAD-021 → corporate (24) only; remove from all other centers
--   3. Corporate (24) only tracks TRAD-021

-- ── Remove TRAD-021 from non-corporate centers ────────────────────────────────
DELETE FROM center_stock_config
WHERE item_id = (SELECT id FROM item_master WHERE item_code = 'TRAD-021')
  AND center_id != 24;

-- ── Enrol all non-TRAD STOCK items in all non-corporate centers ───────────────
-- Uses global item defaults as the per-center starting point.
-- Each center gets a slight size-based multiplier as sample data:
--   center 1 (Kozhikode, main)  = 1.0x  (baseline)
--   center 2 (Main Hospital)    = 1.5x  (larger)
--   center 8 (NS Hospital)      = 0.75x (medium)
--   center 9 (Doctors Scan)     = 0.5x  (smaller)

INSERT INTO center_stock_config (center_id, item_id, is_active, minimum_stock, reorder_level)
SELECT
  c.id                                                          AS center_id,
  im.id                                                         AS item_id,
  true                                                          AS is_active,
  ROUND((im.minimum_stock * CASE c.id WHEN 1 THEN 1.0 WHEN 2 THEN 1.5 WHEN 8 THEN 0.75 WHEN 9 THEN 0.5 END)::numeric, 0)
                                                                AS minimum_stock,
  ROUND((im.reorder_level  * CASE c.id WHEN 1 THEN 1.0 WHEN 2 THEN 1.5 WHEN 8 THEN 0.75 WHEN 9 THEN 0.5 END)::numeric, 0)
                                                                AS reorder_level
FROM item_master im
CROSS JOIN centers c
WHERE im.item_type = 'STOCK'
  AND im.active = true
  AND im.item_code != 'TRAD-021'
  AND c.id IN (1, 2, 8, 9)          -- non-corporate centers
ON CONFLICT (center_id, item_id) DO UPDATE
  SET is_active     = true,
      minimum_stock = EXCLUDED.minimum_stock,
      reorder_level = EXCLUDED.reorder_level,
      updated_at    = NOW();

-- ── TRAD-021 at corporate with sample values ──────────────────────────────────
INSERT INTO center_stock_config (center_id, item_id, is_active, minimum_stock, reorder_level)
VALUES (
  24,
  (SELECT id FROM item_master WHERE item_code = 'TRAD-021'),
  true,
  20,    -- alert when credits drop below 20
  50     -- reorder when credits drop to 50
)
ON CONFLICT (center_id, item_id) DO UPDATE
  SET is_active = true, minimum_stock = 20, reorder_level = 50, updated_at = NOW();

-- ── Remove corporate from all non-TRAD items (corporate doesn't hold consumables) ──
DELETE FROM center_stock_config
WHERE center_id = 24
  AND item_id != (SELECT id FROM item_master WHERE item_code = 'TRAD-021');

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  c.name                               AS center,
  COUNT(*)                             AS item_count,
  MIN(csc.minimum_stock)               AS min_min,
  MAX(csc.minimum_stock)               AS max_min
FROM center_stock_config csc
JOIN centers c ON c.id = csc.center_id
WHERE csc.is_active = true
GROUP BY c.id, c.name
ORDER BY c.id;
