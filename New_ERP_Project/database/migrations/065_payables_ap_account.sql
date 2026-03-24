-- Migration 065: Add ap_account_id to payables table
-- Stores which AP GL account was credited at accrual time so that
-- the payment JE can DR the exact same account, keeping AP clean.

ALTER TABLE payables
  ADD COLUMN IF NOT EXISTS ap_account_id INTEGER REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS reporter_id   INTEGER REFERENCES radiologist_master(id);

-- Backfill: payables created from reporting JEs use 2113 (AP – Service Providers)
UPDATE payables p
SET ap_account_id = (
  SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1
)
WHERE p.ap_account_id IS NULL;

COMMENT ON COLUMN payables.ap_account_id IS
  'GL account credited at accrual time (DR at payment time to clear AP)';
COMMENT ON COLUMN payables.reporter_id IS
  'FK to radiologist_master — set for reporter/radiologist payables';
