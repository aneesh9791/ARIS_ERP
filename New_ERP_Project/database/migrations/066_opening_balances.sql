-- Migration 066: Opening balances table
-- Stores go-live opening balances per GL account.
-- A separate JE is posted via the API (sourceModule = 'OPENING_BALANCE').
-- This table is the source of truth; the JE is the GL record.

CREATE TABLE IF NOT EXISTS opening_balances (
  id              SERIAL PRIMARY KEY,
  account_id      INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  center_id       INTEGER REFERENCES centers(id),
  balance_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  debit_amount    NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (debit_amount  >= 0),
  credit_amount   NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  notes           TEXT,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  posted_by       INTEGER REFERENCES users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, center_id, balance_date)
);

CREATE INDEX IF NOT EXISTS idx_ob_account  ON opening_balances(account_id);
CREATE INDEX IF NOT EXISTS idx_ob_center   ON opening_balances(center_id);
CREATE INDEX IF NOT EXISTS idx_ob_date     ON opening_balances(balance_date);
