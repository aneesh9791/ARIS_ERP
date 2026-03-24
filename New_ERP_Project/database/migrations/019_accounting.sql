-- Migration 019: Accounting System — Double-Entry Bookkeeping
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/backend/migrations/create_accounting_tables.sql
-- Fix applied: accounting_bills.patient_id changed from INTEGER to VARCHAR(36)
--   to match patients.id (VARCHAR(36)).
-- Fix applied: customer_credit_limits.customer_id changed from INTEGER to VARCHAR(36)
--   for the same reason.
-- Fix applied: ALTER TABLE ADD CONSTRAINT wrapped in DO blocks (duplicate_object safe)
--   so the migration is idempotent.
-- Fix applied: COMMIT statement removed (migrations run in a single transaction context).

-- ACCOUNTING ENTRIES TABLE
CREATE TABLE IF NOT EXISTS accounting_entries (
    id             SERIAL PRIMARY KEY,
    entry_type     VARCHAR(10) NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    reference_id   INTEGER NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    debit_account  VARCHAR(100) NOT NULL,
    credit_account VARCHAR(100) NOT NULL,
    amount         DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
    description    TEXT,
    fiscal_year    INTEGER NOT NULL,
    period         INTEGER NOT NULL CHECK (period BETWEEN 1 AND 4),
    created_by     INTEGER REFERENCES users(id),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active         BOOLEAN DEFAULT TRUE
);

-- ACCOUNTING BILLS TABLE
-- Fix: patient_id VARCHAR(36) to match patients.id
CREATE TABLE IF NOT EXISTS accounting_bills (
    id                       SERIAL PRIMARY KEY,
    invoice_number           VARCHAR(50) UNIQUE NOT NULL,
    invoice_type             VARCHAR(50) NOT NULL DEFAULT 'TAX_INVOICE',
    bill_date                DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date                 DATE NOT NULL,
    patient_id               VARCHAR(36) REFERENCES patients(id),
    customer_type            VARCHAR(20) NOT NULL DEFAULT 'CASH',
    center_id                INTEGER REFERENCES centers(id),
    billing_address          JSONB,
    shipping_address         JSONB,
    reference_number         VARCHAR(50),

    -- Financial Amounts
    subtotal                 DECIMAL(15,2) NOT NULL DEFAULT 0,
    discount_amount          DECIMAL(15,2) NOT NULL DEFAULT 0,
    discount_percentage      DECIMAL(5,2)  NOT NULL DEFAULT 0,
    discount_reason          VARCHAR(200),

    -- Tax Categories
    taxable_amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    exempt_amount            DECIMAL(15,2) NOT NULL DEFAULT 0,
    zero_rated_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
    cgst_amount              DECIMAL(15,2) NOT NULL DEFAULT 0,
    sgst_amount              DECIMAL(15,2) NOT NULL DEFAULT 0,
    igst_amount              DECIMAL(15,2) NOT NULL DEFAULT 0,
    cess_amount              DECIMAL(15,2) NOT NULL DEFAULT 0,
    tds_amount               DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Total Amounts
    total_amount             DECIMAL(15,2) NOT NULL DEFAULT 0,
    amount_paid              DECIMAL(15,2) NOT NULL DEFAULT 0,
    balance_amount           DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Status Fields
    billing_status           VARCHAR(20) NOT NULL DEFAULT 'POSTED',
    payment_status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    -- Payment Terms
    payment_terms            VARCHAR(20) NOT NULL DEFAULT 'NET30',
    due_days                 INTEGER NOT NULL DEFAULT 30,
    overdue_days             INTEGER NOT NULL DEFAULT 0,
    late_fee_amount          DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Approval Workflow
    posted_date              TIMESTAMP,
    posted_by                INTEGER REFERENCES users(id),
    approved_date            TIMESTAMP,
    approved_by              INTEGER REFERENCES users(id),

    -- Accession Number Integration
    accession_number         VARCHAR(50),
    accession_generated      BOOLEAN DEFAULT FALSE,
    accession_generated_at   TIMESTAMP,

    -- API Integration
    api_sent                 BOOLEAN DEFAULT FALSE,
    api_sent_at              TIMESTAMP,
    api_response_code        INTEGER,
    api_success              BOOLEAN DEFAULT FALSE,
    api_error_message        TEXT,
    api_retry_count          INTEGER DEFAULT 0,
    last_api_attempt         TIMESTAMP,

    -- Audit Fields
    created_by               INTEGER REFERENCES users(id),
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                   BOOLEAN DEFAULT TRUE
);

