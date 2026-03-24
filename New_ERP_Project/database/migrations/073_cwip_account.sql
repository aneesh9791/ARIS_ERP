-- Migration 073: Capital Work-in-Progress (CWIP) account
--
-- Correct fixed-asset procurement accounting flow:
--
--   GRN receipt   → DR 1280 Capital WIP       CR 2112 AP       (liability at goods receipt)
--   Capitalisation → DR 1210 Fixed Asset       CR 1280 CWIP     (reclassification to FA)
--
-- Previously capitalisation was DR Fixed Asset / CR AP (wrong — AP created too late).
-- CWIP acts as a clearing account: GRN creates the AP, capitalisation clears CWIP.

INSERT INTO chart_of_accounts
  (account_code, account_name, account_type, account_category,
   parent_account_id, normal_balance, is_active)
SELECT
  '1280',
  'Capital Work-in-Progress',
  'BALANCE_SHEET',
  'ASSET',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1200' AND is_active = true LIMIT 1),
  'DEBIT',
  true
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '1280');

DO $$ BEGIN
  RAISE NOTICE 'Migration 073 complete: account 1280 Capital Work-in-Progress created';
END $$;
