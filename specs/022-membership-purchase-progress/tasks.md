---

description: "Task list for Membership Purchase Progress Indicator"
---

# Tasks: Membership Purchase Progress Indicator

**Input**: Design documents from `/specs/022-membership-purchase-progress/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — constitution II (Test-First & Comprehensive Coverage) is
NON-NEGOTIABLE. Within each phase, write the listed tests first and confirm they
FAIL before implementing.

**Organization**: Tasks are grouped by user story. US1 and US2 are both Priority P1;
US3 is P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)
- All paths are repo-relative from the project root.

## Path Conventions

Web app, frontend only — all source under `frontend/src/`, tests under
`frontend/src/test/` (Vitest + @testing-library/react + vitest-axe), per plan.md.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new file scaffolding and confirm test tooling.

- [X] T001 [P] Create stub hook `frontend/src/hooks/usePurchaseFlow.js` exporting an empty `usePurchaseFlow()` returning the `PurchaseProgress` shape from data-model.md (placeholder values)
- [X] T002 [P] Create stub component `frontend/src/components/ui/PurchaseProgressView.jsx` accepting the props from `contracts/purchase-progress-view.md` and rendering an empty ordered list
- [X] T003 Confirm `vitest-axe` matcher is registered in the frontend Vitest setup (locate the existing setup file referenced by `frontend/vite.config.*`/`vitest` config); add the `toHaveNoViolations` matcher import if missing

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared step state machine, the service progress callback, the
presentational view scaffold, and the modal Processing-phase wiring that ALL user
stories build on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Write failing tests for the `onProgress` callback in `frontend/src/test/blockchainService.purchase.test.js`: emits `approve` start/sent/confirmed then `pay` events when allowance < price; emits NO `approve` start/sent/confirmed (only `pay`) when allowance ≥ price; behaves identically to today when `onProgress` is omitted (regression)
- [X] T005 Implement the optional `onProgress` callback in `purchaseRoleWithStablecoin` in `frontend/src/utils/blockchainService.js` per `contracts/on-progress-callback.md` — wrap emissions in try/catch, change NO on-chain calls/args/order (FR-001a), add it as a trailing optional arg/options to preserve existing callers
- [X] T006 Write failing tests for `usePurchaseFlow` step-list construction in `frontend/src/test/usePurchaseFlow.test.js`: builds ordered steps `[approve?, pay, sign, register]`; omits `approve` entirely when the pre-flight allowance read shows allowance ≥ price (FR-009); sets correct `kind`/`blocking` per step (data-model.md)
- [X] T007 Implement `usePurchaseFlow` step-list builder in `frontend/src/hooks/usePurchaseFlow.js`: pre-flight read of allowance (read-only, no wallet prompt) + price, build `PurchaseStep[]`/`PurchaseProgress` state per data-model.md (depends on T006)
- [X] T008 Implement the `usePurchaseFlow` sequential runner in `frontend/src/hooks/usePurchaseFlow.js`: `start()` calls `purchaseRoleWithStablecoin` with `onProgress` mapping `approve`/`pay` events → step state, then runs `sign` (via `ensureInitialized`) and `register` (via `ensureKeyRegistered`) as discrete steps; track `activeIndex`, `status`, and `purchaseReceipt` (depends on T007; same file as T007 — sequential)
- [X] T009 Implement `PurchaseProgressView` base render in `frontend/src/components/ui/PurchaseProgressView.jsx`: ordered semantic list of steps driven by props, applying state classes; reuse existing `ppm-step*` visual tokens (depends on T002)
- [X] T010 Wire the Processing phase into `frontend/src/components/ui/PremiumPurchaseModal.jsx`: replace the single inline "Processing…" path in `handlePurchase` with `usePurchaseFlow`; render `<PurchaseProgressView>` as a dedicated view between Review and Complete; keep the 3-phase top nav and the `isPurchasing` dismissal guard (FR-012); on success advance to the existing Complete step (depends on T008, T009)
- [X] T011 [P] Add Processing-view and step-state styles in `frontend/src/components/ui/PremiumPurchaseModal.css` (active/confirming/completed/failed states; reuse existing tokens; respect existing reduced-motion block)

**Checkpoint**: Foundation ready — the modal shows a multi-step Processing view driven by real wallet events. User stories can now layer specific behaviors.

---

## Phase 3: User Story 1 - See which wallet action I am approving (Priority: P1) 🎯 MVP

**Goal**: Each wallet interaction shows a plain-language label and a clear
transaction-vs-signature indicator matching the open wallet prompt.

**Independent Test**: Run a purchase; as each prompt opens, the active step's label
matches it and signature steps are visibly distinguished from transaction steps.

- [X] T012 [US1] Write failing tests in `frontend/src/test/PurchaseProgressView.test.jsx`: each step renders its human-readable label (FR-002); `kind: 'signature'` steps show a "sign a message / no funds move" indicator while `transaction` steps show a "confirm in wallet / costs gas" indicator (FR-003)
- [X] T013 [US1] Define per-step label + `kind` metadata (`approve`/`pay`/`sign`/`register` → label + `transaction`|`signature`) in the step builder in `frontend/src/hooks/usePurchaseFlow.js`
- [X] T014 [US1] Render the per-step label and transaction-vs-signature indicator with an accessible name in `frontend/src/components/ui/PurchaseProgressView.jsx` (depends on T013)
- [X] T015 [US1] Add an `aria-live="polite"` region announcing the active step label + kind in `frontend/src/components/ui/PurchaseProgressView.jsx` (same file as T014 — sequential)

**Checkpoint**: Members can read, on the modal, exactly which wallet action each prompt is and whether it is a transaction or a signature.

---

## Phase 4: User Story 2 - Track overall progress through the flow (Priority: P1)

**Goal**: Show how many steps there are, which are done/active/pending, and an
overall position that advances as steps complete.

**Independent Test**: During a purchase, completed steps show done, the active step
shows in-progress, pending steps show upcoming, and "step N of M" / a progress bar
advances; an already-approved purchase correctly counts one fewer step.

- [X] T016 [US2] Write failing tests in `frontend/src/test/usePurchaseFlow.test.js` and `frontend/src/test/PurchaseProgressView.test.jsx`: derived `completedCount`/`progressFraction`/`total` advance as steps complete (FR-005); distinct `pending`/`active`/`confirming`/`completed` states render (FR-004, FR-006); omitted approval reduces `total` (FR-009)
- [X] T017 [US2] Add derived selectors (`completedCount`, `progressFraction`, `activeStep`, `total`) to `frontend/src/hooks/usePurchaseFlow.js`
- [X] T018 [US2] Render the overall progress position ("step N of M" and/or proportional bar) and distinct visuals for pending/active/confirming/completed in `frontend/src/components/ui/PurchaseProgressView.jsx` (depends on T017)
- [X] T019 [US2] Add the waiting/confirming affordance (reuse `ppm-spinner`, `role="status"`) for a step awaiting wallet confirmation or tx mining in `frontend/src/components/ui/PurchaseProgressView.jsx` (same file as T018 — sequential)

**Checkpoint**: Members can see overall progress and per-step state advance in real time.

---

## Phase 5: User Story 3 - Understand and recover when a step fails (Priority: P2)

**Goal**: A failed/rejected step is attributed with a reason; completed paid steps
are preserved; retry resumes without re-payment; non-blocking key failures also
offer "Continue anyway".

**Independent Test**: Reject a non-first prompt — that step shows failed with a
reason, earlier steps stay done, and retrying resumes without re-charging; rejecting
a key step offers both Retry and Continue anyway.

- [X] T020 [US3] Write failing tests in `frontend/src/test/usePurchaseFlow.test.js`: a rejected step → `state: 'failed'` + `failureReason` (FR-007); `retry()` after a `pay`-success/`register`-fail resumes ONLY the key step and never re-invokes the purchase (FR-008); `continueAnyway()` is valid only for a non-blocking key-step failure and finalizes `status: 'succeeded'` with `keyRegOutcome: 'failed'` (FR-010)
- [X] T021 [US3] Implement per-step failure capture (`state: 'failed'`, `failureReason`) and `retry()` resume logic in `frontend/src/hooks/usePurchaseFlow.js`: approve/pay retry re-invokes the purchase (internal allowance check skips a done approval — no double-pay); sign/register retry re-runs only that key step using the captured `purchaseReceipt`
- [X] T022 [US3] Implement `continueAnyway()` in `frontend/src/hooks/usePurchaseFlow.js` — finalize as success for a non-blocking key-step failure, recording `keyRegOutcome: 'failed'` (same file as T021 — sequential)
- [X] T023 [US3] Render the failed state with `failureReason` + a "Retry" action, and a "Continue anyway" action shown ONLY for non-blocking key-step failures, in `frontend/src/components/ui/PurchaseProgressView.jsx` (FR-007, FR-010)
- [X] T024 [US3] Ensure the Complete screen shows membership active + the existing "register key later in Security settings" notice when reached via `continueAnyway` in `frontend/src/components/ui/PremiumPurchaseModal.jsx`

**Checkpoint**: All three user stories are independently functional; failures are attributable and recoverable without duplicate payment.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, theming, and full validation across all stories.

- [X] T025 [P] Add/confirm `vitest-axe` zero-violation assertions across idle/running/failed render states in `frontend/src/test/PurchaseProgressView.test.jsx` (FR-013, constitution V)
- [X] T026 [P] Add dark-theme (`:root.theme-dark`) and reduced-motion coverage for the Processing-view styles in `frontend/src/components/ui/PremiumPurchaseModal.css`
- [X] T027 Run `npm run lint` and `npm run test:run` in `frontend/` and resolve any failures (constitution IV — no `continue-on-error`)
- [ ] T028 Execute the `specs/022-membership-purchase-progress/quickstart.md` manual walkthroughs (happy path + recovery) and confirm behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phases 3–5)**: All depend on Foundational. US1 and US2 (both P1)
  are the MVP core; US3 (P2) builds on the same hook/view.
- **Polish (Phase 6)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. Independently testable (labels + kind).
- **US2 (P1)**: After Foundational. Independently testable (progress + states).
  Touches the same hook/view as US1 but no behavioral dependency on it.
- **US3 (P2)**: After Foundational. Independently testable (failure + recovery).

### Within Each User Story / Phase

- Write the listed tests FIRST and confirm they FAIL before implementing.
- Hook/state changes before view rendering that consumes them.
- Tasks editing the same file run sequentially (noted inline); only different-file
  tasks are marked `[P]`.

### Parallel Opportunities

- T001, T002 (Setup) — different files, parallel.
- T011 (CSS) parallel with the JS foundational tasks once the markup contract is set.
- T025 (test file) and T026 (CSS) in Polish — different files, parallel.
- Note: most foundational/US tasks touch the shared `usePurchaseFlow.js`,
  `PurchaseProgressView.jsx`, or `PremiumPurchaseModal.jsx`, so they are largely
  sequential within those files.

---

## Parallel Example: Phase 1 Setup

```bash
# Different files — run together:
Task: "Create stub hook frontend/src/hooks/usePurchaseFlow.js"
Task: "Create stub component frontend/src/components/ui/PurchaseProgressView.jsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2 — both P1)

1. Phase 1: Setup
2. Phase 2: Foundational (CRITICAL — blocks all stories)
3. Phase 3: US1 (labeled steps + transaction/signature) → validate
4. Phase 4: US2 (overall progress + states) → validate
5. **STOP and VALIDATE**: members can identify every prompt and see progress — the
   primary value (SC-001, SC-002). Deploy/demo if ready.

### Incremental Delivery

1. Setup + Foundational → multi-step Processing view live.
2. US1 → labeled, kind-differentiated steps → demo.
3. US2 → progress position + live state → demo.
4. US3 → failure attribution + safe retry / continue-anyway → demo.
5. Polish → a11y/theming/full validation.

---

## Notes

- [P] = different files, no incomplete dependencies.
- This feature is presentation-only (FR-001a): NO contract, pricing, or
  purchase-mechanics changes; the only service edit is the additive `onProgress`
  callback. The no-callback regression test (T004) guards this.
- Verify each phase's tests FAIL before implementing (constitution II).
- Commit after each task or logical group; keep CI green (constitution IV).
- Stop at any checkpoint to validate a story independently.
