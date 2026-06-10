# Implementation Plan: Wager Activity Notifications

**Branch**: `012-wager-notifications` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-wager-notifications/spec.md`

**Note**: Working tree is currently on `main`; create `feat/012-wager-notifications`
from `origin/main` before implementation (repo rule: never commit to main).

## Summary

Make wager state changes visible without the user manually opening My Wagers:
a client-side watcher polls the user's wagers directly from the chain, diffs
them against a persisted per-wager snapshot, and surfaces changes through
(1) a bell icon + activity feed in the app header, (2) the existing transient
toast system, and (3) "action needed" badges on the My Wagers entry point and
wager cards, plus deadline warnings for closing windows.

**Technical approach** (per user direction: **no subgraph**): a poll-and-diff
engine built on the already-proven v2 read path — `WagerRegistry`'s per-user
index (`getUserWagerCount` / `getUserWagers`), exposed today via
`fetchFriendMarketsForUser()` in `frontend/src/utils/blockchainService.js`.
One mechanism covers both catch-up (first poll after app open diffs against
the snapshot persisted last session) and near-real-time (every 30 s while the
tab is visible). No `eth_getLogs` for core detection — public Polygon RPCs
restrict log ranges, which is exactly why the v2 read path avoids them. The
only event-based supplement is a bounded, best-effort `DrawProposed` /
`DrawRevoked` scan (pending draw consent is private state, invisible to reads).
All notification state persists in `localStorage` scoped to account **and**
chainId. No backend, no new dependencies.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 18 + Vite (existing `frontend/` app)

**Primary Dependencies**: ethers v6 (existing read path in `blockchainService.js`), existing `UIContext` toast system, existing `userStorage.js` localStorage helpers, existing `Badge` UI component. wagmi v3.1 stays for wallet/chain state only — no `watchContractEvent` (HTTP-only transports; see research.md R1). **No new packages.**

**Storage**: `localStorage` via `frontend/src/utils/userStorage.js` (keys prefixed `fw_user_<address>_`), with the chainId embedded in the preference key for network scoping. Versioned schema, entries capped (see data-model.md).

**Testing**: Vitest (jsdom, `frontend/src/test/setup.js` mocks). Pure-function diff/deadline engines unit-tested exhaustively; provider/components tested with mocked poll service, per `MyMarketsModal.test.jsx` conventions.

**Target Platform**: Browser SPA (fairwins.app) — Polygon mainnet (137) and Amoy (80002) via `wagerRegistry`; legacy Mordor (63) degrades gracefully (read-only v1 path).

**Project Type**: Web frontend feature — `frontend/` only. **No contract changes, no subgraph changes, no backend** (fixed-footprint constraint).

**Performance Goals**: change surfaced ≤ 60 s while app open (spec SC-002; 30 s poll interval); catch-up entries visible ≤ 10 s after load (SC-001); poll cost ≈ 1 + 2·⌈n/100⌉ RPC calls per cycle for n wagers; polling paused when tab hidden.

**Constraints**: no backend / fixed deployment footprint; public RPC rate limits (poll, don't stream; no wide `eth_getLogs`); honest finality in all copy (constitution III); WCAG 2.1 AA (constitution V); notification state never leaks across accounts or chains.

**Scale/Scope**: tens of wagers per typical user (paged reads handle hundreds); feed capped at 100 entries; ~8 new source files + 3 edited components.

## Constitution Check

*GATE: evaluated before Phase 0; re-evaluated after Phase 1 design — both PASS, no violations.*

| Principle | Assessment | Status |
|---|---|---|
| I. Security-first contracts | **No `contracts/` changes.** Feature is read-only against `WagerRegistry` view functions; no fund-custody, access-control, or oracle paths touched. Slither/Medusa/security-agent review not triggered. | PASS (N/A) |
| II. Test-first, comprehensive | Diff engine, derived-state computation, deadline warnings, and storage are pure modules with exhaustive Vitest unit tests (incl. failure/edge cases: expiry boundaries, account/chain switch, corrupted storage). Provider + bell/feed/badge components get integration tests with mocked poll source. No contract interface change → no contract-test updates needed. | PASS |
| III. Honest state, no mocks in shipped paths | All states derive from live chain reads (wager structs) — never fabricated. Derived states (expired / resolvable / refundable) use on-chain deadlines vs. wall clock and are labeled as windows, not finality. v2 `declareWinner` is final on-chain, so "You won — claim" is honest only when `status==Resolved && winner==user && !paid` — exactly the trigger used. Draw proposals (best-effort event scan) are labeled provisional ("proposed"). All notification state scoped per account+chainId; RPC failure ⇒ show nothing new, never stale fabrications (spec FR-015). Mock poll sources live only in tests. | PASS |
| IV. Fail loudly in CI | No CI workflow changes; new tests run in the existing Vitest job; no `continue-on-error` anywhere. | PASS |
| V. Accessible, consistent frontend | Toasts reuse `NotificationSystem` (aria-live polite/assertive already correct). Bell is a `<button>` with `aria-label` including unread count; feed is a labeled region with keyboard navigation; badges carry text alternatives. axe/Lighthouse CI must stay green. Addresses/ABIs come from existing generated artifacts (`frontend/src/abis/WagerRegistry.js`, `frontend/src/config/contracts.js`) — nothing hand-copied. | PASS |
| Additional constraints | No new core technology (ethers v6 read pattern already canonical in `blockchainService.js`). No secrets. `contracts-archive/` untouched. No-backend footprint preserved. | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/012-wager-notifications/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R7
├── data-model.md        # Phase 1 — entities, schema, state transitions
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   ├── watcher-api.md           # provider/hook + poll-service interfaces
│   ├── storage-schema.md        # localStorage key + versioned JSON schema
│   └── notification-types.md    # entry-type catalog, triggers, message templates
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
frontend/src/
├── data/notifications/
│   ├── activityStore.js         # NEW — load/save/prune versioned store (userStorage, account+chain key)
│   ├── diffEngine.js            # NEW — pure: (snapshots, wagers, account, now) → entries + new snapshots
│   ├── derivedState.js          # NEW — pure: wager → lifecycle state (incl. expired/resolvable/refundable/claimable)
│   ├── deadlineWarnings.js      # NEW — pure: (wagers, warnedRecords, now) → warning entries (24h, 1/wager/window/day)
│   └── drawProposalScan.js      # NEW — bounded best-effort DrawProposed/DrawRevoked log scan (watermarked, chunked)
├── contexts/
│   └── WagerActivityContext.jsx # NEW — provider: poll loop (30s, visibility-aware), catch-up on mount/account/chain change;
│                                #       exposes { entries, unreadCount, markAllRead, markEntryRead, actionNeededByWagerId }
├── hooks/
│   ├── useWagerActivity.js      # NEW — consumer hook for the context
│   └── useMyWagerNotifications.js # REMOVE — legacy My Wagers tab unread counts replaced by the bell
│                                #       (createUnreadMarketTracker factory stays for FriendMarkets)
├── components/notifications/
│   ├── NotificationBell.jsx     # NEW — header bell + unread count (Badge), opens feed
│   ├── NotificationBell.css     # NEW
│   ├── ActivityFeed.jsx         # NEW — panel: entries newest-first, links to wager, mark-read
│   └── ActivityFeed.css         # NEW
├── components/Header.jsx        # EDIT — bell in .header-actions (appMode && connected)
├── components/fairwins/Dashboard.jsx       # EDIT — action-needed badge on My Wagers entry point (US2);
│                                #       accepts an initial wager selection for feed-entry navigation (US1)
├── components/fairwins/MyMarketsModal.jsx  # EDIT — action-needed badge on wager cards (US2, reuses
│                                #       actionNeededByWagerId); opens at a specific wager from the feed (US1);
│                                #       legacy tab unread counts removed; viewing a wager marks its entries read
└── utils/blockchainService.js   # EDIT — add 'draw' to WAGER_STATUS_NAMES (index 6, currently missing → 'unknown')

frontend/src/test/  (conventions per MyMarketsModal.test.jsx)
├── diffEngine.test.js           # NEW — transition matrix, perspective, dedup, idempotence
├── derivedState.test.js         # NEW — boundary times for expired/resolvable/refundable/claimable
├── deadlineWarnings.test.js     # NEW — threshold, anti-spam (1/wager/window/day), passed deadlines
├── activityStore.test.js        # NEW — account+chain scoping, version migration, prune cap, corrupt JSON
├── WagerActivityContext.test.jsx# NEW — catch-up on mount, poll diff → toast + feed, account/chain switch reset
├── NotificationBell.test.jsx    # NEW — unread count, open/mark-read, a11y attributes (bell + feed)
├── drawProposalScan.test.js     # NEW — watermark, chunking, wagerId filter, RPC-failure degradation
├── wagerStatusNames.test.js     # NEW — regression for the 'draw' status-name fix
├── actionNeededBadges.test.jsx  # NEW — Dashboard entry-point + wager-card badges
└── feedNavigation.test.jsx      # NEW — feed entry → My Wagers detail navigation
```

**Structure Decision**: Frontend-only feature following the repo's existing
layering — pure logic in `data/` (mirrors `data/wagers/`), React state in
`contexts/` + `hooks/`, presentation in `components/`. The poll loop reuses
`fetchFriendMarketsForUser(account, chainId)` (the v2 `WagerRegistry` per-user
index read path) rather than introducing a second chain-access pattern. The
legacy My Wagers per-tab unread counts (`useMyWagerNotifications`) are removed
— the bell is the single unread indicator, with entry-level read state cleared
by acknowledging an entry or viewing the wager (see research.md R5); the
`createUnreadMarketTracker` factory remains for other surfaces.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |
