# The Unified Activity Ledger: One Timeline From Five Disagreeing Sources

*How FairWins merges wagers, transfers, pools, earn, and memberships from subgraph and RPC into a single chronological feed that the dashboard, the transfer list, and the tax report can never contradict.*

| | |
|---|---|
| **Series** | Multi-chain Infrastructure (part 3) |
| **Audience** | Full-stack and data engineers |
| **Tags** | `activity-feed`, `indexing`, `data-modeling`, `the-graph`, `rpc`, `full-stack` |
| **Reading time** | ~9 minutes |

---

## The bug that only a ledger could kill

A member opens the Account tab and sees a wager payout dated "20645d ago." Fifty-six years in the future, more or less — the classic Unix epoch-zero timestamp rendered as a relative time. On the same screen, the running profit-and-loss tile disagrees with the number at the top of the tax report they downloaded ten minutes earlier. Neither figure is wrong, exactly; they were computed by two different code paths reading two different sources, and the paths had quietly drifted.

This is the ordinary fate of an activity feed that grows one feature at a time. FairWins accumulated six surfaces that each answered "what happened to my money?" in isolation: the Account dashboard derived wager transfers from cached wager state; the Pay & Transfer activity tab read a local `transferStore`; the tax report enumerated `WagerTransfer` rows from the subgraph; pools, earn, and membership purchases each had their own read path. The dashboard used synthetic timestamps and empty transaction hashes because deriving-from-state is all it had. The report used real block times and real hashes because the subgraph gives you those. When the two are supposed to sum to the same P&L, they can't — not reliably, not across a subgraph-less network like Mordor where one of them has no data at all.

Spec 051 — the unified activity ledger — replaces all six read paths with exactly one. The Account tab, the transfer activity list, `useAccountStats`, and the CSV/PDF tax report now consume the same normalized entry stream. That is the whole point of the design: **their line items and totals are structurally incapable of disagreeing, because there is only one place the numbers come from.** No new backend, no new subgraph entity, no contract change. The entire feature is a client-side aggregation layer living in `frontend/src/data/ledger/`.

## The shape of one entry

Everything the ledger does hangs off a single canonical value object, the `LedgerEntry`. Heterogeneous events — a USDC send, a wager payout, a pool refund, a failed gasless UserOp — all normalize into the same fields so downstream code never branches on "what kind of thing is this." The vocabulary is frozen in one file, `frontend/src/data/ledger/constants.js`, and shared by sources, repository, UI, and report:

```js
export const LEDGER_CLASS = Object.freeze({
  WAGER: 'wager', TRANSFER: 'transfer', EARN: 'earn',
  POOL: 'pool', MEMBERSHIP: 'membership',
})
export const LEDGER_STATUS = Object.freeze({
  SETTLED: 'settled', PENDING: 'pending',
  FAILED: 'failed', CANCELLED: 'cancelled',
})
export const PROVENANCE = Object.freeze({
  ONCHAIN: 'onchain', DERIVED: 'derived', CLIENT: 'client',
})
```

An entry carries a `class` and a class-specific `kind` (`deposit`, `payout`, `refund`, `send`, `pool_claim`, `voucher_purchase`, and so on), a `direction` (`in` / `out` / `none`), a `status`, the exact `amountRaw` in chain units, an optional `valueUsd` with a `valuationStatus`, a `txHash` and `timestamp` where they exist, and — crucially — a `provenance`. Provenance is not decoration. It is how the merge layer decides which of two rows describing the same event wins.

## Three namespaces, one identity

Reconciliation begins with identity. Every entry gets a stable `entryId` in a namespace that mirrors its provenance, built by pure functions in `frontend/src/data/ledger/identity.js`:

```js
export function onchainEntryId({ chainId, txHash, logIndex }) {
  return `oc:${Number(chainId)}:${txHash}:${logIndex ?? 'x'}`
}
export function derivedWagerEntryId({ chainId, wagerId, kind, party }) {
  return `dv:${Number(chainId)}:wager:${String(wagerId)}:${kind}:${String(party || '').toLowerCase()}`
}
export function clientEntryId(uuid) {
  return `cl:${uuid}`
}
```

- `oc:` — on-chain, re-derivable, always carries a `txHash`. The high-fidelity truth.
- `dv:` — derived from on-chain *state* when there is no indexed event to read (a subgraph-less network). Deterministic, so re-deriving on the next poll produces a byte-identical id and nothing duplicates.
- `cl:` — client-only, existing solely on this device. A failed UserOp the chain never recorded lives here.

The derived id is the subtle one. Because it hashes only `(chainId, wagerId, kind, party)` — not a timestamp, not a nonce — calling `list()` twice yields the same id both times. Re-derivation is idempotent, which is what makes an append-only, poll-driven system safe.

## The merge: precedence, not reconciliation

The hard part of any unified feed is what to do when the same real-world event shows up from two sources. FairWins does not "reconcile" in the sense of comparing and patching; it applies a fixed precedence and drops or folds the losers. The logic is in `mergeEntries` in `identity.js`, and it runs in three passes:

1. **Union by `entryId`.** First occurrence wins. Append-only records with the same id are identical by construction, so this is a set union.
2. **`oc:` beats `dv:` for the same underlying event.** Both the subgraph row and the derived fallback stamp the same `refs.dedupKey` — `wager:{wagerId}:{kind}` — so when a real indexed event exists, the derived stand-in for that event is filtered out entirely.
3. **`cl:` folds into `oc:` by `txHash`.** A client record that later matches a confirmed on-chain entry is not shown twice: the on-chain entry wins the financial fields and gains the client record's context (its `route`, its linked id) as annotations.

```js
merged = merged.filter(
  (e) => !(namespaceOf(e.entryId) === 'dv'
        && e.refs?.dedupKey
        && onchainDedupKeys.has(e.refs.dedupKey)),
)
```

That single filter is the antidote to the original bug. The old Account tab made the derived path primary everywhere; the ledger inverts it — subgraph transfers are primary (they carry the `txHash` and real block time the tax report needs), and the derived path is a clearly flagged fallback that yields the moment real data arrives. Dashboard and report agree because they read the *same* merged output, with the *same* precedence, from the same query.

## Sources that fail without failing the ledger

Each activity domain is a `LedgerSource` adapter under `frontend/src/data/ledger/sources/`, implementing a deliberately small contract: a `class` string and an async `list(ctx)` that performs reads only, never writes a store, never throws on empty history, and never returns an entry for a chain other than the one queried. The wager source (`wagerLedgerSource.js`) is the richest — it tries the subgraph's `WagerTransfer` rows first and, on a subgraph-less network, falls back to `deriveTransfersFromWagers` with block times hydrated by a bounded RPC scan:

```js
const indexed = await listTransfers({ account })
if (indexed !== null && indexed !== undefined) {
  return indexed.map((row) => wagerTransferToEntry(row, { chainId, account }))
}
// Subgraph-less network — derive from wager state (the My Wagers truth).
let wagers = await listWagers({ account, chainId })
wagers = await hydrate(wagers, chainId)   // real block times, bounded scan
const derived = deriveTransfersFromWagers({ wagers, address: account })
return derived.map((row) => derivedTransferToEntry(row, { chainId, account }))
```

The repository (`ledgerRepository.js`) assembles all sources with `Promise.allSettled`. A source that rejects does not blank the feed — its class is added to `staleClasses`, which the UI discloses honestly rather than hiding:

```js
settled.forEach((res, i) => {
  if (res.status === 'fulfilled') collected.push(...res.value)
  else staleClasses.push(sources[i].class)
})
```

So if the subgraph is down but the local transfer store is healthy, you still see your transfers, with a visible note that pool and membership history is temporarily stale. Graceful degradation is a property of the whole ledger, earned one source boundary at a time.

