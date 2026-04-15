-- Migration: Replace loyalty_cards with loyalty_avatars + loyalty_brand_nodes
-- Run this script against your PostgreSQL database to update the schema
-- for the new loyalty_nft contract structure.

-- ─── Drop old tables (safe — loyalty_cards already dropped in first run) ──────
DROP TABLE IF EXISTS point_transactions CASCADE;
DROP TABLE IF EXISTS loyalty_cards CASCADE;

-- ─── loyalty_avatars ──────────────────────────────────────────────────────────
-- One row per user. Tracks the user's on-chain LoyaltyAvatar object.
CREATE TABLE IF NOT EXISTS loyalty_avatars (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  on_chain_avatar_id  VARCHAR(66) NOT NULL UNIQUE,  -- Sui object ID of the LoyaltyAvatar
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)                                   -- One avatar per user
);

-- ─── loyalty_brand_nodes ──────────────────────────────────────────────────────
-- One row per user-brand relationship. Mirrors the on-chain BrandNode dynamic field.
CREATE TABLE IF NOT EXISTS loyalty_brand_nodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_name      TEXT NOT NULL,              -- Cached brand name for quick display
  points_balance  BIGINT NOT NULL DEFAULT 0,
  scan_count      BIGINT NOT NULL DEFAULT 0,
  tier            SMALLINT NOT NULL DEFAULT 0, -- 0=Bronze, 1=Silver, 2=Gold
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, brand_id)                  -- One node per user per brand
);

-- ─── point_transactions (updated to reference loyalty_brand_nodes) ────────────
CREATE TABLE IF NOT EXISTS point_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         UUID NOT NULL REFERENCES loyalty_brand_nodes(id) ON DELETE CASCADE,
  points_added    BIGINT NOT NULL,
  sui_tx_digest   VARCHAR(90) UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loyalty_avatars_user_id ON loyalty_avatars(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_brand_nodes_user_id ON loyalty_brand_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_brand_nodes_brand_id ON loyalty_brand_nodes(brand_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_node_id ON point_transactions(node_id);
