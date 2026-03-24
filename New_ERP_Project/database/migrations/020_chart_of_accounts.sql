-- Migration 020: Comprehensive Chart of Accounts System
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/backend/migrations/chart_of_accounts.sql
-- Fix applied: journal_entry_lines references cost_centers(id) and projects(id).
--   In the source, journal_entry_lines was defined BEFORE cost_centers and projects,
--   causing FK errors. Order corrected: cost_centers → projects → journal_entry_lines.
-- Fix applied: chart_of_accounts already created in 019 — ALTER TABLE used to add
--   new columns (IF NOT EXISTS), preserving existing rows from 019.
-- Fix applied: financial_periods already created in 019 — added period_code column
--   and UNIQUE constraint via ALTER TABLE IF NOT EXISTS.
-- Fix applied: tax_configuration already created in 019 — ALTER TABLE used to add
--   missing columns (tax_code, tax_name, tax_type, applicable_on, etc.) IF NOT EXISTS.

-- Extend chart_of_accounts with full set of columns (019 has a minimal version)
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_category    VARCHAR(30);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_subcategory VARCHAR(50);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS nature              VARCHAR(20);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS normal_balance      VARCHAR(10);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS opening_balance     DECIMAL(15,2) DEFAULT 0;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS current_balance     DECIMAL(15,2) DEFAULT 0;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS currency            VARCHAR(3) DEFAULT 'INR';
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS is_consolidated     BOOLEAN DEFAULT false;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS requires_approval   BOOLEAN DEFAULT false;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS approval_limit      DECIMAL(15,2) DEFAULT 0;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS tax_applicable      BOOLEAN DEFAULT false;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS gst_rate            DECIMAL(5,2) DEFAULT 0;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS tds_applicable      BOOLEAN DEFAULT false;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS tds_rate            DECIMAL(5,2) DEFAULT 0;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS department_id       INTEGER REFERENCES departments(id);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS center_id           INTEGER REFERENCES centers(id);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS created_by          INTEGER REFERENCES users(id);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS updated_by          INTEGER REFERENCES users(id);

-- Extend financial_periods with new columns for 020 (period_code etc.)
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS period_code  VARCHAR(20);
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS period_type  VARCHAR(20);
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS is_current   BOOLEAN DEFAULT false;

