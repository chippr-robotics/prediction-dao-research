---
description: "Task list for Compliance & Legal Gating Layer (007)"
---

# Tasks: Compliance & Legal Gating Layer

**Input**: Design documents from `specs/007-compliance-gating/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Tests**: INCLUDED — Principle II (Test-First) is non-negotiable in this repo.
**Footprint constraint**: NO backend. "Server-side" needs are met on-chain / at the edge /
client-side (see plan.md). No `backend/` directory is created.

**Organization**: by user story (US1–US6 from spec.md) for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependency)
- **[Story]**: US1–US6 (setup/foundational/polish carry no story label)

## Path Conventions

Existing multi-part repo: `contracts/`, `test/`, `frontend/src/`, `scripts/`, `subgraph/`,
`infra/` (new, for edge config). No backend.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch, config, env, and test scaffolding.

- [X] T001 Create feature branch `007-compliance-gating` from `main` and confirm clean tree (never commit to `main`; PR-only per repo workflow)
- [X] T002 [P] Add `.env.example` entries (no secrets committed): `POLYGON_RPC_URL` (fork tests), `ORIGIN_LOCK_SECRET` (Cloudflare→nginx), and a documented per-chain Chainalysis oracle address var
- [X] T003 [P] Add per-chain Chainalysis oracle address to deploy config: `137 = 0x40C57923924B5c5c5455c48D93317139ADDaC8fb`, `80002`/local = mock placeholder, in the deploy inputs under `scripts/deploy/` + `deployments/` config
- [X] T004 [P] Create empty test files to be filled later: `test/SanctionsGuard.test.js`, `test/integration/sanctions-gating.test.js`, `test/fork/ChainalysisSanctions.fork.test.js`, and `frontend/src/test/` placeholders for the new Vitest suites
- [X] T005 [P] Create `infra/cloudflare/` directory with a README for the WAF geo rule + Transform-Rule (origin-lock secret) configuration (runbook/IaC home)

**Checkpoint**: Repo wired for the feature; no behavior yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared interfaces, mock, and the canonical hashing util that multiple stories depend on.

**⚠️ CRITICAL**: US2 and US3 cannot begin until this phase is complete.

- [X] T006 [P] Create `contracts/interfaces/IChainalysisSanctionsOracle.sol` with `function isSanctioned(address) external view returns (bool)` (see contracts/IChainalysisSanctionsOracle.md)
- [X] T007 [P] Create `contracts/interfaces/ISanctionsGuard.sol` per contracts/ISanctionsGuard.md (views, admin fns, events, `error SanctionedAddress`)
- [X] T008 [P] Create `contracts/mocks/MockSanctionsOracle.sol` (test/testnet only; settable `isSanctioned` mapping) — never imported by production contracts
- [X] T009 [P] Implement the canonical document-hash function (`NFC → CRLF/CR→LF → trim → UTF-8 → sha256 → hex`) in `frontend/src/utils/legalDocs.js`, shared by US3 docs and the wager AAD binding (FR-026/FR-059)
- [X] T010 [P] Add `TERMS_AAD_PREFIX` (`"FairWins-TC"`) + AAD builder in `frontend/src/utils/crypto/constants.js` — MUST NOT touch `SIGNING_MESSAGES`/`MARKET_SIGNING_MESSAGES`/key-derivation

**Checkpoint**: Interfaces + mock + shared hash util ready.

---

## Phase 3: User Story 1 - Geographic restriction that cannot be bypassed (Priority: P1) 🎯 MVP

**Goal**: Block restricted jurisdictions at Cloudflare (451) and lock the Cloud Run origin via an nginx-verified secret header — no new infra.

**Independent Test**: Request from a blocked country → 451 (no origin hit); direct `run.app` request without `X-Origin-Auth` → 403; `CF-IPCountry`/IP appear in Cloud Run request logs.

### Tests for User Story 1

- [X] T011 [P] [US1] Add an nginx origin-lock test (e.g. `frontend/test/origin-lock.test.mjs` or a CI shell check) asserting requests without/with-wrong `X-Origin-Auth` get 403 and a correct secret is served
- [X] T012 [P] [US1] Add a documented manual/staging checklist for the Cloudflare geo rule (blocked country → 451, observe-mode first) in `infra/cloudflare/waf-geo.md`

### Implementation for User Story 1

- [X] T013 [US1] Define the Cloudflare WAF geo custom rule (allowlist posture; locked OFAC set `CU IR KP SY` + Crimea/Donetsk/Luhansk handling + `US`; tunable bucket) with a custom 451 response, in `infra/cloudflare/waf-geo.md` (+ IaC if used)
- [X] T014 [P] [US1] Author the 451 "Unavailable For Legal Reasons" page (`frontend/public/451.html` and/or the Cloudflare custom response body)
- [X] T015 [US1] Define the Cloudflare Transform Rule injecting `X-Origin-Auth: <secret>` in `infra/cloudflare/origin-lock.md`
- [X] T016 [US1] Modify `frontend/nginx.conf.template`: reject requests whose `X-Origin-Auth` ≠ configured secret (`return 403`), and forward `CF-IPCountry`/`CF-Connecting-IP` into the access log; never log the secret
- [X] T017 [US1] Inject `ORIGIN_LOCK_SECRET` at runtime (Secret Manager → Cloud Run env → nginx), mirroring the Pinata JWT pattern, in `cloudbuild.yaml` + `Dockerfile`/entrypoint (runtime env, not build arg)
- [X] T018 [US1] Document occupied-region conservative matching + unknown-country (`XX`) fail-closed behavior in `infra/cloudflare/waf-geo.md`

**Checkpoint**: Geo gate + origin lock live and independently verifiable. **MVP deployable.**

---

## Phase 4: User Story 2 - On-chain wallet sanctions screening (Priority: P1)

**Goal**: Non-bypassable on-chain `SanctionsGuard` (oracle + admin deny-list, fail-closed) consulted by WagerRegistry/MembershipManager, plus advisory client read and admin UI.

**Independent Test**: On a Polygon-137 fork, a sanctioned address reverts on create/accept/purchase/upgrade (incl. direct contract call); clean address passes; deny-list add/remove emits actor+reason; unauthorized admin calls revert.

### Tests for User Story 2

- [X] T019 [P] [US2] Unit tests for `SanctionsGuard` (isAllowed truth table; fail-closed on oracle revert + EOA-as-oracle; role-gating reverts; events) in `test/SanctionsGuard.test.js`
- [X] T020 [P] [US2] Integration tests: `createWager`/`acceptWager`/`purchaseTier`/`upgradeTier` revert for a listed sender, `acceptWager` reverts for a listed counterparty, and exit/refund paths succeed for a listed party, in `test/integration/sanctions-gating.test.js`
- [X] T021 [P] [US2] Fork test (Polygon 137) against the real oracle: known sanctioned blocked, clean allowed, unreachable-oracle fails closed, in `test/fork/ChainalysisSanctions.fork.test.js`
- [X] T022 [P] [US2] Vitest for `sanctionsScreen.js` advisory read + fail-closed UX in `frontend/src/test/sanctionsScreen.test.js`

### Implementation for User Story 2

- [X] T023 [US2] Implement `contracts/access/SanctionsGuard.sol` (injected oracle + `_denied` mapping; `isAllowed`/`checkBlocked` fail-closed via try/catch; `SANCTIONS_ADMIN_ROLE`/`DEFAULT_ADMIN_ROLE`; `DenyListUpdated`/`SanctionsOracleUpdated`) per contracts/ISanctionsGuard.md
- [X] T024 [US2] Modify `contracts/wagers/WagerRegistry.sol`: add `sanctionsGuard` ref + `setSanctionsGuard` (DEFAULT_ADMIN_ROLE); first-Check `checkBlocked(msg.sender)` in `createWager`; `checkBlocked(msg.sender)` + `checkBlocked(w.creator)` in `acceptWager` (CEI preserved; exit paths ungated)
- [X] T025 [US2] Modify `contracts/access/MembershipManager.sol`: add `sanctionsGuard` ref + setter; first-Check `checkBlocked(msg.sender)` in `purchaseTier`/`upgradeTier`
- [X] T026 [P] [US2] Implement `frontend/src/utils/sanctionsScreen.js` — advisory client-side oracle read via RPC; address/ABI from sync artifacts (FR-055); fail-closed UX on read error
- [X] T027 [P] [US2] Implement `frontend/src/components/admin/DenyListAdmin.jsx` — add/remove with reason → `setDenied`; render `DenyListUpdated` audit trail; WCAG 2.1 AA
- [X] T028 [US2] Extend `scripts/deploy/` to deploy `MockSanctionsOracle` on Amoy/local, deploy `SanctionsGuard` with per-chain injected oracle address, grant roles to the floppy-keystore admin, and wire the guard into WagerRegistry + MembershipManager (depends on T023–T025)
- [X] T029 [US2] Extend `scripts/utils/sync-frontend-contracts.js` to emit `SanctionsGuard`/oracle address+ABI+network config; regenerate `frontend/src/abis/` (FR-055)

**Checkpoint**: Sanctions enforcement live on-chain + advisory in UI + admin deny-list manageable. P1 compliance core (US1+US2) complete.

---

## Phase 5: User Story 3 - Versioned, hash-addressed legal documents + wager-bound governance (Priority: P2)

**Goal**: Serve versioned Terms/Risk/Privacy (SHA-256 version, IPFS-pinned per version, materiality flag) and bind the governing version into each wager (AAD + on-chain hash).

**Independent Test**: Doc pages show "Version: <hash>"; recompute matches; prior version retrievable by hash; encrypted-metadata v1.1 round-trips and rejects a tampered `termsVersion`; a wager created under V keeps V after a newer version publishes.

### Tests for User Story 3

- [X] T030 [P] [US3] Vitest: doc version hash reproducibility, prior-version retrieval by hash, materiality-flag re-consent trigger, in `frontend/src/test/legalDocs.test.js`
- [X] T031 [P] [US3] Vitest: encrypted-metadata v1.1 round-trip with `termsVersion`+AAD, tamper rejection, legacy no-AAD round-trip, in `frontend/src/test/crypto/envelopeEncryption.termsVersion.test.js`
- [X] T032 [P] [US3] Hardhat test: `WagerRegistry` stores/emits `termsVersionHash`; existing wager keeps its hash (prospective-only), in `test/integration/wager-terms-binding.test.js`

### Implementation for User Story 3

- [X] T033 [P] [US3] Author versioned legal docs (Terms, Risk, Privacy) under `frontend/src/legal/` with populated SHA-256 version headers + IPFS pin manifest (copy is draft pending counsel; incorporate-by-reference per FR-028)
- [X] T034 [US3] Implement the `frontend/src/utils/legalDocs.js` manifest API (current version, prior versions by hash, operator-set materiality flag) atop the T009 hash util
- [X] T035 [P] [US3] Implement `frontend/src/pages/legal/{TermsPage,RiskPage,PrivacyPage}.jsx` (content + "Version: <hash>", cross-links) + routes in `frontend/src/App.jsx`; WCAG 2.1 AA
- [X] T036 [US3] Create `frontend/src/schemas/encrypted-metadata-v1.1.json` (add optional authenticated `termsVersion`; reconcile to runtime `content`/`keys` shape; extend `version` enum)
- [X] T037 [US3] Modify `frontend/src/utils/crypto/envelopeEncryption.js`: add AAD (`termsVersion.hash`) to the 4 **content** cipher sites (seal/open, both x25519 + xwing); emit/consume `termsVersion`; legacy no-AAD fallback; key derivation untouched (per contracts/encrypted-metadata-v1.1.md)
- [X] T038 [US3] Thread the in-force `{id, hash}` into `createEncrypted` callers (`frontend/src/components/fairwins/FriendMarketsModal.jsx` ~L863/L884) so new wagers bind the version (FR-058)
- [X] T039 [US3] Modify `contracts/wagers/WagerRegistry.sol`: add `bytes32 termsVersionHash` to the `Wager` struct + `createWager` param + `WagerCreated` event (prospective-only) — **depends on T024 (same file)**

**Checkpoint**: Documents versioned + verifiable; wagers carry tamper-evident governing-version proof.

---

## Phase 6: User Story 4 - Entry eligibility notice gate (client-side) (Priority: P2)

**Goal**: Client-side first-visit gate that blocks the app until acknowledged, links the current versioned docs, and warns on circumvention.

**Independent Test**: Fresh load → gate blocks app; "Leave" withholds access; "Enter" stores acknowledged version hashes and reveals the app; gate links current versioned docs.

### Tests for User Story 4

- [X] T040 [P] [US4] Vitest: EntryGate blocks until acknowledged, "Leave" withholds, acknowledged versions persisted, current versioned docs linked, in `frontend/src/test/EntryGate.test.jsx`

### Implementation for User Story 4

- [X] T041 [US4] Implement `frontend/src/components/compliance/EntryGate.jsx` (focus-trapped labeled modal; affirmations 21+/non-US/non-restricted/non-sanctioned/lawful; VPN warning; Enter/Leave; links versioned docs by hash; client-state ack) — WCAG 2.1 AA
- [X] T042 [US4] Mount EntryGate in `frontend/src/App.jsx`/`AppLayout` before app content on first visit; skip for returning visitors via client state (re-consent enforced on-chain at next consequential act)

**Checkpoint**: Entry notice gate live; downstream on-chain consents carry the legal weight.

---

## Phase 7: User Story 5 - Membership purchase/upgrade attestation (Priority: P3)

**Goal**: Discrete un-pre-ticked attestation checkboxes at membership purchase, with the accepted T&C version recorded on-chain.

**Independent Test**: Checkboxes all un-ticked by default; purchase blocked until each required box ticked; on confirm, `MembershipPurchased`/`Upgraded` carries `acceptedTermsHash` + block timestamp.

### Tests for User Story 5

- [X] T043 [P] [US5] Vitest: checkboxes un-pre-ticked, submit blocked until all required ticked, copy mirrors FR-037/FR-038, in `frontend/src/test/MembershipAttestation.test.jsx`
- [X] T044 [P] [US5] Hardhat test: `purchaseTier`/`upgradeTier` record + emit `acceptedTermsHash`, in `test/MembershipManager.terms.test.js`

### Implementation for User Story 5

- [X] T045 [US5] Modify `contracts/access/MembershipManager.sol`: add `acceptedTermsHash`/`acceptedAt` to the membership record + `purchaseTier`/`upgradeTier` params + extended events — **depends on T025 (same file)**
- [X] T046 [US5] Implement `frontend/src/components/compliance/MembershipAttestation.jsx` (discrete un-pre-ticked checkboxes per FR-037/FR-038; on confirm pass `acceptedTermsHash`) — WCAG 2.1 AA
- [X] T047 [US5] Integrate MembershipAttestation into the existing membership flow (`frontend/src/pages/WalletPage.jsx` Membership tab); prompt re-acceptance when the in-force version is flagged material

**Checkpoint**: Itemized, dated, on-chain membership consent live.

---

## Phase 8: User Story 6 - Deterministic key-generation eligibility signature (Priority: P3)

**Goal**: Deterministic eligibility signing message (no nonce/timestamp) with key-derivation disclosure, dated by on-chain key registration.

**Independent Test**: The message is byte-identical across signings, carries eligibility facts + wallet address + key-derivation disclosure; KeyRegistry emits a dated `EligibilityAcknowledged`.

### Tests for User Story 6

- [X] T048 [P] [US6] Vitest: eligibility message determinism (byte-identical), required content + disclosure, recovered-address reproducibility, in `frontend/src/test/keygenEligibility.test.js`
- [X] T049 [P] [US6] Hardhat test: `KeyRegistry` emits `EligibilityAcknowledged` dated by block, in `test/KeyRegistry.eligibility.test.js`

### Implementation for User Story 6

- [X] T050 [US6] Update the key-generation signing UI/flow (`frontend/src/hooks/useEncryption.js` / `frontend/src/utils/keyRegistryService.js`) to present the eligibility facts + generic Terms ref + wallet address + key-derivation disclosure — **the key-derivation message itself stays UNCHANGED** (deterministic, versionless)
- [X] T051 [US6] Modify `contracts/privacy/KeyRegistry.sol` to emit `EligibilityAcknowledged(account, termsRef)` at registration (dated by block timestamp)

**Checkpoint**: All six stories independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Security gates, accessibility, CI, optional indexing, validation.

- [X] T052 [P] Run Slither + Medusa on the contract changes; resolve or document new high/critical findings (Principle I)
- [X] T053 Smart-contract-security agent review of `SanctionsGuard` + WagerRegistry/MembershipManager/KeyRegistry changes (`.github/agents/`) before merge
- [X] T054 [P] axe + Lighthouse accessibility audit (WCAG 2.1 AA) of EntryGate, membership checkboxes, legal doc pages, 451 page, DenyListAdmin; wire checks into CI (Principle V)
- [X] T055 Update CI to run new Hardhat unit/integration/fork + Vitest + Slither with no `continue-on-error` on lint/test/build/security (Principle IV)
- [ ] T056 [P] (Optional) Extend `subgraph/` to index `WagerCreated.termsVersionHash`, `Membership*` accepted hash, and `DenyListUpdated` for address-keyed consent queries (FR-047)
- [X] T057 [P] Update docs: `README`/`CLAUDE.md` pointers, the Open Legal-Reconciliation Items (counsel), permitted-country allowlist runbook, and the legacy-wager migration note (governed by launch version)
- [ ] T058 Run `specs/007-compliance-gating/quickstart.md` end-to-end on Amoy + a Polygon-137 fork; confirm all SCs

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks US2 and US3**.
- **US1 (geo)** → after Setup only (no contract/foundational deps) — can start immediately in parallel with Foundational.
- **US2 (sanctions)** → after Foundational (needs interfaces/mock).
- **US3 (docs+binding)** → after Foundational (needs T009 hash util); T039 also depends on **T024 (US2)** (same WagerRegistry file).
- **US4 (entry gate)** → after US3 (links versioned docs) for full function; component shell can start after Foundational.
- **US5 (membership)** → after Foundational; T045 depends on **T025 (US2)** (same MembershipManager file); UI needs US3 version hashes.
- **US6 (key-gen)** → after Foundational; light, mostly independent.
- **Polish (P9)** → after the desired stories.

### Critical cross-story file couplings (sequence, not parallel)
- `WagerRegistry.sol`: T024 (US2 guard) → T039 (US3 termsVersionHash).
- `MembershipManager.sol`: T025 (US2 guard) → T045 (US5 acceptedTermsHash).
- `frontend/src/utils/legalDocs.js`: T009 (foundational hash) → T034 (US3 manifest).

### Within each story
- Tests written first and FAIL before implementation (TDD).
- Contracts/interfaces before consumers; models before services; core before integration.

### Parallel opportunities
- Setup: T002–T005 [P].
- Foundational: T006–T010 [P] (distinct files).
- US1 can run fully in parallel with US2/US3 (no shared files).
- Within a story, all `[P]` tests run together; distinct-file implementation tasks `[P]`.
- With staff: US1, US2, US3 progress concurrently after Foundational (mind the WagerRegistry/MembershipManager couplings).

---

## Parallel Example: User Story 2

```bash
# Tests first (all [P], different files):
Task: "Unit tests for SanctionsGuard in test/SanctionsGuard.test.js"
Task: "Integration tests in test/integration/sanctions-gating.test.js"
Task: "Fork test (137) in test/fork/ChainalysisSanctions.fork.test.js"
Task: "Vitest for sanctionsScreen in frontend/src/test/sanctionsScreen.test.js"

