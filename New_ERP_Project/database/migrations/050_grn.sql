-- 050: Goods Receipt Notes (GRN) — receive items against Purchase Orders

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id             SERIAL PRIMARY KEY,
  grn_number     VARCHAR(30)  UNIQUE NOT NULL,
  po_id          INT NOT NULL REFERENCES procurement_orders(id),
  center_id      INT NOT NULL REFERENCES centers(id),
  receipt_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by    INT REFERENCES users(id),
  status         VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
  notes          TEXT,
  total_qty      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_value    NUMERIC(14,2) NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_receipt_items (
  id              SERIAL PRIMARY KEY,
  receipt_id      INT NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  po_item_id      INT NOT NULL REFERENCES procurement_order_items(id),
  item_master_id  INT REFERENCES item_master(id),
  item_name       VARCHAR(200) NOT NULL,
  uom             VARCHAR(20)  NOT NULL DEFAULT 'PCS',
  ordered_qty     NUMERIC(10,2) NOT NULL,
  received_qty    NUMERIC(10,2) NOT NULL,
  unit_rate       NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  gst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  batch_number    VARCHAR(50),
  expiry_date     DATE,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_grn_po      ON purchase_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_grn_center  ON purchase_receipts(center_id);
CREATE INDEX IF NOT EXISTS idx_grn_status  ON purchase_receipts(status) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_grn_items   ON purchase_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_grn_item_m  ON purchase_receipt_items(item_master_id);

-- Track total received qty per PO line (for over-receipt prevention)
ALTER TABLE procurement_order_items
  ADD COLUMN IF NOT EXISTS received_qty NUMERIC(10,2) NOT NULL DEFAULT 0;
