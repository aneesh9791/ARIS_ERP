-- Migration 112: Add weekly_offs contract field to employees
-- Diagnostic centres work 6 or 7 days a week; the old code assumed a
-- 5-day (Mon-Fri) week which gave a wrong working-days denominator.
-- weekly_offs = 0 → 7-day week (no fixed off day)
-- weekly_offs = 1 → 6-day week (Sunday off)
-- weekly_offs = 2 → 5-day week (Saturday + Sunday off)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS weekly_offs SMALLINT NOT NULL DEFAULT 1
    CHECK (weekly_offs IN (0, 1, 2));

COMMENT ON COLUMN employees.weekly_offs IS
  'Contracted weekly off days: 0 = 7-day week, 1 = Sunday off (6-day), 2 = Sat+Sun off (5-day)';
