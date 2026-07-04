# Feature Specification: My Wagers — Tester Feedback Refinements

**Feature Branch**: `claude/my-wagers-refinements-729gjz`

**Created**: 2026-07-04

**Status**: Draft

**Input**: Tester feedback on the My Wagers tab:
- Remove "Expired" and "Disputed" from the status filter dropdown (Expired is not shown; Disputed may not be a valid state)
- Remove the network pill next to a wager — the network name already appears in the subtitle
- Store the decrypt words locally and do not ask the user for them for pools or challenges
- When a wager enters a draw state it should be evident in the card, and the alert needs to come as a notification
- When resolving to a draw, there is no indication that the player has submitted or the counterparty has submitted a draw — show submission state for both parties
- My Wagers needs to auto-update periodically so the user does not need to manually refresh
- Opponent name should be derived from either address book, ENS, or a two-name generator, with click-to-see-address
- Group pools need to move to the Archive tab when they reach a terminal state

## Overview

This feature collects a batch of usability refinements to the **My Wagers** surface,
each raised during tester review. Individually they are small; together they raise the
polish and trustworthiness of the primary place members go to track their money. The
work spans how opponents are identified, how draw resolution is communicated, how often
the list refreshes, how encrypted items are unlocked, and how terminal items are filed
away. Every change is presentation- and client-state-only — no on-chain contract,
escrow, or oracle behavior changes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recognizable opponents with click-to-reveal address (Priority: P1)

A member opening My Wagers wants to know **who** each wager is with at a glance, not
decode a hex address. The opponent should be shown by the friendliest name available,
and the member can tap the name to reveal the full address when they need it.

**Why this priority**: Raw `0x1234…ABCD` addresses are the single biggest readability
problem on the card; a real name (or a memorable generated one) is what makes the list
scannable and builds trust that the member is wagering with the person they intended.

**Independent Test**: Create/participate in wagers with three kinds of counterparty —
one saved in the address book, one with an ENS reverse record, one with neither — and
confirm each renders the expected label and that tapping reveals the full address.

**Acceptance Scenarios**:

1. **Given** the opponent's address is saved in the member's address book, **When** the
   wager card renders, **Then** the saved nickname is shown as the opponent name.
2. **Given** the opponent is not in the address book but has an ENS reverse record,
   **When** the card renders, **Then** the ENS name is shown.
3. **Given** the opponent has neither an address-book entry nor ENS, **When** the card
   renders, **Then** a deterministic two-word generated name derived from the address is
   shown (the same address always yields the same name).
4. **Given** any opponent name is shown, **When** the member taps/clicks the name,
   **Then** the full opponent address is revealed (and can be copied).
5. **Given** the opponent is the connected wallet, **When** the card renders, **Then**
   it continues to show "You" rather than a derived name.

---

### User Story 2 - Clear draw state and both-party submission status (Priority: P1)

When a wager is heading toward or resolved as a draw, the member must be able to see
the draw status directly on the card, see whether **each** party has submitted their
draw choice, and receive a notification when a draw needs their attention.

**Why this priority**: Draw resolution requires both parties to independently submit;
today the member cannot tell whether their own submission registered or whether they
are waiting on the counterparty, which causes duplicate attempts and confusion about
whether funds will be returned.

**Independent Test**: Drive a wager through a draw proposal from each side and confirm
the card reflects "proposed by you / awaiting counterparty" and the inverse, that a
notification fires when the counterparty proposes, and that the card shows a settled
"Draw" state once both have submitted.

**Acceptance Scenarios**:

1. **Given** a wager has entered a draw-proposed state, **When** the member views the
   card, **Then** the draw state is visually evident (distinct status treatment), not
   only inferable from an action button.
2. **Given** the member has submitted a draw but the counterparty has not, **When** the
   card renders, **Then** it indicates the member's submission is recorded and the
   counterparty's is still pending.
3. **Given** the counterparty has submitted a draw but the member has not, **When** the
   card renders, **Then** it indicates the counterparty proposed and prompts the member
   to respond.
4. **Given** the counterparty proposes a draw, **When** the proposal is detected, **Then**
   the member receives a platform notification about the pending draw.
