# SuiLoyalty — Supervisor Code Walkthrough Prep

**For the meeting on:** 6 May 2026
**Project:** SuiLoyalty — Blockchain-Powered Dynamic NFT Loyalty System with zkLogin
**Live testnet tx (proof):** `4coLY5kehLf9ijrB6ms9oWMM6Ax8KVQ4vuQKrEqtug2R`
**Move package:** `0x69c2b0f58fed8ceb70bad56e56867486a88d9328f6d8ddbe15fd5c4232be404c`

This document is for you, not the supervisor. Read it tonight. Reference it during the meeting if you need to.

---

## 1. The 90-second opening

Use this before he opens the laptop. Sets your framing for the meeting.

> SuiLoyalty is a multi-brand blockchain loyalty system on Sui. The core thesis is that blockchain loyalty has been theoretically possible for years but practically undeployable, because every existing system requires the consumer to install a wallet, write down a seed phrase, and buy gas tokens. Studies show over 90% of users abandon apps at that point. SuiLoyalty solves this with two technical decisions: zkLogin, which derives a Sui address deterministically from a Google Sign-In via zero-knowledge proofs, so the consumer signs in with the Google button they already know; and sponsored transactions, where the brand pays all gas, so the consumer never touches cryptocurrency.
>
> Each customer's loyalty card is a real on-chain NFT — a Universal Avatar that grows BrandNode dynamic object fields as they engage with more brands. Every QR scan triggers a sponsored Sui transaction that mints, attaches, or updates the avatar. The full stack is live on Sui testnet; transaction `4coLY5...ug2R` is cryptographic proof.
>
> I'll walk through the smart contracts first, then the backend orchestration, then the two frontend audiences — customer and brand operator.

Read it once or twice. Don't memorise it word-for-word; remember the beats: **problem → why blockchain failed → two decisions (zkLogin + sponsored) → Universal Avatar → live proof.**

---

## 2. The three architectural pillars

These are the three decisions Dr Al-Ibaisi probed in Meetings #3 and #4. He will probe them again. You should be able to defend each one in 60 seconds.

### Pillar 1 — Owned-to-Shared object migration

**What it is.** The `LoyaltyAvatar` is a Sui Shared Object, not Owned by the customer.

**Why it had to change.** In the Sui object model, the backend cannot mutate an Owned Object — only the owner can sign for it. The original design had each customer own their own Avatar, but that meant every QR scan would have required the customer to sign a transaction, killing the seamless UX. We migrated to Shared Object so the backend can mutate any avatar without per-scan customer signatures.

**The trade-off.** Shared means publicly mutable in principle, so we needed a security primitive — that's Pillar 2.

**Where it lives.** `loyalty_nft.move:160` (`mint_avatar` calls `transfer::share_object`). Documented in `Migration_Summary.md`.

### Pillar 2 — AdminCap as the security primitive

**What it is.** A capability object granted only to the backend wallet on module init. Every mutative function in `loyalty_nft.move` requires `&AdminCap` as its first parameter.

**Why this works.** Move's type system enforces that `AdminCap` cannot be forged. Whoever holds the AdminCap can mutate avatars; nobody else can. The backend holds it exclusively, so even though avatars are publicly readable Shared Objects, only authorised QR scans can change them.

**The pattern.** This is the Capability pattern — same idea as object capabilities in OS security. Sui's type system is strong enough to enforce it natively.

**Where it lives.** `loyalty_nft.move:39–41` (the struct), `loyalty_nft.move:118–122` (granted in `init`), and every mutative function takes `_: &AdminCap` as its first argument.

### Pillar 3 — Universal Avatar with BrandNode dynamic object fields

**What it is.** One Avatar per customer. Each brand the customer engages with attaches as a `BrandNode` via a Dynamic Object Field — a Sui mechanism for attaching child objects to a parent at runtime, keyed by an arbitrary `BrandKey`.

**Why this design instead of one NFT per brand.** The contract's own background section identifies the problem as customers being enrolled in 16+ loyalty programmes but using fewer than half — fragmentation. A per-brand-NFT design replicates that fragmentation on-chain. The Universal Avatar is one identity with many relationships, with global level and experience that span all brands. It's a more direct answer to the stated problem.

**The trade-off.** Increased Move complexity (dof handling, BrandKey discriminants, no-duplicate-brand assertion, mirror schema in PostgreSQL with separate `loyalty_avatars` and `loyalty_brand_nodes` tables instead of a flat `loyalty_cards` table).

**Where it lives.** `loyalty_nft.move:48–62` (the structs). `BrandNode` itself can hold further dynamic fields for per-brand attributes like "speed", "endurance" — second-level composability.

