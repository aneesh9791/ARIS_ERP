-- Migration 116: Restore correct exam_workflow_status from legacy studies table
--
-- Problem: Migration 115 backfilled all previously-NULL bill_items with
-- exam_workflow_status = 'EXAM_SCHEDULED', even for studies that were already
-- EXAM_COMPLETED or REPORT_COMPLETED. This caused all old completed studies to
-- re-appear on the worklist as unprocessed.
--
-- Fix: Pull the real status (and reporter info) from the studies table.
--   Pass 1: bill_items directly linked via studies.bill_item_id (forward link)
--   Pass 2: bill_items linked via patient_bills.study_id (single-item bills)
--   Pass 3: multi-item bills where the bill's studies row is completed
--           → mark ALL bill_items on that bill to the same status

-- ── Pass 1: Direct forward-link (studies.bill_item_id = bi.id) ───────────────
UPDATE bill_items bi
SET
  exam_workflow_status    = s.exam_workflow_status,
  reporter_radiologist_id = COALESCE(bi.reporter_radiologist_id, s.reporter_radiologist_id),
  rate_snapshot           = COALESCE(bi.rate_snapshot, s.rate_snapshot),
  updated_at              = NOW()
FROM studies s
WHERE s.bill_item_id = bi.id
  AND bi.active = true
  AND s.active = true
  AND s.exam_workflow_status IS NOT NULL
  AND bi.exam_workflow_status IS DISTINCT FROM s.exam_workflow_status;

-- ── Pass 2: Single-item bills via patient_bills.study_id ─────────────────────
UPDATE bill_items bi
SET
  exam_workflow_status    = s.exam_workflow_status,
  reporter_radiologist_id = COALESCE(bi.reporter_radiologist_id, s.reporter_radiologist_id),
  rate_snapshot           = COALESCE(bi.rate_snapshot, s.rate_snapshot),
  updated_at              = NOW()
FROM patient_bills pb
JOIN studies s ON s.id = pb.study_id
WHERE bi.bill_id = pb.id
  AND bi.active = true
  AND s.active = true
  AND s.exam_workflow_status IS NOT NULL
  AND bi.exam_workflow_status IS DISTINCT FROM s.exam_workflow_status;

-- ── Pass 3: Multi-item bills — propagate status to all bill_items ─────────────
-- For bills where no forward-link exists (old multi-study bills), the studies
-- row was shared across all studies in the bill. Apply the same status to all
-- bill_items of that bill.
UPDATE bill_items bi
SET
  exam_workflow_status = s.exam_workflow_status,
  updated_at           = NOW()
FROM patient_bills pb
JOIN studies s ON s.bill_id = pb.id
WHERE bi.bill_id = pb.id
  AND bi.active = true
  AND s.active = true
  AND s.exam_workflow_status IS NOT NULL
  AND bi.exam_workflow_status IS DISTINCT FROM s.exam_workflow_status;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  exam_workflow_status,
  COUNT(*) AS bill_items
FROM bill_items
WHERE active = true AND item_type = 'STUDY'
GROUP BY exam_workflow_status
ORDER BY exam_workflow_status;
