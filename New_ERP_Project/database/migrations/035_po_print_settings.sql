-- Separate header/footer/terms for Purchase Orders vs Invoices
ALTER TABLE company_info
  ADD COLUMN IF NOT EXISTS po_header_text     TEXT,
  ADD COLUMN IF NOT EXISTS po_footer_text     TEXT,
  ADD COLUMN IF NOT EXISTS po_terms_conditions TEXT;
