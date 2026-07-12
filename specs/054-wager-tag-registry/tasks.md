---
description: "Task list for Wager Tag Naming Registry (spec 054)"
---

# Tasks: Wager Tag Naming Registry

**Input**: Design documents from `/specs/054-wager-tag-registry/`

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

⚠️ **Same-file rule**: `contracts/naming/WagerTagRegistry.sol` is a single file — tasks that
edit it are sequential (never `[P]` with each other or across stories). Frontend/relay/deploy
files in different paths parallelize freely.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Interface + seeds + module scaffolds every story builds on.

- [X] T001 Create `contracts/interfaces/IWagerTagRegistry.sol` from `contracts/wager-tag-registry-interface.md` — `enum TagStatus`, `struct TagInfo`, all function signatures, events, and errors (incl. `InsufficientMembershipTier`, `TagUnavailable`, `TagQuarantined`, `NotTagOwner`, `RepointPending`)
- [X] T002 [P] Create `config/reserved-tags.json` — seed reserved-term list (platform/brand names, `admin`, `support`, `official`, `help`, and operational terms) with a short header comment on curation (FR-004)
- [X] T003 [P] Scaffold `frontend/src/lib/tags/index.js` exporting the module surface (`normalizeTag`, `isTagLike`, `formatTag`, `resolveTag`, `lookupTagOf`) per the frontend contract in `contracts/wager-tag-registry-interface.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The registry contract skeleton + eligibility/validation primitives + deploy +
storage-layout + frontend address wiring. **No user story can begin until this is complete.**

**⚠️ CRITICAL**: T004–T007 all edit `WagerTagRegistry.sol` → strictly sequential.

- [X] T004 Create `contracts/naming/WagerTagRegistry.sol` skeleton: inherit `UUPSManaged` + `SignerIntentBase`; append-only storage for `TagRecord` + mappings (`records`, `tagHashOf`, `quarantinedUntil`, `reserved`, `commitments`, `lastChangeAt`), `membershipRole`, `minTier`, policy params, trailing `__gap`; one-time `initialize(admin, membershipManager, sanctionsGuard, membershipRole)` (moves all state init inline, sets EIP-712 domain `"WagerTagRegistry"`/`"1"`, defaults `minTier=Gold`); declare `REGISTRY_CURATOR_ROLE`/`MODERATOR_ROLE`/`VERIFIER_ROLE` (data-model.md §storage/roles)
- [X] T005 Implement canonical-tag validation `_normalizeAndHash(string) → (string, bytes32)` in `WagerTagRegistry.sol`: enforce 3–20 bytes, `a-z0-9` + single interior hyphen, reject leading/trailing/consecutive hyphen and any uppercase; return canonical string + `keccak256` key (FR-003/FR-005, research R2)
- [X] T006 Implement gate helpers in `WagerTagRegistry.sol`: `_requireGold(user)` = `uint8(IMembershipManager.getActiveTier(user, membershipRole)) >= uint8(minTier)` else revert `InsufficientMembershipTier`; `_requireNotSanctioned(user)` via `ISanctionsGuard` (FR-001/FR-007, research R5 — reads `WAGER_PARTICIPANT_ROLE`)
- [X] T007 Implement `_statusOf(bytes32) → TagStatus` + `getTagInfoByHash` view in `WagerTagRegistry.sol` covering `NONE`/`ACTIVE` only for now (REPOINTING/QUARANTINED/SUSPENDED/LAPSED_RECLAIMABLE land in US4/US5); wire policy-param setters `setPolicyParams` + `setMembershipGate(role, tier)` bounded `tier >= Gold` (data-model.md §status, research R10)
- [X] T008 [P] Create `scripts/deploy/deploy-wager-tag-registry.js` — deploy UUPS proxy via `scripts/deploy/lib/upgradeable.js`, wire membershipManager + sanctionsGuard + `WAGER_PARTICIPANT_ROLE`, record `wagerTagRegistry`/`wagerTagRegistryImpl` in `deployments/<network>.json`
- [X] T009 [P] Register the `wagerTagRegistry`/`wagerTagRegistryImpl` pair in `scripts/deploy/check-storage-layout.js` (gating in CI)
- [X] T010 [P] Add `wagerTagRegistry` resolution to `frontend/src/config/contracts.js` (`getContractAddressForChain('wagerTagRegistry', chainId)`) and the sync-artifact map so addresses come from generated artifacts (constitution V)

**Checkpoint**: Contract compiles, deploys locally, storage-layout passes, address resolvable.

---

## Phase 3: User Story 1 — Register a Wager Tag (Priority: P1) 🎯 MVP

**Goal**: A Gold-tier-or-above member can *optionally* claim a unique `%tag` via commit–reveal;
below-Gold and ineligible accounts are refused on-chain; claim-sniping is prevented.

**Independent Test**: Gold wallet commits → (age) → registers `%testbot`; a second account
can't take the same tag; a Silver/Bronze/None wallet is refused (`InsufficientMembershipTier`);
a tagless account still transacts normally (FR-001a).

### Tests for User Story 1 (write first, must FAIL)

- [X] T011 [P] [US1] Unit tests in `test/wagerTagRegistry.test.js` — commit→wait→register succeeds (Gold **and** Platinum); reverts for duplicate / reserved / bad-format / below-Gold (None/Bronze/Silver) / sanctioned / uncommitted / too-fresh / expired-commitment; committed-name front-run fails (FR-001/002/003/004/006/007; SC-003/010)
- [X] T012 [P] [US1] Unit tests in `frontend/src/lib/tags/__tests__/normalizeTag.test.js` — normalization/validation table (`%` strip, mixed-case → lowercase, hyphen edges, length bounds) mirroring on-chain rules

### Implementation for User Story 1

- [X] T013 [US1] Implement `makeCommitment` + `commit` + `register` in `WagerTagRegistry.sol` (commit–reveal `[minCommitmentAge, maxCommitmentAge]`; guards: canonical, not reserved, not registered, not quarantined, caller holds no tag, `_requireGold`, `_requireNotSanctioned`; set `records`/`tagHashOf`; emit `TagCommitted`/`TagRegistered`) (FR-001/002/006, research R3)
- [X] T014 [US1] Implement gasless twins `commitWithSig` + `registerWithSig` in `WagerTagRegistry.sol` via `SignerIntentBase._verifyIntent` (`CommitTagIntent`/`RegisterTagIntent` typehashes; signer must equal `owner`) with self-submit fallback intact
- [X] T015 [P] [US1] Add `CommitTagIntent` + `RegisterTagIntent` structs to `frontend/src/lib/relay/intentTypes.js` — byte-identical to the typehashes (three-way sync rule)
- [X] T016 [P] [US1] Add the same structs + policy allowlist entries to `services/relay-gateway/src/intent/intentTypes.js` (with a Gold-tier pre-screen note so the gateway doesn't relay a call that will revert)
- [X] T017 [P] [US1] Implement `normalizeTag` / `isTagLike` / `formatTag` in `frontend/src/lib/tags/normalizeTag.js` (single source shared with tests; `formatTag` → `%<tag>`, FR-015)
- [X] T018 [P] [US1] Add the `WagerTagRegistry` ABI to `frontend/src/abis/wagerTagRegistry.js` (hand-maintained per repo convention — sync script only does addresses)
- [X] T019 [US1] Create `frontend/src/components/account/WagerTagPanel.jsx` — two-step commit→register UI (second step enabled after commit ages), gated on `useRoleDetails('WAGER_PARTICIPANT').tier >= MembershipTier.GOLD`, upgrade prompt (not a dead control) for below-Gold, and **Gold-specific** copy for the `InsufficientMembershipTier` revert (must NOT reuse the Silver open-challenge wording — research R5)
- [X] T020 [US1] Mount `WagerTagPanel` in the account settings surface (`frontend/src/pages/WalletPage.jsx` Account/Membership tab) as an optional, non-forced perk — no onboarding/transaction step requires a tag (FR-001a)
- [X] T021 [US1] Integration test `test/integration/wagerTagRegistry.membership.test.js` against a real `MembershipManager` proxy — Gold/Platinum register succeeds, Silver/Bronze/None revert, and a tagless account completes a full wager create/transfer (FR-001a; SC-011)

**Checkpoint**: US1 fully functional — registration works, tier-gated, optional, snipe-proof.

---

## Phase 4: User Story 2 — Send and Interact by Tag (Priority: P1)

**Goal**: Any address-entry surface accepts `%tag`, resolves it exact-match to the owner's
address, and shows full address + verification for confirmation before a value-bearing action.

**Independent Test**: After US1, entering `%testbot` in a wager opponent / transfer / pool /
contact field resolves to the owner and shows the full address; an unknown tag returns "no such
tag" with no near-match; sanctions still apply to the resolved address.

### Tests for User Story 2 (write first, must FAIL)

- [X] T022 [P] [US2] Unit tests in `test/wagerTagRegistry.test.js` — `resolve` returns owner + `ACTIVE`; unknown tag → `NONE` (never a near-match, SC-005); `tagOf` reverse only reports a tag whose forward resolution matches (FR-008 invariant); `isAvailable` correctness
- [X] T023 [P] [US2] Frontend tests `frontend/src/lib/tags/__tests__/resolveTag.test.js` + an `AddressInput` tag-entry test (`%tag` → resolved address shown; non-`ACTIVE` not committable; raw-address entry unaffected)

### Implementation for User Story 2

- [X] T024 [US2] Implement resolution views `resolve(tag)` / `tagOf(address)` / `isAvailable(tag)` in `WagerTagRegistry.sol` — exact-match only after normalization, reverse guarded by the forward==reverse invariant (FR-008/010)
- [X] T025 [P] [US2] Implement `resolveTag` + `lookupTagOf` in `frontend/src/lib/tags/resolveTag.js` — read the contract via `getContractAddressForChain`; return `{ address, status, verified, tag }`; errors → soft-fail (FR-013)
- [X] T026 [US2] Integrate tag entry into `frontend/src/components/ui/AddressInput.jsx` — `isTagLike` input → `resolveTag` → render resolved full address + verification badge in the existing confirmation affordance; only `ACTIVE` is committable; raw-address entry always available and never required; sanctions run on the resolved address (FR-009/011/012)
- [X] T027 [P] [US2] `AddressInput` tests in `frontend/src/test/` — confirmation shows full address (SC-007), non-`ACTIVE` blocked, and registry-unreachable degrades to raw entry (FR-013; SC-008)

**Checkpoint**: MVP complete — register (US1) + resolve/send (US2) work end-to-end.

---

## Phase 5: User Story 3 — Tag-Aware Display Names (Priority: P2)

**Goal**: Counterparty display resolves in order address book > wager tag > ENS > generated,
with tags rendered `%tag`; behavior for tagless counterparties is unchanged.

**Independent Test**: A counterparty with a tag and no address-book entry shows `%tag`; adding a
nickname flips display to the nickname; a tagless counterparty shows the existing chain.

### Tests for User Story 3 (write first, must FAIL)

- [X] T028 [P] [US3] Extend `frontend/src/test/useOpponentName.test.jsx` + add a `useWagerTag` test — priority book > tag > ENS > generated (FR-014); registry error falls through to the existing chain (FR-013; SC-006)

### Implementation for User Story 3

- [X] T029 [P] [US3] Create `frontend/src/hooks/useWagerTag.js` — reverse lookup via `lookupTagOf`, short-TTL cache alongside the ENS cache, error → `null` (null-safe)
- [X] T030 [US3] Insert the tag step into `frontend/src/hooks/useOpponentName.js` between address book and ENS (`source` union gains `'wagerTag'`, rendered via `formatTag`), preserving spec-040 behavior and its tests (FR-014/016)

**Checkpoint**: Tags visible across cards, rosters, activity, address book.

---

## Phase 6: User Story 4 — Change / Release / Repoint Safely (Priority: P2)

**Goal**: Owner-only change/release with 90-day quarantine + 30-day cooldown; 48-hour delayed
repointing (tier-exempt); permissionless lapse reclamation after the 12-month Gold grace.

**Independent Test**: Release → lookups fail and others can't register until quarantine elapses;
change inside cooldown is refused; repoint shows "address changing" during the delay, is
cancellable, and finalizes after; a below-Gold-past-grace tag becomes reclaimable.

### Tests for User Story 4 (write first, must FAIL)

- [X] T031 [P] [US4] Unit tests in `test/wagerTagRegistry.test.js` — release → `QUARANTINED` (others revert until `quarantinePeriod`, then succeed); `changeTag` inside `changeCooldown` reverts; repoint delay/cancel/finalize with atomic reverse-index move; `reclaimLapsed` only after `expiresAt + lapseGrace` with tier < Gold; an active-but-downgraded membership stays `ACTIVE` until `expiresAt` (honest-state, research R5); SC-004/009
- [X] T032 [P] [US4] Intent tests in `test/wagerTagRegistry.intents.test.js` — `releaseWithSig` / `changeTagWithSig` / `requestRepointWithSig` / `cancelRepointWithSig` execute for valid sigs and revert on replay / expiry / signer≠owner (spec 035 conventions)

### Implementation for User Story 4

- [X] T033 [US4] Implement `release` + full `changeTag` (release-old + register-new under one cooldown check) in `WagerTagRegistry.sol`; set `quarantinedUntil`, `lastChangeAt`; emit `TagReleased`/`TagChanged` (FR-017/018/019/020)
- [X] T034 [US4] Implement `requestRepoint` / `cancelRepoint` / `finalizeRepoint` in `WagerTagRegistry.sol` — 48h delay, **tier-exempt**, `finalizeRepoint` permissionless after delay, atomic owner + `tagHashOf` move; emit repoint events (FR-022)
- [X] T035 [US4] Implement permissionless `reclaimLapsed(tagHash)` in `WagerTagRegistry.sol` (`getActiveTier(owner, membershipRole) < minTier` AND `now > expiresAt + lapseGrace`) and extend `_statusOf` with `REPOINTING`/`QUARANTINED`/`SUSPENDED`/`LAPSED_RECLAIMABLE` (FR-021; data-model.md §status)
- [X] T036 [US4] Implement gasless twins `releaseWithSig` / `changeTagWithSig` / `requestRepointWithSig` / `cancelRepointWithSig` in `WagerTagRegistry.sol` (intents pin `tagHash`; `finalizeRepoint`/`reclaimLapsed` need no twin)
- [X] T037 [P] [US4] Add `ReleaseTagIntent` / `ChangeTagIntent` / `RequestRepointIntent` / `CancelRepointIntent` structs to `frontend/src/lib/relay/intentTypes.js` AND `services/relay-gateway/src/intent/intentTypes.js` (byte-identical; gateway policy: short `validBefore` for repoint)
- [X] T038 [US4] Extend `frontend/src/components/account/WagerTagPanel.jsx` with change / release / repoint flows surfacing each window (next-change date, 90-day quarantine, 48h "address changing" state + cancel) — honest finality (constitution III)
- [X] T039 [US4] Make resolve consumers refuse `REPOINTING`/`QUARANTINED`/`SUSPENDED` for value-bearing actions in `frontend/src/lib/tags/resolveTag.js` + `AddressInput.jsx` with truthful status messaging (FR-011/016/022; SC-009)

**Checkpoint**: Full lifecycle with takeover protections; MVP + US3 + US4 stable.

---

## Phase 7: User Story 5 — Business Tags, Verification & Moderation (Priority: P3)

**Goal**: Verification marker via operator review; reserved-term + confusable rejection; abuse
reporting and operator suspension that never reassigns a tag or touches funds.

**Independent Test**: Reserved terms and confusable variants are refused; a verified tag shows
the marker everywhere; suspending a tag stops resolution while ownership and assets are untouched.

### Tests for User Story 5 (write first, must FAIL)

- [X] T040 [P] [US5] Unit tests in `test/wagerTagRegistry.test.js` — `setReserved` blocks registration; `setSuspended` stops resolution without reassigning owner or moving funds; `setVerified` round-trips; an attempted admin/operator tag-transfer has no code path (FR-004/023/024/025/026; SC-003)

### Implementation for User Story 5

- [X] T041 [US5] Implement `setReserved` (CURATOR) / `setSuspended` (MODERATOR) / `setVerified` (VERIFIER) in `WagerTagRegistry.sol` + `SUSPENDED` status handling + events (FR-023/024/026)
- [X] T042 [P] [US5] Render the verification badge wherever `%tag` appears (`AddressInput` confirmation, `WagerTagPanel`, `useWagerTag` consumers) and never for unverified tags (FR-024)
- [X] T043 [P] [US5] Add an abuse-report affordance to `frontend/src/components/account/WagerTagPanel.jsx` / tag display (routes to the operator process; no backend — emits an on-chain report event or opens the operator contact path) (FR-025)
- [X] T044 [US5] Seed the reserved list at deploy — load `config/reserved-tags.json` in `scripts/deploy/deploy-wager-tag-registry.js` and batch `setReserved` (FR-004)

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Security gates, accessibility, docs, and full validation across all stories.

- [ ] T045 [P] Run Slither on `contracts/naming/WagerTagRegistry.sol` — resolve any new high/critical; document accepted findings (constitution I)
- [ ] T046 [P] Add Medusa fuzz targets for the register/release/repoint/reclaim state machine — invariants: one owner per tag, one tag per owner, forward==reverse, no resolution while `QUARANTINED`/`REPOINTING`/`SUSPENDED`, quarantine/delay timestamps never shortened by any call sequence (quickstart §2)
- [ ] T047 Run `npm run check:storage-layout` (new pair) and full `npm test` + `npm run test:frontend` — all green (constitution II/IV)
- [ ] T048 [P] Smart-contract security review of `WagerTagRegistry.sol` per `.github/agents/smart-contract-security.agent.md`; document EthTrust-SL2 posture in the contract NatSpec (constitution I)
- [X] T049 [P] axe/Lighthouse accessibility assertions for `WagerTagPanel.jsx` and the `AddressInput` tag affordance — WCAG 2.1 AA (constitution V)
- [X] T050 [P] Docs: add `docs/developer-guide/wager-tags.md` + a deploy/runbook note; record addresses in `deployments/` and update CLAUDE.md guardrails if the registry becomes a standing primitive
- [ ] T051 Run `specs/054-wager-tag-registry/quickstart.md` end-to-end (manual dev-chain flow + SC-001…SC-011 mapping) and confirm every success criterion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**.
- **User Stories (Phases 3–7)**: all depend on Foundational.
  - US1 (P1) → US2 (P1) are the MVP and are naturally sequential (US2 resolves what US1 registers).
  - US3 (P2) depends on US2's resolution views/lib.
  - US4 (P2) depends on US1 (needs a registered tag) and extends `_statusOf`.
  - US5 (P3) depends on US1; independent of US3/US4.
- **Polish (Phase 8)**: depends on all targeted stories.

### Same-file serialization (contract)

`WagerTagRegistry.sol` tasks run in this order: T004→T005→T006→T007 (foundational) →
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
Task: "Unit tests for register/commit-reveal + tier gate in test/wagerTagRegistry.test.js"       # T011
Task: "normalizeTag validation table in frontend/src/lib/tags/__tests__/normalizeTag.test.js"     # T012

# After T013/T014 land, parallel supporting files:
Task: "CommitTagIntent/RegisterTagIntent in frontend/src/lib/relay/intentTypes.js"                # T015
Task: "Same structs + policy in services/relay-gateway/src/intent/intentTypes.js"                 # T016
Task: "normalizeTag/isTagLike/formatTag in frontend/src/lib/tags/normalizeTag.js"                 # T017
Task: "WagerTagRegistry ABI in frontend/src/abis/wagerTagRegistry.js"                             # T018
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 Setup → Phase 2 Foundational (contract compiles, deploys, storage-layout green).
2. Phase 3 US1 (register, Gold-gated, optional, snipe-proof) → validate independently.
3. Phase 4 US2 (resolve + AddressInput) → validate.
4. **STOP & VALIDATE**: `%tag` claim + send-by-tag works end-to-end. Demo/deploy to testnet.

### Incremental Delivery

US3 (display) → US4 (lifecycle + takeover protection) → US5 (verification/moderation), each an
independently testable, deployable increment. Ship US1+US2 to Mordor/testnet before US4/US5.

### Notes

- `[P]` = different files, no incomplete-task dependency.
- EIP-712 structs stay byte-identical across contract typehashes, `frontend/src/lib/relay/intentTypes.js`, and `services/relay-gateway/src/intent/intentTypes.js` (CLAUDE.md three-way sync rule).
- Every gasless action keeps a self-submit fallback (never-stranded rule).
- Storage stays append-only with the trailing `__gap`; run `check:storage-layout` before any future upgrade.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
