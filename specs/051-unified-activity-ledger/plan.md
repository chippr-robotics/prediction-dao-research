# Implementation Plan: Unified Activity Ledger with Durable Audit Logging

**Branch**: `claude/activity-audit-logging-axj086` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/051-unified-activity-ledger/spec.md`

## Summary

Consolidate all user financial activity (wager value events, wallet/gasless
transfers including failures, earn/lending, pools, membership purchases) behind
one client-side **activity ledger** read path surfaced in the Account tab.
On-chain-derivable entries re-derive from the subgraph/chain (record of
record); client-only records (e.g. failed UserOps) persist in a new
append-only store registered as a spec-032 encrypted-backup synced object.
The Account tab dashboard and the spec-016 tax report both read the ledger, so
they can never disagree. Real block timestamps are hydrated on subgraph-less
networks and the UI never renders relative time from missing timestamps
(retiring the "20645d ago" defect). No new server-side per-user storage, no
contract changes, no subgraph schema changes. Full decision record:
[research.md](./research.md) D1–D9.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 18 + Vite (existing frontend stack)

**Primary Dependencies**: ethers v6 (chain reads), existing subgraph GraphQL
endpoints (The Graph), existing modules reused: `WagerRepository`
(`SubgraphSource`/`RegistrySource`), `reportDataSource` (bounded event
scanner + `WagerTransfer` query), `transferStore`, `activityStore` pattern,
`enrichTransfers` (token meta + USD), spec-032 backup (`syncedObjects`,
encrypted IPFS bundle)

**Storage**: localStorage via `userStorage` (per-account, chainId-scoped) for
client-only ledger records + a re-derivable timestamp cache; durable copy of
client-only records travels in the spec-032 encrypted backup bundle (IPFS +
pointer tx). No server-side per-user storage. Chain/subgraph is the record of
record for everything else.

**Testing**: Vitest (frontend unit + integration; existing `npm run test:frontend`)

**Target Platform**: Web (desktop + mobile browsers), all configured networks
including subgraph-less chains (Mordor/ETC)

**Project Type**: Web frontend feature (data layer + UI) — no backend, no contracts

**Performance Goals**: Account tab ledger render within the existing 60s
polling model; ledger assembly for a typical account (≤ few hundred entries)
well under 1s; RPC timestamp hydration bounded by the existing per-wager
request budget (`SCAN_BUDGET`), cached after first resolution

**Constraints**: Append-only client records (FR-008); no silent truncation —
retention limits disclosed and never pruning current + previous tax year
(FR-013); strict chainId scoping (FR-007, constitution III); backup payload
limited to client-only records to keep bundles small (FR-009/010); never
block a transfer on ledger/storage failure (existing `transferStore` rule)

**Scale/Scope**: Per-user history up to low thousands of entries across
networks; 6 activity classes; ~1 new data module (`frontend/src/data/ledger/`),
~2 new UI states, 4 integration points (account stats, transfer activity,
backup, reports), 1 one-time migration

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.0.0.*

| Principle | Status | Notes |
|---|---|---|
| I. Security-first contracts | ✅ N/A by scope | Zero `contracts/` changes; no new on-chain surface. Slither/Medusa gates unaffected. |
| II. Test-first & coverage | ✅ Planned | All ledger logic (normalize, identity/dedup, merge, supersede resolution, migration, timestamp hydration fallback, valuation flagging) is pure and Vitest-tested; integration tests for account-stats parity with the report and for backup round-trip. Tasks will order tests with implementation. |
| III. Honest state, no mocks | ✅ Core of the design | Ledger entries carry provenance (`oc:`/`dv:`/`cl:`) and `timestampProvenance`; derived/fallback data is flagged, unpriceable entries flagged `unvalued`, failed ops excluded from totals but always listed; strict chainId scoping preserved end-to-end (FR-007). No mock data in shipped paths. |
| IV. Fail loudly in CI | ✅ | Standard Vitest/ESLint gates; no `continue-on-error` introduced. |
| V. Accessible, consistent frontend | ✅ Planned | New/changed UI ("date unavailable" state, class filters, disclosure notes) uses existing components/patterns; WCAG AA + axe/Lighthouse gates apply; config via synced artifacts only. |
| Simplicity (workflow §4) | ✅ | Reuses six existing read/write paths; adds one aggregation module + one synced object instead of new backend/indexer (research D1, D9). |

**Post-design re-check (after Phase 1)**: PASS — the data model introduces no
new core technology, no server storage, and no contract surface; Complexity
Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/051-unified-activity-ledger/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D9
├── data-model.md        # Phase 1 — LedgerEntry, stores, state transitions
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   ├── ledger-entry.md  # Canonical entry schema + identity/merge contract
│   ├── ledger-source.md # Source adapter interface contract
│   └── backup-object.md # spec-032 synced-object contract for activityLedger
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── data/
│   │   ├── ledger/                      # NEW — the unified activity ledger
│   │   │   ├── ledgerRepository.js      # aggregate sources → normalized, deduped, sorted entries
│   │   │   ├── ledgerClientStore.js     # append-only client-only records (userStorage, chainId-scoped)
│   │   │   ├── identity.js              # entryId builders + merge precedence (oc: > dv:; cl: linking)
│   │   │   ├── timestamps.js            # RPC block-time hydration (bounded scan) + cache
│   │   │   ├── migrate.js               # one-time import of fairwins.transfers.v1 & legacy stores (FR-017)
│   │   │   └── sources/
│   │   │       ├── wagerLedgerSource.js      # WagerTransfer (subgraph) | derived fallback + hydration
│   │   │       ├── transferLedgerSource.js   # transferStore mirror (client-only + txHash-linked)
│   │   │       ├── earnLedgerSource.js       # vault Deposit/Withdraw events + reward claims
│   │   │       ├── poolLedgerSource.js       # PoolMember/PoolClaim/PoolRefund (subgraph)
│   │   │       └── membershipLedgerSource.js # voucher/membership purchases
│   │   ├── reports/reportDataSource.js  # CHANGED — enumerate via ledgerRepository
│   │   └── reports/reportBuilder.js     # CHANGED — all classes + valuationStatus columns
│   ├── hooks/
│   │   ├── useActivityLedger.js         # NEW — query hook (account, chainId, filters, period)
│   │   ├── useAccountStats.js           # CHANGED — reads ledger instead of deriveTransfers
│   │   └── useTransfer.js               # CHANGED — mirrors records into ledgerClientStore
│   ├── lib/
│   │   ├── account/format.js            # CHANGED — formatRelativeTime returns null on invalid ts
│   │   ├── account/{computeSummary,computePnlSeries,breakdowns}.js # CHANGED — pure fns of ledger entries
│   │   └── backup/syncedObjects.js      # CHANGED — + activityLedger synced object
│   └── components/
│       ├── account/RecentActivityFeed.jsx   # CHANGED — all classes, filters, "date unavailable"
│       └── wallet/TransferActivityList.jsx  # CHANGED — reads ledger (transfers filter)
└── ... Vitest specs colocated per repo convention

subgraph/    — unchanged
contracts/   — unchanged
services/    — unchanged
```

**Structure Decision**: Single-project web frontend change. The one new
directory is `frontend/src/data/ledger/` following the established
`data/<domain>/` + `sources/` convention from spec 031; everything else is
targeted edits to the six integration points listed above.

## Complexity Tracking

No constitution violations to justify — table intentionally empty.
