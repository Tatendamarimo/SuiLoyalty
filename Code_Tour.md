# SuiLoyalty — Code Tour (Function-by-Function Walkthrough)

**Companion to:** `Walkthrough_Prep.md` (architecture + Q&A)
**This file:** every meaningful function in every file, in walkthrough order.

Use ctrl-F. If the supervisor lands on any file, search for it here, read the entry, and you'll have the answer.

---

## Walkthrough order

1. Move smart contracts — the on-chain truth
2. Backend services — the bridge between Web2 and Web3
3. Backend HTTP layer — server.ts, routes, middleware
4. Frontend pages — what the user actually sees
5. Database schema — the off-chain mirror
6. Cross-cutting flows — how data moves through the whole system

---

# PART 1 — SMART CONTRACTS

The on-chain layer. Two Move modules deployed as a single package on Sui testnet.

## 1.1 `contracts/sources/loyalty_nft.move`

**Purpose.** The core loyalty module. Defines the `LoyaltyAvatar` NFT, the `BrandNode` per-brand attachment, and the `AdminCap` capability that gates every mutation.

**Module declaration:** `module sui_loyalty::loyalty_nft;`

### Imports

```move
use std::string::String;
use sui::{
    event,
    dynamic_field as df,
    dynamic_object_field as dof,
};
```

`event` is for emitting blockchain events. `df` (dynamic field) is for attaching simple values to a parent object. `dof` (dynamic object field) is for attaching whole child objects to a parent. The Universal Avatar uses `dof` to attach `BrandNode` children, and each `BrandNode` uses `df` to attach attribute key-value pairs.

### Error constants

```move
const EBrandAlreadyExists: u64 = 1;
const EBrandNotFound: u64 = 2;
const EAttributeAlreadyExists: u64 = 3;
const EAttributeNotFound: u64 = 4;
const EAvatarLocked: u64 = 5;
const ERedemptionExceedsBalance: u64 = 6;
```

These are the abort codes that surface to the caller when an invariant is violated. The Move test suite uses `#[expected_failure(abort_code = ...)]` to assert each one fires correctly under the right conditions.

### Structs

**`AdminCap`** (line 39) — the security primitive. Created once in `init` and transferred to the package publisher (the backend wallet). Required as the first parameter of every mutative function. Cannot be forged because the Move type system enforces that `AdminCap` is only constructable inside this module.

**`LoyaltyAvatar`** (line 47) — the customer's loyalty NFT. Fields:
- `id: UID` — Sui object ID
- `name: String` — display name from Google profile
- `level: u64` — global level, computed as `1 + experience / 1000`
- `experience: u64` — total XP across all brands
- `locked: bool` — guard flag to prevent concurrent mutation (currently used only as defensive infrastructure)

This is a **shared object** — created via `transfer::share_object` in `mint_avatar`. Shared means publicly mutable in principle; AdminCap is what restricts who can actually mutate it.

