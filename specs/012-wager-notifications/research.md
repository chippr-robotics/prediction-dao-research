# Research: Wager Activity Notifications

**Feature**: 012-wager-notifications | **Date**: 2026-06-10

All Technical Context unknowns resolved. User direction applied: **build
without subgraph integration** (may be added later behind the same interface).

---

## R1 — Change-detection mechanism: poll-and-diff via per-user index reads

**Decision**: Poll `WagerRegistry`'s per-user index (`getUserWagerCount` /
`getUserWagerIds` / `getUserWagers`) through the existing
`fetchFriendMarketsForUser(account, chainId)` in
`frontend/src/utils/blockchainService.js:493`, and diff the normalized wager
structs against a persisted per-wager snapshot. The same diff handles catch-up
(first poll vs. last session's snapshot) and live detection (poll vs. previous
poll).

**Rationale**:
- The repo already abandoned `eth_getLogs` for v2 wager discovery: public
  RPCs (Polygon Amoy especially) reject wide block ranges
  (`blockchainService.js:472-474`). The configured transports are HTTP-only
  (`frontend/src/wagmi.js:168-175`, publicnode + polygon.technology), so
  wagmi `watchContractEvent` would silently fall back to filter-polling on the
  same constrained RPCs — strictly worse than struct reads, and it cannot see
  changes that happened while the app was closed.
- Struct reads are authoritative current state: immune to missed/reorged
  events, and they directly express the spec's catch-up requirement (FR-005).
- Cost is bounded: 1 + 2·⌈n/100⌉ calls per poll cycle (n = user's wager
  count) — trivial at a 30 s cadence for tens of wagers.

**Alternatives considered**:
- *Subgraph polling* — excluded by user direction; also the deployed subgraph
  indexes `FriendGroupMarketFactory` (legacy v1), not `WagerRegistry`, so it
  would have required subgraph work first. The watcher consumes the normalized
  wager shape, so an indexer source can be swapped in later without UI change.
- *wagmi `watchContractEvent` / WebSocket subscriptions* — no WS transports
  configured; HTTP filter-polling hits public-RPC log limits; misses
  app-closed changes; would still need the snapshot diff for catch-up. Adds a
  second mechanism without removing the first.
- *Reusing `WagerRepository`/`EventsSource`* — that `EventsSource` is the
  legacy v1 factory path (`MemberAdded` scans); not applicable to v2
  `WagerRegistry` chains (137/80002).

## R2 — Pending draw proposals: bounded best-effort event scan

**Decision**: Detect `DrawProposed` / `DrawRevoked` via a supplementary,
watermarked, chunked `queryFilter` scan filtered to the user's known wager IDs
(indexed `wagerId` topic), from the last-processed block to tip. Best-effort:
on RPC rejection/failure, skip silently and retry next poll — never block the
struct-based pipeline.

**Rationale**: A pending draw proposal is the one user-relevant transition
invisible to reads — consent lives in `_drawConsent` (private mapping,
`WagerRegistry.sol:64`, no getter). The spec (FR-001: provisional settlement
proposed by the counterparty) requires it; the counterparty must know a draw
was proposed to consent or decline. Both-parties-consented draws DO surface via
struct diff (`status → Draw`), so the core flow degrades gracefully if the
scan fails.

**Alternatives considered**:
- *Skip draw-proposal notifications entirely* — fails FR-001; the counterparty
  would only learn of a settled draw after the fact.
- *Add a `drawConsent` getter to the contract* — contract change for a UX
  feature; triggers the full security pipeline; rejected for MVP (could be a
  future enhancement enabling pure-read detection).

## R3 — Poll cadence and lifecycle

**Decision**: 30 s interval while the tab is visible; pause on
`document.visibilitychange` (hidden) and resume+poll immediately on visible.
Immediate poll on: provider mount, wallet connect, account change, chain
change. First poll deferred until after first paint (non-blocking startup,
FR-005).

**Rationale**: 30 s halves the 60 s budget of SC-002, leaving headroom for RPC
latency. Visibility-pausing respects public RPC budgets and battery. Account/
chain-change polls keep scoping honest (FR-009).

**Alternatives considered**: block-number-driven polling (wagmi
`useBlockNumber({watch})` ≈ 2 s blocks on Polygon — 15× the RPC cost for no
user-visible gain); long intervals (>60 s violates SC-002).

## R4 — Storage: `userStorage` with chainId-scoped keys

**Decision**: Persist one versioned store per (account, chain) in
`localStorage` via the existing `userStorage.js` helpers — key
`wager_activity_v1_<chainId>` under the `fw_user_<address>_` prefix. Store
holds wager snapshots, feed entries (capped at 100, oldest pruned), per-entry
read flags, deadline-warning records, and the draw-scan block watermark.
Schema versioned with migrate-or-reset on mismatch; corrupt JSON resets to
default (storage is a cache — chain remains the source of truth, and badges
derive from live state per FR-012).

