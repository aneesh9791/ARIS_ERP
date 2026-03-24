-- 044: Link expense records to procurement orders
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS po_id INTEGER REFERENCES procurement_orders(id);

CREATE INDEX IF NOT EXISTS idx_expense_records_po ON expense_records(po_id);
