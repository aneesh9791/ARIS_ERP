-- 045: Add ASSET item_type to item_master; add po_id to asset_master

-- Widen item_type to allow ASSET (capital equipment ordered via PO)
ALTER TABLE item_master
  DROP CONSTRAINT IF EXISTS item_master_item_type_check;
ALTER TABLE item_master
  ADD CONSTRAINT item_master_item_type_check
    CHECK (item_type IN ('STOCK','NON_STOCK','ASSET'));

-- Link assets to the PO they were procured against
ALTER TABLE asset_master
  ADD COLUMN IF NOT EXISTS po_id INTEGER REFERENCES procurement_orders(id);

CREATE INDEX IF NOT EXISTS idx_asset_master_po ON asset_master(po_id);
