-- Migration 074: Finance module corrections
--
-- Fixes:
--   1. BILLING_PAYMENT mappings — wrong account codes (1110/1120/1130 parent groups)
--      corrected to leaf accounts 1111 (Cash), 1112 (Bank), 1113 (UPI digital)
--   2. BILLING_GST mappings   — wrong accounts (2110/2120 parent groups)
--      corrected to 2121 (CGST Payable), 2122 (SGST Payable)
--   3. BILLING_PAYMENT rows missing when 1310 didn't exist — guaranteed UPSERT
--   4. Add VENDOR_PAYMENT mapping (DR AP / CR Bank) for new postVendorPaymentJE
--   5. Add PAYROLL_RUN staff-category mappings (MEDICAL, ADMIN, SUPPORT, TECHNICAL)
--   6. Add center_id + staff_category to payroll_register
--   7. Add credit_days to radiologist_master for per-radiologist payment terms
--   8. Disable PO-level AP posting (only GRN should create AP)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix BILLING_PAYMENT mappings
--    CASH  → DR 1111 (Cash in Hand)
--    CARD  → DR 1112 (Bank – Primary, since card settlements hit bank)
--    UPI   → DR 1113 (Bank – Secondary / digital receipts)
--    BANK  → DR 1112
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'BILLING_PAYMENT', 'CASH',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1111' AND is_active = true LIMIT 1),
  NULL,
  'Cash payment received — DR Cash in Hand (1111)'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '1111' AND is_active = true)
ON CONFLICT (event_type, sub_type) DO UPDATE
  SET debit_account_id = EXCLUDED.debit_account_id,
      description      = EXCLUDED.description,
      updated_at       = NOW();

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'BILLING_PAYMENT', 'CARD',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1112' AND is_active = true LIMIT 1),
  NULL,
  'Card payment — DR Bank Primary (1112)'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '1112' AND is_active = true)
ON CONFLICT (event_type, sub_type) DO UPDATE
  SET debit_account_id = EXCLUDED.debit_account_id,
      description      = EXCLUDED.description,
      updated_at       = NOW();

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'BILLING_PAYMENT', 'UPI',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1113' AND is_active = true
   UNION ALL
   SELECT id FROM chart_of_accounts WHERE account_code = '1112' AND is_active = true
   LIMIT 1),
  NULL,
  'UPI/digital payment — DR Bank (1113 or 1112)'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1113','1112') AND is_active = true)
ON CONFLICT (event_type, sub_type) DO UPDATE
  SET debit_account_id = EXCLUDED.debit_account_id,
      description      = EXCLUDED.description,
      updated_at       = NOW();

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'BILLING_PAYMENT', 'BANK',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1112' AND is_active = true LIMIT 1),
  NULL,
  'Bank/cheque transfer — DR Bank Primary (1112)'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '1112' AND is_active = true)
ON CONFLICT (event_type, sub_type) DO UPDATE
  SET debit_account_id = EXCLUDED.debit_account_id,
      description      = EXCLUDED.description,
      updated_at       = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix BILLING_GST mappings
--    CGST → CR 2121 (CGST Payable)
--    SGST → CR 2122 (SGST Payable)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'BILLING_GST', 'CGST',
  NULL,
  (SELECT id FROM chart_of_accounts WHERE account_code = '2121' AND is_active = true
   UNION ALL
   SELECT id FROM chart_of_accounts WHERE account_code = '2110' AND is_active = true
   LIMIT 1),
  'CGST collected on patient bills — CR CGST Payable (2121)'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('2121','2110') AND is_active = true)
ON CONFLICT (event_type, sub_type) DO UPDATE
  SET credit_account_id = EXCLUDED.credit_account_id,
      description       = EXCLUDED.description,
      updated_at        = NOW();

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'BILLING_GST', 'SGST',
  NULL,
  (SELECT id FROM chart_of_accounts WHERE account_code = '2122' AND is_active = true
   UNION ALL
   SELECT id FROM chart_of_accounts WHERE account_code = '2120' AND is_active = true
   LIMIT 1),
  'SGST collected on patient bills — CR SGST Payable (2122)'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('2122','2120') AND is_active = true)
ON CONFLICT (event_type, sub_type) DO UPDATE
  SET credit_account_id = EXCLUDED.credit_account_id,
      description       = EXCLUDED.description,
      updated_at        = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Vendor Payment mapping
