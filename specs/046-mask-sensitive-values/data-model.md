# Phase 1 Data Model: Mask Sensitive Values (Tilt-to-Hide)

This feature has no persistent domain data beyond one boolean preference and
transient in-memory state. "Entities" here are client-side state shapes, not
database or on-chain records.

## Entity: TiltToHidePreference (persisted)

The durable on/off setting. Stored per connected account via the existing
`UserPreferencesContext` → `userStorage` (localStorage, key `tilt_to_hide`).

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `tiltToHide` | boolean | `true` | Whether tilt-to-hide is active for this account. Default enabled (FR-003). |

- **Scope/keying**: per connected wallet address (FR-010). While disconnected or
  not-yet-set, the default (`true`) applies (FR-003).
- **Persistence**: `saveUserPreference(account, 'tilt_to_hide', value, true)`;
  loaded in `UserPreferencesProvider.loadPreferences`.
- **Mutation**: `setTiltToHide(boolean)` (mirrors `setShowZeroBalances`).
- **Validation**: coerced with `Boolean(...)`; no other constraint.
- **Not**: network/chain-scoped, on-chain, or synced across devices (FR-016; out
  of scope for v1).

## Entity: ViewingState (transient, in-memory — never persisted)

The derived moment-to-moment state that decides whether values are currently
masked. Owned by `PrivacyProvider`.

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `hidden` | boolean | — | `true` ⇒ mask now. Derived from orientation + `tiltToHide` + support. |
| `support` | enum | `unknown` \| `supported` \| `unsupported` | `unsupported` on desktop / no sensor / no events within probe window. |
| `permission` | enum | `unknown` \| `prompt` \| `granted` \| `denied` | iOS motion permission; non-iOS resolves to `granted` once events flow. |

**Effective masking rule**:

```
hidden = tiltToHide === true
      && support === 'supported'
      && permission === 'granted'
      && orientationState === 'hidden'
```

If `tiltToHide` is off, or the device is `unsupported`, or permission is
`denied`, then `hidden` is always `false` (values shown — FR-008).

### State transitions (orientationState)

Computed by the pure classifier from `{beta, gamma}` with hysteresis:

```
        beta/gamma → inclination-from-flat
                │
   viewing ─────┼───────────────► hidden
      ▲   (incl ≤ ENTER_FLAT and    │
      │    held for settle delay)   │
      │                             │
      └──────────────◄──────────────┘
        (incl ≥ EXIT_FLAT and
         held for settle delay)
```

- `ENTER_FLAT` < `EXIT_FLAT` (dead-band) prevents flicker near the boundary (FR-005).
- Screen face-down (|beta| near 180°) is classified `hidden` (non-viewing).
- Both portrait and landscape viewing tilts classify `viewing`.
- Constants (`ENTER_FLAT`, `EXIT_FLAT`, settle-ms) live in `lib/privacy/tilt.js`.

## Entity: SensitiveValueField (classification, not stored)

Marks which rendered figures are monetary and therefore wrapped in
`<SensitiveValue>`. Not a data record — a rule for where masking applies.

- **In scope (masked)**: wallet/account balances, portfolio total, category
  subtotals, per-asset amounts and USD values, wager/pool stake amounts,
  activity/transaction-history amounts, pending payout/winnings amounts.
- **Out of scope (never masked)**: participant counts, timers, dates, wager/pool
  IDs, percentages that are not monetary, and other non-currency numbers.

## Contracts touched

None. No Solidity, ABI, subgraph, or deployment artifact changes. All masking is
client-side display state.
