-- ============================================================
-- 100_equity_management.sql
-- Equity / Capital contribution tracking
-- Partners' investments hit COA 3100 (Partners' Capital)
-- Drawings hit COA 3500, Director Loans hit COA 2230
-- ============================================================

CREATE TABLE IF NOT EXISTS equity_transactions (
  id                  SERIAL PRIMARY KEY,
  transaction_no      VARCHAR(20)  UNIQUE NOT NULL,          -- EQ-000001
  director_id         INTEGER      REFERENCES company_directors(id),
  transaction_type    VARCHAR(30)  NOT NULL
    CHECK (transaction_type IN (
      'CAPITAL_CONTRIBUTION',   -- Partner invests → DR Bank, CR 3100
      'CAPITAL_RESERVE',        -- Specific reserve → DR Bank, CR 3400
      'DRAWING',                -- Partner withdraws → DR 3500, CR Bank
      'DIRECTOR_LOAN_IN',       -- Director lends to company → DR Bank, CR 2230
      'DIRECTOR_LOAN_REPAYMENT' -- Company repays director → DR 2230, CR Bank
    )),
  amount              NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  transaction_date    DATE          NOT NULL,
  payment_mode        VARCHAR(20)
    CHECK (payment_mode IN ('BANK_TRANSFER','NEFT','RTGS','CHEQUE','CASH','UPI')),
  bank_reference      VARCHAR(100),                          -- cheque no / UTR / ref
  bank_account_id     INTEGER REFERENCES chart_of_accounts(id),  -- DR/CR bank side
  equity_account_id   INTEGER REFERENCES chart_of_accounts(id),  -- 3100/3400/3500/2230
  journal_entry_id    INTEGER REFERENCES journal_entries(id),
  notes               TEXT,
  center_id           INTEGER REFERENCES centers(id),
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equity_director   ON equity_transactions(director_id);
CREATE INDEX IF NOT EXISTS idx_equity_date        ON equity_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_equity_type        ON equity_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_equity_je          ON equity_transactions(journal_entry_id);

-- Sequence for auto-numbering
CREATE SEQUENCE IF NOT EXISTS equity_txn_seq START 1 INCREMENT 1;

-- Grant new EQUITY permissions to finance roles
UPDATE user_roles
   SET permissions = permissions || '["EQUITY_VIEW","EQUITY_CREATE"]'::jsonb,
       updated_at  = NOW()
 WHERE role IN ('SUPER_ADMIN','FINANCE_MANAGER','ACCOUNTANT','CENTER_MANAGER')
   AND active = true
   AND NOT (permissions @> '["EQUITY_VIEW"]'::jsonb);
