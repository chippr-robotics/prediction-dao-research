# Feature Specification: Wager Activity Notifications

**Feature Branch**: `012-wager-notifications`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "The clearest UX gap in the app is that every state change is invisible until the user manually opens My Wagers. After mapping the full journey (create → share QR/link → accept → resolve → claim), the pattern is consistent: the creator doesn't know their wager was accepted, neither party knows when a wager becomes resolvable, and nobody is told when winnings are claimable or when a dispute/challenge window is closing. For a product built on time-sensitive deadlines (acceptance expiry, resolution windows, dispute periods), users can silently lose money or forfeit claims just by not checking the app. MVP: a client-side wager watcher surfacing changes through existing toasts plus a bell icon with an activity feed, and 'action needed' badges on the My Wagers entry point and individual wager cards."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See What Changed Since My Last Visit (Priority: P1)

A wager participant (creator or acceptor) opens the app after being away. Without
navigating anywhere, a bell icon in the app header shows an unread count. Opening
it reveals an activity feed of everything that happened to their wagers while they
were away — "Your wager 'Lakers win Game 7' was accepted — it's live",
"'ETH above $5k' has resolved — you won! Claim 50 USDC", "Alex proposed
settling your wager as a draw" — newest first. Selecting an entry takes them straight to that wager.

**Why this priority**: This is the core fix for the stated gap. Because the
product has no server component, most state changes happen while the app is
closed; the catch-up feed is the only channel that reliably reaches every user.
Missing a claimable win or a closing deadline is direct financial harm.

**Independent Test**: With a wager in a known state, change its state from
another account while the first user's app is closed (accept it, resolve it,
propose a draw). Reopen the app as the first user and verify the bell shows an
unread count, the feed describes the change accurately, and the entry links to
the wager. Delivers value alone: users no longer need to manually poll My Wagers.

**Acceptance Scenarios**:

1. **Given** a creator with an open wager and the app closed, **When** another
   user accepts the wager and the creator later opens the app, **Then** the bell
   shows an unread indicator and the feed contains an entry stating the wager was
   accepted and is now live.
2. **Given** a participant in a wager that has been resolved in their favor,
   **When** they open the app, **Then** the feed contains an entry stating they
   won and that winnings are claimable, including the amount.
3. **Given** a participant whose counterparty proposed settling the wager as a
   draw while they were away (or, on legacy networks, challenged the wager),
   **When** they open the app, **Then** the feed contains an entry stating the
   proposal and what they can do about it (accept or decline the draw).
4. **Given** an unread feed entry, **When** the user acknowledges it in the
   feed (selects or dismisses it) or views the affected wager's details,
   **Then** the entry is marked read and the unread count decreases
   accordingly; the read state persists across page reloads on the same
   browser. Merely opening the feed does not mark entries read.
5. **Given** a feed entry for a wager, **When** the user selects it, **Then**
   they are taken to that wager's detail view.
6. **Given** the same state change already shown in the feed, **When** the user
   reloads the app, **Then** no duplicate entry appears.

---

### User Story 2 - Know Where Action Is Needed (Priority: P2)

A user glances at the app and immediately sees where they must act: the
My Wagers entry point carries an "action needed" badge, and inside, the specific
wager cards that need attention (claim winnings, resolve an outcome, respond to
a draw proposal) are badged. The badge clears once the action is taken.

**Why this priority**: The feed says what happened; badges say what to do.
Time-sensitive obligations (claims, draw-proposal responses) need a persistent visual
pull that survives dismissing a toast or skimming past a feed entry.

**Independent Test**: Put one of the user's wagers into a state requiring their
action (e.g., resolved in their favor but unclaimed). Verify the My Wagers entry
point and that wager's card are badged, and that completing the action (claiming)
clears both badges. Testable without the feed or toasts existing.

**Acceptance Scenarios**:

1. **Given** a wager resolved in the user's favor with unclaimed winnings,
   **When** the user views the app navigation, **Then** the My Wagers entry point
   shows an action-needed badge.
2. **Given** the badged My Wagers list, **When** the user views it, **Then**
   exactly the wagers requiring their action are badged, and wagers requiring
   nothing from them are not.
3. **Given** a badged wager, **When** the user completes the required action,
   **Then** the badge is removed from the card and, if no other wager needs
   action, from the My Wagers entry point.

---

### User Story 3 - Real-Time Alerts While Using the App (Priority: P3)

While the user has the app open — browsing markets, creating another wager — a
state change to one of their wagers surfaces immediately as a transient
notification ("Your wager was just accepted — it's live"), without requiring a
refresh or a visit to My Wagers.

**Why this priority**: Valuable for active sessions (e.g., right after sharing a
wager link, waiting for the counterparty to accept), but it only helps users who
happen to have the app open. The catch-up feed (P1) covers the common case.

**Independent Test**: With the app open on any screen, change one of the user's
wagers from another account and verify a transient alert appears within a minute,
and the corresponding entry is also added to the activity feed.

