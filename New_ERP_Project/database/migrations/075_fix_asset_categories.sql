-- ════════════════════════════════════════════════════════════════════════════
-- Migration 075: Fix Asset Categories — align asset_type with item_categories
--
-- Problem: asset_master.asset_type stores legacy codes (MODALITY, EQUIPMENT,
-- APPLIANCE, ELECTRONICS) that don't exist in item_categories and don't map
-- to the Chart of Accounts.
--
-- Fix:
--   1. Insert L1 item_category codes into asset_types + asset_depreciation_settings
--   2. Migrate asset_master.asset_type from old codes → L1 item_category codes
--   3. Fix coa_account_id for all migrated assets
--   4. Backfill item_category_id (L1) where missing
--   5. Recreate asset_register_view using item_categories for names + useful life
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Insert new L1 codes into asset_types ──────────────────────────────────
INSERT INTO asset_types (type_code, name, description, depreciation_method, useful_life_years) VALUES
  ('FA_MED_NEW',    'Medical Equipment – New',          'Radiology & medical equipment (new)',         'STRAIGHT_LINE', 13),
  ('FA_MED_REFURB', 'Medical Equipment – Refurbished',  'Radiology & medical equipment (refurbished)', 'STRAIGHT_LINE',  7),
  ('FA_IT',         'IT Assets',                        'Computers, servers, network equipment',       'STRAIGHT_LINE',  6),
  ('FA_FURNITURE',  'Furniture & Fixtures',             'Office and patient furniture',                'STRAIGHT_LINE', 10),
  ('FA_VEHICLE',    'Vehicles',                         'Cars, vans, ambulances',                      'STRAIGHT_LINE',  8),
  ('FA_CIVIL',      'Civil & Infrastructure',           'Building improvements, HVAC, electrical',     'STRAIGHT_LINE', 30),
  ('FA_SOFTWARE',   'Software & Licences',              'Application software and licences',           'STRAIGHT_LINE',  3),
  ('FA_APPLIANCE',  'Office & Electrical Appliances',   'AC units, refrigerators, generators',         'STRAIGHT_LINE', 10)
ON CONFLICT (type_code) DO UPDATE
  SET name                = EXCLUDED.name,
      description         = EXCLUDED.description,
      depreciation_method = EXCLUDED.depreciation_method,
      useful_life_years   = EXCLUDED.useful_life_years;

-- ── 2. Insert/update asset_depreciation_settings for new codes ───────────────
INSERT INTO asset_depreciation_settings (category_code, useful_life_years) VALUES
  ('FA_MED_NEW',    13),
  ('FA_MED_REFURB',  7),
  ('FA_IT',          6),
  ('FA_FURNITURE',  10),
  ('FA_VEHICLE',     8),
  ('FA_CIVIL',      30),
  ('FA_SOFTWARE',    3),
  ('FA_APPLIANCE',  10)
ON CONFLICT (category_code) DO UPDATE
  SET useful_life_years = EXCLUDED.useful_life_years,
      updated_at        = NOW();

-- ── 3. Migrate asset_master.asset_type → L1 item_category codes ──────────────
-- Mapping rationale (radiology centre context):
--   MODALITY    → FA_MED_NEW   (imaging modalities = new medical equipment)
--   EQUIPMENT   → FA_MED_NEW   (general medical/clinical equipment)
--   ELECTRONICS → FA_IT        (computers, workstations, displays)
--   FURNITURE   → FA_FURNITURE
--   SOFTWARE    → FA_SOFTWARE
--   APPLIANCE   → FA_APPLIANCE (AC units, generators, etc.)
UPDATE asset_master
SET asset_type = CASE asset_type
    WHEN 'MODALITY'    THEN 'FA_MED_NEW'
    WHEN 'EQUIPMENT'   THEN 'FA_MED_NEW'
    WHEN 'ELECTRONICS' THEN 'FA_IT'
    WHEN 'FURNITURE'   THEN 'FA_FURNITURE'
    WHEN 'SOFTWARE'    THEN 'FA_SOFTWARE'
    WHEN 'APPLIANCE'   THEN 'FA_APPLIANCE'
    ELSE asset_type
  END
WHERE asset_type IN ('MODALITY','EQUIPMENT','ELECTRONICS','FURNITURE','SOFTWARE','APPLIANCE');

-- ── 4. Correct coa_account_id for all assets (full backfill) ─────────────────
UPDATE asset_master
SET coa_account_id = CASE asset_type
    WHEN 'FA_MED_NEW'    THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1)
    WHEN 'FA_MED_REFURB' THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1)
    WHEN 'FA_IT'         THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1220' AND is_active = true LIMIT 1)
    WHEN 'FA_FURNITURE'  THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1230' AND is_active = true LIMIT 1)
    WHEN 'FA_VEHICLE'    THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1240' AND is_active = true LIMIT 1)
    WHEN 'FA_CIVIL'      THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1250' AND is_active = true LIMIT 1)
    WHEN 'FA_SOFTWARE'   THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1310' AND is_active = true LIMIT 1)
    WHEN 'FA_APPLIANCE'  THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1270' AND is_active = true LIMIT 1)
    ELSE coa_account_id
  END
