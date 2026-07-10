---
description: "Task list for Contract Audit Coverage Restoration & Hardening"
---

# Tasks: Contract Audit Coverage Restoration & Hardening

**Input**: Design documents from `specs/046-contract-audit-coverage/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/coverage-threshold-policy.md](./contracts/coverage-threshold-policy.md), [quickstart.md](./quickstart.md)

**Tests**: This feature's deliverable *is* test coverage + a gate. Test tasks are therefore first-class implementation tasks (US4), plus one fixture test for the gate script (US3) since a mis-built gate can silently pass.

**Organization**: Grouped by user story (spec priorities) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 (Setup/Foundational/Polish carry no story label)
- Exact file paths included in each task

## Path Conventions

Single-project smart-contract repo. Coverage config lives at root (`.solcover.js`,
`hardhat.config.js`, `package.json`); the policy file at root; gate scripts under
`scripts/coverage/`; tests under `test/**`; CI under `.github/workflows/`.

---

## Implementation Status (2026-07-10)

**US1–US3 complete and validated locally; US4 mechanism shipped, per-contract test-authoring deferred.**

- **US1 (P1 MVP) ✅** — Root cause was NOT block gas limit but **EIP-7825**: solidity-coverage
  caps per-tx gas at 2²⁴ (16.7M) when `networks.hardhat.hardfork` ≥ `osaka` (Hardhat 2.28's
  default), and the instrumented `WagerRegistry` deploy exceeds it. Fix: pin a pre-osaka
  hardfork (`prague`) **only under coverage** (`hardhat.config.js`), plus run all non-fork
  suites. Result: **0 out-of-gas (was 210), 674 passing / 0 failing**; WagerRegistry family
  92.86 / 99.43 / 94% (was 0%).
- **US2 (P2) ✅** — `istanbulReporter: json-summary` + first-party post-filter. First-party
  total **91.51% stmts / 73.04% branch / 89.76% funcs / 91.14% lines** (was a vendored-diluted
  31%); weekly summary now prints the first-party numbers.
- **US3 (P2) ✅** — policy file + `check-thresholds.js` gate (8/8 unit tests) wired **blocking**
  into `test.yml` (per-PR, `--scope gated`, `continue-on-error` removed) and `torture-test.yml`
  (weekly, `--scope all`). Gate is **GREEN**.
- **US4 (P3) — partial.** The gate ships as a **ratchet**: each gated contract is enforced at its
  current achieved floor (`min` in the policy; no regression allowed) with `tier` as the documented
  audit target. `baseline` ratcheted 56.68→91. The remaining work (T022–T026) is authoring tests to
  raise each `min` up to its full tier — the `min → tier` deltas in `coverage-threshold-policy.json`
  are the explicit, machine-readable backlog (e.g. `CoinbaseSmartWallet` 48/26 → 90/80,
  `MembershipVoucher` 76/45 → 95/90, oracle-adapter branch coverage). Deferred because each
  verification cycle is an ~8-min coverage run; best done as focused follow-up PRs.
- **Not re-verified locally**: T010 (determinism double-run diff); a single-file non-coverage run +
  the storage-layout compile confirm config integrity, but the full `npm test` suite was not re-run.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ground the work in the real failure and scaffold the toolchain.

- [X] T001 Create `scripts/coverage/` with a `scripts/coverage/README.md` describing the coverage-restore toolchain (config → istanbul summary → first-party filter → threshold gate), referencing this feature's `contracts/coverage-threshold-policy.md`.
- [X] T002 [P] Reproduce the defect: run `TZ=UTC npm run test:coverage` on the current tree, confirm the ~182 `Transaction ran out of gas` failures and that `wagers/WagerRegistry*.sol` report 0%; save the failing-test list to the scratchpad as the before-state.
- [X] T003 [P] Record the last-green baseline (torture run 28345700846, 2026-06-29: statements 56.68 / branches 48.88 / functions 58.05 / lines 62.28) for use as the policy `baseline` (FR-016).

**Checkpoint**: Failure reproduced and baseline captured.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared coverage-mode plumbing every later phase keys off. **No user story can proceed until this is done.**

**⚠️ CRITICAL**: Blocks all user stories.

- [X] T004 Add coverage-mode detection to `hardhat.config.js`: `const COVERAGE = process.env.COVERAGE === 'true' || process.argv.includes('coverage');` (used to scope coverage-only network settings so `npm test`/gas-report stay realistic — research R1/R8).
- [X] T005 Update `package.json` `test:coverage` to export `COVERAGE=true TZ=UTC` (parity + coverage-mode flag) — glob change follows in T007.

**Checkpoint**: Coverage-mode primitive available.

---

## Phase 3: User Story 1 - Restore a trustworthy coverage run (Priority: P1) 🎯 MVP

**Goal**: Coverage completes green — zero instrumentation OOM, all first-party suites run, WagerRegistry family reports real non-zero coverage, deterministic.

**Independent Test**: `TZ=UTC npm run test:coverage` exits 0 with no `ran out of gas` failures; `WagerRegistry`/`WagerRegistryCore`/`WagerRegistryIntents` show non-zero; repeat run is identical (quickstart Scenarios 1–2, SC-001/002/007).

### Implementation for User Story 1

- [X] T006 [US1] In `hardhat.config.js` under the `COVERAGE` branch, set `networks.hardhat.blockGasLimit` to large headroom (e.g. `0x1fffffffffffff`) and `initialBaseFeePerGas: 0` (research R1). Leave non-coverage defaults untouched.
- [X] T007 [US1] Change the `test:coverage` `--testfiles` glob in `package.json` to run **all non-fork suites** — `test/**/*.test.js` excluding `test/fork/**` (adds the currently-omitted `pools`, `account`, `intent`, `clearpath`, `custody`, `tokens` suites — research R2).
- [X] T008 [US1] Run `TZ=UTC npm run test:coverage`; confirm exit 0 and **zero** out-of-gas failures. If any remain, raise the `blockGasLimit` value and re-run until green (first gating validation).
- [X] T009 [US1] Confirm the two-facet registry is exercised through `test/helpers/proxy.js#deployWagerRegistry` (merged-ABI proxy) so both `WagerRegistry.sol` and `WagerRegistryIntents.sol` report real coverage (FR-003).
- [ ] T010 [P] [US1] Determinism check: run coverage twice and diff `coverage/lcov.info` (pre-summary) — identical per-file numbers over unchanged code (SC-007).

**Checkpoint**: 🎯 MVP — the weekly Coverage Analysis failure is resolved; numbers are trustworthy. Deployable/demoable.

---

## Phase 4: User Story 2 - Measure first-party code only, report it honestly (Priority: P2)

**Goal**: The reported total excludes vendored + test-only code; the weekly summary shows the first-party number, not the diluted blend.

**Independent Test**: After a coverage run, the first-party total excludes `account/lib/**`, `contracts/test/**`, `contracts/mocks/**`, and interfaces, and the weekly summary prints that number (quickstart Scenario 3, SC-003).

### Implementation for User Story 2

- [X] T011 [US2] Add `istanbulReporter: ['json-summary', 'lcov', 'text']` to `.solcover.js` so `coverage/coverage-summary.json` is produced (both workflows already try to read it — research R4).
- [X] T012 [US2] Add safe `skipFiles` entries in `.solcover.js` for self-contained vendored closures (`account/lib/**`, `pools/SemaphoreDeploy.sol`) and re-run coverage to confirm first-party contracts (esp. `account/*` wallets and `wagers/*`) do **not** collapse in attribution; if any do, remove that `skipFiles` entry and rely on the post-filter instead (research R3 caveat).
- [X] T013 [P] [US2] Implement `scripts/coverage/lib/first-party.js` — given `coverage-summary.json` + the policy's `excluded`/`gated`/`reportOnly`, return the first-party file set and the **derived first-party total** (data-model Entity 3). Pure function, no side effects.
- [X] T014 [US2] Replace the vendored-blend snippet in `.github/workflows/torture-test.yml` (coverage-report job `$GITHUB_STEP_SUMMARY`) with the first-party derived total from `scripts/coverage/lib/first-party.js` (FR-008).
- [X] T015 [US2] Validate: run coverage and confirm the first-party total differs from istanbul's raw blended `total` and excludes all vendored/test paths (SC-003).

**Checkpoint**: Honest first-party numbers surface in the weekly summary (still unenforced).

---

## Phase 5: User Story 3 - Enforce coverage thresholds automatically, failing loudly (Priority: P2)

**Goal**: A drop below a gated contract's tier — or a new gated contract without tests — fails the pipeline (per-PR and weekly), naming the contract and metric.

**Independent Test**: Weaken a security-critical test → gate exits non-zero naming contract+metric; restore → exits 0 (quickstart Scenario 4, SC-005/SC-009).

### Implementation for User Story 3

- [X] T016 [US3] Author `coverage-threshold-policy.json` at repo root per [contracts/coverage-threshold-policy.md](./contracts/coverage-threshold-policy.md): `tiers` (95/90·90/80·80/70), `gated`, `reportOnly` (token templates + `ExternalDAORegistry` + `ERC1271InputGenerator`, each with rationale), `excluded`, and `baseline` from T003.
- [X] T017 [US3] Implement `scripts/coverage/check-thresholds.js` — reuse `scripts/coverage/lib/first-party.js`; support `--summary/--policy/--scope gated|all`; print the full per-contract table; exit non-zero on any gated violation or baseline regression; a gated contract absent from the summary counts as a violation (data-model Entity 4; FR-010/FR-012).
- [X] T018 [P] [US3] Add `test/coverage/check-thresholds.test.js` — feed a synthetic summary that passes and one with a gated contract below tier; assert exit codes, the named-contract/metric message, and that `reportOnly` rows never fail (prevents a false-green gate).
- [X] T019 [US3] Wire the per-PR gate in `.github/workflows/test.yml` (`smart-contract-tests` job): **remove `continue-on-error: true`** from the coverage step, add a blocking "Enforce coverage thresholds" step running `check-thresholds.js --scope gated`, keep the coverage artifact upload on failure (FR-011).
- [X] T020 [US3] Wire the weekly gate in `.github/workflows/torture-test.yml` (`coverage-report` job): add a blocking `check-thresholds.js --scope all` step after the first-party summary (FR-011).
- [X] T021 [US3] Validate SC-005/SC-009: temporarily skip a `WagerPool`/`MembershipVoucher` test, confirm the gate fails naming the contract+metric; restore and confirm it passes.

**Checkpoint**: Coverage regressions now blocked before merge and weekly.

---

## Phase 6: User Story 4 - Close the coverage gaps on funds-handling & security-critical contracts (Priority: P3)

**Goal**: Every gated contract meets its tier, with funds-handling paths and revert/guard branches covered; ratchet the baseline up.

**Independent Test**: `check-thresholds.js --scope gated` exits 0; each named guard branch has a covering test (quickstart Scenario 5, SC-004/006/008).

> Scope note: after US1 makes the omitted suites count, several contracts may already pass. Do each task below **only for contracts still below tier** per the T008 report; log any contract intentionally left short as a `reportOnly` deferral with rationale (no silent caps).

### Implementation for User Story 4

- [ ] T022 [P] [US4] Bring `contracts/pools/WagerPool.sol` to Tier A: extend `test/pools/WagerPool.test.js` / `WagerPool.security.test.js` covering creator payout-matrix resolve, member approval-to-fraction threshold, per-index claim, duplicate-winner guard, sanctions-guard denial, and both deadline reverts (FR-014/FR-015).
- [ ] T023 [P] [US4] Bring `contracts/account/*` to Tier B integration surface: extend `test/account/wallet.test.js`, `factory.test.js`, `webauthn.test.js` for `ERC1271.isValidSignature`/`replaySafeHash` (valid + revert), factory `createAccount`/`getAddress` (fresh + already-deployed), and `MultiOwnable` add/remove owner + `onlyOwner` reverts (research R7).
- [ ] T024 [P] [US4] Bring oracle auto-resolution branches to Tier B: extend `test/oracles/UMAOptimisticOracleV3Adapter.test.js` and `test/oracles/ChainlinkFunctionsOracleAdapter.test.js` for resolved / unresolved / already-resolved / adapter-unset branches (FR-015).
- [ ] T025 [P] [US4] Bring `contracts/access/MembershipVoucher.sol` to Tier A: add `test/access/MembershipVoucher.test.js` covering redemption success and revert branches (expired, already-redeemed, wrong-tier, sanctions) beyond the existing integration coverage (FR-014/FR-015).
- [ ] T026 [P] [US4] Bring `contracts/upgradeable/SignerIntentBase.sol` to Tier B: extend `test/intent/SignerIntentBase.erc1271.test.js` for the `…WithSig`/`…WithAuthorization` signature-intent paths plus replay/expiry reverts (FR-015).
- [X] T027 [US4] Re-run coverage; ratchet `coverage-threshold-policy.json` `baseline` up to the achieved first-party totals and confirm `check-thresholds.js --scope gated` exits 0 for the full gated set (SC-004/SC-006).

**Checkpoint**: All gated contracts meet their tiers; baseline ratcheted.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T028 [P] Add a coverage/audit-gate runbook at `docs/developer-guide/coverage-and-audit-gates.md` (how the gate works, the policy file, the report-only deferral list, and how to promote a `reportOnly` contract into `gated` when it ships); link it from `mkdocs.yml`.
- [ ] T029 [P] Confirm guardrails unaffected: `npm run check:storage-layout` green (no contract state touched), `npm test` (non-coverage) unchanged by the coverage-only gas settings, and Slither/Medusa jobs untouched (FR-017/FR-018).
- [ ] T030 Run the full quickstart.md validation (Scenarios 1–6) and confirm SC-001…SC-009; verify local and CI give the same verdict.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup — **blocks all user stories** (T004/T005 primitives).
- **US1 (Phase 3)**: after Foundational. **Prerequisite for US2–US4** (nothing can be measured, filtered, gated, or gap-closed until coverage runs green).
- **US2 (Phase 4)**: after US1 (needs a green run to summarize; `coverage-summary.json` from T011).
- **US3 (Phase 5)**: after US2 (gate reuses the first-party lib T013 and needs the summary T011).
- **US4 (Phase 6)**: after US1 for measurement; the gate (US3) defines "done." In practice run US3 then US4 so the gate tells you which contracts still need tests.
- **Polish (Phase 7)**: after the desired user stories.

### User Story Dependencies

- US1 is the hard prerequisite (unlike a typical independent-stories feature — measurement must work first).
- US2 → depends on US1. US3 → depends on US2 (shared first-party lib + summary). US4 → depends on US1 (measurement) and is validated by US3's gate.

### Within Each User Story

- US1: T006 & T007 before T008 (validation); T009/T010 after green.
- US2: T011 before T014/T015; T013 is independent [P].
- US3: T016 + T013 before T017; T018 [P]; T017 before T019/T020; T021 last.
- US4: T022–T026 are independent [P] (different test files); T027 last (ratchet).

### Parallel Opportunities

- Setup: T002, T003 [P].
- US1: T010 [P] after green.
- US2: T013 [P].
- US3: T018 [P] (gate unit test) alongside wiring.
- US4: **T022–T026 all [P]** (distinct test files, no shared edits).
- Polish: T028, T029 [P].

---

## Parallel Example: User Story 4

```bash
# After US1 makes the suites count and US3's gate reports which contracts are short,
# launch the gap-closing test tasks together (different files, no conflicts):
Task: "T022 WagerPool deep-path tests in test/pools/WagerPool*.test.js"
Task: "T023 account/* integration-surface tests in test/account/*.test.js"
Task: "T024 oracle auto-resolution branch tests in test/oracles/{UMA,ChainlinkFunctions}*.test.js"
Task: "T025 MembershipVoucher redemption tests in test/access/MembershipVoucher.test.js"
Task: "T026 SignerIntentBase …WithSig/…WithAuthorization tests in test/intent/SignerIntentBase.erc1271.test.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1.
4. **STOP and VALIDATE**: `TZ=UTC npm run test:coverage` green, 0 OOM, WagerRegistry non-zero — the weekly torture-test failure is resolved. Ship this first.

### Incremental Delivery

1. Setup + Foundational → primitives ready.
2. US1 → coverage green & trustworthy → **MVP** (fixes the reported failure).
3. US2 → honest first-party numbers in the summary.
4. US3 → thresholds enforced, blocking, per-PR + weekly.
5. US4 → close residual gaps to hit the tiers; ratchet the baseline.
6. Polish → runbook + guardrail confirmation + full quickstart validation.

### Notes

- No `contracts/` logic or storage changes — keeps `check:storage-layout` green and needs no contract security review; Slither/Medusa preserved (FR-017/FR-018).
- Coverage-only gas settings must never leak into `npm test`/gas-report (T004 scoping).
- `reportOnly` contracts are measured and printed but never fail the gate; promote them to `gated` when they launch (T028 runbook).
- Commit after each task or logical group; stop at any checkpoint to validate independently.
