# Data Model: Platform-Wide Notification & Activity System

Client-side only (browser state + `localStorage`). No database, no backend. All shapes are plain
JS objects; addresses lowercased; time via an injected `nowMs` (no `Date.now()` in pure modules).

## Entity: ActivityEntry

One item in the unified feed. Generalizes the existing wager entry (adds `domain`, `refId`, `link`;
`wagerId` retired in favor of `refId`).

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable dedup key. Convention `"<domain>:<refId>:<type>"` (+ encoded extras for repeatable events, e.g. `:warn:<window>:<dayBucket>`). Existing-entry key remains valid post-migration. |
| `domain` | string | Source key: `'wagers' \| 'dao' \| 'token' \| 'membership'`. Drives attribution, the per-domain filter, and the domain tag/icon. Defaults to `'wagers'` for legacy entries. |
| `refId` | string | Domain object id (wagerId, `daoAddress#proposalId`, token address, `membership`). Backs `markRead({ refId })`. |
| `type` | string | Catalog event type within the domain (e.g. `'draw-proposed'`, `'voting-open'`, `'role-granted'`, `'expiring-soon'`). |
| `message` | string | Pre-formatted human text; the feed renders it verbatim (no interpolation). |
| `severity` | enum | `'info' \| 'success' \| 'warning' \| 'error'` — drives the icon, left-border, and toast type/aria-live. |
| `actionable` | boolean | True when this entry corresponds to an action-needed condition (UI affordance). |
| `link` | object \| null | Generic navigation target, e.g. `{ to: '/app', state: { openWagerId } }` or `{ to: '/wallet', tab: 'clearpath', ... }`. Replaces the wager-only navigate branch. Null = non-navigable. |
| `createdAt` | number (ms) | Detection time (`nowMs`). |
| `read` | boolean | False at creation; toggled by `markRead`. |

**Validation / invariants**: `id` unique within the store (FR-018 dedup; existing copy wins on
re-append, preserving `read`). `severity` ∈ the 4 values. `message` non-empty. Pure producers never mutate
inputs.

## Entity: ActivitySource (interface, not persisted)

A registered detector for one domain. See `contracts/activity-source.md` for the full contract.

| Member | Type | Notes |
|--------|------|-------|
| `key` | string | Unique domain key (the entry `domain`); also the store partition name. |
| `label` | string | Human domain name for the filter/tag (e.g. "DAO governance"). |
| `detect` | async fn | `({ account, chainId, nowMs, prior }) → DetectResult` (below). |

**DetectResult**:

| Field | Type | Notes |
|-------|------|-------|
| `entries` | ActivityEntry[] | Fresh entries this cycle (already domain/refId-stamped). |
| `nextSnapshots` | object | Replacement snapshot map for this source's partition (carry-forward semantics). |
| `currentIds` | string[] | Object ids seen this cycle (for snapshot pruning). |
| `actionNeededById` | object | `{ [refId]: ActionKind \| null }` — recomputed live, never persisted. |
| `ok` | boolean | False on a hard fetch failure → engine retains this source's prior slice (FR-020). |
| `partial` | boolean? | True when a bounded scan truncated (e.g. DAO window). Surfaced in UI, not faked as complete. |

## Entity: PersistedStore (v1, partitioned)

`localStorage`, key `platform_activity_v1_<chainId>`, prefixed `fw_user_<address>_` by `userStorage`
(account scope). Reuses the existing versioned/validated/corrupt-reset envelope.

```text
{
  version: 1,                       // STORE_VERSION; corrupt/!=1 → reset to default
  lastPolledAt: number,             // ms; updated each successful cycle
  entries: ActivityEntry[],         // MERGED across domains, newest-first, capped MAX_ENTRIES (100)
  sources: {                        // per-source partitions
    [key]: {
      snapshots: { [refId]: object },   // domain snapshot map (e.g. wager snapshot, role/pause map, membership)
      aux: object,                      // domain warn-records etc. (e.g. deadlineWarnings); optional
    }
  }
}
```

**Scope isolation (FR-015/016)**: key embeds `chainId`; `userStorage` embeds the lowercased account.
Disconnected wallet → never read/write. Scope change → atomic swap to that scope's store; in-flight cycle
results from the old scope are discarded by the `scopeRef` guard.

**Retention / bounds (FR-021)**: `entries` capped at `MAX_ENTRIES=100` (global across domains). Per-source
snapshots pruned when absent-this-cycle AND terminal AND older than `SNAPSHOT_RETENTION_MS` (30 days), per
the existing rule.

### Migration: `wager_activity_v1_<chainId>` → `platform_activity_v1_<chainId>`

One-time, on first load of a scope when no v1 platform store exists but a legacy wager store does:
- `entries` → carried over, each stamped `domain:'wagers'`, `refId = wagerId` (read state preserved).
- legacy `snapshots` → `sources.wagers.snapshots`; legacy `deadlineWarnings` → `sources.wagers.aux`.
- `drawScanBlock` dropped (already unused since spec 017).
Then persist under the new key and continue. If neither exists → default store.

## Per-source snapshot shapes (informative)

| Source | snapshot per refId | derived entries |
|--------|--------------------|-----------------|
| `wagers` | existing WagerSnapshot (unchanged) | existing wager catalog (unchanged) — FR-026 |
| `dao` | `{ daoAddr, proposalId, state, voteEnd, hasVoted?, finalized }` | voting-open / ready-to-queue / ready-to-execute / finalized — FR-027 |
| `token` | `{ tokenAddr, roles:{admin,minter,pauser,burner,compliance}, paused }` | role-granted / role-revoked / paused / unpaused — FR-028 |
| `membership` | `{ tier, expiresAt }` (+ voucher redeemable flag) | granted/upgraded/expired / expiring-soon / voucher-redeemable — FR-029 |

## Entity: ActionNeeded (derived, runtime-only)

Cross-domain, recomputed every cycle from current state; **never persisted** (so badges survive cleared
storage / a new device — FR-012). The provider exposes `actionNeededCount` (distinct from `unreadCount`)
and a per-entry `actionable` flag; the bell folds the count into its `aria-label`.

**ActionKind** examples by domain: wagers `accept|resolve|claim|refund|respondDraw` (unchanged); dao
`vote|queue|execute`; membership `renew|redeemVoucher`. Token currently has no action-needed kind
(informational only).

## View state (not persisted): domain filter

`ActivityFeed` local `domainFilter: string | null` (null = all), reset on open. View-only — never alters
`entries`, `unreadCount`, or `actionNeededCount` (FR-025).

## Context value (exposed by `useActivity`)

`{ entries, unreadCount, actionNeededCount, isPolling, lastPolledAt, markEntryRead, markRefRead,
markAllRead, refresh }` — the generic superset of today's wager context (`markWagerRead` → `markRefRead`).
