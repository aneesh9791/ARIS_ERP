-- ============================================================
-- 103_mwl_gateway.sql
-- DICOM MWL Gateway — per-center tokens + access audit log
-- ============================================================

-- ── Per-center API token registry ───────────────────────────
CREATE TABLE IF NOT EXISTS mwl_center_tokens (
    id           SERIAL PRIMARY KEY,
    center_id    INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
    token_hash   VARCHAR(64)  NOT NULL,          -- SHA-256 of raw token (hex)
    token_prefix VARCHAR(12)  NOT NULL,          -- first 8 chars shown in UI
    enabled      BOOLEAN      NOT NULL DEFAULT true,
    label        VARCHAR(100),                   -- optional human note
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   INTEGER      REFERENCES users(id),
    last_used_at TIMESTAMP,
    last_ip      VARCHAR(45),                    -- IPv4 / IPv6
    UNIQUE (center_id)                           -- one active token per center
);

-- ── Access audit log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mwl_access_logs (
    id               BIGSERIAL    PRIMARY KEY,
    center_id        INTEGER      REFERENCES centers(id),
    token_prefix     VARCHAR(12),
    fetched_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_ip        VARCHAR(45),
    endpoint         VARCHAR(100) NOT NULL,
    query_params     JSONB,
    records_returned INTEGER      DEFAULT 0,
    status           VARCHAR(20)  NOT NULL
                       CHECK (status IN ('SUCCESS','ERROR','UNAUTHORIZED','DISABLED')),
    error_message    TEXT,
    response_ms      INTEGER,
    user_agent       VARCHAR(255)
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mwl_tokens_center    ON mwl_center_tokens(center_id);
CREATE INDEX IF NOT EXISTS idx_mwl_logs_center      ON mwl_access_logs(center_id);
CREATE INDEX IF NOT EXISTS idx_mwl_logs_fetched     ON mwl_access_logs(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_mwl_logs_status      ON mwl_access_logs(status);
CREATE INDEX IF NOT EXISTS idx_mwl_logs_center_date ON mwl_access_logs(center_id, fetched_at DESC);

-- ── RBAC permissions — inject into user_roles.permissions JSONB ─────────────
-- Role names in user_roles use full display names with spaces (NOT underscore codes).
-- Verified from migration 089_rbac_complete_roles.sql and live DB state.
UPDATE user_roles
   SET permissions  = (
         SELECT jsonb_agg(DISTINCT val)
         FROM jsonb_array_elements_text(
                permissions || '["MWL_VIEW","MWL_MANAGE"]'::jsonb
              ) AS t(val)
       ),
       updated_at   = NOW()
 WHERE role_name IN ('Super Administrator', 'Administrator', 'Finance Manager', 'Center Manager')
   AND active = true
   AND NOT (permissions @> '["MWL_VIEW"]'::jsonb);
