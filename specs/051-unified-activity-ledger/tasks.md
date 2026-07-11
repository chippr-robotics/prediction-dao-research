# Tasks: Unified Activity Ledger with Durable Audit Logging

**Input**: Design documents from `/specs/051-unified-activity-ledger/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — constitution Principle II (test-first) is non-negotiable; every
behavior task is preceded by its Vitest coverage. Test files colocate with the module
per repo convention (`*.test.js[x]` next to source or under the module's `__tests__/`).

**Organization**: Grouped by user story (US1–US4 from spec.md) so each story is an
independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 (unified record), US2 (reporting parity), US3 (immutable/recoverable), US4 (timestamps)

## Phase 1: Setup

**Purpose**: Skeleton for the new ledger module — no behavior yet

- [X] T001 Create `frontend/src/data/ledger/` module skeleton (`ledgerRepository.js`, `ledgerClientStore.js`, `identity.js`, `timestamps.js`, `migrate.js`, `sources/` with five empty source files exporting the LedgerSource shape from `contracts/ledger-source.md`)
- [X] T002 [P] Add shared ledger constants/enums (`class`, `kind`, `status`, provenance namespaces `oc:`/`dv:`/`cl:`) in `frontend/src/data/ledger/constants.js` mirroring `data-model.md`

---

## Phase 2: Foundational (blocking all stories)

**Purpose**: Identity, normalization, and assembly core every story depends on

- [X] T003 [P] Write Vitest specs for entryId builders and merge precedence (`oc:` > `dv:` same-event drop; `cl:`→`oc:` txHash linking; idempotent re-derivation) in `frontend/src/data/ledger/identity.test.js`
- [X] T004 Implement `frontend/src/data/ledger/identity.js` (builders + `mergeEntries(entries)` precedence per data-model.md) to pass T003
- [X] T005 [P] Write Vitest specs for entry normalization invariants (reject `timestamp: 0`, `failed ⇒ direction none excluded from totals flag`, `onchain ⇒ txHash`, chainId scoping) in `frontend/src/data/ledger/normalize.test.js`
- [X] T006 Implement `frontend/src/data/ledger/normalize.js` (pre-item → LedgerEntry validation/enrichment seam) to pass T005
- [X] T007 [P] Write Vitest specs for repository assembly (multi-source aggregation, dedup, sort by `timestamp ?? recordedAt` desc, per-source failure → `staleClasses`, class/status/period filters) in `frontend/src/data/ledger/ledgerRepository.test.js`
- [X] T008 Implement `frontend/src/data/ledger/ledgerRepository.js` (`listEntries({account, chainId, filter, period, signal})` per `contracts/ledger-source.md`, wiring `identity.js` + `normalize.js` + the shared `enrichTransfers` token/USD pipeline with `valuationStatus` flagging) to pass T007

**Checkpoint**: Core assembly proven against fixture sources — story phases can start (US phases are independent of each other after this point)

---

## Phase 3: User Story 1 — One Complete Activity Record in the Account Tab (P1) 🎯 MVP

**Goal**: Account tab shows one chronological, filterable record of all activity classes with fidelity fields; failed ops listed but excluded from totals

**Independent Test**: quickstart.md §2 — seed one activity per class, verify each appears once with class/amount/token/status/timestamp/explorer link; totals unchanged by a failed gasless transfer; strict per-network scoping

- [X] T009 [P] [US1] Write Vitest specs for the wager source (subgraph `WagerTransfer` primary mapping; derived fallback flagged `dv:`; both yield stable ids) in `frontend/src/data/ledger/sources/wagerLedgerSource.test.js`
- [X] T010 [P] [US1] Implement `frontend/src/data/ledger/sources/wagerLedgerSource.js` reusing `reportDataSource` transfer enumeration (subgraph path) and `deriveTransfersFromWagers` (fallback path, timestamps deferred to US4 hydration — emit `null`, never 0)
- [X] T011 [P] [US1] Write Vitest specs for the transfer source (maps `transferStore`/client records incl. `route: 'gasless'`, failed status + verbatim `failureReason`) in `frontend/src/data/ledger/sources/transferLedgerSource.test.js`
- [X] T012 [P] [US1] Implement `frontend/src/data/ledger/sources/transferLedgerSource.js` reading `ledgerClientStore` (fed by T024 mirror; pre-mirror fallback reads `transferStore` directly)
- [X] T013 [P] [US1] Write Vitest specs + implement `frontend/src/data/ledger/sources/poolLedgerSource.js` (subgraph `PoolMember`/`PoolClaim`/`PoolRefund` → join/claim/refund entries) with `poolLedgerSource.test.js`
- [X] T014 [P] [US1] Write Vitest specs + implement `frontend/src/data/ledger/sources/membershipLedgerSource.js` (voucher/membership purchases via the existing membership queries) with `membershipLedgerSource.test.js`
- [X] T015 [P] [US1] Write Vitest specs + implement `frontend/src/data/ledger/sources/earnLedgerSource.js` (user-scoped ERC-4626 `Deposit`/`Withdraw` events via bounded window scan; reward claims recorded at claim time) with `earnLedgerSource.test.js`
- [X] T016 [US1] Write Vitest specs + implement `frontend/src/hooks/useActivityLedger.js` (account/chainId scoping, 60s polling model, filters, `staleClasses` surfaced) in `useActivityLedger.test.js`
- [X] T017 [US1] Rework `frontend/src/components/account/RecentActivityFeed.jsx` (+ its test) to render ledger entries: all classes, class/status filters, failed badge + reason, explorer link only for real ≥66-char txHash, "date unavailable" state on null timestamp
- [X] T018 [US1] Update `frontend/src/hooks/useAccountStats.js` (+ test) to source activity from `useActivityLedger`/`ledgerRepository` instead of `deriveTransfersFromWagers`, keeping the wager-list consistency guarantees
- [X] T019 [US1] Update `frontend/src/lib/account/{computeSummary,computePnlSeries,breakdowns}.js` (+ tests) to be pure functions of LedgerEntry arrays that exclude `failed` from all totals (SC-006)
- [X] T020 [US1] Update `frontend/src/components/wallet/TransferActivityList.jsx` (+ test) to read the ledger filtered to `class: 'transfer'` so the Pay & Transfer tab and Account tab can never diverge (FR-002)
- [X] T021 [US1] Accessibility pass on changed Account-tab UI (labels for filters/status badges, axe clean) in the affected component tests

**Checkpoint**: US1 fully functional — MVP deliverable

> **Implementation notes (deviations, recorded per plan §Complexity):**
> - T015: earn activity is captured at action time into the client ledger
>   (`captureEarnAction` beside the existing `queueEarnAction` call sites)
>   instead of an ERC-4626 event scan — earn vaults are Morpho-discovered with
>   no fixed registry, so an event sweep is not viable on public RPCs. The gap
>   (externally-made earn actions) is disclosed in the source header.
> - T019: the summary/P&L/breakdown helpers keep their proven spec-020 math;
>   they now consume the ledger through `lib/account/ledgerAdapters.js`, which
>   maps wager-class entries and excludes `failed` (FR-003/FR-015 hold via the
>   single read path).
> - Ledger tests live under `frontend/src/test/ledger/` (repo convention)
>   rather than colocated next to sources.

---

## Phase 4: User Story 2 — Reporting Reads the Same Ledger (P2)

**Goal**: Tax/activity report enumerates the identical ledger query; line items and totals match the Account tab; all classes exported with `valuationStatus`

**Independent Test**: quickstart.md §4 — CSV for a seeded period matches the Account tab line-for-line and total-for-total (SC-002)

- [X] T022 [P] [US2] Write parity Vitest spec: same (account, chainId, period) ⇒ report entry set ≡ Account tab entry set and totals equal, in `frontend/src/data/reports/reportParity.test.js`
- [X] T023 [US2] Update `frontend/src/data/reports/reportDataSource.js` to enumerate via `ledgerRepository.listEntries` (period filter) instead of its own `WagerTransfer` query path, keeping the bounded gas-fee receipt lookups
- [X] T024 [US2] Update `frontend/src/data/reports/reportBuilder.js` + `csvReport.js`/`pdfReport.js` (+ tests) to the column contract in `contracts/ledger-entry.md` (all classes, `status`/`failureReason`, `valuationStatus` flagged never zeroed, network-scope + `prunedBefore` disclosure header, null-timestamp rows flagged and sorted last)
- [X] T025 [US2] Update `frontend/src/hooks/useTaxReport.js` + `TaxReportsPanel.jsx` (+ tests) for the extended classes/columns and disclosure copy

**Checkpoint**: Dashboard and report structurally cannot disagree

---

## Phase 5: User Story 3 — Immutable and Recoverable (P3)

**Goal**: Append-only client store mirrored from the transfer flow, carried in the spec-032 encrypted backup, deduplicated on restore, honest failure messaging, legacy migration

**Independent Test**: quickstart.md §5–6 — backup → wipe → restore returns the full record incl. failed gasless entries with no duplicates; no-backup restore rebuilds on-chain history and says client-only history wasn't recovered; `fairwins.transfers.v1` migrates once

- [X] T026 [P] [US3] Write Vitest specs for `ledgerClientStore` (append-only, `supersedes` chain resolution, per-account + chainId scoping via `userStorage`, FR-013 pruning guard + `prunedBefore` disclosure, storage failure never throws into caller) in `frontend/src/data/ledger/ledgerClientStore.test.js`
- [X] T027 [US3] Implement `frontend/src/data/ledger/ledgerClientStore.js` to pass T026
- [X] T028 [US3] Write Vitest specs + update `frontend/src/hooks/useTransfer.js` to mirror record/updateTransfer calls into `ledgerClientStore` as append+supersede records (transfer flow must never fail on ledger write) in `useTransfer.test.js`
- [X] T029 [P] [US3] Write Vitest specs for one-time idempotent migration of `fairwins.transfers.v1` (statuses/errors/txHash/createdAt preserved, marker prevents re-import) in `frontend/src/data/ledger/migrate.test.js`
- [X] T030 [US3] Implement `frontend/src/data/ledger/migrate.js` + invoke on app bootstrap to pass T029 (FR-017, SC-007)
- [X] T031 [P] [US3] Write backup round-trip Vitest spec (load → union merge by entryId, replace mode also unions, restore dedups against re-derived entries) in `frontend/src/lib/backup/activityLedgerObject.test.js`
- [X] T032 [US3] Register the `activityLedger` synced object in `frontend/src/lib/backup/syncedObjects.js` per `contracts/backup-object.md` to pass T031
- [X] T033 [US3] Update the restore flow UI (+ test) to surface "device-local activity history was not recovered" when no/undecryptable backup (FR-012) in the spec-032 restore components

**Checkpoint**: Full wipe-and-recover path proven

---

## Phase 6: User Story 4 — Real, Honestly Rendered Timestamps (P4)

**Goal**: Block-time hydration on subgraph-less networks; UI never renders relative time from missing/zero timestamps

**Independent Test**: quickstart.md §3 — RPC-only network shows explorer-matching dates; "20645d" is unfindable (SC-004)

- [ ] T034 [P] [US4] Write Vitest specs for `formatRelativeTime` null-guard (`0`, negative, null, undefined ⇒ `null`) and callers rendering the explicit "date unavailable" state in `frontend/src/lib/account/format.test.js`
- [ ] T035 [US4] Update `frontend/src/lib/account/format.js` + all call sites (`RecentActivityFeed`, `TransferActivityList`, `FreshnessIndicator` unaffected-but-verified) to pass T034
- [ ] T036 [P] [US4] Write Vitest specs for timestamp hydration (bounded scan + `getBlock` → ms; budget exhaustion ⇒ `null` + `unavailable`; cache hit skips RPC; cache loss harmless) in `frontend/src/data/ledger/timestamps.test.js`
- [ ] T037 [US4] Implement `frontend/src/data/ledger/timestamps.js` reusing the `reportDataSource` bounded event-window scanner, and wire it into `wagerLedgerSource`'s derived fallback path (replacing the `createdAt: 0` coercion in `deriveTransfersFromWagers` usage) to pass T036
- [ ] T038 [US4] Update `frontend/src/lib/account/deriveTransfers.js` (+ its test) to emit `timestamp: null` instead of `0`/createdAt-fallback when no real time exists

**Checkpoint**: FR-005/006 satisfied on every network

---

## Phase 7: Polish & Cross-Cutting

- [ ] T039 [P] Consistency test: every financial event surfaced by the spec-031 notification sources resolves to a ledger entry (FR-002) in `frontend/src/data/notifications/ledgerConsistency.test.js`
- [ ] T040 [P] Update docs: `docs/developer-guide/` page for the activity ledger (architecture, identity/merge, backup object) and cross-link from gasless-intents + upgradeable docs where activity is mentioned
- [ ] T041 Run full gates locally: `npm run test:frontend`, frontend lint/build, axe/Lighthouse on the Account tab; fix regressions
- [ ] T042 Execute quickstart.md §2–§6 manual validation on one subgraph network and one RPC-only network; record results in the PR

---

## Dependencies

```
Setup (T001–T002)
  └─▶ Foundational (T003–T008)
        ├─▶ US1 (T009–T021)  ── MVP
        ├─▶ US2 (T022–T025)  — depends on US1's sources for full-class parity
        ├─▶ US3 (T026–T033)  — independent of US1 UI; T012 consumes T027 when present
        └─▶ US4 (T034–T038)  — independent; T037 touches wagerLedgerSource (after T010)
Polish (T039–T042) — after the stories it validates
```

Story order for sequential delivery: US1 → US2 → US3 → US4 (spec priority).
US3 and US4 can proceed in parallel with US2 once US1's sources exist.

## Parallel Opportunities

- Foundational: T003, T005, T007 (specs) in parallel; implementations serialize per pair.
- US1: T009–T015 (five sources + specs) are fully parallel — different files.
- US3: T026/T029/T031 (specs) in parallel.
- US4: T034/T036 in parallel.
- Polish: T039/T040 in parallel.

## Implementation Strategy

MVP = Phase 1 + 2 + US1 (T001–T021): the Account tab becomes the single
complete activity record. Ship, then US2 (reporting parity) as the second
increment, US3 (durability/backup) third, US4 (timestamp truth) last —
though US4's render guard (T034–T035) is cheap and may be pulled forward
with US1 if the "20645d ago" symptom needs killing immediately.
