-- ============================================================
-- Migration 054: JE tracking for GRN receipts and inventory movements
-- ============================================================

-- Allow each GRN to carry its own JE reference
ALTER TABLE purchase_receipts
  ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES journal_entries(id);

-- Allow each inventory movement to carry its JE reference
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES journal_entries(id);
