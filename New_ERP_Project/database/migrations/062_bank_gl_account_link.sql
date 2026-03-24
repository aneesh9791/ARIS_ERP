-- Migration 062: Link bank_accounts to chart_of_accounts for bank reconciliation
-- Adds gl_account_id so the reconciliation summary can compare statement balance vs GL book balance.

ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS gl_account_id INTEGER REFERENCES chart_of_accounts(id);

COMMENT ON COLUMN bank_accounts.gl_account_id IS
  'Linked GL cash/bank account (e.g. 1110 Current Account) — used by reconciliation summary to compare statement vs book balance';
