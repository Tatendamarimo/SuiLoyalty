-- Migration 005: Production sessions + brand self-service
-- Safe to run repeatedly (idempotent).

-- 1. Session store (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR    NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON       NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

-- 2. Persist google_sub on users so we can reliably identify returning users
--    without depending on wallet_address alone.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(128) UNIQUE;

-- 3. Add brand metadata columns needed for self-service brand creation
ALTER TABLE brands ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS slug VARCHAR(80) UNIQUE;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Populate slug for existing rows that don't have one (safe backfill)
UPDATE brands
SET slug = LOWER(REGEXP_REPLACE(name, '[^a-z0-9]+', '-', 'gi'))
WHERE slug IS NULL;
