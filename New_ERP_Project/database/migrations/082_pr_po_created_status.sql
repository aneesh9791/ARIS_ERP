-- Migration 082: Add PO_CREATED to purchase_requisitions status check constraint
-- Required for the PR → PO_CREATED status transition when a PO is raised against a PR.

ALTER TABLE purchase_requisitions DROP CONSTRAINT IF EXISTS purchase_requisitions_status_check;

ALTER TABLE purchase_requisitions ADD CONSTRAINT purchase_requisitions_status_check
  CHECK (status IN (
    'DRAFT', 'SUBMITTED', 'L1_APPROVED', 'APPROVED',
    'PO_CREATED',   -- PO has been raised against this PR
    'REJECTED', 'CANCELLED'
  ));

-- Back-fill any existing PRs that already have an active non-cancelled PO
UPDATE purchase_requisitions pr
SET status = 'PO_CREATED', updated_at = NOW()
WHERE pr.status = 'APPROVED'
  AND pr.active = true
  AND EXISTS (
    SELECT 1 FROM procurement_orders po
    WHERE po.pr_id = pr.id AND po.active = true AND po.status != 'CANCELLED'
  );
