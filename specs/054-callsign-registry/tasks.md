---
description: "Task list for Callsign Naming Registry (spec 054)"
---

# Tasks: Callsign Naming Registry

**Input**: Design documents from `/specs/054-callsign-registry/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED — this is a value-bearing, access-controlled contract. Constitution II
(Test-First, NON-NEGOTIABLE) mandates unit + integration + fuzz for every resolution/claim/
refund/timeout path including failures. Test tasks are written FIRST and must FAIL before
implementation.

**Organization**: Tasks grouped by the five user stories from spec.md so each ships as an
independently testable increment. MVP = US1 + US2 (both P1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (user-story phases only; Setup/Foundational/Polish carry no story label)
- Exact file paths included in every task

## Path Conventions

Existing repo layout: `contracts/`, `test/`, `frontend/src/`, `services/`, `scripts/deploy/`,
`config/`, `deployments/`. Registry lives in `contracts/naming/` (new domain dir).

⚠️ **Same-file rule**: `contracts/naming/CallsignRegistry.sol` is a single file — tasks that
edit it are sequential (never `[P]` with each other or across stories). Frontend/relay/deploy
files in different paths parallelize freely.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Interface + seeds + module scaffolds every story builds on.

- [X] T001 Create `contracts/interfaces/ICallsignRegistry.sol` from `contracts/callsign-registry-interface.md` — `enum CallsignStatus`, `struct CallsignInfo`, all function signatures, events, and errors (incl. `InsufficientMembershipTier`, `CallsignUnavailable`, `CallsignQuarantined`, `NotCallsignOwner`, `RepointPending`)
- [X] T002 [P] Create `config/reserved-callsigns.json` — seed reserved-term list (platform/brand names, `admin`, `support`, `official`, `help`, and operational terms) with a short header comment on curation (FR-004)
- [X] T003 [P] Scaffold `frontend/src/lib/callsigns/index.js` exporting the module surface (`normalizeCallsign`, `isCallsignLike`, `formatCallsign`, `resolveCallsign`, `lookupCallsignOf`) per the frontend contract in `contracts/callsign-registry-interface.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The registry contract skeleton + eligibility/validation primitives + deploy +
storage-layout + frontend address wiring. **No user story can begin until this is complete.**

**⚠️ CRITICAL**: T004–T007 all edit `CallsignRegistry.sol` → strictly sequential.

- [X] T004 Create `contracts/naming/CallsignRegistry.sol` skeleton: inherit `UUPSManaged` + `SignerIntentBase`; append-only storage for `CallsignRecord` + mappings (`records`, `callsignHashOf`, `quarantinedUntil`, `reserved`, `commitments`, `lastChangeAt`), `membershipRole`, `minTier`, policy params, trailing `__gap`; one-time `initialize(admin, membershipManager, sanctionsGuard, membershipRole)` (moves all state init inline, sets EIP-712 domain `"CallsignRegistry"`/`"1"`, defaults `minTier=Gold`); declare `REGISTRY_CURATOR_ROLE`/`MODERATOR_ROLE`/`VERIFIER_ROLE` (data-model.md §storage/roles)
- [X] T005 Implement canonical-callsign validation `_normalizeAndHash(string) → (string, bytes32)` in `CallsignRegistry.sol`: enforce 3–20 bytes, `a-z0-9` + single interior hyphen, reject leading/trailing/consecutive hyphen and any uppercase; return canonical string + `keccak256` key (FR-003/FR-005, research R2)
- [X] T006 Implement gate helpers in `CallsignRegistry.sol`: `_requireGold(user)` = `uint8(IMembershipManager.getActiveTier(user, membershipRole)) >= uint8(minTier)` else revert `InsufficientMembershipTier`; `_requireNotSanctioned(user)` via `ISanctionsGuard` (FR-001/FR-007, research R5 — reads `WAGER_PARTICIPANT_ROLE`)
- [X] T007 Implement `_statusOf(bytes32) → CallsignStatus` + `getCallsignInfoByHash` view in `CallsignRegistry.sol` covering `NONE`/`ACTIVE` only for now (REPOINTING/QUARANTINED/SUSPENDED/LAPSED_RECLAIMABLE land in US4/US5); wire policy-param setters `setPolicyParams` + `setMembershipGate(role, tier)` bounded `tier >= Gold` (data-model.md §status, research R10)
- [X] T008 [P] Create `scripts/deploy/deploy-callsign-registry.js` — deploy UUPS proxy via `scripts/deploy/lib/upgradeable.js`, wire membershipManager + sanctionsGuard + `WAGER_PARTICIPANT_ROLE`, record `callsignRegistry`/`callsignRegistryImpl` in `deployments/<network>.json`
- [X] T009 [P] Register the `callsignRegistry`/`callsignRegistryImpl` pair in `scripts/deploy/check-storage-layout.js` (gating in CI)
- [X] T010 [P] Add `callsignRegistry` resolution to `frontend/src/config/contracts.js` (`getContractAddressForChain('callsignRegistry', chainId)`) and the sync-artifact map so addresses come from generated artifacts (constitution V)

