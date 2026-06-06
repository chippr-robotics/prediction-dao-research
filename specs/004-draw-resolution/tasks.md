---
description: "Task list for Draw Resolution (Both Stakes Returned)"
---

# Tasks: Draw Resolution (Both Stakes Returned)

**Input**: Design documents from `/specs/004-draw-resolution/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: INCLUDED and REQUIRED. Constitution Principle II (Test-First, NON-NEGOTIABLE) mandates that resolution/claim/refund/draw paths — including failure and edge cases — are tested. Write each story's tests first and confirm they fail before implementing.

**Branch**: `004-draw-resolution`

**Organization**: Tasks grouped by user story (from spec.md) for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)
- Exact file paths included.

## Path Conventions

Web3 monorepo (per plan.md): Solidity in `contracts/`, Hardhat tests in `test/`, React app in `frontend/src/`, subgraph in `subgraph/`, ops in `scripts/` + `deployments/`. All paths are repo-root-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a clean baseline before changing the live, non-upgradeable registry (v3 redeploy strategy).

- [ ] T001 Confirm clean baseline on branch `004-draw-resolution`: run `npm run compile` and `npm test` and record that the suite is green before any change (regression guard for SC-007).
- [ ] T002 [P] Confirm the frontend baseline is green: `npm run test:frontend` (so later draw-UI failures are attributable).
- [ ] T003 [P] Decide and record the v3 deterministic salt suffix (e.g. `WagerRegistry-draw`) and the v3 deployment-record filenames `deployments/amoy-chain80002-v3.json` / `deployments/polygon-chain137-v3.json` in a short note at the top of `scripts/deploy/deploy.js` (comment only; no behavior change yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared on-chain spine that BOTH the manual draw (US1) and the Polymarket auto-draw (US2) depend on: the new `Status.Draw`, events/errors, the `_drawConsent` store, and the single `_settleDraw` settlement helper.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [ ] T004 Append `Draw` (value 6) to `enum Status` in `contracts/interfaces/IWagerRegistry.sol` (append-only; do not reorder existing values).
- [ ] T005 Declare new events `WagerDrawn(uint256 indexed wagerId, address indexed creator, address indexed opponent, address by)`, `DrawProposed(uint256 indexed wagerId, address indexed proposer)`, `DrawRevoked(uint256 indexed wagerId, address indexed proposer)` and new external functions `declareDraw(uint256)`, `revokeDraw(uint256)`, and view `drawConsent(uint256) returns (bool,bool)` in `contracts/interfaces/IWagerRegistry.sol` (per `contracts/wager-registry-draw.md`).
- [ ] T006 Add new errors `NotParticipant()`, `DrawNotApplicable()`, `NoDrawProposal()` to `contracts/wagers/WagerRegistry.sol` (reuse `NotActive`/`ResolveExpired`/`AccountFrozenError`/`ConditionNotResolved` as documented).
- [ ] T007 Add the `mapping(uint256 => uint8) private _drawConsent;` store (bit0=creator, bit1=opponent) and the `drawConsent(uint256)` view in `contracts/wagers/WagerRegistry.sol` (keep the public `Wager` struct unchanged — consent stays in this side mapping).
- [ ] T008 Implement the internal `_settleDraw(uint256 wagerId, Wager storage w)` helper in `contracts/wagers/WagerRegistry.sol` following checks-effects-interactions: set `status = Status.Draw`, `delete _drawConsent[wagerId]`, `recordClose` both participants, then `safeTransfer` `creatorStake`→creator and `opponentStake`→opponent, then emit `WagerDrawn` (mirror the `claimRefund` ordering at WagerRegistry.sol:402-410).
- [ ] T009 Update the `Status` enum fixture (add `Draw: 6`) in `test/WagerRegistry.test.js` and any shared test helper that enumerates statuses, so existing suites compile against the new enum.
- [ ] T010 `npm run compile` to confirm the interface + registry + fixtures build with the new surface (no behavior yet beyond `_settleDraw`).

**Checkpoint**: Interface, storage, settlement helper, and fixtures compile. US1 and US2 can now proceed.

---

## Phase 3: User Story 1 - Settle a misunderstood or nullified wager as a draw (Priority: P1) 🎯 MVP

**Goal**: A fully-funded wager can be settled as a draw — mutual consent for participant-resolved types (propose + confirm), arbitrator-solo for `ThirdParty` — returning each party exactly their own stake, recorded as terminal `Status.Draw`.

**Independent Test**: Create + fund an `Either` wager; one participant `declareDraw` (no settle), the other `declareDraw` → status `Draw`, each balance restored to its own stake, `WagerDrawn` emitted; verify a non-participant and an oracle-type wager are rejected. (Maps SC-001, SC-002, SC-002a, SC-005.)

### Tests for User Story 1 (write first, ensure they FAIL) ⚠️

- [ ] T011 [US1] Create `test/WagerRegistry.draw.test.js` with the manual-draw suite skeleton + fixtures (deploy MockERC20, MembershipManager, PolymarketOracleAdapter, WagerRegistry; `createAndAccept` helper for an `Active` wager), mirroring `test/WagerRegistry.test.js` setup (lines 15-99).
- [ ] T012 [US1] In `test/WagerRegistry.draw.test.js`, add mutual-consent tests: (a) creator `declareDraw` leaves status `Active` and emits `DrawProposed`; (b) opponent `declareDraw` settles → `Status.Draw`, creator +creatorStake, opponent +opponentStake, `WagerDrawn` emitted; (c) one-sided proposal does NOT lock — `declareWinner(opponent)` still succeeds afterward.
- [ ] T013 [US1] In `test/WagerRegistry.draw.test.js`, add arbitrator-solo test: `ThirdParty` wager, `arbitrator` `declareDraw` settles immediately; a participant calling `declareDraw` on a `ThirdParty` wager is rejected.
- [ ] T014 [US1] In `test/WagerRegistry.draw.test.js`, add authorization/eligibility tests: non-participant → `NotParticipant`; `declareDraw` on an oracle-type wager → `DrawNotApplicable`/`NotAuthorized`; after `resolveDeadline` → `ResolveExpired`; non-`Active` status → `NotActive`.
- [ ] T015 [US1] In `test/WagerRegistry.draw.test.js`, add fund-correctness tests: unequal stakes (e.g. 30 vs 10) → each gets exactly their own back and Σ returned == escrowed; finality — after `Draw`, `declareWinner`/`declareDraw`/`claimPayout`/`claimRefund` all revert.
- [ ] T016 [US1] In `test/WagerRegistry.draw.test.js`, add `revokeDraw` tests (creator consents then revokes → `DrawRevoked`, bit cleared, opponent-only consent does not settle; `revokeDraw` with no prior consent → `NoDrawProposal`) and a frozen-account test (`AccountFrozenError`) and a paused-contract test (draw still settles — exit path stays open).

### Implementation for User Story 1

- [ ] T017 [US1] Implement `declareDraw(uint256 wagerId)` in `contracts/wagers/WagerRegistry.sol` with `nonReentrant` + `notFrozen(msg.sender)`: require `status == Active` and `block.timestamp <= resolveDeadline`; branch by `resolutionType` — `Either/Creator/Opponent` set the caller's consent bit (emit `DrawProposed` on first set) and call `_settleDraw` once both bits set; `ThirdParty` require `msg.sender == arbitrator` then `_settleDraw`; oracle types revert `DrawNotApplicable`; non-participant revert `NotParticipant`.
- [ ] T018 [US1] Implement `revokeDraw(uint256 wagerId)` in `contracts/wagers/WagerRegistry.sol` with `nonReentrant` + `notFrozen(msg.sender)`: require `status == Active` and caller is a participant with a set consent bit (else `NoDrawProposal`); clear the caller's bit; emit `DrawRevoked`.
- [ ] T019 [US1] Run `npx hardhat test test/WagerRegistry.draw.test.js` and iterate until all US1 tests pass; confirm no regression with `npm test`.

**Checkpoint**: Manual draw (mutual consent + arbitrator) fully functional and independently testable on-chain. This is the MVP.

---

## Phase 4: User Story 2 - Polymarket tie settles automatically as a draw (Priority: P2)

**Goal**: A `Polymarket`-resolved wager whose market resolved as a tie (equal/zero payout numerators) settles a draw immediately on `autoResolveFromPolymarket`, instead of hanging until the deadline; decisive markets still resolve a winner; unresolved still reverts.

**Independent Test**: Resolve a mock condition with `[1,1]` then call `autoResolveFromPolymarket` → `Status.Draw` and both stakes returned without advancing past `resolveDeadline`; `[1,0]` → winner; unresolved → `ConditionNotResolved`. (Maps SC-003, SC-007.)

### Tests for User Story 2 (write first, ensure they FAIL) ⚠️

- [ ] T020 [US2] In `test/integration/oracle/WagerRegistry_Polymarket.test.js`, update/replace the existing tie regression (lines ~78-116): a `[1,1]` tie + `autoResolveFromPolymarket` now expects `Status.Draw` (6) and both stakes returned in the same call (remove the "reverts ConditionNotResolved then deadline-refund" expectation for the tie case).
- [ ] T021 [US2] In the same file, add an invalid-market test: payouts `[0,0]` → `Status.Draw`.
- [ ] T022 [US2] In the same file, add/confirm regression tests: decisive `[1,0]` → `Status.Resolved` with the correct winner per `creatorIsYes`; genuinely-unresolved market → `autoResolveFromPolymarket` reverts `ConditionNotResolved` (no draw).

### Implementation for User Story 2

- [ ] T023 [US2] Extend `autoResolveFromPolymarket(uint256 wagerId)` in `contracts/wagers/WagerRegistry.sol`: after reading `getOutcome`, when `resolvedAt == 0` check `polymarketAdapter.isConditionResolved(w.polymarketConditionId)` — if resolved → `_settleDraw` (tie); else revert `ConditionNotResolved`. When `resolvedAt != 0` keep `_settleOracleWin` (unchanged). Leave `autoResolveFromOracle` (Chainlink/UMA) unchanged (out of scope per research D2) with a code comment noting the deliberate scope boundary.
- [ ] T024 [US2] Run `npx hardhat test test/integration/oracle/WagerRegistry_Polymarket.test.js` and iterate until green; run `npm test` for no regression.

**Checkpoint**: Polymarket tie auto-draws immediately; decisive/unresolved behavior unchanged.

---

## Phase 5: User Story 3 - Understand a draw in the app and in history (Priority: P3)

**Goal**: Authorized resolvers see a clearly-labeled "Draw" option (with propose/confirm UX for participant types) and drawn wagers display a distinct "Draw" status in the active and history views; oracle wagers never show a manual draw control.

**Independent Test**: In the resolution modal, the Draw option appears only for an authorized resolver on an eligible `Active` non-oracle wager and renders Propose → Waiting/Withdraw → Confirm; selecting it calls `declareDraw`; a `draw`-status wager shows a "Draw" badge distinct from "Refunded"/"Resolved" under History. (Maps SC-006.) Frontend tests run against the mocked registry, so this story is independently testable without a live v3 deploy.

### Tests for User Story 3 (write first, ensure they FAIL) ⚠️

- [ ] T025 [US3] In `frontend/src/test/MyMarketsModal.test.jsx`, add tests: Draw option is shown for an authorized resolver on an eligible `Active` wager and hidden for a non-resolver and for oracle-type wagers (mock `resolutionType`, connected address per the existing mock setup at lines ~96-120 and the `getContractAddress` mock gotcha).
- [ ] T026 [US3] In `frontend/src/test/MyMarketsModal.test.jsx`, add tests: participant flow renders Propose / Waiting+Withdraw / Confirm driven by `drawConsent`; selecting Draw calls `registry.declareDraw(id)` and Withdraw calls `registry.revokeDraw(id)`; `ThirdParty` shows a single "Declare draw".
- [ ] T027 [US3] In `frontend/src/test/MyMarketsModal.test.jsx`, add a status-display test: a `draw`-status wager renders the "Draw" label/badge (distinct from "Refunded"/"Resolved") and appears under History.

### Implementation for User Story 3

- [ ] T028 [US3] Regenerate the frontend ABI: copy the compiled ABI from `artifacts/contracts/wagers/WagerRegistry.sol/WagerRegistry.json` into `frontend/src/abis/WagerRegistry.js` so it includes `declareDraw`, `revokeDraw`, `drawConsent`, and the `WagerDrawn`/`DrawProposed`/`DrawRevoked` events (depends on T017–T018, T023).
- [ ] T029 [P] [US3] In `frontend/src/constants/wagerDefaults.js`, add `WagerStatus.DRAW = 'draw'`, add `'draw'` to `TERMINAL_STATUSES`, and ensure the on-chain numeric `Status` `6` decodes to `'draw'` wherever status is mapped.
- [ ] T030 [US3] In `frontend/src/components/fairwins/MyMarketsModal.jsx`, add `'draw'` handling to `getMarketStatus` (~182-221), `getStatusLabel` (~355-370 → "Draw"), `getStatusClass` (~338-353 → `status-draw`), and the terminal-status check (~266-272) so drawn wagers show a distinct badge and land in History.
- [ ] T031 [US3] In `frontend/src/components/fairwins/MyMarketsModal.jsx` `ResolutionModal`, add the "Draw — both parties refunded" option gated by eligibility (`Active` + non-oracle + authorized per `frontend-ui-contract.md`); render Propose/Waiting+Withdraw/Confirm for participant types using a `drawConsent(id)` read, and a single "Declare draw" for `ThirdParty`; wire the writes to `registry.declareDraw(market.id)` and `registry.revokeDraw(market.id)` (replace the `declareWinner` path for the Draw option at ~1698-1730), with a confirmation step explaining the effect.
- [ ] T032 [US3] In `frontend/src/components/fairwins/MyMarketsModal.jsx`, map the new revert reasons (`NotParticipant`, `DrawNotApplicable`/`NotAuthorized`, `NoDrawProposal`, `NotActive`, `ResolveExpired`, `AccountFrozenError`) to friendly user messages in the resolution error handling.
- [ ] T033 [US3] Run `npm run test:frontend` and iterate until US3 tests pass; run ESLint and fix any errors (zero-error gate per Constitution V).

**Checkpoint**: Users can settle and recognize a draw in the app; oracle wagers correctly show no manual draw.

---

## Phase 6: Subgraph (Conditional — gated on D6)

**Purpose**: Index the draw distinctly, ONLY if the deployed subgraph tracks `WagerRegistry`.

- [ ] T034 Verify whether the subgraph indexes `WagerRegistry` (`Wager*` events) or a `ConditionalMarketFactory` (`Market*` events) by inspecting `subgraph/subgraph.yaml` datasources and `subgraph/src/mappings/*.ts`. If it does NOT index `WagerRegistry`, mark Phase 6 out of scope (draw is read from chain via `getUserWagers`) and `log` that decision in the PR description; skip T035–T037.
- [ ] T035 [P] If indexed: add `draw` to the `WagerStatus` enum and `isDraw`/`drawnAt` fields to the `Wager` entity in `subgraph/schema.graphql` (per `contracts/subgraph-contract.md`).
- [ ] T036 [P] If indexed: register the `WagerDrawn` event handler under the `WagerRegistry` datasource in `subgraph/subgraph.yaml` (plus the v3 address + start block). (Pure manifest edit — the mappings change lives in T037.)
- [ ] T037 If indexed: in `subgraph/src/mappings/factory.ts` add `'draw'` at index 6 of the status array AND implement `handleWagerDrawn` (set `status='draw'`, `isDraw=true`, `winner=null`, `drawnAt=event.block.timestamp`); build with `graph codegen && graph build`. (Both `factory.ts` edits live here so this is the single non-`[P]` task on that file.)

**Checkpoint**: Draw is queryable as distinct from refunded/resolved (or explicitly deferred with rationale).

---

## Phase 7: Polish, Security & Deployment (Cross-Cutting)

**Purpose**: Security gates, coverage, accessibility, docs, and the gated v3 redeploy.

- [ ] T038 Run `npm run test:coverage` and confirm the draw/consent/settlement and Polymarket-tie paths are covered (resolution/claim/refund/draw failure + edge cases per Constitution II).
- [ ] T039 Run Slither (`slither .`) on the modified contracts; resolve or document (with rationale) any new finding — zero new high/critical required (Constitution I).
- [ ] T040 Run Medusa fuzzing against the draw + settlement invariants (most importantly Σ returned == Σ escrowed and "no winner paid on a draw"); document results.
- [ ] T041 Smart-contract security-agent review of the diff (`.github/agents/smart-contract-security.agent.md`) focusing on fund custody + the new authorization (mutual consent) and the oracle tie branch; address findings before merge.
- [ ] T042 [P] Run the frontend accessibility audit (axe/Lighthouse) on the resolution modal with the Draw control; confirm WCAG 2.1 AA (labeled, keyboard-reachable, not color-only) (Constitution V).
- [ ] T043 [P] Update docs: note the v3 `Status.Draw`, the draw flow, and the v3 address in the relevant `docs/` and `deployments/` notes; refresh any oracle-resolution doc referencing the Polymarket tie behavior (now auto-draw, not deadline-refund).
- [ ] T044 Deploy WagerRegistry v3 to **Amoy**: `npx hardhat run scripts/deploy/deploy.js --network amoy` (reuses the existing Polymarket adapter — no adapter redeploy, no `setPolymarketAdapter` change); record `deployments/amoy-chain80002-v3.json`.
- [ ] T045 Sync the frontend to the Amoy v3 address (`npm run sync:frontend-contracts:amoy`) and verify `frontend/src/config/contracts.js` + the regenerated ABI; run the `quickstart.md` §5 manual end-to-end draw on Amoy via `npm run frontend`.
- [ ] T046 Run the full `quickstart.md` validation matrix (§1–§5) and confirm every success-criterion mapping (SC-001…SC-007) holds.
- [ ] T047 ⚠️ GATED (explicit user go-ahead + security sign-off; registry is paused for testing): deploy v3 to **Polygon mainnet** via the floppy-keystore flow with `CONFIRM_MAINNET=true`, a pinned `GAS_PRICE_WEI`, and a reliable Polygon RPC; record `deployments/polygon-chain137-v3.json`; sync the frontend (`--network polygon --chainId 137`); verify `getWager` decodes `Status.Draw` and a throwaway draw returns both stakes before announcing.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **BLOCKS US1 and US2** (both call `_settleDraw` / use `Status.Draw`).
- **US1 (Phase 3)**: depends on Foundational. The MVP.
- **US2 (Phase 4)**: depends on Foundational. Independent of US1 (different function — `autoResolveFromPolymarket`), but edits the same file, so sequence after US1 to avoid merge churn.
- **US3 (Phase 5)**: frontend depends on the contract surface from US1/US2 for the regenerated ABI (T028) and on `declareDraw`/`revokeDraw` semantics; frontend *tests* run against mocks so the story is independently testable. Status-display tasks (T029–T030) have no contract dependency.
- **Subgraph (Phase 6)**: gated; depends only on the new `WagerDrawn` event (Foundational T005) and the verification gate (T034).
- **Polish/Deploy (Phase 7)**: depends on all desired stories; T044 (Amoy) precedes T047 (mainnet); T047 is hard-gated.

### Within Each User Story

- Tests written first and confirmed failing, then implementation (Constitution II).
- Contract impl before ABI regen (T028) before frontend wiring that depends on it.

### Parallel Opportunities

- Setup: T002, T003 in parallel (different files).
- Foundational: mostly sequential (same two files); T004/T005 (interface) can pair, then T006/T007/T008 (registry).
- US1 tests T011–T016 all target the **same new file** `test/WagerRegistry.draw.test.js`, so they are NOT `[P]` — author them as independent `describe` blocks but write/commit sequentially to avoid conflicts; impl T017/T018 sequential, then T019.
- US2 tests T020–T022 all target the **same file** `WagerRegistry_Polymarket.test.js` — NOT `[P]`, sequential; impl T023 then T024.
- US3 tests T025–T027 all target the **same file** `MyMarketsModal.test.jsx` — NOT `[P]`, sequential. T029 (constants, different file) IS `[P]`; T030/T031 share the modal file (sequential); T028 (ABI) gated on contract impl.
- Cross-story / cross-file parallelism: once Foundational is done, US3 status constants (T029) can proceed alongside contract work, and the subgraph schema/manifest (T035/T036) are different files. Polish T039/T040/T042/T043 are largely parallel; deploy tasks (T044→T047) are strictly ordered.

---

## Parallel Example: genuinely parallel work (different files)

`[P]` means different files with no incomplete-task dependency. Same-file test groups (T011–T016, T020–T022, T025–T027) are intentionally NOT `[P]` — write them sequentially within their one file.

```bash
# Setup — different files:
Task: "Frontend baseline green: npm run test:frontend"                          # T002 [P]
Task: "Record v3 salt + deploy-record filenames in scripts/deploy/deploy.js"    # T003 [P]

# After Foundational — different files, can overlap with contract work:
Task: "Add WagerStatus.DRAW in frontend/src/constants/wagerDefaults.js"          # T029 [P]
Task: "Add 'draw' enum + Wager fields in subgraph/schema.graphql"                # T035 [P]
Task: "Register WagerDrawn handler in subgraph/subgraph.yaml"                     # T036 [P]

# Polish — different tools/files:
Task: "Slither scan"   # T039      Task: "Medusa fuzz"   # T040
Task: "axe/Lighthouse a11y audit"  # T042      Task: "Docs update"  # T043
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL spine) → 3. Phase 3 US1 → **STOP & VALIDATE**: manual draw works on-chain (mutual consent + arbitrator), funds correct, finality enforced. This is a shippable on-chain MVP (pair with a minimal US3 status label to expose it, or demo via tests/console).

### Incremental Delivery

1. Setup + Foundational → spine ready.
2. + US1 → on-chain manual draw (MVP) → validate.
3. + US2 → Polymarket tie auto-draw → validate.
4. + US3 → app UX + status display → validate.
5. + Subgraph (if applicable) and Polish/Security.
6. Amoy deploy + validate → **gated** mainnet v3 cutover.

### Notes

- [P] = different files, no incomplete-task dependency. Multiple tasks editing the SAME file are NOT [P] (write them sequentially), even if they cover independent test cases.
- Commit after each task or logical group; never push to `main` — PR from `004-draw-resolution` after CI passes (per project workflow rules).
- The Polymarket adapter is reused as-is (no redeploy). Only `WagerRegistry` is redeployed (v3).
- T047 (mainnet) is hard-gated on explicit user confirmation and security sign-off.
