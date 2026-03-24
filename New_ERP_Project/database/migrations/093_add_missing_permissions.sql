-- Migration 093: Add missing module permissions + grant to relevant roles
-- Run AFTER 092_procurement_approval_permissions.sql
-- Strategy: grant new permissions broadly first; permission checks in routes reference these.
-- SUPER_ADMIN has ALL_ACCESS and is unaffected.

-- ── GST Management ─────────────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["GST_VIEW","GST_UPDATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('FINANCE_MANAGER','ACCOUNTANT','CENTER_MANAGER')
  AND active = true;

-- ── Insurance ─────────────────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["INSURANCE_VIEW","INSURANCE_CREATE","INSURANCE_UPDATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('RECEPTIONIST','CENTER_MANAGER','FINANCE_MANAGER','ACCOUNTANT')
  AND active = true;

-- ── Service Management ────────────────────────────────────────────────────────
-- SERVICE_VIEW: all roles need the catalog for billing/study assignment
UPDATE user_roles
SET permissions = permissions || '["SERVICE_VIEW"]'::jsonb,
    updated_at  = NOW()
WHERE role != 'SUPER_ADMIN'
  AND active = true;

UPDATE user_roles
SET permissions = permissions || '["SERVICE_CREATE","SERVICE_UPDATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('CENTER_MANAGER','FINANCE_MANAGER')
  AND active = true;

-- ── Scanner / Equipment ───────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["SCANNER_VIEW","SCANNER_UPDATE","SCANNER_MAINTENANCE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('TECHNICIAN','PROCUREMENT_MANAGER','INVENTORY_MANAGER','CENTER_MANAGER')
  AND active = true;

UPDATE user_roles
SET permissions = permissions || '["SCANNER_CREATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('PROCUREMENT_MANAGER','CENTER_MANAGER')
  AND active = true;

-- ── Expense Tracking ──────────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["EXPENSE_VIEW","EXPENSE_CREATE","EXPENSE_UPDATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('ACCOUNTANT','FINANCE_MANAGER','CENTER_MANAGER')
  AND active = true;

-- ── Loaner Asset Tracking ─────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["LOANER_ASSET_VIEW","LOANER_ASSET_RETURN"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('TECHNICIAN','PROCUREMENT_MANAGER','INVENTORY_MANAGER','CENTER_MANAGER')
  AND active = true;

UPDATE user_roles
SET permissions = permissions || '["LOANER_ASSET_CREATE","LOANER_ASSET_UPDATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('PROCUREMENT_MANAGER','INVENTORY_MANAGER','CENTER_MANAGER')
  AND active = true;

-- ── Asset Maintenance ─────────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["ASSET_MAINTENANCE_VIEW","ASSET_MAINTENANCE_CREATE","ASSET_MAINTENANCE_UPDATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('TECHNICIAN','PROCUREMENT_MANAGER','INVENTORY_MANAGER','CENTER_MANAGER')
  AND active = true;

-- ── Radiology Reporting ───────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["RADIOLOGY_REPORT_VIEW","RADIOLOGY_REPORT_CREATE","RADIOLOGY_REPORT_APPROVE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('RADIOLOGIST','CENTER_MANAGER')
  AND active = true;

-- RADIOLOGIST_VIEW permission for the reporting pages (view-only for reception/technician)
UPDATE user_roles
SET permissions = permissions || '["RADIOLOGY_REPORT_VIEW"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('RECEPTIONIST','TECHNICIAN','LAB_TECHNICIAN','ACCOUNTANT')
  AND active = true;

-- ── Study Consumables ─────────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["STUDY_CONSUMABLE_VIEW","STUDY_CONSUMABLE_ISSUE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('TECHNICIAN','RECEPTIONIST','CENTER_MANAGER','RADIOLOGIST','LAB_TECHNICIAN')
  AND active = true;

-- ── Bill Consumables ──────────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["BILL_CONSUMABLE_VIEW","BILL_CONSUMABLE_ISSUE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('RECEPTIONIST','ACCOUNTANT','FINANCE_MANAGER','CENTER_MANAGER')
  AND active = true;

-- ── Bill Printing ─────────────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["BILL_PRINT_VIEW"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('RECEPTIONIST','ACCOUNTANT','FINANCE_MANAGER','CENTER_MANAGER')
  AND active = true;

UPDATE user_roles
SET permissions = permissions || '["BILL_PRINT_CONFIG"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('CENTER_MANAGER')
  AND active = true;

-- ── WhatsApp Integration ──────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["WHATSAPP_VIEW","WHATSAPP_SEND"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('RECEPTIONIST','CENTER_MANAGER')
  AND active = true;

UPDATE user_roles
SET permissions = permissions || '["WHATSAPP_CONFIG"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('CENTER_MANAGER')
  AND active = true;

-- ── Master Data (centers, masters, settings, contracts) ───────────────────────
-- All roles can read master data (it was previously open to all authenticated users)
UPDATE user_roles
SET permissions = permissions || '["MASTER_DATA_VIEW"]'::jsonb,
    updated_at  = NOW()
WHERE role != 'SUPER_ADMIN'
  AND active = true;

UPDATE user_roles
SET permissions = permissions || '["MASTER_DATA_CREATE","MASTER_DATA_UPDATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('CENTER_MANAGER','FINANCE_MANAGER')
  AND active = true;

-- ── Center Contract Rules ─────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["CENTER_CONTRACT_VIEW","CENTER_CONTRACT_MANAGE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('FINANCE_MANAGER','CENTER_MANAGER')
  AND active = true;

-- ── Physician / Referring Doctor Management ───────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["PHYSICIAN_VIEW"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('RECEPTIONIST','RADIOLOGIST','TECHNICIAN','CENTER_MANAGER','LAB_TECHNICIAN','ACCOUNTANT')
  AND active = true;

UPDATE user_roles
SET permissions = permissions || '["PHYSICIAN_CREATE","PHYSICIAN_UPDATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('CENTER_MANAGER')
  AND active = true;

-- ── Report Generation ─────────────────────────────────────────────────────────
UPDATE user_roles
SET permissions = permissions || '["REPORTS_GENERATE"]'::jsonb,
    updated_at  = NOW()
WHERE role IN ('ACCOUNTANT','FINANCE_MANAGER','CENTER_MANAGER','HR_MANAGER')
  AND active = true;
