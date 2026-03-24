-- Migration 083: Fix item_master column widths
-- 'FIXED_ASSET' is 11 chars but item_type was VARCHAR(10) — widen to VARCHAR(20)
ALTER TABLE item_master ALTER COLUMN item_type TYPE VARCHAR(20);
-- category names from item_categories can exceed 30 chars — widen to VARCHAR(200)
ALTER TABLE item_master ALTER COLUMN category TYPE VARCHAR(200);
