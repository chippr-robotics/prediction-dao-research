# Feature Specification: Platform-Wide Notification & Activity System

**Feature Branch**: `feat/platform-notifications-031`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "System-wide notification & activity system — generalize the platform's notification layer so every domain (not just wagers) can surface activities to the user. … make the notification & activity system feature-agnostic so any platform domain can register as an 'activity source' and contribute entries to a single unified feed … This unlocks awareness of on-chain activities across the whole platform … even when the user is on another page. … no app backend … honest state only … per-(account, chainId) isolation … accessibility preserved. WHAT/WHY only."

## Overview

Today the platform speaks to the user through two channels: **transient toasts** that vanish on
navigation, and a **persistent activity feed** (the header bell, with an unread count and "needs your
action" signals). The persistent feed is the durable record of "what happened that I care about" — but
it only understands **wagers**. Every other domain (DAO governance, token administration, membership)
can only fire a toast that disappears the moment the user moves to another page; nothing reaches the
durable feed, so the user has no lasting awareness of activity outside wagers.

This feature generalizes that durable layer into a **platform-wide notification & activity system**: a
single feed that any domain can feed into as a registered **activity source**, so the user gets one
place to see — and act on — everything happening on their account across the whole platform, even after
they navigate away or return in a later session. It is explicitly **the first step in generalizing the
platform**: the wager watcher becomes one source among many, and new domains plug in without
re-implementing detection, persistence, unread tracking, or the feed UI.

## Clarifications

### Session 2026-06-24

- Q: Which activity sources ship in this first step? → A: **All current domains** — wagers (migrated, no
  regression), ClearPath DAO governance, token administration, and membership are all delivered as sources
  in this spec.
- Q: How fresh must cross-domain activity be while the app is open? → A: **Near-real-time** — background
  detection runs roughly every 30 seconds while the tab is visible, pauses when hidden, and refreshes
  immediately on return (consistent with the existing wager watcher).
- Q: Which ClearPath DAO events create a feed entry? → A: **Voting open / vote castable** (action-needed),
  **ready to queue** (action-needed), **ready to execute** (action-needed), and **finalized —
  executed / defeated / expired** (informational).
- Q: Should the feed support filtering by domain in this first step? → A: **Yes** — include a per-domain
  filter/toggle in the feed now.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One feed for everything on my account (Priority: P1)

As a member, I want a single notification feed (behind the header bell) that gathers activity from
**every** part of the platform I use — my wagers **and** the DAOs I track and any tokens/membership I
hold — so I have one durable place to see what has happened, with an unread count, that survives me
navigating between pages and coming back next session.

**Why this priority**: This is the core value and the whole point of the generalization — without a
unified, durable, multi-domain feed there is no platform-wide awareness. It also forces the central
architectural change (a feed that is fed by interchangeable sources) and proves it end-to-end by
carrying the existing wager activity (with no regression) alongside the three new domains shipped here
(DAO governance, token administration, membership).

**Independent Test**: With a member who has both wager activity and tracked-DAO activity on the active
account/network, open the bell and confirm a single chronological feed shows entries from **both**
domains, each labelled by domain, with a correct unread count; navigate to another page and back and
confirm the feed and count persist; reload the session and confirm the feed is restored for that
account/network.

**Acceptance Scenarios**:

1. **Given** I have recent wager activity and a tracked DAO with a recent proposal, **When** I open the
   bell, **Then** I see one feed listing both the wager and the DAO activity, each tagged with its
   domain, newest first, with an accurate unread count.
2. **Given** the feed shows my activity, **When** I navigate to another page and return (or reload the
   app), **Then** the same entries and unread count are still there (durable, not transient).
3. **Given** I previously relied on wager notifications, **When** this feature ships, **Then** every
   wager notification I used to get still appears exactly as before (no regression in wager behavior).
4. **Given** a domain I do not use has no activity, **When** I open the bell, **Then** the feed simply
   omits that domain (no empty/placeholder noise).

---

### User Story 2 - Get alerted the moment something new happens (Priority: P2)

As a member actively using the app, I want a transient alert (toast) and an updated bell count whenever
something new happens on my account **in any domain** — not just wagers — so I notice time-sensitive
events while I am there, without being spammed when I first return after being away.

**Why this priority**: Live awareness is the difference between "I found out in time" and "I missed it."
It extends the existing live-toast behavior to every source while preserving the calm "catch-up is
feed-only, no toast storm" rule.

**Independent Test**: With the app open, cause a new on-chain activity in a non-wager domain (e.g. a
tracked DAO proposal moves into its voting window); confirm a toast appears and the bell count
increments; separately, simulate returning after time away with many accumulated changes and confirm
they populate the feed without a flood of toasts.

**Acceptance Scenarios**:

1. **Given** the app is open and focused, **When** a new activity occurs in any registered domain,
   **Then** I see a transient toast for it and the bell unread count increases.
2. **Given** I return to the app after being away and there are many new activities, **When** the first
   refresh runs, **Then** the new items appear in the feed but I am not shown a storm of toasts (a
   bounded number of toasts, with the remainder summarized).
3. **Given** several domains produce activity at nearly the same time, **When** the toasts surface,
   **Then** no activity is silently lost — every change is recorded in the durable feed even if not
   every one is shown as a toast.

---

### User Story 3 - Know what needs my action, across domains (Priority: P2)

As a member, I want the feed and bell to distinguish "just so you know" activity from "you need to do
something" across **all** domains — e.g. a wager awaiting my acceptance, a DAO vote I can still cast or a
proposal ready to queue/execute, a membership about to lapse — so I can act before a window closes.

**Why this priority**: An undifferentiated list buries the few items that actually require action.
Surfacing action-needed across domains is what makes the unified feed genuinely useful rather than just
a longer log.

**Independent Test**: Create, on the active scope, one action-needed condition in each of two domains
and one purely informational entry; confirm the feed marks the two as action-needed (and the bell
reflects an action-needed indication) while the informational entry is not flagged; resolve one action
and confirm its action-needed state clears on the next refresh.

**Acceptance Scenarios**:

1. **Given** an activity that requires me to act (e.g. a vote I can still cast), **When** I view the
   feed, **Then** that entry is clearly marked as action-needed and contributes to an action-needed
   indicator, distinct from the unread count.
2. **Given** an action-needed condition, **When** I complete the action (or the window passes), **Then**
   the action-needed state clears on the next refresh without me manually editing it.
3. **Given** an informational-only activity, **When** I view the feed, **Then** it is **not** marked
   action-needed.

---

### User Story 4 - Manage and trust my feed (read state, filtering, scope isolation) (Priority: P3)

As a member, I want to mark items read (one at a time or all at once) and **filter the feed by domain**,
and I want the feed to belong strictly to the wallet and network I am currently on — so switching account
or network shows that context's own feed and never leaks another's — keeping the feed accurate, focusable,
and private to its scope.

**Why this priority**: Read-state management and per-domain filtering keep the feed usable as activity
grows across four domains, and strict per-(account, network) isolation is a correctness/privacy
requirement carried over from the existing behavior that must not be lost in the generalization.

**Independent Test**: Mark a single entry read and confirm the unread count drops by one; mark all read
and confirm the count reaches zero; apply a domain filter and confirm only that domain's entries show
while the others are hidden; switch to a different account (or network) and confirm a different,
correctly-scoped feed appears with no entries from the previous scope; switch back and confirm the
original feed (and its read states) is intact.

**Acceptance Scenarios**:

1. **Given** unread entries, **When** I mark one read, **Then** the unread count decreases by exactly
   one and that entry is shown as read.
2. **Given** unread entries, **When** I choose "mark all read", **Then** the unread count becomes zero.
3. **Given** a feed with entries from several domains, **When** I select a domain filter, **Then** only
   that domain's entries are shown; **When** I clear the filter, **Then** all domains' entries return.
4. **Given** I am viewing my feed, **When** I switch to a different wallet or network, **Then** I see
   only that scope's feed and none of the previous scope's entries.
5. **Given** a refresh fails (e.g. the network is briefly unreachable), **When** it errors, **Then** my
   existing feed and read states are preserved unchanged and detection resumes on the next successful
   refresh — nothing is fabricated and nothing is wrongly removed.

---

### User Story 5 - New domains plug in without rebuilding the plumbing (Priority: P3)

As the platform team, I want to add a new activity domain by describing only *that domain's* activities
and which of them need action — and have it automatically appear in the unified feed, bell, unread
count, toasts, action-needed indicator, and scope isolation — so onboarding a domain does not mean
re-implementing detection bookkeeping or feed/bell UI each time.

**Why this priority**: This is the extensibility that makes the work "generalizing the platform" rather
than "add DAO notifications once." It is lower priority than the user-visible slices because it is proven
*through* them (the four sources shipped here — wagers, DAO, token administration, membership — all built
on the same source contract), but it is the durable payoff that pays for the refactor and lets future
domains plug in the same way.

**Independent Test**: Without changing any shared feed/bell/toast/engine behavior, register one
additional domain as a source; confirm its activities appear in the unified feed with the same unread,
toast, action-needed, scoping, and accessibility guarantees as existing sources.

**Acceptance Scenarios**:

1. **Given** the generalized system, **When** a new domain is registered as an activity source, **Then**
   its activities appear in the unified feed/bell with unread counts and (where applicable) action-needed
   signals, **without** changes to the shared feed UI or detection engine.
2. **Given** a registered source temporarily fails to produce data, **When** other sources succeed,
   **Then** the feed still shows the other sources' activity and the failing source retains its prior
   entries (one source's failure never blanks the whole feed).

---

### Edge Cases

- **No wallet / disconnected**: the bell and feed show nothing and do not error (mirrors today's
  behavior — landing/disconnected states never poll).
- **Scope change mid-refresh**: a refresh in flight when the user switches account/network must not write
  its results into the new scope (no cross-scope contamination).
- **Concurrent refreshes**: overlapping refresh cycles must not double-count, drop, or duplicate entries.
- **A read action lands while a refresh is in flight**: the user's "mark read" must survive the refresh
  (not be overwritten back to unread).
- **One source errors while others succeed**: the feed degrades to the healthy sources; the failing
  source keeps its last-known entries; a single, non-spammy failure indication is acceptable.
- **Duplicate detection**: the same underlying on-chain event must produce at most one feed entry, even
  across repeated refreshes.
- **Feed growth over time**: the feed must remain bounded (old entries pruned) so it does not grow
  without limit or degrade performance.
- **Action-needed that resolves off-app**: if the user acts elsewhere (another device/wallet UI), the
  action-needed state must clear on the next successful refresh rather than persist falsely.
- **Clock/finality honesty**: an activity must not be presented as final/confirmed before the chain says
  so; pending/awaiting states are surfaced truthfully.
- **Accessibility under live updates**: new toasts and feed updates must be announced to assistive tech
  appropriately (polite vs assertive) without trapping focus or overwhelming a screen reader.

## Requirements *(mandatory)*

### Functional Requirements

**Unified, source-driven feed**

- **FR-001**: The system MUST provide a single, durable activity feed (surfaced via the header bell) that
  aggregates entries contributed by multiple independent activity sources.
- **FR-002**: The system MUST allow platform domains to be registered as activity sources that contribute
  entries to the unified feed, such that adding a source does not require changes to the shared feed,
  bell, toast, unread-count, or detection-engine behavior.
- **FR-003**: The system MUST migrate the existing wager activity into the generalized system as one
  source, preserving all current wager notification behavior (entries, unread counts, action-needed,
  toasts, scoping) with **no regression**.
- **FR-004**: The feed MUST present entries from all sources in a single chronological view, each entry
  clearly attributed to its originating domain.
- **FR-005**: Each activity source MUST be able to declare which of its activities are purely
  informational versus "action needed", and MUST be able to provide a human-readable message and a
  severity (informational / success / warning / error) for each entry.
- **FR-006**: Each entry SHOULD be able to carry a target/deep-link so the user can navigate from the
  feed to the relevant place in the app (e.g. the specific wager or DAO proposal).

**Liveness, persistence, and toasts**

- **FR-007**: The feed and its unread count MUST persist across in-app navigation and across sessions for
  the active scope (durable, not transient).
- **FR-008**: When new activity is detected while the app is open, the system MUST raise a transient
  toast for it and update the bell's unread count, for any registered source.
- **FR-009**: On the first refresh after the user returns (catch-up), the system MUST populate the feed
  without producing a storm of toasts: it MUST cap the number of toasts shown per detection cycle and
  summarize the remainder, while still recording **all** detected activities in the durable feed.
- **FR-010**: No detected activity may be silently lost: every detected change MUST be recorded in the
  durable feed even when it is not shown as a toast.
- **FR-024**: While the app is open, the system MUST detect new activity near-real-time — on the order of
  every 30 seconds while the tab is visible — pausing detection when the tab is hidden and refreshing
  immediately when it becomes visible again (consistent with the existing wager watcher). New activity
  MUST appear in the feed within roughly one detection cycle of becoming true on-chain.

**Action-needed**

- **FR-011**: The system MUST expose an "action needed" signal (and a count) derived from sources'
  action-needed activities, distinct from the unread count.
- **FR-012**: Action-needed state MUST clear automatically on the next successful refresh once the
  underlying condition is resolved (including when resolved outside the app), without manual editing.

**Read-state management & filtering**

- **FR-013**: Users MUST be able to mark an individual entry read, and mark all entries read; the unread
  count MUST update accordingly.
- **FR-014**: A user's read action MUST survive a concurrent refresh (a "mark read" must not be reverted
  by an in-flight detection cycle).
- **FR-025**: Users MUST be able to filter the feed by domain (e.g. show only DAO activity), and clear the
  filter to return to the full cross-domain feed. Filtering is a view concern only — it MUST NOT alter the
  underlying entries, unread count, or action-needed state.

**Scope isolation & honest state**

- **FR-015**: All feed data, unread counts, and action-needed state MUST be scoped to the active
  (account, network) pair and MUST NOT leak across accounts or networks.
- **FR-016**: On a scope change (account or network), the system MUST switch to that scope's own feed
  atomically, with no carryover from the previous scope, and MUST NOT write an in-flight refresh's
  results into the wrong scope.
- **FR-017**: On a refresh failure, the system MUST retain the prior feed, unread, and action-needed
  state unchanged (no fabricated entries, no wrongful removals) and resume detection on the next
  successful cycle; at most one non-spammy failure indication per failure episode.
- **FR-018**: The same underlying on-chain event MUST yield at most one feed entry across repeated
  refreshes (idempotent detection / de-duplication).
- **FR-019**: The system MUST NOT present an activity as final/confirmed before the chain has reached that
  state; pending/awaiting states are surfaced truthfully.

**Resilience & bounds**

- **FR-020**: One source's failure MUST NOT blank or break the feed for other sources; healthy sources
  continue to display and the failing source retains its last-known entries.
- **FR-021**: The feed MUST be bounded in size per scope (old entries pruned) so it does not grow without
  limit.

**Platform constraints**

- **FR-022**: The system MUST derive all activity from on-chain / client-side / edge sources only — it
  MUST NOT introduce an application backend or server-side service.
- **FR-023**: The feed, bell, toasts, and live updates MUST meet WCAG 2.1 AA, including appropriate
  assistive-technology announcements for live changes (polite vs assertive) without focus traps.

**Initial activity sources (catalog shipped in this spec)**

- **FR-026 — Wagers source**: The system MUST surface, via the generalized feed, all wager activities the
  user receives today (per spec 012) — including the existing action-needed conditions (e.g. a wager
  awaiting the user's acceptance, a payout claimable, a refund available, a draw proposed, a deadline
  approaching) — with no change to which events fire or their wording.
- **FR-027 — ClearPath DAO governance source**: For each DAO the user tracks on the active network, the
  system MUST surface these events: a proposal whose **voting is open and the user can still cast a vote**
  (action-needed); a proposal **ready to queue** (action-needed); a proposal **ready to execute**
  (action-needed); and a proposal that has **finalized — executed, defeated, or expired** (informational).
- **FR-028 — Token administration source**: For tokens the user administers or holds on the active network,
  the system MUST surface token-administration activities relevant to that user — at minimum a **role
  granted to or revoked from the user**, and a **token-wide state change affecting them (e.g. pause /
  unpause)** — as informational entries. The precise, on-chain-readable event set is finalized in
  `/speckit-plan` against what spec 028 exposes; any event not reliably readable without a backend is
  documented and omitted rather than faked.
- **FR-029 — Membership source**: For the user's membership on the active network, the system MUST surface
  **membership expiring soon** (action-needed: renew) and a **redeemable voucher** (action-needed: redeem),
  plus informational **membership granted / upgraded / expired** entries. The precise event set and the
  "expiring soon" threshold are finalized in `/speckit-plan` against what specs 026/027 expose.
- **FR-030**: Each source above MUST honor all general requirements (FR-005/006 entry shape, FR-011/012
  action-needed lifecycle, FR-015–019 scope isolation & honest state, FR-024 freshness) — a source adds a
  domain's *catalog*, not a parallel feed.

### Key Entities *(include if feature involves data)*

- **Activity Source**: a registered provider for one platform domain (e.g. wagers, DAO governance, token
  administration, membership). Describes how its domain's activities are detected for the active scope and
  which of them require user action. Sources are interchangeable and additive — the feed has no built-in
  knowledge of any specific domain.
- **Activity Entry**: one recorded item in the feed. Attributes: originating domain, activity type,
  human-readable message, severity (info/success/warning/error), timestamp, read/unread state, optional
  action-needed flag, optional navigation target/deep-link, and the scope it belongs to.
- **Activity Feed**: the per-scope, time-ordered collection of entries, with a derived unread count and a
  derived action-needed count.
- **Scope**: the (account, network) pair that isolates one user/network's feed from all others.
- **Notification (toast)**: the transient surfacing of a fresh activity while the app is open; best-effort
  and bounded per cycle, with the durable feed as the authoritative record.
- **Action-Needed Indicator**: the derived, cross-domain signal (and count) of entries that require the
  user to take an action.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member with activity in more than one domain sees **all** of those domains' activity in a
  single feed behind the bell, with a correct unread count, on the active account/network.
- **SC-002**: Cross-domain awareness survives navigation and sessions: after navigating away and
  returning (and after a session reload), 100% of previously shown entries and the unread count are still
  present for that scope.
- **SC-003**: Zero wager-notification regressions — every behavior of the prior wager notification
  experience (entries, unread, action-needed, toasts, scoping) is preserved.
- **SC-004**: Onboarding a domain requires implementing **only** that domain's source description, with
  **no** edits to the shared feed/bell/toast/unread/detection components — demonstrated by **all four**
  sources shipped here (wagers, DAO governance, token administration, membership) appearing in the unified
  feed, each built on the same source contract.
- **SC-005**: Zero cross-scope leaks: across a suite of account/network switches, no entry from one scope
  ever appears in another.
- **SC-006**: On a detection failure, zero fabricated entries and zero wrongful removals — the feed is
  byte-for-byte preserved and recovers on the next successful cycle.
- **SC-007**: A returning user with many accumulated changes receives no more than the bounded number of
  toasts per cycle, while 100% of those changes are recorded in the feed.
- **SC-008**: Action-needed items are correctly distinguished from informational items, and an
  action-needed item's signal clears within one refresh cycle after its condition is resolved.
- **SC-009**: The feed, bell, and toasts pass automated accessibility checks (WCAG 2.1 AA) with no new
  violations.
- **SC-010**: No application backend is introduced; all activity is derived on-chain / client-side / at
  the edge.
- **SC-011**: While the app is open and visible, a newly-true on-chain activity appears in the feed within
  roughly one detection cycle (~30 seconds); detection is paused while the tab is hidden and resumes
  immediately on return.
- **SC-012**: Applying a domain filter shows only that domain's entries and clearing it restores the full
  feed, with the underlying entries, unread count, and action-needed state unchanged by filtering.

## Assumptions

- **First-step scope (sources shipped now)** *(clarified 2026-06-24)*: This spec delivers (a) the
  generalized, source-driven feed engine and UI, and (b) **all four current domains** as sources on it —
  **wagers** (migrated, no regression), **ClearPath DAO governance** (FR-027), **token administration**
  (FR-028), and **membership** (FR-029). This is the "first step in generalizing the platform" in the
  sense that it establishes the reusable source contract and proves it across every domain at once; future
  domains plug in the same way. The exact, on-chain-readable event set for the token-administration and
  membership sources is finalized in `/speckit-plan` against what specs 028 and 026/027 expose; any event
  not reliably readable client-side without a backend is documented and omitted rather than faked.
- **Toast surface**: The existing transient toast channel is reused as the live alert surface; this spec
  does not redesign it into a stacked/queued multi-toast UI. The durable feed remains the authoritative
  record; toasts stay best-effort and bounded per cycle (FR-009/FR-010). Whether to add a richer
  multi-toast queue is a separate future decision.
- **Detection mechanism is a planning concern**: *How* activities are detected (periodic polling of
  on-chain reads, log scans, event subscriptions, the existing subgraph where available, etc.) is left to
  `/speckit-plan`. The spec only requires honest, scoped, deduplicated, resilient detection with no
  backend.
- **Liveness cadence** *(clarified 2026-06-24)*: Detection runs near-real-time (~30s) while the tab is
  visible, pauses when hidden, and resumes on return — consistent with the current wager watcher (FR-024).
  The exact interval and any per-source throttling/caching to keep on-chain read load sustainable on
  subgraph-less networks (e.g. across many tracked DAOs) is a planning detail.
- **Retention**: The feed retains a bounded, recent window of entries per scope (old entries pruned),
  consistent with current behavior; exact limits are a planning detail.
- **No contract changes expected**: This is a frontend/client generalization over existing on-chain
  state; it is not anticipated to require new or changed smart contracts. If a source needs on-chain data
  not currently readable, that gap is surfaced in planning.
- **Reuses existing infrastructure**: The header bell, activity feed UI, toast component, notification
  context, and per-scope persistence established for wagers (spec 012) are the baseline that is generalized
  — not replaced wholesale.

## Out of Scope

- A redesigned multi-toast / stacked-toast UI or a notifications "preferences / mute per domain" center
  beyond the per-domain view filter in FR-025 (possible future increment).
- Activity domains beyond the four shipped here; additional domains plug in later via the same source
  contract.
- Cross-device or server-pushed notifications, email/push, or any backend-delivered alerts (violates the
  no-backend constraint).
- Native ClearPath DAOs / futarchy activity (depends on those features, which are deferred — spec 029).

## Dependencies

- The existing wager activity watcher and feed/bell UI (spec 012) — generalized, not replaced; provides
  the wager source.
- The ClearPath external-DAO module (spec 030) — provides the live on-chain DAO state read by the DAO
  governance source (FR-027).
- The token-mint / administration module (spec 028) — provides the on-chain token/role state read by the
  token-administration source (FR-028).
- The membership + voucher modules (specs 026/027) — provide the on-chain membership/voucher state read by
  the membership source (FR-029).
- The app notification (toast) context and per-(account, network) client persistence already in use.
