-- Migration 090: Backfill reporter_type for TELERADIOLOGY_COMPANY reporters
-- The INSERT/UPDATE in radiology-reporting.js was not setting reporter_type, so all
-- TELERADIOLOGY_COMPANY reporters got the default 'RADIOLOGIST', which prevented:
--   1. Correct GL account selection (5123 vs 5121)
--   2. RCM GST accrual (18% IGST under Reverse Charge Mechanism)
--   3. Correct consolidation flow (vendor bill vs payment batch, TDS exemption)

UPDATE radiologist_master
SET reporter_type = 'TELERADIOLOGY'
WHERE type = 'TELERADIOLOGY_COMPANY'
  AND reporter_type != 'TELERADIOLOGY';

UPDATE radiologist_master
SET reporter_type = 'RADIOLOGIST'
WHERE type = 'INDIVIDUAL'
  AND reporter_type NOT IN ('RADIOLOGIST', 'INTERNAL');
