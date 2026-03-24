-- Migration 092: Move PR/PO approval authority to permissions on real roles
-- PROCUREMENT_L1 / PROCUREMENT_L2 were pseudo-roles — approval level is now a
-- permission (PR_APPROVE_L1, PR_APPROVE_L2, PO_APPROVE) on existing roles.

-- ── Add approval permissions to existing roles ────────────────────────────────

-- CENTER_MANAGER: approves PRs at center level (L1)
UPDATE user_roles
SET permissions = permissions || '["PR_APPROVE_L1"]'::jsonb, updated_at = NOW()
WHERE role = 'CENTER_MANAGER'
  AND NOT (permissions @> '["PR_APPROVE_L1"]'::jsonb);

-- FINANCE_MANAGER: final PR approver (L2) + PO approver
UPDATE user_roles
SET permissions = permissions || '["PR_APPROVE_L1","PR_APPROVE_L2","PO_APPROVE"]'::jsonb, updated_at = NOW()
WHERE role = 'FINANCE_MANAGER'
  AND NOT (permissions @> '["PR_APPROVE_L2"]'::jsonb);

-- PROCUREMENT_MANAGER: full approval authority — L1, L2, and PO
UPDATE user_roles
SET permissions = permissions || '["PR_APPROVE_L1","PR_APPROVE_L2","PO_APPROVE"]'::jsonb, updated_at = NOW()
WHERE role = 'PROCUREMENT_MANAGER'
  AND NOT (permissions @> '["PR_APPROVE_L2"]'::jsonb);

-- SUPER_ADMIN already has ALL_ACCESS which the permission check treats as wildcard.
-- No change needed.

-- ── Deactivate the pseudo-roles ───────────────────────────────────────────────
-- Users currently assigned these roles should be reassigned to a real role.
UPDATE user_roles
SET active = false, updated_at = NOW()
WHERE role IN ('PROCUREMENT_L1', 'PROCUREMENT_L2');

-- Reassign any users still on these pseudo-roles to PROCUREMENT_MANAGER
UPDATE users
SET role = 'PROCUREMENT_MANAGER', updated_at = NOW()
WHERE role IN ('PROCUREMENT_L1', 'PROCUREMENT_L2');
