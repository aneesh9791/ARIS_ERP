-- Migration 080: Back-fill PO_CREATED status for PRs that already have an active PO
-- Root cause: POST /api/procurement/pos was sending a notification but not updating
-- purchase_requisitions.status, leaving PRs stuck as APPROVED and re-appearing
-- in the "+ PO" list even after a PO was already raised against them.

UPDATE purchase_requisitions pr
SET status = 'PO_CREATED', updated_at = NOW()
WHERE pr.status = 'APPROVED'
  AND pr.active = true
  AND EXISTS (
    SELECT 1 FROM procurement_orders po
    WHERE po.pr_id = pr.id
      AND po.active = true
      AND po.status != 'CANCELLED'
  );

-- Verify
SELECT pr.pr_number, pr.title, pr.status, po.po_number, po.status AS po_status
FROM purchase_requisitions pr
JOIN procurement_orders po ON po.pr_id = pr.id
WHERE po.active = true
ORDER BY pr.id;
