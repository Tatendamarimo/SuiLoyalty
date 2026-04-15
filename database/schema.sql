-- SuiLoyalty Database Schema
-- Author: Tatenda Marimo (P2964932)
-- Sprint 3 - April 2026

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(66) NOT NULL UNIQUE,
    email VARCHAR(255),
    display_name VARCHAR(100),
    avatar_object_id VARCHAR(66) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(60),
    color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE qr_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_uuid UUID NOT NULL UNIQUE,
    brand_id UUID REFERENCES brands(id),
    points_value INT NOT NULL DEFAULT 10,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_by UUID REFERENCES users(id),
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    printed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loyalty_avatars (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    on_chain_avatar_id  VARCHAR(66) NOT NULL UNIQUE,  -- Sui object ID of the LoyaltyAvatar NFT
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)    -- One avatar per user
);

CREATE TABLE loyalty_brand_nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    brand_name      TEXT NOT NULL,               -- Cached brand name for quick display
    points_balance  BIGINT NOT NULL DEFAULT 0,
    scan_count      BIGINT NOT NULL DEFAULT 0,
    tier            SMALLINT NOT NULL DEFAULT 0, -- 0=Bronze, 1=Silver, 2=Gold
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, brand_id)                   -- One node per user per brand
);

CREATE TABLE point_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID NOT NULL REFERENCES loyalty_brand_nodes(id) ON DELETE CASCADE,
    points_added    BIGINT NOT NULL,
    sui_tx_digest   VARCHAR(90) UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE blockchain_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(120) NOT NULL,
    payload JSONB NOT NULL,
    tx_digest VARCHAR(90),
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
