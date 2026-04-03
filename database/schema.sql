-- SuiLoyalty Database Schema
-- Author: Tatenda Marimo (P2964932)
-- Sprint 3 - April 2026

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(66) NOT NULL UNIQUE,
    email VARCHAR(255),
    display_name VARCHAR(100),
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

CREATE TABLE loyalty_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    on_chain_card_id VARCHAR(66) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id),
    brand_id UUID NOT NULL REFERENCES brands(id),
    points_balance BIGINT NOT NULL DEFAULT 0,
    tier SMALLINT NOT NULL DEFAULT 0,
    scan_count BIGINT NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, brand_id)
);

CREATE TABLE point_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES loyalty_cards(id),
    points_added BIGINT NOT NULL,
    sui_tx_digest VARCHAR(90) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE blockchain_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(120) NOT NULL,
    payload JSONB NOT NULL,
    tx_digest VARCHAR(90),
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