---

## 3. File-by-file tour

Walk him through in this order. Each item has the file path, what it does, and one sentence on why it exists.

### Smart contracts (`contracts/`)

**`sources/loyalty_nft.move`** — Core module. `LoyaltyAvatar` (Shared Object), `BrandNode` (DOF), `AdminCap`, plus events for every state change. Brand tier is computed as `points / 500` so it auto-promotes; XP is global across brands.

**`sources/loyalty_token.move`** — Fungible LPT currency, separate module. `BrandTreasury` (Shared Object) holds each brand's allocation; `DistributorCap` authorises a sponsor address to distribute from a specific treasury. Currently deployed but not wired into the redemption flow — declared as future work in the Audit. Be honest about this.

**`tests/loyalty_nft_tests.move`** — 25 `#[test]` functions covering avatar lifecycle, brand add/remove, points/tier, redemption monotonicity, attribute add/update/remove, lock/unlock, and a full lifecycle integration test.

**`tests/loyalty_token_tests.move`** — 11 tests covering treasury creation, minting, distribution, distributor mismatch, admin withdraw, and view functions.

**Total: 36 Move tests, all passing.**

**`Move.toml` + `Move.lock`** — package manifest pinned to Sui Framework on testnet. `Published.toml` records the live deployment package ID.

### Backend (`backend/src/`)

Walk in this order — it follows the request flow.

**`server.ts`** — Express 5 entry point. ~20 endpoints across: health, zkLogin auth (POST + GET callback), brand management, QR generate/validate/mark-printed/clear-unprinted/inventory, user/NFT/cards/transactions reads, redemption, account deletion. Helmet for headers, CORS, PostgreSQL-backed sessions via `connect-pg-simple`, Google JWKS for cryptographic JWT verification.

**`services/zklogin.service.ts`** — Three pure functions: `deriveSalt(googleSub)` returns HMAC-SHA256 of the secret + sub; `computeSuiAddress(jwt, salt)` calls Mysten Labs' `jwtToAddress` to derive the on-chain address; `generateEphemeralKeypair(epoch)` creates the per-session signing keypair. The salt derivation is deterministic — same Google account always gives the same Sui address. That's the property that makes a wallet redundant.

**`services/qr.service.ts`** — Two functions: `generateQRToken` inserts a fresh UUID; `validateQRToken` is the orchestrator — atomic UPDATE for replay prevention, then mint avatar if needed, attach BrandNode if needed, award points + XP, mirror to PostgreSQL, record audit row.

**`services/blockchain.service.ts`** — All Sui RPC calls live here. `mintAvatarOnChain`, `addBrandToAvatarOnChain`, `addBrandPointsOnChain` (which bundles `add_brand_points` + `gain_experience` in one PTB), `recordRedemptionOnChain`, `getAvatarByObjectId`. Uses Programmable Transaction Blocks so multiple Move calls land in one atomic transaction with one gas payment.

**`services/redemption.service.ts`** — Pending/fulfilled/cancelled lifecycle. Customer redemption creates a pending row, brand operator fulfils or cancels. Cancel refunds the points atomically.

**`services/report.service.ts`** — PDFKit-streamed brand campaign reports. Brand-coloured header, two rows of summary tiles (QR lifecycle + redemption metrics), per-code activity table.

**`middleware/brandAuth.ts`** — Brand-portal authentication. Reads `req.session.userId` set by the OAuth callback, looks up `brand_members` for `:brand_id` URL param, sets `req.brandRole` to owner/admin/operator.

**`routes/brand.routes.ts`** — All `/api/brand/*` endpoints, gated by `requireBrandAuth`.

**`__tests__/`** — 32 backend tests across zklogin pure crypto (12), qr.service mock-based (9), and HTTP-level security with supertest (11). Jest with `lines: 80` coverage threshold.

### Frontend (`frontend/src/app/`)

**`page.tsx`** — Audience picker at `/`. Two cards — Customer / Brand operator — each routing to its sign-in. New as of today; replaces the previous consumer-only landing.

**`customer/page.tsx`** — Consumer Google Sign-In via zkLogin. Sends `returnUrl: origin + "/customer"` so the OAuth `state` round-trips. On callback it reads `?address=` from the URL, saves to localStorage, forwards to `/dashboard`.

**`dashboard/page.tsx`** — Per-brand loyalty cards (sorted by points desc), Avatar Level + XP global stats, redemption modal with category-aware rewards, transaction history, settings panel with delete-account.

