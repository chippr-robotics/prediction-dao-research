# Contract: My Wagers UI (US4, US5, US6, US7)

## US4 — `hooks/useMyPools.js` periodic refresh

```
useMyPools() -> { items: PoolListItem[], loading: boolean, refresh: () => void }
```
- Adds `refresh()` (re-runs the existing idempotent `load()`).
- Runs `refresh()` on a ~30s interval while mounted; clears the interval on unmount so polling stops
  when My Wagers closes (FR-012/013/014). Interval cadence matches the wager poll (spec 019).

## US5 — `components/fairwins/MyPoolsSection.jsx` tab-aware bucketing

```
<MyPoolsSection activeTab={'participating'|'created'|'arbitrating'|'history'} />
```
- History tab → render only `items.filter(i => i.bucket === 'history')`.
- Any other tab → render only `items.filter(i => i.bucket === 'active')`.
- Renders nothing when the filtered list is empty (preserves the "no pools ⇒ unchanged view"
  guarantee).
- The per-row Active/Past chip is removed (the tab conveys bucket).
- `MyMarketsModal` passes its `activeTab` down (`MyMarketsModal.jsx:951`).

## US6 — Status filter options (`MyMarketsModal.jsx:929-945`)

Final `<option>` set: `all`, `pending_acceptance`, `active`, `pending_resolution`, `resolved`.
- REMOVE `disputed` (FR-018) and `expired` (FR-017).
- No change to `getMarketStatus`/categorization; expired wagers stay hidden by default (FR-019).

## US7 — Header network pill (`MyMarketsModal.jsx:817-824`)

- REMOVE the `mm-network-tag` `<span>` and its `.mm-network-tag*` CSS in `MyMarketsModal.css`.
- KEEP the subtitle "Manage your wagers and positions on {activeNetwork.name}" (FR-021).
