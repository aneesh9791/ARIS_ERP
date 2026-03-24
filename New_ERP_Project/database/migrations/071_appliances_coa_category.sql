-- Migration 071: Office & Electrical Appliances — COA account + item categories
--
-- Adds a dedicated Fixed Asset account (1270) for appliances so they are
-- reported separately from Furniture & Fixtures and depreciated over 7 years.
--
-- New accounts:
--   1270  Office & Electrical Appliances     (Fixed Asset)
--   1297  Accum. Depr. – Appliances          (Contra Asset, child of 1290)
--   5970  Depreciation – Appliances          (Expense, child of 5900)
--
-- New item categories (L1 + L2):
--   FA_APPLIANCE (L1)
--   ├── FA_AC_UNIT
--   ├── FA_REFRIGERATOR
--   ├── FA_WATER_PURIFIER
--   ├── FA_GENERATOR
--   └── FA_OTHER_APPLIANCE

-- ── 1. Insert COA accounts ─────────────────────────────────────────────────────

-- 1270  Office & Electrical Appliances (Fixed Asset, parent = 1200 group)
INSERT INTO chart_of_accounts
  (account_code, account_name, account_type, account_category,
   parent_account_id, normal_balance, is_active)
SELECT '1270', 'Office & Electrical Appliances', 'BALANCE_SHEET', 'ASSET',
       (SELECT id FROM chart_of_accounts WHERE account_code = '1200' AND is_active = true LIMIT 1),
       'DEBIT', true
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '1270');

-- 1297  Accum. Depr. – Appliances (Contra Asset, parent = 1290)
INSERT INTO chart_of_accounts
  (account_code, account_name, account_type, account_category,
   parent_account_id, normal_balance, is_active)
SELECT '1297', 'Accum. Depr. – Appliances', 'BALANCE_SHEET', 'ASSET',
       (SELECT id FROM chart_of_accounts WHERE account_code = '1290' AND is_active = true LIMIT 1),
       'CREDIT', true
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '1297');

-- 5970  Depreciation – Appliances (Expense, parent = 5900)
INSERT INTO chart_of_accounts
  (account_code, account_name, account_type, account_category,
   parent_account_id, normal_balance, is_active)
SELECT '5970', 'Depreciation – Appliances', 'INCOME_STATEMENT', 'EXPENSE',
       (SELECT id FROM chart_of_accounts WHERE account_code = '5900' AND is_active = true LIMIT 1),
       'DEBIT', true
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5970');

-- ── 2. Set depreciation config on 1270 ────────────────────────────────────────
UPDATE chart_of_accounts
SET useful_life_years       = 7,
    accum_depr_account_id   = (SELECT id FROM chart_of_accounts WHERE account_code = '1297' AND is_active = true LIMIT 1),
    depr_expense_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5970' AND is_active = true LIMIT 1)
WHERE account_code = '1270' AND is_active = true;

-- ── 3. Backfill APPLIANCE assets to use 1270 (was incorrectly pointing to 1260) ─
UPDATE asset_master
SET coa_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1270' AND is_active = true LIMIT 1)
WHERE asset_type = 'APPLIANCE' AND active = true;

-- ── 4. Insert FA_APPLIANCE L1 item category ────────────────────────────────────
INSERT INTO item_categories
  (code, name, level, parent_id, item_type,
   asset_gl_id, ap_account_id,
   show_in_item_master, active, sort_order)
SELECT
  'FA_APPLIANCE', 'Office & Electrical Appliances', 1, NULL, 'FIXED_ASSET',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1270' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1),
  true, true, 30
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE code = 'FA_APPLIANCE');

-- ── 5. Insert L2 sub-categories under FA_APPLIANCE ────────────────────────────
INSERT INTO item_categories
  (code, name, level, parent_id, item_type,
   asset_gl_id, ap_account_id,
   show_in_item_master, active, sort_order)
SELECT
  v.code, v.name, 2,
  (SELECT id FROM item_categories WHERE code = 'FA_APPLIANCE' LIMIT 1),
  'FIXED_ASSET',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1270' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1),
  true, true, v.so
FROM (VALUES
  ('FA_AC_UNIT',          'AC / Air Conditioner',      10),
  ('FA_REFRIGERATOR',     'Refrigerator / Freezer',    20),
  ('FA_WATER_PURIFIER',   'Water Purifier / RO Unit',  30),
  ('FA_GENERATOR',        'Generator / Inverter',      40),
  ('FA_OTHER_APPLIANCE',  'Other Appliance',           50)
) AS v(code, name, so)
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE code = v.code);

DO $$ BEGIN
  RAISE NOTICE 'Migration 071 complete: 1270/1297/5970 created; FA_APPLIANCE L1+L2 categories inserted';
END $$;
