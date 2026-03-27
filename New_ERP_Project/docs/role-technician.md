# Role: TECHNICIAN

## Overview

The Technician role covers the full front-desk and scan-room workflow — from patient registration through billing, the complete radiology worklist chain, consumable recording, and basic self-service HR functions. Technicians can create and update records across their operational scope but cannot cancel/void bills, approve financial transactions, or access any financial reporting.

---

## Permission Set (25 permissions)

### Dashboard
| Permission | What it unlocks |
|---|---|
| `DASHBOARD_VIEW` | Access the dashboard; non-financial widgets only (patient count, study count, pending/completed reports, modality breakdown, scanner utilisation) |

### Patient Management
| Permission | What it unlocks |
|---|---|
| `PATIENT_VIEW` | Search, view and look up patients |
| `PATIENT_WRITE` | Register new patients, edit demographics |

### Study Management
| Permission | What it unlocks |
|---|---|
| `STUDY_VIEW` | View study list, search by accession / PID |
| `STUDY_WRITE` | Generate accession numbers, update study records |

### Radiology Worklist (full chain)
| Permission | What it unlocks |
|---|---|
| `RADIOLOGY_VIEW` | View the radiology worklist |
| `RADIOLOGY_REPORT` | Mark Exam Completed (assign radiologist, add consumables), Mark Report Completed |
| `STUDY_CONSUMABLE_VIEW` | View and record consumables used during a study |
| `MWL_VIEW` | View DICOM Modality Worklist (MWL) |
| `MWL_WRITE` | Push / update MWL entries for scanners |

### Billing
| Permission | What it unlocks |
|---|---|
| `BILLING_VIEW` | View bills, patient billing history |
| `BILLING_WRITE` | Create bills, add DICOM/Contrast/addon services, apply discount, update payment status |
| `BILL_PRINT_VIEW` | Print patient invoices |
| `BILL_CONSUMABLE_VIEW` | View consumables attached to a bill |

> ⚠️ `BILLING_REFUND` is **NOT** granted — technicians cannot cancel or void a bill.

### Reference / Master Data (read-only)
| Permission | What it unlocks |
|---|---|
| `PHYSICIAN_VIEW` | View referring physicians (used in billing and study forms) |
| `SERVICE_VIEW` | View service/addon catalogue (used in billing dropdowns) |
| `STUDY_CATALOG_VIEW` | View the study catalogue |
| `STUDY_PRICING_VIEW` | View study pricing for their assigned center |

### Procurement
| Permission | What it unlocks |
|---|---|
| `PR_VIEW` | View purchase requisitions |
| `PR_WRITE` | Create and submit purchase requisitions, add line items |
| `INVENTORY_VIEW` | View item master and stock levels |
| `INVENTORY_WRITE` | Create new items in the item master (consumables, supplies) |

> ⚠️ No PO, GRN, or vendor permissions — PRs only.

### Petty Cash
| Permission | What it unlocks |
|---|---|
| `PETTY_CASH_VIEW` | View petty cash vouchers |
| `PETTY_CASH_WRITE` | Create petty cash vouchers |

> ⚠️ `PETTY_CASH_APPROVE` is **NOT** granted — technicians cannot approve their own vouchers.

### HR (self-service only)
| Permission | What it unlocks |
|---|---|
| `ATTENDANCE_VIEW` | View own attendance records |
| `ATTENDANCE_MARK` | Mark own attendance |
| `LEAVE_APPLY` | Apply for leave |

> ⚠️ No payroll, employee management, or leave approval permissions.

---

## Explicitly Excluded Permissions

| Category | Excluded | Reason |
|---|---|---|
| Billing | `BILLING_REFUND` | Cannot cancel or void bills |
| Finance | `COA_*`, `JE_*`, `GST_*`, `EQUITY_*` | No access to chart of accounts or journal entries |
| Reporting | `REPORTS_VIEW`, `REPORTS_EXPORT` | No financial reports |
| Radiology mgmt | `RADIOLOGY_APPROVE` | Not a management-level approval |
| Procurement | `PO_*`, `GRN_*`, `VENDOR_*` | PRs only — no PO creation or goods receipt |
| HR admin | `EMPLOYEE_*`, `PAYROLL_*`, `LEAVE_APPROVE` | Self-service only |
| Assets | `ASSET_*`, `LOANER_*` | Not applicable |
| Insurance | `INSURANCE_*` | Not applicable |
| Administration | `USER_*`, `SYSTEM_ADMIN`, `CENTER_*`, `SERVICE_WRITE` | Admin-only |
| Master data write | `MASTER_DATA_WRITE`, `RAD_REPORTING_MASTER_VIEW` | View-only access to reference data |
| Petty cash | `PETTY_CASH_APPROVE` | Cannot self-approve |

---

## Typical Daily Workflow

```
1. Register / search patient          → PATIENT_WRITE / PATIENT_VIEW
2. Create bill (study + addons)        → BILLING_WRITE
3. Apply discount if needed            → BILLING_WRITE
4. Generate accession number           → STUDY_WRITE
5. Push to MWL / scanner               → MWL_WRITE
6. Scan performed — mark Exam Complete → RADIOLOGY_REPORT
   └── Assign radiologist
   └── Record consumables used
7. Radiologist reviews → Mark Report Complete → RADIOLOGY_REPORT
8. Update payment / print invoice      → BILLING_WRITE / BILL_PRINT_VIEW
9. Raise PR for consumable restock     → PR_WRITE
10. Submit petty cash voucher          → PETTY_CASH_WRITE
11. Mark attendance / apply leave      → ATTENDANCE_MARK / LEAVE_APPLY
```

---

## How to Create This Role

### Via UI
1. Go to **Settings → User Roles → Create Role**
2. Set role name: `TECHNICIAN`
3. Check all 25 permissions listed above
4. Save and assign to technician users

### Via Database
```sql
INSERT INTO user_roles (role, role_name, permissions, active, created_at, updated_at)
VALUES (
  'TECHNICIAN',
  'Technician',
  '["DASHBOARD_VIEW","PATIENT_VIEW","PATIENT_WRITE","STUDY_VIEW","STUDY_WRITE",
    "RADIOLOGY_VIEW","RADIOLOGY_REPORT","BILLING_VIEW","BILLING_WRITE",
    "BILL_PRINT_VIEW","BILL_CONSUMABLE_VIEW","STUDY_CONSUMABLE_VIEW",
    "MWL_VIEW","MWL_WRITE","STUDY_CATALOG_VIEW","STUDY_PRICING_VIEW",
    "PHYSICIAN_VIEW","SERVICE_VIEW","PR_VIEW","PR_WRITE",
    "INVENTORY_VIEW","INVENTORY_WRITE","PETTY_CASH_VIEW","PETTY_CASH_WRITE",
    "ATTENDANCE_VIEW","ATTENDANCE_MARK","LEAVE_APPLY"]'::jsonb,
  true,
  NOW(),
  NOW()
);
```
