-- Migration 004: Brand Portal MVP
-- Adds zkLogin-based brand operator authentication and a redemption-fulfilment
-- workflow so each brand operator gets an isolated view of their own campaigns
-- and customers can actually use redeemed rewards. Implements the supervisor
-- feedback from Periodic Progress Meeting #4 (30 April 2026).
--
-- Design choice: brand operators authenticate with the same zkLogin Google
-- Sign-In flow that consumers use. A `brand_members` join table links a
-- user (already in the `users` table after first zkLogin) to one or more
-- brands with a role. This keeps a single auth model across the entire
-- platform — no passwords to store, no second auth pattern to defend.
--
-- Idempotent: safe to run repeatedly.

-- ─── 1. brand_members table ──────────────────────────────────────────────────
-- Maps an authenticated user to a brand with a role. The merchant terminal
-- consults this table to determine which brand portal an operator can see.
-- A user with no rows in this table cannot access the portal at all.
--
-- Roles:
--   owner    — full control of the brand: manage members, settings, campaigns
--   admin    — manage campaigns, QR codes, redemptions
--   operator — fulfil redemptions, generate QR codes
-- For the MVP we only enforce existence-of-membership; finer-grained role
-- checks can be added later without schema changes.

CREATE TABLE IF NOT EXISTS brand_members (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  role        VARCHAR(16) NOT NULL DEFAULT 'operator'
              CHECK (role IN ('owner', 'admin', 'operator')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_members_brand ON brand_members(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_members_user  ON brand_members(user_id);

-- ─── 2. redemption_requests table ────────────────────────────────────────────
-- Captures the spend-side of the loyalty cycle so brand operators can see
-- which customers are waiting for fulfilment. The `pending` row is created
-- when a customer redeems on the consumer dashboard; the operator flips it
-- to `fulfilled` after the physical reward is handed over.

CREATE TABLE IF NOT EXISTS redemption_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  points_redeemed BIGINT NOT NULL CHECK (points_redeemed > 0),
  reward_name     TEXT NOT NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at    TIMESTAMPTZ,
  fulfilled_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  fulfilled_note  TEXT
);

CREATE INDEX IF NOT EXISTS idx_redemption_requests_brand_status
  ON redemption_requests(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_redemption_requests_user
  ON redemption_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_requests_created
  ON redemption_requests(created_at DESC);

-- ─── 3. Bootstrap helper view (optional, for ops) ────────────────────────────
-- Convenience view for the operator: shows pending redemptions per brand
-- with the customer wallet so the dashboard can render a fulfilment queue
-- with a single SELECT.

CREATE OR REPLACE VIEW pending_redemptions_view AS
SELECT
  rr.id,
  rr.brand_id,
  b.name           AS brand_name,
  b.color          AS brand_color,
  rr.user_id,
  u.wallet_address AS customer_wallet,
  u.display_name   AS customer_display_name,
  rr.points_redeemed,
  rr.reward_name,
  rr.created_at
FROM redemption_requests rr
JOIN brands b ON b.id = rr.brand_id
JOIN users  u ON u.id = rr.user_id
WHERE rr.status = 'pending'
ORDER BY rr.created_at ASC;

-- ─── 4. Bootstrap notes ──────────────────────────────────────────────────────
-- For the MVP, the first brand operator is bootstrapped manually after they
-- have signed in via zkLogin at least once (so a row exists in `users`).
-- Example — grant Tatenda owner access to all four seeded brands:
--
--   INSERT INTO brand_members (user_id, brand_id, role)
--   SELECT u.id, b.id, 'owner'
--   FROM users u CROSS JOIN brands b
--   WHERE u.wallet_address = '0xYOUR_TATENDA_SUI_ADDRESS_HERE'
--   ON CONFLICT (user_id, brand_id) DO NOTHING;
--
-- The invite-by-code flow (operators inviting new operators by URL) is
-- declared in the report as future work.
