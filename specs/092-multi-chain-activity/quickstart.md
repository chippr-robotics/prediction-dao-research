# Quickstart: validating the multi-chain activity ledger

## Prerequisites

- `npm run deps:reinstall` has produced a healthy tree (`npm run check:deps` passes).
- Scoped Vitest runs only (repo policy — the full frontend suite OOMs locally).

## Unit / integration validation

```bash
# The merge seam's contract: isolation, dedup, cohort bounding, never-rejects
npx vitest run frontend/src/test/ledger/estateLedger.test.js

# Hook: merged reads, partial labelling, per-(chain,wager) lookups, poll behavior
npx vitest run frontend/src/test/account/useAccountStats.acting.test.jsx

# Surfaces: network badges + filter, partial notices, honest failure states
npx vitest run frontend/src/test/account/RecentActivityFeed.test.jsx \
               frontend/src/test/account/MyAccountView.test.jsx \
               frontend/src/test/account/MyAccountView.axe.test.jsx
```

Expected: all green; the estateLedger suite includes a case per contract guarantee (G1–G7).

## Scenario validation (test-driven, mirrors spec acceptance)

| Scenario | Where proven |
|---|---|
| Activity from two chains interleaves, network-tagged, unchanged on network switch (US1) | estateLedger + feed suites |
| One chain unreachable ⇒ others render + named partial notice, never zeros (US1/US2) | estateLedger (state), MyAccountView (disclosure) |
| Stats equal hand-computed cross-chain combination (US2 / SC-003) | useAccountStats suite fixture math |
| All chains unreachable ⇒ honest failure, no fabricated zeros (FR-009) | useAccountStats + MyAccountView suites |
| Network filter composes with class filter + search (US3) | RecentActivityFeed suite |
| Explorer link targets the entry's own chain (US3) | RecentActivityFeed suite (existing per-entry link test extended) |
| Same wager id on two chains never collides (FR-007) | estateLedger dedup case + title/status key tests |

## Manual smoke (dev server)

```bash
npm run frontend
```

1. Connect a wallet with recorded activity on ≥ 2 cohort networks; open Account ▸ Activity —
   both networks' entries appear with badges; switch active network — the list is unchanged.
2. Break one network's RPC (Settings ▸ Network → point one chain at an unreachable endpoint):
   the feed and Stats name that network as not read; nothing renders as zero.
3. Account ▸ Stats — figures reflect both networks; with the broken endpoint, the partial
   disclosure appears next to the tiles.
```
