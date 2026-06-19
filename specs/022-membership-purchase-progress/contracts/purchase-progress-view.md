# Contract: `PurchaseProgressView` component

Presentational, stateless render of the purchase step sequence. Owns no
orchestration — it receives state from `usePurchaseFlow` and reports user intent
via callbacks.

## Props

| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `steps` | `PurchaseStep[]` | yes | Ordered steps (approval already omitted when not needed) |
| `activeIndex` | number \| null | yes | Drives the active highlight + live announcement |
| `status` | `'idle' \| 'running' \| 'succeeded' \| 'failed'` | yes | Overall flow status |
| `onRetry` | `() => void` | yes | Invoked by the per-failure "Retry" action |
| `onContinueAnyway` | `() => void` | yes | Shown only when the active failure is a non-blocking key step |

## Rendering contract

- Renders an ordered, semantic list of steps; each item shows: label, a
  transaction-vs-signature indicator (FR-003), and a visual state for
  `pending` / `active` / `confirming` / `completed` / `failed` (FR-004).
- Shows overall progress position — "step N of M" and/or a proportional bar driven
  by `completedCount / total` (FR-005).
- For an `active`/`confirming` step, shows a waiting/in-progress affordance so the
  app does not appear frozen (FR-006); reuse the existing `ppm-spinner`.
- For a `failed` step, shows the `failureReason` and a "Retry" action (FR-007); if
  that step is a non-blocking key step, also shows "Continue anyway" (FR-010).

## Accessibility contract (constitution V, FR-013)

- Each step has an accessible name combining label + kind + state
  (e.g. "Pay for membership, transaction, in progress").
- An `aria-live="polite"` region announces the active step and state changes;
  `role="status"` on the waiting/confirming affordance.
- "Retry" / "Continue anyway" are real buttons with discernible names; focus is
  managed sensibly when they appear.
- Zero `vitest-axe` violations.

## Test expectations (`PurchaseProgressView.test.jsx`)

- Given mixed step states, the correct visual + accessible state renders for each.
- Transaction vs signature indicator differs between `kind` values.
- "Continue anyway" appears only for non-blocking key-step failures, not for
  approve/pay failures.
- `onRetry` / `onContinueAnyway` fire on the respective controls.
- axe: no violations across idle/running/failed snapshots.