-- ACCOUNTING BILL ITEMS TABLE
CREATE TABLE IF NOT EXISTS accounting_bill_items (
    id                  SERIAL PRIMARY KEY,
    bill_id             INTEGER REFERENCES accounting_bills(id) ON DELETE CASCADE,
    item_code           VARCHAR(50) NOT NULL,
    item_name           VARCHAR(200) NOT NULL,
    item_type           VARCHAR(50) NOT NULL DEFAULT 'SERVICE',
    hsn_code            VARCHAR(10),
    sac_code            VARCHAR(10),
    quantity            DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price          DECIMAL(15,2) NOT NULL,
    total_price         DECIMAL(15,2) NOT NULL,
    discount_percentage DECIMAL(5,2)  NOT NULL DEFAULT 0,
    discount_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
    taxable_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
    gst_rate            DECIMAL(5,4)  NOT NULL DEFAULT 0.18,
    cgst_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,
    sgst_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,
    igst_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,
    cess_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_amount        DECIMAL(15,2) NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active              BOOLEAN DEFAULT TRUE
);

-- ACCOUNTING PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS accounting_payments (
    id                 SERIAL PRIMARY KEY,
    receipt_number     VARCHAR(50) UNIQUE NOT NULL,
    bill_id            INTEGER REFERENCES accounting_bills(id) ON DELETE CASCADE,
    payment_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method     VARCHAR(50) NOT NULL,
    payment_type       VARCHAR(50) NOT NULL DEFAULT 'PAYMENT',
    amount             DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
    bank_name          VARCHAR(100),
    transaction_id     VARCHAR(100),
    reference_number   VARCHAR(50),
    check_number       VARCHAR(50),
    card_last_four     VARCHAR(4),
    authorization_code VARCHAR(50),
    payment_status     VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    payment_gateway    VARCHAR(50),
    processing_fee     DECIMAL(15,2) NOT NULL DEFAULT 0,
    settlement_amount  DECIMAL(15,2) NOT NULL DEFAULT 0,
    settlement_date    DATE,
    currency           VARCHAR(3) NOT NULL DEFAULT 'INR',
    exchange_rate      DECIMAL(10,6) NOT NULL DEFAULT 1,
    foreign_amount     DECIMAL(15,2),
    created_by         INTEGER REFERENCES users(id),
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active             BOOLEAN DEFAULT TRUE
);

-- CREDIT NOTES TABLE
CREATE TABLE IF NOT EXISTS accounting_credit_notes (
    id                 SERIAL PRIMARY KEY,
    credit_note_number VARCHAR(50) UNIQUE NOT NULL,
    bill_id            INTEGER REFERENCES accounting_bills(id),
    credit_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    reason             VARCHAR(500) NOT NULL,
    amount             DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
    tax_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_amount       DECIMAL(15,2) NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'POSTED',
    approved_by        INTEGER REFERENCES users(id),
    approved_date      TIMESTAMP,
    created_by         INTEGER REFERENCES users(id),
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active             BOOLEAN DEFAULT TRUE
);

-- DEBIT NOTES TABLE
CREATE TABLE IF NOT EXISTS accounting_debit_notes (
    id                SERIAL PRIMARY KEY,
    debit_note_number VARCHAR(50) UNIQUE NOT NULL,
    bill_id           INTEGER REFERENCES accounting_bills(id),
    debit_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    reason            VARCHAR(500) NOT NULL,
    amount            DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
    tax_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_amount      DECIMAL(15,2) NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'POSTED',
    approved_by       INTEGER REFERENCES users(id),
    approved_date     TIMESTAMP,
    created_by        INTEGER REFERENCES users(id),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active            BOOLEAN DEFAULT TRUE
);

