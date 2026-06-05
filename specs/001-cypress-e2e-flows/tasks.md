---
description: "Task list — Cypress E2E flow coverage"
---

# Tasks: Cypress End-to-End Test Flow Coverage

**Input**: Design documents from `specs/001-cypress-e2e-flows/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/test-helpers.md

**Tests**: This feature *is* tests — the "implementation" deliverable is the Cypress specs themselves, so there are no separate test tasks; each user-story task writes the spec that asserts that flow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: which user story (US1–US6); Setup/Foundational/Polish carry no story label
- All paths are repo-relative.

## Conventions (apply to every spec task)

- The suite is mock-wallet + a **real local Hardhat node (chain 1337)** — arrange on-chain preconditions; do not stub `eth_call` (research.md R1).
- Every acceptance scenario in spec.md gets ≥1 assertion that fails on a wrong outcome; a `cy.get('body').should('be.visible')`-only assertion does NOT satisfy the task (FR-008, contracts/test-helpers.md).
- Any spec that sets **global** state (pause/freeze) MUST revert it in `afterEach` (research.md R4, cleanup contract).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the precondition plumbing every flow depends on.

- [ ] T001 Add a Node-side admin-signer task `chainTx` in `frontend/cypress.config.js` using ethers v6 + a public Hardhat test private key (test-only), reading contract addresses from `deployments/hardhat-chain1337-v2.json` (and `MockPolymarketCTF` address), able to send `pause/unpause`, `freezeAccount/unfreezeAccount`, `grantMembership`, and `MockPolymarketCTF.resolveCondition`.
- [ ] T002 Document/verify the local-chain prerequisite in `specs/001-cypress-e2e-flows/quickstart.md` matches reality: `npm run node` + `npm run deploy:local` produce the chain-1337 deployment + synced `HARDHAT_CONTRACTS` the suite reads.

**Checkpoint**: a `cy.task('chainTx', …)` round-trips a tx against the local node.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: shared commands + helpers used by all six story specs. **No story can start until this is done.**

- [ ] T003 Add precondition commands in `frontend/cypress/support/commands.js` wrapping T001: `setProtocolPaused(paused)`, `setAccountFrozen(address, frozen)`, `grantMembershipFor(address, {tier,durationDays})`, `resolveMockCondition(conditionId, payouts)`, `lastWagerId()` (signatures per contracts/test-helpers.md).
- [ ] T004 [P] Add a shared `createAndAcceptWager({resolutionType, creatorIsYes, opponentIndex})` helper + a `restoreGlobalState()` cleanup helper in `frontend/cypress/support/commands.js` (reuse the existing `openCreateWagerModal`/`fillWagerForm`/`switchAccount` patterns from `07-manual-resolution.cy.js`).

**Checkpoint**: helpers compile and a smoke spec can create+accept a wager and read its id.

---

## Phase 3: User Story 1 — Paused-protocol safety (P1) 🎯 MVP

**Goal**: prove pause blocks new activity but not in-flight settlement.
**Independent test**: with the protocol paused, create/accept are blocked and an existing active wager still settles/claims; create works after unpause.

- [ ] T005 [US1] Implement `frontend/cypress/e2e/full/19-paused-protocol.cy.js`: (a) `setProtocolPaused(true)` → assert create blocked w/ paused message; (b) paused → assert accept blocked; (c) create+accept BEFORE pause, then pause → resolve + claim succeed; (d) `setProtocolPaused(false)` → create succeeds. `afterEach` ensures unpaused.

**Checkpoint**: `cypress run --spec '**/19-paused-protocol.cy.js'` passes; this is the MVP slice.

---

## Phase 4: User Story 2 — Frozen-account restrictions (P1)

**Goal**: prove a frozen account cannot move funds and is fully restored on unfreeze.
**Independent test**: freeze account #1, assert create/accept/claim blocked; unfreeze, assert they succeed.

- [ ] T006 [US2] Implement `frontend/cypress/e2e/full/18-frozen-accounts.cy.js`: freeze #1 → assert create + accept blocked (frozen message); resolved wager with frozen winner → assert claim blocked; `setAccountFrozen(addr,false)` → assert each retried action succeeds. `afterEach` unfreezes any frozen account.

---

## Phase 5: User Story 3 — Timeout refunds (P2)

**Goal**: prove no funds are stranded by inaction.
**Independent test**: advance past each deadline and assert the right party/parties reclaim; refund blocked before deadline.

- [ ] T007 [US3] Implement `frontend/cypress/e2e/full/11-refund-timeout.cy.js`: (a) open, unaccepted → `advanceTime(>acceptDeadline)` → creator refunded, status Refunded; (b) refund attempted before deadline → blocked; (c) active oracle wager, unresolved → `advanceTime(>resolveDeadline)` → both parties refunded.

---

## Phase 6: User Story 4 — Oracle auto-resolution (P2)

**Goal**: prove correct settlement per outcome and tie→refund (the fixed bug).
**Independent test**: resolve the mock condition to YES/NO/tie and assert winner/refund + claim.

- [ ] T008 [US4] Implement `frontend/cypress/e2e/full/08-oracle-resolution.cy.js`: Polymarket wager (creator YES) + `resolveMockCondition(id,[1,0])` → trigger resolve via UI → creator wins + claims; `resolveMockCondition(id,[1,1])` (tie) → assert no winner settled, then `advanceTime(>resolveDeadline)` → both refunded; Chainlink/UMA paths asserted if locally wired, else `.skip` with a stated reason (no silent gap).

---

## Phase 7: User Story 5 — Expired-membership gating (P3)

**Goal**: prove an expired membership blocks creation until renewal.
**Independent test**: place #1 in expired-membership state, assert create blocked w/ renewal prompt; renew, assert success.

- [ ] T009 [US5] Implement `frontend/cypress/e2e/full/20-expired-membership.cy.js`: `grantMembershipFor(#1,{durationDays:30})` then `advanceTime(31 days)` (or grant near-zero duration) → as #1 assert create blocked + renewal prompt; renew (purchase/grant) → assert create succeeds.

---

## Phase 8: User Story 6 — Admin panel controls (P3)

**Goal**: prove admin controls work and are gated from non-admins.
**Independent test**: as admin assert the four control groups + treasury-default withdrawal; as non-admin assert hidden/denied.

- [ ] T010 [US6] Implement `frontend/cypress/e2e/full/15-admin-panel.cy.js`: as #0 assert AdminPanel shows tier-config, grant/revoke, freeze/unfreeze, treasury-withdrawal controls and the withdrawal recipient defaults to the configured treasury; `switchAccount(#4)` → assert controls hidden/access denied.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T011 Run `npm --prefix frontend run test:e2e:full` against a fresh `node`+`deploy:local`; fix flakiness/order-dependence (confirm `afterEach` cleanups hold). 
- [ ] T012 Verify SC-002/SC-004: grep `frontend/cypress/e2e/full/` for `cy.get('body').should('be.visible')`-only specs and for any lingering dispute/challenge references; confirm `09-challenge-dispute.cy.js` is gone and the Cypress job still exits non-zero on a failing assertion (Constitution IV).
- [ ] T013 [P] (follow-up, optional) Note in the PR whether to add `test:e2e:full` to per-PR CI (currently weekly torture-test only) so it gates merges.

---

## Dependencies & order

- **Setup (T001–T002)** → **Foundational (T003–T004)** → all user stories.
- **User stories are independent of each other** (different spec files) and can be done in any order or in parallel once Phase 2 is done; recommended order is by priority: US1 → US2 → US3 → US4 → US5 → US6.
- **Polish (T011–T013)** runs after the stories you intend to ship.

## Parallel execution

- After Phase 2, T005/T006/T007/T008/T009/T010 are all `[P]`-eligible (distinct files): they can be implemented concurrently. Only the final `test:e2e:full` run (T011) must be serialized.
- Within Setup/Foundational: T004 is `[P]` with T001/T002 review but depends on the `switchAccount`/form helpers existing (they do).

## Implementation strategy

- **MVP = User Story 1** (paused-protocol): the highest-severity safety control; delivering just T001–T005 already converts the most important stub into a real gate.
- Then layer US2 (freeze) and US3 (refund-timeout) for the full money-safety set, then US4 (oracle/tie), then US5/US6.
- Ship incrementally; each story spec is independently runnable via `cypress run --spec`.
