-- Migration 063: Add approval workflow to vendor_bills (Direct Bills)
-- DRAFT → SUBMITTED → APPROVED (JE posted) | REJECTED → resubmit

ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS approval_status   VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS approved_by       INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejected_by       INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejected_at       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;

-- Existing bills were posted without approval → mark all as APPROVED
-- (journal_entry_id already set by 053 migration)
UPDATE vendor_bills SET approval_status = 'APPROVED' WHERE approval_status != 'APPROVED';

COMMENT ON COLUMN vendor_bills.approval_status IS 'DRAFT | SUBMITTED | APPROVED | REJECTED — JE posted only on APPROVED';
