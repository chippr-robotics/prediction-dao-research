# Data Model: Unified My Account Experience

Frontend-only view models — no storage, contract, or subgraph changes.

## AccountCard (derived, read-only)

One entry of `useAccountSwitcher().accounts`, rendered as a card.

| Field | Type | Source | Notes |
|---|---|---|---|
| `id` | string | switcher | `'personal'` \| `` `vault:${addr}` `` \| `` `legacy:${addr}` `` — stable key + active marker |
| `kind` | `'personal'\|'vault'\|'legacy'` | switcher | drives kind chip + card accent |
| `address` | string | switcher | avatar seed + shortened display |
| `label` | string | switcher | `'Personal wallet'`, vault label, or short address |
| `chainId` | number? | vaults only | vault network chip via strict `NETWORKS[chainId]` lookup |
| `entry` | object? | legacy only | encrypted-vault entry handed to the unlock dialog |

**State**: `isActive = (id === currentId)`. Selection transitions:

- `personal`/`vault` card → `choose(acc)` → CustodyContext switches immediately.
- `legacy` card → `choose(acc)` → `unlockEntry` set → dialog → `onUnlocked(signer)`
  → CustodyContext switches; close/cancel → no change.

## AccountView (config constant)

`ACCOUNT_VIEWS` in `config/appNav.js` — the three lower-half views.

| Field | Type | Notes |
|---|---|---|
| `id` | `'activity'\|'portfolio'\|'stats'` | URL value for `?view=`; `activity` is default (param omitted) |
| `label` | string | switcher label |
| `icon` | string | NavIcon name (`clock` / `trending` / `reports`) |

**Validation**: `accountViewFromParam(param)` — unknown/missing → `ACCOUNT_DEFAULT_VIEW`.

## useAccountStats options (extended)

| Option | Type | Behavior |
|---|---|---|
| `range` | string | unchanged |
| `accountAddress` | string? | when set, every address-scoped read (wagers, ledger, stable balance, summary math) targets it; when it differs from the connected wallet, native balance is read directly via provider and replaces the wallet-context figure; balances clear on address change |

**Invariant (FR-009)**: no figure derived from the connected wallet may render
while an acting override is active; a read failure keeps the last value only
within the same address, never across addresses.

## Relationships

```text
useAccountSwitcher ──accounts──► AccountCardsCarousel ──choose()──► CustodyContext
        ▲                                                            │ active
        └──────────────── WalletButton dropdown ◄────────────────────┘
                                                                     ▼
                                                          useEffectiveAccount
                                                                     │ address (acting)
                 ┌───────────────────────────┬───────────────────────┤
                 ▼                           ▼                       ▼
        Activity view                  Stats view              Portfolio view
   (useAccountStats.activity)      (useAccountStats)      (usePortfolio, already
    + breakdowns, acting-scoped)    acting-scoped)          acting-scoped, spec 063)
```
