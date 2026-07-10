# Interface Contract: Asset Taxonomy Registry & Portfolio Hook

**Feature**: 044-connected-account-portfolio

No on-chain or HTTP contracts — this feature exposes two internal module interfaces
that other frontend code (and tests) rely on.

## `frontend/src/config/assetTaxonomy.js`

```js
// Ordered array: the five regulatory categories + unclassified (always last).
export const TAXONOMY_CATEGORIES // TaxonomyCategory[]

// Classification source ids (FR-006 precedence order, highest first).
export const CLASSIFICATION_SOURCES // ['sec-baseline', 'curated-registry', 'app-config']

// Symbol-level SEC commodity baseline (uppercase symbols).
export const SEC_COMMODITY_BASELINE // Set<string> semantics (exported as array)

// Per-network registry. Pure function of config — no chain reads, no async.
// Returns [] for unknown chainIds (drives the FR-014 "unsupported" state).
export function getPortfolioRegistry(chainId) // RegistryAsset[]

// Lookup helper for descriptions/labels; returns the unclassified category
// for unknown ids rather than undefined.
export function getTaxonomyCategory(categoryId) // TaxonomyCategory
```

Guarantees:
- Every `RegistryAsset.chainId` equals the argument (no cross-network leakage, FR-007).
- No duplicate `id` within a chain; source precedence already applied.
- Native entry (`kind: 'native'`) present for every supported chain.
- All five regulatory category ids referenced by entries exist in `TAXONOMY_CATEGORIES`.

## `frontend/src/hooks/usePortfolio.js`

```js
// Reads live balances for the connected account on the active chain.
export function usePortfolio() // PortfolioSnapshot (see data-model.md)
```

Guarantees:
- `status: 'disconnected'` when no account; never issues reads while disconnected.
- Snapshot is cleared synchronously on `chainId`/`address` change before reloading (SC-004).
- `totalUsd`/`subtotalUsd` sum only priced holdings; `isPartial` set whenever an
  unpriced holding or failed read exists (FR-010, SC-005).
- Polls at 60s while connected; `refresh()` forces a reload (FR-015).

## `frontend/src/components/wallet/PortfolioPanel.jsx`

```jsx
export default function PortfolioPanel() // no props; composes usePortfolio
```

UI contract (asserted by tests):
- Renders exactly one of the FR-014 states: connect prompt, loading, error+retry,
  or the portfolio view (which itself handles empty holdings and partial totals).
- Category sections are buttons with `aria-expanded`/`aria-controls`; rows expose
  name, symbol, balance, USD (or "—" + accessible "price unavailable" label), and
  classification source; disclaimers (informational + registry coverage) always visible
  in the portfolio view.
```
