-- Migration 059: Reporter payment fields
-- Adds tds_rate to radiologist_master (other payment fields already exist from migration 010)
-- Ensures vendor_code and vendor_bill_id columns exist (may have been added manually)

ALTER TABLE radiologist_master
  ADD COLUMN IF NOT EXISTS tds_rate            DECIMAL(5,2) DEFAULT 10,
  ADD COLUMN IF NOT EXISTS vendor_code         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pan_number          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_name           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ifsc_code           VARCHAR(11),
  ADD COLUMN IF NOT EXISTS upi_id              VARCHAR(100);

ALTER TABLE payables
  ADD COLUMN IF NOT EXISTS vendor_bill_id INT REFERENCES vendor_bills(id) ON DELETE SET NULL;

COMMENT ON COLUMN radiologist_master.tds_rate IS 'TDS rate % (default 10 for 194J professional fees)';
COMMENT ON COLUMN radiologist_master.vendor_code IS 'Linked vendor_master code — required for TELERADIOLOGY consolidated billing';
