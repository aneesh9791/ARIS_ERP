-- Migration 079: Patch missing center_stock_config entries
-- Root cause: Migration 078 CROSS JOIN should cover all items, but CON-038 (id=43,
-- MRI Earplugs Disposable) was found missing from center 1 in audit.
-- This migration re-runs the same upsert logic for any STOCK items still missing
-- from any of the four non-corporate centers, so it is safe to re-apply.

INSERT INTO center_stock_config (center_id, item_id, is_active, minimum_stock, reorder_level)
SELECT
  c.id                                                          AS center_id,
  im.id                                                         AS item_id,
  true                                                          AS is_active,
  ROUND((COALESCE(im.minimum_stock, 5) * CASE c.id WHEN 1 THEN 1.0 WHEN 2 THEN 1.5 WHEN 8 THEN 0.75 WHEN 9 THEN 0.5 END)::numeric, 0)
                                                                AS minimum_stock,
  ROUND((COALESCE(im.reorder_level,  10) * CASE c.id WHEN 1 THEN 1.0 WHEN 2 THEN 1.5 WHEN 8 THEN 0.75 WHEN 9 THEN 0.5 END)::numeric, 0)
                                                                AS reorder_level
FROM item_master im
CROSS JOIN centers c
WHERE im.item_type = 'STOCK'
  AND im.active = true
  AND im.item_code != 'TRAD-021'
  AND c.id IN (1, 2, 8, 9)
  AND NOT EXISTS (
    SELECT 1 FROM center_stock_config csc2
    WHERE csc2.center_id = c.id AND csc2.item_id = im.id
  );

-- Verify CON-038 now present in all four centers
SELECT
  im.item_code,
  im.item_name,
  c.name  AS center,
  csc.is_active,
  csc.minimum_stock,
  csc.reorder_level
FROM item_master im
JOIN center_stock_config csc ON csc.item_id = im.id
JOIN centers c ON c.id = csc.center_id
WHERE im.item_code = 'CON-038'
ORDER BY c.id;