**Rationale**: `userStorage` already account-scopes keys
(`fw_user_<addr>_<key>`, `userStorage.js:17-23`) and is the established
pattern (`useUnreadMarketTracker` persists the same way). It is **not**
network-scoped, so the chainId goes in the key — satisfying FR-009 without
touching the shared helper.

**Alternatives considered**: IndexedDB (overkill for ≤100 entries + snapshots);
extending `userStorage` itself to take a chainId (wider blast radius on
existing call sites for no benefit).

## R5 — Surfacing: reuse toasts; new bell/feed; keep existing unread tracker separate

**Decision**:
- Toasts: existing `useNotification()` → `showNotification(message, type,
  duration)` from `UIContext` (already aria-live correct; `NotificationSystem.jsx:34`).
- Bell + feed: new components (none exist today — confirmed). Bell sits in
  `Header.jsx` `.header-actions` (appMode + connected only); count rendered
  with the existing `Badge` component.
- The legacy My Wagers per-tab unread counts are **removed** (user direction,
  2026-06-10): with the bell as the single unread indicator, the
  `useMyWagerNotifications` instance (key `my_wagers_notifications`) is retired
  from `MyMarketsModal`; the `createUnreadMarketTracker` factory stays for
  other surfaces (FriendMarkets "new markets" highlight). The feed keeps
  *entry-level* read state (one wager can produce many entries) in the
  activity store. Read semantics (spec FR-004/FR-016): an entry clears from
  the unread count when the user acknowledges it in the feed or views the
  affected wager's details — opening the feed alone does not mark entries
  read. Action-needed badges are *derived live state* (FR-012), not
  read-state, computed by the provider and consumed by Dashboard + modal.

**Rationale**: Three different concerns — transient alert, historical feed
read-state, current actionability — map to dedicated mechanisms without
forcing one storage shape to serve all. Two parallel unread indicators (bell +
legacy tab counts) would double-count the same changes and confuse users about
which to trust; removing the legacy counts keeps one source of truth.

**Alternatives considered**: extending `createUnreadMarketTracker` to back the
feed (its `seenMarkets` map is keyed by market with single status — cannot
represent multiple entries per wager or per-entry read flags without a
breaking schema change); keeping both unread systems side by side (rejected:
duplicate, possibly contradictory counts for the same events).

## R6 — Status normalization and derived lifecycle states

**Decision**: The diff engine consumes the normalized wager shape from
`blockchainService.toWagerShape` and computes a canonical lifecycle state:
raw statuses (`pending` [Open], `active`, `resolved`, `cancelled`, `refunded`,
`draw`) plus time/identity-derived states — `expired` (Open & past
`acceptanceDeadline`), `resolvable` (Active & within
[`tradingEndTime`, `resolveDeadlineTime`], actor per `resolutionType`),
`refundable` (Active & past `resolveDeadlineTime`, unresolved), `claimable`
(Resolved & `winner === account` & `!paid`), `paid-out` (paid flips true).
Transitions between canonical states generate entries (full matrix in
contracts/notification-types.md). Fix `WAGER_STATUS_NAMES` in
`blockchainService.js:401` to include `'draw'` at index 6 (currently maps the
on-chain `Draw` status to `'unknown'`).

**Rationale**: The chain only stores 7 coarse statuses; everything time-window
related (the spec's "became resolvable", "expired") must be derived
client-side from on-chain deadlines (`acceptDeadline`, `resolveDeadline`,
`tradingEndTime = resolveDeadline − 48h`, per `toWagerShape`,
`blockchainService.js:449-458`). Deriving in one pure module keeps honesty
testable (constitution III). The `Draw` gap is a real pre-existing bug the
feature would otherwise inherit.

**Alternatives considered**: diffing raw status enum only (misses expired/
resolvable/claimable — the spec's highest-value notifications).

## R7 — Honest-finality copy mapping (constitution III)

**Decision**: Message catalog (contracts/notification-types.md) is written
against actual v2 semantics: `declareWinner` and oracle auto-resolution are
final — "You won! Claim X" is shown only at `Resolved && winner==user &&
!paid`, which is genuinely claimable. Draw proposals are explicitly
provisional ("X proposed a draw — accept or decline"). The spec's
original "dispute/challenge window" language was remapped (spec remediation,
2026-06-10) to v2's actual mechanisms: draw
consent (provisional) and resolution windows (deadline-derived). Legacy v1
statuses (`challenged`, `oracle_timed_out` on Mordor) pass through the diff
engine with generic factual copy — no v1-specific flows are built.

**Rationale**: v2 `WagerRegistry` has no on-chain dispute/challenge window;
inventing one in copy would violate honest finality. The spec's FR-011 demands
exactly this mapping.

**Alternatives considered**: none viable — copy must follow the contract.