**Checkpoint**: Contract compiles, deploys locally, storage-layout passes, address resolvable.

---

## Phase 3: User Story 1 — Register a Callsign (Priority: P1) 🎯 MVP

**Goal**: A Gold-tier-or-above member can *optionally* claim a unique `%callsign` via commit–reveal;
below-Gold and ineligible accounts are refused on-chain; claim-sniping is prevented.

**Independent Test**: Gold wallet commits → (age) → registers `%testbot`; a second account
can't take the same callsign; a Silver/Bronze/None wallet is refused (`InsufficientMembershipTier`);
a tagless account still transacts normally (FR-001a).

### Tests for User Story 1 (write first, must FAIL)

- [X] T011 [P] [US1] Unit tests in `test/callsignRegistry.test.js` — commit→wait→register succeeds (Gold **and** Platinum); reverts for duplicate / reserved / bad-format / below-Gold (None/Bronze/Silver) / sanctioned / uncommitted / too-fresh / expired-commitment; committed-name front-run fails (FR-001/002/003/004/006/007; SC-003/010)
- [X] T012 [P] [US1] Unit tests in `frontend/src/lib/callsigns/__tests__/normalizeCallsign.test.js` — normalization/validation table (`%` strip, mixed-case → lowercase, hyphen edges, length bounds) mirroring on-chain rules

### Implementation for User Story 1

