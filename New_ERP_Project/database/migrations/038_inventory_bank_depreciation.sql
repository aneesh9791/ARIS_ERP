-- Migration 038: Inventory Movements, Bank Statement Lines, Asset Depreciation Runs
-- ============================================================

-- 1. INVENTORY MOVEMENTS
-- Tracks stock-in / stock-out / adjustments for Item Master items
CREATE TABLE IF NOT EXISTS inventory_movements (
  id               SERIAL PRIMARY KEY,
  movement_number  VARCHAR(30) NOT NULL UNIQUE,
  item_id          INTEGER NOT NULL REFERENCES item_master(id),
  center_id        INTEGER REFERENCES centers(id),
  movement_type    VARCHAR(20) NOT NULL CHECK (movement_type IN ('STOCK_IN','STOCK_OUT','ADJUSTMENT','OPENING')),
  reference_type   VARCHAR(30),           -- 'PO','PATIENT_STUDY','MANUAL','ADJUSTMENT'
  reference_id     INTEGER,
  reference_number VARCHAR(50),           -- PO number, study number, etc.
  quantity         NUMERIC(10,3) NOT NULL,
  unit_cost        NUMERIC(12,2) DEFAULT 0,
  total_cost       NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  current_stock    NUMERIC(10,3) NOT NULL DEFAULT 0,  -- running balance after this movement
  notes            TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_item   ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_date   ON inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_mov_center ON inventory_movements(center_id);

-- Add current_stock to item_master
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS current_stock NUMERIC(10,3) NOT NULL DEFAULT 0;
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS center_id INTEGER REFERENCES centers(id);

-- Auto-number trigger for inventory movements
CREATE OR REPLACE FUNCTION gen_movement_number()
RETURNS TRIGGER AS $$
DECLARE
  yr  TEXT := TO_CHAR(NOW(), 'YYYY');
  seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1
    INTO seq
    FROM inventory_movements
   WHERE movement_number LIKE 'MOV-' || yr || '-%';
  NEW.movement_number := 'MOV-' || yr || '-' || LPAD(seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_movement_number ON inventory_movements;
CREATE TRIGGER trg_movement_number
  BEFORE INSERT ON inventory_movements
  FOR EACH ROW WHEN (NEW.movement_number IS NULL OR NEW.movement_number = '')
  EXECUTE FUNCTION gen_movement_number();


-- 2. BANK STATEMENT LINES
-- Manual entry of bank statement transactions for reconciliation
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id                SERIAL PRIMARY KEY,
  bank_account_id   INTEGER NOT NULL REFERENCES bank_accounts(id),
  transaction_date  DATE NOT NULL,
  value_date        DATE,
  description       VARCHAR(500),
  cheque_number     VARCHAR(30),
  debit_amount      NUMERIC(15,2) DEFAULT 0,
  credit_amount     NUMERIC(15,2) DEFAULT 0,
  balance_after     NUMERIC(15,2),
  is_reconciled     BOOLEAN DEFAULT FALSE,
  je_id             INTEGER REFERENCES journal_entries(id),
  reconciled_by     INTEGER REFERENCES users(id),
  reconciled_at     TIMESTAMP,
  notes             TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bsl_account ON bank_statement_lines(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bsl_date    ON bank_statement_lines(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bsl_recon   ON bank_statement_lines(is_reconciled);

-- Add linked_je to bank_reconciliation if not exists
ALTER TABLE bank_reconciliation ADD COLUMN IF NOT EXISTS period_from DATE;
ALTER TABLE bank_reconciliation ADD COLUMN IF NOT EXISTS period_to   DATE;
ALTER TABLE bank_reconciliation ADD COLUMN IF NOT EXISTS bank_account_id INTEGER REFERENCES bank_accounts(id);


-- 3. ASSET DEPRECIATION RUNS
-- Tracks which months have had depreciation posted (prevents double-posting)
CREATE TABLE IF NOT EXISTS asset_depreciation_runs (
  id                  SERIAL PRIMARY KEY,
  asset_id            INTEGER NOT NULL REFERENCES asset_master(id),
  period_year         INTEGER NOT NULL,
  period_month        INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  depreciation_amount NUMERIC(12,2) NOT NULL,
  journal_entry_id    INTEGER REFERENCES journal_entries(id),
  run_by              INTEGER REFERENCES users(id),
  run_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (asset_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_depr_run_asset  ON asset_depreciation_runs(asset_id);
CREATE INDEX IF NOT EXISTS idx_depr_run_period ON asset_depreciation_runs(period_year, period_month);

-- Add finance-link column to asset_master
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS purchase_je_id  INTEGER REFERENCES journal_entries(id);
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS accumulated_depreciation NUMERIC(12,2) DEFAULT 0;

-- Default bank accounts if none exist
INSERT INTO bank_accounts (account_name, account_number, bank_name, branch_name, ifsc_code, account_type, opening_balance, current_balance)
SELECT 'Primary Current Account', 'CURR001', 'State Bank of India', 'Main Branch', 'SBIN0000001', 'CURRENT', 0, 0
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts LIMIT 1);
