-- SuiLoyalty Migration 006: Full Campaign Management Schema
-- Integrates UUID-based campaigns with multi-tenant brands and links to qr_tokens.

CREATE TABLE IF NOT EXISTS campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        UUID REFERENCES brands(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    brand_name      VARCHAR(255) NOT NULL,
    points_per_scan INTEGER NOT NULL DEFAULT 10,
    description     TEXT,
    expires_hours   INTEGER,
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add campaign_id column to qr_tokens if it doesn't already exist
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_campaigns_brand_id ON campaigns(brand_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_campaign_id ON qr_tokens(campaign_id);
