-- Migration 081: Add je_error column to purchase_receipts
-- Stores the error message when auto-posting the GRN Journal Entry fails.
-- The GRN is posted successfully regardless; this column flags GRNs that
-- need manual JE reconciliation.

ALTER TABLE purchase_receipts
  ADD COLUMN IF NOT EXISTS je_error TEXT DEFAULT NULL;

COMMENT ON COLUMN purchase_receipts.je_error IS
  'Non-null when the auto JE post failed after GRN was posted — needs manual reconciliation';
