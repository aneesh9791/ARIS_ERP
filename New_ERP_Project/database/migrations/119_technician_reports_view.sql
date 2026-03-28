-- Migration 119: Add REPORTS_VIEW permission to TECHNICIAN role
-- Allows technicians to access the Reports page (worklist report)

UPDATE user_roles
SET permissions = (
  SELECT jsonb_agg(DISTINCT elem ORDER BY elem)
  FROM jsonb_array_elements_text(
    permissions || '["REPORTS_VIEW"]'::jsonb
  ) AS elem
)
WHERE role = 'TECHNICIAN'
  AND NOT (permissions @> '["REPORTS_VIEW"]'::jsonb);