**Acceptance Scenarios**:

1. **Given** the app is open on any screen, **When** one of the user's wagers
   changes state, **Then** a transient alert describing the change appears within
   60 seconds of the change being confirmed on-chain.
2. **Given** a transient alert was shown and dismissed (or timed out), **When**
   the user opens the activity feed, **Then** the same change is present as a
   feed entry — nothing is lost by missing the toast.

---

### User Story 4 - Warned Before a Deadline Expires (Priority: P3)

A participant with a pending obligation — a wager nobody has accepted yet, or a
resolution window closing — is warned while
there is still time to act: "Resolution window closes in 24h",
"Your wager expires in 24h if not accepted".

**Why this priority**: Deadline misses are the costliest failure (forfeited
claims, expired wagers), but warnings can only reach users who open the app
before the deadline; the badges and feed already direct attention to these
wagers. This story sharpens urgency rather than creating awareness.

**Independent Test**: Create a wager whose deadline (acceptance expiry or
resolution close) falls within the warning threshold. Open the
app and verify a warning with the remaining time appears in the feed and as a
transient alert. Verify no warning appears for deadlines outside the threshold.

**Acceptance Scenarios**:

1. **Given** a wager of the user's with a deadline inside the warning threshold
   (24 hours), **When** the user opens or is using the app, **Then** a warning
   stating which window is closing and the time remaining is surfaced.
2. **Given** a deadline warning was already shown for a wager's window, **When**
   the user continues using the app, **Then** the same warning is not repeated
   in a way that spams the user (at most one warning per wager per window per
   day).
