-- Migration 006: Enhanced Centers - Additional Columns and Modalities
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/database/centers-enhanced-schema.sql
-- Fix applied: Skipped INSERT statements for centers 'CTR2','CTR3','CTR4','CTR5' because
--   centers.id is INTEGER SERIAL — string IDs would fail type checking.
--   Also skipped corresponding center_modalities INSERTs that referenced those string IDs.
-- Fix applied: RETURNS TABLE id column changed from VARCHAR(36) to INTEGER to match centers.id (SERIAL).

-- Add extra columns to centers (already partially covered by 001_foundation)
ALTER TABLE centers ADD COLUMN IF NOT EXISTS gst_number       VARCHAR(15);
ALTER TABLE centers ADD COLUMN IF NOT EXISTS pan_number       VARCHAR(10);
ALTER TABLE centers ADD COLUMN IF NOT EXISTS license_number   VARCHAR(50);
ALTER TABLE centers ADD COLUMN IF NOT EXISTS established_year INTEGER;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS logo_path        VARCHAR(500);

-- CENTER MODALITIES TABLE
CREATE TABLE IF NOT EXISTS center_modalities (
    id             SERIAL PRIMARY KEY,
    center_id      INTEGER REFERENCES centers(id),
    modality       VARCHAR(50) NOT NULL,
    description    TEXT,
    equipment_count INTEGER DEFAULT 0,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active         BOOLEAN DEFAULT true,
    UNIQUE(center_id, modality)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_center_modalities_center_id ON center_modalities(center_id);
CREATE INDEX IF NOT EXISTS idx_center_modalities_modality   ON center_modalities(modality);
CREATE INDEX IF NOT EXISTS idx_centers_city_state           ON centers(city, state);
CREATE INDEX IF NOT EXISTS idx_centers_active_enh           ON centers(active);
CREATE INDEX IF NOT EXISTS idx_center_modalities_active     ON center_modalities(active);

-- Update primary center (id=1) with GST/PAN/license info
UPDATE centers SET
    gst_number       = '29AAACM1234C1ZV',
    pan_number       = 'AAACM1234C',
    license_number   = 'DLK2024001',
    established_year = 2010
WHERE id = 1;

-- Modalities for center 1
INSERT INTO center_modalities (center_id, modality, description, equipment_count) VALUES
(1, 'MRI',         'Magnetic Resonance Imaging - 1.5T and 3T scanners', 2),
(1, 'CT',          'Computed Tomography - 64-slice and 128-slice scanners', 2),
(1, 'XRAY',        'Digital X-Ray and Fluoroscopy', 3),
(1, 'ULTRASOUND',  'Advanced Ultrasound Imaging', 4),
(1, 'MAMMOGRAPHY', 'Digital Mammography', 1)
ON CONFLICT (center_id, modality) DO NOTHING;

-- Functions (fix: RETURNS TABLE id type changed to INTEGER)
CREATE OR REPLACE FUNCTION get_center_with_modalities(p_center_id INTEGER)
RETURNS TABLE (
    id               INTEGER,
    name             VARCHAR(255),
    code             VARCHAR(50),
    address          TEXT,
    city             VARCHAR(100),
    state            VARCHAR(100),
    postal_code      VARCHAR(20),
    country          VARCHAR(100),
    phone            VARCHAR(20),
    email            VARCHAR(255),
    manager_name     VARCHAR(255),
    manager_email    VARCHAR(255),
    manager_phone    VARCHAR(20),
    operating_hours  TEXT,
    emergency_contact VARCHAR(20),
    capacity_daily   INTEGER,
    specialties      TEXT[],
    insurance_providers TEXT[],
    gst_number       VARCHAR(15),
    pan_number       VARCHAR(10),
    license_number   VARCHAR(50),
    established_year INTEGER,
    logo_path        VARCHAR(500),
    created_at       TIMESTAMP,
    updated_at       TIMESTAMP,
    modalities       TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id, c.name, c.code, c.address, c.city, c.state, c.postal_code, c.country,
        c.phone, c.email, c.manager_name, c.manager_email, c.manager_phone, c.operating_hours,
        c.emergency_contact, c.capacity_daily, c.specialties, c.insurance_providers,
        c.gst_number, c.pan_number, c.license_number, c.established_year, c.logo_path,
        c.created_at, c.updated_at,
        STRING_AGG(cm.modality, ', ' ORDER BY cm.modality) AS modalities
    FROM centers c
    LEFT JOIN center_modalities cm ON c.id = cm.center_id AND cm.active = true
    WHERE c.id = p_center_id AND c.active = true
    GROUP BY c.id, c.name, c.code, c.address, c.city, c.state, c.postal_code, c.country,
             c.phone, c.email, c.manager_name, c.manager_email, c.manager_phone, c.operating_hours,
             c.emergency_contact, c.capacity_daily, c.specialties, c.insurance_providers,
             c.gst_number, c.pan_number, c.license_number, c.established_year, c.logo_path,
             c.created_at, c.updated_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_all_centers_with_modalities()
RETURNS TABLE (
    id               INTEGER,
    name             VARCHAR(255),
    code             VARCHAR(50),
    address          TEXT,
    city             VARCHAR(100),
    state            VARCHAR(100),
    postal_code      VARCHAR(20),
    country          VARCHAR(100),
    phone            VARCHAR(20),
    email            VARCHAR(255),
    manager_name     VARCHAR(255),
    manager_email    VARCHAR(255),
    manager_phone    VARCHAR(20),
    operating_hours  TEXT,
    emergency_contact VARCHAR(20),
    capacity_daily   INTEGER,
    specialties      TEXT[],
    insurance_providers TEXT[],
    gst_number       VARCHAR(15),
    pan_number       VARCHAR(10),
    license_number   VARCHAR(50),
    established_year INTEGER,
    logo_path        VARCHAR(500),
    created_at       TIMESTAMP,
    updated_at       TIMESTAMP,
    modalities       TEXT,
    patient_count    BIGINT,
    scanner_count    BIGINT,
    staff_count      BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id, c.name, c.code, c.address, c.city, c.state, c.postal_code, c.country,
        c.phone, c.email, c.manager_name, c.manager_email, c.manager_phone, c.operating_hours,
        c.emergency_contact, c.capacity_daily, c.specialties, c.insurance_providers,
        c.gst_number, c.pan_number, c.license_number, c.established_year, c.logo_path,
        c.created_at, c.updated_at,
        STRING_AGG(cm.modality, ', ' ORDER BY cm.modality) AS modalities,
        COUNT(DISTINCT p.id)    AS patient_count,
        COUNT(DISTINCT am.id)   AS scanner_count,
        COUNT(DISTINCT staff.id) AS staff_count
    FROM centers c
    LEFT JOIN center_modalities cm ON c.id = cm.center_id AND cm.active = true
    LEFT JOIN patients p           ON c.id = p.center_id AND p.active = true
    LEFT JOIN asset_master am      ON c.id = am.center_id AND am.active = true
    LEFT JOIN users staff          ON c.id = staff.center_id AND staff.active = true
    WHERE c.active = true
    GROUP BY c.id, c.name, c.code, c.address, c.city, c.state, c.postal_code, c.country,
             c.phone, c.email, c.manager_name, c.manager_email, c.manager_phone, c.operating_hours,
             c.emergency_contact, c.capacity_daily, c.specialties, c.insurance_providers,
             c.gst_number, c.pan_number, c.license_number, c.established_year, c.logo_path,
             c.created_at, c.updated_at
    ORDER BY c.name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_center_modalities_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE center_modalities
    SET active = false, updated_at = NOW()
    WHERE center_id = OLD.id AND active = true;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_center_modalities_on_delete ON centers;
CREATE TRIGGER trigger_update_center_modalities_on_delete
    BEFORE UPDATE ON centers
    FOR EACH ROW
    WHEN (OLD.active = true AND NEW.active = false)
    EXECUTE FUNCTION update_center_modalities_on_delete();
