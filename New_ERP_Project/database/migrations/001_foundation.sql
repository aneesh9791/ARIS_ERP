-- Migration 001: Foundation - Extensions, Centers, Users
-- Source: (created from scratch - base schema derived from all subsequent migrations)

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- updated_at trigger function (shared by all tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Centers table (master location/branch table)
CREATE TABLE IF NOT EXISTS centers (
    id                  SERIAL PRIMARY KEY,
    uuid                UUID DEFAULT uuid_generate_v4() UNIQUE,
    name                VARCHAR(255) NOT NULL,
    code                VARCHAR(50) UNIQUE NOT NULL,
    address             TEXT,
    city                VARCHAR(100),
    state               VARCHAR(100),
    postal_code         VARCHAR(20),
    country             VARCHAR(100) DEFAULT 'India',
    phone               VARCHAR(20),
    email               VARCHAR(255),
    manager_name        VARCHAR(255),
    manager_email       VARCHAR(255),
    manager_phone       VARCHAR(20),
    operating_hours     TEXT,
    emergency_contact   VARCHAR(20),
    capacity_daily      INTEGER,
    specialties         TEXT[],
    insurance_providers TEXT[],
    gst_number          VARCHAR(50),
    pan_number          VARCHAR(50),
    license_number      VARCHAR(100),
    established_year    INTEGER,
    logo_path           TEXT,
    is_active           BOOLEAN DEFAULT true,
    active              BOOLEAN DEFAULT true,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_centers_updated_at
    BEFORE UPDATE ON centers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Users table (authentication and staff)
CREATE TABLE IF NOT EXISTS users (
    id                      SERIAL PRIMARY KEY,
    uuid                    UUID DEFAULT uuid_generate_v4() UNIQUE,
    username                VARCHAR(50) UNIQUE,
    email                   VARCHAR(255) UNIQUE NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,
    name                    VARCHAR(100),
    first_name              VARCHAR(100),
    last_name               VARCHAR(100),
    phone                   VARCHAR(20),
    role                    VARCHAR(50) DEFAULT 'staff' CHECK (role IN ('admin', 'doctor', 'staff', 'accountant', 'center_manager', 'radiologist', 'receptionist', 'technician')),
    center_id               INTEGER REFERENCES centers(id) ON DELETE SET NULL,
    is_active               BOOLEAN DEFAULT true,
    active                  BOOLEAN DEFAULT true,
    last_login              TIMESTAMP,
    failed_login_attempts   INTEGER DEFAULT 0,
    locked_until            TIMESTAMP,
    password_changed        TIMESTAMP,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_centers_code   ON centers(code);
CREATE INDEX IF NOT EXISTS idx_centers_active  ON centers(is_active);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_center_id ON users(center_id);
CREATE INDEX IF NOT EXISTS idx_users_active    ON users(is_active);

-- Seed data: primary diagnostic center
INSERT INTO centers (id, name, code, city, state, country, phone, email)
VALUES (1, 'ARIS Diagnostic Center - Kozhikode', 'DLK001', 'Kozhikode', 'Kerala', 'India', '+914952720000', 'info@aris.com')
ON CONFLICT (code) DO NOTHING;

-- Seed admin user (password: Admin@123 — change on first login)
INSERT INTO users (email, password_hash, name, first_name, last_name, role, center_id)
VALUES (
    'admin@aris.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO9G',
    'System Administrator',
    'System',
    'Administrator',
    'admin',
    1
)
ON CONFLICT (email) DO NOTHING;
