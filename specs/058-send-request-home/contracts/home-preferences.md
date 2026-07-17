# Contract: Home Preferences storage (spec 058)

Module: `frontend/src/utils/homePreference.js` (new; device-scoped
localStorage, Pattern B — mirrors `quickAccessPreference.js`).

## Storage

- Key: **`fairwins_home_v1`**
- Value: JSON `{ "defaultMode": "pay"|"request"|"wager",
  "defaultCurrencyKind": "stable"|"native" }`
- Partial objects allowed; unknown fields preserved on write (forward compat).

## API

| Export | Signature | Behavior |
| --- | --- | --- |
| `HOME_MODES` | `['pay','request','wager']` | canonical order (also nav order) |
| `getDefaultHomeMode()` | `() => 'pay'\|'request'\|'wager'` | invalid/missing/corrupt/unavailable storage → `'pay'`; never throws |
| `setDefaultHomeMode(mode)` | validates against `HOME_MODES`; ignores invalid | persists + notifies subscribers |
| `getDefaultCurrencyKind()` | `() => 'stable'\|'native'` | fallback `'stable'`; never throws |
| `setDefaultCurrencyKind(kind)` | validates; ignores invalid | persists + notifies subscribers |
| `subscribe(listener)` | `(fn) => unsubscribe` | fired after any setter; used by HomeScreen ↔ HomePreferencesPanel sync |

## Consumers

- `HomeScreen` — reads both getters once at mount (initial mode + hero
  currency kind); subscribes for live changes.
- `HomePreferencesPanel` (new, account section) — radio groups for both
  settings; writes via setters. Currency choices are rendered with the
  *active network's* real symbols from `useChainTokens()` (e.g. "USDC" /
  "POL"), but the stored value stays the network-agnostic kind.