5. **Given** both parties have submitted a draw, **When** the wager settles, **Then** the
   card shows a terminal "Draw" state and both stakes are reflected as returned.

---

### User Story 3 - No repeated decrypt-word prompts for challenges and pools (Priority: P1)

A member who has already unlocked an open challenge or a pool should not be asked for
its decrypt words again on subsequent visits; the words are remembered locally and
applied automatically.

**Why this priority**: Re-entering four-word claim codes every session is high-friction
and error-prone, and it undermines the perception that My Wagers "just knows" the
member's own items.

**Independent Test**: Unlock an open-challenge wager once, close and reopen My Wagers,
and confirm the details are available without a second prompt; repeat for a pool the
member belongs to.

**Acceptance Scenarios**:

1. **Given** a member has previously supplied the decrypt words for an open challenge,
   **When** they return to My Wagers, **Then** the challenge details are unlocked
   automatically without prompting for the words again.
2. **Given** a member belongs to a pool, **When** they view it in My Wagers, **Then**
   they are not prompted for decrypt words to see their own pool.
3. **Given** stored decrypt words exist for an item, **When** they are persisted at
   rest, **Then** they are stored encrypted and scoped to the member's own wallet, never
   in plaintext and never shared across wallets.
4. **Given** no stored words exist for an item yet (first encounter), **When** the member
   opens it, **Then** they are prompted once, and the words are remembered for next time.

---

### User Story 4 - Always-current list without manual refresh (Priority: P2)

While My Wagers is open, all of its content — individual wagers **and** group pools —
updates on its own so the member never has to manually refresh to see new state.

**Why this priority**: Stale data on a money screen erodes trust; members should see an
accepted wager, a new draw, or a resolved pool appear without hunting for a refresh
control.

**Independent Test**: Open My Wagers, trigger a state change (acceptance, resolution,
draw) from another actor, and confirm the change appears within the refresh interval
with no manual action.

**Acceptance Scenarios**:

1. **Given** My Wagers is open, **When** a wager's state changes on-chain, **Then** the
   card reflects the new state within the auto-update interval without a manual refresh.
2. **Given** My Wagers is open, **When** a group pool's state changes, **Then** the pool
   entry reflects it within the auto-update interval.
3. **Given** My Wagers is closed, **When** it is not visible, **Then** background polling
   stops so no unnecessary work runs.

---

### User Story 5 - Terminal group pools filed under the archive tab (Priority: P2)

Group pools that have reached a terminal state (resolved or cancelled) move out of the
active pool listing and into the archive/history tab, alongside terminal wagers.

**Why this priority**: Finished pools clutter the active area and make it harder to focus
on live commitments; they belong with the member's other settled items.

**Independent Test**: Take a pool to a terminal state and confirm it no longer appears in
the active pool section and instead appears in the archive/history tab.

**Acceptance Scenarios**:

1. **Given** a pool is active (not terminal), **When** the member views My Wagers,
   **Then** the pool appears in the active pool listing.
2. **Given** a pool has reached a terminal state, **When** the member views the active
   listing, **Then** the pool no longer appears there.
3. **Given** a pool has reached a terminal state, **When** the member opens the
   archive/history tab, **Then** the pool appears there.

---

### User Story 6 - Accurate status filter options (Priority: P3)

The status filter dropdown lists only statuses that are real and reachable in My Wagers,
so members are not offered filters that return nothing or refer to states the system
does not use.

**Why this priority**: Offering "Expired" (which is hidden from the default view) and
"Disputed" (which may not be a valid state) produces empty or misleading results and
makes the filter feel broken.

**Independent Test**: Open the status filter and confirm "Expired" and "Disputed" are
absent while the remaining valid statuses still filter correctly.

**Acceptance Scenarios**:

1. **Given** the status filter is open, **When** the member views the options, **Then**
   "Expired" is not offered.
2. **Given** the status filter is open, **When** the member views the options, **Then**
   "Disputed" is not offered.
3. **Given** the remaining status options, **When** the member selects one, **Then** the
   list filters correctly to wagers in that status.