- [X] T013 [US1] Implement `makeCommitment` + `commit` + `register` in `CallsignRegistry.sol` (commit–reveal `[minCommitmentAge, maxCommitmentAge]`; guards: canonical, not reserved, not registered, not quarantined, caller holds no callsign, `_requireGold`, `_requireNotSanctioned`; set `records`/`callsignHashOf`; emit `CallsignCommitted`/`CallsignRegistered`) (FR-001/002/006, research R3)
- [X] T014 [US1] Implement gasless twins `commitWithSig` + `registerWithSig` in `CallsignRegistry.sol` via `SignerIntentBase._verifyIntent` (`CommitCallsignIntent`/`RegisterCallsignIntent` typehashes; signer must equal `owner`) with self-submit fallback intact
- [X] T015 [P] [US1] Add `CommitCallsignIntent` + `RegisterCallsignIntent` structs to `frontend/src/lib/relay/intentTypes.js` — byte-identical to the typehashes (three-way sync rule)
- [X] T016 [P] [US1] Add the same structs + policy allowlist entries to `services/relay-gateway/src/intent/intentTypes.js` (with a Gold-tier pre-screen note so the gateway doesn't relay a call that will revert)
- [X] T017 [P] [US1] Implement `normalizeCallsign` / `isCallsignLike` / `formatCallsign` in `frontend/src/lib/callsigns/normalizeCallsign.js` (single source shared with tests; `formatCallsign` → `%<callsign>`, FR-015)
- [X] T018 [P] [US1] Add the `CallsignRegistry` ABI to `frontend/src/abis/callsignRegistry.js` (hand-maintained per repo convention — sync script only does addresses)
- [X] T019 [US1] Create `frontend/src/components/account/CallsignPanel.jsx` — two-step commit→register UI (second step enabled after commit ages), gated on `useRoleDetails('WAGER_PARTICIPANT').tier >= MembershipTier.GOLD`, upgrade prompt (not a dead control) for below-Gold, and **Gold-specific** copy for the `InsufficientMembershipTier` revert (must NOT reuse the Silver open-challenge wording — research R5)
- [X] T020 [US1] Mount `CallsignPanel` in the account settings surface (`frontend/src/pages/WalletPage.jsx` Account/Membership tab) as an optional, non-forced perk — no onboarding/transaction step requires a callsign (FR-001a)
- [X] T021 [US1] Integration test `test/integration/callsignRegistry.membership.test.js` against a real `MembershipManager` proxy — Gold/Platinum register succeeds, Silver/Bronze/None revert, and a tagless account completes a full wager create/transfer (FR-001a; SC-011)

**Checkpoint**: US1 fully functional — registration works, tier-gated, optional, snipe-proof.

---

## Phase 4: User Story 2 — Send and Interact by Callsign (Priority: P1)

**Goal**: Any address-entry surface accepts `%callsign`, resolves it exact-match to the owner's
address, and shows full address + verification for confirmation before a value-bearing action.

**Independent Test**: After US1, entering `%testbot` in a wager opponent / transfer / pool /
contact field resolves to the owner and shows the full address; an unknown callsign returns "no such
callsign" with no near-match; sanctions still apply to the resolved address.

### Tests for User Story 2 (write first, must FAIL)

- [X] T022 [P] [US2] Unit tests in `test/callsignRegistry.test.js` — `resolve` returns owner + `ACTIVE`; unknown callsign → `NONE` (never a near-match, SC-005); `callsignOf` reverse only reports a callsign whose forward resolution matches (FR-008 invariant); `isAvailable` correctness
- [X] T023 [P] [US2] Frontend tests `frontend/src/lib/callsigns/__tests__/resolveCallsign.test.js` + an `AddressInput` callsign-entry test (`%callsign` → resolved address shown; non-`ACTIVE` not committable; raw-address entry unaffected)

### Implementation for User Story 2

- [X] T024 [US2] Implement resolution views `resolve(callsign)` / `callsignOf(address)` / `isAvailable(callsign)` in `CallsignRegistry.sol` — exact-match only after normalization, reverse guarded by the forward==reverse invariant (FR-008/010)
- [X] T025 [P] [US2] Implement `resolveCallsign` + `lookupCallsignOf` in `frontend/src/lib/callsigns/resolveCallsign.js` — read the contract via `getContractAddressForChain`; return `{ address, status, verified, callsign }`; errors → soft-fail (FR-013)
- [X] T026 [US2] Integrate callsign entry into `frontend/src/components/ui/AddressInput.jsx` — `isCallsignLike` input → `resolveCallsign` → render resolved full address + verification badge in the existing confirmation affordance; only `ACTIVE` is committable; raw-address entry always available and never required; sanctions run on the resolved address (FR-009/011/012)
- [X] T027 [P] [US2] `AddressInput` tests in `frontend/src/test/` — confirmation shows full address (SC-007), non-`ACTIVE` blocked, and registry-unreachable degrades to raw entry (FR-013; SC-008)

**Checkpoint**: MVP complete — register (US1) + resolve/send (US2) work end-to-end.

---

## Phase 5: User Story 3 — Callsign-Aware Display Names (Priority: P2)

**Goal**: Counterparty display resolves in order address book > callsign > ENS > generated,
with callsigns rendered `%callsign`; behavior for tagless counterparties is unchanged.

**Independent Test**: A counterparty with a callsign and no address-book entry shows `%callsign`; adding a
nickname flips display to the nickname; a tagless counterparty shows the existing chain.

### Tests for User Story 3 (write first, must FAIL)

- [X] T028 [P] [US3] Extend `frontend/src/test/useOpponentName.test.jsx` + add a `useCallsign` test — priority book > callsign > ENS > generated (FR-014); registry error falls through to the existing chain (FR-013; SC-006)

### Implementation for User Story 3

- [X] T029 [P] [US3] Create `frontend/src/hooks/useCallsign.js` — reverse lookup via `lookupCallsignOf`, short-TTL cache alongside the ENS cache, error → `null` (null-safe)
- [X] T030 [US3] Insert the callsign step into `frontend/src/hooks/useOpponentName.js` between address book and ENS (`source` union gains `'callsign'`, rendered via `formatCallsign`), preserving spec-040 behavior and its tests (FR-014/016)

**Checkpoint**: Callsigns visible across cards, rosters, activity, address book.

---

## Phase 6: User Story 4 — Change / Release / Repoint Safely (Priority: P2)

**Goal**: Owner-only change/release with 90-day quarantine + 30-day cooldown; 48-hour delayed
repointing (tier-exempt); permissionless lapse reclamation after the 12-month Gold grace.

**Independent Test**: Release → lookups fail and others can't register until quarantine elapses;
change inside cooldown is refused; repoint shows "address changing" during the delay, is
cancellable, and finalizes after; a below-Gold-past-grace callsign becomes reclaimable.

### Tests for User Story 4 (write first, must FAIL)

- [X] T031 [P] [US4] Unit tests in `test/callsignRegistry.test.js` — release → `QUARANTINED` (others revert until `quarantinePeriod`, then succeed); `changeCallsign` inside `changeCooldown` reverts; repoint delay/cancel/finalize with atomic reverse-index move; `reclaimLapsed` only after `expiresAt + lapseGrace` with tier < Gold; an active-but-downgraded membership stays `ACTIVE` until `expiresAt` (honest-state, research R5); SC-004/009
- [X] T032 [P] [US4] Intent tests in `test/callsignRegistry.intents.test.js` — `releaseWithSig` / `changeCallsignWithSig` / `requestRepointWithSig` / `cancelRepointWithSig` execute for valid sigs and revert on replay / expiry / signer≠owner (spec 035 conventions)

### Implementation for User Story 4

- [X] T033 [US4] Implement `release` + full `changeCallsign` (release-old + register-new under one cooldown check) in `CallsignRegistry.sol`; set `quarantinedUntil`, `lastChangeAt`; emit `CallsignReleased`/`CallsignChanged` (FR-017/018/019/020)
- [X] T034 [US4] Implement `requestRepoint` / `cancelRepoint` / `finalizeRepoint` in `CallsignRegistry.sol` — 48h delay, **tier-exempt**, `finalizeRepoint` permissionless after delay, atomic owner + `callsignHashOf` move; emit repoint events (FR-022)
- [X] T035 [US4] Implement permissionless `reclaimLapsed(callsignHash)` in `CallsignRegistry.sol` (`getActiveTier(owner, membershipRole) < minTier` AND `now > expiresAt + lapseGrace`) and extend `_statusOf` with `REPOINTING`/`QUARANTINED`/`SUSPENDED`/`LAPSED_RECLAIMABLE` (FR-021; data-model.md §status)
- [X] T036 [US4] Implement gasless twins `releaseWithSig` / `changeCallsignWithSig` / `requestRepointWithSig` / `cancelRepointWithSig` in `CallsignRegistry.sol` (intents pin `callsignHash`; `finalizeRepoint`/`reclaimLapsed` need no twin)
- [X] T037 [P] [US4] Add `ReleaseCallsignIntent` / `ChangeCallsignIntent` / `RequestRepointIntent` / `CancelRepointIntent` structs to `frontend/src/lib/relay/intentTypes.js` AND `services/relay-gateway/src/intent/intentTypes.js` (byte-identical; gateway policy: short `validBefore` for repoint)
- [X] T038 [US4] Extend `frontend/src/components/account/CallsignPanel.jsx` with change / release / repoint flows surfacing each window (next-change date, 90-day quarantine, 48h "address changing" state + cancel) — honest finality (constitution III)
- [X] T039 [US4] Make resolve consumers refuse `REPOINTING`/`QUARANTINED`/`SUSPENDED` for value-bearing actions in `frontend/src/lib/callsigns/resolveCallsign.js` + `AddressInput.jsx` with truthful status messaging (FR-011/016/022; SC-009)

**Checkpoint**: Full lifecycle with takeover protections; MVP + US3 + US4 stable.

---

## Phase 7: User Story 5 — Business Callsigns, Verification & Moderation (Priority: P3)

**Goal**: Verification marker via operator review; reserved-term + confusable rejection; abuse
reporting and operator suspension that never reassigns a callsign or touches funds.

**Independent Test**: Reserved terms and confusable variants are refused; a verified callsign shows
the marker everywhere; suspending a callsign stops resolution while ownership and assets are untouched.

### Tests for User Story 5 (write first, must FAIL)

- [X] T040 [P] [US5] Unit tests in `test/callsignRegistry.test.js` — `setReserved` blocks registration; `setSuspended` stops resolution without reassigning owner or moving funds; `setVerified` round-trips; an attempted admin/operator callsign-transfer has no code path (FR-004/023/024/025/026; SC-003)

### Implementation for User Story 5

- [X] T041 [US5] Implement `setReserved` (CURATOR) / `setSuspended` (MODERATOR) / `setVerified` (VERIFIER) in `CallsignRegistry.sol` + `SUSPENDED` status handling + events (FR-023/024/026)
- [X] T042 [P] [US5] Render the verification badge wherever `%callsign` appears (`AddressInput` confirmation, `CallsignPanel`, `useCallsign` consumers) and never for unverified callsigns (FR-024)
- [X] T043 [P] [US5] Add an abuse-report affordance to `frontend/src/components/account/CallsignPanel.jsx` / callsign display (routes to the operator process; no backend — emits an on-chain report event or opens the operator contact path) (FR-025)
- [X] T044 [US5] Seed the reserved list at deploy — load `config/reserved-callsigns.json` in `scripts/deploy/deploy-callsign-registry.js` and batch `setReserved` (FR-004)

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Security gates, accessibility, docs, and full validation across all stories.

- [ ] T045 [P] Run Slither on `contracts/naming/CallsignRegistry.sol` — resolve any new high/critical; document accepted findings (constitution I). ⏭️ DEFERRED to CI — Slither is not installed on this host (per repo memory; runs in the CI security gate).
- [ ] T046 [P] Add Medusa fuzz targets for the register/release/repoint/reclaim state machine — invariants: one owner per callsign, one callsign per owner, forward==reverse, no resolution while `QUARANTINED`/`REPOINTING`/`SUSPENDED`, quarantine/delay timestamps never shortened by any call sequence (quickstart §2). ⏭️ DEFERRED — Medusa not installed on this host; the same invariants are asserted deterministically in `test/callsignRegistry.test.js` (US4 lifecycle) as an interim guard.
- [X] T047 Run `npm run check:storage-layout` (new pair) and full `npm test` + `npm run test:frontend` — all green (constitution II/IV). ✅ storage-layout green; `npm test` 831 passing / 0 failing; frontend delta (contract lib, AddressInput, CallsignPanel, useOpponentName, axe) all green — the only red files are pre-existing host limitations (`@uniswap/sdk-core` not installed locally; localStorage/matchMedia quirks), untouched by this branch and CI-green
- [X] T048 [P] Smart-contract security review of `CallsignRegistry.sol` per `.github/agents/smart-contract-security.agent.md`; document EthTrust-SL2 posture in the contract NatSpec (constitution I). ✅ Adversarial review completed; two MEDIUM findings fixed (finalizeRepoint now requires the incoming owner to be Gold-eligible + clears `verified` → closes the lapse-anchor hoarding loophole FR-021; `_commit` rejects re-committing an unexpired public commitment → closes the reveal-griefing DoS) plus initialize zero-role guard; SL2 posture recorded in the contract NatSpec. Spec docs (data-model/research) reconciled to the observable-state lapse formula. Slither/Medusa (T045/T046) remain the CI static-analysis gate.
- [X] T049 [P] axe/Lighthouse accessibility assertions for `CallsignPanel.jsx` and the `AddressInput` callsign affordance — WCAG 2.1 AA (constitution V)
- [X] T050 [P] Docs: add `docs/developer-guide/callsigns.md` + a deploy/runbook note; record addresses in `deployments/` and update CLAUDE.md guardrails if the registry becomes a standing primitive
- [X] T051 Run `specs/054-callsign-registry/quickstart.md` end-to-end (manual dev-chain flow + SC-001…SC-011 mapping) and confirm every success criterion. ✅ Automated scenarios green: §1 contract suite (26 registry tests + storage-layout + `npm test` 831 passing), §3 frontend callsign suites. SC-001…SC-011 each map to a passing test (SC-003 reserved/format reverts; SC-004 quarantine; SC-005 exact-match NONE; SC-006 priority chain; SC-007 AddressInput confirmation; SC-008 unreachable degradation; SC-009 repoint refusal; SC-010 below-Gold reverts + upgrade prompt; SC-011 tagless full-wager integration). ⏭️ §4 live dev-chain walkthrough + §2 slither/medusa remain a pre-deploy manual/CI step.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**.
- **User Stories (Phases 3–7)**: all depend on Foundational.
  - US1 (P1) → US2 (P1) are the MVP and are naturally sequential (US2 resolves what US1 registers).
  - US3 (P2) depends on US2's resolution views/lib.
  - US4 (P2) depends on US1 (needs a registered callsign) and extends `_statusOf`.
  - US5 (P3) depends on US1; independent of US3/US4.
- **Polish (Phase 8)**: depends on all targeted stories.

### Same-file serialization (contract)

`CallsignRegistry.sol` tasks run in this order: T004→T005→T006→T007 (foundational) →
T013→T014 (US1) → T024 (US2) → T033→T034→T035→T036 (US4) → T041 (US5). These are **never**
`[P]` with one another. All `frontend/`, `services/`, `scripts/`, `config/` tasks in distinct
files may parallelize as marked.

### Within Each User Story

- Tests written first and failing before implementation (constitution II).
- Contract state/guards before views before gasless twins before UI.
- Story complete and independently tested before moving to the next priority.

### Parallel Opportunities

- Setup: T002, T003 in parallel.
- Foundational: T008, T009, T010 in parallel (after T004–T007 land).
- US1: T011/T012 (tests) parallel; then T015/T016/T017/T018 parallel; T013→T014 sequential (same file).
- US2: T022/T023 parallel; T025 parallel with T024's tests.
- US4: T031/T032 parallel; T037 parallel with contract work.
- Polish: T045/T046/T048/T049/T050 all parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel — different files):
Task: "Unit tests for register/commit-reveal + tier gate in test/callsignRegistry.test.js"       # T011
Task: "normalizeCallsign validation table in frontend/src/lib/callsigns/__tests__/normalizeCallsign.test.js"     # T012

