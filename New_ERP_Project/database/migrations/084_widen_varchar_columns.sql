-- Migration 084: Widen VARCHAR columns that are too narrow for their data
-- Widen status/type/mode/action enum columns from ≤20 to 50 chars
-- Widen non-fixed-format 10-char columns to safe sizes

-- ── VARCHAR(10) non-fixed-format columns ─────────────────────────────────────
ALTER TABLE accounting_entries    ALTER COLUMN entry_type        TYPE VARCHAR(50);
ALTER TABLE cost_centers          ALTER COLUMN cost_center_code  TYPE VARCHAR(30);
ALTER TABLE expense_stock_alerts  ALTER COLUMN alert_level       TYPE VARCHAR(50);

-- ── status columns (VARCHAR(20) → 50) ────────────────────────────────────────
ALTER TABLE account_reconciliation   ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE accounting_credit_notes  ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE accounting_debit_notes   ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE appointments             ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE asset_contracts          ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE asset_maintenance        ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE asset_maintenance_logs   ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE asset_master             ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE assets                   ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE attendance               ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE bank_reconciliation      ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE bills                    ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE centers                  ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE expense_records          ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE financial_reconciliation ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE gst_reports              ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE insurance_claims         ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE insurance_settlements    ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE invoices                 ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE journal_entries          ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE leave_requests           ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE payables                 ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE payroll_register         ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE print_jobs               ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE procurement_orders       ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE projects                 ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE purchase_orders          ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE purchase_receipts        ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE purchase_requisitions    ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE radiologist_master       ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE receivables              ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE referring_physician_master ALTER COLUMN status        TYPE VARCHAR(50);
ALTER TABLE scanners                 ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE studies                  ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE vendor_bills             ALTER COLUMN bill_status     TYPE VARCHAR(50);
ALTER TABLE whatsapp_notifications   ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE whatsapp_promotions      ALTER COLUMN status          TYPE VARCHAR(50);
ALTER TABLE whatsapp_templates       ALTER COLUMN status          TYPE VARCHAR(50);

-- ── payment_status columns (VARCHAR(20) → 50) ────────────────────────────────
ALTER TABLE accounting_bills    ALTER COLUMN payment_status TYPE VARCHAR(50);
ALTER TABLE accounting_payments ALTER COLUMN payment_status TYPE VARCHAR(50);
ALTER TABLE asset_expenses      ALTER COLUMN payment_status TYPE VARCHAR(50);
ALTER TABLE expense_records     ALTER COLUMN payment_status TYPE VARCHAR(50);
ALTER TABLE patient_bills       ALTER COLUMN payment_status TYPE VARCHAR(50);
ALTER TABLE studies             ALTER COLUMN payment_status TYPE VARCHAR(50);
ALTER TABLE vendor_bills        ALTER COLUMN payment_status TYPE VARCHAR(50);

-- ── payment_mode columns (VARCHAR(20) → 50) ──────────────────────────────────
ALTER TABLE bill_payments          ALTER COLUMN payment_mode TYPE VARCHAR(50);
ALTER TABLE expenses               ALTER COLUMN payment_mode TYPE VARCHAR(50);
ALTER TABLE insurance_settlements  ALTER COLUMN payment_mode TYPE VARCHAR(50);
ALTER TABLE patient_bills          ALTER COLUMN payment_mode TYPE VARCHAR(50);
ALTER TABLE payables               ALTER COLUMN payment_mode TYPE VARCHAR(50);
ALTER TABLE radiologist_payments   ALTER COLUMN payment_mode TYPE VARCHAR(50);
ALTER TABLE receivables            ALTER COLUMN payment_mode TYPE VARCHAR(50);
ALTER TABLE vendor_payments        ALTER COLUMN payment_mode TYPE VARCHAR(50);

-- ── movement_type / reference_type / action / entity columns ─────────────────
ALTER TABLE bill_history          ALTER COLUMN action_type    TYPE VARCHAR(50);
ALTER TABLE expense_stock_movements ALTER COLUMN movement_type TYPE VARCHAR(50);
ALTER TABLE expense_stock_movements ALTER COLUMN reference_type TYPE VARCHAR(50);
ALTER TABLE gst_audit_log         ALTER COLUMN entity_type    TYPE VARCHAR(50);
ALTER TABLE inventory_movements   ALTER COLUMN movement_type  TYPE VARCHAR(50);
ALTER TABLE loaner_asset_movements ALTER COLUMN movement_type TYPE VARCHAR(50);

-- ── bill_type (VARCHAR(20) → 50) ─────────────────────────────────────────────
ALTER TABLE vendor_bills ALTER COLUMN bill_type TYPE VARCHAR(50);
