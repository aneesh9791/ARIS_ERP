-- Migration 114: Per-Study Accession Numbers + Consumable Scope
--
-- Problem: 1 patient_bill → 1 accession number, even when bill has CT + MRI.
-- Fix:     Each bill_item (individual study) gets its own accession_number,
--          exam_workflow_status, and reporter assignment.
--
-- Consumable scope:
--   'per_patient' → one per bill regardless of study count (report cover, CD, etc.)
--   'per_study'   → one per study item (contrast agent, film, etc.)

-- ── 1. Add workflow columns to bill_items ────────────────────────────────────
ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS accession_number         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS exam_workflow_status      VARCHAR(30)
    CHECK (exam_workflow_status IN ('EXAM_SCHEDULED','EXAM_COMPLETED','REPORT_COMPLETED')),
  ADD COLUMN IF NOT EXISTS reporter_radiologist_id   INT  REFERENCES radiologist_master(id),
  ADD COLUMN IF NOT EXISTS rate_snapshot             DECIMAL(10,2);

CREATE INDEX IF NOT EXISTS idx_bill_items_accession
  ON bill_items(accession_number) WHERE accession_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bill_items_exam_status
  ON bill_items(exam_workflow_status) WHERE active = true;

-- ── 2. Link studies rows to the bill_item they were created for ─────────────
ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS bill_item_id INT REFERENCES bill_items(id);
CREATE INDEX IF NOT EXISTS idx_studies_bill_item_id
  ON studies(bill_item_id) WHERE bill_item_id IS NOT NULL;

-- ── 3. Consumable scope on template ─────────────────────────────────────────
ALTER TABLE study_consumables
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'per_study'
    CHECK (scope IN ('per_study', 'per_patient'));

-- ── 4. Bill-level consumables: add bill_item_id (null = per-patient/shared) ─
ALTER TABLE bill_consumables
  ADD COLUMN IF NOT EXISTS bill_item_id INT REFERENCES bill_items(id);

-- Drop the old flat unique constraint
ALTER TABLE bill_consumables
  DROP CONSTRAINT IF EXISTS bill_consumables_bill_id_item_master_id_key;

-- Replace with two partial unique indexes:
--   • Shared/patient-level item (bill_item_id IS NULL): one per item per bill
--   • Study-level item (bill_item_id IS NOT NULL): one per item per study per bill
CREATE UNIQUE INDEX IF NOT EXISTS uidx_bc_shared
  ON bill_consumables(bill_id, item_master_id)
  WHERE bill_item_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_bc_per_study
  ON bill_consumables(bill_id, bill_item_id, item_master_id)
  WHERE bill_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bill_consumables_item_id
  ON bill_consumables(bill_item_id) WHERE bill_item_id IS NOT NULL;

-- ── 5. Inventory movements: add bill_item_id for traceability ────────────────
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS bill_item_id INT REFERENCES bill_items(id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_bill_item
  ON inventory_movements(bill_item_id) WHERE bill_item_id IS NOT NULL;

-- ── 6. Update accession trigger: generate one accession per bill_item ────────
CREATE OR REPLACE FUNCTION auto_generate_accession_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_item        RECORD;
  accession_num TEXT;
  first_acc     TEXT := NULL;
BEGIN
  -- Only fire when payment_status changes to 'PAID'
  IF NEW.payment_status = 'PAID'
     AND (OLD.payment_status IS NULL OR OLD.payment_status <> 'PAID') THEN

    -- Generate one accession per bill_item that does not yet have one
    FOR v_item IN
      SELECT id FROM bill_items
      WHERE bill_id = NEW.id AND active = true AND accession_number IS NULL
      ORDER BY id
    LOOP
      accession_num := generate_accession_number();
      UPDATE bill_items
        SET accession_number      = accession_num,
            exam_workflow_status  = 'EXAM_SCHEDULED',
            updated_at            = NOW()
      WHERE id = v_item.id;
      IF first_acc IS NULL THEN first_acc := accession_num; END IF;
    END LOOP;

    -- Keep the bill-level accession for backward compat (first study's accession)
    IF first_acc IS NOT NULL
       AND (NEW.accession_number IS NULL OR NEW.accession_number = '') THEN
      NEW.accession_number       := first_acc;
      NEW.accession_generated    := true;
      NEW.accession_generated_at := CURRENT_TIMESTAMP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_accession_on_payment ON patient_bills;
CREATE TRIGGER trigger_auto_generate_accession_on_payment
  BEFORE UPDATE ON patient_bills
  FOR EACH ROW EXECUTE FUNCTION auto_generate_accession_on_payment();

-- ── 7. Backfill: copy bill-level accession to bill_items for existing PAID bills ──
DO $$
DECLARE
  v_bill       RECORD;
  v_item_count INT;
  v_item_id    INT;
BEGIN
  FOR v_bill IN
    SELECT pb.id        AS bill_id,
           pb.accession_number,
           pb.study_id  AS legacy_study_id
    FROM patient_bills pb
    WHERE pb.payment_status = 'PAID'
      AND pb.accession_number IS NOT NULL
      AND pb.active = true
  LOOP
    -- Count active bill_items for this bill
    SELECT COUNT(*) INTO v_item_count
    FROM bill_items WHERE bill_id = v_bill.bill_id AND active = true;

    IF v_item_count = 1 THEN
      -- Single-item bill: copy bill accession to the one bill_item
      SELECT id INTO v_item_id
      FROM bill_items WHERE bill_id = v_bill.bill_id AND active = true LIMIT 1;

      UPDATE bill_items
        SET accession_number     = COALESCE(accession_number, v_bill.accession_number),
            exam_workflow_status = COALESCE(exam_workflow_status,
              -- Pull from linked studies row if available
              (SELECT s.exam_workflow_status FROM studies s
               WHERE s.id = v_bill.legacy_study_id LIMIT 1),
              'EXAM_SCHEDULED'),
            reporter_radiologist_id = COALESCE(reporter_radiologist_id,
              (SELECT s.reporter_radiologist_id FROM studies s
               WHERE s.id = v_bill.legacy_study_id LIMIT 1)),
            rate_snapshot = COALESCE(rate_snapshot,
              (SELECT s.rate_snapshot FROM studies s
               WHERE s.id = v_bill.legacy_study_id LIMIT 1))
      WHERE id = v_item_id;

      -- Link the legacy studies row to this bill_item
      IF v_bill.legacy_study_id IS NOT NULL THEN
        UPDATE studies SET bill_item_id = v_item_id
        WHERE id = v_bill.legacy_study_id AND bill_item_id IS NULL;
      END IF;
    END IF;
    -- Multi-item bills: leave null — they'll get accessions on next payment or fresh bill
  END LOOP;
END;
$$;

-- ── 8. Common per-patient consumables: mark scope='per_patient' ───────────────
-- These are standard shared items across all imaging centers.
-- Admins can adjust via the Study Consumables settings page.
UPDATE study_consumables sc
  SET scope = 'per_patient'
WHERE EXISTS (
  SELECT 1 FROM item_master im
  WHERE im.id = sc.item_master_id
    AND (
      LOWER(im.item_name) LIKE '%report cover%' OR
      LOWER(im.item_name) LIKE '%report folder%' OR
      LOWER(im.item_name) LIKE '%cd%'            OR
      LOWER(im.item_name) LIKE '%dvd%'           OR
      LOWER(im.item_name) LIKE '%usb%'           OR
      LOWER(im.item_name) LIKE '%patient file%'  OR
      LOWER(im.item_name) LIKE '%film cover%'    OR
      LOWER(im.item_name) LIKE '%envelope%'
    )
);
