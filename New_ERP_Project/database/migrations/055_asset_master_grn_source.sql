-- ============================================================
-- Migration 055: Track GRN origin on asset_master
-- Fixed-asset GRNs auto-create asset_master rows; these columns
-- let us trace each asset back to its receipt line.
-- ============================================================

ALTER TABLE asset_master
  ADD COLUMN IF NOT EXISTS grn_id          INTEGER REFERENCES purchase_receipts(id),
  ADD COLUMN IF NOT EXISTS grn_item_id     INTEGER REFERENCES purchase_receipt_items(id),
  ADD COLUMN IF NOT EXISTS item_master_id  INTEGER REFERENCES item_master(id);
