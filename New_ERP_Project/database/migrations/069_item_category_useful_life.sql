-- Migration 069: Category-level useful life override for Fixed Assets
--
-- Adds useful_life_years to item_categories so sub-categories like
-- "Medical Equipment – New" (10yr) and "Medical Equipment – Refurbished" (5yr)
-- can drive depreciation without needing separate COA accounts.
--
-- Depreciation priority:
--   1. item_categories.useful_life_years  (category override)
--   2. chart_of_accounts.useful_life_years (COA account default)
--   3. asset_types.useful_life_years       (asset type fallback)
--   4. 5 years (hard default)

-- ── 1. Add useful_life_years to item_categories ───────────────────────────────
ALTER TABLE item_categories
  ADD COLUMN IF NOT EXISTS useful_life_years INTEGER;

-- ── 2. Add item_category_id to asset_master ───────────────────────────────────
ALTER TABLE asset_master
  ADD COLUMN IF NOT EXISTS item_category_id INTEGER REFERENCES item_categories(id);

-- ── 3. Insert New and Refurbished medical equipment categories (L2) ───────────
-- Parent: FA_MEDICAL_EQUIP (id=1, L1)
INSERT INTO item_categories
  (code, name, level, parent_id, item_type, asset_gl_id, ap_account_id,
   useful_life_years, show_in_item_master, active, sort_order)
SELECT
  'FA_MED_NEW',
  'Medical Equipment – New',
  2,
  (SELECT id FROM item_categories WHERE code = 'FA_MEDICAL_EQUIP' LIMIT 1),
  'FIXED_ASSET',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1),
  10,
  true,
  true,
  10
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE code = 'FA_MED_NEW');

INSERT INTO item_categories
  (code, name, level, parent_id, item_type, asset_gl_id, ap_account_id,
   useful_life_years, show_in_item_master, active, sort_order)
SELECT
  'FA_MED_REFURB',
  'Medical Equipment – Refurbished',
  2,
  (SELECT id FROM item_categories WHERE code = 'FA_MEDICAL_EQUIP' LIMIT 1),
  'FIXED_ASSET',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1),
  5,
  true,
  true,
  20
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE code = 'FA_MED_REFURB');

DO $$ BEGIN RAISE NOTICE 'Migration 069 complete: New/Refurbished medical equipment categories created'; END $$;
