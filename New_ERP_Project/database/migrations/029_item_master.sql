-- Migration 029: Item Master
-- Unified item master replacing the unstructured expense_items_master.
-- Two item types:
--   STOCK     → Inventory items; quantity tracked; feeds consumption register
--   NON_STOCK → Expense items; directly posted to GL; no stock tracking
--
-- STOCK categories    : CONTRAST_MEDIA, FILM_MEDIA, MEDICAL_CONSUMABLE, DRUG, STATIONERY, SPARE_PART
-- NON_STOCK categories: GENERAL, HOUSEKEEPING, ADMINISTRATIVE, PRINTING

CREATE TABLE IF NOT EXISTS item_master (
  id              SERIAL PRIMARY KEY,
  item_code       VARCHAR(20)    NOT NULL UNIQUE,
  item_name       VARCHAR(200)   NOT NULL,
  item_type       VARCHAR(10)    NOT NULL CHECK (item_type IN ('STOCK', 'NON_STOCK')),
  category        VARCHAR(30)    NOT NULL,
  uom             VARCHAR(20)    NOT NULL DEFAULT 'PCS',
  hsn_sac_code    VARCHAR(10),
  gst_rate        DECIMAL(5,2)   NOT NULL DEFAULT 0,
  standard_rate   DECIMAL(12,2)  NOT NULL DEFAULT 0,
  -- Stock control (meaningful only for STOCK items)
  reorder_level   DECIMAL(10,2)  NOT NULL DEFAULT 0,
  minimum_stock   DECIMAL(10,2)  NOT NULL DEFAULT 0,
  description     TEXT,
  active          BOOLEAN        NOT NULL DEFAULT true,
  created_at      TIMESTAMP      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_master_type_cat ON item_master (item_type, category);
CREATE INDEX IF NOT EXISTS idx_item_master_active   ON item_master (active);

-- ── Sample data ────────────────────────────────────────────────────────────────

-- STOCK — Contrast Media
INSERT INTO item_master (item_code, item_name, item_type, category, uom, hsn_sac_code, gst_rate, standard_rate, reorder_level, minimum_stock, description) VALUES
('ITM-CM-001', 'Omnipaque 350 (100ml)',     'STOCK', 'CONTRAST_MEDIA',    'BOTTLE', '30059099', 12, 1200, 20, 10, 'Iohexol contrast agent for CT'),
('ITM-CM-002', 'Gadovist 1.0 (15ml)',       'STOCK', 'CONTRAST_MEDIA',    'VIAL',   '30059099', 12, 3500, 10,  5, 'Gadobutrol for MRI contrast'),
('ITM-CM-003', 'Omnipaque 240 (50ml)',      'STOCK', 'CONTRAST_MEDIA',    'BOTTLE', '30059099', 12,  750, 15,  8, 'Iohexol for fluoroscopy'),

-- STOCK — Film & Media
('ITM-FM-001', 'Dry Film 35x43cm (100 Sheets)', 'STOCK', 'FILM_MEDIA',    'BOX',    '37024290',  0, 2800, 10,  5, 'Dry laser film for CR/DR'),
('ITM-FM-002', 'Thermal Paper Roll A4',         'STOCK', 'FILM_MEDIA',    'ROLL',   '48023090',  5,  180, 20, 10, 'Thermal paper for USG reports'),
('ITM-FM-003', 'Blank CD (Pack of 50)',          'STOCK', 'FILM_MEDIA',    'PACK',   '85234990', 18,  350, 10,  5, 'CD for patient image delivery'),

-- STOCK — Medical Consumables
('ITM-MC-001', 'IV Cannula 18G',            'STOCK', 'MEDICAL_CONSUMABLE','PCS',    '90183100', 12,   12, 100, 50, 'IV cannula for contrast injection'),
('ITM-MC-002', 'Disposable Syringe 20ml',   'STOCK', 'MEDICAL_CONSUMABLE','PCS',    '90183100', 12,    8, 200,100, 'Luer lock syringe'),
('ITM-MC-003', 'Sterile Gloves (M)',        'STOCK', 'MEDICAL_CONSUMABLE','PAIR',   '40151100', 12,   35,  50, 20, 'Sterile latex gloves medium'),
('ITM-MC-004', 'Surgical Mask (Box/50)',    'STOCK', 'MEDICAL_CONSUMABLE','BOX',    '63079090',  5,  120,  20, 10, 'Disposable 3-ply surgical mask'),
('ITM-MC-005', 'Ultrasound Gel (1 Litre)',  'STOCK', 'MEDICAL_CONSUMABLE','BOTTLE', '30039099', 12,  180,  10,  5, 'Coupling gel for USG'),

-- STOCK — Drugs
('ITM-DR-001', 'Normal Saline 500ml',       'STOCK', 'DRUG',              'BOTTLE', '30049099', 12,   45,  50, 20, 'IV saline flush'),
('ITM-DR-002', 'Injection Hydrocortisone 100mg', 'STOCK', 'DRUG',         'VIAL',   '30049099', 12,  180,  20, 10, 'For contrast reaction management'),

-- STOCK — Stationery
('ITM-ST-001', 'A4 Paper (500 Sheets)',     'STOCK', 'STATIONERY',        'REAM',   '48023090',  5,  250,  20, 10, 'Office paper'),
('ITM-ST-002', 'Patient Report Folder',     'STOCK', 'STATIONERY',        'PCS',    '48195090', 18,   12,  50, 25, 'Cardboard report folder'),

-- STOCK — Spare Parts
('ITM-SP-001', 'X-Ray Tube Cooling Fan',    'STOCK', 'SPARE_PART',        'PCS',    '84145990', 18, 4500,   2,  1, 'Cooling fan for X-ray tube housing'),
('ITM-SP-002', 'Printer Toner Cartridge',   'STOCK', 'SPARE_PART',        'PCS',    '84439940', 18, 3200,   2,  1, 'Laser printer toner'),

-- NON_STOCK — General
('ITM-GE-001', 'Housekeeping Charges',      'NON_STOCK', 'HOUSEKEEPING',  'PCS',    '99850000', 18,    0,   0,  0, 'Daily housekeeping service'),
('ITM-GE-002', 'Drinking Water (20L Can)',  'NON_STOCK', 'GENERAL',       'PCS',    '22011010',  0,   45,   0,  0, 'Staff drinking water'),
('ITM-GE-003', 'Newspaper / Magazines',     'NON_STOCK', 'GENERAL',       'PCS',    '49019900',  5,   30,   0,  0, 'Waiting area reading material'),

-- NON_STOCK — Administrative
('ITM-AD-001', 'Courier / Speed Post',      'NON_STOCK', 'ADMINISTRATIVE','PCS',    '99830000', 18,    0,   0,  0, 'Document dispatch charges'),
('ITM-AD-002', 'Postage Stamps',            'NON_STOCK', 'ADMINISTRATIVE','PCS',    '49070000',  0,    0,   0,  0, 'Postal charges'),

-- NON_STOCK — Printing
('ITM-PR-001', 'Visiting Card Printing',    'NON_STOCK', 'PRINTING',      'PCS',    '49119100', 18,    0,   0,  0, 'Business card printing'),
('ITM-PR-002', 'Letterhead Printing',       'NON_STOCK', 'PRINTING',      'REAM',   '49119100', 18,    0,   0,  0, 'Official letterhead')

ON CONFLICT (item_code) DO NOTHING;
