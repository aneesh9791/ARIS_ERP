-- Migration 033: Company information and directors

CREATE TABLE IF NOT EXISTS company_info (
  id                  SERIAL PRIMARY KEY,
  company_name        VARCHAR(200)  NOT NULL DEFAULT 'ARIS Healthcare',
  tagline             VARCHAR(300),
  address_line1       VARCHAR(300),
  address_line2       VARCHAR(300),
  city                VARCHAR(100),
  state               VARCHAR(100),
  pincode             VARCHAR(10),
  country             VARCHAR(100)  DEFAULT 'India',
  phone               VARCHAR(20),
  alternate_phone     VARCHAR(20),
  email               VARCHAR(150),
  website             VARCHAR(200),
  pan_number          VARCHAR(10),
  gstin               VARCHAR(15),
  cin                 VARCHAR(21),
  tan                 VARCHAR(10),
  msme_number         VARCHAR(50),
  incorporation_date  DATE,
  logo_path           VARCHAR(500),
  bill_header_text    TEXT,
  bill_footer_text    TEXT,
  terms_and_conditions TEXT,
  created_at          TIMESTAMPTZ   DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_directors (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER REFERENCES company_info(id) ON DELETE CASCADE,
  director_name VARCHAR(200) NOT NULL,
  designation  VARCHAR(200),
  din          VARCHAR(8),
  email        VARCHAR(150),
  phone        VARCHAR(20),
  sort_order   INTEGER DEFAULT 0,
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed one default row so GET always returns a record
INSERT INTO company_info (company_name, country)
VALUES ('ARIS Healthcare', 'India')
ON CONFLICT DO NOTHING;
