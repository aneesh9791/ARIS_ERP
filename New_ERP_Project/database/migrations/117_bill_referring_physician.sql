-- Migration 117: Add referring_physician_code to patient_bills
ALTER TABLE patient_bills
  ADD COLUMN IF NOT EXISTS referring_physician_code VARCHAR(20)
    REFERENCES referring_physician_master(physician_code);

CREATE INDEX IF NOT EXISTS idx_patient_bills_referring_physician
  ON patient_bills(referring_physician_code)
  WHERE referring_physician_code IS NOT NULL;
