-- Migration 077: Per-center stock configuration
-- Centers opt in to tracking specific items with their own min/reorder levels

CREATE TABLE IF NOT EXISTS center_stock_config (
  id            SERIAL PRIMARY KEY,
  center_id     INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  minimum_stock NUMERIC(10,3),   -- NULL = use item_master global default
  reorder_level NUMERIC(10,3),   -- NULL = use item_master global default
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE (center_id, item_id)
);

CREATE INDEX idx_csc_center  ON center_stock_config(center_id);
CREATE INDEX idx_csc_item    ON center_stock_config(item_id);
CREATE INDEX idx_csc_active  ON center_stock_config(center_id, is_active);

-- Seed: center 1 (Kozhikode) already has stock movements — auto-enrol those items
INSERT INTO center_stock_config (center_id, item_id, is_active, minimum_stock, reorder_level)
SELECT DISTINCT
  mv.center_id,
  mv.item_id,
  true,
  im.minimum_stock,
  im.reorder_level
FROM inventory_movements mv
JOIN item_master im ON im.id = mv.item_id
WHERE mv.center_id IS NOT NULL
  AND im.item_type = 'STOCK'
  AND im.active = true
ON CONFLICT (center_id, item_id) DO NOTHING;

-- Seed: corporate (center 24) — enrol all STOCK items it has received
INSERT INTO center_stock_config (center_id, item_id, is_active, minimum_stock, reorder_level)
SELECT DISTINCT
  mv.center_id,
  mv.item_id,
  true,
  im.minimum_stock,
  im.reorder_level
FROM inventory_movements mv
JOIN item_master im ON im.id = mv.item_id
WHERE mv.center_id = 24
  AND mv.movement_type IN ('STOCK_IN','OPENING')
  AND im.item_type = 'STOCK'
  AND im.active = true
ON CONFLICT (center_id, item_id) DO NOTHING;

SELECT c.name AS center, im.item_code, im.item_name,
       csc.minimum_stock, csc.reorder_level
FROM center_stock_config csc
JOIN centers c ON c.id = csc.center_id
JOIN item_master im ON im.id = csc.item_id
ORDER BY c.name, im.item_code;