-- AUDIT TRAIL TABLE
CREATE TABLE IF NOT EXISTS audit_trail (
    id                 SERIAL PRIMARY KEY,
    entity_type        VARCHAR(50) NOT NULL,
    entity_id          INTEGER NOT NULL,
    action             VARCHAR(50) NOT NULL,
    user_id            INTEGER REFERENCES users(id),
    timestamp          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    old_values         JSONB,
    new_values         JSONB,
    ip_address         INET,
    user_agent         TEXT,
    session_id         VARCHAR(100),
    additional_details JSONB,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TAX CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS tax_configuration (
    id           SERIAL PRIMARY KEY,
    tax_category VARCHAR(50) NOT NULL,
    tax_rate     DECIMAL(5,4) NOT NULL,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date  DATE,
    description  TEXT,
    created_by   INTEGER REFERENCES users(id),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active       BOOLEAN DEFAULT TRUE
);

-- CUSTOMER CREDIT LIMITS TABLE
-- Fix: customer_id VARCHAR(36) to match patients.id
CREATE TABLE IF NOT EXISTS customer_credit_limits (
    id               SERIAL PRIMARY KEY,
    customer_id      VARCHAR(36) REFERENCES patients(id),
    credit_limit     DECIMAL(15,2) NOT NULL DEFAULT 0,
    current_balance  DECIMAL(15,2) NOT NULL DEFAULT 0,
    available_credit DECIMAL(15,2) GENERATED ALWAYS AS (credit_limit - current_balance) STORED,
    credit_terms     VARCHAR(20) NOT NULL DEFAULT 'NET30',
    last_review_date DATE,
    approved_by      INTEGER REFERENCES users(id),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active           BOOLEAN DEFAULT TRUE
);

-- FINANCIAL PERIODS TABLE
CREATE TABLE IF NOT EXISTS financial_periods (
    id            SERIAL PRIMARY KEY,
    fiscal_year   INTEGER NOT NULL,
    period_number INTEGER NOT NULL CHECK (period_number BETWEEN 1 AND 4),
    period_name   VARCHAR(50) NOT NULL,
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    is_closed     BOOLEAN DEFAULT FALSE,
    closed_by     INTEGER REFERENCES users(id),
    closed_at     TIMESTAMP,
    created_by    INTEGER REFERENCES users(id),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fiscal_year, period_number)
);

