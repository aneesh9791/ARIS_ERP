-- Migration 089: Complete RBAC Roles — add FINANCE_MANAGER + update permissions
-- Extends 004_rbac.sql with roles for Finance, Procurement, and Payroll modules

-- ── Add FINANCE_MANAGER role ──────────────────────────────────────────────────
INSERT INTO user_roles (
  role, role_name, description,
  permissions, dashboard_widgets, report_access,
  is_corporate_role, can_access_all_centers, allowed_centers, notes
) VALUES (
  'FINANCE_MANAGER', 'Finance Manager',
  'Manages Chart of Accounts, manual journal entries, financial reports, and GL reconciliation across all centers',
  '["BILLING_VIEW","BILLING_PAYMENT","VENDOR_VIEW","VENDOR_BILLING","VENDOR_PAYMENT",
    "INVENTORY_VIEW","EMPLOYEE_VIEW","EMPLOYEE_PAYROLL",
    "COA_VIEW","COA_CREATE","COA_UPDATE","COA_DELETE",
    "JE_CREATE","JE_VIEW","JE_POST","JE_REVERSE",
    "PETTY_CASH_VIEW","PETTY_CASH_CREATE","PETTY_CASH_APPROVE",
    "REPORTS_VIEW","REPORTS_BILLING","REPORTS_FINANCIAL","REPORTS_DOWNLOAD",
    "DASHBOARD_VIEW","DASHBOARD_FINANCIAL"]',
  '["REVENUE_SUMMARY","BILLING_SUMMARY","PAYMENT_STATUS","EXPENSE_SUMMARY",
    "PROFIT_LOSS","REVENUE_CHART","VENDOR_PAYMENTS","INVENTORY_STATUS"]',
  '["ALL_REPORTS"]',
  true, true, NULL,
  'Finance manager — full COA + JE authority, read-only on clinical/HR modules'
) ON CONFLICT (role) DO NOTHING;

-- ── Add PROCUREMENT_MANAGER role ──────────────────────────────────────────────
INSERT INTO user_roles (
  role, role_name, description,
  permissions, dashboard_widgets, report_access,
  is_corporate_role, can_access_all_centers, allowed_centers, notes
) VALUES (
  'PROCUREMENT_MANAGER', 'Procurement Manager',
  'Manages purchase requisitions, purchase orders, GRN, vendor master, and inventory across all centers',
  '["VENDOR_VIEW","VENDOR_CREATE","VENDOR_UPDATE","VENDOR_BILLING","VENDOR_PAYMENT",
    "INVENTORY_VIEW","INVENTORY_CREATE","INVENTORY_UPDATE","INVENTORY_PURCHASE","INVENTORY_STOCK",
    "PR_CREATE","PR_VIEW","PR_APPROVE",
    "PO_CREATE","PO_VIEW","PO_APPROVE","PO_CANCEL",
    "GRN_CREATE","GRN_VIEW","GRN_APPROVE",
    "ASSET_VIEW","ASSET_CREATE","ASSET_UPDATE",
    "REPORTS_VIEW","REPORTS_DOWNLOAD","DASHBOARD_VIEW","DASHBOARD_OPERATIONAL"]',
  '["INVENTORY_STATUS","VENDOR_PAYMENTS","MAINTENANCE_SCHEDULE"]',
  '["INVENTORY_STOCK","INVENTORY_PURCHASE","INVENTORY_CONSUMPTION","VENDOR_REPORT"]',
  true, true, NULL,
  'Full procurement cycle: PR → PO → GRN → vendor payment'
) ON CONFLICT (role) DO NOTHING;

-- ── Update ACCOUNTANT: add JE_CREATE, PETTY_CASH_APPROVE ─────────────────────
UPDATE user_roles
SET permissions = permissions
  || '["JE_CREATE","JE_VIEW","PETTY_CASH_VIEW","PETTY_CASH_CREATE","PETTY_CASH_APPROVE",
       "COA_VIEW"]'::jsonb,
    updated_at = NOW()
WHERE role = 'ACCOUNTANT';

-- ── Update INVENTORY_MANAGER: add explicit PR/PO/GRN permissions ──────────────
UPDATE user_roles
SET permissions = permissions
  || '["PR_CREATE","PR_VIEW","PR_APPROVE","PO_CREATE","PO_VIEW","PO_APPROVE","PO_CANCEL",
       "GRN_CREATE","GRN_VIEW","GRN_APPROVE","ASSET_VIEW","ASSET_CREATE","ASSET_UPDATE"]'::jsonb,
    updated_at = NOW()
WHERE role = 'INVENTORY_MANAGER';

-- ── Update HR_MANAGER: add PAYROLL_RUN, PAYROLL_APPROVE ──────────────────────
UPDATE user_roles
SET permissions = permissions
  || '["PAYROLL_RUN","PAYROLL_APPROVE","PAYROLL_VIEW"]'::jsonb,
    updated_at = NOW()
WHERE role = 'HR_MANAGER';

-- ── Update RECEPTIONIST: add BILL_CANCEL permission for receptionist-level voids
UPDATE user_roles
SET permissions = permissions
  || '["BILLING_CANCEL_OWN"]'::jsonb,
    updated_at = NOW()
WHERE role = 'RECEPTIONIST';

-- ── Ensure admin user has SUPER_ADMIN ────────────────────────────────────────
UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'admin@aris.com' AND (role IS NULL OR role = '');
