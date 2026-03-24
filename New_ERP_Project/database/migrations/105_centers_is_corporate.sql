-- ============================================================
-- 105_centers_is_corporate.sql
-- Add is_corporate flag to centers table
-- Used by MWL Gateway and operational dropdowns to exclude
-- the holding company (Feenixtech Ventures LLP) from center lists.
-- ============================================================

ALTER TABLE centers
  ADD COLUMN IF NOT EXISTS is_corporate BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN centers.is_corporate IS
  'true = holding/corporate entity (excluded from MWL, patient registration, billing dropdowns). false = operational diagnostic center.';

-- ── Back-fill: mark Feenixtech Ventures LLP as corporate ────────────────────
-- Identifies by code=CORP or name pattern.  IF NOT EXISTS guard above means
-- this UPDATE is safe to re-run (column already set on existing environments).
UPDATE centers
   SET is_corporate = true
 WHERE (code = 'CORP'
        OR name ILIKE '%feenixtech%'
        OR name ILIKE '%corporate%')
   AND is_corporate = false;
