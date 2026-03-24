-- Migration 094: Modalities master table
-- Replaces the hardcoded modality list in centers.js and frontend with a DB-managed table.
-- center_modalities.modality continues to store the code (no FK to avoid cascade issues).

CREATE TABLE IF NOT EXISTS modalities (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modalities_active ON modalities(active);
CREATE INDEX IF NOT EXISTS idx_modalities_code   ON modalities(code);

INSERT INTO modalities (code, name, description) VALUES
  ('MRI',           'Magnetic Resonance Imaging',          'High-resolution soft-tissue imaging using magnetic fields and radio waves'),
  ('CT',            'Computed Tomography',                  'Cross-sectional X-ray imaging; also known as CT scan'),
  ('XRAY',          'X-Ray',                               'Conventional radiography for bones and chest imaging'),
  ('ULTRASOUND',    'Ultrasound',                          'Real-time soft-tissue imaging using high-frequency sound waves'),
  ('MAMMOGRAPHY',   'Mammography',                         'Dedicated breast imaging using low-dose X-rays'),
  ('PET',           'PET / Nuclear Medicine',              'Positron emission tomography; whole-body metabolic imaging'),
  ('SPECT',         'SPECT',                               'Single photon emission computed tomography'),
  ('FLUOROSCOPY',   'Fluoroscopy',                         'Real-time continuous X-ray imaging for dynamic studies'),
  ('ANGIOGRAPHY',   'Angiography',                         'X-ray imaging of blood vessels using contrast dye'),
  ('INTERVENTIONAL','Interventional Radiology',            'Image-guided minimally invasive procedures'),
  ('DEXA',          'DEXA / Bone Densitometry',            'Dual-energy X-ray for bone mineral density measurement'),
  ('GENERAL',       'General / Other',                     'Non-imaging or unlisted diagnostic modality')
ON CONFLICT (code) DO NOTHING;
