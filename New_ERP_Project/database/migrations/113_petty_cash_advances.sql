-- Migration 113: Petty Cash Advances (Imprest System)
-- Tracks advances issued to custodians and links vouchers to advances for knock-off

-- ── petty_cash_advances ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_advances (
  id               SERIAL PRIMARY KEY,
  advance_number   VARCHAR(30)    NOT NULL UNIQUE,
  custodian_id     INTEGER        NOT NULL REFERENCES petty_cash_custodians(id),
  employee_id      INTEGER        NOT NULL REFERENCES employees(id),
  center_id        INTEGER        NOT NULL REFERENCES centers(id),
  issued_date      DATE           NOT NULL,
  amount           NUMERIC(12,2)  NOT NULL CHECK (amount > 0),
  amount_utilised  NUMERIC(12,2)  NOT NULL DEFAULT 0 CHECK (amount_utilised >= 0),
  journal_entry_id INTEGER        REFERENCES journal_entries(id),
  party_ledger_id  INTEGER        REFERENCES party_ledgers(id),
  status           VARCHAR(20)    NOT NULL DEFAULT 'ACTIVE'
                                  CHECK (status IN ('ACTIVE','SETTLED','EXPIRED')),
  notes            TEXT,
  created_by       INTEGER        REFERENCES users(id),
  created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pca_custodian ON petty_cash_advances(custodian_id);
CREATE INDEX IF NOT EXISTS idx_pca_employee  ON petty_cash_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_pca_status    ON petty_cash_advances(status);

-- ── Link expense_records to advance (for knock-off tracking) ───────────────
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS advance_id         INTEGER REFERENCES petty_cash_advances(id),
  ADD COLUMN IF NOT EXISTS is_advance_knockoff BOOLEAN DEFAULT false;

-- ── Auto-number: PCA-YYYY-MM-0001 ─────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS petty_cash_advance_seq START 1;

CREATE OR REPLACE FUNCTION generate_advance_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.advance_number IS NULL OR NEW.advance_number = '' THEN
    NEW.advance_number := 'PCA-' || TO_CHAR(NEW.issued_date, 'YYYY-MM') || '-'
                          || LPAD(NEXTVAL('petty_cash_advance_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_number ON petty_cash_advances;
CREATE TRIGGER trg_advance_number
  BEFORE INSERT ON petty_cash_advances
  FOR EACH ROW EXECUTE FUNCTION generate_advance_number();
