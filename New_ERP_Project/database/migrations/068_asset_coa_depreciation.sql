-- Migration 068: Link depreciation settings to Fixed Asset COA accounts
--
-- Instead of a separate asset_depreciation_settings table, useful_life and
-- the paired Accumulated Depreciation / Depreciation Expense accounts are
-- stored directly on the Fixed Asset COA entry (1210–1260).
-- Each asset in asset_master gets a coa_account_id pointing to its GL account.
--
-- Depreciation JE uses:
--   DR  coa.depr_expense_account_id  (5910–5960)
--   CR  coa.accum_depr_account_id    (1291–1295)

-- ── 1. Extend chart_of_accounts ──────────────────────────────────────────────
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS useful_life_years       INTEGER,
  ADD COLUMN IF NOT EXISTS accum_depr_account_id   INTEGER REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS depr_expense_account_id INTEGER REFERENCES chart_of_accounts(id);

-- ── 2. Backfill Fixed Asset parent accounts ───────────────────────────────────
-- 1210 Medical & Radiology Equipment → 10 yrs → accum 1291 / expense 5910
UPDATE chart_of_accounts
SET useful_life_years       = 10,
    accum_depr_account_id   = (SELECT id FROM chart_of_accounts WHERE account_code = '1291' AND is_active = true LIMIT 1),
    depr_expense_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5910' AND is_active = true LIMIT 1)
WHERE account_code = '1210' AND is_active = true;

-- 1220 IT Equipment & Computers → 5 yrs → accum 1292 / expense 5920
UPDATE chart_of_accounts
SET useful_life_years       = 5,
    accum_depr_account_id   = (SELECT id FROM chart_of_accounts WHERE account_code = '1292' AND is_active = true LIMIT 1),
    depr_expense_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5920' AND is_active = true LIMIT 1)
WHERE account_code = '1220' AND is_active = true;

-- 1230 Furniture & Fixtures → 5 yrs → accum 1293 / expense 5930
UPDATE chart_of_accounts
SET useful_life_years       = 5,
    accum_depr_account_id   = (SELECT id FROM chart_of_accounts WHERE account_code = '1293' AND is_active = true LIMIT 1),
    depr_expense_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5930' AND is_active = true LIMIT 1)
WHERE account_code = '1230' AND is_active = true;

-- 1240 Vehicles → 8 yrs → accum 1294 / expense 5940
UPDATE chart_of_accounts
SET useful_life_years       = 8,
    accum_depr_account_id   = (SELECT id FROM chart_of_accounts WHERE account_code = '1294' AND is_active = true LIMIT 1),
    depr_expense_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5940' AND is_active = true LIMIT 1)
WHERE account_code = '1240' AND is_active = true;

-- 1250 Leasehold Improvements → 10 yrs → accum 1295 / expense 5950
UPDATE chart_of_accounts
SET useful_life_years       = 10,
    accum_depr_account_id   = (SELECT id FROM chart_of_accounts WHERE account_code = '1295' AND is_active = true LIMIT 1),
    depr_expense_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5950' AND is_active = true LIMIT 1)
WHERE account_code = '1250' AND is_active = true;

-- 1260 Office Equipment → 5 yrs → accum 1292 / expense 5920
UPDATE chart_of_accounts
SET useful_life_years       = 5,
    accum_depr_account_id   = (SELECT id FROM chart_of_accounts WHERE account_code = '1292' AND is_active = true LIMIT 1),
    depr_expense_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5920' AND is_active = true LIMIT 1)
WHERE account_code = '1260' AND is_active = true;

-- ── 3. Add coa_account_id to asset_master ─────────────────────────────────────
ALTER TABLE asset_master
  ADD COLUMN IF NOT EXISTS coa_account_id INTEGER REFERENCES chart_of_accounts(id);

-- ── 4. Backfill coa_account_id from existing asset_type ──────────────────────
UPDATE asset_master
SET coa_account_id = CASE asset_type
    WHEN 'MODALITY'    THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1)
    WHEN 'EQUIPMENT'   THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1)
    WHEN 'ELECTRONICS' THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1220' AND is_active = true LIMIT 1)
    WHEN 'SOFTWARE'    THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1220' AND is_active = true LIMIT 1)
    WHEN 'FURNITURE'   THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1230' AND is_active = true LIMIT 1)
    WHEN 'APPLIANCE'   THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1260' AND is_active = true LIMIT 1)
    ELSE                    (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1)
  END
WHERE coa_account_id IS NULL AND active = true;

DO $$ BEGIN RAISE NOTICE 'Migration 068 complete: depreciation config linked to COA'; END $$;
