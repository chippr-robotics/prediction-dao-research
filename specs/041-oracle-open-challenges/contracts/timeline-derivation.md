# Module Contract: deriveOracleChallengeTimeline

**File**: `frontend/src/lib/openChallenge/oracleTimeline.js` (new, pure — no React)

## Signature

```js
deriveOracleChallengeTimeline(marketEndIso, nowMs = Date.now()) => {
  eligible: boolean,
  reason: string | null,        // set iff !eligible
  acceptDeadlineMs: number|null,
  resolveDeadlineMs: number|null,
  acceptCapped: boolean,        // 30-day cap shortened the accept window
}
```

## Constants (exported for tests/UI copy)

| Name | Value | Source |
|---|---|---|
| `MIN_LEAD_MS` | 1 hour | existing oracle-flow minimum ("at least 1 hour from now") |
| `ACCEPT_CAP_MS` | 30 days − 1 hour | contract `MAX_ACCEPT_WINDOW` (30d) minus tx-safety margin |
| `SETTLE_BUFFER_MS` | 7 days | time for market resolution + `autoResolveFromPolymarket` call |
| `RESOLVE_CAP_MS` | 180 days − 1 hour | contract `MAX_RESOLVE_WINDOW` (180d) minus margin |

## Rules

1. Unparseable/absent `marketEndIso` → `{ eligible: false, reason }`.
2. `marketEnd < now + MIN_LEAD_MS` → ineligible ("ends too soon to share a challenge").
3. `acceptDeadlineMs = min(marketEnd, now + ACCEPT_CAP_MS)`;
   `acceptCapped = (now + ACCEPT_CAP_MS) < marketEnd`.
4. `resolveDeadlineMs = min(marketEnd + SETTLE_BUFFER_MS, now + RESOLVE_CAP_MS)`.
5. Invariants (MUST hold for every eligible output; unit-tested):
   `now < acceptDeadlineMs < resolveDeadlineMs`,
   `acceptDeadlineMs ≤ now + 30d`, `resolveDeadlineMs ≤ now + 180d`
   (i.e. the contract's `_checkDeadlines` can never revert on derived values).
6. Deterministic: no internal clock reads — `nowMs` injected (testable, and the modal
   anchors it at mount like `OpenChallengeModal` does).

## Consumers

- `PolymarketBrowser`-fed selection filter in `OracleOpenChallengeModal` (ineligible
  markets unselectable, reason shown)
- Derived-timeline display (read-only) + `createOpenChallenge` deadline args
- Vitest: `frontend/src/test/oracleTimeline.test.js`
