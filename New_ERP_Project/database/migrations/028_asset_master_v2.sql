-- Migration 028: Asset Master v2
-- Establishes the 6 user-facing asset categories, adds condition/salvage columns,
-- creates the depreciation settings table, and builds the asset_register_view.

-- ─── 1. Upsert the 6 required categories into asset_types ─────────────────────
INSERT INTO asset_types (type_code, name, description, depreciation_method, useful_life_years) VALUES
  ('MODALITY',    'Modality',     'Radiology scan equipment (MRI, CT, X-Ray, etc.)', 'STRAIGHT_LINE', 10),
  ('EQUIPMENT',   'Equipment',    'Clinical and medical equipment',                   'STRAIGHT_LINE', 10),
  ('SOFTWARE',    'Software',     'Software licenses and applications',               'STRAIGHT_LINE',  5),
  ('FURNITURE',   'Furniture',    'Office and clinical furniture',                    'STRAIGHT_LINE',  5),
  ('APPLIANCE',   'Appliance',    'Electrical appliances',                            'STRAIGHT_LINE',  5),
  ('ELECTRONICS', 'Electronics',  'Electronic devices and accessories',               'STRAIGHT_LINE',  5)
ON CONFLICT (type_code) DO UPDATE
  SET name              = EXCLUDED.name,
      description       = EXCLUDED.description,
      useful_life_years = EXCLUDED.useful_life_years,
      depreciation_method = EXCLUDED.depreciation_method;

-- ─── 2. Extend asset_master ───────────────────────────────────────────────────
ALTER TABLE asset_master
  ADD COLUMN IF NOT EXISTS condition      VARCHAR(15)   DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS salvage_value  DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes          TEXT;

-- Relax status constraint to allow new values
ALTER TABLE asset_master DROP CONSTRAINT IF EXISTS asset_master_status_check;
ALTER TABLE asset_master
  ADD CONSTRAINT asset_master_status_check
  CHECK (status IN ('ACTIVE','UNDER_MAINTENANCE','DISPOSED','INACTIVE'));

-- ─── 3. Depreciation settings table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_depreciation_settings (
  id                SERIAL PRIMARY KEY,
  category_code     VARCHAR(20) NOT NULL UNIQUE REFERENCES asset_types(type_code),
  useful_life_years INTEGER     NOT NULL DEFAULT 5,
  updated_at        TIMESTAMP   DEFAULT NOW()
);

INSERT INTO asset_depreciation_settings (category_code, useful_life_years) VALUES
  ('MODALITY',    10),
  ('EQUIPMENT',   10),
  ('SOFTWARE',     5),
  ('FURNITURE',    5),
  ('APPLIANCE',    5),
  ('ELECTRONICS',  5)
ON CONFLICT (category_code) DO NOTHING;

-- ─── 4. Asset register view with computed depreciation ───────────────────────
CREATE OR REPLACE VIEW asset_register_view AS
SELECT
  am.id,
  am.asset_code,
  am.asset_name,
  am.asset_type                                           AS category_code,
  at.name                                                 AS category_name,
  am.center_id,
  c.name                                                  AS center_name,
  am.manufacturer,
  am.model,
  am.serial_number,
  COALESCE(am.condition, 'NEW')                           AS condition,
  am.purchase_date                                        AS acquisition_date,
  am.purchase_cost                                        AS acquisition_value,
  COALESCE(am.salvage_value, 0)                           AS salvage_value,
  am.status,
  am.notes,
  am.active,
  -- Effective useful life from settings (overrides asset_types)
  COALESCE(ads.useful_life_years, at.useful_life_years, 5) AS useful_life_years,
  -- Annual depreciation (straight-line)
  CASE
    WHEN COALESCE(ads.useful_life_years, at.useful_life_years, 5) > 0
    THEN ROUND(
           (am.purchase_cost - COALESCE(am.salvage_value, 0))
           / COALESCE(ads.useful_life_years, at.useful_life_years, 5),
           2
         )
    ELSE 0
  END                                                     AS annual_depreciation,
  -- Full years elapsed (integer, capped at useful life)
  LEAST(
    DATE_PART('year', AGE(CURRENT_DATE, am.purchase_date))::INTEGER,
    COALESCE(ads.useful_life_years, at.useful_life_years, 5)
  )                                                       AS years_elapsed,
  -- Book value
  GREATEST(
    COALESCE(am.salvage_value, 0),
    am.purchase_cost - (
      CASE
        WHEN COALESCE(ads.useful_life_years, at.useful_life_years, 5) > 0
        THEN ROUND(
               (am.purchase_cost - COALESCE(am.salvage_value, 0))
               / COALESCE(ads.useful_life_years, at.useful_life_years, 5),
               2
             )
        ELSE 0
      END
      * LEAST(
          DATE_PART('year', AGE(CURRENT_DATE, am.purchase_date))::INTEGER,
          COALESCE(ads.useful_life_years, at.useful_life_years, 5)
        )
    )
  )                                                       AS book_value
