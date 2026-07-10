# Tasks: Multisig Policy Engine

**Input**: Design documents from `/specs/049-multisig-policy-engine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — Constitution II (test-first) is non-negotiable for fund-custody contracts;
frontend logic ships with Vitest suites in the same PR.

**Organization**: Grouped by user story; the foundational phase carries the guard contract itself
because every story enforces or reads it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (policy at creation), US2 (see rules), US3 (manage rules), US4 (pre-flight)

## Phase 1: Setup

- [X] T001 Add `@safe-global/safe-contracts@1.4.1` devDependency to root `package.json` and
      confirm `npm run compile` still passes (research R7; fallback documented there if the
      compiler matrix objects).

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ CRITICAL**: the guard + setup helper + their proofs block every user story.

- [X] T002 Implement `contracts/custody/SafePolicyGuard.sol` per
      `specs/049-multisig-policy-engine/contracts/SafePolicyGuard.md`: Guard interface +
      ERC-165, evaluation order (exemptions → delegatecall/gas-refund denial → classify →
      allowlist → cooldown → limits), `configureRules`, all views incl. `previewTransaction`,
      typed custom errors, events. No OZ imports; solc ^0.8.24.
- [X] T003 [P] Implement `contracts/custody/PolicyGuardSetup.sol` per
      `specs/049-multisig-policy-engine/contracts/PolicyGuardSetup.md` (guard-slot sstore,
      `ChangedGuard` log parity, configure call in proxy context).
- [X] T004 [P] Implement `contracts/mocks/MockSafe.sol`: guard-slot storage, `execTransaction`-
      shaped flow (checkTransaction → inner call → checkAfterExecution), `setupDelegate(to,data)`
      to exercise the setup helper under delegatecall (test-only).
- [X] T005 Unit tests `test/custody/SafePolicyGuard.test.js`: every rule alone + combined
      (SC-002), per-asset limits incl. unconfigured-asset passthrough, window open/accumulate/
      reset boundaries, cooldown, allowlist recipient resolution (native / transfer /
      transferFrom / approve / generic call target), exemptions under max-strict policy (SC-003),
      delegatecall + gas-refund + value-to-guard denials, msg.sender-scoped config (each
      address can only configure its own policy), FR-015 config
      validation, error argument payloads, `previewTransaction` parity with enforcement,
      view outputs. Written against MockSafe; must fail before T002 lands, pass after.
- [X] T006 [P] Unit tests `test/custody/PolicyGuardSetup.test.js`: slot write via delegatecall,
      ERC-165 rejection of a non-guard, revert bubbles abort setup, direct-call harmlessness.
- [X] T007 Integration test `test/integration/policy-guard-safe.test.js` with real Safe v1.4.1:
      factory-create vault with PolicyGuardSetup initializer (rules live pre-first-tx),
      execTransaction blocked/allowed paths with typed errors, threshold-approved
      `configureRules` self-tx, `setGuard` ERC-165 attach to an existing vault, policy-less vault
      byte-identical behavior (SC-007 guard).
- [X] T008 Deploy script `scripts/deploy/custody/deploy-policy-guard.js` (mirror
      `deploy-safe-proposal-hub.js`): deploy both contracts, record `safePolicyGuard` +
      `policyGuardSetup` in `deployments/`, verify `npm run sync:frontend-contracts:local`
      propagates to `frontend/src/config/contracts.js` `NETWORK_CONTRACTS`.
- [X] T009 [P] Frontend ABI module `frontend/src/abis/SafePolicyGuard.js` (guard ABI incl.
      errors + events + views, and `PolicyGuardSetup` `enablePolicy` fragment).
- [X] T010 Frontend policy lib `frontend/src/lib/custody/policy.js` per
      `contracts/frontend-integration.md` (status/read/encode/preview/decode/describe exports;
      network gating via `getContractAddressForChain`).
- [X] T011 Vitest `frontend/src/test/custody/policy.test.js`: encode/decode round-trips, all four
      `getPolicyStatus` states, every custom-error decoding, FR-015 client validation,
      `describeRules` window-semantics disclosure.

**Checkpoint**: enforcement engine proven; UI stories can proceed (largely in parallel).

---

## Phase 3: User Story 1 — Attach a policy while creating a vault (P1) 🎯 MVP

**Goal**: Policy step in vault creation; rules live from the vault's first transaction.

**Independent Test**: quickstart §5.1 — create vault with per-tx limit + allowlist, rules render
on detail, violating approved tx blocked, compliant tx executes.

- [ ] T012 [US1] Extend `buildSetupInitializer` in `frontend/src/lib/custody/safeVault.js` with
      optional `{ setupTo, setupData }` (defaults byte-identical; update its unit tests in
      `frontend/src/test/custody/` to pin both paths).
- [ ] T013 [US1] Implement `frontend/src/components/custody/PolicyStep.jsx` (+ styles in
      `Custody.css`): enable/configure the four rules, plain-language summary, skip path,
      network gating, FR-015 warnings.
- [ ] T014 [US1] Wire PolicyStep into `frontend/src/components/custody/CreateVaultWizard.jsx`
      (initializer switches to `buildEnablePolicySetup` output when configured; address preview
      still matches deployment).
- [ ] T015 [P] [US1] Vitest `frontend/src/test/custody/PolicyStep.test.jsx`: skip ⇒ unchanged
      initializer, configured ⇒ setup wiring, summary text, unsupported-network state, axe pass.
- [ ] T016 [US1] Vitest update `frontend/src/test/custody/CreateVaultWizard.test.jsx`: wizard
      end-to-end with and without policy (US1 acceptance scenarios 1–3).

**Checkpoint**: MVP — policy-governed vaults can be created and are enforced on-chain.

---

## Phase 4: User Story 2 — See the rules that govern my vaults (P1)

**Goal**: Policy visibility in vault list + full live-state policy view on vault detail.

**Independent Test**: quickstart §5.2 — badge on policy vault only; detail shows rules + live
window/cooldown state matching chain; foreign-guard vault shows "unrecognized" notice.

- [ ] T017 [US2] Implement `frontend/src/components/custody/PolicyBadge.jsx` and render it in
      `frontend/src/components/custody/VaultList.jsx` (managed summary line; foreign marker).
- [ ] T018 [US2] Implement `frontend/src/components/custody/PolicyPanel.jsx` (read-only half):
      plain-language rules, live `remainingInWindow`/`nextAllowedAt`, window-semantics
      disclosure, foreign-guard and unsupported-network states; mount in
      `frontend/src/components/custody/VaultDetail.jsx`.
- [ ] T019 [P] [US2] Vitest `frontend/src/test/custody/PolicyBadge.test.jsx` +
      `PolicyPanel.test.jsx` (read-only): all four status states, live-state rendering from
      mocked reads, axe pass (US2 acceptance scenarios 1–4).

**Checkpoint**: co-owners see exactly what the chain enforces.

---

## Phase 5: User Story 3 — Manage rules on a deployed vault (P2)

**Goal**: Threshold-approved rule changes; attach-first-policy to existing vaults; lockout-proof.

**Independent Test**: quickstart §5.4 — propose limit raise on 2-of-3 vault: inert at 1 approval,
live at 2; attach flow on a policy-less vault; loosening executes under max-strict policy.

- [ ] T020 [US3] Extend `PolicyPanel.jsx` with the owner-only change flow: edit form reusing
      PolicyStep's rule inputs, current-vs-proposed diff, submit via `buildPolicyChangeTx`
      through the existing spec 043 proposal queue (`vaultTransaction.js`/`proposalHub.js`).
- [ ] T021 [US3] Attach-first-policy flow in `PolicyPanel.jsx` for `none` vaults: queue
      `configureRules` self-tx then `setGuard` self-tx in that order (no unguarded half-set gap
      — `contracts/frontend-integration.md`).
- [ ] T022 [US3] Render pending policy-change proposals distinctly in
      `frontend/src/components/custody/ProposalQueue.jsx` (decode guard-targeted calldata to a
      human diff; approvals bind to exact calldata — FR-009 inherited, show it).
- [ ] T023 [P] [US3] Vitest `frontend/src/test/custody/PolicyPanel.change.test.jsx`: diff
      rendering, queue submission payloads, attach ordering, non-owner sees no management
      actions, axe pass (US3 acceptance scenarios 1–5).

**Checkpoint**: full policy lifecycle manageable from the portal.

---

## Phase 6: User Story 4 — Pre-flight policy feedback (P3)

**Goal**: Violations named before proposing; chain remains the enforcer.

**Independent Test**: quickstart §5.3 — draft transfer to non-allowlisted address ⇒ named rule
warning pre-submit; fix recipient ⇒ warning clears.

- [ ] T024 [US4] Integrate `previewPolicy` into
      `frontend/src/components/custody/ProposeTransactionForm.jsx`: debounce-evaluated warning
      naming rule + values (via `decodePolicyError`), non-blocking submit, none for compliant or
      policy-less vaults; surface the same decoder on failed execution paths (FR-011).
- [ ] T025 [P] [US4] Vitest update `frontend/src/test/custody/ProposeTransactionForm.test.jsx`:
      violation warning content per rule, clear-on-fix, no-policy silence, axe pass.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T026 [P] Wire guard events (`RulesConfigured`, `AllowlistChanged`, `AllowlistEnabled`) into
      the existing `custody` notification domain watcher path (FR-016) and cover with a Vitest
      case alongside the existing custody notification tests.
- [X] T027 [P] Run Slither over `contracts/custody/SafePolicyGuard.sol` +
      `PolicyGuardSetup.sol`; resolve or document findings per Constitution I.
- [X] T028 [P] Developer doc `docs/developer-guide/multisig-policy-engine.md`: architecture,
      trust model, accepted risks (window straddle, unvalued calldata, no-delegatecall
      limitation), deployment/rollout runbook note (Mordor → Polygon).
- [ ] T029 Full verification: `npm run compile`, `npm test`, `npm run test:frontend`, frontend
      lint — quickstart.md §1–§4 outcomes; confirm spec 043 custody suites untouched (SC-007).

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: T001 blocks T007 (real-Safe tests) only; T002 blocks T005/T007/T008;
  T003 blocks T006/T007; T009/T010 block T011 and all UI stories' logic.
- **User stories**: US1 (Phase 3) and US2 (Phase 4) are independent of each other after Phase 2;
  US3 (Phase 5) builds on US2's PolicyPanel; US4 (Phase 6) is independent after Phase 2.
- **Polish** last; T029 is the gate for the PR.

### Parallel opportunities

- T003, T004 alongside T002 groundwork; T006, T009 while T005 runs; after Phase 2: Phases 3, 4,
  and 6 can proceed in parallel; T026–T028 in parallel before T029.

## Implementation Strategy

MVP = Phases 1–3 (enforced policy at creation). Incremental: +Phase 4 (visibility), +Phase 5
(management), +Phase 6 (pre-flight), then polish. Each checkpoint leaves the repo shippable with
spec 043 behavior intact for policy-less vaults.