-- Add UNIQUE constraint on period_code if not already present
DO $$
BEGIN
    ALTER TABLE financial_periods ADD CONSTRAINT uq_financial_periods_code UNIQUE (period_code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- Extend tax_configuration with full columns
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS tax_code                  VARCHAR(10);
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS tax_name                  VARCHAR(50);
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS tax_type                  VARCHAR(20);
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS applicable_on             VARCHAR(20);
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS input_tax_credit_allowed  BOOLEAN DEFAULT false;
ALTER TABLE tax_configuration ADD COLUMN IF NOT EXISTS effective_date            DATE;

-- Ensure tax_code UNIQUE constraint (for new insert using ON CONFLICT)
DO $$
BEGIN
    ALTER TABLE tax_configuration ADD CONSTRAINT uq_tax_configuration_code UNIQUE (tax_code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- ACCOUNT GROUPS TABLE
CREATE TABLE IF NOT EXISTS account_groups (
    id              SERIAL PRIMARY KEY,
    group_code      VARCHAR(10) NOT NULL UNIQUE,
    group_name      VARCHAR(100) NOT NULL,
    group_type      VARCHAR(20) NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    parent_group_id INTEGER REFERENCES account_groups(id),
    description     TEXT,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TRANSACTION TYPES TABLE
-- Note: FK references to chart_of_accounts use deferred resolution (accounts inserted below)
CREATE TABLE IF NOT EXISTS transaction_types (
    id                        SERIAL PRIMARY KEY,
    type_code                 VARCHAR(10) NOT NULL UNIQUE,
    type_name                 VARCHAR(50) NOT NULL,
    description               TEXT,
    default_debit_account_id  INTEGER REFERENCES chart_of_accounts(id),
    default_credit_account_id INTEGER REFERENCES chart_of_accounts(id),
    requires_approval         BOOLEAN DEFAULT false,
    approval_required_above   DECIMAL(15,2) DEFAULT 0,
    tax_applicable            BOOLEAN DEFAULT false,
    is_active                 BOOLEAN DEFAULT true,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- JOURNAL ENTRIES TABLE
CREATE TABLE IF NOT EXISTS journal_entries (
    id                  SERIAL PRIMARY KEY,
    entry_number        VARCHAR(50) NOT NULL UNIQUE,
    entry_date          DATE NOT NULL,
    transaction_type_id INTEGER REFERENCES transaction_types(id),
    reference_type      VARCHAR(30),
    reference_id        INTEGER,
    description         TEXT,
    total_debit         DECIMAL(15,2) NOT NULL,
    total_credit        DECIMAL(15,2) NOT NULL,
    currency            VARCHAR(3) DEFAULT 'INR',
    exchange_rate       DECIMAL(10,6) DEFAULT 1,
    status              VARCHAR(20) DEFAULT 'DRAFT',
    approval_required   BOOLEAN DEFAULT false,
    approved_by         INTEGER REFERENCES users(id),
    approved_at         TIMESTAMP,
    posted_by           INTEGER REFERENCES users(id),
    posted_at           TIMESTAMP,
    reversed_by         INTEGER REFERENCES users(id),
    reversed_at         TIMESTAMP,
    reversal_entry_id   INTEGER REFERENCES journal_entries(id),
    center_id           INTEGER REFERENCES centers(id),
    department_id       INTEGER REFERENCES departments(id),
    created_by          INTEGER REFERENCES users(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by          INTEGER REFERENCES users(id),
    notes               TEXT
);

-- COST CENTERS TABLE (must exist before journal_entry_lines)
CREATE TABLE IF NOT EXISTS cost_centers (
    id                    SERIAL PRIMARY KEY,
    cost_center_code      VARCHAR(10) NOT NULL UNIQUE,
    cost_center_name      VARCHAR(100) NOT NULL,
    parent_cost_center_id INTEGER REFERENCES cost_centers(id),
    department_id         INTEGER REFERENCES departments(id),
    center_id             INTEGER REFERENCES centers(id),
    manager_id            INTEGER REFERENCES users(id),
    budget_limit          DECIMAL(15,2) DEFAULT 0,
    current_expense       DECIMAL(15,2) DEFAULT 0,
    is_active             BOOLEAN DEFAULT true,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PROJECTS TABLE (must exist before journal_entry_lines)
CREATE TABLE IF NOT EXISTS projects (
    id            SERIAL PRIMARY KEY,
    project_code  VARCHAR(20) NOT NULL UNIQUE,
    project_name  VARCHAR(100) NOT NULL,
    project_type  VARCHAR(20),
    client_name   VARCHAR(100),
    start_date    DATE,
    end_date      DATE,
    status        VARCHAR(20) DEFAULT 'ACTIVE',
    budget_amount DECIMAL(15,2) DEFAULT 0,
    actual_cost   DECIMAL(15,2) DEFAULT 0,
    manager_id    INTEGER REFERENCES users(id),
    center_id     INTEGER REFERENCES centers(id),
    description   TEXT,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- JOURNAL ENTRY LINES TABLE (depends on cost_centers and projects)
CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id               SERIAL PRIMARY KEY,
    journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_number      INTEGER NOT NULL,
    account_id       INTEGER REFERENCES chart_of_accounts(id),
    description      TEXT,
    debit_amount     DECIMAL(15,2) DEFAULT 0,
    credit_amount    DECIMAL(15,2) DEFAULT 0,
    currency         VARCHAR(3) DEFAULT 'INR',
    exchange_rate    DECIMAL(10,6) DEFAULT 1,
    cost_center_id   INTEGER REFERENCES cost_centers(id),
    project_id       INTEGER REFERENCES projects(id),
    tax_amount       DECIMAL(15,2) DEFAULT 0,
    tax_rate         DECIMAL(5,2) DEFAULT 0,
    reference_type   VARCHAR(30),
    reference_id     INTEGER,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(journal_entry_id, line_number)
);

-- TRIAL BALANCE TABLE
CREATE TABLE IF NOT EXISTS trial_balance (
    id                  SERIAL PRIMARY KEY,
    financial_period_id INTEGER REFERENCES financial_periods(id),
    account_id          INTEGER REFERENCES chart_of_accounts(id),
    opening_balance     DECIMAL(15,2) DEFAULT 0,
    total_debits        DECIMAL(15,2) DEFAULT 0,
    total_credits       DECIMAL(15,2) DEFAULT 0,
    closing_balance     DECIMAL(15,2) DEFAULT 0,
    generated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    generated_by        INTEGER REFERENCES users(id)
);

-- BALANCE SHEET TABLE
CREATE TABLE IF NOT EXISTS balance_sheet (
    id                  SERIAL PRIMARY KEY,
    financial_period_id INTEGER REFERENCES financial_periods(id),
    as_of_date          DATE NOT NULL,
    total_assets        DECIMAL(15,2) DEFAULT 0,
    total_liabilities   DECIMAL(15,2) DEFAULT 0,
    total_equity        DECIMAL(15,2) DEFAULT 0,
    generated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    generated_by        INTEGER REFERENCES users(id)
);

-- PROFIT AND LOSS TABLE
CREATE TABLE IF NOT EXISTS profit_loss (
    id                  SERIAL PRIMARY KEY,
    financial_period_id INTEGER REFERENCES financial_periods(id),
    period_start_date   DATE NOT NULL,
    period_end_date     DATE NOT NULL,
    total_revenue       DECIMAL(15,2) DEFAULT 0,
    total_expenses      DECIMAL(15,2) DEFAULT 0,
    gross_profit        DECIMAL(15,2) DEFAULT 0,
    operating_expenses  DECIMAL(15,2) DEFAULT 0,
    operating_income    DECIMAL(15,2) DEFAULT 0,
    net_income          DECIMAL(15,2) DEFAULT 0,
    generated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    generated_by        INTEGER REFERENCES users(id)
);

-- ACCOUNT RECONCILIATION TABLE
CREATE TABLE IF NOT EXISTS account_reconciliation (
    id                  SERIAL PRIMARY KEY,
    account_id          INTEGER REFERENCES chart_of_accounts(id),
    reconciliation_date DATE NOT NULL,
    statement_balance   DECIMAL(15,2) DEFAULT 0,
    book_balance        DECIMAL(15,2) DEFAULT 0,
    difference          DECIMAL(15,2) DEFAULT 0,
    reconciled_items    TEXT,
    unreconciled_items  TEXT,
    status              VARCHAR(20) DEFAULT 'PENDING',
    reconciled_by       INTEGER REFERENCES users(id),
    reconciled_at       TIMESTAMP,
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sequences
CREATE SEQUENCE IF NOT EXISTS journal_entry_seq START 1;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_code       ON chart_of_accounts(account_code);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type       ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_category   ON chart_of_accounts(account_category);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent     ON chart_of_accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date         ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status       ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_type         ON journal_entries(transaction_type_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry    ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account  ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_code            ON cost_centers(cost_center_code);
CREATE INDEX IF NOT EXISTS idx_cost_centers_center          ON cost_centers(center_id);
CREATE INDEX IF NOT EXISTS idx_projects_code                ON projects(project_code);
CREATE INDEX IF NOT EXISTS idx_projects_status              ON projects(status);
CREATE INDEX IF NOT EXISTS idx_financial_periods_current    ON financial_periods(is_current);
CREATE INDEX IF NOT EXISTS idx_trial_balance_period         ON trial_balance(financial_period_id);
CREATE INDEX IF NOT EXISTS idx_account_reconciliation_acct  ON account_reconciliation(account_id);

-- Views
CREATE OR REPLACE VIEW account_hierarchy AS
SELECT
    coa.id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    coa.account_category,
    coa.account_subcategory,
    coa.parent_account_id,
    coa.account_level,
    coa.nature,
    coa.normal_balance,
    coa.current_balance,
    coa.is_active,
    parent.account_name AS parent_account_name,
    parent.account_code AS parent_account_code,
    CASE
        WHEN coa.parent_account_id IS NULL THEN 'Root'
        ELSE 'Child'
    END AS hierarchy_level
FROM chart_of_accounts coa
LEFT JOIN chart_of_accounts parent ON coa.parent_account_id = parent.id
WHERE coa.is_active = true
ORDER BY coa.account_code;

CREATE OR REPLACE VIEW transaction_summary AS
SELECT
    je.id,
    je.entry_number,
    je.entry_date,
    tt.type_name        AS transaction_type,
    je.reference_type,
    je.reference_id,
    je.description,
    je.total_debit,
    je.total_credit,
    je.status,
    je.currency,
    c.name              AS center_name,
    d.name              AS department_name,
    creator.name        AS created_by_name,
    approver.name       AS approved_by_name,
    poster.name         AS posted_by_name,
    COUNT(jel.id)       AS line_count,
    STRING_AGG(DISTINCT coa.account_name, ', ') AS affected_accounts
FROM journal_entries je
LEFT JOIN transaction_types        tt       ON je.transaction_type_id = tt.id
LEFT JOIN centers                  c        ON je.center_id = c.id
LEFT JOIN departments              d        ON je.department_id = d.id
LEFT JOIN users                    creator  ON je.created_by = creator.id
LEFT JOIN users                    approver ON je.approved_by = approver.id
LEFT JOIN users                    poster   ON je.posted_by = poster.id
LEFT JOIN journal_entry_lines      jel      ON je.id = jel.journal_entry_id
LEFT JOIN chart_of_accounts        coa      ON jel.account_id = coa.id
GROUP BY je.id, je.entry_number, je.entry_date, tt.type_name, je.reference_type,
         je.reference_id, je.description, je.total_debit, je.total_credit, je.status,
         je.currency, c.name, d.name, creator.name, approver.name, poster.name
ORDER BY je.entry_date DESC;

CREATE OR REPLACE VIEW account_balance_summary AS
SELECT
    coa.id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    coa.account_category,
    coa.current_balance,
    coa.normal_balance,
    CASE WHEN coa.normal_balance = 'DEBIT'  THEN coa.current_balance ELSE 0 END AS debit_balance,
    CASE WHEN coa.normal_balance = 'CREDIT' THEN coa.current_balance ELSE 0 END AS credit_balance,
    COUNT(jel.id)                         AS transaction_count,
    COALESCE(SUM(jel.debit_amount),  0)   AS total_debits,
    COALESCE(SUM(jel.credit_amount), 0)   AS total_credits,
    MAX(je.entry_date)                    AS last_transaction_date
FROM chart_of_accounts coa
LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
LEFT JOIN journal_entries     je  ON jel.journal_entry_id = je.id AND je.status = 'POSTED'
WHERE coa.is_active = true
GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type,
         coa.account_category, coa.current_balance, coa.normal_balance
ORDER BY coa.account_code;

-- Functions
CREATE OR REPLACE FUNCTION create_journal_entry(
    p_entry_date          DATE,
    p_transaction_type_id INTEGER,
    p_reference_type      VARCHAR,
    p_reference_id        INTEGER,
    p_description         TEXT,
    p_lines               JSON,
    p_created_by          INTEGER,
    p_center_id           INTEGER DEFAULT NULL,
    p_department_id       INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_entry_id     INTEGER;
    v_entry_number VARCHAR;
    v_total_debit  DECIMAL := 0;
    v_total_credit DECIMAL := 0;
    v_line_record  JSON;
    v_line_index   INTEGER;
BEGIN
    FOR v_line_index IN 0..json_array_length(p_lines) - 1 LOOP
        v_line_record  := p_lines->v_line_index;
        v_total_debit  := v_total_debit  + COALESCE((v_line_record->>'debit_amount')::DECIMAL, 0);
        v_total_credit := v_total_credit + COALESCE((v_line_record->>'credit_amount')::DECIMAL, 0);
    END LOOP;

    IF v_total_debit != v_total_credit THEN
        RAISE EXCEPTION 'Total debits (%) must equal total credits (%)', v_total_debit, v_total_credit;
    END IF;

    v_entry_number := 'JE-' || to_char(p_entry_date, 'YYYY-MM-DD') || '-' ||
                      LPAD(nextval('journal_entry_seq')::text, 4, '0');

    INSERT INTO journal_entries (
        entry_number, entry_date, transaction_type_id, reference_type,
        reference_id, description, total_debit, total_credit,
        center_id, department_id, created_by, created_at
    ) VALUES (
        v_entry_number, p_entry_date, p_transaction_type_id, p_reference_type,
        p_reference_id, p_description, v_total_debit, v_total_credit,
        p_center_id, p_department_id, p_created_by, CURRENT_TIMESTAMP
    ) RETURNING id INTO v_entry_id;

    FOR v_line_index IN 0..json_array_length(p_lines) - 1 LOOP
        v_line_record := p_lines->v_line_index;

        INSERT INTO journal_entry_lines (
            journal_entry_id, line_number, account_id, description,
            debit_amount, credit_amount, created_at
        ) VALUES (
            v_entry_id, v_line_index + 1,
            (v_line_record->>'account_id')::INTEGER,
            (v_line_record->>'description'),
            COALESCE((v_line_record->>'debit_amount')::DECIMAL,  0),
            COALESCE((v_line_record->>'credit_amount')::DECIMAL, 0),
            CURRENT_TIMESTAMP
        );

        UPDATE chart_of_accounts
        SET current_balance = current_balance +
            CASE
                WHEN coa.normal_balance = 'DEBIT' THEN
                    COALESCE((v_line_record->>'debit_amount')::DECIMAL,  0) -
                    COALESCE((v_line_record->>'credit_amount')::DECIMAL, 0)
                ELSE
                    COALESCE((v_line_record->>'credit_amount')::DECIMAL, 0) -
                    COALESCE((v_line_record->>'debit_amount')::DECIMAL,  0)
            END,
            updated_at = CURRENT_TIMESTAMP
        FROM chart_of_accounts coa
        WHERE coa.id = (v_line_record->>'account_id')::INTEGER;
    END LOOP;

    RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION post_journal_entry(p_entry_id INTEGER, p_posted_by INTEGER)
RETURNS VOID AS $$
DECLARE
    v_entry_status VARCHAR;
BEGIN
    SELECT status INTO v_entry_status FROM journal_entries WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Journal entry not found';
    END IF;

    IF v_entry_status != 'APPROVED' THEN
        RAISE EXCEPTION 'Journal entry must be approved before posting';
    END IF;

    UPDATE journal_entries
    SET status     = 'POSTED',
        posted_by  = p_posted_by,
        posted_at  = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_entry_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reverse_journal_entry(
    p_original_entry_id INTEGER,
    p_reversal_date     DATE,
    p_reversal_reason   TEXT,
    p_reversed_by       INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_original_entry    RECORD;
    v_reversal_entry_id INTEGER;
    v_reversal_lines    JSON;
    v_line_record       RECORD;
BEGIN
    SELECT * INTO v_original_entry FROM journal_entries WHERE id = p_original_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original journal entry not found';
    END IF;

    v_reversal_lines := '[]'::JSON;

    FOR v_line_record IN
        SELECT jel.account_id, jel.description, jel.debit_amount, jel.credit_amount
        FROM journal_entry_lines jel
        WHERE jel.journal_entry_id = p_original_entry_id
        ORDER BY jel.line_number
    LOOP
        v_reversal_lines := v_reversal_lines || json_build_object(
            'account_id',    v_line_record.account_id,
            'description',   'Reversal: ' || COALESCE(v_line_record.description, ''),
            'debit_amount',  v_line_record.credit_amount,
            'credit_amount', v_line_record.debit_amount
        );
    END LOOP;

    v_reversal_entry_id := create_journal_entry(
        p_reversal_date,
        v_original_entry.transaction_type_id,
        'REVERSAL',
        p_original_entry_id,
        'Reversal of ' || v_original_entry.entry_number || ': ' || p_reversal_reason,
        v_reversal_lines,
        v_original_entry.center_id,
        v_original_entry.department_id,
        p_reversed_by
    );

    UPDATE journal_entries
    SET status            = 'REVERSED',
        reversed_by       = p_reversed_by,
        reversed_at       = CURRENT_TIMESTAMP,
        reversal_entry_id = v_reversal_entry_id,
        updated_at        = CURRENT_TIMESTAMP
    WHERE id = p_original_entry_id;

    PERFORM post_journal_entry(v_reversal_entry_id, p_reversed_by);

    RETURN v_reversal_entry_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_trial_balance(p_period_id INTEGER)
RETURNS VOID AS $$
BEGIN
    DELETE FROM trial_balance WHERE financial_period_id = p_period_id;

    INSERT INTO trial_balance (
        financial_period_id, account_id, opening_balance,
        total_debits, total_credits, closing_balance
    )
    SELECT
        p_period_id,
        coa.id,
        COALESCE(coa.opening_balance, 0),
        COALESCE(SUM(jel.debit_amount),  0),
        COALESCE(SUM(jel.credit_amount), 0),
        COALESCE(coa.opening_balance, 0) +
        CASE
            WHEN coa.normal_balance = 'DEBIT' THEN
                COALESCE(SUM(jel.debit_amount),  0) - COALESCE(SUM(jel.credit_amount), 0)
            ELSE
                COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount),  0)
        END
    FROM chart_of_accounts coa
    LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
    LEFT JOIN journal_entries     je  ON jel.journal_entry_id = je.id
        AND je.status = 'POSTED'
        AND je.entry_date >= (SELECT start_date FROM financial_periods WHERE id = p_period_id)
        AND je.entry_date <= (SELECT end_date   FROM financial_periods WHERE id = p_period_id)
    WHERE coa.is_active = true
    GROUP BY coa.id, coa.opening_balance, coa.normal_balance;
END;
$$ LANGUAGE plpgsql;

-- Sample data: account groups
INSERT INTO account_groups (group_code, group_name, group_type, description) VALUES
('ASSETS',      'Assets',      'ASSET',     'All asset accounts'),
('LIABILITIES', 'Liabilities', 'LIABILITY', 'All liability accounts'),
('EQUITY',      'Equity',      'EQUITY',    'All equity accounts'),
('REVENUE',     'Revenue',     'REVENUE',   'All revenue accounts'),
('EXPENSES',    'Expenses',    'EXPENSE',   'All expense accounts')
ON CONFLICT (group_code) DO NOTHING;

-- Full chart of accounts (extended version — 019 seed already covers codes 1000-5200)
INSERT INTO chart_of_accounts (
    account_code, account_name, account_type, account_category, nature, normal_balance,
    description, opening_balance
) VALUES
('1000', 'ASSETS',                    'ASSET',    'ASSETS',             'DEBIT',  'DEBIT',  'Total Assets', 0),
('1100', 'CURRENT ASSETS',            'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'Current Assets', 0),
('1110', 'Cash and Cash Equivalents', 'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'Cash, Bank Accounts', 0),
('1111', 'Cash in Hand',              'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'Physical Cash', 0),
('1112', 'Bank Accounts',             'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'All Bank Accounts', 0),
('1120', 'Accounts Receivable',       'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'Patient Receivables', 0),
('1121', 'Patient Receivables',       'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'Amount due from patients', 0),
('1122', 'Insurance Receivables',     'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'Amount due from insurance', 0),
('1130', 'Inventory',                 'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'Medical Supplies Inventory', 0),
('1131', 'Medical Consumables',       'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'Medical Consumables Stock', 0),
('1132', 'Pharmaceutical Inventory',  'ASSET',    'CURRENT ASSETS',     'DEBIT',  'DEBIT',  'Medicine Stock', 0),
('1200', 'FIXED ASSETS',              'ASSET',    'FIXED ASSETS',       'DEBIT',  'DEBIT',  'Fixed Assets', 0),
('1210', 'Medical Equipment',         'ASSET',    'FIXED ASSETS',       'DEBIT',  'DEBIT',  'Medical Machinery', 0),
('1220', 'Furniture and Fixtures',    'ASSET',    'FIXED ASSETS',       'DEBIT',  'DEBIT',  'Office Furniture', 0),
('1230', 'Computer Equipment',        'ASSET',    'FIXED ASSETS',       'DEBIT',  'DEBIT',  'Computers and IT', 0),
('1240', 'Buildings',                 'ASSET',    'FIXED ASSETS',       'DEBIT',  'DEBIT',  'Hospital Buildings', 0),
('1250', 'Accumulated Depreciation',  'ASSET',    'FIXED ASSETS',       'CREDIT', 'CREDIT', 'Accumulated Depreciation', 0),
('2000', 'LIABILITIES',               'LIABILITY','LIABILITIES',        'CREDIT', 'CREDIT', 'Total Liabilities', 0),
('2100', 'CURRENT LIABILITIES',       'LIABILITY','CURRENT LIABILITIES','CREDIT', 'CREDIT', 'Current Liabilities', 0),
('2110', 'Accounts Payable',          'LIABILITY','CURRENT LIABILITIES','CREDIT', 'CREDIT', 'Supplier Payables', 0),
('2111', 'Supplier Payables',         'LIABILITY','CURRENT LIABILITIES','CREDIT', 'CREDIT', 'Amount due to suppliers', 0),
('2112', 'Salary Payable',            'LIABILITY','CURRENT LIABILITIES','CREDIT', 'CREDIT', 'Employee Salaries', 0),
('2120', 'Tax Payable',               'LIABILITY','CURRENT LIABILITIES','CREDIT', 'CREDIT', 'GST and Other Taxes', 0),
('2121', 'GST Payable',               'LIABILITY','CURRENT LIABILITIES','CREDIT', 'CREDIT', 'GST Liability', 0),
('2122', 'TDS Payable',               'LIABILITY','CURRENT LIABILITIES','CREDIT', 'CREDIT', 'TDS Liability', 0),
('2200', 'LONG-TERM LIABILITIES',     'LIABILITY','LONG-TERM LIABILITIES','CREDIT','CREDIT','Long-term Liabilities', 0),
('2210', 'Bank Loans',                'LIABILITY','LONG-TERM LIABILITIES','CREDIT','CREDIT','Long-term Bank Loans', 0),
('3000', 'EQUITY',                    'EQUITY',   'EQUITY',             'CREDIT', 'CREDIT', 'Total Equity', 0),
('3100', 'Share Capital',             'EQUITY',   'EQUITY',             'CREDIT', 'CREDIT', 'Owner''s Capital', 0),
('3200', 'Retained Earnings',         'EQUITY',   'EQUITY',             'CREDIT', 'CREDIT', 'Retained Earnings', 0),
('4000', 'REVENUE',                   'REVENUE',  'REVENUE',            'CREDIT', 'CREDIT', 'Total Revenue', 0),
('4100', 'OPERATING REVENUE',         'REVENUE',  'OPERATING REVENUE',  'CREDIT', 'CREDIT', 'Operating Revenue', 0),
('4110', 'Patient Services Revenue',  'REVENUE',  'OPERATING REVENUE',  'CREDIT', 'CREDIT', 'Patient Consultation Fees', 0),
('4111', 'Consultation Fees',         'REVENUE',  'OPERATING REVENUE',  'CREDIT', 'CREDIT', 'Doctor Consultation', 0),
('4112', 'Diagnostic Services',       'REVENUE',  'OPERATING REVENUE',  'CREDIT', 'CREDIT', 'Lab and Imaging Services', 0),
('4113', 'Surgical Services',         'REVENUE',  'OPERATING REVENUE',  'CREDIT', 'CREDIT', 'Surgical Procedures', 0),
('4120', 'Pharmacy Revenue',          'REVENUE',  'OPERATING REVENUE',  'CREDIT', 'CREDIT', 'Medicine Sales', 0),
('4200', 'OTHER REVENUE',             'REVENUE',  'OTHER REVENUE',      'CREDIT', 'CREDIT', 'Other Income', 0),
('4210', 'Rental Income',             'REVENUE',  'OTHER REVENUE',      'CREDIT', 'CREDIT', 'Equipment Rental', 0),
('5000', 'EXPENSES',                  'EXPENSE',  'EXPENSES',           'DEBIT',  'DEBIT',  'Total Expenses', 0),
('5100', 'OPERATING EXPENSES',        'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Operating Expenses', 0),
('5110', 'Salaries and Wages',        'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Employee Salaries', 0),
('5111', 'Doctor Salaries',           'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Medical Staff Salaries', 0),
('5112', 'Nursing Staff Salaries',    'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Nursing Salaries', 0),
('5113', 'Administrative Salaries',   'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Admin Staff Salaries', 0),
('5120', 'Medical Supplies',          'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Medical Consumables', 0),
('5121', 'Consumable Expenses',       'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Daily Consumables', 0),
('5122', 'Pharmaceutical Expenses',   'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Medicine Costs', 0),
('5130', 'Rent and Utilities',        'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Rent and Utilities', 0),
('5131', 'Rent Expense',              'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Building Rent', 0),
('5132', 'Electricity Expenses',      'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Power Bills', 0),
('5133', 'Water Expenses',            'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Water Bills', 0),
('5140', 'Maintenance Expenses',      'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Equipment Maintenance', 0),
('5141', 'Equipment Maintenance',     'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Medical Equipment Maintenance', 0),
('5142', 'Building Maintenance',      'EXPENSE',  'OPERATING EXPENSES', 'DEBIT',  'DEBIT',  'Building Repairs', 0),
('5200', 'DEPRECIATION',              'EXPENSE',  'DEPRECIATION',       'DEBIT',  'DEBIT',  'Depreciation Expenses', 0),
('5210', 'Equipment Depreciation',    'EXPENSE',  'DEPRECIATION',       'DEBIT',  'DEBIT',  'Medical Equipment Depreciation', 0),
('5220', 'Building Depreciation',     'EXPENSE',  'DEPRECIATION',       'DEBIT',  'DEBIT',  'Building Depreciation', 0)
ON CONFLICT (account_code) DO NOTHING;

-- Set up parent-child relationships
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1000') WHERE account_code IN ('1100','1200');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1100') WHERE account_code IN ('1110','1120','1130');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1110') WHERE account_code IN ('1111','1112');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1120') WHERE account_code IN ('1121','1122');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1130') WHERE account_code IN ('1131','1132');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1200') WHERE account_code IN ('1210','1220','1230','1240','1250');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2000') WHERE account_code IN ('2100','2200');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2100') WHERE account_code IN ('2110','2120');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2110') WHERE account_code IN ('2111','2112');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2120') WHERE account_code IN ('2121','2122');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '3000') WHERE account_code IN ('3100','3200');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4000') WHERE account_code IN ('4100','4200');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4100') WHERE account_code IN ('4110','4120');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4110') WHERE account_code IN ('4111','4112','4113');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5000') WHERE account_code IN ('5100','5200');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5100') WHERE account_code IN ('5110','5120','5130','5140');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5110') WHERE account_code IN ('5111','5112','5113');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5120') WHERE account_code IN ('5121','5122');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5130') WHERE account_code IN ('5131','5132','5133');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5140') WHERE account_code IN ('5141','5142');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5200') WHERE account_code IN ('5210','5220');

-- Update account levels
UPDATE chart_of_accounts SET account_level = 1 WHERE parent_account_id IS NULL;
UPDATE chart_of_accounts SET account_level = 2 WHERE parent_account_id IN (SELECT id FROM chart_of_accounts WHERE account_level = 1);
UPDATE chart_of_accounts SET account_level = 3 WHERE parent_account_id IN (SELECT id FROM chart_of_accounts WHERE account_level = 2);
UPDATE chart_of_accounts SET account_level = 4 WHERE parent_account_id IN (SELECT id FROM chart_of_accounts WHERE account_level = 3);

-- Insert default transaction types
INSERT INTO transaction_types (type_code, type_name, description, default_debit_account_id, default_credit_account_id) VALUES
('PAT_PAYMENT',       'Patient Payment',       'Payment received from patients',
 (SELECT id FROM chart_of_accounts WHERE account_code = '1112'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '4111')),
('SUPPLIER_PAYMENT',  'Supplier Payment',      'Payment to suppliers',
 (SELECT id FROM chart_of_accounts WHERE account_code = '2111'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '1112')),
('SALARY_PAYMENT',    'Salary Payment',        'Employee salary payments',
 (SELECT id FROM chart_of_accounts WHERE account_code = '5110'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '1112')),
('ASSET_PURCHASE',    'Asset Purchase',        'Purchase of fixed assets',
 (SELECT id FROM chart_of_accounts WHERE account_code = '1210'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '1112')),
('CONSUMABLE_PURCHASE','Consumable Purchase',  'Purchase of medical consumables',
 (SELECT id FROM chart_of_accounts WHERE account_code = '5120'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '2111')),
('LOANER_DEPOSIT',    'Loaner Asset Deposit',  'Security deposit for loaner assets',
 (SELECT id FROM chart_of_accounts WHERE account_code = '1112'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '2120')),
('DEPRECIATION',      'Depreciation',          'Asset depreciation entry',
 (SELECT id FROM chart_of_accounts WHERE account_code = '5200'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '1250'))
ON CONFLICT (type_code) DO NOTHING;

-- Financial periods (extended version with period_code)
INSERT INTO financial_periods (period_code, period_name, period_type, start_date, end_date, fiscal_year, is_current) VALUES
('FY2024-Q1', 'FY 2024 Q1', 'QUARTERLY', '2024-04-01', '2024-06-30', 2024, false),
('FY2024-Q2', 'FY 2024 Q2', 'QUARTERLY', '2024-07-01', '2024-09-30', 2024, false),
('FY2024-Q3', 'FY 2024 Q3', 'QUARTERLY', '2024-10-01', '2024-12-31', 2024, false),
('FY2024-Q4', 'FY 2024 Q4', 'QUARTERLY', '2025-01-01', '2025-03-31', 2024, true)
ON CONFLICT (period_code) DO NOTHING;

-- Cost centers
INSERT INTO cost_centers (cost_center_code, cost_center_name, center_id, budget_limit) VALUES
('CC-HQ',    'Headquarters',        1, 1000000),
('CC-RAD',   'Radiology Department',1,  500000),
('CC-LAB',   'Laboratory',          1,  300000),
('CC-PHARM', 'Pharmacy',            1,  200000),
('CC-ADMIN', 'Administration',      1,  400000)
ON CONFLICT (cost_center_code) DO NOTHING;
