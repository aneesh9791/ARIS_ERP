-- ============================================================
-- 036_finance_coa_healthcare.sql
-- Complete Chart of Accounts for ARIS Healthcare Radiology ERP
-- Best-practice double-entry structure for a multi-centre
-- diagnostic imaging / radiology group
-- ============================================================

-- ── Helper: idempotent upsert of a COA account ────────────────
CREATE OR REPLACE FUNCTION _upsert_account(
  p_code        VARCHAR,
  p_name        VARCHAR,
  p_type        VARCHAR,      -- 'BALANCE_SHEET' | 'INCOME_STATEMENT'
  p_category    VARCHAR,      -- 'ASSET'|'LIABILITY'|'EQUITY'|'REVENUE'|'COGS'|'EXPENSE'
  p_nature      VARCHAR,      -- 'debit' | 'credit'
  p_level       INTEGER,
  p_parent_code VARCHAR DEFAULT NULL,
  p_desc        TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO chart_of_accounts
    (account_code, account_name, account_type, account_category,
     nature, normal_balance, account_level, parent_account_id,
     is_active, description)
  SELECT
    p_code, p_name, p_type, p_category,
    p_nature, p_nature, p_level,
    (SELECT id FROM chart_of_accounts WHERE account_code = p_parent_code),
    true, p_desc
  ON CONFLICT (account_code) DO UPDATE SET
    account_name      = EXCLUDED.account_name,
    account_type      = EXCLUDED.account_type,
    account_category  = EXCLUDED.account_category,
    nature            = EXCLUDED.nature,
    normal_balance    = EXCLUDED.normal_balance,
    account_level     = EXCLUDED.account_level,
    parent_account_id = EXCLUDED.parent_account_id,
    is_active         = true,
    description       = COALESCE(EXCLUDED.description, chart_of_accounts.description);
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- 1. ASSETS  (1000 – 1999)
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('1000','ASSETS','BALANCE_SHEET','ASSET','debit',1,NULL,'Top-level asset group');

-- ── 1100  Current Assets ─────────────────────────────────────
SELECT _upsert_account('1100','Current Assets','BALANCE_SHEET','ASSET','debit',2,'1000');

  -- Cash & Bank
  SELECT _upsert_account('1110','Cash & Bank','BALANCE_SHEET','ASSET','debit',3,'1100');
    SELECT _upsert_account('1111','Cash in Hand','BALANCE_SHEET','ASSET','debit',4,'1110','Petty cash held at reception');
    SELECT _upsert_account('1112','Bank – Primary Current Account','BALANCE_SHEET','ASSET','debit',4,'1110');
    SELECT _upsert_account('1113','Bank – Secondary / Savings Account','BALANCE_SHEET','ASSET','debit',4,'1110');
    SELECT _upsert_account('1114','Petty Cash – Centre Operations','BALANCE_SHEET','ASSET','debit',4,'1110');

  -- Accounts Receivable
  SELECT _upsert_account('1120','Accounts Receivable','BALANCE_SHEET','ASSET','debit',3,'1100');
    SELECT _upsert_account('1121','AR – Self-Pay Patients','BALANCE_SHEET','ASSET','debit',4,'1120');
    SELECT _upsert_account('1122','AR – Insurance Companies','BALANCE_SHEET','ASSET','debit',4,'1120');
    SELECT _upsert_account('1123','AR – Corporate Clients','BALANCE_SHEET','ASSET','debit',4,'1120');
    SELECT _upsert_account('1124','AR – CGHS / Government','BALANCE_SHEET','ASSET','debit',4,'1120');
    SELECT _upsert_account('1125','Provision for Doubtful Debts','BALANCE_SHEET','ASSET','credit',4,'1120','Contra-asset');

  -- Advances & Deposits
  SELECT _upsert_account('1130','Advances & Deposits','BALANCE_SHEET','ASSET','debit',3,'1100');
    SELECT _upsert_account('1131','Advance to Suppliers','BALANCE_SHEET','ASSET','debit',4,'1130');
    SELECT _upsert_account('1132','Staff Advances & Loans','BALANCE_SHEET','ASSET','debit',4,'1130');
    SELECT _upsert_account('1133','Security Deposits Paid','BALANCE_SHEET','ASSET','debit',4,'1130','Deposits paid to landlords, utilities');
    SELECT _upsert_account('1134','GST Input Credit (ITC)','BALANCE_SHEET','ASSET','debit',4,'1130');

  -- Prepaid Expenses
  SELECT _upsert_account('1140','Prepaid Expenses','BALANCE_SHEET','ASSET','debit',3,'1100');
    SELECT _upsert_account('1141','Prepaid Insurance','BALANCE_SHEET','ASSET','debit',4,'1140');
    SELECT _upsert_account('1142','Prepaid Rent','BALANCE_SHEET','ASSET','debit',4,'1140');
    SELECT _upsert_account('1143','Prepaid AMC / Service Contracts','BALANCE_SHEET','ASSET','debit',4,'1140');

  -- Inventory / Stock
  SELECT _upsert_account('1150','Inventory – Medical Supplies','BALANCE_SHEET','ASSET','debit',3,'1100');
    SELECT _upsert_account('1151','Stock – Medical Consumables','BALANCE_SHEET','ASSET','debit',4,'1150');
    SELECT _upsert_account('1152','Stock – Contrast Media','BALANCE_SHEET','ASSET','debit',4,'1150');
    SELECT _upsert_account('1153','Stock – Film & Digital Media','BALANCE_SHEET','ASSET','debit',4,'1150');
    SELECT _upsert_account('1154','Stock – Stationery','BALANCE_SHEET','ASSET','debit',4,'1150');
    SELECT _upsert_account('1155','Stock – Drugs & Pharmaceuticals','BALANCE_SHEET','ASSET','debit',4,'1150');

-- ── 1200  Fixed Assets ───────────────────────────────────────
SELECT _upsert_account('1200','Fixed Assets','BALANCE_SHEET','ASSET','debit',2,'1000');

  SELECT _upsert_account('1210','Medical & Radiology Equipment','BALANCE_SHEET','ASSET','debit',3,'1200','CT, MRI, X-Ray, Ultrasound, Mammography equipment');
  SELECT _upsert_account('1220','IT Equipment & Computers','BALANCE_SHEET','ASSET','debit',3,'1200','Workstations, servers, PACS, RIS');
  SELECT _upsert_account('1230','Furniture & Fixtures','BALANCE_SHEET','ASSET','debit',3,'1200');
  SELECT _upsert_account('1240','Vehicles','BALANCE_SHEET','ASSET','debit',3,'1200');
  SELECT _upsert_account('1250','Leasehold Improvements','BALANCE_SHEET','ASSET','debit',3,'1200','Fit-out, civil works, radiation shielding');
  SELECT _upsert_account('1260','Office Equipment','BALANCE_SHEET','ASSET','debit',3,'1200');
  SELECT _upsert_account('1290','Less: Accumulated Depreciation','BALANCE_SHEET','ASSET','credit',3,'1200','Contra-asset');
    SELECT _upsert_account('1291','Accum. Depr. – Medical Equipment','BALANCE_SHEET','ASSET','credit',4,'1290');
    SELECT _upsert_account('1292','Accum. Depr. – IT Equipment','BALANCE_SHEET','ASSET','credit',4,'1290');
    SELECT _upsert_account('1293','Accum. Depr. – Furniture & Fixtures','BALANCE_SHEET','ASSET','credit',4,'1290');
    SELECT _upsert_account('1294','Accum. Depr. – Vehicles','BALANCE_SHEET','ASSET','credit',4,'1290');
    SELECT _upsert_account('1295','Accum. Depr. – Leasehold Improvements','BALANCE_SHEET','ASSET','credit',4,'1290');

-- ── 1300  Intangible Assets ──────────────────────────────────
SELECT _upsert_account('1300','Intangible Assets','BALANCE_SHEET','ASSET','debit',2,'1000');
  SELECT _upsert_account('1310','Software & Licences','BALANCE_SHEET','ASSET','debit',3,'1300');
  SELECT _upsert_account('1320','Goodwill','BALANCE_SHEET','ASSET','debit',3,'1300');

-- ════════════════════════════════════════════════════════════════
-- 2. LIABILITIES  (2000 – 2999)
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('2000','LIABILITIES','BALANCE_SHEET','LIABILITY','credit',1,NULL,'Top-level liability group');

-- ── 2100  Current Liabilities ────────────────────────────────
SELECT _upsert_account('2100','Current Liabilities','BALANCE_SHEET','LIABILITY','credit',2,'2000');

  -- Accounts Payable
  SELECT _upsert_account('2110','Accounts Payable','BALANCE_SHEET','LIABILITY','credit',3,'2100');
    SELECT _upsert_account('2111','AP – Medical & Drug Suppliers','BALANCE_SHEET','LIABILITY','credit',4,'2110');
    SELECT _upsert_account('2112','AP – Equipment & IT Vendors','BALANCE_SHEET','LIABILITY','credit',4,'2110');
    SELECT _upsert_account('2113','AP – Service Providers','BALANCE_SHEET','LIABILITY','credit',4,'2110');
    SELECT _upsert_account('2114','AP – Utilities (Electricity, Water)','BALANCE_SHEET','LIABILITY','credit',4,'2110');

  -- Tax Payable
  SELECT _upsert_account('2120','Tax Payable','BALANCE_SHEET','LIABILITY','credit',3,'2100');
    SELECT _upsert_account('2121','CGST Payable','BALANCE_SHEET','LIABILITY','credit',4,'2120');
    SELECT _upsert_account('2122','SGST Payable','BALANCE_SHEET','LIABILITY','credit',4,'2120');
    SELECT _upsert_account('2123','IGST Payable','BALANCE_SHEET','LIABILITY','credit',4,'2120');
    SELECT _upsert_account('2124','TDS Payable','BALANCE_SHEET','LIABILITY','credit',4,'2120');
    SELECT _upsert_account('2125','Professional Tax Payable','BALANCE_SHEET','LIABILITY','credit',4,'2120');
    SELECT _upsert_account('2126','Income Tax Payable','BALANCE_SHEET','LIABILITY','credit',4,'2120');

  -- Payroll Liabilities
  SELECT _upsert_account('2130','Payroll Liabilities','BALANCE_SHEET','LIABILITY','credit',3,'2100');
    SELECT _upsert_account('2131','Salaries & Wages Payable','BALANCE_SHEET','LIABILITY','credit',4,'2130');
    SELECT _upsert_account('2132','Provident Fund Payable','BALANCE_SHEET','LIABILITY','credit',4,'2130');
    SELECT _upsert_account('2133','ESI Payable','BALANCE_SHEET','LIABILITY','credit',4,'2130');
    SELECT _upsert_account('2134','Bonus Payable','BALANCE_SHEET','LIABILITY','credit',4,'2130');

  -- Other Current Liabilities
  SELECT _upsert_account('2140','Patient Advance Deposits','BALANCE_SHEET','LIABILITY','credit',3,'2100','Advances received before services rendered');
  SELECT _upsert_account('2150','Security Deposits Received','BALANCE_SHEET','LIABILITY','credit',3,'2100');
  SELECT _upsert_account('2160','Accrued Expenses','BALANCE_SHEET','LIABILITY','credit',3,'2100','Expenses incurred but not yet billed');
  SELECT _upsert_account('2170','Deferred Revenue','BALANCE_SHEET','LIABILITY','credit',3,'2100','Health packages sold but not utilised');

-- ── 2200  Long-term Liabilities ──────────────────────────────
SELECT _upsert_account('2200','Long-term Liabilities','BALANCE_SHEET','LIABILITY','credit',2,'2000');
  SELECT _upsert_account('2210','Bank Term Loans','BALANCE_SHEET','LIABILITY','credit',3,'2200');
  SELECT _upsert_account('2220','Equipment Finance / Hire Purchase','BALANCE_SHEET','LIABILITY','credit',3,'2200');
  SELECT _upsert_account('2230','Partner / Director Loans','BALANCE_SHEET','LIABILITY','credit',3,'2200');

-- ════════════════════════════════════════════════════════════════
-- 3. EQUITY  (3000 – 3999)
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('3000','EQUITY','BALANCE_SHEET','EQUITY','credit',1,NULL,'Owners equity');
  SELECT _upsert_account('3100','Partners'' Capital / Share Capital','BALANCE_SHEET','EQUITY','credit',2,'3000');
  SELECT _upsert_account('3200','Retained Earnings','BALANCE_SHEET','EQUITY','credit',2,'3000');
  SELECT _upsert_account('3300','Current Year Profit / (Loss)','BALANCE_SHEET','EQUITY','credit',2,'3000');
  SELECT _upsert_account('3400','Capital Reserve','BALANCE_SHEET','EQUITY','credit',2,'3000');
  SELECT _upsert_account('3500','Drawings / Distributions','BALANCE_SHEET','EQUITY','debit',2,'3000','Contra-equity');

-- ════════════════════════════════════════════════════════════════
-- 4. REVENUE  (4000 – 4999)
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('4000','REVENUE','INCOME_STATEMENT','REVENUE','credit',1,NULL,'All revenue streams');

-- ── 4100  Radiology Services Revenue ────────────────────────
SELECT _upsert_account('4100','Radiology Services Revenue','INCOME_STATEMENT','REVENUE','credit',2,'4000','Core imaging revenue by modality');
  SELECT _upsert_account('4110','CT Scan Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4100');
  SELECT _upsert_account('4120','MRI Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4100');
  SELECT _upsert_account('4130','Digital X-Ray / DR Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4100');
  SELECT _upsert_account('4140','Ultrasound & Doppler Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4100');
  SELECT _upsert_account('4150','Mammography Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4100');
  SELECT _upsert_account('4160','PET-CT Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4100');
  SELECT _upsert_account('4170','Fluoroscopy & Interventional Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4100');
  SELECT _upsert_account('4180','DEXA / Bone Density Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4100');
  SELECT _upsert_account('4190','Nuclear Medicine Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4100');

-- ── 4200  Other Medical Revenue ──────────────────────────────
SELECT _upsert_account('4200','Other Medical Revenue','INCOME_STATEMENT','REVENUE','credit',2,'4000');
  SELECT _upsert_account('4210','Consultation & Reporting Fees','INCOME_STATEMENT','REVENUE','credit',3,'4200');
  SELECT _upsert_account('4220','Health Package Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4200','Wellness & screening packages');
  SELECT _upsert_account('4230','Emergency & After-Hours Surcharge','INCOME_STATEMENT','REVENUE','credit',3,'4200');
  SELECT _upsert_account('4240','Report Delivery & CD Charges','INCOME_STATEMENT','REVENUE','credit',3,'4200');
  SELECT _upsert_account('4250','Tele-Radiology Reading Fees','INCOME_STATEMENT','REVENUE','credit',3,'4200');

-- ── 4300  Insurance & Corporate Revenue ─────────────────────
SELECT _upsert_account('4300','Insurance & Corporate Revenue','INCOME_STATEMENT','REVENUE','credit',2,'4000');
  SELECT _upsert_account('4310','Insurance Reimbursements – General','INCOME_STATEMENT','REVENUE','credit',3,'4300');
  SELECT _upsert_account('4320','CGHS / ESI Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4300');
  SELECT _upsert_account('4330','Corporate Health Plan Revenue','INCOME_STATEMENT','REVENUE','credit',3,'4300');
  SELECT _upsert_account('4340','TPA Settlements','INCOME_STATEMENT','REVENUE','credit',3,'4300');

-- ── 4400  Sundry Income ───────────────────────────────────────
SELECT _upsert_account('4400','Sundry & Other Income','INCOME_STATEMENT','REVENUE','credit',2,'4000');
  SELECT _upsert_account('4410','Bank & Investment Interest','INCOME_STATEMENT','REVENUE','credit',3,'4400');
  SELECT _upsert_account('4420','Asset Disposal Gain','INCOME_STATEMENT','REVENUE','credit',3,'4400');
  SELECT _upsert_account('4430','Rental & Subletting Income','INCOME_STATEMENT','REVENUE','credit',3,'4400');
  SELECT _upsert_account('4440','Miscellaneous Income','INCOME_STATEMENT','REVENUE','credit',3,'4400');

-- ── 4900  Contra Revenue ─────────────────────────────────────
SELECT _upsert_account('4900','Contra Revenue','INCOME_STATEMENT','REVENUE','debit',2,'4000','Reductions to gross revenue');
  SELECT _upsert_account('4910','Discounts Granted to Patients','INCOME_STATEMENT','REVENUE','debit',3,'4900');
  SELECT _upsert_account('4920','Patient Refunds Issued','INCOME_STATEMENT','REVENUE','debit',3,'4900');
  SELECT _upsert_account('4930','Insurance Writebacks & Adjustments','INCOME_STATEMENT','REVENUE','debit',3,'4900');

-- ════════════════════════════════════════════════════════════════
-- 5. COST OF SERVICES – DIRECT COSTS  (5000 – 5199)
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5000','EXPENSES','INCOME_STATEMENT','EXPENSE','debit',1,NULL,'All expense accounts');

SELECT _upsert_account('5100','Direct Costs (Cost of Services)','INCOME_STATEMENT','COGS','debit',2,'5000','Variable costs directly tied to imaging services');
  SELECT _upsert_account('5110','Medical Consumables Used','INCOME_STATEMENT','COGS','debit',3,'5100');
    SELECT _upsert_account('5111','Contrast Media Consumed','INCOME_STATEMENT','COGS','debit',4,'5110');
    SELECT _upsert_account('5112','Syringes, Gloves & Disposables','INCOME_STATEMENT','COGS','debit',4,'5110');
    SELECT _upsert_account('5113','Film & Digital Media Consumed','INCOME_STATEMENT','COGS','debit',4,'5110');
    SELECT _upsert_account('5114','Drugs & Pharmaceuticals Used','INCOME_STATEMENT','COGS','debit',4,'5110');
    SELECT _upsert_account('5115','Other Clinical Materials','INCOME_STATEMENT','COGS','debit',4,'5110');
  SELECT _upsert_account('5120','Outsourced Professional Fees','INCOME_STATEMENT','COGS','debit',3,'5100');
    SELECT _upsert_account('5121','Radiologist Reading Fees','INCOME_STATEMENT','COGS','debit',4,'5120');
    SELECT _upsert_account('5122','Visiting Consultant Fees','INCOME_STATEMENT','COGS','debit',4,'5120');
    SELECT _upsert_account('5123','Tele-Radiology Service Costs','INCOME_STATEMENT','COGS','debit',4,'5120');
  SELECT _upsert_account('5130','Equipment Operating Costs','INCOME_STATEMENT','COGS','debit',3,'5100');
    SELECT _upsert_account('5131','Equipment AMC & Service Contracts','INCOME_STATEMENT','COGS','debit',4,'5130');
    SELECT _upsert_account('5132','Equipment Repairs (Unplanned)','INCOME_STATEMENT','COGS','debit',4,'5130');
    SELECT _upsert_account('5133','Radiation Safety & QA Costs','INCOME_STATEMENT','COGS','debit',4,'5130');

-- ════════════════════════════════════════════════════════════════
-- 5200  Staff & Payroll Costs  (repurposed from TAX EXPENSES)
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5200','Staff & Payroll Costs','INCOME_STATEMENT','EXPENSE','debit',2,'5000');
  SELECT _upsert_account('5210','Salaries – Medical & Technical Staff','INCOME_STATEMENT','EXPENSE','debit',3,'5200');
  SELECT _upsert_account('5220','Salaries – Administrative Staff','INCOME_STATEMENT','EXPENSE','debit',3,'5200');
  SELECT _upsert_account('5230','Salaries – Support & Housekeeping Staff','INCOME_STATEMENT','EXPENSE','debit',3,'5200');
  SELECT _upsert_account('5240','Employer PF & ESI Contributions','INCOME_STATEMENT','EXPENSE','debit',3,'5200');
  SELECT _upsert_account('5250','Staff Medical & Insurance Benefits','INCOME_STATEMENT','EXPENSE','debit',3,'5200');
  SELECT _upsert_account('5260','Staff Bonus & Incentives','INCOME_STATEMENT','EXPENSE','debit',3,'5200');
  SELECT _upsert_account('5270','Staff Training & Development','INCOME_STATEMENT','EXPENSE','debit',3,'5200');
  SELECT _upsert_account('5280','Recruitment & Onboarding Costs','INCOME_STATEMENT','EXPENSE','debit',3,'5200');

-- ════════════════════════════════════════════════════════════════
-- 5300  Premises & Infrastructure
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5300','Premises & Infrastructure','INCOME_STATEMENT','EXPENSE','debit',2,'5000');
  SELECT _upsert_account('5310','Rent & Lease Charges','INCOME_STATEMENT','EXPENSE','debit',3,'5300');
  SELECT _upsert_account('5320','Electricity & Power','INCOME_STATEMENT','EXPENSE','debit',3,'5300');
  SELECT _upsert_account('5330','Water & Sanitation','INCOME_STATEMENT','EXPENSE','debit',3,'5300');
  SELECT _upsert_account('5340','Housekeeping & Facility Cleaning','INCOME_STATEMENT','EXPENSE','debit',3,'5300');
  SELECT _upsert_account('5350','Security Services','INCOME_STATEMENT','EXPENSE','debit',3,'5300');
  SELECT _upsert_account('5360','Facility Maintenance & Repairs','INCOME_STATEMENT','EXPENSE','debit',3,'5300');
  SELECT _upsert_account('5370','Medical Waste Disposal','INCOME_STATEMENT','EXPENSE','debit',3,'5300');
  SELECT _upsert_account('5380','Generator & UPS Maintenance','INCOME_STATEMENT','EXPENSE','debit',3,'5300');

-- ════════════════════════════════════════════════════════════════
-- 5400  Administrative Expenses
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5400','Administrative Expenses','INCOME_STATEMENT','EXPENSE','debit',2,'5000');
  SELECT _upsert_account('5410','Stationery & Office Supplies','INCOME_STATEMENT','EXPENSE','debit',3,'5400');
  SELECT _upsert_account('5420','Printing & Documentation','INCOME_STATEMENT','EXPENSE','debit',3,'5400');
  SELECT _upsert_account('5430','Postage & Courier','INCOME_STATEMENT','EXPENSE','debit',3,'5400');
  SELECT _upsert_account('5440','Telephone & Internet','INCOME_STATEMENT','EXPENSE','debit',3,'5400');
  SELECT _upsert_account('5450','Travel & Conveyance','INCOME_STATEMENT','EXPENSE','debit',3,'5400');
  SELECT _upsert_account('5460','Vehicle Running & Fuel','INCOME_STATEMENT','EXPENSE','debit',3,'5400');
  SELECT _upsert_account('5470','Business Meals & Entertainment','INCOME_STATEMENT','EXPENSE','debit',3,'5400');

-- ════════════════════════════════════════════════════════════════
-- 5500  Marketing & Business Development
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5500','Marketing & Business Development','INCOME_STATEMENT','EXPENSE','debit',2,'5000');
  SELECT _upsert_account('5510','Advertising & Digital Marketing','INCOME_STATEMENT','EXPENSE','debit',3,'5500');
  SELECT _upsert_account('5520','Referral Fees & Commissions','INCOME_STATEMENT','EXPENSE','debit',3,'5500');
  SELECT _upsert_account('5530','Patient Relations & Hospitality','INCOME_STATEMENT','EXPENSE','debit',3,'5500');
  SELECT _upsert_account('5540','Branding, Signage & Collateral','INCOME_STATEMENT','EXPENSE','debit',3,'5500');
  SELECT _upsert_account('5550','Exhibitions & Healthcare Events','INCOME_STATEMENT','EXPENSE','debit',3,'5500');

-- ════════════════════════════════════════════════════════════════
-- 5600  Professional & Compliance
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5600','Professional & Compliance','INCOME_STATEMENT','EXPENSE','debit',2,'5000');
  SELECT _upsert_account('5610','Legal Fees','INCOME_STATEMENT','EXPENSE','debit',3,'5600');
  SELECT _upsert_account('5620','Audit & Accounting Fees','INCOME_STATEMENT','EXPENSE','debit',3,'5600');
  SELECT _upsert_account('5630','Regulatory & Licensing Fees','INCOME_STATEMENT','EXPENSE','debit',3,'5600','AERB, PCPNDT, HPC etc.');
  SELECT _upsert_account('5640','Radiation Safety & Compliance','INCOME_STATEMENT','EXPENSE','debit',3,'5600');
  SELECT _upsert_account('5650','Professional Memberships & Subscriptions','INCOME_STATEMENT','EXPENSE','debit',3,'5600');
  SELECT _upsert_account('5660','Business Insurance Premiums','INCOME_STATEMENT','EXPENSE','debit',3,'5600');

-- ════════════════════════════════════════════════════════════════
-- 5700  IT & Technology
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5700','IT & Technology','INCOME_STATEMENT','EXPENSE','debit',2,'5000');
  SELECT _upsert_account('5710','ERP / Software Subscriptions (SaaS)','INCOME_STATEMENT','EXPENSE','debit',3,'5700');
  SELECT _upsert_account('5720','PACS / RIS Maintenance','INCOME_STATEMENT','EXPENSE','debit',3,'5700');
  SELECT _upsert_account('5730','IT Hardware Maintenance','INCOME_STATEMENT','EXPENSE','debit',3,'5700');
  SELECT _upsert_account('5740','Cybersecurity & Data Backup','INCOME_STATEMENT','EXPENSE','debit',3,'5700');
  SELECT _upsert_account('5750','IT Consumables & Accessories','INCOME_STATEMENT','EXPENSE','debit',3,'5700');

-- ════════════════════════════════════════════════════════════════
-- 5800  Finance Costs
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5800','Finance Costs','INCOME_STATEMENT','EXPENSE','debit',2,'5000');
  SELECT _upsert_account('5810','Bank Charges & Transaction Fees','INCOME_STATEMENT','EXPENSE','debit',3,'5800');
  SELECT _upsert_account('5820','Loan Interest – Term Loans','INCOME_STATEMENT','EXPENSE','debit',3,'5800');
  SELECT _upsert_account('5830','Equipment Finance Interest','INCOME_STATEMENT','EXPENSE','debit',3,'5800');
  SELECT _upsert_account('5840','Late Payment Penalties','INCOME_STATEMENT','EXPENSE','debit',3,'5800');
  SELECT _upsert_account('5850','Bad Debts Written Off','INCOME_STATEMENT','EXPENSE','debit',3,'5800');

-- ════════════════════════════════════════════════════════════════
-- 5900  Depreciation & Amortisation
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5900','Depreciation & Amortisation','INCOME_STATEMENT','EXPENSE','debit',2,'5000');
  SELECT _upsert_account('5910','Depreciation – Medical Equipment','INCOME_STATEMENT','EXPENSE','debit',3,'5900');
  SELECT _upsert_account('5920','Depreciation – IT Equipment','INCOME_STATEMENT','EXPENSE','debit',3,'5900');
  SELECT _upsert_account('5930','Depreciation – Furniture & Fixtures','INCOME_STATEMENT','EXPENSE','debit',3,'5900');
  SELECT _upsert_account('5940','Depreciation – Vehicles','INCOME_STATEMENT','EXPENSE','debit',3,'5900');
  SELECT _upsert_account('5950','Amortisation – Leasehold Improvements','INCOME_STATEMENT','EXPENSE','debit',3,'5900');
  SELECT _upsert_account('5960','Amortisation – Software & Licences','INCOME_STATEMENT','EXPENSE','debit',3,'5900');

-- ════════════════════════════════════════════════════════════════
-- 5990  Tax & Miscellaneous
-- ════════════════════════════════════════════════════════════════
SELECT _upsert_account('5990','Tax & Miscellaneous Expenses','INCOME_STATEMENT','EXPENSE','debit',2,'5000');
  SELECT _upsert_account('5991','Income Tax & Advance Tax','INCOME_STATEMENT','EXPENSE','debit',3,'5990');
  SELECT _upsert_account('5992','GST Expense (Non-recoverable)','INCOME_STATEMENT','EXPENSE','debit',3,'5990');
  SELECT _upsert_account('5993','Donations & CSR Expenses','INCOME_STATEMENT','EXPENSE','debit',3,'5990');
  SELECT _upsert_account('5994','Miscellaneous Expenses','INCOME_STATEMENT','EXPENSE','debit',3,'5990');
  SELECT _upsert_account('5995','Prior Period Adjustments','INCOME_STATEMENT','EXPENSE','debit',3,'5990');

-- ── Cleanup helper function ───────────────────────────────────
DROP FUNCTION IF EXISTS _upsert_account(VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,INTEGER,VARCHAR,TEXT);

DO $$ BEGIN RAISE NOTICE 'Finance COA: % accounts active',
  (SELECT COUNT(*) FROM chart_of_accounts WHERE is_active = true); END $$;
