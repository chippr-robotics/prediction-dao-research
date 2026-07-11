# Research: Unified Activity Ledger (spec 051)

All decisions below resolve the Technical Context unknowns for `plan.md`.
Grounding: the current-state audit of activity surfaces (spec 051 Problem
Statement) and direct reading of the existing data paths:
`frontend/src/lib/account/deriveTransfers.js`, `frontend/src/lib/transfer/transferStore.js`,
`frontend/src/lib/backup/syncedObjects.js`, `frontend/src/data/reports/reportDataSource.js`,
`frontend/src/data/wagers/{SubgraphSource,RegistrySource}.js`,
`frontend/src/data/notifications/*`.

---

## D1 — Ledger architecture: client-side aggregating read model, no new backend

**Decision**: Build the ledger as a frontend data module (`frontend/src/data/ledger/`)
that aggregates **ledger sources** (one per activity domain) into a canonical,
deduplicated, per-account + per-network entry stream. On-chain-derivable
entries are re-derived on demand (chain/subgraph is the record of record);
client-only entries live in a new append-only local store that is registered
as a spec-032 synced object.

**Rationale**: The spec's assumptions forbid new server-side per-user storage
(privacy stance). Every source the ledger needs already has a client read
path; what is missing is one normalization + merge layer and durable backup
for the client-only remainder. This mirrors the proven spec-031 pattern
(domain sources → engine → store) but for a financial record instead of
notifications.

**Alternatives considered**:
- *Server-side ledger in relay-gateway*: rejected — violates the no-dossier
  privacy assumption, adds an availability dependency, and only sees relayed
  traffic anyway.
- *Subgraph-only ledger*: rejected — subgraph does not exist on all networks
  (Mordor), cannot see failed UserOps or wallet-to-wallet sends, and cannot
  carry client-only context.
- *Extend the spec-031 notification store into the ledger*: rejected — that
  store is capped (100), lossy by design (diff snapshots), and read-state
  oriented; an audit log needs different retention and immutability rules.

## D2 — Source strategy per activity class

**Decision** (per class, in priority order of data path):

| Class | Primary source | Fallback / notes |
|---|---|---|
| Wager value events | Subgraph `WagerTransfer` (real `txHash`, `timestamp`, `from/to`) via the existing `reportDataSource` enumeration | On subgraph-less networks: derive from wager state (`deriveTransfersFromWagers`) **plus timestamp hydration** (D6) using the bounded per-wager event scan already implemented in `reportDataSource` (`SCAN_BUDGET`, adaptive chunking) |
| Wallet transfers (outgoing, incl. gasless) | `transferStore` records (the write path already captures route, status transitions, failure reasons) | Confirmed sends are linked to chain truth by `txHash`; failed/gasless-failed records remain client-only entries |
| Gasless/sponsored UserOps | Same `transferStore` write path (spec 041/050 flows already record `route: 'gasless'` + errors) | No subgraph entity exists for UserOps; out of scope to add one (see D9) |
| Earn/lending (loans) | New thin source reading the user's vault events (ERC-4626 `Deposit`/`Withdraw` for the account) with the same bounded-window scan pattern; rewards from the existing `useEarnRewards` claim path recording at claim time | Position snapshots (spec 050) remain the balance view; the ledger records *events* |
| Pools | Subgraph `PoolMember` / `PoolClaim` / `PoolRefund` entities (already indexed, spec 034) | RPC-only networks: pool factory event scan, bounded |
| Membership/voucher | Subgraph `Voucher` entity + purchase events (spec 026) | Membership purchase already surfaces in `membershipSource`; reuse its query |

**Rationale**: Reuse over rebuild — every row above is an existing, tested
read path; the ledger adds normalization, identity, and merge, not new
indexing. The two divergent wager money paths (Account tab derived vs report
`WagerTransfer`) are unified by making the **subgraph transfers the primary**
(they carry the fidelity FR-004 requires) and the derived path a clearly
flagged fallback — the exact inverse of today's Account tab, which is what
lets dashboard and report agree (FR-014/015).

**Alternatives**: keeping `deriveTransfersFromWagers` primary everywhere was
rejected because it has empty `txHash` and synthetic timestamps — it can never
meet FR-004 on its own.

## D3 — Entry identity & deduplication

**Decision**: Every ledger entry gets a stable `entryId`:
- On-chain entries: `oc:{chainId}:{txHash}:{logIndex}` (or `oc:{chainId}:{txHash}:{eventKey}`
  where logIndex is unavailable from the subgraph row — `WagerTransfer.id`
  already encodes this uniqueness and is reused verbatim).
- Derived (fallback) wager entries: `dv:{chainId}:wager:{wagerId}:{direction}:{party}` —
  deterministic, so re-derivation is idempotent.
- Client-only entries: `cl:{uuid}` (the existing `transferStore` record `id`).

Merge precedence: `oc:` > `dv:` for the same underlying event (a derived
entry is dropped when an on-chain entry for the same
`(wagerId, direction, party)` exists). A client-only record that carries a
`txHash` which also appears as an on-chain entry is **linked** (annotation),
not duplicated: the on-chain entry wins for financial fields, the client
record contributes context (route, failure→retry association per edge case).

