# Feature Specification: Quick Action Dashboard Redesign

**Feature Branch**: `claude/quick-action-dashboard-design-2b6o7m`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "the quick action dashboard needs better creative design. the buttons do different things — 3 do wagers, one shows wagers, and 2 do qr activities. create a more visually interesting dashboard. use /speckit-specify to make a coherent experience."

## Clarifications

### Session 2026-06-14

- Q: How many visible, labeled action groups should the dashboard show? → A: Two groups — "Start a wager" (the three creation tiles) and "Track & share" (My Wagers plus the two QR actions); the QR pair stays distinguishable through iconography rather than a separate heading.
- Q: Should each action have its own accent color? → A: No — all quick-action tiles use the single site-green brand accent. Actions are differentiated by icon, role tag, and label, not by color. (Supersedes the earlier per-action color treatment.)

## User Scenarios & Testing *(mandatory)*

The "Your Wagers" dashboard is the connected user's home base. Today it presents
six quick-action tiles in a single uniform grid. The tiles look identical, yet
they trigger three fundamentally different kinds of work:

- **Create a wager** — *Friends Decide (1v1)*, *Oracle Settles (1v1)*, *Bookmaker*
- **Track a wager** — *My Wagers* (also surfaces an "action needed" count)
- **Hand off in person via QR** — *Scan QR Code*, *Share Account*

Because every tile shares the same color, icon weight, and size, a user cannot
tell at a glance which tiles start something new, which one reviews existing
activity, and which ones are for in-person exchange. The redesign makes those
intents legible and the surface more visually engaging without changing what any
button does.

### User Story 1 - Understand the dashboard at a glance (Priority: P1)

A connected user lands on "Your Wagers" and immediately perceives that the
actions fall into distinct groups: the ones that start a new wager, the one that
shows their existing wagers, and the ones for QR-based in-person handoff. Each
action has its own visual identity (color and icon) so it is recognizable
without reading every caption.

**Why this priority**: This is the core of the request — turning a flat,
ambiguous grid into a coherent, scannable experience. It delivers value on its
own even if nothing else changes.

**Independent Test**: Render the connected dashboard and confirm the six actions
are visually organized into intent groups with distinct, labeled treatments, and
that each action remains individually identifiable.

**Acceptance Scenarios**:

1. **Given** a connected wallet, **When** the dashboard renders, **Then** the
   three wager-creation actions are presented together as a clearly primary
   group, visually distinct from the track/QR actions.
2. **Given** a connected wallet, **When** the dashboard renders, **Then** each of
   the six actions shows a distinct color/icon identity rather than the uniform
   single-color treatment used today.
3. **Given** a connected wallet, **When** the user reads only the group labels,
   **Then** they can correctly predict which actions create a wager, which one
   reviews wagers, and which ones use QR.

---

### User Story 2 - Start the right kind of wager quickly (Priority: P1)

A user who wants to create a wager can tell the three creation paths apart —
friends settle, an oracle settles, or they set the odds as a bookmaker — and
launch the correct flow in one tap. The existing labels, descriptions, and the
flow each tile opens are unchanged.

**Why this priority**: Creating wagers is the primary product action; the
grouping must not slow it down or change established behavior.

**Independent Test**: Tap each creation tile and confirm it opens the same flow
it does today (participant-settled, oracle-settled, or bookmaker), with the same
labels and descriptions.

**Acceptance Scenarios**:

1. **Given** the redesigned dashboard, **When** the user taps *Friends Decide
   (1v1)*, **Then** the participant-settled create flow opens, exactly as before.
2. **Given** the redesigned dashboard, **When** the user taps *Oracle Settles
   (1v1)*, **Then** the oracle-settled create flow opens, exactly as before.
3. **Given** the redesigned dashboard, **When** the user taps *Bookmaker*,
   **Then** the bookmaker create flow opens, exactly as before.

---

### User Story 3 - Notice and act on wagers that need attention (Priority: P2)

A user with wagers awaiting their action sees the *My Wagers* tile carry a clear,
legible "needs action" indicator with an accessible count, drawing their eye to
review and resolve outstanding items.

**Why this priority**: The action-needed badge is existing behavior that must
remain prominent and accessible after the visual redesign.

**Independent Test**: With a non-zero action-needed count, confirm the *My
Wagers* tile shows the count visibly and exposes the full "N wager(s) need(s)
action" text to assistive technology.

**Acceptance Scenarios**:

1. **Given** two wagers need action, **When** the dashboard renders, **Then** the
   *My Wagers* tile shows a visible "2" and the accessible name conveys "2 wagers
   need action".
2. **Given** one wager needs action, **When** the dashboard renders, **Then** the
   indicator uses the singular "1 wager needs action".
3. **Given** nothing needs action, **When** the dashboard renders, **Then** no
   action-needed indicator appears on the tile.

---

### User Story 4 - Reach for QR handoff with confidence (Priority: P2)

