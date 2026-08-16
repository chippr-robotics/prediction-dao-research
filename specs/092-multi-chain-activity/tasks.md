# Tasks: Multi-Chain Activity Ledger

**Input**: Design documents from `/specs/092-multi-chain-activity/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/estate-activity.md

**Tests**: included — constitution II makes test-alongside-behavior non-negotiable, and the
contract's guarantees (G1–G7) plus the spec's honesty rules are exactly the kind of behavior
that must be pinned by tests in the same PR.

**Organization**: grouped by user story; US1 (merged record) is the MVP and carries the
foundational merge seam; US2 (estate stats) and US3 (network filter) build on it.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

*(No project scaffolding needed — existing frontend feature slice. The only setup is knowing
the seams: `data/ledger/`, `lib/chains/estate.js`, `hooks/useAccountStats.js`.)*

- [x] T001 Verify the dev tree is healthy (`npm run check:deps`) and the baseline account suites
      pass: `npx vitest run frontend/src/test/account/ frontend/src/test/ledger/`

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the merge seam every story consumes.

- [x] T002 Write the contract test suite for the merge seam in
      `frontend/src/test/ledger/estateLedger.test.js`: one case per guarantee in
      `contracts/estate-activity.md` (never rejects; cohort bounding drops cross-cohort ids
      silently; per-chain isolation — one throwing chain yields `unreachable` while siblings
      resolve `read`; scope preservation — injected `listEntries` receives exactly one chainId +
      that chain's provider; dedup by entryId with first-occurrence-wins; merged newest-first
      ordering with undated rows last; empty-but-read is `state:'read', entryCount:0`). Use the
      `deps` injection seam; no network.
- [x] T003 Implement `frontend/src/data/ledger/estateLedger.js` — `listEntriesAcrossEstate` per
      the contract: chains from `cohortChainIds()` filtered by `isInCohort`, providers via
      `readProviderFor` (null ⇒ unreachable, never a throw), per-chain
      `getDefaultLedgerRepository().listEntries`, merged + deduped + sorted result with
      `chainStates`, `partialChains`, `staleByChain`, `prunedByChain` (data-model.md shapes).
- [x] T004 Export the new module from `frontend/src/data/ledger/index.js` and confirm T002 is
      green.

**Checkpoint**: the seam is proven in isolation; user stories can consume it.

---

## Phase 3: User Story 1 — One activity record for the whole estate (P1) 🎯 MVP

**Goal**: the Activity feed shows every cohort chain's entries, chain-tagged, unchanged by
active-network switching; unreachable chains disclosed by name, never as zero.

**Independent test**: seed two chains via the hook's injection seams; both appear interleaved
with network tags; make one chain unreachable — the other renders plus a named notice.

- [x] T005 [US1] Extend `frontend/src/test/account/useAccountStats.acting.test.jsx`: the hook
      calls the estate seam (not single-chain listEntries), returns merged `activity` with
      per-entry chainIds intact, exposes `networkStates` + `partialChains` (display names), and
      labels per-class staleness as "class on Network". Cover: two readable chains; one
      unreachable; all unreachable (honest failure — stale last-known, never zeros, FR-009).
- [x] T006 [US1] Rework `frontend/src/hooks/useAccountStats.js`: replace the single-chain
      `listEntries` call with `listEntriesAcrossEstate`; load wagers per cohort chain with the
      same isolation (a failing chain's wagers contribute nothing and join `partialChains`);
      key wager status lookups by `chainId:wagerId`; make wager-title maps per-chain
      (`Map<chainId, Map<wagerId,title>>` via a new `wagerTitlesByChain` in
      `frontend/src/lib/account/ledgerAdapters.js`); retire the active-network
      `isSupportedNetwork` gate for the estate path (keep the active-chain wallet-balance tile
      read); keep the 50-row display cap applied after the merged sort.
- [x] T007 [P] [US1] Extend `frontend/src/test/account/RecentActivityFeed.test.jsx`: every row
      shows its network name from `entry.chainId`; explorer links target the entry's own chain
      (extend the existing link test with a second-chain entry); the partial notice renders
      `role="status"` naming unreachable networks; the pruning disclosure names its network.
- [x] T008 [US1] Update `frontend/src/components/account/RecentActivityFeed.jsx` +
      `RecentActivityFeed.css`: per-row network tag (text, via `networkName(chainId)` from
      `frontend/src/lib/chains/estate.js`); accept and render `partialChains` (display names)
      as a `role="status"` notice distinct from per-class staleness; make the pruning marker
      per-network (`prunedByChain`).
- [x] T009 [US1] Update `frontend/src/components/account/MyAccountView.jsx`: pass the new
      props through to the feed; replace the retired "Network not supported" Activity state
      with the estate states (account-aware empty states from spec 091's PR are retained);
      extend `frontend/src/test/account/MyAccountView.test.jsx` accordingly.

**Checkpoint**: US1 delivers standalone — the merged, honest, chain-tagged feed.

---

## Phase 4: User Story 2 — Stats computed across the estate (P2)

**Goal**: tiles, P&L chart, and breakdowns reflect the merged history; partial figures are
labelled and name missing networks.

**Independent test**: fixture wagers on two chains with known outcomes — figures equal the
hand-computed combination; with one chain unreachable, figures recompute from the readable
chain and carry the named partial disclosure.

- [x] T010 [US2] Extend `frontend/src/test/account/useAccountStats.acting.test.jsx` (or a new
      `useAccountStats.estate.test.jsx` if the file grows unwieldy): summary/series/breakdowns
      computed from two chains match hand-computed totals (SC-003 — no double counting, no
      drops); settled-status filtering keys on `chainId:wagerId` so wager #12 on two chains
      never cross-contaminates.
- [x] T011 [US2] Wire the merged transfers/wagers through the pure helpers in
      `frontend/src/hooks/useAccountStats.js` (`computeSummary`, `computePnlSeries`,
      `computeBreakdowns` stay unchanged — verify their inputs are chain-agnostic and fix the
      status-map keying at the call site).
- [x] T012 [P] [US2] Extend `frontend/src/test/account/MyAccountView.test.jsx`: Stats shows one
      partial disclosure naming unreachable networks beside the tiles; all-unreachable shows
      the honest failure state; no partial language when `partialChains` is empty.
- [x] T013 [US2] Update `frontend/src/components/account/MyAccountView.jsx` (+`MyAccountView.css`
      if needed): render the Stats partial disclosure; keep the estate breakdown and
      account-aware empty states as shipped.

**Checkpoint**: US1 + US2 — the feed and every figure are estate-wide and honestly labelled.

---

## Phase 5: User Story 3 — Working with a multi-network record (P3)

**Goal**: a network filter that composes with class filter + search.

**Independent test**: two-chain fixture — filter to one network, only its entries remain and
compose with class/search; clear it, the merged record returns.

- [x] T014 [P] [US3] Extend `frontend/src/test/account/RecentActivityFeed.test.jsx`: network
      filter options are the networks present in the record plus "All networks" (default);
      selection composes with class filter and search; wager-message search still matches
      across networks.
- [x] T015 [US3] Implement the network filter in
      `frontend/src/components/account/RecentActivityFeed.jsx` using the existing dropdown
      menu idiom (aria roles match the class filter), options derived from the entries'
      chainIds via `networkName`.

**Checkpoint**: all three stories delivered.

---

## Phase 6: Polish & cross-cutting

- [x] T016 [P] Extend `frontend/src/test/account/MyAccountView.axe.test.jsx` to cover the feed
      with network badges/filter and the Stats partial disclosure (WCAG 2.1 AA, constitution V).
- [x] T017 [P] Update `docs/developer-guide/chain-estate-reads.md` (or add a short
      `docs/developer-guide/multi-chain-activity.md` cross-referencing it) documenting the
      activity merge seam, its contract, and the two disclosure layers (chain state vs class
      staleness).
- [x] T018 Run the affected suites and lint:
      `npx vitest run frontend/src/test/ledger/ frontend/src/test/account/` plus
      `npx eslint` over changed files; confirm no new warnings.
- [x] T019 Update `specs/092-multi-chain-activity/spec.md` status to reflect delivery and note
      any deliberate deviations discovered during implementation.

---

## Dependencies

```text
T001 → T002 → T003 → T004 ─┬─→ US1 (T005 → T006 → {T007∥} → T008 → T009)
                            │        └─ MVP checkpoint
                            ├─→ US2 (T010 → T011 → {T012∥} → T013)   [needs US1's hook rework]
                            └─→ US3 (T014∥ → T015)                    [needs US1's feed rework]
Polish: T016–T019 after their stories.
```

US2 depends on US1's hook rework (T006); US3 depends on US1's feed rework (T008). Within each
story, [P]-marked test tasks can be written in parallel with the preceding implementation task's
test-first counterpart.

## Parallel opportunities

- T007 alongside T006 (different files: feed test vs hook).
- T012 alongside T011; T014 alongside T013.
- T016 and T017 fully parallel in Polish.

## Implementation strategy

MVP = Phase 2 + US1: the merged, honest, chain-tagged feed is the visible payoff and proves the
seam. US2 is a keying + labelling pass over pure helpers. US3 is additive UI. Ship checkpoints
in order; each phase leaves the suite green.
