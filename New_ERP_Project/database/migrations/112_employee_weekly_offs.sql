-- Migration 112: Add weekly_offs contract field to employees
-- The off day(s) can fall on any day of the week (not necessarily Sat/Sun).
-- weekly_offs = number of contracted off days per week (0–6).
-- Payroll uses this as the denominator when prorating salary.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS weekly_offs SMALLINT NOT NULL DEFAULT 1
    CHECK (weekly_offs BETWEEN 0 AND 6);

COMMENT ON COLUMN employees.weekly_offs IS
  'Contracted off days per week (0–6). Used to compute working-days denominator in payroll proration.';
