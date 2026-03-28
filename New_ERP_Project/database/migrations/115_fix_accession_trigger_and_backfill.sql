-- Migration 115: Fix accession trigger to only target STUDY items + backfill existing PAID bills
--
-- Problem 1: Trigger in migration 114 loops ALL active bill_items including CONTRAST and DICOM_CD
-- Problem 2: Existing multi-item PAID bills were skipped in migration 114 backfill
-- Fix 1: Add item_type = 'STUDY' filter to trigger loop
-- Fix 2: Generate fresh accession numbers for all STUDY-type bill_items on PAID bills

-- ── 1. Fix the trigger ────────────────────────────────────────────────────────
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

    -- Generate one accession per STUDY-type bill_item that does not yet have one
    FOR v_item IN
      SELECT id FROM bill_items
      WHERE bill_id = NEW.id
        AND active = true
        AND item_type = 'STUDY'
        AND accession_number IS NULL
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

-- Trigger already exists from migration 114 — nothing to recreate.

-- ── 2. Backfill: generate accessions for all STUDY-type bill_items on PAID bills ──
DO $$
DECLARE
  v_item        RECORD;
  accession_num TEXT;
  first_per_bill INT := 0;
  last_bill_id  INT := -1;
BEGIN
  FOR v_item IN
    SELECT bi.id AS bill_item_id, bi.bill_id
    FROM bill_items bi
    JOIN patient_bills pb ON pb.id = bi.bill_id
    WHERE pb.payment_status = 'PAID'
      AND pb.active = true
      AND bi.active = true
      AND bi.item_type = 'STUDY'
      AND bi.accession_number IS NULL
    ORDER BY bi.bill_id, bi.id
  LOOP
    accession_num := generate_accession_number();

    UPDATE bill_items
      SET accession_number     = accession_num,
          exam_workflow_status = COALESCE(exam_workflow_status, 'EXAM_SCHEDULED'),
          updated_at           = NOW()
    WHERE id = v_item.bill_item_id;

    -- For the first STUDY item in each bill, update bill-level accession if null
    IF v_item.bill_id <> last_bill_id THEN
      last_bill_id := v_item.bill_id;
      UPDATE patient_bills
        SET accession_number = COALESCE(accession_number, accession_num)
      WHERE id = v_item.bill_id;
    END IF;

    RAISE NOTICE 'Backfilled accession % for bill_item % (bill %)',
      accession_num, v_item.bill_item_id, v_item.bill_id;
  END LOOP;
END;
$$;