---

### User Story 7 - No redundant network pill (Priority: P3)

The network badge shown next to the My Wagers title is removed because the network name
is already stated in the subtitle, freeing space and reducing duplication.

**Why this priority**: Showing the network name twice in the same header is redundant and
crowds the title area on small screens.

**Independent Test**: Open My Wagers and confirm the network name appears only once (in
the subtitle) and the separate pill/badge is gone.

**Acceptance Scenarios**:

1. **Given** My Wagers is open, **When** the header renders, **Then** the standalone
   network pill/badge is no longer shown.
2. **Given** My Wagers is open, **When** the member reads the subtitle, **Then** the
   active network name is still stated there.

---

### Edge Cases

- **Name resolution conflicts / staleness**: If an address-book nickname and an ENS name
  both exist, the address book wins (member's own labeling is authoritative). If an ENS
  lookup is slow or fails, the card falls back to the generated two-word name rather than
  showing a raw address or a spinner indefinitely.
- **ENS availability**: ENS reverse resolution is only meaningful on networks that support
  it; on networks without ENS the resolution chain skips straight to the generated name.
- **Draw disagreement**: If one party proposes a draw and the other resolves to a winner
  instead, the card must not imply the draw is settled; it reflects the actual on-chain
  outcome.
- **Decrypt-word vault portability**: Stored words are per-wallet and local; on a new
  device the member is prompted once again (the vault does not sync unless a separate
  backup/restore is used).
- **Filter + hidden statuses**: Removing "Expired" from the dropdown must not resurface
  expired wagers in the default "all" view; expired items remain hidden as they are today.
- **Pool relocation timing**: A pool that becomes terminal while My Wagers is open should
  move to the archive tab on the next auto-update, not require a reopen.

## Requirements *(mandatory)*

### Functional Requirements

**Opponent identity**

- **FR-001**: My Wagers MUST display the opponent by name using this resolution priority:
  (1) address-book nickname for the opponent's address, else (2) ENS reverse-resolved
  name where supported, else (3) a deterministic two-word name derived from the address.
- **FR-002**: The generated two-word name MUST be deterministic — the same address always
  produces the same name — so members can recognize repeat opponents.
- **FR-003**: The opponent name MUST be interactive: activating it reveals the full
  opponent address and allows copying it.
- **FR-004**: When the opponent is the connected wallet, the card MUST continue to show
  "You" (or equivalent self label) rather than a derived name.

**Draw clarity**

- **FR-005**: A wager in a draw-proposed or draw-settled state MUST present a visually
  distinct draw status on the card, discoverable without relying on an action button.
- **FR-006**: The card MUST indicate, for a pending draw, which party has already
  submitted their draw choice and which party is still pending.
- **FR-007**: When a counterparty proposes a draw, the system MUST raise a platform
  notification informing the member that a draw awaits their response.
- **FR-008**: Once both parties have submitted a draw, the card MUST reflect the terminal
  "Draw" outcome with both stakes shown as returned.

**Frictionless decryption**

- **FR-009**: Decrypt words / claim codes that a member supplies for an open challenge or
  a pool MUST be persisted locally so the member is not prompted for them again.
- **FR-010**: Persisted decrypt words MUST be stored encrypted at rest and scoped to the
  member's own wallet; they MUST NOT be stored in plaintext or be usable by another
  wallet.
- **FR-011**: When persisted decrypt words exist for an item, My Wagers MUST unlock that
  item automatically without prompting; the prompt appears only on first encounter (or
  when no valid stored words exist).

**Auto-update**

- **FR-012**: While My Wagers is open, its wager list MUST refresh automatically on a
  periodic interval without requiring a manual refresh action.
- **FR-013**: The periodic auto-update MUST also cover group pools shown in My Wagers, not
  only individual wagers.
- **FR-014**: Auto-update polling MUST stop when My Wagers is not open to avoid
  unnecessary work.

**Pool archiving**

- **FR-015**: Group pools that have reached a terminal state MUST be removed from the
  active pool listing.
- **FR-016**: Terminal group pools MUST appear in the archive/history tab alongside
  terminal wagers.

**Status filter**

- **FR-017**: The status filter dropdown MUST NOT offer "Expired".
- **FR-018**: The status filter dropdown MUST NOT offer "Disputed".
- **FR-019**: Removing these options MUST NOT change the behavior of the remaining status
  filters or resurface expired wagers in the default view.

**Header network badge**

- **FR-020**: The standalone network pill/badge in the My Wagers header MUST be removed.
- **FR-021**: The active network name MUST still be communicated to the member via the
  header subtitle.

### Key Entities

- **Opponent Identity**: The resolved display representation of a counterparty address —
  its source (address book / ENS / generated), the display name, and the underlying full
  address revealed on demand.
- **Draw Resolution State**: The per-wager view of a draw — which party has proposed/
  submitted, which party is pending, and whether the draw has settled.
- **Decrypt-Word Vault Entry**: A locally stored, wallet-scoped, encrypted record of the
  decrypt words / claim code for a specific challenge or pool the member has unlocked.
- **My Wagers Bucket**: The categorization that places each wager or pool into an active
  tab or the archive/history tab, based on whether it has reached a terminal state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In My Wagers, 100% of opponent references show a name (address-book, ENS, or
  generated) rather than a bare hex address, and the full address is retrievable in one
  interaction.
- **SC-002**: For any wager in a draw flow, a member can determine from the card alone —
  without external tools — whether their own draw submission is recorded and whether the
  counterparty's is pending.
- **SC-003**: A member who has unlocked a challenge or pool once is not prompted for its
  decrypt words on any subsequent visit within the same wallet on the same device.
- **SC-004**: State changes to wagers and pools become visible in an open My Wagers view
  within one auto-update interval, with zero manual refresh actions required.
- **SC-005**: 100% of pools in a terminal state appear only in the archive/history tab and
  not in the active pool listing.
- **SC-006**: The status filter offers only statuses that can return results; selecting any
  offered status never yields a "this status is never shown here" empty result caused by
  Expired/Disputed.
- **SC-007**: The active network name appears exactly once in the My Wagers header.
- **SC-008**: When a counterparty proposes a draw, the member receives a notification about
  it without having My Wagers open.

## Assumptions

- **Terminology**: The tester's "Archive tab" refers to the existing terminal-state tab in
  My Wagers (currently labeled "History"). This feature files terminal pools into that same
  tab; renaming the tab is out of scope unless separately requested.
- **Network pill location**: The "network pill next to my wager" refers to the network
  badge in the My Wagers modal header (adjacent to the title), which duplicates the network
  name already present in the header subtitle. No per-card network badge exists today, so
  none is added.
- **Reuse of existing infrastructure**: The address book, ENS resolution, and a two-word
  name generator already exist in the app; this feature wires them into the wager card's
  opponent display rather than building new naming systems. The generated opponent name is
  derived deterministically from the opponent's address.
- **Decrypt-word storage**: Open-challenge claim codes already have a local, wallet-scoped,
  encrypted vault; this feature extends automatic use of that vault (and equivalent local
  storage for pools) so the member is not re-prompted. Pools authenticate via their own
  membership mechanism; where a pool has no passphrase-style secret, "not prompting" simply
  means the member's own pools are visible without any words request.
- **Auto-update baseline**: My Wagers already polls periodically while open; this feature
  ensures that behavior is reliable and extends its coverage to pools, rather than
  introducing polling from scratch.
- **Draw resolution semantics**: The two-party, two-signature draw flow (each party submits
  a draw and both stakes are returned when both agree) is unchanged; this feature only makes
  its state and submission progress visible and notified.
- **Notifications**: The platform notification/activity system is the delivery channel for
  the draw alert; draw proposals are already detectable from indexed on-chain data.
- **Scope**: All changes are frontend presentation and local client state only — no smart
  contract, escrow, oracle, or subgraph schema changes. Network-scoped data isolation is
  preserved (items remain scoped to the active network).
- **Accessibility**: New/changed UI (opponent name reveal, draw status, filter) meets the
  same WCAG 2.1 AA bar the rest of the frontend is held to.
