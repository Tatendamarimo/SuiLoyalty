# SuiLoyalty — Test Documentation

**Sprint 4 Test Suite**
Author: Tatenda Marimo
Date: 2026-04-19
Status: All 63 tests passing

---

## Overview

| Layer | File | Tests | Result |
|-------|------|-------|--------|
| Move (on-chain) | `loyalty_nft_tests.move` | 21 | PASS |
| Move (on-chain) | `loyalty_token_tests.move` | 11 | PASS |
| Backend unit | `zklogin.service.test.ts` | 11 | PASS |
| Backend unit | `qr.service.test.ts` | 11 | PASS |
| Backend security | `api.security.test.ts` | 9 | PASS |
| **Total** | | **63** | **PASS** |

---

## Part 1 — Move Smart Contract Tests

Run with: `sui move test` from `/contracts`

### 1.1 `loyalty_nft_tests.move`

Tests the `loyalty_nft` module — the core on-chain module managing `LoyaltyAvatar` NFTs and their composable `BrandNode` attribute trees built with Dynamic Object Fields and Dynamic Fields.

Every test initialises the module with `init_for_testing` to obtain an `AdminCap`, creates a `LoyaltyAvatar`, and verifies state changes after each operation.

---

#### Avatar Creation

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 1 | `test_create_avatar_defaults` | Calls `create_avatar` and checks initial state | `level=1`, `experience=0`, `locked=false` |
| 2 | `test_mint_avatar_shares_object` | Calls `mint_avatar` entry function | Does not abort; object is shared |

---

#### Brand Management

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 3 | `test_add_brand_exists` | Adds a single brand to an avatar | `has_brand` returns `true` for added brand |
| 4 | `test_add_multiple_brands` | Adds two different brands | Both brands present on avatar |
| 5 | `test_add_duplicate_brand_fails` | Adds the same brand name twice | Aborts with `EBrandAlreadyExists` |
| 6 | `test_remove_brand` | Adds then removes a brand | `has_brand` returns `false` after removal |
| 7 | `test_remove_nonexistent_brand_fails` | Removes a brand that was never added | Aborts with `EBrandNotFound` |

---

#### Points and Tier Progression

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 8 | `test_add_brand_points_bronze` | Awards 100 points to a brand | `points=100`, `tier=0` (100/500=0) |
| 9 | `test_add_brand_points_tier_up` | Awards 500 then 500 more points | After 500: `tier=1`; after 1000: `tier=2` |
| 10 | `test_add_points_to_missing_brand_fails` | Calls `add_brand_points` with no brand on avatar | Aborts with `EBrandNotFound` |

---

#### Experience and Level

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 11 | `test_gain_experience_no_level_up` | Gains 500 XP | `experience=500`, `level=1` (1+500/1000=1) |
| 12 | `test_gain_experience_level_up` | Gains 1000 then 2000 more XP | After 1000: `level=2`; after 3000 total: `level=4` |

---

#### Attributes (Dynamic Fields on BrandNode)

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 13 | `test_add_and_read_attribute` | Adds attribute `speed=75` to a brand node | `has_attribute` true; `attribute_value=75` |
| 14 | `test_update_attribute` | Adds `endurance=30` then updates to `95` | `attribute_value=95` |
| 15 | `test_remove_attribute` | Adds then removes attribute `style` | `has_attribute` returns `false` |
| 16 | `test_add_duplicate_attribute_fails` | Adds the same attribute key twice | Aborts with `EAttributeAlreadyExists` |
| 17 | `test_update_missing_attribute_fails` | Updates an attribute that was never added | Aborts with `EAttributeNotFound` |

---

#### Lock / Unlock

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 18 | `test_lock_and_unlock` | Locks then unlocks an avatar | `is_locked=true` after lock; `false` after unlock |
| 19 | `test_add_brand_while_locked_fails` | Tries to add a brand to a locked avatar | Aborts with `EAvatarLocked` |
| 20 | `test_gain_experience_while_locked_fails` | Tries to gain XP on a locked avatar | Aborts with `EAvatarLocked` |

---

#### Full Lifecycle

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 21 | `test_full_lifecycle` | Creates avatar → adds brand → adds 500 pts → adds attribute → gains 1000 XP → locks → unlocks → removes brand | All state transitions correct in sequence |

---

