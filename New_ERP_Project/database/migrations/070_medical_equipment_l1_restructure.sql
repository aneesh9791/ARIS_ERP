-- Migration 070: Restructure Medical Equipment categories to L1/L2
--
-- Before (wrong):
--   FA_MEDICAL_EQUIP (L1)
--   ├── FA_CT, FA_MRI, ... (L2)
--   ├── FA_MED_NEW (L2, inserted by 069 — WRONG)
--   └── FA_MED_REFURB (L2, inserted by 069 — WRONG)
--
-- After (correct):
--   Medical Equipment – New (L1, 10yr)   [was FA_MED_NEW, promoted to L1]
--   ├── CT Scanner – New (L2)
--   ├── MRI Scanner – New (L2)
--   ├── X-Ray Machine – New (L2)
--   ├── Ultrasound – New (L2)
--   ├── Mammography – New (L2)
--   ├── Fluoroscopy – New (L2)
--   ├── DEXA – New (L2)
--   ├── PET-CT – New (L2)
--   └── Other Medical Equipment – New (L2)
--
--   Medical Equipment – Refurbished (L1, 5yr)   [was FA_MED_REFURB, promoted to L1]
--   ├── CT Scanner – Refurbished (L2)
--   ├── MRI Scanner – Refurbished (L2)
--   ├── X-Ray Machine – Refurbished (L2)
--   ├── Ultrasound – Refurbished (L2)
--   ├── Mammography – Refurbished (L2)
--   ├── Fluoroscopy – Refurbished (L2)
--   ├── DEXA – Refurbished (L2)
--   ├── PET-CT – Refurbished (L2)
--   └── Other Medical Equipment – Refurbished (L2)
--
--   Old FA_MEDICAL_EQUIP L1 and all its original L2 children → deactivated

-- ── 1. Promote FA_MED_NEW to L1 ────────────────────────────────────────────────
UPDATE item_categories
SET level      = 1,
    parent_id  = NULL,
    sort_order = 10,
    updated_at = NOW()
WHERE code = 'FA_MED_NEW';

-- ── 2. Promote FA_MED_REFURB to L1 ─────────────────────────────────────────────
UPDATE item_categories
SET level      = 1,
    parent_id  = NULL,
    sort_order = 20,
    updated_at = NOW()
WHERE code = 'FA_MED_REFURB';

-- ── 3. Deactivate old FA_MEDICAL_EQUIP L1 and its original L2 children ─────────
UPDATE item_categories
SET active     = false,
    updated_at = NOW()
WHERE code IN (
  'FA_MEDICAL_EQUIP',
  'FA_MRI',
  'FA_CT',
  'FA_XRAY_MACHINE',
  'FA_ULTRASOUND',
  'FA_MAMMOGRAPHY',
  'FA_FLUORO',
  'FA_DEXA',
  'FA_PETCT',
  'FA_OTHER_MED_EQUIP'
);

-- ── 4. Insert L2 children under Medical Equipment – New ────────────────────────
-- asset_gl_id  → 1210 (Medical Equipment)
-- ap_account_id → 2112 (AP – Medical Equipment)
INSERT INTO item_categories
  (code, name, level, parent_id, item_type,
   asset_gl_id, ap_account_id,
   show_in_item_master, active, sort_order)
SELECT
  v.code, v.name, 2,
  (SELECT id FROM item_categories WHERE code = 'FA_MED_NEW' LIMIT 1),
  'FIXED_ASSET',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1),
  true, true, v.so
FROM (VALUES
  ('FA_CT_NEW',         'CT Scanner – New',                  10),
  ('FA_MRI_NEW',        'MRI Scanner – New',                 20),
  ('FA_XRAY_NEW',       'X-Ray Machine – New',               30),
  ('FA_ULTRA_NEW',      'Ultrasound – New',                  40),
  ('FA_MAMMO_NEW',      'Mammography – New',                 50),
  ('FA_FLUORO_NEW',     'Fluoroscopy – New',                 60),
  ('FA_DEXA_NEW',       'DEXA – New',                        70),
  ('FA_PETCT_NEW',      'PET-CT – New',                      80),
  ('FA_OTHER_MED_NEW',  'Other Medical Equipment – New',     90)
) AS v(code, name, so)
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE code = v.code);

-- ── 5. Insert L2 children under Medical Equipment – Refurbished ────────────────
INSERT INTO item_categories
  (code, name, level, parent_id, item_type,
   asset_gl_id, ap_account_id,
   show_in_item_master, active, sort_order)
SELECT
  v.code, v.name, 2,
  (SELECT id FROM item_categories WHERE code = 'FA_MED_REFURB' LIMIT 1),
  'FIXED_ASSET',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1),
  true, true, v.so
FROM (VALUES
  ('FA_CT_REFURB',         'CT Scanner – Refurbished',                  10),
  ('FA_MRI_REFURB',        'MRI Scanner – Refurbished',                 20),
  ('FA_XRAY_REFURB',       'X-Ray Machine – Refurbished',               30),
  ('FA_ULTRA_REFURB',      'Ultrasound – Refurbished',                  40),
  ('FA_MAMMO_REFURB',      'Mammography – Refurbished',                 50),
  ('FA_FLUORO_REFURB',     'Fluoroscopy – Refurbished',                 60),
  ('FA_DEXA_REFURB',       'DEXA – Refurbished',                        70),
  ('FA_PETCT_REFURB',      'PET-CT – Refurbished',                      80),
  ('FA_OTHER_MED_REFURB',  'Other Medical Equipment – Refurbished',     90)
) AS v(code, name, so)
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE code = v.code);

DO $$ BEGIN
  RAISE NOTICE 'Migration 070 complete: Medical Equipment restructured into New/Refurbished L1 groups with 9 L2 sub-categories each';
END $$;
