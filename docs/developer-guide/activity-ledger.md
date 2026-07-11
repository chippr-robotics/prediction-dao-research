# Unified Activity Ledger (spec 051)

The activity ledger is the single read path for a member's financial history:
wager value events, wallet transfers (including failed gasless/sponsored
operations), earn/lending actions, pool joins/claims/refunds, and
membership/voucher purchases. The Account tab, the Pay & Transfer Activity
tab, and the tax report all consume it — which is what makes their line items
and totals structurally incapable of disagreeing.

Design artifacts: `specs/051-unified-activity-ledger/` (spec, plan,
data-model, contracts, quickstart).

## Architecture

```
sources/*.js  ──► ledgerRepository ──► useActivityLedger ──► Account tab feed
 (5 domains)        │  normalize            │                Transfer Activity tab
                    │  merge/dedup          └───────────────► useAccountStats (tiles/P&L)
                    │  enrich (token+USD)
                    └────────────────────────────────────────► reportBuilder (CSV/PDF)
```

- **`frontend/src/data/ledger/ledgerRepository.js`** — assembles sources for
  one `(account, chainId)`, normalizes (invariants below), dedups, enriches
  token meta + USD, filters (class/status/kind/period), sorts newest-first.
  A failing source degrades to `staleClasses` (disclosed in the UI) instead
  of failing the ledger.
- **Sources** (`frontend/src/data/ledger/sources/`) implement the adapter
  contract in `specs/051-unified-activity-ledger/contracts/ledger-source.md`:
  - `wagerLedgerSource` — subgraph `WagerTransfer` rows (primary; real
    txHash + block time) or, on subgraph-less networks, rows derived from
    wager state with block times hydrated by `timestamps.js`.
  - `transferLedgerSource` — the append-only client ledger plus (pre-
    migration) legacy `fairwins.transfers.v1` rows mapped to the same ids.
  - `earnLedgerSource` — client records captured at action time
    (`captureEarnAction`, called beside `queueEarnAction` in the earn flows).
  - `poolLedgerSource` / `membershipLedgerSource` — subgraph
    `PoolMember`/`PoolClaim`/`PoolRefund` and `Voucher` entities.

## Identity & merge

Every entry has a stable `entryId` (`data-model.md` "Identity"):

- `oc:{chainId}:…` on-chain (requires `txHash`),
- `dv:{chainId}:wager:{id}:{kind}:{party}` derived (deterministic →
  re-derivation is idempotent),
- `cl:{uuid}` client-only.

Merge precedence: `oc:` beats `dv:` for the same underlying event (via
`refs.dedupKey`); a `cl:` record whose txHash matches an `oc:` entry is
folded in as context, never duplicated.

## Invariants (enforced by `normalize.js`)

- `timestamp` is real epoch **ms** or `null` + `timestampProvenance:
  'unavailable'` — the value `0` never survives, so the "20645d ago" defect
  class cannot render (`formatRelativeTime` also returns `null` for invalid
  input; callers show "date unavailable").
- `status: 'failed'` ⇒ `direction: 'none'`; failed entries are listed
  everywhere but excluded from every total.
- `valuationStatus: 'unvalued'` entries are flagged, never zeroed or dropped.
- Entries are strictly scoped to the queried `chainId`.

## Durability (backup + migration)

- Client-only records live in the **append-only**
  `ledgerClientStore` (status transitions append superseding records via
  `refs.supersedes`; nothing is mutated). They travel in the spec-032
  encrypted backup as the `activityLedger` synced object
  (`frontend/src/lib/backup/syncedObjects.js`) — union-by-entryId in both
  restore modes, because a destructive replace would violate the audit
  guarantee.
- On-chain/derived entries are **not** backed up: they re-derive from public
  data on any device.
- `migrate.js` imports the legacy transfer log once per account (marker-
  guarded, id-stable so overlaps dedup), triggered by any ledger query.

## Known, disclosed limits

- Earn actions made outside this app are not in the ledger (no fixed vault
  registry to scan); the notification feed's snapshot diff still surfaces
  them as they happen.
- Pool/membership history requires the chain's subgraph; RPC-only networks
  return an honest empty list for those classes.
- Timestamp hydration on RPC-only networks is budgeted per poll
  (`timestamps.js`); unhydrated entries say "date unavailable" until a later
  poll fills them.
- Client-record pruning (`pruneClientRecords`) is off by default and can
  never touch the current or previous tax year; any pruning is disclosed via
  `prunedBefore` in the UI and report headers.

See also: `docs/developer-guide/gasless-intents.md` (the flows whose failed
operations the ledger captures) and spec 016/020/031/032 for the surfaces the
ledger consolidated.