### 1.2 `loyalty_token_tests.move`

Tests the `loyalty_token` module — manages fungible `LOYALTY_TOKEN` coins, per-brand treasuries, and controlled distribution to consumers.

---

#### Module Initialisation

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 1 | `test_init_creates_admin_cap_and_treasury_cap` | Calls `init_for_testing` | Both `TokenAdminCap` and `TreasuryCap<LOYALTY_TOKEN>` transferred to sender |

---

#### Treasury Creation

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 2 | `test_create_brand_treasury` | Admin creates a brand treasury | Returns a `DistributorCap`; treasury is shared |

---

#### Minting

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 3 | `test_mint_to_treasury_increases_balance` | Mints 1000 tokens into treasury | `treasury_balance=1000`; `total_deposited=1000` |
| 4 | `test_mint_zero_fails` | Mints 0 tokens | Aborts with `EZeroAmount` |

---

#### Token Distribution

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 5 | `test_distribute_tokens_to_consumer` | Sponsor distributes 100 of 500 tokens | Balance drops to 400; `total_distributed=100`; consumer receives coin |
| 6 | `test_distribute_exceeds_balance_fails` | Distributes 100 when only 50 available | Aborts with `EInsufficientTreasuryBalance` |
| 7 | `test_distributor_wrong_treasury_fails` | Uses DistributorCap from Brand1 against Brand2's treasury | Aborts with `EDistributorMismatch` |
| 8 | `test_distribute_zero_fails` | Distributes 0 tokens | Aborts with `EZeroAmount` |

---

#### Admin Withdrawal

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 9 | `test_admin_withdraw_from_treasury` | Admin withdraws 100 of 300 tokens | Balance drops to 200 |
| 10 | `test_admin_withdraw_exceeds_balance_fails` | Withdraws 999 when balance is 50 | Aborts with `EInsufficientTreasuryBalance` |

---

#### View Functions

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 11 | `test_view_functions` | Reads all getters on a fresh treasury | `brand_name`, `brand_owner`, `balance=0`, `total_deposited=0`, `total_distributed=0` all correct |

---

## Part 2 — Backend TypeScript Tests

Run with: `npm test` from `/backend`
Command: `NODE_OPTIONS=--experimental-vm-modules jest --config jest.config.ts`

All external dependencies (PostgreSQL pool, blockchain service, Sui RPC) are mocked using `jest.unstable_mockModule` before any service modules are imported. This ensures tests run without a live database or Sui node.

---

### 2.1 `zklogin.service.test.ts`

Tests the pure cryptographic functions in `zklogin.service.ts`. No mocking required — these functions only use `crypto` (Node built-in) and `@mysten/zklogin` (offline crypto).

---

#### `deriveSalt`

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 1 | Produces 64-char hex output | Calls `deriveSalt` with any subject | Returns a string matching `/^[0-9a-f]{64}$/` |
| 2 | Is deterministic | Calls `deriveSalt` twice with same subject | Both outputs are identical |
| 3 | Different subjects produce different salts | Calls with `user-001` and `user-002` | Outputs differ |
| 4 | Changes when secret changes | Temporarily overrides `ZKLOGIN_SALT_SECRET` | Salt for same subject differs |

---

#### `generateEphemeralKeypair`

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 5 | Returns required fields | Calls with epoch 42 | Object has `nonce`, `maxEpoch`, `randomness`, `ephemeralPublicKey` |
| 6 | maxEpoch is currentEpoch + 10 | Calls with epoch 42 | `maxEpoch = 52` |
| 7 | Nonce is non-empty string | Checks nonce type and length | `typeof nonce === 'string'` and `length > 0` |
| 8 | PublicKey is valid base64 | Tries to decode `ephemeralPublicKey` | `Buffer.from(key, 'base64')` does not throw |
| 9 | Generates unique nonce each call | Calls twice with same epoch | The two nonces are different |

---

#### `getEphemeralKeypair`

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 10 | Retrieves stored keypair by nonce | Calls `generate` then `get` with returned nonce | Returns object with correct `maxEpoch` |
| 11 | Returns undefined for unknown nonce | Calls `get` with arbitrary string | Returns `undefined` |

---

### 2.2 `qr.service.test.ts`

Tests `qr.service.ts` — the service responsible for generating single-use QR tokens and validating them with full blockchain integration.

