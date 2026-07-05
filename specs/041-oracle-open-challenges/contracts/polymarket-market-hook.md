# Module Contract: usePolymarketMarket

**File**: `frontend/src/hooks/usePolymarketMarket.js` (new)

## Signature

```js
const { market, isLoading, error, refresh } = usePolymarketMarket(conditionId, {
  enabled = true,   // skip fetch entirely (e.g. non-oracle challenge, gated chain)
} = {})
```

## Contract

- Fetches `GET {gammaBase}/markets?condition_ids=<conditionId>&limit=1` where
  `gammaBase` comes from the active network config exactly as `usePolymarketSearch`
  resolves it (`getNetwork(chainId)?.polymarket?.gammaApiUrl` with the public default).
- Normalizes the first result with `normaliseGammaMarket` (exported from
  `usePolymarketSearch.js` as part of this feature) → the LinkedMarket shape
  (`outcomes: [{ name, price }]`, `endDate`, `active`, `closed`, `slug`, …).
- `conditionId` falsy, zero-hash, or `enabled: false` → no fetch,
  `{ market: null, isLoading: false, error: null }`.
- Not found / non-OK / network failure → `{ market: null, error }` (message safe to
  display); NEVER throws into render. No retry storm: single fetch per
  (conditionId, chainId) mount + manual `refresh()`.
- No polling in v1 (claimant view is short-lived); `refresh` allows explicit re-check.
- Aborts in-flight request on unmount/param change (same AbortController discipline as
  the search hook).

## Consumers

- `TakeChallengePanel` (claimant live context + accept gate)
- `OracleOpenChallengeModal` (optional freshness re-check of the selected market before
  submit; selection data itself comes from the browser feed)
