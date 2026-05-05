-- Migration 003: Add missing columns to users and qr_tokens

-- Add avatar_object_id to track the on-chain avatar ID directly on the user record
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_object_id VARCHAR(66) UNIQUE;

-- Add printed flag to track if a QR code has been downloaded/printed by the merchant
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS printed BOOLEAN NOT NULL DEFAULT FALSE;
