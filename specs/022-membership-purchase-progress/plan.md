# Implementation Plan: Membership Purchase Progress Indicator

**Branch**: `022-membership-purchase-progress` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-membership-purchase-progress/spec.md`

## Summary

When a member confirms a Wager Participant purchase, the modal today collapses a
sequence of distinct wallet interactions — optional USDC approval, payment,
encryption-key signature, and key registration — into a single "Processing…"
spinner. Members cannot tell which wallet prompt they are approving, how far along
they are, or what failed when a prompt is rejected.

This feature adds a **dedicated "Processing" view** between the existing Review and
Complete phases of `PremiumPurchaseModal`. The view renders the ordered wallet
interactions as discrete, labeled steps with live state (pending / active /
completed / failed), an overall progress position, and per-step recovery actions.

The approach is **presentation-only** (FR-001a): no contract, pricing, or
purchase-mechanics changes. The existing purchase logic in
`purchaseRoleWithStablecoin` plus the modal's key-registration flow are
**refactored to emit step progress** (via an optional `onProgress` callback and a
modal-side step state machine) without altering the on-chain calls or their order.
A pre-flight read of the member's stablecoin allowance lets the indicator build the
exact step list up front so the approval step is **omitted entirely** when it is
not needed.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 function components + hooks

**Primary Dependencies**: React, Vite, `ethers` v6 (already used by
`blockchainService.js` / `keyRegistryService.js`); no new runtime dependencies

**Storage**: N/A (transient in-component UI state only; existing `roleStorage`
record-keeping is unchanged)

**Testing**: Vitest + `@testing-library/react` + `@testing-library/user-event`;
`vitest-axe` for accessibility assertions; existing Cypress e2e for membership
flows (`frontend/cypress/e2e/full/20-expired-membership.cy.js` family)

**Target Platform**: Modern browsers (the FairWins React + Vite frontend)

**Project Type**: Web application — frontend only (`frontend/`)

**Performance Goals**: Indicator state transitions are perceived as immediate
(<100 ms) on each wallet event; no added blocking work on the purchase path

**Constraints**: WCAG 2.1 AA (constitution V); honest on-chain state — no implied
finality, pending-confirmation states surfaced truthfully (constitution III);
network-scoped (no testnet/mainnet leakage); no `continue-on-error` on lint/test

**Scale/Scope**: One modal (`PremiumPurchaseModal.jsx`) plus its CSS, one service
function (`purchaseRoleWithStablecoin`), and the modal's key-registration flow.
Net new: one presentational progress component, one step state model/hook, and
their tests. Estimated ~3 source files touched + 2–3 new files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicability | Status |
|-----------|---------------|--------|
| I. Security-First Smart Contracts (NON-NEGOTIABLE) | No `contracts/` changes; presentation-only (FR-001a). No new on-chain calls, no change to call order/args. | ✅ N/A — confirmed no contract edits |
| II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE) | Frontend logic: Vitest unit/integration tests for the new progress component, the step state machine, the `onProgress` emissions, and retry/continue-anyway paths, written alongside the code. Update `blockchainService.purchase.test.js` for the callback. | ✅ Planned |
| III. Honest State, No Mocks in Shipped Paths | Indicator must reflect real wallet/allowance state: omit approval via real allowance read, show pending-confirmation truthfully, never imply finality before a tx is mined. No mock data. | ✅ Planned |
| IV. Fail Loudly in CI | No `continue-on-error`; lint + Vitest must pass. | ✅ Planned |
| V. Accessible, Consistent Frontend | New UI meets WCAG 2.1 AA: `aria-live` announcements on step/state change, accessible names per step, focus handling on retry actions; axe assertions via `vitest-axe`. Contract addresses/ABIs continue to come from generated config (unchanged). | ✅ Planned |

**Additional constraints**: No new core technology introduced (constitution
"Additional Constraints"). No keys/secrets touched. Net result: **PASS, no
violations** — Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/022-membership-purchase-progress/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (UI state model)
├── quickstart.md        # Phase 1 output (validation guide)
├── contracts/           # Phase 1 output (component props + onProgress contract)
│   ├── purchase-progress-view.md
│   └── on-progress-callback.md
└── checklists/
    └── requirements.md  # Existing spec-quality checklist
```

### Source Code (repository root)

```text
frontend/src/
├── components/ui/
│   ├── PremiumPurchaseModal.jsx      # MODIFIED: add Processing phase; drive step
│   │                                 #   state machine; render PurchaseProgressView
│   ├── PremiumPurchaseModal.css      # MODIFIED: styles for the processing view +
│   │                                 #   step states (reuse ppm-step* tokens)
│   └── PurchaseProgressView.jsx      # NEW: presentational ordered-step indicator
│                                     #   (states, progress position, retry/continue)
├── hooks/
│   └── usePurchaseFlow.js            # NEW: step state machine — builds step list,
│                                     #   runs/resumes steps, exposes states+actions
└── utils/
    └── blockchainService.js          # MODIFIED: purchaseRoleWithStablecoin gains an
                                      #   optional onProgress callback (approve/pay
                                      #   sub-steps); no change to on-chain calls

frontend/src/test/
├── PurchaseProgressView.test.jsx     # NEW: rendering, states, a11y (axe), actions
├── usePurchaseFlow.test.js           # NEW: step-list build, resume-without-repay,
│                                     #   omit-approval, non-blocking key failure
└── blockchainService.purchase.test.js# MODIFIED: assert onProgress emissions +
                                      #   approval-skipped omission
```

**Structure Decision**: Web application, frontend only. The work lives entirely
under `frontend/src`. UI is split into a **presentational** `PurchaseProgressView`
(pure render of step state, easily axe-/snapshot-tested) and a **`usePurchaseFlow`
hook** that owns the orchestration/state machine, keeping `PremiumPurchaseModal`
thin and the new logic independently testable. The service change is a minimal,
additive `onProgress` callback so the modal can surface the approve/pay sub-steps
that are otherwise buried inside `purchaseRoleWithStablecoin`.

## Complexity Tracking

> No constitution violations — section intentionally empty.