## Invariants that make the numbers honest

Normalization (`normalize.js`) is where pre-items become validated entries, and it enforces the guarantees that kill the original defects:

- **`timestamp` is real epoch milliseconds or `null` — the value `0` never survives.** A missing or zero time becomes `null` with `timestampProvenance: 'unavailable'`, and `formatRelativeTime` returns `null` for invalid input so the UI renders an explicit "date unavailable." The "20645d ago" render is now unreachable.
- **`status: 'failed'` forces `direction: 'none'`.** Failed operations moved no value. They are *listed everywhere* — a failed gasless send with its verbatim bundler reason is first-class history — but excluded from every total by the summary helpers, not by omission.
- **`valuationStatus: 'unvalued'` entries are flagged, never zeroed or dropped.** An asset with no price source is honestly marked, so it can't silently distort a P&L.
- **Entries are strictly scoped to the queried `chainId`;** normalization throws if a source leaks a cross-chain row.

Because the repository returns immutable value objects and never mutates a returned entry, these invariants hold all the way to the render layer.

## Durability without a dossier

On-chain and derived entries are never persisted — they re-derive from public data on any device, which keeps backups small. Only the `cl:` records (failed UserOps, in-flight sends) need durable storage, and they live in an append-only `ledgerClientStore`: a status transition appends a superseding record via `refs.supersedes` rather than mutating history. That store rides along in the spec-032 encrypted backup as the `activityLedger` synced object, merged by `entryId` union in both restore modes — a destructive replace would violate the audit guarantee. A one-time, marker-guarded `migrate.js` imports the legacy `fairwins.transfers.v1` log with id-stable mapping, so pre- and post-migration data dedup cleanly.

## Design decisions

- **Client-side aggregation over a server ledger.** A relay-gateway ledger would only ever see relayed traffic, would add an availability dependency, and would violate the platform's no-dossier privacy stance. Every source the ledger needs already had a client read path; what was missing was one normalization and merge layer.
- **Precedence over reconciliation.** Rather than compare-and-patch, the merge assigns each event to a namespace and applies a fixed `oc: > dv:`, `cl:`-folds-into-`oc:` order. Deterministic derived ids make this idempotent under polling.
- **Subgraph primary, derived fallback — the inverse of the old dashboard.** This is the single change that lets the report and the dashboard agree: both consume the same merged stream where the high-fidelity source always wins.
- **Honest degradation as a first-class output.** `staleClasses`, `prunedBefore`, `valuationStatus`, and `timestampProvenance` are all returned to the UI so limits are disclosed, never hidden. Pruning can never touch the current or previous tax year.
- **Known limits, stated plainly.** Earn actions made outside the app aren't in the ledger (there's no fixed vault registry to scan); pool and membership history require the chain's subgraph and return an honest empty list on RPC-only networks.

The result is boring in the best way. One read path, five classes, three provenance namespaces, and a merge that a test suite can pin down completely because every function in it is pure.

## Sources

- `specs/051-unified-activity-ledger/spec.md`, `plan.md`, `research.md` (decisions D1–D9), `data-model.md`
- `specs/051-unified-activity-ledger/contracts/ledger-source.md`, `ledger-entry.md`, `backup-object.md`
- `docs/developer-guide/activity-ledger.md`
- `frontend/src/data/ledger/`: `ledgerRepository.js`, `identity.js`, `normalize.js`, `constants.js`, `ledgerClientStore.js`, `migrate.js`, `timestamps.js`
- `frontend/src/data/ledger/sources/`: `wagerLedgerSource.js`, `transferLedgerSource.js`, `poolLedgerSource.js`, `earnLedgerSource.js`, `membershipLedgerSource.js`
- The Graph documentation — https://thegraph.com/docs/
- Unix epoch / timestamp conventions — https://en.wikipedia.org/wiki/Unix_time
