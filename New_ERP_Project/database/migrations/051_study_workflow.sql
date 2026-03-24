-- Migration 051: Study & Reporting Workflow
-- Adds exam_workflow_status to drive the Study & Reporting Status page

ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS exam_workflow_status VARCHAR(30)
    CHECK (exam_workflow_status IN ('EXAM_SCHEDULED','EXAM_COMPLETED','REPORT_COMPLETED')),
  ADD COLUMN IF NOT EXISTS reporter_radiologist_id INT REFERENCES radiologist_master(id),
  ADD COLUMN IF NOT EXISTS rate_snapshot NUMERIC(10,2);

-- Back-fill: any study already PAID should enter the workflow queue
UPDATE studies
SET exam_workflow_status = 'EXAM_SCHEDULED'
WHERE payment_status = 'PAID'
  AND exam_workflow_status IS NULL
  AND active = true;

-- Back-fill: studies already reported (have radiologist_code + report_status=COMPLETED)
UPDATE studies
SET exam_workflow_status = 'REPORT_COMPLETED'
WHERE report_status = 'COMPLETED'
  AND radiologist_code IS NOT NULL
  AND active = true;

CREATE INDEX IF NOT EXISTS idx_studies_exam_workflow
  ON studies(exam_workflow_status) WHERE active = true;
