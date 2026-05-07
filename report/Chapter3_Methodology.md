# Chapter 3 — Methodology

This chapter describes the development methodology I followed and, more importantly, how verification and validation were applied at every stage. The rubric for CTEC3451D specifically rewards evidence that V&V was a spine running through the project, rather than a phase tacked on at the end. I have therefore organised this chapter around that spine, framing methodology choices in terms of how they enabled or constrained continuous verification.

## 3.1 Choice of methodology

I chose Agile Scrum, adapted for solo development, over a Waterfall approach. The decision was driven by three considerations specific to this project. First, I had no prior experience with the Sui Network, the Move language, or zero-knowledge cryptographic primitives at the start of the project. A Waterfall design phase would have produced specifications I was not yet competent to write, and I would have spent weeks discovering implementation constraints that should have been surfaced through code as early as possible. Short two-week sprints made it possible to discover these constraints while there was still time to redesign — which proved essential, as Section 3.4 discusses.

Second, the project's central technical decisions — particularly the choice between owned and shared on-chain objects, and the redesign from per-brand to multi-brand NFT architecture — were not stable at project commencement. Both decisions evolved during implementation as I gained working understanding of the Sui object model. Agile's iterative cadence accommodated these mid-project pivots; a Waterfall plan would have required either pretending the original design was correct or restarting from scratch.

Third, the report itself is part of the deliverable. Writing chapter drafts continuously alongside the implementation, rather than as a separate post-development phase, is a recommendation I had read in prior CTEC project guidance and a discipline Agile naturally enforces through its sprint-end review activity. This chapter, for example, draws much of its specific narrative content directly from the four sprint journals authored throughout development.

The adaptation for solo work was practical: two-week sprints, weekly self-review, and fortnightly supervisor meetings with Dr Al-Ibaisi. The Periodic Progress Meeting cadence required by the module — ten meetings across the project window — provided a natural external review rhythm that compensated for the absence of a development team.

## 3.2 Sprint structure

Each sprint followed a consistent five-activity loop: planning, implementation, testing, journal write-up, and supervisor review. Sprint planning at the start of each two-week window identified the deliverables for that sprint against the technical objectives committed in the Project Contract. Implementation and testing happened together rather than sequentially — every Move function and every backend service was committed to the repository alongside its unit tests in the same logical change. The journal write-up at the end of each sprint produced a sprint-level retrospective that served two purposes: it forced me to articulate what worked and what did not, and it produced raw material that the Implementation chapter of this report could then be assembled from rather than drafted from a blank page.

The five sprints delivered as planned across the contract window: Sprint 1 the smart contracts; Sprint 2 the backend API and zkLogin; Sprint 3 the consumer progressive web app and merchant terminal; Sprint 4 the end-to-end blockchain integration; and Sprint 5 the brand-portal MVP and report drafting. A fourteen-week buffer absorbed the pre-submission cleanup, the formal alignment audit against the Project Contract, and viva preparation.

## 3.3 Verification and validation

I applied verification — confirming the system was built correctly — at four layers, each with continuous evidence rather than end-of-project assessment.

The first layer is the type system. The backend uses TypeScript in strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled, the strictest practical settings. The frontend likewise uses strict TypeScript. The Move compiler's borrow checker enforces resource invariants on the smart contracts at compile time, which proved consequential during Sprint 5 when an extension to the redemption function violated a borrow rule and was caught immediately rather than at runtime.

The second layer is the automated test suite. The Move contracts have 36 unit tests across `loyalty_nft_tests.move` and `loyalty_token_tests.move`, run via `sui move test`. The backend has 32 Jest tests across pure cryptographic functions, transactional database paths, and HTTP-level security including SQL injection rejection and UUID format validation. The Jest configuration enforces an 80 percent line-coverage threshold globally, matching the contract's stated target.

The third layer is continuous integration. Three GitHub Actions workflows — one each for `contracts/`, `backend/`, and `frontend/` — run on every push touching the relevant directory. The contracts workflow installs the Sui CLI, builds the Move package, and runs the test suite. The backend workflow runs TypeScript type-checking and the Jest suite with coverage. The frontend workflow runs type-checking and the production Next.js build. A failed workflow blocks the change from being treated as completed.

```yaml
- name: Run Move unit tests
  working-directory: contracts
  run: sui move test
```

Validation — confirming the right system was built — was applied against the two acceptance criteria the Project Contract specifically named: QR token replay prevention and end-to-end zkLogin integration. Replay prevention was tested both at the unit level (the `qr.service` test suite asserts that the atomic UPDATE statement contains the `used = FALSE` guard) and at the integration level (the `api.security.test` suite exercises the HTTP path with concurrent token presentations). End-to-end zkLogin integration is validated by the live testnet transaction `4coLY5kehLf9ijrB6ms9oWMM6Ax8KVQ4vuQKrEqtug2R`, which is the cryptographic proof that the full pipeline — Google Sign-In, JWT verification, deterministic Sui address derivation, sponsored Programmable Transaction Block construction, and on-chain Avatar mutation — operates correctly under real network conditions.

## 3.4 Risk management

The Project Contract identified five risks at the outset. Three materialised during development. The first was zkLogin integration complexity, mitigated as planned by the dedicated SDK exploration in Sprint 0 and a ten-hour contingency in Sprint 2. The second was Sui devnet instability, which materialised severely — the deployed package was wiped by devnet resets five times before I migrated to testnet for stable deployment in Sprint 4. The third was scope creep, which I addressed through the Contract Alignment Audit drafted in Sprint 5, which honestly declares three architectural expansions beyond the contracted scope and defends each as engineering judgement rather than silent feature creep.

Two contracted risks did not materialise. The Move language learning curve was steeper than expected but was absorbed within the planned two-week setup sprint. The report time overrun was avoided by the discipline of writing chapter drafts continuously from the sprint journals rather than treating the report as a post-development phase. The Critical Reflection chapter expands on what I would do differently with hindsight in both areas.