**`scan/page.tsx`** — Camera QR scanner using `jsQR`. Calls `getUserMedia({ facingMode: "environment" })`, draws each frame to a canvas, decodes with `inversionAttempts: "attemptBoth"` for robustness against printed QR contrast.

**`merchant/page.tsx`** — Brand-operator portal. Auth state machine: signin → no_access → brand_picker → dashboard. Inside the dashboard: header with brand colour + role badge, summary tiles, pending-redemption queue (auto-refresh every 15s), inventory panel, ReportExportCard (PDF + CSV), QR generation card with batch + mark-printed flow.

### Database (`database/`, `backend/migrations/`)

**`schema.sql`** — 7 base tables: users, brands, qr_tokens, loyalty_avatars, loyalty_brand_nodes, point_transactions, blockchain_events.

**Migrations** — 002 (avatar+brand_nodes refactor), 003 (printed flag), 004 (brand_portal: brand_members + redemption_requests + pending_redemptions_view), 005 (sessions table + brand self-service columns), 006 (campaign_name on qr_tokens). Plus a session table created by `connect-pg-simple`.

**Total: 9 tables.** The doc on disk says 7 — that's a known gap, see Section 5.

### CI (`.github/workflows/`)

**`contracts.yml`** — Install Sui CLI v1.44, `sui move build`, `sui move test`. Path-filtered.

**`backend.yml`** — `npm ci`, `tsc --noEmit`, `npm run test:coverage`. Coverage uploaded as artefact.

**`frontend.yml`** — `npm ci`, `tsc --noEmit`, `npm run build`. `GOOGLE_CLIENT_ID` from GitHub Secrets.

### Documentation (`docs/`)

`architecture.html`, `deployment.html` (now with a Secrets Policy section), `sequence-flows.html`. Plus the three drawio diagrams in `docs/diagrams/`.

---

## 4. Anticipated questions

These are based on Dr Al-Ibaisi's pattern from prior meetings and the rubric.

### Why blockchain at all? Could PostgreSQL do this?

**Strong answer.** "Honestly, for the earn flow, PostgreSQL alone is faster and cheaper. The reason blockchain matters here is the trust property: an off-chain points balance can be silently revoked, expired, or modified by the brand. An on-chain points balance with a monotonically-increasing-only counter and an immutable audit log cannot. The contract that runs the loyalty rules cannot be silently changed after deployment. That's the genuine value blockchain adds — not speed, not cost, but trust under adversarial conditions like brand exit, brand acquisition, or unilateral rule changes. The Critical Reflection chapter will say this directly."

### Why Sui specifically over Ethereum?

**Strong answer.** "Two reasons. First, Sui's object model lets you mutate an NFT's data directly via Dynamic Object Fields without re-creating it, which costs sub-cent per transaction. On Ethereum, mutating an NFT means destroying and recreating it, which can cost $5–50 each time — impractical for a loyalty system where updates happen on every scan. Second, zkLogin. It was released by Mysten Labs in 2024 and is currently Sui-exclusive; Ethereum has nothing equivalent at the protocol level. Without zkLogin, the project's central thesis — that blockchain loyalty can avoid the wallet barrier — is unprovable."

### How does zkLogin actually work?

**Strong answer.** "The customer signs in with Google. Google issues a JWT with a `sub` claim that uniquely identifies that user. The backend HMACs the `sub` with a server-side secret to produce a deterministic salt. We then call `jwtToAddress(jwt, salt)` from the Mysten Labs SDK, which generates a Sui address using a zero-knowledge proof that the JWT is valid without revealing the JWT contents on-chain. Same Google account always gives the same address; the customer never holds a private key, so there's nothing to lose. The backend signs all transactions with its sponsor key, so the customer never pays gas either."

### How do you prevent QR replay?

**Strong answer.** "Atomic PostgreSQL UPDATE." Show them `qr.service.ts:53–61`:

```sql
UPDATE qr_tokens SET used = TRUE, used_by = $2, used_at = NOW()
WHERE token_uuid = $1 AND used = FALSE
  AND (expires_at IS NULL OR expires_at > NOW())
RETURNING *;
```

"PostgreSQL's row-level locking guarantees only one concurrent request can flip `used` from FALSE to TRUE. Any second request gets zero rows back and is rejected with HTTP 400. There's no race condition possible at the SQL level." If he asks about UUID format injection, point him at `server.ts:590–593` — the regex check that rejects non-UUID strings before any DB query.

### Why a Shared Object instead of Owned?

