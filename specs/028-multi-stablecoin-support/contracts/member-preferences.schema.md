# Contract: Member Stablecoin Preferences (UserPreferencesContext)

Extends the existing `UserPreferencesContext` (client-side, per-wallet localStorage via `userStorage`). No backend, no on-chain change.

## Stored keys (per wallet address)

| localStorage key | Type | Default when absent |
|------------------|------|---------------------|
| `stablecoin_default` | string (symbol or checksummed address) | none ⇒ effective USDC |
| `stablecoin_visibility` | `Record<tokenKey, boolean>` | `{}` ⇒ all supported visible |

## Context API additions

```
preferences.stablecoinDefault          // raw stored value (may be null)
preferences.stablecoinVisibility        // raw stored map (may be {})

setDefaultStablecoin(tokenKey)          // FR-008; persists + updates state
setStablecoinVisibility(tokenKey, bool) // FR-007; persists; enforces INV-2
```

Plus a selector hook layered on config + prefs:

```
useVisibleStablecoins()  -> { list, defaultCoin, isVisible(key), effectiveDefault }
```

## Behavioral contract

| ID | Given | When | Then |
|----|-------|------|------|
| P-1 | no stored prefs | app loads | default = USDC, all supported coins visible (FR-009, SC-004) |
| P-2 | member sets default = EURC | starting a new wager | selector pre-selects EURC (FR-008, US2-3) |
| P-3 | member hides USDT | opening any stablecoin selector | USDT not offered to that member (FR-007, US2-2) |
| P-4 | member hides their current default | toggle visibility off | must pick a replacement default, else default reverts to USDC; default coin is never left hidden-and-selected with no fallback (FR-009, US2-5) |
| P-5 | stored default not on active network | network switch | effective default = USDC; stored value preserved for when they switch back (FR-014, edge) |
| P-6 | stored default references a removed coin | app loads | effective default = USDC (FR-009, edge) |
| P-7 | wallet B connects | after wallet A had prefs | wallet B sees its own prefs/defaults, not A's (FR-010, INV-3) |
| P-8 | coin hidden by member | counterparty created a wager in it | member can still accept/claim/refund it (FR-011, US3-3) — visibility never gates actions |

## Validation

- `tokenKey` is normalized (prefer checksummed address; symbol accepted and resolved via `findStablecoin`).
- Writes are guarded by a connected `account` (mirrors existing `savePreference`).
- Setting visibility/default for a coin not in the active network's supported set is a no-op (defensive).