# Then distinct-file implementation in parallel:
Task: "Implement frontend/src/utils/sanctionsScreen.js"
Task: "Implement frontend/src/components/admin/DenyListAdmin.jsx"
# (SanctionsGuard.sol + WagerRegistry/MembershipManager edits are sequenced before deploy/sync)
```

---

## Implementation Strategy

### MVP first
1. Phase 1 (Setup) → Phase 3 (**US1 geo gate + origin lock**). Smallest deployable slice; the legal access boundary exists with zero contract changes. **STOP & VALIDATE**, deploy.

### P1 compliance core
2. Phase 2 (Foundational) → Phase 4 (**US2 sanctions**). US1 + US2 = the strict-liability P1 controls (location + address).

### Incremental delivery
3. US3 (versioned docs + wager binding) → US4 (entry gate) → US5 (membership attestation) → US6 (key-gen signature). Each adds a layer of the consent stack without breaking prior ones.

### Parallel team
- After Foundational: Dev A → US1 (no contract deps); Dev B → US2; Dev C → US3. Coordinate the WagerRegistry/MembershipManager edits (US2 before US3/US5 on those files).

---

## Notes
- `[P]` = different files, no incomplete dependency. `[Story]` maps to spec.md user stories.
- All contract changes are `contracts/` access-control-axis edits → full Principle I gate (CEI, Slither/Medusa clean, EthTrust-SL L2, security-agent review, fork tests) — see Phase 9.
- Mocks live ONLY in `contracts/mocks/`; production reads the real oracle on 137 (Principle III); records are chainId-scoped.
- No backend is introduced. Consent records are on-chain; geo/IP evidence is the existing edge/Cloud Run logs.
- Frontend addresses/ABIs come only from `sync:frontend-contracts` (FR-055); mind the `getContractAddress` mocking gotchas in the frontend-test-gotchas memory.
- Legal copy is draft pending counsel; the Open Legal-Reconciliation Items remain (T057).
