-- Migration 086: Add supplier quotation reference field to procurement_orders
ALTER TABLE procurement_orders ADD COLUMN IF NOT EXISTS quotation_ref VARCHAR(100);
