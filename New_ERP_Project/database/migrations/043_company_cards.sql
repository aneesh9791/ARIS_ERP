-- Migration 043: Company Payment Cards
-- Stores corporate credit/debit cards for payment tracking
-- (Bank accounts already exist in bank_accounts table from migration 003)

CREATE TABLE IF NOT EXISTS company_cards (
  id              SERIAL PRIMARY KEY,
  card_name       VARCHAR(100)  NOT NULL,           -- e.g. "HDFC Corporate Platinum"
  last_four       CHAR(4)       NOT NULL,           -- last 4 digits only
  card_type       VARCHAR(10)   NOT NULL DEFAULT 'CREDIT'
                    CHECK (card_type IN ('CREDIT','DEBIT','PREPAID')),
  network         VARCHAR(20)   DEFAULT 'VISA'
                    CHECK (network IN ('VISA','MASTERCARD','RUPAY','AMEX','DINERS','OTHER')),
  bank_name       VARCHAR(100)  NOT NULL,
  expiry_month    SMALLINT      NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year     SMALLINT      NOT NULL,
  credit_limit    NUMERIC(15,2) DEFAULT 0,          -- relevant for CREDIT cards
  center_id       INTEGER       REFERENCES centers(id),
  cardholder_name VARCHAR(200),
  notes           TEXT,
  active          BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_cards_active ON company_cards(active);