--    When a vendor bill is paid: DR AP account / CR Bank
--    debit_account_id  = generic AP 2113 (overridden at runtime by actual AP account on the bill)
--    credit_account_id = 1112 Bank (overridden at runtime by bank_account selected)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'VENDOR_PAYMENT', 'BANK_TRANSFER',
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '1112' AND is_active = true LIMIT 1),
  'Vendor payment via bank transfer — DR AP (2113) / CR Bank (1112)'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true)
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '1112' AND is_active = true)
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'VENDOR_PAYMENT', 'CASH',
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '1111' AND is_active = true LIMIT 1),
  'Vendor payment via cash — DR AP / CR Cash (1111)'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true)
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '1111' AND is_active = true)
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Payroll staff-category mappings
--    MEDICAL   → DR 5210 Salaries – Medical/Technical  CR 2131 Salaries Payable
--    ADMIN     → DR 5220 Salaries – Administration     CR 2131
--    SUPPORT   → DR 5230 Salaries – Support Staff      CR 2131
--    TECHNICAL → DR 5210 (maps same as medical)        CR 2131
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  _s2210 INTEGER; _s2220 INTEGER; _s2230 INTEGER; _cr INTEGER;
BEGIN
  SELECT id INTO _s2210 FROM chart_of_accounts WHERE account_code = '5210' AND is_active = true LIMIT 1;
  SELECT id INTO _s2220 FROM chart_of_accounts WHERE account_code = '5220' AND is_active = true LIMIT 1;
  SELECT id INTO _s2230 FROM chart_of_accounts WHERE account_code = '5230' AND is_active = true LIMIT 1;
  SELECT id INTO _cr    FROM chart_of_accounts WHERE account_code = '2131' AND is_active = true
    UNION ALL SELECT id FROM chart_of_accounts WHERE account_code = '2130' AND is_active = true
    LIMIT 1;

  IF _s2210 IS NOT NULL AND _cr IS NOT NULL THEN
    INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
    VALUES
      ('PAYROLL_RUN','MEDICAL',    _s2210,            _cr, 'Radiology/Medical staff salaries — DR 5210 / CR 2131'),
      ('PAYROLL_RUN','TECHNICAL',  _s2210,            _cr, 'Technical staff salaries — DR 5210 / CR 2131'),
      ('PAYROLL_RUN','ADMIN',      COALESCE(_s2220,_s2210), _cr, 'Admin salaries — DR 5220 / CR 2131'),
      ('PAYROLL_RUN','NURSING',    _s2210,            _cr, 'Nursing staff salaries — DR 5210 / CR 2131'),
      ('PAYROLL_RUN','SUPPORT',    COALESCE(_s2230,_s2210), _cr, 'Support/housekeeping salaries — DR 5230 / CR 2131'),
      ('PAYROLL_RUN','RECEPTION',  COALESCE(_s2220,_s2210), _cr, 'Reception salaries — DR 5220 / CR 2131'),
      ('PAYROLL_RUN','ACCOUNTS',   COALESCE(_s2220,_s2210), _cr, 'Accounts staff salaries — DR 5220 / CR 2131'),
      ('PAYROLL_RUN','LABORATORY', _s2210,            _cr, 'Lab technician salaries — DR 5210 / CR 2131'),
      ('PAYROLL_RUN','MAINTENANCE',COALESCE(_s2230,_s2210), _cr, 'Maintenance salaries — DR 5230 / CR 2131'),
      ('PAYROLL_RUN','HOUSEKEEPING',COALESCE(_s2230,_s2210),_cr,'Housekeeping salaries — DR 5230 / CR 2131')
    ON CONFLICT (event_type, sub_type) DO UPDATE
      SET debit_account_id = EXCLUDED.debit_account_id,
          credit_account_id= EXCLUDED.credit_account_id,
          description      = EXCLUDED.description,
          updated_at       = NOW();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add employee TDS payable account mapping
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'PAYROLL_RUN', 'TDS',
  NULL,
  (SELECT id FROM chart_of_accounts WHERE account_code = '2141' AND is_active = true
   UNION ALL
   SELECT id FROM chart_of_accounts WHERE account_code = '2140' AND is_active = true
   LIMIT 1),
  'TDS deducted from employee salary — CR TDS Payable (2141)'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('2141','2140') AND is_active = true)
ON CONFLICT (event_type, sub_type) DO UPDATE
  SET credit_account_id = EXCLUDED.credit_account_id,
      description       = EXCLUDED.description,
      updated_at        = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Add center_id + staff_category to payroll_register
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payroll_register
  ADD COLUMN IF NOT EXISTS center_id      INTEGER REFERENCES centers(id),
  ADD COLUMN IF NOT EXISTS staff_category VARCHAR(50);

-- Backfill from employee master
UPDATE payroll_register pr
SET center_id      = e.center_id,
    staff_category = UPPER(e.department)
FROM employees e
WHERE pr.employee_id = e.id
  AND pr.center_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_register_center
  ON payroll_register(center_id);

CREATE INDEX IF NOT EXISTS idx_payroll_register_staff_cat
  ON payroll_register(staff_category);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Add credit_days to radiologist_master
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE radiologist_master
  ADD COLUMN IF NOT EXISTS credit_days INTEGER NOT NULL DEFAULT 30
    CHECK (credit_days >= 0 AND credit_days <= 365);

COMMENT ON COLUMN radiologist_master.credit_days IS
  'Payment terms in days after study date (0 = immediate, 30 = standard monthly)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Mark PO-level JE posting as disabled
--    We add a flag so postProcurementJE knows not to post AP at PO stage;
--    AP is only created at GRN receipt.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO finance_account_mappings
  (event_type, sub_type, debit_account_id, credit_account_id, is_active, description)
VALUES
  ('PO_COMPLETED', '_AP_DISABLED', NULL, NULL, FALSE,
   'AP posting at PO stage is DISABLED — AP is only created at GRN receipt (3-way match)')
ON CONFLICT (event_type, sub_type) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE 'Migration 074 complete: billing/GST mappings fixed, vendor payment mapping added, payroll staff categories added, center_id backfilled, credit_days on radiologist_master';
END $$;