**Rationale**: Satisfies FR-011 (no duplicates on restore/re-sync) with pure,
testable functions; deterministic derived ids make re-derivation append-safe.

## D4 — Immutability model for client-only records

**Decision**: New append-only store `frontend/src/data/ledger/ledgerClientStore.js`
keyed per account (via `userStorage`) with entries scoped by `chainId`
(pattern proven by `activityStore`). Records are never mutated: status
transitions (in_process → complete/failed) append a superseding record with
`supersedes: <entryId>`; readers resolve to the latest while auditing can see
the chain. `transferStore` remains the *write path* the transfer flow calls
(no churn in `useTransfer.js` semantics); a mirror hook appends each
create/update into the ledger client store. One-time migration (FR-017)
imports existing `fairwins.transfers.v1` rows.

**Rationale**: FR-008 append-only requirement; avoids rewriting the working
transfer flow; the mirror + migration keeps the old Activity tab data intact
while the ledger becomes the read path.

**Alternatives**: making `transferStore` itself append-only (v2 schema) was
rejected — it churns a shipped write path and its capped, mutable design is
fine for what it is; the ledger store owns durability instead. The 100-entry
cap moves to the ledger store as a *disclosed* pruning rule that never prunes
entries within the current + previous tax year (FR-013); practically this
means no cap by default and a size-based guard with user-visible disclosure.

## D5 — Backup integration (spec 032)

**Decision**: Register one new synced object in
`frontend/src/lib/backup/syncedObjects.js`:
`{ key: 'activityLedger', networkScoped: true }` whose payload is the
client-only record set (D4). Merge is additive by `entryId` (append-only
makes merge conflict-free; identical ids are identical records). Restore
applies through the existing flow; on-chain entries are *not* backed up —
they re-derive (FR-009), keeping bundles small.

**Rationale**: The synced-object registry was explicitly designed for this
("Adding a future object = one entry here", `syncedObjects.js:1-3`); FR-010's
"included automatically" falls out of the existing backup flow.

## D6 — Real timestamps on subgraph-less networks (kills "20645d ago")

**Decision**: Two-part fix:
1. **Data**: on RPC-only networks, hydrate wager event timestamps from chain
   truth using the bounded event-window scanner that `reportDataSource`
   already implements (per-wager window, adaptive chunk, request budget), then
   `getBlock` timestamps for matched events; results cached in a small
   localStorage timestamp cache (pure perf — safe to lose, re-derivable).
   Derived entries whose timestamp cannot be established within budget carry
   `timestamp: null` + `timestampProvenance: 'unavailable'` — never `0`.
2. **Render**: `formatRelativeTime` (`frontend/src/lib/account/format.js`)
   returns `null` for missing/zero/negative input; all call sites
   (`RecentActivityFeed`, ledger UI, `TransferActivityList`) render an
   explicit "date unavailable" state on `null`. `deriveTransfersFromWagers`
   stops coercing missing times to `0`/`createdAt`.

**Rationale**: FR-005/006 and SC-004. The render guard alone would hide the
symptom but fail FR-005 (real block time on every network); the scan gives
truth within a disclosed budget, and the guard covers the remainder honestly.

## D7 — Valuation (USD value-at-time)

**Decision**: Reuse the existing enrichment pipeline
(`frontend/src/lib/account/enrichTransfers.js` + the tax report's pricing in
`reportBuilder`): each entry gets `valueUsd` + `valuationStatus:
'valued' | 'unvalued'`. No new price provider; unpriceable entries are
flagged, never zeroed or dropped (FR-016, edge case).

## D8 — Reporting & dashboard parity

**Decision**: `useAccountStats` and the tax report both consume the ledger:
- `useAccountStats` replaces its `deriveTransfersFromWagers` internals with a
  ledger query scoped to (account, chainId); `computeSummary`,
  `computePnlSeries`, `computeBreakdowns` become pure functions **of ledger
  entries** (settled only — failed entries excluded from totals, FR-003).
- `reportBuilder`/`reportDataSource` enumerate the same ledger query for the
  selected period, extending the CSV/PDF columns to all activity classes and
  the `valuationStatus` flag.

**Rationale**: FR-014/015 "can never disagree" is achieved structurally —
one read path — rather than by reconciliation.

## D9 — Scope boundaries (what stays out)

- **No subgraph schema changes** in this feature: every FR is satisfiable
  from existing entities + client capture. Indexing UserOps/transfers is a
  possible future spec; noted, not planned here (YAGNI).
- **No contract changes**: zero `contracts/` surface; constitution Principle I
  gates are trivially met.
- **Incoming arbitrary transfers** (third-party airdrops): best-effort only,
  disclosed in report output (spec assumption). Detection limited to what
  existing sources see.
- **Notification feed (spec 031)** stays a notification system; it gains no
  new duties. Consistency (FR-002) is validated by test: any financial event
  the feed shows must resolve to a ledger entry.
