-- Migration 031: Add GST to asset_maintenance_parts
-- total_cost is a generated column — must drop and re-create to change the formula.

ALTER TABLE asset_maintenance_parts
  DROP COLUMN IF EXISTS total_cost;

ALTER TABLE asset_maintenance_parts
  ADD COLUMN IF NOT EXISTS gst_rate   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_cost  DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(12,2) GENERATED ALWAYS AS
    (ROUND(quantity * unit_cost * gst_rate / 100.0, 2)) STORED,
  ADD COLUMN IF NOT EXISTS total_cost DECIMAL(12,2) GENERATED ALWAYS AS
    (ROUND(quantity * unit_cost * (1 + gst_rate / 100.0), 2)) STORED;

-- Re-create the trigger function to use new total_cost
CREATE OR REPLACE FUNCTION sync_maintenance_parts_cost()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE asset_maintenance_logs
  SET parts_cost = (
    SELECT COALESCE(SUM(total_cost), 0)
    FROM asset_maintenance_parts
    WHERE maintenance_log_id = COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