**`BrandNode`** (line 64) — attached to an Avatar as a Dynamic Object Field, one per brand. Fields:
- `id: UID`
- `brand_name: String`
- `tier: u64` — currently `points / 500` (Bronze 0–499, Silver 500–999, Gold 1000+ in the SQL mirror; on-chain it's uncapped — this is the known divergence to surface)
- `points: u64` — append-only, lifetime earned
- `redeemed: u64` — append-only, lifetime spent

The two append-only counters together preserve the trust property: brands cannot silently reduce earned points, only record redemptions against them.

**`BrandKey`** (line 75) — the discriminator for looking up BrandNodes on an Avatar. Wrapping `brand_name: String` in a struct with `copy, drop, store` lets it serve as a Dynamic Object Field key.

**`AttributeKey`** (line 80) — same pattern but for attaching attributes to a BrandNode.

**`AttributeValue`** (line 85) — `{ value: u64, label: String }`. Stored as a regular Dynamic Field on a BrandNode (not Dynamic Object Field, because it doesn't need its own object identity).

### Events

Six event types — `AvatarCreatedEvent`, `BrandAddedEvent`, `BrandRemovedEvent`, `AttributeUpdatedEvent`, `AttributeRemovedEvent`, `RedemptionRecordedEvent`. The backend reads these via Sui RPC subscription for the `blockchain_events` audit table.

### `init(ctx)` — the module initialiser

```move
fun init(ctx: &mut TxContext) {
    transfer::transfer(AdminCap {
        id: object::new(ctx),
    }, ctx.sender());
}
```

Runs once when the package is published. Mints an AdminCap and transfers it to the publisher (the backend wallet). After this, no more AdminCaps can ever be created — the type system guarantees it.

### `create_avatar(name, ctx) -> LoyaltyAvatar`

A public function (not `entry`) that returns the avatar so it can be used in PTBs before it's transferred or shared. Initialises with `level=1`, `experience=0`, `locked=false`.

### `mint_avatar(name, ctx)`

The `entry fun` version. Wraps `create_avatar` and immediately calls `transfer::share_object(avatar)` to share the resulting object. Used by the backend's `blockchain.service.ts::mintAvatarOnChain` on first scan.

### `add_brand(_: &AdminCap, avatar, brand_name, ctx)`

Attaches a new BrandNode to an Avatar. Asserts the avatar isn't locked. Asserts the brand isn't already attached (`EBrandAlreadyExists`). Constructs a fresh BrandNode with `tier=0, points=0, redeemed=0`. Calls `dof::add` to attach it under the BrandKey.

### `remove_brand(_: &AdminCap, avatar, brand_name)`

Removes a BrandNode. Asserts it exists (`EBrandNotFound`). Calls `dof::remove` (which consumes the borrow), emits the event, then destructures the returned BrandNode and explicitly deletes its UID. The destructure pattern `let BrandNode { id, brand_name: _, tier: _, points: _, redeemed: _ } = ...` is the canonical way to destroy a Move object — every UID must be explicitly deleted.

### `add_attribute(_: &AdminCap, avatar, brand_name, attribute_name, value, label)`

Attaches an attribute (e.g. `speed=75 ("Speed Rating")`) to a BrandNode. Two-level lookup: borrow the BrandNode under BrandKey, then `df::add` on the BrandNode's UID under AttributeKey.

### `update_attribute` and `remove_attribute`

Same pattern as add_attribute but for mutation and removal. Each asserts the attribute exists with `EAttributeNotFound`.

### `gain_experience(_: &AdminCap, avatar, amount)`

Increments `avatar.experience`. Recomputes `avatar.level = 1 + (experience / 1000)`. So 0 XP = level 1, 1000 XP = level 2, etc. Always called by the backend in the same PTB as `add_brand_points` so per-brand earning and global XP stay in sync.

### `add_brand_points(_: &AdminCap, avatar, brand_name, points)`

Borrows the BrandNode mutably, adds points, recomputes tier as `points / 500`. **This is where the on-chain tier formula lives** — and where the divergence from the SQL mirror is. Surface this proactively: "On-chain caps tier nowhere; SQL caps at 2 (Gold). At ≥1500 lifetime points the two stores disagree. Fix is one line of Move; redeploy is deferred."

### `record_redemption(_: &AdminCap, avatar, brand_name, amount)` — the redemption invariant

This is the function we just fixed today. The flow:

1. Capture `avatar_id` *before* the mutable borrow (Move borrow checker requirement — fixed today).
2. Inside a scoped block, borrow the BrandNode mutably, assert `amount <= points - redeemed`, increment `redeemed`, capture `new_redeemed_total`, release the borrow.
3. Emit the event with the captured values.

The crucial property: `points` is never decremented. Redemption only adds to `redeemed`. The blockchain record of "what this customer earned" is monotonically increasing forever; brands can never falsify it.

### `lock_avatar` / `unlock_avatar`

Set/clear the `locked` flag. Currently defensive only — no flow uses them in production. They exist as infrastructure for future extensions where atomic compound mutations need a guard.

### View functions (lines 360+)

`name`, `level`, `experience`, `is_locked`, `has_brand(brand_name)`, `brand_tier(brand_name)`, `brand_points(brand_name)`, `brand_redeemed(brand_name)`, `brand_available(brand_name)` (returns `points - redeemed`), `attribute_value(brand_name, attribute_name)`, `attribute_label(...)`, `has_attribute(...)`. Pure reads. Used by the backend's `getAvatarByObjectId` indirectly through Sui RPC `getObject`.

### Test-only helpers

`init_for_testing(ctx)` exposes the otherwise-private `init` to the test suite. `destroy_avatar_for_testing` lets tests destruct an avatar without going through `transfer::share_object`. Required because Move's resource system forbids dropping objects with UIDs.

---

## 1.2 `contracts/sources/loyalty_token.move`

**Purpose.** A separate fungible currency module. Implements the LPT token (LOYALTY_TOKEN) with per-brand treasuries. Currently deployed but not wired into the redemption flow — declared as future work.

### One-Time Witness pattern

```move
public struct LOYALTY_TOKEN has drop {}
```

The `LOYALTY_TOKEN` struct has the `drop` ability and is named in all-caps matching the module. This is Sui's One-Time Witness (OTW) idiom — Sui guarantees that exactly one instance of this type exists, ever, and it's passed to `init` as the witness for currency creation. After `init` finishes, the witness is dropped and can never be reconstructed. This makes it impossible to mint a second LPT currency.

### Capabilities

**`TokenAdminCap`** — platform-level admin. Held by the backend wallet. Authorises creating new brand treasuries.

**`DistributorCap`** — per-treasury cap. Authorises distributing tokens from one specific BrandTreasury to consumers. Scoped by `treasury_id: ID`.

### `BrandTreasury`

Shared Object holding a brand's token allocation. Fields: `brand_name`, `brand_owner` address, `balance: Balance<LOYALTY_TOKEN>`, `total_deposited`, `total_distributed`. The two lifetime counters give brand owners auditable supply metrics.

### `init(witness, ctx)`

Creates the LOYALTY_TOKEN currency via `coin::create_currency` with 0 decimals (1 token = 1 loyalty point), symbol "LOYAL", name "Loyalty Point". Transfers the `TreasuryCap` and `TokenAdminCap` to the publisher. Freezes the metadata so it's immutable and publicly readable.

### `create_brand_treasury(_cap: &TokenAdminCap, brand_name, brand_owner, ctx) -> DistributorCap`

Admin-only. Creates a new BrandTreasury as a Shared Object, returns a fresh DistributorCap scoped to that treasury. The caller transfers the DistributorCap to whoever should be allowed to distribute (typically the backend sponsor wallet, but the design allows offline brands to hold their own).

### `mint_to_treasury(treasury_cap, treasury, amount, ctx)`

Mints `amount` new LOYALTY_TOKEN coins and deposits them into the named treasury. Only the holder of the platform-wide `TreasuryCap<LOYALTY_TOKEN>` (the backend) can do this. Asserts `amount > 0` (`EZeroAmount`).

### `distribute_tokens(distributor, treasury, recipient, amount, ctx)`

Sends `amount` tokens from the treasury to `recipient`. Asserts: `amount > 0`, the DistributorCap matches this treasury's ID (`EDistributorMismatch`), the treasury has enough balance (`EInsufficientTreasuryBalance`). Splits a Balance, mints a Coin, and `transfer::public_transfer`s it to the recipient.

### `withdraw_from_treasury(_cap, treasury, amount, recipient, ctx)`

Admin-only escape hatch. Lets the platform admin withdraw tokens back out — for brand offboarding or rebalancing.

### View functions

`treasury_brand_name`, `treasury_balance`, `treasury_total_deposited`, `treasury_total_distributed`, `treasury_brand_owner`, `distributor_treasury_id`. Standard getters.

---

## 1.3 Move tests

### `contracts/tests/loyalty_nft_tests.move` — 25 test functions

Uses Sui's `test_scenario` framework. Each test follows the pattern: `setup()` creates a scenario with `ADMIN` as the sender and runs `init_for_testing`; subsequent `next_tx(...)` blocks switch the active sender between `ADMIN`, `USER`, etc. to simulate real ownership and capability passing.

Test categories:

- **Avatar creation** (2): default fields, mint shares object
- **Brand management** (5): add, multi-add, duplicate-fails, remove, remove-missing-fails
- **Points and tier** (3): bronze, tier-up at 500/1000, missing-brand-fails
- **Redemption** (4): decrements available, accumulates, exceeds-fails, missing-brand-fails — the new ones added today
- **Experience and level** (2): below-1000 stays at level 1, above-1000 levels up
- **Attributes** (5): add+read, update, remove, duplicate-fails, update-missing-fails
- **Lock/unlock** (3): lock-then-unlock, locked-add-brand-fails, locked-gain-xp-fails
- **Full lifecycle** (1): a single test covering create → add brand → add points → add attribute → gain XP → lock → unlock → remove brand

### `contracts/tests/loyalty_token_tests.move` — 11 test functions

- **Init** (1): TokenAdminCap and TreasuryCap both transferred to sender
- **Treasury creation** (1): returns DistributorCap, treasury is shared
- **Minting** (2): increases balance, zero-amount-fails
- **Distribution** (4): consumer receives coin, exceeds-balance-fails, wrong-treasury-fails (DistributorCap mismatch), zero-amount-fails
- **Admin withdraw** (2): succeeds, exceeds-balance-fails
- **View functions** (1): all getters return expected values on a fresh treasury

**Total: 36 Move tests, all passing as of today.**

---

## 1.4 `Move.toml`, `Move.lock`, `Published.toml`

**`Move.toml`** — package manifest. Edition 2024. No explicit dependencies (resolved via Move.lock).

**`Move.lock`** — git-tracked lockfile. Pins the Sui Framework and MoveStdlib for both devnet and testnet to specific commits, with manifest digests for verification. The current canonical environment is testnet.

**`Published.toml`** — records the live deployment package ID (`0x69c2b0f5…be404c`) on testnet, with `chain-id = "4c78adac"` and the `upgrade-capability` ID. This file is *committed* to source control by design — it's the canonical record of what's deployed.

---

# PART 2 — BACKEND

The bridge between Google OAuth, Sui RPC, and PostgreSQL.

## 2.1 `backend/src/server.ts` — the HTTP entry point

737 lines. Express 5 + TypeScript. ~20 endpoints. Walk through the file in this order.

### Setup (lines 1–113)

- **dotenv** loaded first, before any other imports that read `process.env`.
- **JWKS client** (line 41): `jwksClient` from `jwks-rsa`, pointed at Google's public certificate endpoint. Caches keys, rate-limited. Used by `verifyGoogleJwt` to cryptographically verify any JWT comes from Google.
- **`verifyGoogleJwt(idToken)`** (line 47): wraps `jwt.verify` to fetch the signing key for the JWT's `kid` from JWKS, then validates the signature. Asserts algorithm RS256, audience matches `GOOGLE_CLIENT_ID`, issuer is `accounts.google.com`. Returns the decoded payload. **This is the cryptographic root of trust** — every authenticated request flows through this function.
- **Helmet + CORS + JSON body parser**.
- **Sessions** (line 95): `connect-pg-simple` stores sessions in PostgreSQL's `session` table. Cookies are HttpOnly, 24-hour TTL, secure+strict in production.

### Auto-migration (lines 25–27)

```ts
pool.query("ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS campaign_name ...")
```

Runs once on every server boot. Defensive but slightly fragile — better practice is to run migrations explicitly. Known limitation; declared in the talking points.

### Endpoints

#### Health
**`GET /api/health`** — returns `{ status: 'healthy', timestamp }`. Sanity check.

#### Auth (lines 124–331)

**`POST /api/auth/zklogin`** — initiates the Google OAuth flow.
1. Fetches the current Sui epoch via `SuiJsonRpcClient.getLatestSuiSystemState()`.
2. Generates an ephemeral keypair via `generateEphemeralKeypair(epoch)` — see zklogin.service.
3. Builds a Google OAuth URL with `client_id`, `redirect_uri` (from env), `scope=openid email profile`, `nonce` from the ephemeral, and optionally `state=returnUrl` so the post-auth redirect knows where to send the user.
4. Returns `{ authUrl, ephemeralPublicKey, maxEpoch, randomness }`. The frontend stores the ephemeral fields in localStorage and redirects to `authUrl`.

**`POST /api/auth/callback`** — the legacy POST callback. Frontend POSTs the authorisation code; backend exchanges it with Google for an id_token, verifies via JWKS, derives the Sui address, upserts the user, sets the session, returns `{ success, user }`.

**`GET /api/auth/callback`** — the canonical Google redirect target. Same flow as POST, but instead of returning JSON, redirects the browser to the URL in `state` (with `?address=&name=` appended) for the consumer flow, or to `/merchant` for the brand-operator flow if no state was provided. **This is the endpoint registered in Google Cloud Console as the redirect URI** — `http://localhost:3000/api/auth/callback`.

**`GET /api/auth/session`** — returns the current session if authenticated.

**`POST /api/auth/logout`** — destroys the session and clears the cookie.

#### Brands (lines 333–501)

**`GET /api/brands`** — public list of all active brands. Used by the consumer dashboard to show available brands.

**`POST /api/brands`** — authenticated. Anyone signed in can create a brand. Auto-grants the creator `owner` role via `brand_members`. Generates a slug from the name (timestamped to guarantee uniqueness).

**`PUT /api/brands/:brand_id`** — authenticated. **Role-gated**: only owners and admins can edit (`server.ts:401–407`). Updates name, category, color, description.

**`POST /api/brands/:brand_id/members`** — authenticated. **Role-gated**: only owners and admins can grant access. Looks up the target user by `wallet_address`; inserts into `brand_members` with the specified role.

**`GET /api/brands/:brand_id/members`** — authenticated. Anyone with membership can list members.

#### QR (lines 503–607)

**`POST /api/qr/mark-printed`** — flips `qr_tokens.printed = TRUE` for a batch of UUIDs. Called by the merchant terminal after the operator downloads the QR PNGs.

**`POST /api/qr/clear-unprinted`** — deletes all unused, unprinted tokens for a brand. Cleanup for the merchant workflow when an operator generates a batch but doesn't print it.

**`GET /api/qr/brand/:brand_id`** — returns inventory: list of recent tokens (last 200) plus stats (total, printed, scanned, outstanding).

**`POST /api/qr/generate`** — creates a fresh QR token. Delegates to `qr.service.generateQRToken`.

**`POST /api/qr/validate`** — the hot path. Validates the body (token_uuid present, user_id present, token_uuid matches UUID regex), resolves a wallet address to internal user_id if needed, calls `qr.service.validateQRToken`. Returns the validated token enriched with brand info and the Sui transaction digest.

#### Read endpoints (lines 609–670)

**`GET /api/user/:address`** — wallet address → user record (display name, email).

**`GET /api/nft/:address`** — wallet address → live on-chain avatar state via `nft.service.getLoyaltyAvatar`.

**`GET /api/loyalty-cards/:address`** — wallet address → all of that user's `loyalty_brand_nodes` joined with brand metadata, sorted by points balance descending.

**`GET /api/transactions/:address`** — wallet address → audit log of earn events from `point_transactions` joined with brand metadata, last 50.

#### Redemption

**`POST /api/redeem`** — consumer triggers a redemption. Resolves wallet address to user_id, calls `redemption.service.createRedemptionRequest`. Returns the new pending request.

#### Account deletion

**`DELETE /api/users/me`** — authenticated. Inside a transaction: nulls out `qr_tokens.used_by` for any tokens this user scanned (preserves analytics, anonymises identity); deletes the user row, which cascades to avatars, brand nodes, redemptions, brand memberships. Then destroys the session.

### Listen

**`app.listen(PORT, '0.0.0.0', ...)`** — binds to all interfaces so a phone on the same LAN can reach it for QR scanning.

---

## 2.2 `backend/src/services/zklogin.service.ts` — pure crypto

54 lines. Three exports.

### `deriveSalt(googleSub: string): string`

```ts
return createHmac('sha256', process.env.ZKLOGIN_SALT_SECRET!)
    .update(googleSub)
    .digest('hex');
```

Computes HMAC-SHA256 of the Google `sub` claim with the server-side secret. Returns a 64-char hex string. **Deterministic** — same Google account always produces the same salt, which always produces the same Sui address. Tested in `zklogin.service.test.ts` cases 1–4.

### `computeSuiAddress(jwt: string, salt: string): string`

```ts
return jwtToAddress(jwt, BigInt('0x' + salt.slice(0, 32)));
```

Wraps Mysten Labs' `jwtToAddress` from `@mysten/zklogin`. Takes the JWT and the first 16 bytes of the salt as a BigInt. Returns a Sui address. The actual zero-knowledge proof construction happens inside the SDK — we provide only the JWT and salt.

### `generateEphemeralKeypair(currentEpoch: number)`

Creates a fresh Ed25519 keypair, derives a `randomness` value via `generateRandomness`, computes `maxEpoch = currentEpoch + 10` (so the keypair is valid for 10 Sui epochs ≈ several days), and a `nonce` from the public key + maxEpoch + randomness. Stores the keypair in an in-memory `Map<nonce, ...>` for retrieval by `getEphemeralKeypair(nonce)`. Returns `{ nonce, maxEpoch, randomness, ephemeralPublicKey }` for the frontend to embed in the OAuth redirect.

### `getEphemeralKeypair(nonce)`

Retrieves a previously-generated keypair from the in-memory store by nonce. Returns `undefined` if not found (e.g. after a server restart — known limitation, currently relies on the OAuth flow completing within the server lifetime).

---

## 2.3 `backend/src/services/qr.service.ts` — the orchestrator

201 lines. Two exports.

### `generateQRToken(brand_id?, points_value?, campaign_name?, expires_in_days?)`

Inserts a fresh row into `qr_tokens` with a new `randomUUID()`, optional brand and points value, default 10 points, default `'General Campaign'`. Returns the inserted row. Single SQL statement; no orchestration logic.

### `validateQRToken(token_uuid, user_id)` — **the most important function in the backend**

This is where the off-chain mirror, on-chain mutation, and audit log all converge. Walk through the supervisor:

1. **Atomic UPDATE for replay prevention** (lines 53–61). Single SQL statement inside `BEGIN`. Sets `used = TRUE, used_by = $2, used_at = NOW()` only if `used = FALSE` and not expired. Returns 0 rows if any condition fails. PostgreSQL row-level locking guarantees only one concurrent request succeeds.

2. **If 0 rows**, ROLLBACK and throw. The customer gets a 400.

3. **COMMIT** the QR atomic update.

4. **If `token.brand_id` is null**, return early with `tx_digest = null`. (Brandless QR codes are supported but currently unused.)

5. **Look up the brand name** via PostgreSQL.

6. **Branch on whether the user has an avatar.**

   - **No avatar (first-ever scan):**
     - Look up the user's `display_name` and `wallet_address`.
     - Throw if `wallet_address` is null (shouldn't happen for an authenticated user).
     - Call `mintAvatarOnChain(displayName, walletAddress)` — sponsored Sui transaction that mints and shares a new LoyaltyAvatar.
     - Insert into `loyalty_avatars` (user_id, on_chain_avatar_id).
     - Call `addBrandToAvatarOnChain(avatarObjectId, brandName)` — attach a fresh BrandNode.
     - Insert into `loyalty_brand_nodes` with `points_balance = pointsToAdd, scan_count = 1, tier = 0`. Capture the inserted ID.
     - Call `addBrandPointsOnChain(avatarObjectId, brandName, pointsToAdd)` — bundles `add_brand_points` + `gain_experience` in one PTB. Capture the tx digest.

   - **Avatar exists, but no BrandNode for this brand (first scan at this brand):**
     - Call `addBrandToAvatarOnChain(...)`.
     - Insert into `loyalty_brand_nodes` with initial values. Capture the ID.
     - Call `addBrandPointsOnChain(...)`. Capture digest.

   - **Avatar and BrandNode both exist (returning customer):**
     - UPDATE `loyalty_brand_nodes`: increment `points_balance`, increment `scan_count`, recompute `tier` via the SQL CASE (caps at 2 for Gold).
     - Call `addBrandPointsOnChain(...)`. Capture digest.

7. **Insert the audit row** into `point_transactions` with the BrandNode ID, points_added, and tx_digest.

8. **SELECT the enriched token** for the response (joining brands for name/colour/category) and return it with `tx_digest` attached.

Tested by 9 cases in `qr.service.test.ts` covering replay rejection, the SQL contains the double-spend guard, no-brand path, new-user full mint flow, returning-user points-only flow, blockchain failure propagation, missing wallet address.

---

## 2.4 `backend/src/services/blockchain.service.ts` — Sui RPC

234 lines. Five exports. All Sui RPC calls live here so the rest of the codebase doesn't import `@mysten/sui` directly.

### `getKeypair()` (private)

Decodes `process.env.SUI_PRIVATE_KEY` via `decodeSuiPrivateKey` and constructs an `Ed25519Keypair`. Re-called per transaction — keypair construction is cheap.

### `getClient()` (private)

Constructs a fresh `SuiJsonRpcClient` pointed at the network's full node. Re-called per transaction.

### `mintAvatarOnChain(displayName, recipientAddress) -> string`

Builds a Programmable Transaction Block (`new Transaction()`) with one moveCall to `${PACKAGE_ID}::loyalty_nft::mint_avatar`. Signs and executes via the backend keypair. Pulls the new avatar's object ID out of `result.objectChanges` by filtering for `type === 'created'` and `objectType.includes('LoyaltyAvatar')`. Returns the object ID. Logs the tx digest.

### `addBrandToAvatarOnChain(avatarObjectId, brandName) -> string`

PTB with one moveCall to `loyalty_nft::add_brand`, with arguments `[AdminCap, avatar, brandName]`. Returns the tx digest. Note that `tx.object(ADMIN_CAP_ID)` is how the AdminCap is passed in — the backend reads the cap ID from env and references it as a Sui object input.

### `addBrandPointsOnChain(avatarObjectId, brandName, points) -> string`

**The compound PTB.** Two moveCalls in one transaction:
1. `add_brand_points(AdminCap, avatar, brandName, points)`
2. `gain_experience(AdminCap, avatar, points)`

Both succeed atomically or both fail. One gas payment. This is the pattern that demonstrates Sui's PTB advantage over per-call atomicity. Used on every QR scan after the first.

### `recordRedemptionOnChain(avatarObjectId, brandName, amount) -> string`

PTB with `record_redemption`. Currently exposed for future use; the dashboard's redeem flow doesn't call it yet (off-chain only — declared as future work).

### `getAvatarByObjectId(objectId)`

Read-only. Calls `client.getObject({ id, options: { showContent: true } })`, parses `data.content.fields`, returns `{ objectId, name, level, experience, locked }`. Used by `nft.service.getLoyaltyAvatar` to populate the dashboard's global stats from chain state rather than from the SQL mirror.

---

## 2.5 `backend/src/services/nft.service.ts`

27 lines. One export.

### `getLoyaltyAvatar(walletAddress) -> { objectId, name, level, experience, locked } | null`

Joins `loyalty_avatars` with `users` to find the on-chain avatar ID for a given wallet. If found, calls `blockchain.service.getAvatarByObjectId` to fetch live state from Sui RPC. Returns `null` if the user has no avatar yet (they haven't scanned anything).

---

## 2.6 `backend/src/services/redemption.service.ts`

275 lines. Six exports. The pending/fulfilled/cancelled lifecycle for off-chain redemption.

### `createRedemptionRequest(userId, brandId, pointsToRedeem, rewardName)` — the consumer entry point

Inside a transaction:
1. `SELECT FOR UPDATE` the customer's `loyalty_brand_nodes` row, locking it against concurrent reads.
2. If no row, throw "No loyalty card for this brand — earn points first".
3. If `points_balance < pointsToRedeem`, throw "Insufficient points".
4. UPDATE the row to subtract the points.
5. INSERT a row into `redemption_requests` with `status = 'pending'`.
6. COMMIT.

The lock is what prevents a customer from spending the same points twice via concurrent requests.

### `listPendingForBrand(brandId)` and `listRecentlyResolvedForBrand(brandId)`

Read views for the brand portal's pending queue and recent-history panels.

### `markFulfilled(requestId, brandId, fulfilledByUserId, note?)` — operator action

Single UPDATE: flip `status` from `'pending'` to `'fulfilled'`, set `fulfilled_at = NOW()`, `fulfilled_by`, `fulfilled_note`. The brand_id guard prevents one brand from acting on another brand's queue. The status guard prevents double-fulfilment.

### `markCancelled(requestId, brandId, cancelledByUserId, note?)` — operator action with refund

Inside a transaction:
1. UPDATE the request to `status = 'cancelled'`.
2. UPDATE `loyalty_brand_nodes.points_balance` to add the points back (refund).
3. COMMIT.

The two-step refund happens atomically.

### `summariseRedemptionsForBrand(brandId)`

One query with four `COUNT(*) FILTER (WHERE ...)` aggregates: pending, fulfilled in last 30 days, cancelled in last 30 days, sum of points redeemed in last 30 days. Used by the brand portal home tile.

### `getBrandReportData(brandId, campaignName?)`

SELECT every QR token for a brand, optionally filtered by campaign. Joins users for the scanner's wallet address. Used by the report.service to build PDFs and CSVs.

---

## 2.7 `backend/src/services/report.service.ts`

293 lines. The PDF report generator. Uses `pdfkit`.

### `getBrandReportSummary(brandId, campaignName?)` (private)

Single query joining `brands` with `qr_tokens` and `redemption_requests` (via subqueries). Returns aggregate metrics: total/printed/scanned/outstanding codes, scan rate, total points earned, pending/fulfilled redemptions, points redeemed. Calls fields by their explicit aliases so the result type is statically known.

### `formatDate(iso)` (private)

Formats an ISO timestamp as `"01 May 2026 — 14:32"` (UK style, readable when printed).

### `truncate(s, n)` (private)

Truncates a string with ellipsis if longer than `n`.

### `generateCampaignReportPDF(brandId, res, campaignName?)` — streams the PDF to the Express response

1. Fetch summary and rows.
2. Set Content-Type and Content-Disposition headers (filename includes brand name + ISO date).
3. Construct the PDF document (A4 portrait, margins, metadata).
4. Pipe PDF output directly to the response stream.
5. Render: brand-coloured header bar with title and timestamp; four summary cards (total codes, printed, scanned, scan rate); four redemption cards (pending, fulfilled 30d, points earned lifetime, points redeemed 30d); a code-activity table with seven columns paginated automatically as content overflows.
6. Add page-number footer.
7. Call `doc.end()` to flush.

The streaming approach means even very large reports don't buffer in memory.

---

## 2.8 `backend/src/routes/brand.routes.ts`

244 lines. All `/api/brand/*` endpoints. Mounted at `app.use('/api/brand', brandRouter)` in server.ts.

### `GET /memberships`

Inline session check (no `requireBrandAuth` because it's not scoped to a single brand). Calls `listBrandMemberships(userId)`.

### `GET /:brand_id/redemptions/pending` and `/recent`

`requireBrandAuth` middleware → `listPendingForBrand(brandId)` / `listRecentlyResolvedForBrand(brandId)`.

### `POST /:brand_id/redemptions/:request_id/fulfil` and `/cancel`

`requireBrandAuth` → `markFulfilled` / `markCancelled` from redemption.service.

### `GET /:brand_id/summary`

`requireBrandAuth` → `summariseRedemptionsForBrand(brandId)`. Returns the summary with `role: req.brandRole` so the frontend knows what UI to render.

### `GET /:brand_id/report.pdf`

`requireBrandAuth` → `generateCampaignReportPDF(brandId, res, campaign?)`. Streams the PDF directly. Sends 500 JSON if the stream hasn't started; ends the response if it has (no clean way to recover mid-stream).

### `GET /:brand_id/report.csv`

`requireBrandAuth` → `getBrandReportData` → CSV serialisation in-handler. RFC 4180 compliant: wraps fields containing commas, quotes, or newlines in quotes; doubles internal quotes. Token UUIDs are masked (first 6 + last 4 chars only) for privacy.

### `GET /:brand_id/campaigns`

Distinct campaign names for a brand. Used by the report-export card to populate the campaign filter dropdown.

---

## 2.9 `backend/src/middleware/brandAuth.ts`

92 lines. Two exports.

### `requireBrandAuth(req, res, next)` — the gate

1. Reads `req.session.userId`. If missing, 401.
2. Reads `req.params.brand_id`. If missing, 400.
3. Single SQL: `SELECT role FROM brand_members WHERE user_id = $1 AND brand_id = $2`.
4. If no row, 403.
5. Sets `req.userId`, `req.brandId`, `req.brandRole` for downstream handlers.

### `listBrandMemberships(userId)`

Returns all brands the user has access to, joined with brand metadata. Used by the brand-picker screen.

---

## 2.10 `backend/src/config/database.ts`

15 lines. Constructs a `pg.Pool` from `DATABASE_URL`. Exports as default and named. All other backend modules import `pool` from here so there's exactly one connection pool process-wide.

---

## 2.11 Backend tests

### `__tests__/zklogin.service.test.ts` — 12 tests

Pure crypto. No mocks needed. Tests `deriveSalt` (output format, determinism, sensitivity to inputs), `generateEphemeralKeypair` (field presence, maxEpoch math, nonce uniqueness, base64 validity), `getEphemeralKeypair` (retrieval, undefined for unknown).

### `__tests__/qr.service.test.ts` — 9 tests

Full ESM-safe mocking via `jest.unstable_mockModule`. Mocks `pg` pool (both query and connect/transactional patterns) and `blockchain.service` (mintAvatar / addBrand / addPoints). Then dynamically imports the service. Tests `generateQRToken` (insert + brand override) and `validateQRToken` across replay rejection, SQL contains the double-spend guard, no-brand short-circuit, new-user full mint flow, returning-user points-only, blockchain failure propagation, missing wallet address.

### `__tests__/api.security.test.ts` — 11 tests

HTTP-level via supertest. Builds a minimal Express app, mounts the real qr.routes router against mocked services, plus a parallel `/api/validate-strict` endpoint that replicates server.ts's UUID regex check. Tests: `POST /api/qr/generate` (201 / 500), `POST /api/qr/validate` (400 missing fields), UUID format validation (accept valid, reject SQL injection, reject non-UUID, reject empty, reject UUID with trailing chars), and request body edge cases.

**Total: 32 backend tests, plus the jest.config `lines: 80` coverage threshold.**

---

# PART 3 — FRONTEND

Next.js 16 + React 19. Five pages.

## 3.1 `frontend/src/app/page.tsx` — audience picker

New as of today. ~280 lines.

- **`AudienceCard` component** — reusable card with hover lift, animated orb, badge, icon, title, tagline, three bullets, and a CTA button that translates the arrow on hover. Self-contained styling with no external CSS framework.
- **`Picker` default export** — header (animated SuiLoyalty logo, gradient title, "Choose your sign-in" copy, network status pill), two-card grid (Customer → `/customer`, Brand operator → `/merchant`), footer.

The whole page is ~280 lines, mostly styling. No state, no data fetching, no API calls.

## 3.2 `frontend/src/app/customer/page.tsx` — consumer sign-in

~340 lines. Was previously at `/`. Three pieces.

- **OAuth callback handler (lines 11–48)** — `useEffect` reads `?address=` from URL, saves to localStorage, forwards to `/dashboard`. Legacy `?code=` path POSTs to `/api/auth/callback` if encountered.
- **`handleSignIn` (lines 50–75)** — POSTs to `/api/auth/zklogin` with `returnUrl: window.location.origin + "/customer"`. Stashes `ephemeralPublicKey/maxEpoch/randomness` in localStorage. Redirects to the Google `authUrl`.
- **JSX** — desktop hero on left (only ≥1024px), sign-in card with Sign-in-with-Google button + status pills, "How it works" three-step explainer card. Plus a "Back to chooser" link added today.

## 3.3 `frontend/src/app/dashboard/page.tsx` — consumer dashboard

917 lines. Largest consumer page. Walk through the supervisor:

### Top of file (lines 1–70)

- `Toast` type and `ToastContainer` component. Toasts are fixed bottom-right with success/error variants, auto-dismiss after 3.5s, click-to-dismiss.
- `BrandCard` type matching the `loyalty-cards` API response shape.
- Tier helpers: `tierName(t)` returns `["Bronze", "Silver", "Gold"][t]`; `tierGradient(t)` returns a metallic gradient string per tier; `nextTierPts(t)` returns `(t+1) * 500`; `progress(pts, t)` returns the percentage to the next tier (capped at 100% if already at max).

### `BrandCardUI` (lines 73–213)

Self-contained card component for one BrandNode. Hover state lifts the card 4px and brightens the border. Shows: brand initial in coloured tile, brand name, category, tier badge with metallic gradient, points count (large), Redeem button, progress bar to next tier, two tier-conditional badges ("VIP Access" if tier ≥ 1, "Free Refills" if pts ≥ 200).

### `DashboardContent` (lines 216 onward)

The actual dashboard component. Wrapped in Suspense at the bottom (line 907).

- **State** — address, name, cards, avatar, transactions, loading, redeemModal, redeemLoading, isDeleting, settingsOpen, toasts.
- **Initial useEffect (lines 238–261)** — reads `?address=&name=` from URL or localStorage; if no name stored, fetches `/api/user/:address`.
- **`loadData(addr)` (lines 263–278)** — three parallel fetches: `/api/loyalty-cards/:addr`, `/api/nft/:addr`, `/api/transactions/:addr`. Updates state from each.
- **Second useEffect (lines 280–282)** — calls `loadData(address)` whenever `address` changes.
- **`handleRedeem(brand, points, reward)` (lines 284–305)** — POSTs to `/api/redeem`, shows success/error toast, reloads data.
- **`handleLogout` (lines 307–313)** — POSTs to `/api/auth/logout`, clears localStorage, redirects to `/`.
- **`handleDeleteAccount` (lines 315–331)** — confirm dialog, DELETE `/api/users/me`, on success calls `handleLogout`.
- **JSX** — 600+ lines. Top nav with logo + network pill + settings cog. Avatar global stats (Level, XP, Total Points, Brands Connected). Per-brand cards via `BrandCardUI`. Recent activity feed. Redeem modal (category-aware reward catalogue, brand-coloured). Settings panel slide-in (logout + delete account).

## 3.4 `frontend/src/app/scan/page.tsx` — QR scanner

519 lines. One main component `ScanContent`, wrapped in Suspense.

- **State** — videoRef, canvasRef, status, message, points, cameraOn, scanningRef.
- **`startCamera()`** — calls `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })`. Sets the video element's srcObject, plays, kicks off the scan loop.
- **`stopCamera()`** — stops all tracks, clears srcObject, resets state.
- **`scanFrame()` (lines 46–70)** — the recursion loop. If video isn't ready, requestAnimationFrame next frame. Otherwise: draw the current video frame to a hidden canvas; extract pixel data; dynamically import jsQR (deferred import keeps the initial bundle small); call `jsQR(data, w, h, { inversionAttempts: "attemptBoth" })`; if a code is detected, stop camera and validate. Otherwise loop again.
- **`validateToken(qrData)` (lines 72–109)** — handles both raw UUIDs and legacy JSON-wrapped formats. POSTs to `/api/qr/validate`. On success, sets points and a success message. On error, maps backend error strings to friendlier UI copy.
- **Cleanup useEffect** — `return () => stopCamera()` so the camera tracks are released on unmount.
- **JSX** — animated background, instruction copy, video element with overlay scan-line animation, hidden canvas, status messages, success/error toasts, "Scan another" button.

## 3.5 `frontend/src/app/merchant/page.tsx` — brand portal

1,124 lines. The largest file in the codebase. Walk through it as a state machine.

### Auth state machine

`AuthState = "loading" | "signin" | "no_access" | "brand_picker" | "dashboard"`. The component renders different sub-screens depending on state.

### Sub-components (top of file, lines 70–300)

- **`SignInScreen`** — minimal sign-in card with "Sign in with Google" button.
- **`NoAccessScreen`** — for users with no brand_members rows. Shows a message and a "Create your brand" CTA. Mounts `CreateBrandModal`.
- **`CreateBrandModal`** — modal with name, category, color, description fields. POSTs to `/api/brands`.
- **`EditBrandModal`** — same shape, prefilled, PUT to `/api/brands/:brand_id`.
- **`BrandPickerScreen`** — for users with multiple memberships. Lists each brand as a card showing brand category + role, plus a "Create new brand" CTA.

### Dashboard sub-components (lines 344–900)

- **`DashboardHeader`** — top of dashboard: brand-coloured avatar with initial, brand name, role badge, switch-brand button (if hasMultiple), edit-brand button (if `canEdit = role === "owner" || role === "admin"`), sign-out.
- **`SummaryTiles`** — four tiles: pending, fulfilled 30d, cancelled 30d, points redeemed 30d.
- **`PendingRedemptionsPanel`** — auto-refreshes every 15 seconds via `setInterval`. Lists each pending row with customer wallet, points, reward name, time-ago timestamp, plus Fulfil and Cancel buttons.
- **`InventoryPanel`** — total / printed / scanned / outstanding stats; recent scans with timestamps.
- **`ReportExportCard`** — campaign filter dropdown, PDF download button, CSV download button. Both download via fetch + blob URL.
- **`QRGenerationCard`** — quantity slider (1–20), points-per-scan input, campaign name, expiry days. Generate button: clears unprinted (so the operator's view is clean), then loops for the requested quantity calling `/api/qr/generate`, generating QR images via `qrcode.js` (loaded from CDN). Then offers a JSZip-bundled download of all PNGs and a "Mark printed" button.

### Main `MerchantPortal` component (lines 900+)

State: authState, authLoading, authError, memberships, activeBrand, summary, inventory, qrLoaded, toasts, refreshTrigger.

- **Auth bootstrap useEffect (lines 917–958)** — checks for `?code=` in URL (legacy callback), otherwise calls `/api/auth/session`. Routes to the right state.
- **`loadMemberships()`** — fetches `/api/brand/memberships`. Routes between `signin`, `no_access`, `brand_picker`, `dashboard` depending on count and stored selection.
- **`handleSignIn()`** — POSTs to `/api/auth/zklogin` with `returnUrl: origin + "/merchant"`. Redirects to Google.
- **`handleSignOut()`** — POSTs to `/api/auth/logout`, clears state.
- **`handleSelectBrand(m)`** — sets activeBrand, persists in sessionStorage, switches to dashboard state.
- **Brand-data loading useEffect** — when `activeBrand` changes, fetches summary and inventory in parallel.
- **JSX** — top-level switch by `authState`, rendering the right screen with the right props.

## 3.6 `frontend/src/app/layout.tsx` and `globals.css`

**`layout.tsx`** — root layout. Inter font, basic body styling, metadata.

**`globals.css`** — design tokens: `--bg`, `--surface`, `--border`, `--primary`, `--accent`, `--text`, `--muted`. The `.glass` utility class (background + backdrop blur + subtle border) used everywhere. Plus responsive grid utilities for the merchant terminal stats.

---

# PART 4 — DATABASE

## `database/schema.sql` — base 7 tables

- **`users`** — `id, wallet_address (UNIQUE), email, display_name, avatar_object_id (UNIQUE), created_at`. One row per customer or operator. Created on first zkLogin.
- **`brands`** — `id, name, category, color, created_at`. Pre-seeded with Starbucks, Nike, Amazon, Emirates.
- **`qr_tokens`** — `id, token_uuid (UNIQUE), brand_id, campaign_name, points_value, used, used_by, used_at, expires_at, printed, created_at`. The atomic UPDATE on this table is what prevents replay.
- **`loyalty_avatars`** — `id, on_chain_avatar_id (UNIQUE), user_id (UNIQUE), created_at`. One avatar per user, mirroring on-chain.
- **`loyalty_brand_nodes`** — `id, user_id, brand_id, brand_name, points_balance, scan_count, tier, created_at, UNIQUE(user_id, brand_id)`. The off-chain mirror of on-chain BrandNodes.
- **`point_transactions`** — `id, node_id, points_added, sui_tx_digest (UNIQUE), created_at`. Audit log; every earn event records the on-chain proof.
- **`blockchain_events`** — `id, event_type, payload (JSONB), tx_digest, processed, created_at`. Raw event log from Sui RPC subscription. Currently populated but not actively consumed; future-proofing for crash recovery.

## Migrations (in order)

- **`002_loyalty_avatar_schema.sql`** — drops the original `loyalty_cards`, creates `loyalty_avatars` and `loyalty_brand_nodes`, redefines `point_transactions` to reference brand nodes. Run during the Owned-to-Shared migration.
- **`003_add_avatar_and_printed.sql`** — adds `users.avatar_object_id` and `qr_tokens.printed`.
- **`004_brand_portal.sql`** — adds `brand_members` (the role table) and `redemption_requests` (pending/fulfilled/cancelled lifecycle), plus a `pending_redemptions_view` for the operator dashboard. The bootstrap comments at the bottom show how to grant the first owner manually.
- **`005_sessions_and_brands.sql`** — adds the `session` table for connect-pg-simple, `users.google_sub` for reliable user identification, and brand self-service columns (`description`, `owner_user_id`, `slug`, `is_active`).
- **`006_add_campaign_name.sql`** (in `database/`) — adds `qr_tokens.campaign_name` for the campaign-filter feature in the merchant terminal.

**Total tables in the live database: 9** (the seven from schema.sql plus `brand_members`, `redemption_requests`, `session`).

---

# PART 5 — INFRASTRUCTURE

## `.github/workflows/contracts.yml`

Triggered on `contracts/**` changes. Installs Sui CLI v1.44 from the GitHub release, runs `sui move build` then `sui move test`. Uploads `contracts/build/` as an artefact for inspection.

## `.github/workflows/backend.yml`

Triggered on `backend/**` changes. Installs npm deps, runs `tsc --noEmit`, then `npm run test:coverage`. CI env values are explicit placeholders (no real secrets). Uploads `backend/coverage/` as an artefact.

## `.github/workflows/frontend.yml`

Triggered on `frontend/**` changes. Installs deps, runs `tsc --noEmit`, then `npm run build`. `GOOGLE_CLIENT_ID` from GitHub Secrets. Uploads `frontend/.next/` as an artefact.

## `backend/jest.config.ts`

ESM-aware (`preset: 'ts-jest/presets/default-esm'`, `extensionsToTreatAsEsm: ['.ts']`). Path mapping rewrites `.js` imports to `.ts` for Jest. `testMatch: '**/src/__tests__/**/*.test.ts'`. Coverage from all `src/**/*.ts` except `server.ts` (which is mostly side-effecting Express setup). **`coverageThreshold: { global: { lines: 80 } }`** enforces the contracted target on backend.

## `backend/tsconfig.json` and `frontend/tsconfig.json`

Both have `strict: true`. Backend additionally has `noUncheckedIndexedAccess: true` and `exactOptionalPropertyTypes: true` — the strictest practical settings, which is why the 37 known errors exist in `redemption.service.ts` and `report.service.ts`.

## `frontend/next.config.ts`

`allowedDevOrigins` includes the dev machine's LAN IP for phone testing. `turbopack: { root: __dirname }` for the new Turbopack dev server. `rewrites` proxies `/api/*` to `http://127.0.0.1:3000/api/*` so the frontend can call the backend without CORS.

## `.gitignore`s

- Root `.gitignore` (added today) — defence-in-depth for `.env`, `.env.*`, `*.pem`, secrets directory, plus the usual build/OS noise.
- `backend/.gitignore` — `node_modules`, `.env`, build dirs.
- `frontend/.gitignore` — full Next.js boilerplate gitignore plus `!.env.local.example`, `!.env.example` whitelists.

## `.env.example` files

Both `backend/.env.example` and `frontend/.env.local.example` (added today) document the variables a contributor needs to set, with placeholder values and explanatory comments about which secrets belong where.

---

# PART 6 — Cross-cutting flows

These are the "explain how X works end-to-end" flows. Each is a 60-second answer to a likely supervisor question.

## 6.1 The full QR scan flow

> Customer opens `/scan`. Camera initialises via `navigator.mediaDevices.getUserMedia` with rear-facing preference. Each animation frame is drawn to a hidden canvas, pixel data extracted, fed to jsQR with `inversionAttempts: "attemptBoth"`. When a code is detected, the loop stops and `validateToken` POSTs to `/api/qr/validate` with `{ token_uuid, user_id }`.
>
> Backend's `server.ts` handler validates UUID format with a regex (rejects SQL injection, non-UUIDs, empty strings), resolves a wallet address to internal user_id if needed, then calls `qr.service.validateQRToken`. That function runs the atomic UPDATE on `qr_tokens` to mark used — only the first concurrent request succeeds. Then it branches on whether the user has an avatar.
>
> First-ever scan: `mintAvatarOnChain` creates a Shared LoyaltyAvatar via PTB, returns its object ID. Insert into `loyalty_avatars`. Then `addBrandToAvatarOnChain` attaches a fresh BrandNode. Insert into `loyalty_brand_nodes`. Then `addBrandPointsOnChain` runs a PTB with two moveCalls — `add_brand_points` and `gain_experience` — both gated by AdminCap. One gas payment.
>
> Returning customer with existing brand: just `addBrandPointsOnChain`. Returning customer at a new brand: `addBrandToAvatarOnChain` + `addBrandPointsOnChain`.
>
> The off-chain mirror in `loyalty_brand_nodes` is updated with the new balance, scan_count, and tier. An audit row is inserted into `point_transactions` with the Sui transaction digest. The enriched token is returned to the frontend, which shows a success message and the points awarded.

## 6.2 The OAuth / zkLogin flow

> Customer clicks "Sign in with Google" on `/customer`. Frontend POSTs to `/api/auth/zklogin` with `returnUrl: origin + "/customer"`. Backend fetches the current Sui epoch, generates an Ed25519 ephemeral keypair (valid for 10 epochs), constructs a nonce, and builds a Google OAuth URL with the nonce embedded and the returnUrl in `state`. Returns the URL plus the ephemeral public material.
>
> Frontend stashes the ephemeral material in localStorage and redirects to the Google URL. User signs in with Google. Google redirects to `/api/auth/callback?code=...&state=http://localhost:3001/customer`.
>
> Backend's GET callback exchanges the code with Google for an id_token (JWT). Verifies the JWT signature against Google's JWKS (cryptographic root of trust). Extracts the `sub` claim. Computes `salt = HMAC-SHA256(ZKLOGIN_SALT_SECRET, sub)`. Computes `suiAddress = jwtToAddress(jwt, salt)` via the Mysten zkLogin SDK — this generates a zero-knowledge proof that the JWT is valid without revealing JWT contents on-chain.
>
> Upserts the user into `users` table with the derived address. Sets the server-side session. Redirects the browser to the `state` URL with `?address=&name=` appended. Frontend reads the URL params, saves to localStorage, forwards to `/dashboard`.
>
> Same Google account always produces the same Sui address. No wallet, no seed phrase, no cryptocurrency.

## 6.3 The redemption flow

> Customer clicks Redeem on a brand card in `/dashboard`. Frontend opens RedeemModal with category-aware rewards (cafe brands offer drinks, retail brands offer credit, etc.). Customer picks a reward and confirms. Frontend POSTs to `/api/redeem` with `{ user_address, brand_id, points_to_redeem, reward_name }`.
>
> Backend's `createRedemptionRequest` runs inside a transaction: SELECT FOR UPDATE on the customer's `loyalty_brand_nodes` row (locks against concurrent reads); verify balance ≥ points; UPDATE balance subtracting the points; INSERT a row into `redemption_requests` with `status = 'pending'`. Commit. Returns the new request.
>
> Brand operator opens `/merchant`, selects the brand, sees the pending row in PendingRedemptionsPanel (auto-refreshes every 15s). Operator clicks Fulfil → POST `/api/brand/:brand_id/redemptions/:request_id/fulfil` → `markFulfilled` flips status atomically. Or clicks Cancel → `markCancelled` flips status AND refunds points back to the brand node, also atomically.
>
> The redemption is currently off-chain only. The on-chain `record_redemption` Move function exists and has tests, but isn't called from the dashboard flow yet — declared as future work in the Audit. The LPT fungible token in `loyalty_token.move` is the canonical substrate for cross-brand on-chain redemption when that is wired up.

---

# PART 7 — Quick reference: file-by-file summary

If the supervisor lands on a specific file, here's the one-line pitch.

| File | One-line role |
| --- | --- |
| `contracts/sources/loyalty_nft.move` | Universal Avatar NFT + BrandNode dynamic fields + AdminCap |
| `contracts/sources/loyalty_token.move` | LPT fungible currency + per-brand BrandTreasury + DistributorCap |
| `contracts/tests/loyalty_nft_tests.move` | 25 tests covering the avatar lifecycle |
| `contracts/tests/loyalty_token_tests.move` | 11 tests covering treasury and distribution |
| `backend/src/server.ts` | Express entry point, ~20 endpoints, auth + sessions + JWKS |
| `backend/src/services/zklogin.service.ts` | HMAC salt + jwtToAddress + ephemeral keypair |
| `backend/src/services/qr.service.ts` | The QR validation orchestrator — atomic UPDATE + chain mutations + audit |
| `backend/src/services/blockchain.service.ts` | All Sui RPC calls, PTB construction, sponsored signing |
| `backend/src/services/nft.service.ts` | Wallet → on-chain avatar lookup via DB + RPC |
| `backend/src/services/redemption.service.ts` | Pending/fulfilled/cancelled lifecycle for off-chain redemption |
| `backend/src/services/report.service.ts` | PDFKit-streamed brand campaign reports |
| `backend/src/middleware/brandAuth.ts` | Session + brand membership + role lookup |
| `backend/src/routes/brand.routes.ts` | All `/api/brand/*` operator endpoints |
| `backend/src/config/database.ts` | Process-wide pg.Pool |
| `backend/src/__tests__/` | 32 backend tests, jest with `lines: 80` threshold |
| `database/schema.sql` | 7 base tables |
| `backend/migrations/002–005` + `database/006_*` | Schema evolution: avatars, printed, brand portal, sessions, campaigns |
| `frontend/src/app/page.tsx` | Audience picker landing |
| `frontend/src/app/customer/page.tsx` | Consumer Google Sign-In |
| `frontend/src/app/dashboard/page.tsx` | Per-brand cards + global stats + redemption modal + settings |
| `frontend/src/app/scan/page.tsx` | jsQR camera scanner |
| `frontend/src/app/merchant/page.tsx` | Brand portal: signin → no_access → picker → dashboard |
| `frontend/next.config.ts` | API proxy + Turbopack config |
| `.github/workflows/{contracts,backend,frontend}.yml` | Three CI pipelines |
| `Move.lock` + `Published.toml` | Pinned dependencies + canonical deployment record |
| `LICENSE` | Apache 2.0 |
| `.gitignore` (root) | Defence-in-depth secrets + build noise |
| `backend/.env.example` + `frontend/.env.local.example` | Templates for new contributors |
| `Walkthrough_Prep.md` | High-level walkthrough prep (architecture + Q&A) |
| `Code_Tour.md` | This document — function-by-function reference |
| `SuiLoyalty_Contract_Alignment_Audit.docx` | Self-assessment against the signed contract |
| `Migration_Summary.md` | Owned-to-Shared migration record |
| `TEST_DOCUMENTATION.md` | Test catalogue (currently understates count — 36 actual Move tests, doc says 32) |
| `SuiLoyalty_Sprint{1..4}_Journal.docx` | Per-sprint journals |
| `SuiLoyalty_Database_Design.docx` | Database design rationale (currently stale — see talking points) |
| `SuiLoyalty_Report_Outline.docx` | 11,000-word report blueprint |
| `docs/architecture.html` | System architecture + class diagram + ER diagram |
| `docs/deployment.html` | Full deployment guide + secrets policy |
| `docs/sequence-flows.html` | OAuth, scan, replay, merchant flows as sequence diagrams |

---

## Final note

This document plus `Walkthrough_Prep.md` covers the entire codebase at two levels: high-level architecture and rationale (prep doc) and function-by-function (this doc). Between them, you can answer any question the supervisor asks, regardless of where in the code he lands.

You know this code. Walk in tomorrow and let it speak.
