# Data Model: Wager Activity Notifications

**Feature**: 012-wager-notifications | **Date**: 2026-06-10

All entities are client-side. The chain is the source of truth; everything
here is a cache/projection that can be rebuilt (badges always derive from live
state — FR-012).

## Entity overview

```text
ActivityStore (1 per account × chain, localStorage)
├── snapshots:        { [wagerId]: WagerSnapshot }     ← diff baseline
├── entries:          ActivityEntry[]  (≤ 100)          ← the feed
├── deadlineWarnings: { [wagerId]: { [window]: lastWarnedAt } }
└── drawScanBlock:    number                            ← event-scan watermark

ActionNeeded (derived at runtime, never persisted)
└── { [wagerId]: ActionKind | null }
```

## ActivityStore

Persisted via `userStorage` (localStorage), key `wager_activity_v1_<chainId>`,
full key `fw_user_<address>_wager_activity_v1_<chainId>`.

| Field | Type | Notes |
|---|---|---|
| `version` | number | Schema version (1). Mismatch → migrate or reset to default. |
| `lastPolledAt` | number (ms) | Diagnostic; shown as "as of" in feed if stale. |
| `snapshots` | map wagerId → WagerSnapshot | Baseline for the next diff. Replaced wholesale after each successful poll. |
| `entries` | ActivityEntry[] | Newest first. Pruned to 100 (oldest dropped). |
| `deadlineWarnings` | map | Anti-spam record: per wager, per window, timestamp of last warning entry. |
| `drawScanBlock` | number | Last block processed by the DrawProposed/DrawRevoked scan. 0 = start from current tip (no historical backfill). |

**Validation / integrity**: corrupt JSON or unknown version ⇒ reset to default
store (feed history lost; correctness preserved because badges and states
re-derive from chain). Account or chain switch ⇒ load the other store; never
merge.

## WagerSnapshot

Minimal per-wager fingerprint — just enough to detect and describe transitions.

| Field | Type | Source (normalized wager from `toWagerShape`) |
|---|---|---|
| `id` | string | `wager.id` |
| `state` | CanonicalState | computed by `derivedState.js` at snapshot time |
| `status` | string | raw normalized status (debug/migration aid) |
| `winner` | string\|null | `wager.winner` (lowercased) |
| `paid` | boolean | `wager.paid` |
| `acceptanceDeadline` | number (ms) | `wager.acceptanceDeadline` |
| `resolveDeadlineTime` | number (ms) | `wager.resolveDeadlineTime` |
| `tradingEndTime` | number (ms) | `wager.tradingEndTime` |
| `drawProposedBy` | string\|null | from event scan; cleared on DrawRevoked / terminal state |
| `snappedAt` | number (ms) | when this snapshot was taken |

## CanonicalState (derived, not stored on-chain)

Computed by pure function `deriveState(wager, account, now)`:

| State | Condition (v2) |
|---|---|
| `pending` | status `pending` (Open) and `now ≤ acceptanceDeadline` |
| `expired` | status `pending` and `now > acceptanceDeadline` |
| `active` | status `active` and `now < tradingEndTime` |
| `resolvable` | status `active` and `tradingEndTime ≤ now ≤ resolveDeadlineTime` |
| `refundable` | status `active` and `now > resolveDeadlineTime` |
| `resolved-claimable` | status `resolved`, `winner == account`, `!paid` |
| `resolved-won-paid` | status `resolved`, `winner == account`, `paid` |
| `resolved-lost` | status `resolved`, `winner != account` |
| `draw` | status `draw` |
| `cancelled` / `refunded` | raw terminal statuses |
| `other` | any unrecognized status (legacy v1 names pass through with factual copy) |

State ordering note: time-derived states can advance with **no poll-visible
on-chain change** (e.g. `active → resolvable` happens by clock alone). The
diff engine therefore compares canonical states, not raw statuses.

## ActivityEntry

One feed item. Immutable once created (except `read`).

| Field | Type | Notes |
|---|---|---|
| `id` | string | Dedup key: `<wagerId>:<type>` for state transitions; `<wagerId>:warn:<window>:<dayBucket>` for warnings; `<wagerId>:drawProposed:<proposer>` for proposals. An entry whose id already exists is never re-added (FR-010). |
| `type` | EntryType | See contracts/notification-types.md catalog. |
| `wagerId` | string | Link target (opens My Wagers detail for this wager). |
| `message` | string | Rendered from template at creation, user-perspective (FR-003). |
| `severity` | `info`\|`success`\|`warning`\|`error` | Maps to toast type + feed styling. |
| `actionable` | boolean | Drives "action needed" visual weight in feed. |
| `createdAt` | number (ms) | Detection time (not on-chain time — poll granularity is honest about this: "detected"). |
| `read` | boolean | Entry-level read state (FR-004). |

## DeadlineWarningRecord

`deadlineWarnings[wagerId][window] = lastWarnedAt (ms)`, where `window` ∈
`acceptance` | `resolution`. A warning entry is emitted when the deadline is
within 24 h, the deadline has not passed, the wager still requires the warning
(state `pending` / `active`+`resolvable`), and `lastWarnedAt` is not in the
same UTC day bucket (FR-008: ≤ 1 per wager per window per day).

## ActionNeeded (runtime-derived only)

`actionNeededByWagerId: { [wagerId]: ActionKind | null }` recomputed from the
latest polled wagers every cycle — never persisted (FR-012: survives cleared
storage / new device).

| ActionKind | Condition (account perspective) |
|---|---|
| `accept` | state `pending` and `account == opponent` |
| `resolve` | state `resolvable` and account may resolve per `resolutionType` (Either → both; Creator → creator; Opponent → opponent; ThirdParty/oracle types → none for participants) |
| `claim` | state `resolved-claimable` |
| `refund` | state `expired` (creator) or `refundable` (either participant) |
| `respondDraw` | `drawProposedBy` set and `!= account` and state `active`/`resolvable` |

Badge rule: My Wagers entry point badged iff any wager has non-null
ActionKind; each card badged iff its wager's ActionKind is non-null (FR-007).

## State-transition → entry generation (summary)

The full matrix with message templates lives in
[contracts/notification-types.md](./contracts/notification-types.md). Shape:

```text
diff(prevSnapshot, currentWager, account, now):
  prevState  = prevSnapshot?.state          // absent ⇒ first sight
  currState  = deriveState(currentWager, account, now)
  if no prevSnapshot:
      currState is terminal or pending  ⇒ snapshot only, NO entry   // avoids
      // re-announcing full history after storage reset (FR-010 + edge case)
  else if prevState != currState:
      emit entry per transition matrix (or generic factual entry for
      unmapped transitions — never silent for participant-relevant changes)
  paid false→true (same state)          ⇒ payout receipt entry
  drawProposedBy null→addr (≠account)   ⇒ draw-proposal entry
```

Invariants (unit-tested):
- Idempotent: diffing identical snapshot+wager emits nothing.
- Dedup: same entry id never appended twice.
- Perspective: messages computed from `account`'s side (won/lost/your turn).
- Honest finality: no "won/claim" copy unless `resolved-claimable`/`resolved-won-paid`.
- Scoping: a store loaded for (account A, chain X) is never written for any
  other (account, chain) pair.
