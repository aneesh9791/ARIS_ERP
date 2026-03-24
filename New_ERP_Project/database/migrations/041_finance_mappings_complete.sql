-- ============================================================
-- Migration 041: Complete Finance Account Mappings
-- Adds missing PO_COMPLETED and EXPENSE_RECORDED sub_types
-- introduced by the L1/L2 item category hierarchy (migration 040).
-- Also corrects AP account references to use the correct codes
-- from the healthcare COA (migration 036).
-- ============================================================

-- ── AP Account reference guide ─────────────────────────────
-- 2111  AP – Medical & Drug Suppliers   (consumables, film, contrast)
-- 2112  AP – Equipment & IT Vendors     (equipment, IT, AMC)
-- 2113  AP – Service Providers          (radiology fees, teleradiology, lease, referrals)
-- ── Expense / COGS account reference guide ─────────────────
-- 5110  Medical Consumables (parent) → use sub-accounts below
-- 5111  Contrast Media Consumed
-- 5112  Syringes, Gloves & Disposables
-- 5113  Film & Digital Media Consumed
-- 5121  Radiologist Reading Fees
-- 5123  Tele-Radiology Service Costs
-- 5131  Equipment AMC & Service Contracts
-- 5310  Rent & Lease Charges            (revenue-share, min-guarantee, equipment lease)
-- 5360  Facility Maintenance & Repairs  (spare parts, electrical, general maintenance)
-- 5410  Stationery & Office Supplies
-- 5520  Referral Fees & Commissions     (patient agents, doctor referrals)
-- 5710  ERP / Software Subscriptions    (IT/SaaS)
-- 5994  Miscellaneous Expenses          (GENERAL fallback)

-- ════════════════════════════════════════════════════════════
-- 1. PO_COMPLETED — missing sub_types
-- ════════════════════════════════════════════════════════════

-- FILM: X-Ray film, CD/DVD media, report covers
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'PO_COMPLETED', 'FILM',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5113'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2111'),
  'Film & digital media purchase — Dr Film & Digital Media, Cr AP Medical Suppliers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5113')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2111')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- MAINTENANCE: Spare parts, electrical, facility repairs
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'PO_COMPLETED', 'MAINTENANCE',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5360'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
  'Maintenance & repairs purchase — Dr Facility Maintenance, Cr AP Service Providers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5360')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 2. EXPENSE_RECORDED — direct cost sub_types
-- ════════════════════════════════════════════════════════════

-- Contrast media
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'CONTRAST',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5111'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2111'),
  'Contrast media expense — Dr Contrast Media, Cr AP Medical Suppliers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5111')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2111')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Consumables (syringes, cannulas, PPE)
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'CONSUMABLES',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5112'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2111'),
  'Clinical consumables expense — Dr Syringes & Disposables, Cr AP Medical Suppliers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5112')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2111')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Film & digital media
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'FILM',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5113'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2111'),
  'Film & digital media expense — Dr Film & Digital Media, Cr AP Medical Suppliers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5113')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2111')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Radiologist reading fees
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'RADIOLOGY_FEES',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5121'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
  'Radiologist reading fees — Dr Radiologist Fees, Cr AP Service Providers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5121')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Tele-radiology
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'TELERADIOLOGY',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5123'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
  'Tele-radiology service cost — Dr Tele-Radiology Costs, Cr AP Service Providers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5123')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Equipment AMC / service contracts
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'AMC',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5131'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
  'Equipment AMC expense — Dr Equipment AMC, Cr AP Service Providers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5131')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 3. EXPENSE_RECORDED — business model / facility sub_types
-- ════════════════════════════════════════════════════════════

-- Revenue share (hospital/partner share of revenue)
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'REVENUE_SHARE',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
  'Revenue share / facility share — Dr Rent & Lease, Cr AP Service Providers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5310')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Minimum guarantee payments
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'MIN_GUARANTEE',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
  'Minimum guarantee payment — Dr Rent & Lease, Cr AP Service Providers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5310')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Equipment lease (operating lease monthly payment)
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'EQUIPMENT_LEASE',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2112'),
  'Equipment lease payment — Dr Rent & Lease, Cr AP Equipment Vendors'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5310')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2112')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Patient acquisition agents
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'PATIENT_AGENT',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5520'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
  'Patient agent commission — Dr Referral Fees & Commissions, Cr AP Service Providers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5520')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Doctor referral fees
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'DOCTOR_REFERRAL',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5520'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
  'Doctor referral fee / incentive — Dr Referral Fees & Commissions, Cr AP Service Providers'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5520')
  AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2113')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 4. Fix existing EXPENSE_RECORDED mappings
--    Migration 037 used account code '2010' which does not exist
--    in the healthcare COA (036). Update to correct AP codes.
-- ════════════════════════════════════════════════════════════

UPDATE finance_account_mappings
SET credit_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
    updated_at = NOW()
WHERE event_type = 'EXPENSE_RECORDED'
  AND sub_type IN ('RENT','ELECTRICITY','MAINTENANCE','PROFESSIONAL_FEES')
  AND credit_account_id IS NULL;

UPDATE finance_account_mappings
SET credit_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2112'),
    updated_at = NOW()
WHERE event_type = 'EXPENSE_RECORDED'
  AND sub_type = 'IT'
  AND credit_account_id IS NULL;

UPDATE finance_account_mappings
SET credit_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
    updated_at = NOW()
WHERE event_type = 'EXPENSE_RECORDED'
  AND sub_type = 'GENERAL'
  AND credit_account_id IS NULL;

-- Fix PO_COMPLETED null AP references
UPDATE finance_account_mappings
SET credit_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2111'),
    updated_at = NOW()
WHERE event_type = 'PO_COMPLETED'
  AND sub_type = 'CONSUMABLES'
  AND credit_account_id IS NULL;

UPDATE finance_account_mappings
SET credit_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2112'),
    updated_at = NOW()
WHERE event_type = 'PO_COMPLETED'
  AND sub_type IN ('EQUIPMENT','IT')
  AND credit_account_id IS NULL;

UPDATE finance_account_mappings
SET credit_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2113'),
    updated_at = NOW()
WHERE event_type = 'PO_COMPLETED'
  AND sub_type = 'GENERAL'
  AND credit_account_id IS NULL;

-- Fix PAYROLL_RUN null payable references
UPDATE finance_account_mappings
SET credit_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2131'),
    updated_at = NOW()
WHERE event_type = 'PAYROLL_RUN'
  AND sub_type = 'SALARY'
  AND credit_account_id IS NULL;

UPDATE finance_account_mappings
SET credit_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2132'),
    updated_at = NOW()
WHERE event_type = 'PAYROLL_RUN'
  AND sub_type = 'PF'
  AND credit_account_id IS NULL;

UPDATE finance_account_mappings
SET credit_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2133'),
    updated_at = NOW()
WHERE event_type = 'PAYROLL_RUN'
  AND sub_type = 'ESI'
  AND credit_account_id IS NULL;