The service uses two database access patterns which are mocked separately:
- `pool.query(...)` — used by `generateQRToken` (direct query)
- `pool.connect()` → `client.query(...)` — used by `validateQRToken` (transactional)

---

#### `generateQRToken`

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 1 | Inserts row and returns token | Calls with no arguments | Executes `INSERT INTO qr_tokens`; `brand_id=null`; `points_value=10` |
| 2 | Passes brand_id and points_value | Calls with `(BRAND_ID, 50)` | SQL params include provided brand_id and 50 |

---

#### `validateQRToken` — Replay Prevention (Sprint 4 Security)

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 3 | Rejects already-used token | Mock UPDATE returns 0 rows | Throws `"Token is invalid, already used, or expired"` |
| 4 | Atomic UPDATE SQL contains double-spend guard | Inspects the raw SQL string sent to the DB | SQL contains `used = FALSE` and `expires_at IS NULL OR expires_at > NOW()` |

---

#### `validateQRToken` — Happy Path

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 5 | No-brand token returns null tx_digest | Token has `brand_id=null` | Returns token with `tx_digest=null`; no blockchain calls made |
| 6 | New user: full mint flow | No avatar in DB for user | Calls `mintAvatarOnChain` → `addBrandToAvatarOnChain` → `addBrandPointsOnChain` in sequence |
| 7 | Returning user: points only | Avatar and brand node both exist | Skips mint and add_brand; only calls `addBrandPointsOnChain` |

---

#### `validateQRToken` — Error Handling

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 8 | Blockchain failure propagates | `mintAvatarOnChain` rejects | Service rethrows with `"Sui node unreachable"` |
| 9 | Missing wallet address | User record has `wallet_address=null` | Throws `"Unable to mint avatar: User has no wallet address"` |

---

### 2.3 `api.security.test.ts`

HTTP-level integration tests using `supertest`. A minimal Express app is built in `beforeAll` mounting the real route handlers against mocked services.

---

#### `POST /api/qr/generate`

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 1 | Returns 201 on success | Mock DB returns one row | `status=201`, `body.success=true` |
| 2 | Returns 500 when DB throws | Mock DB rejects | `status=500`, `body.success=false` |

---

#### `POST /api/qr/validate`

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 3 | Returns 400 when token_uuid missing | Body only has `user_id` | `status=400`; error mentions `token_uuid` |
| 4 | Returns 400 when user_id missing | Body only has `token_uuid` | `status=400`; error mentions `user_id` |

---

#### UUID Format Validation (Security)

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| 5 | Accepts valid UUID | Sends well-formed UUID | `status=200` |
| 6 | Rejects SQL injection | Sends `'; DROP TABLE qr_tokens; --` as token_uuid | `status=400`; error `"Invalid QR code"` |
| 7 | Rejects non-UUID string | Sends `"not-a-uuid"` | `status=400` |
| 8 | Rejects empty string | Sends `token_uuid=""` | `status=400` |
| 9 | Rejects UUID with trailing characters | Sends valid UUID + `"extra"` | `status=400` |

---

## Test Infrastructure

### Move
- Framework: `sui::test_scenario`
- Pattern: multi-transaction scenario simulating real object ownership and capability passing
- Error testing: `#[expected_failure(abort_code = ...)]` attribute

### Backend
- Framework: Jest 30 with `ts-jest` (ESM mode)
- HTTP testing: `supertest`
- Mock strategy: `jest.unstable_mockModule` + `await import()` for ESM-safe dependency injection
- Run command: `NODE_OPTIONS=--experimental-vm-modules jest --config jest.config.ts`
- Coverage command: `npm run test:coverage`

### Error Constants Referenced in Move Tests

| Constant | Value | Module |
|----------|-------|--------|
| `EBrandAlreadyExists` | 1 | `loyalty_nft` |
| `EBrandNotFound` | 2 | `loyalty_nft` |
| `EAttributeAlreadyExists` | 3 | `loyalty_nft` |
| `EAttributeNotFound` | 4 | `loyalty_nft` |
| `EAvatarLocked` | 5 | `loyalty_nft` |
| `EInsufficientTreasuryBalance` | 100 | `loyalty_token` |
| `EDistributorMismatch` | 101 | `loyalty_token` |
| `EZeroAmount` | 102 | `loyalty_token` |
