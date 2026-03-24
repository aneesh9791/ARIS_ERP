-- ════════════════════════════════════════════════════════════════════════════
-- Migration 047: Database-driven Item Category + Chart of Accounts Mapping
-- Replaces all hardcoded category trees in backend and frontend.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Create item_categories table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_categories (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(50)  NOT NULL UNIQUE,
  name              VARCHAR(200) NOT NULL,
  item_type         VARCHAR(20)  NOT NULL CHECK (item_type IN ('STOCK','EXPENSE','FIXED_ASSET')),
  level             SMALLINT     NOT NULL CHECK (level IN (1, 2)),
  parent_id         INTEGER      REFERENCES item_categories(id),
  asset_gl_id       INTEGER      REFERENCES chart_of_accounts(id),
  expense_gl_id     INTEGER      REFERENCES chart_of_accounts(id),
  ap_account_id     INTEGER      REFERENCES chart_of_accounts(id),
  sort_order        INTEGER      DEFAULT 0,
  active            BOOLEAN      DEFAULT true,
  created_at        TIMESTAMP    DEFAULT NOW(),
  updated_at        TIMESTAMP    DEFAULT NOW(),
  CONSTRAINT l2_requires_parent CHECK (level = 1 OR parent_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_item_categories_type   ON item_categories(item_type);
CREATE INDEX IF NOT EXISTS idx_item_categories_parent ON item_categories(parent_id);

-- ── 2. Add category_id FK to item_master and expense_records ─────────────────
ALTER TABLE item_master    ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES item_categories(id);
ALTER TABLE expense_records ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES item_categories(id);

CREATE INDEX IF NOT EXISTS idx_item_master_category    ON item_master(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_records_category ON expense_records(category_id);

-- ── 3. Remove obsolete finance_account_mappings rows ─────────────────────────
DELETE FROM finance_account_mappings WHERE event_type IN ('PO_COMPLETED','EXPENSE_RECORDED');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Seed L1 Categories
-- ════════════════════════════════════════════════════════════════════════════

-- FIXED_ASSET L1
INSERT INTO item_categories (code, name, item_type, level, sort_order) VALUES
  ('FA_MEDICAL_EQUIP', 'Medical Equipment',        'FIXED_ASSET', 1, 10),
  ('FA_IT',            'IT Assets',                'FIXED_ASSET', 1, 20),
  ('FA_FURNITURE',     'Furniture & Fixtures',     'FIXED_ASSET', 1, 30),
  ('FA_VEHICLE',       'Vehicles',                 'FIXED_ASSET', 1, 40),
  ('FA_CIVIL',         'Civil & Infrastructure',   'FIXED_ASSET', 1, 50),
  ('FA_SOFTWARE',      'Software & Licences',      'FIXED_ASSET', 1, 60)
ON CONFLICT (code) DO NOTHING;

-- STOCK L1
INSERT INTO item_categories (code, name, item_type, level, sort_order) VALUES
  ('ST_CLINICAL', 'Clinical Consumables',    'STOCK', 1, 10),
  ('ST_DRUGS',    'Drugs & Pharmaceuticals', 'STOCK', 1, 20),
  ('ST_IMAGING',  'Imaging Media',           'STOCK', 1, 30),
  ('ST_OFFICE',   'Office & Stationery',     'STOCK', 1, 40),
  ('ST_SPARE',    'Spare Parts',             'STOCK', 1, 50)
ON CONFLICT (code) DO NOTHING;

-- EXPENSE L1
INSERT INTO item_categories (code, name, item_type, level, sort_order) VALUES
  ('EX_CLINICAL',       'Medical & Clinical',            'EXPENSE', 1, 10),
  ('EX_PROF_SVC',       'Professional Services',         'EXPENSE', 1, 20),
  ('EX_EQUIP_AMC',      'Equipment & AMC',               'EXPENSE', 1, 30),
  ('EX_FACILITY',       'Facility & Lease',              'EXPENSE', 1, 40),
  ('EX_UTILITIES',      'Utilities',                     'EXPENSE', 1, 50),
  ('EX_FACILITY_MGMT',  'Facility Management',           'EXPENSE', 1, 60),
  ('EX_ADMIN',          'Admin & Office',                'EXPENSE', 1, 70),
  ('EX_MARKETING',      'Marketing & Business Dev',      'EXPENSE', 1, 80),
  ('EX_PATIENT_ACQ',    'Patient Acquisition',           'EXPENSE', 1, 90),
  ('EX_IT',             'IT & Technology',               'EXPENSE', 1, 100),
  ('EX_PROFESSIONAL',   'Professional & Compliance',     'EXPENSE', 1, 110),
  ('EX_FINANCE_COST',   'Finance Costs',                 'EXPENSE', 1, 120),
  ('EX_PAYROLL',        'Payroll & HR',                  'EXPENSE', 1, 130),
  ('EX_MISC',           'Miscellaneous',                 'EXPENSE', 1, 140)
ON CONFLICT (code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Seed FIXED_ASSET L2 Categories
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO item_categories (code, name, item_type, level, parent_id, asset_gl_id, expense_gl_id, ap_account_id, sort_order)
SELECT v.code, v.name, 'FIXED_ASSET', 2,
  (SELECT id FROM item_categories WHERE code = v.parent_code),
  (SELECT id FROM chart_of_accounts WHERE account_code = v.asset_coa AND is_active = true),
  NULL,
  (SELECT id FROM chart_of_accounts WHERE account_code = v.ap_coa AND is_active = true),
  v.sort_order
FROM (VALUES
  ('FA_MRI',            'MRI Scanner',                       'FA_MEDICAL_EQUIP', '1210', '2112',  10),
  ('FA_CT',             'CT Scanner',                        'FA_MEDICAL_EQUIP', '1210', '2112',  20),
  ('FA_XRAY_MACHINE',   'X-Ray Machine',                     'FA_MEDICAL_EQUIP', '1210', '2112',  30),
  ('FA_ULTRASOUND',     'Ultrasound Machine',                'FA_MEDICAL_EQUIP', '1210', '2112',  40),
  ('FA_MAMMOGRAPHY',    'Mammography System',                'FA_MEDICAL_EQUIP', '1210', '2112',  50),
  ('FA_FLUORO',         'Fluoroscopy System',                'FA_MEDICAL_EQUIP', '1210', '2112',  60),
  ('FA_DEXA',           'DEXA / Bone Density',               'FA_MEDICAL_EQUIP', '1210', '2112',  70),
  ('FA_PETCT',          'PET-CT System',                     'FA_MEDICAL_EQUIP', '1210', '2112',  80),
  ('FA_OTHER_MED_EQUIP','Other Medical Equipment',           'FA_MEDICAL_EQUIP', '1210', '2112',  90),
  ('FA_COMPUTER',       'Computer / Workstation / Server',   'FA_IT',            '1220', '2112',  10),
  ('FA_PACS',           'PACS / RIS System',                 'FA_IT',            '1220', '2112',  20),
  ('FA_NETWORK',        'Network Equipment',                 'FA_IT',            '1220', '2112',  30),
  ('FA_PRINTER_SCAN',   'Printer / Scanner',                 'FA_IT',            '1220', '2112',  40),
  ('FA_UPS',            'UPS / Battery System',              'FA_IT',            '1220', '2112',  50),
  ('FA_OTHER_IT',       'Other IT Equipment',                'FA_IT',            '1220', '2112',  60),
  ('FA_OFFICE_FURN',    'Office Furniture',                  'FA_FURNITURE',     '1230', '2112',  10),
  ('FA_PATIENT_FURN',   'Patient Furniture / Trolleys',      'FA_FURNITURE',     '1230', '2112',  20),
  ('FA_CABINET',        'Cabinets & Shelving',               'FA_FURNITURE',     '1230', '2112',  30),
  ('FA_OTHER_FURN',     'Other Furniture & Fixtures',        'FA_FURNITURE',     '1230', '2112',  40),
  ('FA_CAR',            'Car',                               'FA_VEHICLE',       '1240', '2112',  10),
  ('FA_VAN',            'Van / Minibus',                     'FA_VEHICLE',       '1240', '2112',  20),
  ('FA_AMBULANCE',      'Ambulance',                         'FA_VEHICLE',       '1240', '2112',  30),
  ('FA_OTHER_VEH',      'Other Vehicle',                     'FA_VEHICLE',       '1240', '2112',  40),
  ('FA_RENOVATION',     'Renovation / Interior Works',       'FA_CIVIL',         '1250', '2112',  10),
  ('FA_ELECTRICAL',     'Electrical Fittings',               'FA_CIVIL',         '1250', '2112',  20),
  ('FA_PLUMBING',       'Plumbing & Sanitation',             'FA_CIVIL',         '1250', '2112',  30),
  ('FA_HVAC',           'AC / HVAC System',                  'FA_CIVIL',         '1250', '2112',  40),
  ('FA_OTHER_CIVIL',    'Other Civil Works',                 'FA_CIVIL',         '1250', '2112',  50),
  ('FA_ERP_SW',         'ERP / Business Software',           'FA_SOFTWARE',      '1310', '2112',  10),
  ('FA_PACS_SW',        'PACS / RIS Software',               'FA_SOFTWARE',      '1310', '2112',  20),
  ('FA_OTHER_SW',       'Other Software & Licences',         'FA_SOFTWARE',      '1310', '2112',  30)
) AS v(code, name, parent_code, asset_coa, ap_coa, sort_order)
ON CONFLICT (code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Seed STOCK L2 Categories
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO item_categories (code, name, item_type, level, parent_id, asset_gl_id, expense_gl_id, ap_account_id, sort_order)
SELECT v.code, v.name, 'STOCK', 2,
  (SELECT id FROM item_categories WHERE code = v.parent_code),
  (SELECT id FROM chart_of_accounts WHERE account_code = v.asset_coa AND is_active = true),
  (SELECT id FROM chart_of_accounts WHERE account_code = v.expense_coa AND is_active = true),
  (SELECT id FROM chart_of_accounts WHERE account_code = v.ap_coa AND is_active = true),
  v.sort_order
FROM (VALUES
  ('ST_CONTRAST',       'Contrast Media',           'ST_CLINICAL', '1152', '5111', '2111', 10),
  ('ST_SYRINGE',        'Syringes & Needles',        'ST_CLINICAL', '1151', '5112', '2111', 20),
  ('ST_CANNULA',        'IV Cannula',                'ST_CLINICAL', '1151', '5112', '2111', 30),
  ('ST_PPE',            'PPE & Disposables',         'ST_CLINICAL', '1151', '5112', '2111', 40),
  ('ST_US_GEL',         'Ultrasound Gel',            'ST_CLINICAL', '1151', '5115', '2111', 50),
  ('ST_OTHER_CLIN',     'Other Clinical Consumable', 'ST_CLINICAL', '1151', '5115', '2111', 60),
  ('ST_DRUG',           'Drugs / Injections',        'ST_DRUGS',    '1155', '5114', '2111', 10),
  ('ST_PHARMA',         'Pharmaceuticals',           'ST_DRUGS',    '1155', '5114', '2111', 20),
  ('ST_XRAY_FILM',      'X-Ray Film',                'ST_IMAGING',  '1153', '5113', '2111', 10),
  ('ST_CD_DVD',         'CD / DVD Media',            'ST_IMAGING',  '1153', '5113', '2111', 20),
  ('ST_REPORT_COVER',   'Report Cover / Folder',     'ST_IMAGING',  '1153', '5113', '2111', 30),
  ('ST_THERMAL_PAPER',  'Thermal Paper Roll',        'ST_IMAGING',  '1153', '5113', '2111', 40),
  ('ST_STATIONERY',     'Stationery',                'ST_OFFICE',   '1154', '5410', '2113', 10),
  ('ST_TONER',          'Toner & Ink Cartridge',     'ST_OFFICE',   '1154', '5730', '2112', 20),
  ('ST_OTHER_OFFICE',   'Other Office Supplies',     'ST_OFFICE',   '1154', '5410', '2113', 30),
  ('ST_EQUIP_SPARE',    'Equipment Spare Part',      'ST_SPARE',    '1151', '5132', '2112', 10),
  ('ST_ELEC_PART',      'Electrical Component',      'ST_SPARE',    '1151', '5360', '2113', 20),
  ('ST_OTHER_SPARE',    'Other Spare Part',          'ST_SPARE',    '1151', '5132', '2112', 30)
) AS v(code, name, parent_code, asset_coa, expense_coa, ap_coa, sort_order)
ON CONFLICT (code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Seed EXPENSE L2 Categories
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO item_categories (code, name, item_type, level, parent_id, asset_gl_id, expense_gl_id, ap_account_id, sort_order)
SELECT v.code, v.name, 'EXPENSE', 2,
  (SELECT id FROM item_categories WHERE code = v.parent_code),
  NULL,
  (SELECT id FROM chart_of_accounts WHERE account_code = v.expense_coa AND is_active = true),
  (SELECT id FROM chart_of_accounts WHERE account_code = v.ap_coa AND is_active = true),
  v.sort_order
FROM (VALUES
  ('EX_CONTRAST_MEDIA',   'Contrast Media',                          'EX_CLINICAL',     '5111', '2111',  10),
  ('EX_CONSUMABLES',      'Clinical Consumables',                    'EX_CLINICAL',     '5112', '2111',  20),
  ('EX_FILM_MEDIA',       'Film & Digital Media',                    'EX_CLINICAL',     '5113', '2111',  30),
  ('EX_DRUGS_PHARMA',     'Drugs & Pharmaceuticals',                 'EX_CLINICAL',     '5114', '2111',  40),
  ('EX_OTHER_CLINICAL',   'Other Clinical Materials',                'EX_CLINICAL',     '5115', '2111',  50),
  ('EX_RADIOLOGIST_FEES', 'Radiologist Reading Fees',                'EX_PROF_SVC',     '5121', '2113',  10),
  ('EX_CONSULTANT_FEES',  'Visiting Consultant Fees',                'EX_PROF_SVC',     '5122', '2113',  20),
  ('EX_TELERADIOLOGY',    'Tele-Radiology Service',                  'EX_PROF_SVC',     '5123', '2113',  30),
  ('EX_EQUIP_AMC',        'Equipment AMC & Service',                 'EX_EQUIP_AMC',    '5131', '2112',  10),
  ('EX_EQUIP_REPAIR',     'Equipment Repairs',                       'EX_EQUIP_AMC',    '5132', '2112',  20),
  ('EX_RAD_SAFETY',       'Radiation Safety & QA',                   'EX_EQUIP_AMC',    '5133', '2113',  30),
  ('EX_RENT',             'Rent & Lease',                            'EX_FACILITY',     '5310', '2113',  10),
  ('EX_REVENUE_SHARE',    'Revenue Share',                           'EX_FACILITY',     '5310', '2113',  20),
  ('EX_MIN_GUARANTEE',    'Minimum Guarantee',                       'EX_FACILITY',     '5310', '2113',  30),
  ('EX_EQUIP_LEASE',      'Equipment Lease',                         'EX_FACILITY',     '5310', '2112',  40),
  ('EX_ELECTRICITY',      'Electricity & Power',                     'EX_UTILITIES',    '5320', '2114',  10),
  ('EX_WATER',            'Water & Sanitation',                      'EX_UTILITIES',    '5330', '2114',  20),
  ('EX_GENERATOR',        'Generator & UPS',                         'EX_UTILITIES',    '5380', '2113',  30),
  ('EX_HOUSEKEEPING',     'Housekeeping & Cleaning',                 'EX_FACILITY_MGMT','5340', '2113',  10),
  ('EX_SECURITY',         'Security Services',                       'EX_FACILITY_MGMT','5350', '2113',  20),
  ('EX_FACILITY_MAINT',   'Facility Maintenance',                    'EX_FACILITY_MGMT','5360', '2113',  30),
  ('EX_WASTE_DISPOSAL',   'Medical Waste Disposal',                  'EX_FACILITY_MGMT','5370', '2113',  40),
  ('EX_STATIONERY',       'Stationery & Supplies',                   'EX_ADMIN',        '5410', '2113',  10),
  ('EX_PRINTING',         'Printing & Documentation',                'EX_ADMIN',        '5420', '2113',  20),
  ('EX_COURIER',          'Postage & Courier',                       'EX_ADMIN',        '5430', '2113',  30),
  ('EX_TELEPHONE',        'Telephone & Internet',                    'EX_ADMIN',        '5440', '2114',  40),
  ('EX_TRAVEL',           'Travel & Conveyance',                     'EX_ADMIN',        '5450', '2113',  50),
  ('EX_VEHICLE_FUEL',     'Vehicle Running & Fuel',                  'EX_ADMIN',        '5460', '2113',  60),
  ('EX_MEALS',            'Business Meals & Entertainment',          'EX_ADMIN',        '5470', '2113',  70),
  ('EX_ADVERTISING',      'Advertising & Digital Marketing',         'EX_MARKETING',    '5510', '2113',  10),
  ('EX_REFERRAL_FEES',    'Referral Fees & Commissions',             'EX_MARKETING',    '5520', '2113',  20),
  ('EX_PATIENT_RELATIONS','Patient Relations & Hospitality',         'EX_MARKETING',    '5530', '2113',  30),
  ('EX_BRANDING',         'Branding, Signage & Collateral',          'EX_MARKETING',    '5540', '2113',  40),
  ('EX_EVENTS',           'Exhibitions & Events',                    'EX_MARKETING',    '5550', '2113',  50),
  ('EX_PATIENT_AGENT',    'Patient Agent Commission',                'EX_PATIENT_ACQ',  '5520', '2113',  10),
  ('EX_DOCTOR_REFERRAL',  'Doctor Referral Fee',                     'EX_PATIENT_ACQ',  '5520', '2113',  20),
  ('EX_ERP_SW',           'ERP / Software Subscriptions',            'EX_IT',           '5710', '2112',  10),
  ('EX_PACS_MAINT',       'PACS / RIS Maintenance',                  'EX_IT',           '5720', '2112',  20),
  ('EX_IT_HW_MAINT',      'IT Hardware Maintenance',                 'EX_IT',           '5730', '2112',  30),
  ('EX_CYBERSECURITY',    'Cybersecurity & Data Backup',             'EX_IT',           '5740', '2112',  40),
  ('EX_IT_CONSUMABLES',   'IT Consumables & Accessories',            'EX_IT',           '5750', '2112',  50),
  ('EX_LEGAL',            'Legal Fees',                              'EX_PROFESSIONAL', '5610', '2113',  10),
  ('EX_AUDIT',            'Audit & Accounting Fees',                 'EX_PROFESSIONAL', '5620', '2113',  20),
  ('EX_REGULATORY',       'Regulatory & Licensing',                  'EX_PROFESSIONAL', '5630', '2113',  30),
  ('EX_COMPLIANCE',       'Radiation Safety & Compliance',           'EX_PROFESSIONAL', '5640', '2113',  40),
  ('EX_MEMBERSHIPS',      'Professional Memberships',                'EX_PROFESSIONAL', '5650', '2113',  50),
  ('EX_INSURANCE',        'Business Insurance Premiums',             'EX_PROFESSIONAL', '5660', '2113',  60),
  ('EX_BANK_CHARGES',     'Bank Charges & Transaction Fees',         'EX_FINANCE_COST', '5810', '2113',  10),
  ('EX_LOAN_INTEREST',    'Loan Interest - Term Loans',              'EX_FINANCE_COST', '5820', '2113',  20),
  ('EX_EQUIP_FIN_INT',    'Equipment Finance Interest',              'EX_FINANCE_COST', '5830', '2113',  30),
  ('EX_LATE_PENALTY',     'Late Payment Penalties',                  'EX_FINANCE_COST', '5840', '2113',  40),
  ('EX_SALARY',           'Salary Payment',                          'EX_PAYROLL',      '5210', '2131',  10),
  ('EX_PF_ESI',           'PF & ESI Contributions',                  'EX_PAYROLL',      '5240', '2132',  20),
  ('EX_STAFF_TRAINING',   'Staff Training & Development',            'EX_PAYROLL',      '5270', '2113',  30),
  ('EX_RECRUITMENT',      'Recruitment & Onboarding',                'EX_PAYROLL',      '5280', '2113',  40),
  ('EX_MISC_EXP',         'Miscellaneous Expense',                   'EX_MISC',         '5994', '2113',  10),
  ('EX_DONATIONS',        'Donations & CSR',                         'EX_MISC',         '5993', '2113',  20),
  ('EX_PRIOR_PERIOD',     'Prior Period Adjustments',                'EX_MISC',         '5995', '2113',  30)
) AS v(code, name, parent_code, expense_coa, ap_coa, sort_order)
ON CONFLICT (code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Backfill category_id on item_master from old l2 text codes
-- ════════════════════════════════════════════════════════════════════════════

UPDATE item_master im SET category_id = ic.id
FROM item_categories ic
WHERE im.category_id IS NULL
  AND ic.code = CASE im.category
  WHEN 'CONTRAST_MEDIA'    THEN 'ST_CONTRAST'
  WHEN 'SYRINGE_NEEDLE'    THEN 'ST_SYRINGE'
  WHEN 'CANNULA_IV'        THEN 'ST_CANNULA'
  WHEN 'PPE_DISPOSABLE'    THEN 'ST_PPE'
  WHEN 'XRAY_FILM'         THEN 'ST_XRAY_FILM'
  WHEN 'CD_DVD_MEDIA'      THEN 'ST_CD_DVD'
  WHEN 'REPORT_COVER'      THEN 'ST_REPORT_COVER'
  WHEN 'SPARE_PART'        THEN 'ST_EQUIP_SPARE'
  WHEN 'ELECTRICAL'        THEN 'ST_ELEC_PART'
  WHEN 'HOUSEKEEPING'      THEN 'EX_HOUSEKEEPING'
  WHEN 'STATIONERY'        THEN 'ST_STATIONERY'
  WHEN 'TONER_INK'         THEN 'ST_TONER'
  WHEN 'GENERAL'           THEN 'EX_MISC_EXP'
  WHEN 'RADIOLOGY_FEES'    THEN 'EX_RADIOLOGIST_FEES'
  WHEN 'TELERADIOLOGY'     THEN 'EX_TELERADIOLOGY'
  WHEN 'AMC_SERVICE'       THEN 'EX_EQUIP_AMC'
  WHEN 'SOFTWARE_SAAS'     THEN 'EX_ERP_SW'
  WHEN 'REVENUE_SHARE'     THEN 'EX_REVENUE_SHARE'
  WHEN 'MIN_GUARANTEE'     THEN 'EX_MIN_GUARANTEE'
  WHEN 'EQUIPMENT_LEASE'   THEN 'EX_EQUIP_LEASE'
  WHEN 'PATIENT_AGENT'     THEN 'EX_PATIENT_AGENT'
  WHEN 'DOCTOR_REFERRAL'   THEN 'EX_DOCTOR_REFERRAL'
  WHEN 'MRI_SCANNER'       THEN 'FA_MRI'
  WHEN 'CT_SCANNER'        THEN 'FA_CT'
  WHEN 'XRAY_MACHINE'      THEN 'FA_XRAY_MACHINE'
  WHEN 'ULTRASOUND'        THEN 'FA_ULTRASOUND'
  WHEN 'MAMMOGRAPHY'       THEN 'FA_MAMMOGRAPHY'
  WHEN 'FLUOROSCOPY'       THEN 'FA_FLUORO'
  WHEN 'DEXA'              THEN 'FA_DEXA'
  WHEN 'OTHER_MEDICAL'     THEN 'FA_OTHER_MED_EQUIP'
  WHEN 'COMPUTER_SERVER'   THEN 'FA_COMPUTER'
  WHEN 'PACS_SYSTEM'       THEN 'FA_PACS'
  WHEN 'NETWORK_EQUIPMENT' THEN 'FA_NETWORK'
  WHEN 'PRINTER_SCANNER'   THEN 'FA_PRINTER_SCAN'
  WHEN 'UPS_BATTERY'       THEN 'FA_UPS'
  WHEN 'OTHER_IT'          THEN 'FA_OTHER_IT'
  WHEN 'OFFICE_FURNITURE'  THEN 'FA_OFFICE_FURN'
  WHEN 'PATIENT_FURNITURE' THEN 'FA_PATIENT_FURN'
  WHEN 'CABINETS_SHELVING' THEN 'FA_CABINET'
  WHEN 'OTHER_FURNITURE'   THEN 'FA_OTHER_FURN'
  WHEN 'CAR'               THEN 'FA_CAR'
  WHEN 'VAN'               THEN 'FA_VAN'
  WHEN 'AMBULANCE'         THEN 'FA_AMBULANCE'
  WHEN 'OTHER_VEHICLE'     THEN 'FA_OTHER_VEH'
  WHEN 'RENOVATION'        THEN 'FA_RENOVATION'
  WHEN 'ELECTRICAL_FITTING'THEN 'FA_ELECTRICAL'
  WHEN 'PLUMBING'          THEN 'FA_PLUMBING'
  WHEN 'AC_HVAC'           THEN 'FA_HVAC'
  WHEN 'OTHER_CIVIL'       THEN 'FA_OTHER_CIVIL'
  ELSE NULL
END;