-- CHART OF ACCOUNTS TABLE (simple version used by this migration's billing views)
-- Migration 020 provides the extended version with additional columns.
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id                SERIAL PRIMARY KEY,
    account_code      VARCHAR(20) UNIQUE NOT NULL,
    account_name      VARCHAR(200) NOT NULL,
    account_type      VARCHAR(50) NOT NULL,
    parent_account_id INTEGER REFERENCES chart_of_accounts(id),
    account_level     INTEGER NOT NULL DEFAULT 1,
    is_active         BOOLEAN DEFAULT TRUE,
    description       TEXT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BANK RECONCILIATION TABLE
CREATE TABLE IF NOT EXISTS bank_reconciliation (
    id                  SERIAL PRIMARY KEY,
    bank_account        VARCHAR(50) NOT NULL,
    reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    opening_balance     DECIMAL(15,2) NOT NULL DEFAULT 0,
    closing_balance     DECIMAL(15,2) NOT NULL DEFAULT 0,
    bank_balance        DECIMAL(15,2) NOT NULL DEFAULT 0,
    difference          DECIMAL(15,2) GENERATED ALWAYS AS (closing_balance - bank_balance) STORED,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reconciled_by       INTEGER REFERENCES users(id),
    reconciled_at       TIMESTAMP,
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounting_entries_reference     ON accounting_entries(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_fiscal_period ON accounting_entries(fiscal_year, period);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_patient         ON accounting_bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_center          ON accounting_bills(center_id);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_status          ON accounting_bills(billing_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_dates           ON accounting_bills(bill_date, due_date);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_accession       ON accounting_bills(accession_number);
CREATE INDEX IF NOT EXISTS idx_accounting_bill_items_bill       ON accounting_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_accounting_payments_bill         ON accounting_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_accounting_payments_date         ON accounting_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity               ON audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp            ON audit_trail(timestamp);

-- CHECK constraints (idempotent via DO block)
DO $$
BEGIN
    ALTER TABLE accounting_bills ADD CONSTRAINT chk_billing_status
        CHECK (billing_status IN ('DRAFT','PENDING','POSTED','PARTIALLY_PAID','FULLY_PAID',
                                  'OVERPAID','VOIDED','WRITTEN_OFF','DISPUTED','SENT_TO_COLLECTION'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE accounting_bills ADD CONSTRAINT chk_payment_status
        CHECK (payment_status IN ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED',
                                  'REFUNDED','PARTIALLY_REFUNDED','CHARGEBACK','REVERSED','HELD'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE accounting_bills ADD CONSTRAINT chk_payment_terms
        CHECK (payment_terms IN ('IMMEDIATE','NET15','NET30','NET45','NET60'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE accounting_bills ADD CONSTRAINT chk_balance_amount
        CHECK (balance_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE accounting_payments ADD CONSTRAINT chk_payment_method
        CHECK (payment_method IN ('CASH','CHECK','WIRE_TRANSFER','ACH_TRANSFER','CREDIT_CARD',
                                  'DEBIT_CARD','BANK_TRANSFER','UPI','NET_BANKING','MOBILE_WALLET',
                                  'CRYPTOCURRENCY','INSURANCE','CORPORATE','GOVERNMENT','COMBINED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE accounting_payments ADD CONSTRAINT chk_payment_status_payment
        CHECK (payment_status IN ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED',
                                  'REFUNDED','PARTIALLY_REFUNDED','CHARGEBACK','REVERSED','HELD'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Triggers
CREATE OR REPLACE FUNCTION update_accounting_bill_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_accounting_bill_timestamp ON accounting_bills;
CREATE TRIGGER trigger_accounting_bill_timestamp
    BEFORE UPDATE ON accounting_bills
    FOR EACH ROW EXECUTE FUNCTION update_accounting_bill_timestamp();

CREATE OR REPLACE FUNCTION update_accounting_payment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_accounting_payment_timestamp ON accounting_payments;
CREATE TRIGGER trigger_accounting_payment_timestamp
    BEFORE UPDATE ON accounting_payments
    FOR EACH ROW EXECUTE FUNCTION update_accounting_payment_timestamp();

-- Views
-- Note: v_bill_summary and v_aging_report use date arithmetic which is native PostgreSQL
-- (CURRENT_DATE - date yields an interval/integer — cast used for clarity).
CREATE OR REPLACE VIEW v_bill_summary AS
SELECT
    ab.id,
    ab.invoice_number,
    ab.bill_date,
    ab.due_date,
    ab.total_amount,
    ab.amount_paid,
    ab.balance_amount,
    ab.billing_status,
    ab.payment_status,
    ab.payment_terms,
    p.pid          AS patient_pid,
    p.name         AS patient_name,
    c.name         AS center_name,
    CASE
        WHEN ab.balance_amount > 0 AND CURRENT_DATE > ab.due_date
        THEN (CURRENT_DATE - ab.due_date)
        ELSE 0
    END AS days_overdue,
    CASE
        WHEN ab.balance_amount = 0         THEN 'PAID'
        WHEN CURRENT_DATE > ab.due_date    THEN 'OVERDUE'
        ELSE 'CURRENT'
    END AS payment_category
FROM accounting_bills ab
LEFT JOIN patients p ON ab.patient_id = p.id
LEFT JOIN centers c  ON ab.center_id  = c.id
WHERE ab.active = TRUE;

CREATE OR REPLACE VIEW v_aging_report AS
SELECT
    ab.id,
    ab.invoice_number,
    ab.due_date,
    ab.balance_amount,
    p.pid          AS patient_pid,
    p.name         AS patient_name,
    c.name         AS center_name,
    CASE
        WHEN ab.balance_amount > 0 AND CURRENT_DATE > ab.due_date
        THEN (CURRENT_DATE - ab.due_date)
        ELSE 0
    END AS days_overdue,
    CASE
        WHEN ab.balance_amount > 0 AND CURRENT_DATE <= ab.due_date                                         THEN 'CURRENT'
        WHEN ab.balance_amount > 0 AND CURRENT_DATE > ab.due_date AND (CURRENT_DATE - ab.due_date) <= 30  THEN '0-30'
        WHEN ab.balance_amount > 0 AND CURRENT_DATE > ab.due_date AND (CURRENT_DATE - ab.due_date) <= 60  THEN '31-60'
        WHEN ab.balance_amount > 0 AND CURRENT_DATE > ab.due_date AND (CURRENT_DATE - ab.due_date) <= 90  THEN '61-90'
        WHEN ab.balance_amount > 0 AND CURRENT_DATE > ab.due_date AND (CURRENT_DATE - ab.due_date) <= 120 THEN '91-120'
        WHEN ab.balance_amount > 0 AND CURRENT_DATE > ab.due_date AND (CURRENT_DATE - ab.due_date) > 120  THEN '120+'
        ELSE 'PAID'
    END AS aging_bucket
FROM accounting_bills ab
LEFT JOIN patients p ON ab.patient_id = p.id
LEFT JOIN centers c  ON ab.center_id  = c.id
WHERE ab.active = TRUE AND ab.balance_amount > 0;

-- Sample data
INSERT INTO chart_of_accounts (account_code, account_name, account_type, account_level) VALUES
('1000', 'ASSETS',            'BALANCE_SHEET',     1),
('1100', 'CURRENT ASSETS',    'BALANCE_SHEET',     2),
('1110', 'CASH AND BANK',     'BALANCE_SHEET',     3),
('1111', 'CASH',              'BALANCE_SHEET',     4),
('1112', 'BANK ACCOUNTS',     'BALANCE_SHEET',     4),
('1120', 'ACCOUNTS RECEIVABLE','BALANCE_SHEET',    3),
('1200', 'FIXED ASSETS',      'BALANCE_SHEET',     2),
('2000', 'LIABILITIES',       'BALANCE_SHEET',     1),
('2100', 'CURRENT LIABILITIES','BALANCE_SHEET',    2),
('2110', 'ACCOUNTS PAYABLE',  'BALANCE_SHEET',     3),
('2120', 'TAX PAYABLE',       'BALANCE_SHEET',     3),
('2121', 'CGST PAYABLE',      'BALANCE_SHEET',     4),
('2122', 'SGST PAYABLE',      'BALANCE_SHEET',     4),
('2123', 'IGST PAYABLE',      'BALANCE_SHEET',     4),
('3000', 'EQUITY',            'BALANCE_SHEET',     1),
('4000', 'REVENUE',           'INCOME_STATEMENT',  1),
('4100', 'SERVICE REVENUE',   'INCOME_STATEMENT',  2),
('4200', 'OTHER INCOME',      'INCOME_STATEMENT',  2),
('5000', 'EXPENSES',          'INCOME_STATEMENT',  1),
('5100', 'OPERATING EXPENSES','INCOME_STATEMENT',  2),
('5200', 'TAX EXPENSES',      'INCOME_STATEMENT',  2)
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO tax_configuration (tax_category, tax_rate, description) VALUES
('CGST', 0.09, 'Central Goods and Services Tax'),
('SGST', 0.09, 'State Goods and Services Tax'),
('IGST', 0.18, 'Integrated Goods and Services Tax'),
('CESS', 0.01, 'Additional Cess')
ON CONFLICT DO NOTHING;

INSERT INTO financial_periods (fiscal_year, period_number, period_name, start_date, end_date) VALUES
(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 1, 'Q1 - Apr-Jun',
    DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '3 months'),
    DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '3 months') + INTERVAL '3 months' - INTERVAL '1 day'),
(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 2, 'Q2 - Jul-Sep',
    DATE_TRUNC('quarter', CURRENT_DATE),
    DATE_TRUNC('quarter', CURRENT_DATE) + INTERVAL '3 months' - INTERVAL '1 day'),
(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 3, 'Q3 - Oct-Dec',
    DATE_TRUNC('quarter', CURRENT_DATE + INTERVAL '3 months'),
    DATE_TRUNC('quarter', CURRENT_DATE + INTERVAL '3 months') + INTERVAL '3 months' - INTERVAL '1 day'),
(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 4, 'Q4 - Jan-Mar',
    DATE_TRUNC('quarter', CURRENT_DATE + INTERVAL '6 months'),
    DATE_TRUNC('quarter', CURRENT_DATE + INTERVAL '6 months') + INTERVAL '3 months' - INTERVAL '1 day')
ON CONFLICT (fiscal_year, period_number) DO NOTHING;