FROM asset_master am
LEFT JOIN asset_types                  at  ON am.asset_type  = at.type_code
LEFT JOIN centers                       c  ON am.center_id   = c.id
LEFT JOIN asset_depreciation_settings  ads ON am.asset_type  = ads.category_code
WHERE am.active = true
  AND am.asset_type IN ('MODALITY','EQUIPMENT','SOFTWARE','FURNITURE','APPLIANCE','ELECTRONICS');

-- ─── 5. Sample assets (2 per category, spread across centers) ────────────────
DO $$
DECLARE v_center1 INTEGER; v_center2 INTEGER;
BEGIN
  SELECT id INTO v_center1 FROM centers WHERE active=true ORDER BY id LIMIT 1;
  SELECT id INTO v_center2 FROM centers WHERE active=true ORDER BY id OFFSET 1 LIMIT 1;
  IF v_center1 IS NULL THEN v_center1 := 1; END IF;
  IF v_center2 IS NULL THEN v_center2 := v_center1; END IF;

  INSERT INTO asset_master (asset_code, asset_name, asset_type, asset_category, manufacturer, model, serial_number,
    center_id, purchase_date, purchase_cost, salvage_value, current_value, depreciation_rate,
    condition, status, active, notes, location)
  VALUES
    -- Modalities
    ('MODALITY-001','MRI Machine 1.5T',        'MODALITY','TANGIBLE','Siemens Healthineers','Magnetom Sola','SN-MRI-001', v_center1,'2021-01-15',15000000,500000,12500000,0.10,'NEW',          'ACTIVE',true,'3T capable','Scan Room 1'),
    ('MODALITY-002','CT Scanner 64-Slice',     'MODALITY','TANGIBLE','GE Healthcare','Revolution EVO','SN-CT-001',  v_center2,'2022-03-10', 8500000,250000, 7650000,0.10,'NEW',          'ACTIVE',true,'64-slice',   'Scan Room 2'),
    -- Equipment
    ('EQUIPMENT-001','Patient Monitor',        'EQUIPMENT','TANGIBLE','Philips','IntelliVue MX700','SN-PM-001', v_center1,'2022-06-01',  180000,  5000,  162000,0.10,'NEW',          'ACTIVE',true,NULL,         'Ward A'),
    ('EQUIPMENT-002','Anaesthesia Workstation','EQUIPMENT','TANGIBLE','Draeger','Perseus A500','SN-AW-001',     v_center2,'2023-02-15',  450000, 20000,  427500,0.10,'NEW',          'ACTIVE',true,NULL,         'OT'),
    -- Software
    ('SOFTWARE-001', 'RIS/PACS System',        'SOFTWARE','INTANGIBLE','Sectra','IDS7','LIC-RIS-001',           v_center1,'2022-01-01',  600000,      0,  480000,0.20,'NEW',          'ACTIVE',true,'100 users',  'Cloud'),
    ('SOFTWARE-002', 'HIS Module',             'SOFTWARE','INTANGIBLE','Carestream','Vue PACS','LIC-HIS-001',   v_center2,'2023-01-01',  350000,      0,  280000,0.20,'NEW',          'ACTIVE',true,'50 users',   'On-premise'),
    -- Furniture
    ('FURNITURE-001','Reception Desk Set',     'FURNITURE','TANGIBLE','Godrej','Interio Series','SN-FN-001',    v_center1,'2023-04-01',   85000,  5000,   80000,0.20,'NEW',          'ACTIVE',true,NULL,         'Reception'),
    ('FURNITURE-002','Waiting Area Chairs x20','FURNITURE','TANGIBLE','Featherlite','Optima','SN-CH-001',       v_center2,'2022-09-01',   60000,  3000,   48000,0.20,'NEW',          'ACTIVE',true,'Set of 20',  'Waiting Area'),
    -- Appliances
    ('APPLIANCE-001','Split AC 2 Ton',         'APPLIANCE','TANGIBLE','Daikin','FTKF60TV','SN-AC-001',          v_center1,'2021-05-01',   65000,  2000,   37000,0.20,'NEW',          'ACTIVE',true,'5 star',     'Scan Room 1'),
    ('APPLIANCE-002','UPS 10KVA',              'APPLIANCE','TANGIBLE','APC','Smart-UPS SRT','SN-UPS-001',       v_center2,'2022-11-15',  120000,  5000,  108000,0.20,'NEW',          'ACTIVE',true,'Online UPS', 'Server Room'),
    -- Electronics
    ('ELECTRONICS-001','Workstation PC',       'ELECTRONICS','TANGIBLE','Dell','Precision 3660','SN-WS-001',    v_center1,'2023-01-10',   95000,  5000,   76000,0.20,'NEW',          'ACTIVE',true,'32GB RAM',   'Reporting Room'),
    ('ELECTRONICS-002','LED Monitor 27"',      'ELECTRONICS','TANGIBLE','LG','27UK850','SN-MON-001',            v_center2,'2023-03-20',   28000,  2000,   22400,0.20,'REFURBISHED',  'ACTIVE',true,NULL,         'Reporting Room')
  ON CONFLICT (asset_code) DO NOTHING;
END $$;