**Strong answer.** "Sui's ownership model means the backend can only mutate objects that are Owned by the backend wallet or are Shared. If we made the avatar Owned by the customer, every QR scan would require a customer signature — destroying the frictionless UX. Owned by the backend would mean the customer doesn't really 'own' their loyalty card, which contradicts the trust property we're trying to demonstrate. Shared with AdminCap is the right answer: the avatar is publicly auditable on-chain, only the backend can write to it, the customer never has to sign anything. The migration from Owned to Shared happened mid-Sprint 4 and is documented in `Migration_Summary.md` — it was the most significant architectural decision in the project and I learned the most from it."

### What does AdminCap protect against?

**Strong answer.** "Anyone permissionlessly mutating Shared Objects. Shared Objects in Sui are publicly mutable in principle — anyone can construct a transaction that references them. AdminCap closes that hole at the type level: the Move compiler enforces that every mutative function takes `_: &AdminCap` as its first parameter, and AdminCap is granted only to the backend wallet on module init. There's no way to forge or transfer it without the type system catching it."

### Why one NFT per customer instead of one per brand?

**Strong answer.** Use Pillar 3 from Section 2 above.

### How comprehensive is your testing?

**Strong answer.** "68 automated tests across the stack. 36 Move tests run via `sui move test` covering avatar lifecycle, points and tier, redemption invariants, attribute composition, lock/unlock semantics, and a full integration scenario. 32 backend tests across pure cryptographic functions, the QR validation transaction, and HTTP-level security including SQL injection and UUID format validation. Coverage threshold of 80% on backend is enforced in jest config. CI runs all of this on every push." If he asks about Move coverage specifically, be honest: "The contract names >80% as a target. I haven't formally measured the Move coverage yet — `sui move test --coverage` is on the punch list before submission."

### How does the brand operator portal differ from the consumer app?

**Strong answer.** Show him the audience picker at `/`. "Two distinct sign-in flows that both use the same zkLogin Google authentication. The consumer flow goes to a customer dashboard with their loyalty cards and redemption modal. The brand-operator flow goes through `brand_members` lookup — if you have no membership row, you get a 'no access' screen; if you have one membership, you go straight to that brand's dashboard; if you have multiple, you pick. Inside the brand dashboard, three roles are stored — owner, admin, operator — and the role label is shown next to the brand name. Owner and admin can edit brand details and grant access to other operators. All three roles can fulfil redemptions and generate QR codes; that's an MVP simplification declared in migration 004's comments."

### Why is redemption off-chain?

**Strong answer.** "Two design considerations. First, the on-chain `add_brand_points` only ever increases — that's a deliberate trust property: brands cannot silently reduce earned points. So an on-chain redemption cannot subtract from `points`; it has to either burn through a separate fungible currency, or record redemption against a separate field. The contract has a `record_redemption` function that takes the second approach — it tracks `redeemed` separately and asserts `redeemed <= earned`. That function exists and has tests. Second, the LPT fungible token in `loyalty_token.move` is fully deployed and is the canonical substrate for cross-brand on-chain redemption — but wiring it into the dashboard is more code than fit in Sprint 5. So the dashboard's redemption flow currently writes to PostgreSQL only and creates a pending row for brand operator fulfilment. The on-chain primitives are ready; the integration is declared as future work in the Audit."

### How would this scale to mainnet?

**Strong answer.** "Three things would change. First, the sponsor wallet would need a real funding model — the brand pays in advance, or the platform charges per-transaction. Currently it's a faucet-funded testnet wallet. Second, the AdminCap would need rotation procedures and probably a multisig — currently it's a single-key system, which is fine for a research prototype but not for production. Third, mainnet deployment is irreversible per package, so the upgrade strategy would shift from 'redeploy on devnet reset' to 'use Sui's package upgrade mechanism'. All three are declared as future work. The current testnet deployment is the demonstrable artefact for this project."

### What would you do differently?

**Strong answer.** "Three things, in order of regret. First, I'd start with the Shared Object + AdminCap pattern from day one rather than discovering the constraint mid-Sprint 4 — I lost about a week to the migration. Second, I'd set up the reference manager for Harvard citations on day one rather than during the report writing window — the Lit Review will be tighter than it should be because of late tooling. Third, I'd measure test coverage continuously with a CI threshold from day one rather than reporting it at the end. The Critical Reflection chapter goes into more detail."

---

## 5. Known gaps — surface these yourself

Mentioning these proactively before he finds them is **worth real Critical Reflection marks**. Each one has a defensible framing.

