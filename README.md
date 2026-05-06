# SuiLoyalty

**A blockchain loyalty platform on Sui — wallet-less by design.**

SuiLoyalty is a multi-brand loyalty system where every customer's loyalty card is a real on-chain NFT, every QR scan triggers a sponsored Sui transaction, and the entire onboarding experience uses Google Sign-In via [zkLogin](https://docs.sui.io/concepts/cryptography/zklogin) — no wallet, no seed phrase, no cryptocurrency knowledge required from the consumer.

The project demonstrates that blockchain loyalty can be deployed to real consumers without inheriting the Web3 onboarding problem that has historically capped adoption.

---

## Live deployment

| | |
| --- | --- |
| **Network** | Sui Testnet |
| **Move package** | [`0x69c2b0f58fed8ceb70bad56e56867486a88d9328f6d8ddbe15fd5c4232be404c`](https://testnet.suivision.xyz/package/0x69c2b0f58fed8ceb70bad56e56867486a88d9328f6d8ddbe15fd5c4232be404c) |
| **Live transaction** | [`4coLY5kehLf9ijrB6ms9oWMM6Ax8KVQ4vuQKrEqtug2R`](https://testnet.suivision.xyz/txblock/4coLY5kehLf9ijrB6ms9oWMM6Ax8KVQ4vuQKrEqtug2R) |
| **Move modules** | `loyalty_nft` (Universal Avatar + BrandNode dynamic fields), `loyalty_token` (LPT fungible currency) |

The transaction digest above is cryptographic proof that the full QR-scan-to-on-chain-update flow works end to end on a public blockchain.

---

## What's in the box

- **Move smart contracts** — `LoyaltyAvatar` shared object with `BrandNode` dynamic object fields, gated by `AdminCap`. A separate `LOYALTY_TOKEN` (LPT) fungible currency with per-brand `BrandTreasury` and `DistributorCap` for future on-chain redemption. 36 unit tests under `sui_test_scenario`.
- **zkLogin authentication** — Google Sign-In maps deterministically to a Sui address via HMAC-SHA256 salt derivation and `jwtToAddress`. JWTs are cryptographically verified through Google's JWKS. No wallet ever required.
- **Sponsored transactions** — the backend wallet pays every gas fee. The customer never sees, holds, or transacts in cryptocurrency.
- **Atomic QR validation** — each QR token is a UUID stored in PostgreSQL; a single atomic `UPDATE … WHERE used = FALSE` makes replay attacks impossible even under concurrent scanning.
- **Multi-brand portal** — brand operators sign in with the same Google flow and see a brand picker scoped to their `brand_members` rows. Owner / admin / operator roles are stored, displayed, and gate the brand-edit and member-grant operations.
- **Brand campaign reports** — printable A4 PDF and RFC-4180 CSV export, both streamed directly from the backend with brand-coloured headers, summary tiles, and a per-code activity table.
- **Pending-redemption fulfilment queue** — customer redemptions create a pending row that the brand operator fulfils or cancels from the merchant terminal, with auto-refresh every 15 seconds.

---

## Architecture

Three-tier architecture:

```
┌────────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│  Next.js PWA       │    │  Node.js / Express  │    │  Sui Testnet     │
│  (consumer +       │ ←→ │  REST API           │ ←→ │  Move package    │
│   merchant portal) │    │  zkLogin · QR · PTB │    │  loyalty_nft     │
└────────────────────┘    └──────────┬──────────┘    │  loyalty_token   │
                                     │               └──────────────────┘
                                     ↓
                          ┌─────────────────────┐
                          │  PostgreSQL         │
                          │  9 tables · session │
                          └─────────────────────┘
```

Detailed architecture, sequence flows, and ER diagrams: [`docs/architecture.html`](docs/architecture.html), [`docs/sequence-flows.html`](docs/sequence-flows.html).

---

## Quickstart

Requires **Node.js ≥ 20**, **PostgreSQL ≥ 15**, **Sui CLI ≥ 1.44**, and a Google Cloud OAuth 2.0 client.

```bash
# 1. Database
createdb suiloyalty
psql suiloyalty < database/schema.sql
for f in backend/migrations/*.sql; do psql suiloyalty < "$f"; done

# 2. Configure
cp backend/.env.example backend/.env            # then fill in real values
cp frontend/.env.local.example frontend/.env.local

# 3. Install
(cd backend && npm install)
(cd frontend && npm install)

# 4. Run (three terminals)
cd backend && npm run dev          # http://localhost:3000  (API)
cd frontend && npm run dev         # http://localhost:3001  (PWA)
cd contracts && sui move test      # optional — runs the Move test suite
```

Open `http://localhost:3001` and pick your audience. Full deployment guide with Google Cloud setup, troubleshooting, and CI/CD details: [`docs/deployment.html`](docs/deployment.html).

---

## Repository structure

```
SuiLoyalty/
├── contracts/             Move smart contracts + tests
│   ├── sources/
│   │   ├── loyalty_nft.move        Universal Avatar + BrandNode + AdminCap
│   │   └── loyalty_token.move      LPT fungible token + BrandTreasury
│   └── tests/             36 #[test] functions
├── backend/               Node.js / TypeScript / Express 5
│   └── src/
│       ├── server.ts               REST API entry · ~20 endpoints
│       ├── services/               qr · zklogin · blockchain · nft · redemption · report
│       ├── routes/                 brand portal routes
│       ├── middleware/             brandAuth (session + role lookup)
│       └── __tests__/              32 Jest tests
├── frontend/              Next.js 16 / React 19 / Tailwind 4
│   └── src/app/
│       ├── page.tsx                Audience picker (Customer · Brand operator)
│       ├── customer/               Consumer sign-in
│       ├── dashboard/              Per-brand loyalty cards + redemption
│       ├── scan/                   QR scanner (jsQR)
│       └── merchant/               Brand portal — picker, dashboard, QR generator, PDF/CSV reports
├── database/
│   └── schema.sql                  Canonical PostgreSQL schema
├── docs/
│   ├── architecture.html           System architecture + class diagrams
│   ├── deployment.html             Full deployment guide
│   └── sequence-flows.html         OAuth, scan, replay, merchant flows
└── .github/workflows/     CI for backend, contracts, frontend
```

---

## Testing

| Layer | Framework | Tests | Run with |
| --- | --- | --- | --- |
| Move smart contracts | `sui::test_scenario` | 36 | `cd contracts && sui move test` |
| Backend services + HTTP | Jest 30 (ESM) + supertest | 32 | `cd backend && npm test` |
| Backend coverage | Jest with `lines: 80` threshold | — | `cd backend && npm run test:coverage` |
| Frontend type safety | TypeScript strict + Next.js build | — | `cd frontend && npx tsc --noEmit && npm run build` |

Full test catalogue with descriptions and expected results: [`TEST_DOCUMENTATION.md`](TEST_DOCUMENTATION.md).

---

## Documentation

| Document | Purpose |
| --- | --- |
| [`docs/architecture.html`](docs/architecture.html) | System architecture, smart contract class diagram, ER diagram, security model |
| [`docs/deployment.html`](docs/deployment.html) | Step-by-step deployment, Google Cloud OAuth setup, secrets policy, troubleshooting |
| [`docs/sequence-flows.html`](docs/sequence-flows.html) | OAuth sign-in, QR scan (new + returning user), replay prevention, merchant flows |
| [`SuiLoyalty_Database_Design.docx`](SuiLoyalty_Database_Design.docx) | PostgreSQL schema design rationale |
| [`Migration_Summary.md`](Migration_Summary.md) | Owned-to-Shared object architecture migration record |
| [`SuiLoyalty_Contract_Alignment_Audit.docx`](SuiLoyalty_Contract_Alignment_Audit.docx) | Self-assessment against the signed Project Contract |
| [`SuiLoyalty_Sprint{1..4}_Journal.docx`](.) | Per-sprint development journals |

---

## Project context

This repository is the development artefact for **CTEC3451D — Development Project**, a final-year BSc (Hons) Computer Science capstone at De Montfort University.

| | |
| --- | --- |
| **Student** | Tatenda Marimo (P2964932) |
| **Programme** | BSc (Hons) Computer Science |
| **Module** | CTEC3451D — Development Project |
| **Supervisor** | Dr Mohammad Al-Ibaisi |
| **Project contract signed** | 11 March 2026 |
| **Submission window** | May 2026 |

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).

Copyright 2026 Tatenda Marimo.
