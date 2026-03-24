-- Migration 058: Study Consumables
-- Tracks which stock items are consumed per study type (template)
-- and records actual consumption per patient bill.

-- Add is_contrast_study flag to study_definitions
ALTER TABLE study_definitions
  ADD COLUMN IF NOT EXISTS is_contrast_study BOOLEAN NOT NULL DEFAULT false;

-- Back-fill from existing study_type field
UPDATE study_definitions
  SET is_contrast_study = true
  WHERE LOWER(study_type) LIKE '%contrast%'
     OR LOWER(study_name) LIKE '%contrast%'
     OR LOWER(study_name) LIKE '% c+%'
     OR LOWER(study_name) LIKE '%with contrast%';

-- Template: which consumables does a study type typically use
CREATE TABLE IF NOT EXISTS study_consumables (
  id                    SERIAL PRIMARY KEY,
  study_definition_id   INTEGER NOT NULL REFERENCES study_definitions(id) ON DELETE CASCADE,
  item_master_id        INTEGER NOT NULL REFERENCES item_master(id),
  default_qty           DECIMAL(10,3) NOT NULL DEFAULT 1,
  notes                 VARCHAR(200),
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(study_definition_id, item_master_id)
);

-- Actual consumption per bill
CREATE TABLE IF NOT EXISTS bill_consumables (
  id               SERIAL PRIMARY KEY,
  bill_id          INTEGER NOT NULL REFERENCES patient_bills(id) ON DELETE CASCADE,
  item_master_id   INTEGER NOT NULL REFERENCES item_master(id),
  qty_used         DECIMAL(10,3) NOT NULL DEFAULT 0,
  unit_cost        DECIMAL(10,2) NOT NULL DEFAULT 0,
  movement_id      INTEGER REFERENCES inventory_movements(id),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  notes            VARCHAR(200),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bill_id, item_master_id)
);

-- Add bill_id to inventory_movements if not present
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS bill_id INTEGER REFERENCES patient_bills(id);

CREATE INDEX IF NOT EXISTS idx_study_consumables_study ON study_consumables(study_definition_id);
CREATE INDEX IF NOT EXISTS idx_study_consumables_item ON study_consumables(item_master_id);
CREATE INDEX IF NOT EXISTS idx_bill_consumables_bill ON bill_consumables(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_consumables_item ON bill_consumables(item_master_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_bill ON inventory_movements(bill_id);
