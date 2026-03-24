-- Migration 091: Role-based procurement approval
-- Adds PROCUREMENT_L1 (PR Level-1 approver) and PROCUREMENT_L2 (PR Level-2 + PO approver)
-- Adds PENDING_APPROVAL status to procurement_orders
-- Adds approved_by/approved_at/rejection_reason columns to procurement_orders

-- ── New roles ─────────────────────────────────────────────────────────────────
INSERT INTO user_roles (role, role_name, description, permissions, dashboard_widgets, report_access, is_corporate_role, can_access_all_centers, notes)
VALUES (
  'PROCUREMENT_L1', 'Procurement Approver – Level 1',
  'Approves Purchase Requisitions at center level (L1)',
  '["PR_VIEW","PR_APPROVE","PO_VIEW","VENDOR_VIEW","INVENTORY_VIEW","DASHBOARD_VIEW"]',
  '["INVENTORY_STATUS"]', '["INVENTORY_PURCHASE"]',
  false, false,
  'Center-level PR approver — assign center_id on the user record'
) ON CONFLICT (role) DO NOTHING;

INSERT INTO user_roles (role, role_name, description, permissions, dashboard_widgets, report_access, is_corporate_role, can_access_all_centers, notes)
VALUES (
  'PROCUREMENT_L2', 'Procurement Approver – Level 2 / PO Approver',
  'Final approver for Purchase Requisitions (L2) and approves Purchase Orders',
  '["PR_VIEW","PR_APPROVE","PO_VIEW","PO_APPROVE","PO_CANCEL","VENDOR_VIEW","INVENTORY_VIEW","REPORTS_VIEW","DASHBOARD_VIEW"]',
  '["INVENTORY_STATUS","VENDOR_PAYMENTS"]', '["INVENTORY_PURCHASE","VENDOR_REPORT"]',
  true, true,
  'Director-level approver — approves PRs at final level and all POs'
) ON CONFLICT (role) DO NOTHING;

-- ── Add PENDING_APPROVAL to procurement_orders status ────────────────────────
ALTER TABLE procurement_orders
  DROP CONSTRAINT IF EXISTS procurement_orders_status_check;

ALTER TABLE procurement_orders
  ADD CONSTRAINT procurement_orders_status_check
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','ISSUED','ACKNOWLEDGED','COMPLETED','CANCELLED'));

-- ── Add approval tracking columns to procurement_orders ──────────────────────
ALTER TABLE procurement_orders
  ADD COLUMN IF NOT EXISTS approved_by       INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by      INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_at      TIMESTAMP;
