# Activity sources (spec 031 — platform-wide notifications)

Each platform domain contributes to the unified activity feed by implementing one **ActivitySource**.
The generalized engine (`../activityEngine.js`) runs every registered source per cycle, merges their
entries, caps toasts once, and persists one per-(account, chain) store partitioned by source key. Adding a
domain = add one module here + one entry in `index.js`; **no** edits to the engine, store, feed, or bell.

See `specs/031-platform-notifications/contracts/activity-source.md` for the full contract.

## ActivitySource

```
{
  key: 'wagers' | 'dao' | 'token' | 'membership',  // entry.domain + store partition name
  label: 'Wagers' | 'DAO governance' | ...,        // human label (feed tag / filter)
  async detect({ account, chainId, nowMs, prior }) -> {
    entries,            // ActivityEntry[] — fresh this cycle; each stamped domain/refId/link
    nextSnapshots,      // replacement snapshot map for this source (carry-forward + own prune)
    nextAux,            // optional per-source records (e.g. deadline warn timestamps)
    currentIds,         // refIds seen this cycle
    actionNeededById,   // { [refId]: ActionKind | null } — recomputed live, NEVER persisted
    ok,                 // false on hard fetch failure -> engine retains prior slice
    partial,            // optional: true when a bounded scan truncated (UI marks it)
  }
}
```

### Entry shape (generalized)

`{ id, domain, refId, type, message, severity, actionable, link, createdAt, read }` — see
`specs/031-platform-notifications/data-model.md`. Legacy wager entries default `domain:'wagers'`.

## Behavioral contract (every source MUST honor)

1. **First-sight = baseline**: a (scope, refId) with no prior snapshot records the snapshot and emits ZERO
   entries — no retroactive backfill.
2. **Change = entry**: emit only on a real change vs `prior.snapshots[refId]`.
3. **Idempotent**: re-running `detect` with its own produced snapshots yields zero new entries; entry `id`s
   are stable so the engine's append-dedup is exact.
4. **Honest failure**: `ok:false` on hard fetch error (engine keeps prior slice); best-effort enrichment
   degrades / marks `partial` — never fabricates.

   **`ok:false` is louder than it looks.** It is the ONLY thing that raises the member-facing
   "Couldn't refresh …" notice, so reserve it for "I could not find out". A source that read
   successfully but has not finished walking event history reports `ok:true, partial:true` — "still
   reading" is not "could not read", and getting that wrong is what put a red error banner in front
   of every Polygon member with a Protect vault, on every session. (The notice now also waits for two
   consecutive failing cycles and names the domains, so a cold start is not announced as an outage.)
5. **No `Date.now()` / randomness** in pure diff/derive paths (use `nowMs`); network reads live in `detect`.
6. **Never call `queryFilter` from a deploy block.** Public RPCs cap one `eth_getLogs` at ~10,000
   blocks and the live contracts are millions of blocks old, so a one-shot scan is not slow — it is a
   guaranteed error, forever. Read event history through `lib/chain/logScan#scanLogs`, which chunks
   under the cap, caches what it has scanned (so a 30s poll reads only new blocks), and accepts a
   `maxChunks` budget so a first backfill cannot become a request storm. Diff nothing off a scan whose
   `complete` is false: a half-read history looks exactly like things disappearing.

## Honest client-side detection gaps (documented + omitted, never faked)

- **DAO**: per-user "can still vote" needs `hasVoted`/`getVotes` (added to `GOVERNOR_READ_ABI`); a Governor
  without them degrades voting-open to informational. Proposals beyond the bounded log-scan window are
  marked `partial`, not presented as complete.
- **Token / Membership**: historical *events* (role-grant/pause/mint/purchase logs) are not indexed
  client-side without a subgraph — these sources detect changes via **snapshot-diff** (state between two
  polls), so changes from first-sight onward are announced; pre-existing state is baseline, not backfilled.
- A subgraph indexing these contracts is the future path to complete historical coverage.