3. **Given** a deadline has already passed, **When** the user opens the app,
   **Then** they see a factual state-change entry (e.g., "expired — stake
   refundable") rather than a countdown warning.

---

### Edge Cases

- **Wallet switched or disconnected**: Feed, unread counts, and badges must
  reflect only the currently connected account; switching accounts must swap the
  notification state entirely, with no carryover between accounts.
- **Network switched** (Polygon mainnet ↔ Amoy testnet): notifications are
  scoped to the active network and must never mix testnet and mainnet activity.
- **Long absence with many changes**: a user returning after weeks may have many
  state changes across many wagers; the feed must remain usable (newest first,
  bounded length) and must not block app startup.
- **Local notification history cleared or new device**: with no server, read
  state and history are per-browser. After clearing, the system must degrade
  gracefully — wagers currently needing action are still badged (derived from
  live state), even if the historical feed is empty.
- **Duplicate detection**: revisiting the app must not re-announce changes
  already seen; the same on-chain event must never produce two feed entries.
- **Honest finality**: provisional stages must not be announced as won/final;
  messages must state the true stage (e.g., "draw proposed — awaiting your
  response"), and win/claim language appears only once the outcome is final
  on-chain, per the project constitution.
- **Temporary data-source failure**: if on-chain state cannot be read, the
  system shows nothing rather than stale or wrong notifications, and recovers
  on the next successful read without losing changes (they are re-detected).
- **User is both creator and acceptor on many wagers**: messages must be from
  the user's perspective (won/lost, your turn to act), not generic.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect state changes for every wager in which the
  connected account is a participant (creator or acceptor), covering at minimum:
  accepted, became resolvable, provisional settlement proposed by the
  counterparty (a draw proposal; on legacy networks, a challenge — there is no
  separate on-chain "dispute" state), resolved, winnings claimable,
  expired/refundable.
- **FR-002**: System MUST provide a persistent, always-visible entry point (bell
  icon) in the app header that opens an activity feed of these changes, ordered
  newest first.
- **FR-003**: Each feed entry MUST be written from the user's perspective and
  identify the wager, the change, and the consequence or required action (e.g.,
  "You won! Claim 50 USDC"), and MUST link to the affected wager.
- **FR-004**: The bell MUST show the count of unread entries. An entry is
  marked read when the user acknowledges it in the feed (selects or dismisses
  it) or views the affected wager's details — not merely by opening the feed.
  Read/unread state MUST persist across sessions on the same browser.
- **FR-005**: On app open or wallet connect, the system MUST detect changes that
  occurred since the user's last session ("catch-up") and populate the feed with
  them before or shortly after the user can interact with the app, without
  blocking app startup.
- **FR-006**: While the app is open, the system MUST surface newly detected
  changes as transient in-app alerts within 60 seconds of on-chain confirmation,
  in addition to adding them to the feed. When many changes are detected at
  once, alerts MAY be batched into a summary alert; every change still receives
  its own feed entry.
- **FR-007**: The My Wagers entry point and each individual wager card MUST show
  an "action needed" badge when, and only when, the wager requires an action
  from the connected user (e.g., claim winnings, submit resolution, respond to a
  draw proposal); badges MUST clear once the action is completed.
  Respond-to-draw badges are best-effort (see Assumptions); all other action
  kinds are guaranteed from live chain state.
- **FR-008**: The system MUST warn the user about approaching deadlines —
  acceptance expiry and resolution window close (the deadline windows the wager
  contract defines) — when the deadline is within 24 hours, at most once per
  wager per window per day.
- **FR-009**: All notification state (feed, unread counts, badges) MUST be
  scoped to the connected account AND the active network; activity MUST never
  leak across accounts or between testnet and mainnet.
- **FR-010**: The same on-chain state change MUST NOT produce duplicate feed
  entries or repeated alerts across reloads and sessions.
- **FR-011**: Notification copy MUST reflect honest on-chain finality:
  provisional stages (such as a pending draw proposal) are presented as
  provisional, and winnings are described as claimable only when they are
  actually claimable.
- **FR-012**: Action-needed badges MUST be derived from current on-chain state
  (not solely from stored history), so they remain correct after local data is
  cleared or on a new device.
- **FR-013**: The feed MUST remain usable after long absences: entries are
  bounded (oldest pruned beyond a reasonable cap), and a large backlog MUST NOT
  degrade app responsiveness.
- **FR-014**: Transient alerts and feed updates MUST be announced accessibly
  (perceivable by assistive technology) consistent with the project's WCAG 2.1
  AA standard.
- **FR-015**: If wager state cannot currently be read, the system MUST NOT show
  stale or fabricated notifications, and MUST resume detection automatically
  once reads succeed, without losing intervening changes.
- **FR-016**: The notification feed and action-needed badges REPLACE the legacy
  per-tab unread counts in the My Wagers view: those legacy counts MUST be
  removed, so the bell's unread count is the single unread indicator. Viewing a
  wager's details MUST clear that wager's entries from the unread count (per
  FR-004).

### Key Entities

- **Activity entry**: one user-facing record of a wager state change — the wager
  it concerns, the kind of change, when it was detected, the message shown, its
  read/unread state, and a link target. Belongs to exactly one (account,
  network) pair.
- **Watched wager set**: the wagers relevant to the connected account (as
  creator or acceptor) whose states are observed for changes.
- **Last-seen state**: the per-wager state snapshot from the user's previous
  session, used to determine "what changed since last visit" and to prevent
  duplicate announcements.
- **Action-needed status**: a per-wager derived flag — does this wager currently
  require something from this user — driving badges independently of history.
- **Deadline warning record**: tracks which approaching-deadline warnings have
  already been shown for a wager's window, to enforce the anti-spam rule.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user opening the app after one of their wagers changed state
  learns about the change within 10 seconds of the app loading, without
  navigating to My Wagers.
- **SC-002**: With the app open, 95% of wager state changes are surfaced to the
  affected user within 60 seconds of on-chain confirmation.
- **SC-003**: 100% of wagers requiring user action are visibly badged at the My
  Wagers entry point and on the wager card, and 0 wagers requiring no action
  are badged.
- **SC-004**: A user with a deadline inside the warning threshold who opens the
  app finds the warning visible in their activity feed in every such session
  until the deadline passes or the obligation is met; new warning alerts are
  raised at most once per wager per window per day (per FR-008).
- **SC-005**: Zero notifications shown for the wrong account or wrong network
  across account-switch and network-switch test passes.
- **SC-006**: In usability testing, users locate the wager that needs their
  action within 5 seconds of app load, starting from any screen.
- **SC-007**: No state change is ever announced twice: across 100 reload/return
  cycles in testing, duplicate feed entries number zero.

## Assumptions

- **No server component**: per the project's fixed deployment footprint, all
  detection, history, and read-state live client-side in the user's browser.
  Consequently, notifications are delivered only while the app is open or upon
  opening it — push notifications, emails, or any delivery while the app is
  closed are out of scope.
- **Per-browser history**: notification history and read state do not sync
  across devices or browsers. Action-needed badges, being derived from live
  on-chain state, are correct everywhere; only the historical feed and
  read-state are device-local.
- **Deadline warnings are best-effort**: with no server, a warning can only
  reach a user who opens the app while the deadline is still ahead; the 24-hour
  threshold is the default warning window.
- **Existing surfaces are reused**: the app's existing transient-notification
  mechanism and existing unread-tracking pattern (used today for new markets)
  are extended rather than replaced; visual design follows the current app
  style.
- **Participants only**: the watcher covers wagers where the connected account
  is creator or acceptor. Observers, group members, or third-party resolvers
  are out of scope for the MVP.
- **Counterparty naming**: where a display name for the counterparty is not
  available, entries fall back to a shortened wallet address.
- **Draw-proposal awareness is best-effort**: a pending draw proposal is not
  readable from current chain state (it is only observable at the moment it
  happens), so "respond to draw" notifications and badges cover proposals made
  after the user's first session on a given device. All other action indicators
  (accept, resolve, claim, refund) derive fully from live chain state and are
  complete on any device.
- **Notification preferences UI** (muting categories, changing thresholds) is
  out of scope for the MVP; defaults apply to everyone.
