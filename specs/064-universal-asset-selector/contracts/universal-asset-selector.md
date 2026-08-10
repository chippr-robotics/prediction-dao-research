# Frontend Contracts: Universal Asset Selector

No smart-contract or HTTP interfaces change. These are the **frontend component /
hook contracts** the feature introduces or wires. They are the stable API other
code depends on and what the Vitest tests assert against.

---

## `UniversalAssetSelect` (component)

`frontend/src/components/ui/UniversalAssetSelect.jsx`

Presentational dropdown of `SelectableAsset` options rendering each with the nested
`AssetLogo`. A superset of the existing `TransferAssetSelect` (adds the logo). Owns
no data derivation, routing, or eligibility — those are the caller's / hook's job.

### Props

| Prop | Type | Default | Meaning |
|------|------|---------|---------|
| `options` | `SelectableAsset[]` | `[]` | Already activity-scoped list (caller applies the capability profile). |
| `value` | `string` | — | Selected option `key`. |
| `onChange` | `(option: SelectableAsset) => void` | — | Fires with the full option on selection. |
| `isGasless` | `(option) => boolean` | `() => false` | Per-row gasless marker source (from `quoteGaslessForAsset`; Bitcoin forced `false`). |
| `disabled` | `boolean` | `false` | Disables the trigger. |
| `label` | `string` | `'Asset'` | Accessible name for the trigger/listbox. |
| `size` | `number` | `28` | `AssetLogo` size in px. |

### Behavior contract

- Renders a button trigger showing the selected option's **nested `AssetLogo`**
  (`<AssetLogo symbol chainId={evmChainId} showBadge />`; for a `btc-native` option
  pass no EVM badge), symbol, network, and balance (balance `null` → pending glyph,
  never `0`).
- Opens a `role="listbox"`; each row is `role="option"` with `aria-selected`, shows
  the nested logo + symbol + network + balance + ⚡ when `isGasless(option)`.
- Keyboard operable: Enter/Space toggles, Escape closes, outside-click closes;
  focus semantics match `TransferAssetSelect` today.
- Decorative logo is `aria-hidden`; symbol + network text always present (FR-015).
- Empty `options` → disabled trigger reading "No assets available" (honest empty
  state, no crash).

---

## `useSelectableAssets` (hook)

`frontend/src/hooks/useSelectableAssets.js`

Builds the activity-scoped, acting-account-aware option list. Generalizes
`TransferForm`'s `assetOptions` `useMemo` (research R1).

### Signature

```js
const {
  options,        // SelectableAsset[]  — already filtered for `activity`
  defaultKey,     // string | null      — activity default (capability profile)
  isGasless,      // (option) => boolean — per-asset gasless quote (BTC → false)
} = useSelectableAssets({ activity, actingAddress })
```

| Input | Type | Meaning |
|-------|------|---------|
| `activity` | `'pay' \| 'request' \| 'wager' \| 'transfer'` | Selects the capability profile that filters kinds. |
| `actingAddress` | `string \| null` | When set (vault/legacy), list that account's holdings; else personal portfolio. |

### Behavior contract

- Assembles options per data-model derivation rules (defaults + Bitcoin + holdings),
  then applies `filterAssetsForActivity(activity, …)`.
- `isGasless(option)` delegates to `useTransfer().quoteGaslessForAsset`, forcing
  `false` for `kind === 'btc-native'` (FR-005; Bitcoin never gasless).
- `defaultKey` from `defaultAssetKey(activity, options, …)` (FR-011, FR-013).
- Recomputed (memoized) on changes to holdings, connected chain, acting account, or
  Bitcoin readiness; never performs new network reads itself.

---

## `lib/assets/assetActivity.js` (pure policy)

```js
export const ASSET_ACTIVITIES = { PAY:'pay', REQUEST:'request', WAGER:'wager', TRANSFER:'transfer' }

// Which SelectableAsset.kind values an activity may offer.
export function allowedKindsForActivity(activity): Array<'native'|'erc20'|'btc-native'>

// Remove options the activity can't act on (non-EVM out of wager, etc.).
export function filterAssetsForActivity(activity, options): SelectableAsset[]

// Activity default selection key per the capability table.
export function defaultAssetKey(activity, options, { connectedChainId, stableAddress }): string | null
```

Contract: pure, synchronous, no hooks/imports of React or chain libs; fully unit
testable. `wager` allows only `erc20`; `pay`/`request`/`transfer` allow all kinds.

---

## Consumer wiring contracts (behavior deltas only)

### `PayPanel` (US1)
- Replace the two-option `<select>` in the `tokenSlot` with `UniversalAssetSelect`
  fed by `useSelectableAssets({ activity: 'pay', actingAddress })`.
- On select, drive amount denomination, balance, and gasless disclosure from the
  option; submit via `useTransfer().send({ asset: selectedOption, to, amount })`.
- Wrong-chain selection → primary action becomes "Switch to {network}" (FR-007).
- Bitcoin selection routes through the existing Bitcoin send path; fee disclosure
  says Bitcoin is never gasless (FR-009, US1 scenario 5).

### `RequestPanel` (US2)
- Replace the `<select>` with `UniversalAssetSelect`
  (`activity: 'request'`). Build the request from the selected option
  (`buildPaymentRequestUri` with the option's token/decimals/chain, or the Bitcoin
  request form for a `btc-native` option).
- Changing the selected asset or acting account invalidates a displayed request
  (FR-010) — extend the existing `safeGenerated` guard to include the asset key.

### `CreateChallengePanel` (US3)
- Replace `token="USDC"` hero with `UniversalAssetSelect`
  (`activity: 'wager'` → ERC-20 only, no native, no Bitcoin), default USDC.
- Pass the selected option's address as `form.token` to `createOpenChallenge`
  (already supported; defaults to USDC when absent). Wrong-chain → switch-gated.
- A non-allowlisted ERC-20 surfaces the existing `NotAllowedToken` friendly error.

### `TransferForm` + `TransferAssetSelect` ("trade" view, US4)
- `TransferForm` builds its list via `useSelectableAssets({ activity: 'transfer', actingAddress })`
  (or keeps its list and swaps the select) and renders `UniversalAssetSelect`, so
  the same assets now show nested logos. Execution flow unchanged (FR-012, SC-002).
- `TransferAssetSelect` becomes a thin re-export/wrapper of `UniversalAssetSelect`
  (or is removed and call sites updated) to avoid two divergent dropdowns.

---

## Test contract (SC-006)

Each contract above ships Vitest coverage: option assembly + activity scoping
(Bitcoin in Pay/Request, out of Wager), per-asset gasless marker, network-switch
gating, Wager denomination via `form.token`, request invalidation on asset change,
nested-logo render per row, listbox a11y roles, and unchanged Transfer asset set.
