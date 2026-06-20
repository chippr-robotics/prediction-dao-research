# Phase 1 Data Model: Membership Purchase Progress Indicator

This feature introduces **no persisted or on-chain data**. The model below
describes transient, in-component UI state owned by `usePurchaseFlow` and consumed
by `PurchaseProgressView`. Field names are indicative; exact shapes are finalized in
implementation.

## Entity: PurchaseStep

One required wallet interaction in the purchase sequence.

| Field | Type | Notes |
|-------|------|-------|
| `id` | enum: `approve` \| `pay` \| `sign` \| `register` | Stable identifier used for retry targeting |
| `label` | string | Plain-language name shown to the member (e.g. "Approve USDC spending", "Pay for membership", "Sign to set up private wagers", "Register your encryption key") |
| `kind` | enum: `transaction` \| `signature` | Drives the "confirm in wallet (costs gas)" vs "sign a message (no funds move)" distinction — FR-003 |
| `state` | enum: `pending` \| `active` \| `confirming` \| `completed` \| `failed` | `active` = wallet prompt awaiting member; `confirming` = tx awaiting mining — FR-004, FR-006 |
| `blocking` | boolean | `true` for `approve`/`pay`; `false` for `sign`/`register` (membership already active) — FR-010 |
| `failureReason` | string \| null | Plain-language reason when `state === 'failed'` — FR-007 |
| `txHash` | string \| null | Set for `transaction` steps once sent; used for an optional explorer link |

### State transitions (per step)

```text
pending ──> active ──> confirming ──> completed        (transaction steps)
pending ──> active ──────────────────> completed        (signature steps)
   any active/confirming ──> failed                      (rejection or error)
   failed ──> active                                     (Retry; no re-payment for prior steps)
```

### Validation / invariants

- `kind = signature` ⇒ step never enters `confirming` and never carries gas cost.
- `id = approve` is present **only when** the pre-flight allowance read shows
  `allowance < price` (otherwise omitted entirely) — FR-009.
- At most one step is `active` or `confirming` at a time.
- A `failed` non-blocking step (`sign`/`register`) MUST NOT block reaching the
  completion confirmation; "Continue anyway" finalizes the flow as success — FR-010.

## Entity: PurchaseProgress

Overall state of the in-flight purchase (the `usePurchaseFlow` return value).

| Field | Type | Notes |
|-------|------|-------|
| `steps` | `PurchaseStep[]` | Ordered list for the chosen action, built up front (approval omitted when not needed) — FR-001, FR-005, FR-009 |
| `activeIndex` | number \| null | Index of the current `active`/`confirming` step; `null` before start or after completion |
| `total` | number | `steps.length`; used for "step N of M" / proportional bar — FR-005 |
| `status` | enum: `idle` \| `running` \| `succeeded` \| `failed` | Overall flow status |
| `purchaseReceipt` | object \| null | Captured once `pay` confirms; enables resume of key steps without re-payment — FR-008 |
| `keyRegOutcome` | enum: `null` \| `success` \| `skipped` \| `failed` | Mirrors existing key-registration result for the Complete screen |

### Derived selectors

- `completedCount` = count of `state === 'completed'` steps.
- `progressFraction` = `completedCount / total` (for the proportional bar).
- `activeStep` = `steps[activeIndex]` (for the live region announcement).

### Action interface (exposed by `usePurchaseFlow`)

| Action | Behavior |
|--------|----------|
| `start()` | Pre-flight allowance read → build `steps` → run sequentially, updating step state from `onProgress` + key-flow awaits |
| `retry()` | Resume from the first `failed` step; for `sign`/`register` failures, re-run only the key step (never the purchase) — FR-008 |
| `continueAnyway()` | Valid only when the sole remaining failure is a non-blocking key step; sets `status = 'succeeded'`, records `keyRegOutcome = 'failed'`, advances to Complete with the "register later" notice — FR-010 |

## Mapping to existing code

| Model element | Source today | Change |
|---------------|--------------|--------|
| `approve` / `pay` step events | inside `purchaseRoleWithStablecoin` | emit via new optional `onProgress` callback (R1) |
| `sign` step | `ensureInitialized()` in modal | becomes its own tracked step (R3) |
| `register` step | `ensureKeyRegistered()` in modal | becomes its own tracked step (R3) |
| `keyRegOutcome` | existing `keyRegStatus` state | reused for the Complete screen messaging |