WHERE asset_type IN ('FA_MED_NEW','FA_MED_REFURB','FA_IT','FA_FURNITURE','FA_VEHICLE','FA_CIVIL','FA_SOFTWARE','FA_APPLIANCE');

-- ── 5. Backfill item_category_id (L1) for assets that don't have one ─────────
UPDATE asset_master am
SET item_category_id = ic.id
FROM item_categories ic
WHERE am.item_category_id IS NULL
  AND ic.code   = am.asset_type
  AND ic.level  = 1
  AND ic.active = true
  AND am.active = true;

-- ── 6. Recreate asset_register_view using item_categories + COA ──────────────
DROP VIEW IF EXISTS asset_register_view;
CREATE VIEW asset_register_view AS
SELECT
  am.id,
  am.asset_code,
  am.asset_name,
  am.asset_type                                                   AS category_code,
  COALESCE(ic_l1.name, am.asset_type)                            AS category_name,
  am.center_id,
  c.name                                                          AS center_name,
  am.manufacturer,
  am.model,
  am.serial_number,
  COALESCE(am.condition, 'NEW')                                   AS condition,
  am.purchase_date                                                AS acquisition_date,
  am.purchase_cost                                                AS acquisition_value,
  COALESCE(am.salvage_value, 0)                                   AS salvage_value,
  am.status,
  am.notes,
  am.active,
  am.grn_id,
  am.grn_item_id,
  am.item_master_id,
  am.item_category_id,
  am.coa_account_id,
  am.journal_entry_id,
  pr.grn_number,
  po.vendor_name                                                  AS grn_vendor_name,
  -- Useful life priority: L2 category > L1 category > COA account > 5yr default
  COALESCE(
    ic_l2.useful_life_years,
    ic_l1.useful_life_years,
    coa.useful_life_years,
    5
  )                                                               AS useful_life_years,
  -- Annual depreciation (straight-line)
  CASE
    WHEN COALESCE(ic_l2.useful_life_years, ic_l1.useful_life_years, coa.useful_life_years, 5) > 0
    THEN ROUND(
           (am.purchase_cost - COALESCE(am.salvage_value, 0))
           / COALESCE(ic_l2.useful_life_years, ic_l1.useful_life_years, coa.useful_life_years, 5),
           2
         )
    ELSE 0
  END                                                             AS annual_depreciation,
  -- Years elapsed since purchase (capped at useful life)
  LEAST(
    DATE_PART('year', AGE(CURRENT_DATE, am.purchase_date))::INTEGER,
    COALESCE(ic_l2.useful_life_years, ic_l1.useful_life_years, coa.useful_life_years, 5)
  )                                                               AS years_elapsed,
  -- Net book value
  GREATEST(
    COALESCE(am.salvage_value, 0),
    am.purchase_cost - (
      CASE
        WHEN COALESCE(ic_l2.useful_life_years, ic_l1.useful_life_years, coa.useful_life_years, 5) > 0
        THEN ROUND(
               (am.purchase_cost - COALESCE(am.salvage_value, 0))
               / COALESCE(ic_l2.useful_life_years, ic_l1.useful_life_years, coa.useful_life_years, 5),
               2
             )
        ELSE 0
      END
      * LEAST(
          DATE_PART('year', AGE(CURRENT_DATE, am.purchase_date))::INTEGER,
          COALESCE(ic_l2.useful_life_years, ic_l1.useful_life_years, coa.useful_life_years, 5)
        )
    )
  )                                                               AS book_value
FROM asset_master am
LEFT JOIN item_categories   ic_l1 ON ic_l1.code = am.asset_type AND ic_l1.level = 1
LEFT JOIN item_categories   ic_l2 ON ic_l2.id   = am.item_category_id
LEFT JOIN chart_of_accounts coa   ON coa.id      = am.coa_account_id
LEFT JOIN centers           c     ON am.center_id = c.id
LEFT JOIN purchase_receipts pr    ON am.grn_id    = pr.id
LEFT JOIN procurement_orders po   ON pr.po_id     = po.id
WHERE am.active = true
  AND am.asset_type IN (
    'FA_MED_NEW','FA_MED_REFURB','FA_IT','FA_FURNITURE',
    'FA_VEHICLE','FA_CIVIL','FA_SOFTWARE','FA_APPLIANCE'
  );

DO $$ BEGIN
  RAISE NOTICE 'Migration 075 complete: asset_type migrated to L1 item_category codes; asset_register_view rebuilt';
END $$;
