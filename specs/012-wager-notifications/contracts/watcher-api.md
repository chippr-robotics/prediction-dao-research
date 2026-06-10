# Contract: Watcher / Provider API

**Feature**: 012-wager-notifications

Interfaces the feature exposes to the rest of the app. JS (JSDoc-style)
signatures — this is a frontend feature; "contracts" here are module APIs.

## `WagerActivityProvider` (contexts/WagerActivityContext.jsx)

Mounted inside the app-mode tree (alongside existing providers in
`AppLayout`/`App.jsx`), below wallet/network providers so it can read
`account` + `chainId`.

**Responsibilities**: own the poll loop (30 s, visibility-aware), run catch-up
on mount / wallet connect / account change / chain change, run the diff,
persist the store, fire toasts via `useNotification()`, expose state.

```js
const value = {
  /** ActivityEntry[] — newest first, already account+chain scoped */
  entries,
  /** number — entries with read === false */
  unreadCount,
  /** boolean — a poll is in flight (UI may show subtle refresh state) */
  isPolling,
  /** number|null — ms timestamp of last successful poll (null before first) */
  lastPolledAt,
  /** mark a single entry read (persists) — called when the user acknowledges it */
  markEntryRead(entryId),
  /** mark all of a wager's entries read (persists) — called when its detail view opens */
  markWagerRead(wagerId),
  /** mark all entries read (persists) — bound to the feed's explicit "Mark all read" control */
  markAllRead(),
  /** { [wagerId]: ActionKind|null } — derived live each poll, never persisted */
  actionNeededByWagerId,
  /** number — count of wagers with non-null ActionKind */
  actionNeededCount,
  /** force an immediate poll (e.g. after the user performs a wager action) */
  refresh(),
}
```

**Guarantees**:
- Disconnected wallet ⇒ `entries = []`, `unreadCount = 0`,
  `actionNeededByWagerId = {}`; no polling, no storage writes.
- Account/chain switch ⇒ state swaps atomically to the new scope's store; no
  cross-contamination (FR-009).
- Poll failure ⇒ previous state retained, nothing fabricated, automatic retry
  next cycle (FR-015). Repeated failures do not toast-spam (at most one
  "can't refresh" notice per session).
- Startup ⇒ provider renders children immediately; first poll is deferred
  (non-blocking, FR-005).

## `useWagerActivity()` (hooks/useWagerActivity.js)

`() => value` — throws if used outside the provider. Consumed by
`NotificationBell`, `ActivityFeed`, `Dashboard` (entry-point badge),
`MyMarketsModal` (card badges).

## Poll service (internal seam, mockable in tests)

```js
/**
 * Fetch the user's normalized wagers for the active chain.
 * Default impl: fetchFriendMarketsForUser(account, chainId)
 * from utils/blockchainService.js (v2 WagerRegistry per-user index reads).
 * @returns {Promise<Wager[]>} normalized wagers (toWagerShape output)
 */
fetchWagers(account, chainId)

/**
 * Best-effort DrawProposed/DrawRevoked scan for the given wager ids,
 * from `fromBlock` (exclusive) to tip, chunked. Resolves with [] on any
 * RPC limitation — never throws into the poll loop.
 * @returns {Promise<{ proposals: {wagerId, proposer, revoked}[], toBlock: number }>}
 */
scanDrawProposals({ chainId, wagerIds, fromBlock })
```

## Pure modules (exact signatures — unit-test surface)

```js
// data/notifications/derivedState.js
deriveState(wager, account, nowMs) -> CanonicalState
deriveActionNeeded(wager, account, nowMs, drawProposedBy) -> ActionKind|null

// data/notifications/diffEngine.js
diffWagers({ snapshots, wagers, account, nowMs }) ->
  { entries: ActivityEntry[], nextSnapshots: {[id]: WagerSnapshot} }

// data/notifications/deadlineWarnings.js
computeDeadlineWarnings({ wagers, warnRecords, account, nowMs }) ->
  { entries: ActivityEntry[], nextWarnRecords }

// data/notifications/activityStore.js
loadStore(account, chainId) -> ActivityStore          // default on missing/corrupt
saveStore(account, chainId, store) -> void            // prunes entries to cap
appendEntries(store, entries) -> ActivityStore        // dedup by entry.id, cap 100
markRead(store, ref) -> ActivityStore   // ref: {entryId} | {wagerId} | '*'
```

## UI component contracts

| Component | Props | Behavior contract |
|---|---|---|
| `NotificationBell` | — (uses hook) | `<button>` with `aria-label` = "Notifications, N unread"; renders `Badge` count when `unreadCount > 0`; hidden when wallet disconnected; opens/closes `ActivityFeed`; keyboard operable (Enter/Space/Escape). |
| `ActivityFeed` | `onClose` | Labeled region/dialog; entries newest-first; opening does NOT mark entries read (FR-004); entry click → acknowledge via `markEntryRead` + close + navigate to the wager in My Wagers; explicit "Mark all read" control calls `markAllRead()`; empty state: "You're all caught up"; shows `lastPolledAt` staleness hint when > 5 min. |
| Dashboard My Wagers entry badge | uses `actionNeededCount` | Badge visible iff `actionNeededCount > 0`; includes accessible text ("N wagers need action"). |
| Wager card badge (MyMarketsModal) | uses `actionNeededByWagerId[id]` | Badge labels the action ("Claim", "Resolve", "Accept", "Refund", "Respond to draw"); removed when action no longer needed (FR-007). |
| Wager detail view (MyMarketsModal) | uses `markWagerRead` | Opening a wager's detail view calls `markWagerRead(wagerId)` so viewing a wager clears its entries from the unread count (FR-004). The legacy per-tab unread counts (`useMyWagerNotifications`) are removed — the bell is the single unread indicator (FR-016). |

## Toast integration

`showNotification(entry.message, entry.severity, 6000)` for entries produced
by a **live poll** only (not catch-up — a returning user gets the feed +
badge, not a toast storm; the spec's toast requirement FR-006 applies to
changes detected while the app is open). Max 3 toasts per poll cycle; further
entries are feed-only ("+N more in activity").
