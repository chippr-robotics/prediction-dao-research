# Implementation Plan: Multi-Chain Activity Ledger

**Branch**: `claude/activity-stats-wager-messages-n4ul0r` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/092-multi-chain-activity/spec.md`

## Summary

The Account tab's Activity feed and Stats are computed from the active network only; switching
networks silently swaps the member's recorded past, and imported accounts whose history lives
elsewhere look permanently inactive. This feature merges the existing per-network ledger reads
across the build's cohort using the spec-071 estate-read pattern: every cohort chain is read
independently through its own read provider, resolves to `read` / `not-deployed` / `unreachable`,
entries stay chain-tagged with per-chain identity, and any figure computed while a chain was
unreachable is labelled partial and names it. Frontend-only; no contract, subgraph, or gateway
changes; writes remain single-chain.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18, Vite 8 — existing frontend stack

**Primary Dependencies**: ethers v6 (read providers), existing `data/ledger` sources (spec 051),
`lib/chains/estate.js` + `lib/chains/chainReadResult.js` (spec 071), `config/networks.js`
(`cohortChainIds`, `isInCohort`), `utils/rpcProvider.js` (`getReadProvider`, spec 069)

**Storage**: none new — the per-(account, chainId) client ledger store and per-network subgraph/
chain sources remain the source of truth per network; this feature merges their outputs

**Testing**: Vitest (scoped runs locally per repo policy; full suite in CI)

**Target Platform**: browser SPA (mobile-first), all cohort EVM networks

**Project Type**: web frontend (feature slice within `frontend/`)

**Performance Goals**: merged load comparable to the single-network load — per-chain reads run
concurrently and one slow chain delays only its own contribution (SC-005); cohort size ≤ 7

**Constraints**: constitution III honest-state rules (no zeros for failures, cohort boundary
absolute); providers only via `getReadProvider`/`readProviderFor` (spec 069); no new store of
record; Bitcoin out of scope v1

**Scale/Scope**: ~1 new data module, 1 hook rework, 2 component updates, ~6 test files; feed cap
raised from 50 entries to a merged, still-bounded window

## Constitution Check

*GATE: evaluated pre-Phase-0 and re-checked post-design — PASS (no violations to justify).*

- **I. Security-first contracts** — N/A: no `contracts/` changes; read-only frontend feature.
  No new value path, custody, or oracle surface.
- **II. Test-first coverage** — unit tests for the merge/isolation logic (pure), hook tests for
  partial/unreachable states, component tests for the network filter, badges, and partial
  labelling; all failure paths (one chain down, all chains down, empty-but-read) covered.
- **III. Honest state** — the core of the design: three-state per-chain reads, unreachable never
  rendered as zero, partial figures named, cohort boundary enforced by `cohortChainIds()` (never
  `listSupportedChainIds()`). The existing G5 normalization guard (an entry's chainId must match
  its query scope) is preserved by merging ABOVE per-chain reads, never widening a read's scope.
- **IV. Fail loudly in CI** — no CI changes; new tests gate like all Vitest suites.
- **V. Accessible frontend** — network filter and badges follow the feed's existing accessible
  menu idiom; partial notices are `role="status"` text, not color-alone; axe suite extended.

## Project Structure

### Documentation (this feature)

```text
specs/092-multi-chain-activity/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── estate-activity.md   # Phase 1 — the merge seam's contract
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── data/ledger/
│   └── estateLedger.js            # NEW: cohort-wide merge over per-chain listEntries
├── hooks/
│   └── useAccountStats.js         # rework: estate reads replace single-chain reads
├── lib/account/
│   ├── ledgerAdapters.js          # extend: per-chain wager-title maps
│   └── (computeSummary/PnlSeries/breakdowns unchanged — fed merged input)
├── components/account/
│   ├── RecentActivityFeed.jsx     # network badge, network filter, partial notice
│   ├── MyAccountView.jsx          # partial labelling pass-through; unsupported-network
│   │                              # state retired in favour of estate states
│   └── ActivityBreakdowns.jsx     # unchanged shape; fed merged input
└── test/
    ├── ledger/estateLedger.test.js
    └── account/ (extend: useAccountStats, RecentActivityFeed, MyAccountView suites)
