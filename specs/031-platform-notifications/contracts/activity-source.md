# Contract: ActivitySource interface & engine composition

The internal interface every domain implements, and how the generalized engine composes N sources. This is
the stable seam for "add a domain without touching the feed/bell/engine" (FR-002, SC-004).

## ActivitySource

```text
ActivitySource = {
  key: string,        // unique domain key; the entry.domain and the store partition name
  label: string,      // human domain name (filter chip + entry tag)
  detect(ctx) => Promise<DetectResult>,
}
```

### detect(ctx)

`ctx`:
- `account: string` — lowercased connected address (guaranteed non-null; engine skips sources when no wallet).
- `chainId: number` — active network.
- `nowMs: number` — engine clock (sources MUST use this, never `Date.now()`, for testability).
- `prior: { snapshots, aux }` — this source's previously persisted partition for the current scope
  (empty object maps on first sight).

**Returns `DetectResult`**:
```text
{
  entries: ActivityEntry[],            // fresh, domain/refId-stamped; [] when nothing changed
  nextSnapshots: { [refId]: object },  // replacement snapshot map (carry-forward semantics)
  currentIds: string[],                // refIds seen this cycle (for snapshot pruning)
  actionNeededById: { [refId]: ActionKind | null },  // recomputed live; NOT persisted
  ok: boolean,                         // false on hard fetch failure → engine retains prior slice
  partial?: boolean,                   // true when a bounded scan truncated (UI marks it)
}
```

### Behavioral contract (every source MUST honor)

1. **First-sight = baseline.** On the first cycle for a (scope, refId) — i.e. no prior snapshot — record
   the snapshot and emit **zero** entries (no retroactive backfill). Mirrors `diffWagers`.
2. **Change = entry.** Emit an entry only on a real state change vs `prior.snapshots[refId]`.
3. **Idempotent.** Re-running `detect` with the snapshots it just produced yields zero new entries
   (tested via a re-diff). Entry `id`s are stable so the engine's `appendEntries` dedup is exact (FR-018).
4. **Carry-forward.** `nextSnapshots` starts from `prior.snapshots`; objects absent this cycle are carried
   (pruning is the engine's job, not the source's).
5. **Honest failure.** On a hard fetch error return `ok:false` (engine keeps the prior slice, surfaces at
   most one notice). Best-effort enrichment that fails MUST degrade (retain prior / mark `partial`), never
   fabricate (FR-017/019/020).
6. **No `Date.now()` / no randomness** in the pure diff/derive paths (use `nowMs`); network reads live in
   `detect` only.
7. **Pure-ish.** `detect` must not mutate `ctx.prior`. The diff/derive helpers it calls are pure.

## Engine composition (ActivityProvider)

Per cycle (every `POLL_INTERVAL_MS=30_000` while visible; deferred first poll; paused when hidden):

1. Resolve `scope = (account, chainId)`. If no wallet → idle (no read/write).
2. For each registered source, call `detect({ account, chainId, nowMs, prior: store.sources[key] })`,
   guarding the active scope after each await (`scopeRef` — discard stale-scope results, FR-016).
3. For each source with `ok`: replace `store.sources[key].snapshots/aux`, prune snapshots
   (absent+terminal+>30d). For `ok:false`: **retain** that source's prior slice.
4. `fresh = sources.flatMap(s => s.ok ? s.entries : [])`.
5. Re-read the latest store **after** awaits (so a concurrent `markRead` survives), then
   `appendEntries(latest, fresh)` (global id-dedup + cap to `MAX_ENTRIES`), update `lastPolledAt`, persist.
6. `actionNeededCount = Σ over sources of count(actionNeededById values that are truthy)`.
7. **Toasts** (live cycles only — first/catch-up cycle is feed-only): toast the first
   `MAX_TOASTS_PER_CYCLE=3` of the **merged** `fresh` via `showNotification(message, severity, 6000)`,
   plus one `"+N more updates in activity"` summary if more; **all** fresh entries are recorded regardless
   (FR-009/010).
8. On a cycle-level throw: `console.warn` + at most one error toast per session; retain all prior state,
   retry next cycle (FR-017).

## Registry

`sources/index.js` exports the ordered list `[wagerSource, daoSource, tokenSource, membershipSource]`.
Adding a future domain = add one module + one array entry; **no** change to the engine, store envelope,
feed, bell, or toast (SC-004).

## ABI additions (reads-only, no contract change)

`GOVERNOR_READ_ABI` gains the existing OZ Governor views used by `daoSource`:
- `hasVoted(uint256 proposalId, address account) view returns (bool)`
- `getVotes(address account, uint256 timepoint) view returns (uint256)`
- `proposalEta(uint256 proposalId) view returns (uint256)` — include only if the tracked Governors expose
  it; used to gate "ready to execute" (R5). Absence → honest fallback wording, never a faked ETA.