# After T013/T014 land, parallel supporting files:
Task: "CommitCallsignIntent/RegisterCallsignIntent in frontend/src/lib/relay/intentTypes.js"                # T015
Task: "Same structs + policy in services/relay-gateway/src/intent/intentTypes.js"                 # T016
Task: "normalizeCallsign/isCallsignLike/formatCallsign in frontend/src/lib/callsigns/normalizeCallsign.js"                 # T017
Task: "CallsignRegistry ABI in frontend/src/abis/callsignRegistry.js"                             # T018
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 Setup → Phase 2 Foundational (contract compiles, deploys, storage-layout green).
2. Phase 3 US1 (register, Gold-gated, optional, snipe-proof) → validate independently.
3. Phase 4 US2 (resolve + AddressInput) → validate.
4. **STOP & VALIDATE**: `%callsign` claim + send-by-callsign works end-to-end. Demo/deploy to testnet.

### Incremental Delivery

US3 (display) → US4 (lifecycle + takeover protection) → US5 (verification/moderation), each an
independently testable, deployable increment. Ship US1+US2 to Mordor/testnet before US4/US5.

### Notes

- `[P]` = different files, no incomplete-task dependency.
- EIP-712 structs stay byte-identical across contract typehashes, `frontend/src/lib/relay/intentTypes.js`, and `services/relay-gateway/src/intent/intentTypes.js` (CLAUDE.md three-way sync rule).
- Every gasless action keeps a self-submit fallback (never-stranded rule).
- Storage stays append-only with the trailing `__gap`; run `check:storage-layout` before any future upgrade.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