```

**Structure Decision**: single new data module at the ledger layer plus reworks of the existing
account surfaces — the merge is a data concern, so it lives beside `ledgerRepository.js`, not in
a component.

## Design

### D1. The merge seam: `estateLedger.js`

`listEntriesAcrossEstate({ account, walletChainId, walletProvider, chainIds? })`:

1. Resolve target chains: `chainIds ?? cohortChainIds()`, filtered by `isInCohort` (FR-002).
2. For each chain **concurrently and independently** (never `Promise.all` rejection semantics —
   per-chain `try/catch`, the `readAcrossEstate` idiom):
   - provider via `readProviderFor(chainId, walletChainId, walletProvider)`; a null provider ⇒
     `unreachable` ("no read connection"), never a throw.
   - `getDefaultLedgerRepository().listEntries({ account, chainId, provider })` — the existing
     per-chain read, unchanged, preserving the G5 chain-scope guard.
   - result state: `read` (entries + that chain's `staleClasses` + `prunedBefore`) or
     `unreachable(reason)`. `not-deployed` applies per-source *within* a chain (the existing
     stale/empty semantics); a cohort chain with no FairWins deployment reads as `read` with
     zero entries from on-chain sources — genuinely empty, no warning (FR-005), because
     client-recorded classes can exist anywhere.
3. Merge: concatenate per-chain entries; dedup by `entryId` across chains (identity already
   embeds chainId, so same-id-different-chain never collides — FR-007 — and a source that
   stamps a fixed reference chain, e.g. membership, contributes identical ids from every
   scope and collapses to one). Sort with the repository's newest-first comparator.
4. Return `{ entries, chainStates, partialChains, staleByChain, prunedByChain }` — see
   `contracts/estate-activity.md`.

### D2. Hook rework: `useAccountStats`

- Replaces its single-chain `listEntries` call with `listEntriesAcrossEstate`; replaces
  single-chain `loadAllWagers` with per-cohort-chain wager loads (same isolation: a chain whose
  wager repository cannot be constructed or read contributes nothing and is marked unreachable
  for wager-derived figures).
- Keeps its return shape and adds: `networkStates` (per-chain 3-state), `partialChains`
  (display names), per-chain-aware `staleClasses` (labelled "class on Network").
- `isSupportedNetwork` (active-network escrow gate) is retired from the estate path: the merged
  read no longer depends on the wallet's active chain. The wallet-balance tile keeps its
  active-chain read (it describes the connected wallet, not history).
- Wager titles (spec 091 shipped work): `wagerTitlesById` becomes per-chain
  (`Map<chainId, Map<wagerId, title>>`) so a title lookup never crosses chains (FR-011).
- P&L/summary/breakdown helpers are pure over transfer rows and wager records; they receive the
  merged rows unchanged. Settled-status lookup keys become `(chainId, wagerId)`.

### D3. Feed: `RecentActivityFeed`

- Each row shows its network name (entries carry `chainId`; explorer links already resolve
  per-entry). Badge is text, not color-alone.
- Network filter: same dropdown idiom as the class filter, options = networks present in the
  merged record (+ "All networks" default); composes with class filter and search (FR-011).
- Partial notice (`role="status"`): "Some networks could not be read: <names>" — distinct from
  per-class staleness, which now names its network.
- Pruning disclosure names the pruned network(s) (FR-010).

### D4. Stats partial labelling: `MyAccountView` + tiles/chart

- When `partialChains` is non-empty, Stats surfaces one disclosure ("Figures exclude <names> —
  could not be read") adjacent to the tiles; figures themselves render from readable chains.
- All cohort chains unreachable ⇒ honest failure state (stale last-known or explicit error),
  never zeros (FR-009). The account-aware empty states (shipped) remain for genuinely-empty.

### Risks called out for implementation

- **R1 — sources without per-chain backends**: on chains with no subgraph, sources already
  degrade (derived paths or empty); verify none *throws* in a way that marks a healthy chain
  unreachable. Per-source failures stay `staleClasses`, per-chain failures `unreachable`.
- **R2 — reference-chain sources**: membership queries its own reference chain semantics;
  entryId dedup collapses duplicates, but tests must pin this (one membership entry, not N).
- **R3 — feed cap**: the 50-entry window becomes per-merge, applied AFTER sorting the merged
  stream, so one busy chain cannot evict another's recent entries unfairly — cap stays a
  display bound, not a read bound.
- **R4 — polling cost**: 60s poll × cohort size reads; concurrent and provider-cached, but
  measure and, if needed, stagger non-active chains (documented decision in research.md R4).

## Complexity Tracking

No constitution violations; table omitted.
