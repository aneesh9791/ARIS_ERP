-- ============================================================
-- Migration 037: Finance Integration Tables
-- finance_account_mappings, payroll_register, expenses
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. FINANCE ACCOUNT MAPPINGS
--    Rules engine: event_type + sub_type → debit/credit accounts
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_account_mappings (
  id                SERIAL PRIMARY KEY,
  event_type        VARCHAR(50)  NOT NULL,   -- BILLING_PAYMENT, PO_COMPLETED, PAYROLL_RUN, EXPENSE_RECORDED
  sub_type          VARCHAR(100) NOT NULL,   -- CT_SCAN, MRI, SALARY, RENT, etc.
  debit_account_id  INTEGER REFERENCES chart_of_accounts(id),
  credit_account_id INTEGER REFERENCES chart_of_accounts(id),
  description       TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_type, sub_type)
);

-- Seed default mappings using account codes
-- Billing: payment method → cash/bank accounts
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_PAYMENT', 'CASH',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1110'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  'Cash payment received — Dr Cash, Cr Accounts Receivable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1110','1310'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_PAYMENT', 'BANK',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1120'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  'Bank/cheque payment — Dr Bank, Cr Accounts Receivable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1120','1310'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_PAYMENT', 'UPI',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1130'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  'UPI/digital payment — Dr Digital Receipts, Cr Accounts Receivable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1130','1310'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_PAYMENT', 'CARD',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1120'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  'Card payment — Dr Bank, Cr Accounts Receivable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1120','1310'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Billing revenue by service type
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_REVENUE', 'CT_SCAN',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '4110'),
  'CT Scan service revenue — Dr AR, Cr CT Scan Revenue'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1310','4110'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_REVENUE', 'MRI',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '4120'),
  'MRI service revenue — Dr AR, Cr MRI Revenue'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1310','4120'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_REVENUE', 'XRAY',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '4130'),
  'X-Ray service revenue — Dr AR, Cr X-Ray Revenue'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1310','4130'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_REVENUE', 'ULTRASOUND',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '4140'),
  'Ultrasound service revenue — Dr AR, Cr Ultrasound Revenue'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1310','4140'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_REVENUE', 'MAMMOGRAPHY',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '4150'),
  'Mammography revenue — Dr AR, Cr Mammography Revenue'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1310','4150'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_REVENUE', 'PET_CT',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '4160'),
  'PET-CT revenue — Dr AR, Cr PET-CT Revenue'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1310','4160'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_REVENUE', 'GENERAL',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '4210'),
  'General consultation / other service — Dr AR, Cr Consultation Fees'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1310','4210'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- GST
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_GST', 'CGST',
  NULL,
  (SELECT id FROM chart_of_accounts WHERE account_code = '2110'),
  'CGST collected — Cr CGST Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2110')
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'BILLING_GST', 'SGST',
  NULL,
  (SELECT id FROM chart_of_accounts WHERE account_code = '2120'),
  'SGST collected — Cr SGST Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '2120')
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Procurement
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'PO_COMPLETED', 'CONSUMABLES',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5110'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2010'),
  'Medical consumables purchase — Dr Consumables, Cr Accounts Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5110','2010'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'PO_COMPLETED', 'EQUIPMENT',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2010'),
  'Equipment purchase — Dr Medical Equipment, Cr Accounts Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1310','2010'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'PO_COMPLETED', 'IT',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1320'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2010'),
  'IT equipment purchase — Dr IT Equipment, Cr Accounts Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('1320','2010'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'PO_COMPLETED', 'GENERAL',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5400'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2010'),
  'General purchase — Dr Admin Expenses, Cr Accounts Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5400','2010'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Payroll
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'PAYROLL_RUN', 'SALARY',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5210'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2020'),
  'Salary accrual — Dr Salaries, Cr Salaries Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5210','2020'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'PAYROLL_RUN', 'PF',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5240'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2030'),
  'PF contribution — Dr PF/ESI, Cr PF/ESI Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5240','2030'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'PAYROLL_RUN', 'ESI',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5240'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2030'),
  'ESI contribution — Dr PF/ESI, Cr PF/ESI Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5240','2030'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- Expenses
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'RENT',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5310'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2010'),
  'Rent expense — Dr Rent, Cr Accounts Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5310','2010'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'ELECTRICITY',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5320'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2010'),
  'Electricity bill — Dr Electricity, Cr Accounts Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5320','2010'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'MAINTENANCE',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5360'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2010'),
  'Maintenance expense — Dr Facility Maintenance, Cr Accounts Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5360','2010'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'IT',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5710'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2010'),
  'IT/software expense — Dr IT, Cr Accounts Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5710','2010'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT 'EXPENSE_RECORDED', 'GENERAL',
  (SELECT id FROM chart_of_accounts WHERE account_code = '5994'),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2010'),
  'Miscellaneous expense — Dr Misc Expenses, Cr Accounts Payable'
WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code IN ('5994','2010'))
ON CONFLICT (event_type, sub_type) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- 2. PAYROLL REGISTER
--    Persists each payroll run per employee per month
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_register (
  id                  SERIAL PRIMARY KEY,
  employee_id         INTEGER NOT NULL REFERENCES employees(id),
  pay_period_year     SMALLINT NOT NULL,
  pay_period_month    SMALLINT NOT NULL CHECK (pay_period_month BETWEEN 1 AND 12),
  basic_salary        NUMERIC(12,2) NOT NULL DEFAULT 0,
  hra                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  da                  NUMERIC(12,2)  NOT NULL DEFAULT 0,
  gross_salary        NUMERIC(12,2) NOT NULL DEFAULT 0,
  pf_deduction        NUMERIC(12,2) NOT NULL DEFAULT 0,
  esi_deduction       NUMERIC(12,2) NOT NULL DEFAULT 0,
  professional_tax    NUMERIC(12,2) NOT NULL DEFAULT 0,
  tds_deduction       NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions    NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary          NUMERIC(12,2) NOT NULL DEFAULT 0,
  working_days        SMALLINT,
  present_days        SMALLINT,
  leave_days          SMALLINT,
  status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','APPROVED','PAID')),
  journal_entry_id    INTEGER REFERENCES journal_entries(id),
  approved_by         INTEGER REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  remarks             TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, pay_period_year, pay_period_month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_register_period
  ON payroll_register(pay_period_year, pay_period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_register_employee
  ON payroll_register(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_register_status
  ON payroll_register(status);

-- ──────────────────────────────────────────────────────────
-- 3. EXPENSES TABLE (real implementation, replaces stub)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_records (
  id                  SERIAL PRIMARY KEY,
  expense_number      VARCHAR(30) UNIQUE NOT NULL,
  expense_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  category            VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  sub_category        VARCHAR(100),
  description         TEXT NOT NULL,
  vendor_name         VARCHAR(200),
  vendor_gstin        VARCHAR(20),
  amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method      VARCHAR(30) DEFAULT 'BANK',
  payment_status      VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (payment_status IN ('PENDING','PAID','CANCELLED')),
  reference_number    VARCHAR(100),
  center_id           INTEGER REFERENCES centers(id),
  debit_account_id    INTEGER REFERENCES chart_of_accounts(id),
  credit_account_id   INTEGER REFERENCES chart_of_accounts(id),
  journal_entry_id    INTEGER REFERENCES journal_entries(id),
  bill_attachment_url TEXT,
  notes               TEXT,
  created_by          INTEGER REFERENCES users(id),
  approved_by         INTEGER REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_records_date
  ON expense_records(expense_date);
CREATE INDEX IF NOT EXISTS idx_expense_records_category
  ON expense_records(category);
CREATE INDEX IF NOT EXISTS idx_expense_records_status
  ON expense_records(payment_status);

-- Auto-number function for expenses
CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expense_number IS NULL OR NEW.expense_number = '' THEN
    NEW.expense_number := 'EXP-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
      LPAD(nextval('expense_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS expense_number_seq START 1;

DROP TRIGGER IF EXISTS trg_expense_number ON expense_records;
CREATE TRIGGER trg_expense_number
  BEFORE INSERT ON expense_records
  FOR EACH ROW EXECUTE FUNCTION generate_expense_number();

-- ──────────────────────────────────────────────────────────
-- 4. Add source reference columns to journal_entries
--    so auto-posted JEs link back to source transaction
-- ──────────────────────────────────────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS source_module   VARCHAR(50),   -- BILLING, PROCUREMENT, PAYROLL, EXPENSE
  ADD COLUMN IF NOT EXISTS source_id       INTEGER,       -- FK to source table row id
  ADD COLUMN IF NOT EXISTS source_ref      VARCHAR(100),  -- human-readable ref e.g. "Bill B-2026-00123"
  ADD COLUMN IF NOT EXISTS is_auto_posted  BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_je_source ON journal_entries(source_module, source_id);
