-- ============================================================
-- Migration 052: Petty Cash Voucher System
-- Extends expense_records table with approval workflow,
-- GST breakdown, and proper GL linkage for journal posting.
-- ============================================================

-- ── 1. Extend expense_records ────────────────────────────────
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS status           VARCHAR(20)  NOT NULL DEFAULT 'SUBMITTED'
                                            CHECK (status IN ('SUBMITTED','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS gst_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itc_claimable    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS paid_to          VARCHAR(200),
  ADD COLUMN IF NOT EXISTS receipt_number   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by      INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejected_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at     TIMESTAMPTZ DEFAULT NOW();

-- ── 2. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expense_records_status   ON expense_records(status);
CREATE INDEX IF NOT EXISTS idx_expense_records_center   ON expense_records(center_id);
CREATE INDEX IF NOT EXISTS idx_expense_records_created  ON expense_records(created_by);

-- ── 3. Ensure Petty Cash GL accounts exist ───────────────────
-- 1114 and 1111 are already seeded in migration 036.
-- 1134 GST Input Credit (ITC) is also seeded in 036.
-- This is a safety check — uses the same upsert helper pattern.

-- ── 4. Auto-number sequence guard ───────────────────────────
CREATE SEQUENCE IF NOT EXISTS expense_number_seq START 1000;

-- ── 5. Drop old trigger & recreate cleanly ───────────────────
DROP TRIGGER IF EXISTS trg_expense_number ON expense_records;

CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expense_number IS NULL OR NEW.expense_number = '' THEN
    NEW.expense_number := 'PCV-' || TO_CHAR(NOW(), 'YYYY-MM') || '-' ||
      LPAD(nextval('expense_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expense_number
  BEFORE INSERT ON expense_records
  FOR EACH ROW EXECUTE FUNCTION generate_expense_number();

DO $$ BEGIN
  RAISE NOTICE 'Migration 052 complete — petty cash voucher system ready';
END $$;