| Gap | Framing |
| --- | --- |
| **Tier formula bug — fixed in source today, redeploy deferred** | "I identified late in Sprint 5 that `record_redemption` had a Move borrow-checker issue when the function was extended. Fixed in source, all 36 tests pass, but I'm holding the redeploy until after this review to keep the testnet demo stable. Same applies to a separate tier-cap divergence between on-chain `points/500` and the off-chain SQL CASE that caps at Gold — fix is one line of Move." |
| **37 backend TS errors from `noUncheckedIndexedAccess`** | "I have strict null-safety enabled in tsconfig — `noUncheckedIndexedAccess: true`. There are 37 known violations in `redemption.service.ts` and `report.service.ts` where `result.rows[0]` accesses follow a length check the compiler can't see through. Runtime is unaffected, fix is mechanical, on the punch list." |
| **5 frontend TS errors in `merchant/page.tsx`** | "Pre-existing from Sprint 5 brand-portal additions, on the punch list." |
| **Off-chain redemption** | "The LPT contract is deployed and tested but not wired into the dashboard redemption flow yet. Declared as future work in the Audit." |
| **Role enforcement gap** | "Three roles are stored — owner, admin, operator — but only owner/admin gates two endpoints (brand edit, member grant). For an MVP, existence-of-membership is the bar; finer-grained per-role permission matrix is declared in migration 004's comments as future work." |
| **Move test coverage not formally measured** | "On the to-do list before submission — `sui move test --coverage` to capture the percentage. 36 tests pass, audit will report the measured number." |
| **`SuiLoyalty_Database_Design.docx` is stale** | "The doc on disk shows 7 tables; the live schema has 9 — `session`, `brand_members`, `redemption_requests` were added in migrations 004 and 005. Doc reconciliation pass is on the punch list before submission." |
| **`docs/architecture.html` references a `sui.service.ts` that doesn't exist** | "Stale reference, on the punch list." |
| **Hosting deferred to post-submission** | "Vercel + Railway named in the stack but the system runs on testnet + localhost. Viva demonstration runs locally against the live testnet contract; the testnet tx digest is the cryptographic artefact." |
| **LICENSE just added today** | "Apache 2.0 LICENSE was an outstanding Audit item; closed as of today." |

---

## 6. Tabs and files to have open before the meeting starts

Three browser tabs and three editor tabs — so you're not fumbling for them when asked.

**Browser:**
- `https://testnet.suivision.xyz/txblock/4coLY5kehLf9ijrB6ms9oWMM6Ax8KVQ4vuQKrEqtug2R` (the live tx — open this first if asked for proof)
- `https://testnet.suivision.xyz/package/0x69c2b0f58fed8ceb70bad56e56867486a88d9328f6d8ddbe15fd5c4232be404c` (the deployed package)
- `http://localhost:3001/` (the audience picker, with backend + frontend running)

**Editor:**
- `contracts/sources/loyalty_nft.move` — primary contracts file
- `backend/src/services/qr.service.ts` — primary orchestrator
- `Walkthrough_Prep.md` — this document, in case you need it

**Documents:**
- `TEST_DOCUMENTATION.md` — open if asked about test counts
- `SuiLoyalty_Contract_Alignment_Audit.docx` — open if asked about scope vs contract
- `Migration_Summary.md` — open if the Owned-to-Shared migration comes up

---

## 7. The 30-second pre-meeting check

Run these in your terminal half an hour before the meeting:

```bash
cd /Users/tatenda/Desktop/SuiLoyalty

# Move builds and tests pass
(cd contracts && sui move build && sui move test) | tail -5

# Backend dev server starts
(cd backend && npm run dev &) ; sleep 6 ; curl -s http://localhost:3000/api/health

# Frontend dev server starts
(cd frontend && npm run dev &) ; sleep 8 ; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/
```

You want: `Total tests: 36; passed: 36`, `{"status":"healthy"...}`, `200`. If anything else, you have time to recover before he arrives.

---

## 8. If the demo breaks during the walkthrough

Don't panic. The live tx digest is your fallback proof. Open the SuiVision tab and say:

> "The local stack might be having an issue, but the on-chain artefact is independent. Here's the live transaction proving the full QR-scan-to-on-chain-update flow works on Sui testnet — you can see the AdminCap input, the `add_brand_points` call, the `gain_experience` call, the gas paid by the backend wallet, and the resulting state changes. The demo's just a UI on top of this."

That's a stronger answer than fumbling with restart commands. The blockchain proof is permanent and doesn't depend on `localhost`.

---

## 9. One last thing

You've built a real system. 68 passing tests, working live testnet deployment, a multi-brand operator portal that wasn't in the original scope, honest engineering throughout. The supervisor has been positive across all four prior meetings. Tomorrow is a code review, not a defence — he wants to see what you built and how you reasoned about it.

Walk in, hit the 90-second opening, and let the work speak.

Good luck.