A user exchanging a wager in person can distinguish *Scan QR Code* (accept a
friend's wager) from *Share Account* (show my address as a QR) — two related but
opposite actions — through grouping and distinct visual cues, and the
screen-reader name for *Share Account* still spells out its QR outcome.

**Why this priority**: The two QR actions are easy to confuse; the redesign
should reduce that confusion while preserving the accessibility wording.

**Independent Test**: Confirm the two QR actions are grouped, visually distinct
from each other, and that *Share Account* keeps its descriptive accessible name.

**Acceptance Scenarios**:

1. **Given** the redesigned dashboard, **When** the user looks at the QR group,
   **Then** *Scan QR Code* and *Share Account* are visually paired yet
   distinguishable (e.g., inbound vs. outbound cue).
2. **Given** a screen reader, **When** focus reaches *Share Account*, **Then** the
   announced name conveys "show your address as a QR code".

---

### Edge Cases

- **Narrow phone screens**: The grouped layout must reflow to a single readable
  column (or comfortably narrow layout) without truncating labels or overlapping
  the action-needed badge.
- **Long descriptions**: The oracle tile's caption changes when all oracle models
  are enabled ("Polymarket, Chainlink or UMA"); the layout must accommodate the
  longer text without breaking the grouping.
- **Disconnected wallet**: The quick-action dashboard only applies to the
  connected state; the disconnected Welcome view is out of scope and unchanged.
- **High-contrast / reduced-motion preferences**: Color is not the only signal
  (labels and icons also differentiate), and any hover/entrance motion respects a
  user's reduced-motion preference.
- **Keyboard-only users**: Every tile remains a focusable control reachable and
  activatable by keyboard, with a visible focus indicator.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST organize the six quick actions into two visibly
  labeled, intent-based groups: "Start a wager" (the three creation actions) and
  "Track & share" (My Wagers plus the two QR actions). Within "Track & share",
  the two QR actions MUST remain individually distinguishable (e.g., inbound vs.
  outbound cue) without requiring a separate group heading.
- **FR-002**: The three wager-creation actions MUST be presented as the primary,
  most visually prominent group.
- **FR-003**: Each quick action MUST be individually recognizable through its
  icon, role tag, and label. All tiles MUST share the single site-green brand
  accent — actions are not differentiated by color.
- **FR-004**: The system MUST preserve the existing action labels exactly:
  "Friends Decide (1v1)", "Oracle Settles (1v1)", "Bookmaker", "My Wagers",
  "Scan QR Code", "Share Account".
- **FR-005**: The system MUST preserve each action's existing description text and
  the click behavior/flow it triggers.
- **FR-006**: The *My Wagers* action MUST display an action-needed indicator with
  a visible count and an accessible "N wager(s) need(s) action" description when
  the count is greater than zero, and MUST show no indicator when the count is
  zero.
- **FR-007**: The *Share Account* action MUST retain an accessible name that
  conveys its QR outcome ("show your address as a QR code").
- **FR-008**: Every quick action MUST remain a keyboard-focusable control with a
  visible focus indicator and an accessible name.
- **FR-009**: The layout MUST be responsive, reflowing gracefully from
  multi-column on wide screens to a comfortably readable layout on phones without
  clipping labels or overlapping the badge.
- **FR-010**: Visual grouping and identity MUST NOT rely on color alone; labels
  and/or icons MUST also distinguish actions and groups for color-blind users.
- **FR-011**: Any decorative motion (hover, entrance) MUST respect the user's
  reduced-motion preference.
- **FR-012**: The redesign MUST NOT alter the surrounding dashboard regions (the
  header, membership CTA banner, Polymarket feed, and "How P2P Wagers Work"
  section) beyond what is needed to accommodate the new quick-action layout.

### Key Entities

- **Quick Action**: A single dashboard tile. Attributes: label, description, icon,
  visual identity (accent), intent group, optional action-needed badge, and the
  flow it launches when activated.
- **Action Group**: A labeled cluster of quick actions sharing an intent —
  "Start a wager" (creation) and "Track & share" (My Wagers plus the two QR
  actions).
- **Action-Needed Indicator**: A count plus accessible description attached to the
  *My Wagers* action, reflecting how many wagers await the user's attention.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user can correctly sort all six actions into their
  three intents (create / track / QR) just by looking, in under 10 seconds.
- **SC-002**: 100% of existing action labels, descriptions, and click-through
  flows behave identically before and after the redesign.
- **SC-003**: The dashboard meets WCAG AA for the quick-action region: all tiles
  are keyboard reachable, every tile has an accessible name, and no action's
  meaning depends on color alone.
- **SC-004**: On a 360px-wide phone viewport, all six tiles render with full
  labels visible, no overlap of the action-needed badge, and no horizontal
  scrolling.
- **SC-005**: The action-needed count on *My Wagers* is both visibly shown and
  announced with correct singular/plural wording in 100% of count states tested
  (0, 1, many).

## Assumptions

- The redesign targets only the connected "Your Wagers" quick-action region; the
  disconnected Welcome view and other dashboard sections are unchanged except as
  needed to fit the new layout (FR-012).
- The set of six actions and the flows they open are fixed; this feature changes
  presentation and grouping, not functionality.
- The existing brand palette and design tokens are the basis for the new per-action
  accent colors, with additional accents chosen to remain legible in both light
  and dark themes.
- Existing automated tests that assert action labels, the create-flow wiring, the
  action-needed badge, and keyboard/aria behavior remain the contract the redesign
  must keep green; selectors used by those tests (the quick-actions grid container
  and individual action cards as buttons with aria-labels) are preserved.
- "Visually interesting" is satisfied by clear grouping, distinct per-action
  identity, primary emphasis on creation, and tasteful affordances (e.g., hover
  and accent cues) — not by adding new actions or data.
