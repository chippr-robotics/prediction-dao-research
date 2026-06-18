# Feature Specification: My Wagers — Card Grid Redesign

**Feature Branch**: `claude/my-wagers-grid-redesign-kucfye`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "Redesign the My Wagers grid to match the Wager Grid Claude Design mockup: replace the current table-based list with a responsive, expandable card grid. Each wager renders as a card showing the stake amount prominently, the wager title, a colored status pill, and a chevron; clicking a card expands it in place (accordion) to reveal terms, a 2-column metadata grid (opponent/outcome, ends/settled, wager ID, creator), an inline decrypt affordance for encrypted wagers, and contextual action buttons (Accept/Decline, Settle/Resolve, Cancel, Claim, Refund, Respond to Draw). Include the sticky header with title + network pill + subtitle + close, pill-style tabs with count badges, a toolbar with a compact/comfortable density toggle, sort control, and refresh, status pills, empty states, and a confirmation toast. Preserve all existing My Wagers behavior, tabs, statuses, real token symbols, encryption/decryption flow, and on-chain actions from the current implementation."

> Design reference: the source mockup is checked in at `design/wager-grid.dc.html`
> within this feature directory (extracted from the "Wager Grid" Claude Design
> project). It is reference-only — a static, mock-data prototype — and is not
> wired to live data or on-chain calls.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse my wagers as scannable cards (Priority: P1)

As a FairWins user, when I open "My Wagers" I see my wagers laid out as a
responsive grid of cards instead of a dense table. Each card leads with the
stake amount so I can size up a wager at a glance, with the wager title, a
color-coded status pill, and (in history) the win/loss/draw outcome. The grid
reflows from multiple columns on a wide screen down to a single column on a
phone.

**Why this priority**: This is the core of the redesign — the visual shift from
table rows to cards. It delivers the new look-and-feel even before expansion and
actions are layered on, and every other story builds on it.

**Independent Test**: With wagers present in each tab, the list renders as cards
showing stake, title, and status pill; resizing the viewport reflows the column
count; an account with no wagers in a tab shows that tab's empty state. Fully
testable without expanding a card or taking any on-chain action.

**Acceptance Scenarios**:

1. **Given** I have wagers in the active tab, **When** the list loads, **Then**
   each wager appears as a card showing its stake amount, token symbol, title,
   and a status pill colored to its status.
2. **Given** I am on a wide desktop viewport, **When** I view a tab with several
   wagers, **Then** cards lay out in multiple columns; **When** I narrow the
   viewport to phone width, **Then** the cards collapse to a single column.
3. **Given** the active tab has no wagers, **When** the panel renders, **Then** I
   see a tab-appropriate empty state with an icon, title, and supporting line.
4. **Given** I am on the History tab, **When** a resolved wager renders, **Then**
   its card shows the outcome (Won/Lost/Draw) with a color that matches the
   result.

---

### User Story 2 - Expand a card to see details and decrypt (Priority: P1)

As a user, I can click a wager card to expand it in place (accordion style) and
see the full details — the wager terms and a metadata grid (opponent/outcome,
ends/settled date, wager ID, creator) — without leaving the list. If the wager
is encrypted and not yet decrypted, the expanded card offers an inline "Decrypt
Wager Details" affordance; once I decrypt, the terms and metadata reveal in the
same card.

**Why this priority**: Inline expansion replaces the separate full-page detail
view as the primary way to inspect a wager, and the decrypt step gates whether a
user can even read what they are agreeing to. Without it the cards are not
actionable.

**Independent Test**: Click a card and confirm it expands showing terms +
metadata and a rotated chevron; click again (or another card) and confirm
collapse behavior; for an encrypted wager, confirm the decrypt affordance shows,
and after decrypting the terms appear in place.

**Acceptance Scenarios**:

1. **Given** a collapsed card, **When** I click it, **Then** it expands to reveal
   the metadata grid and (if available) the terms, and its chevron rotates to
   indicate the open state.
2. **Given** a card is expanded, **When** I open a different card, **Then** the
   first card collapses so at most one card is expanded at a time.
3. **Given** an encrypted wager I have not decrypted, **When** I expand its card,
   **Then** I see a message that the terms are encrypted and a "Decrypt Wager
   Details" control instead of the terms.
4. **Given** I trigger decrypt on an encrypted card, **When** decryption
   succeeds, **Then** the terms and any newly readable metadata appear in the same
   card without a full page change; **When** decryption fails, **Then** I see a
   clear error and the card stays in its undecrypted state.

---

### User Story 3 - Take the right action from a card (Priority: P1)

As a user, an expanded card surfaces only the actions valid for that wager in its
current state and for my role — Accept/Decline an incoming offer, Settle/Resolve
an active wager, Cancel or Reclaim an offer I created, Claim winnings on a
resolved wager I won, Claim a Refund on a refundable wager, or Respond to a
proposed draw. Taking an action runs the existing on-chain flow and the list
reflects the result; a brief confirmation toast acknowledges the outcome.

**Why this priority**: The actions are the point of My Wagers — accepting,
resolving, claiming, and refunding move real funds. The redesign must carry every
existing action forward; dropping any would be a functional regression.

**Independent Test**: For each role/status combination, expand the card and
confirm exactly the expected action buttons appear (and none that are invalid);
invoke an action and confirm the existing flow runs and the list/state updates.

**Acceptance Scenarios**:

1. **Given** an incoming pending offer addressed to me, **When** I expand its
   card, **Then** I see Accept and Decline actions and no Resolve/Claim actions.
2. **Given** an active wager I am authorized to resolve, **When** I expand its
   card, **Then** I see a Settle/Resolve action that opens the existing
   resolution flow.
3. **Given** a resolved wager I won whose payout I have not claimed, **When** I
   expand its card, **Then** I see a Claim action that runs the existing payout
   claim and, on success, the card no longer offers Claim.
4. **Given** a wager that is refundable or for which a draw was proposed to me,
   **When** I expand its card, **Then** I see the Refund or Respond-to-Draw action
   respectively, matching today's behavior.
5. **Given** I successfully complete any action, **When** the transaction
   confirms, **Then** a confirmation toast briefly appears and the affected wager
   reflects its new state.

---

### User Story 4 - Navigate tabs, filter, sort, and adjust density (Priority: P2)

As a user, I can switch between my wager tabs (Participating, Created,
Arbitrating, History) shown as pill-style tabs with a count badge, filter by
status, sort the list (newest / ending soonest / highest stake), refresh the
data, and toggle the grid between a compact and a comfortable density. The header
keeps the "My Wagers" title, the active-network pill, and a subtitle, and stays
pinned while I scroll the cards.

**Why this priority**: These controls already exist and frame the grid. They are
essential to a usable list but layer on top of the core card/expansion/action
stories, so they sit just below them.

**Independent Test**: Switch tabs and confirm the grid and counts update; change
status filter and sort and confirm the visible cards change accordingly; toggle
density and confirm the cards' spacing/detail changes; scroll and confirm the
header stays pinned.

**Acceptance Scenarios**:

1. **Given** the modal is open, **When** I select a different tab, **Then** the
   grid shows that tab's wagers, the active tab is visually highlighted, and any
   expanded card resets.
2. **Given** wagers of mixed status, **When** I choose a status filter, **Then**
   only matching wagers remain; **When** I change the sort, **Then** the cards
   reorder by the chosen key.
3. **Given** the grid is in compact density, **When** I toggle to comfortable,
   **Then** cards show with the comfortable spacing/preview and the toggle label
   reflects the current mode.
4. **Given** a long list, **When** I scroll, **Then** the header (title, network
   pill, tabs, toolbar) remains visible/pinned.
5. **Given** the Arbitrating tab applies only when I am a neutral arbitrator on
   at least one wager, **When** I have none, **Then** that tab is not shown.

---

### Edge Cases

- **No wallet / wrong network**: When no wallet is connected the panel shows the
  connect-wallet prompt; when on the wrong network, actions prompt a network
  switch before running, exactly as today.
- **Long titles & private bets**: Card titles that overflow are truncated with an
  ellipsis; encrypted/undecrypted wagers show a "Private Bet" style placeholder
  title (with stake) until decrypted.
- **Expired offers**: Expired pending offers surface as Expired and keep the
  "Reclaim & Clear" / dismiss behavior; a "clear all expired" affordance remains
  available where it is today (Expired filter).
- **Network switch (testnet ↔ mainnet)**: Cards remain scoped to the active
  network; wagers from the other network do not appear.
- **Action in flight / failure**: While an action (claim, refund, resolve) is
  pending, its control shows a busy state and is not double-invokable; a failure
  shows a clear, human-readable message on the affected card.
- **Single open card**: Expanding one card collapses any other open card.
- **Density preference**: Toggling density does not lose the user's current tab,
  filter, sort, or which card is expanded.
- **Empty outcome/metadata**: Missing metadata fields (e.g., no opponent on an
  un-accepted offer) render gracefully rather than showing broken placeholders.

## Requirements *(mandatory)*

### Functional Requirements

**Layout & cards**

- **FR-001**: The My Wagers view MUST present each wager as a card in a
  responsive grid that reflows column count with viewport width, replacing the
  current table layout.
- **FR-002**: Each card MUST display, in its collapsed state, the stake amount
  (prominent), the token symbol, the wager title, and a status pill colored per
  the wager's status.
- **FR-003**: History cards MUST display the wager outcome (Won / Lost / Draw /
  other terminal result) with color coding matching the result.
- **FR-004**: Status pills MUST visually distinguish at least these states:
  Pending Acceptance, Active, Pending Resolution, Disputed/Challenged, Resolved,
  Draw, Refunded, Declined/Cancelled, Expired, and Timed Out (the full set the
  current view supports).
- **FR-005**: Card titles that exceed the available width MUST be truncated with
  an ellipsis; encrypted/undecrypted wagers MUST show a privacy-preserving
  placeholder title until decrypted.

**Expansion & detail**

- **FR-006**: Users MUST be able to expand a card in place to reveal its details,
  and collapse it again, with a visual affordance (e.g., rotating chevron)
  indicating open/closed state.
- **FR-007**: At most one card MUST be expanded at a time; expanding a card MUST
  collapse any previously expanded card.
- **FR-008**: An expanded card MUST show a metadata grid covering, at minimum,
  opponent (or outcome in History), ends/settled date, wager ID, and creator, and
  MUST show the wager terms when they are available/readable.
- **FR-009**: For an encrypted wager not yet decrypted, the expanded card MUST
  offer an inline decrypt affordance in place of the terms, and MUST reveal the
  terms/metadata in the same card after a successful decrypt.
- **FR-010**: A failed decrypt MUST leave the card in its undecrypted state and
  communicate the failure without navigating away.

**Actions**

- **FR-011**: An expanded card MUST surface only the actions valid for the
  wager's current status and the viewer's role, drawn from the existing action
  set: Accept, Decline, Settle/Resolve, Cancel, Reclaim & Clear (expired),
  Claim winnings, Claim Refund, and Respond to Draw.
- **FR-012**: Each action MUST invoke the existing underlying behavior (including
  opening the resolution and acceptance flows where applicable) with no change to
  on-chain semantics, authorization rules, or fund movement.
- **FR-013**: Action-needed indicators that exist today (badges derived from the
  activity watcher) MUST continue to inform which wagers need the user's
  attention.
- **FR-014**: While an action is in flight, its control MUST show a busy state and
  prevent duplicate submission; on success the list/card MUST update to reflect
  the new state; on failure a clear message MUST appear on the affected card.
- **FR-015**: A brief, dismissible confirmation toast MUST acknowledge a
  successfully completed action.

**Navigation, filtering, density**

- **FR-016**: The view MUST keep the existing tabs — Participating, Created,
  Arbitrating (shown only when applicable), and History — rendered as pill-style
  tabs, each with a count badge of the wagers it contains.
- **FR-017**: Switching tabs MUST update the grid and counts and reset any
  expanded card.
- **FR-018**: The view MUST retain status filtering and sorting (newest, ending
  soonest, highest stake) and a manual refresh control, all operating on the card
  grid.
- **FR-019**: The view MUST offer a density toggle (compact / comfortable) that
  changes card spacing/preview without losing the current tab, filter, sort, or
  expansion state.
- **FR-020**: The header (title, active-network pill, subtitle, tabs, toolbar)
  MUST remain pinned while the card grid scrolls.

**Preserved behavior & integrity**

- **FR-021**: All existing My Wagers behavior MUST be preserved, including
  wallet-connection and network-switch prompts, network-scoped data, expired-offer
  handling (including clear-all-expired under the Expired filter), and dismissal
  of wagers.
- **FR-022**: Each tab MUST show a tab-appropriate empty state when it contains no
  wagers.
- **FR-023**: The view MUST display real token symbols and real on-chain values;
  it MUST NOT show placeholder/mock data or imply a finality the chain has not
  reached.
- **FR-024**: The redesigned view MUST meet the project's accessibility bar (WCAG
  2.1 AA), including keyboard operability of tabs, card expand/collapse, and
  actions, and appropriate roles/labels for status and controls.

### Key Entities *(include if feature involves data)*

- **Wager (card)**: A single peer wager as shown in My Wagers. Display-relevant
  attributes: stake amount and token symbol, title/terms, computed status,
  outcome (terminal), opponent/counterparty, creator, wager ID, end/settlement
  time, encryption state (locked/decrypted), the viewer's role (participant,
  creator, arbitrator, winner), and which actions are currently valid.
- **Tab / category**: A grouping of the viewer's wagers — Participating, Created,
  Arbitrating, History — each carrying a count and an empty state.
- **Action**: A user-invokable operation on a wager (Accept, Decline,
  Settle/Resolve, Cancel, Reclaim & Clear, Claim, Refund, Respond to Draw),
  conditioned on status and role.
- **View preferences**: Transient UI state — active tab, status filter, sort key,
  density, and which card is expanded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Viewing My Wagers, a user can identify a specific wager's stake and
  status from its card without expanding it, in 100% of cards.
- **SC-002**: The grid renders usable layouts across phone, tablet, and desktop
  widths, with cards reflowing to a single column on phone-width viewports and
  multiple columns on desktop.
- **SC-003**: Every action available in the current table-based My Wagers view is
  reachable from the redesigned cards for the same wager states and roles, with
  zero dropped actions (verified action-by-action).
- **SC-004**: A user can expand a card and read its details (or reach the decrypt
  step for encrypted wagers) in a single interaction, without a full-page
  navigation.
- **SC-005**: After completing an action, the user receives confirmation and sees
  the wager's updated state without manually reloading, in 100% of successful
  actions.
- **SC-006**: The redesigned view passes the project's automated accessibility
  checks (axe/Lighthouse) in CI with no new violations, and all interactive
  elements are keyboard-operable.
- **SC-007**: No regression in network scoping: wagers from a non-active network
  never appear in the grid after a network switch.

## Assumptions

- **Inline expansion replaces the standalone detail view**: The accordion-style
  in-card expansion becomes the primary way to inspect a wager. Heavier flows that
  already open as overlays today (resolution, acceptance) continue to open as
  overlays launched from a card's action; the previous full-panel detail view is
  superseded by inline expansion.
- **Existing tab names are kept**: The mockup labels tabs "Incoming/Outgoing/
  History"; per the request to preserve current behavior, this feature keeps the
  existing labels (Participating, Created, Arbitrating, History). Adopting the
  mockup's wording is out of scope unless separately decided.
- **Real token symbol, not USDC**: The mockup hardcodes "USDC"; the
  implementation uses each wager's real token symbol (e.g., the network default)
  and real values.
- **Accent/theme**: The redesign adopts the mockup's visual language (Inter type
  scale, rounded cards, status pill palette, accent color) adapted to the app's
  existing theme/tokens; exact colors may be mapped to existing design tokens.
- **Density default**: The grid defaults to compact density; the density choice is
  remembered for the duration of the session.
- **Scope is the My Wagers view only**: This feature redesigns the My Wagers
  presentation (the `MyMarketsModal` surface). It does not change wager creation,
  the dashboard, oracle/resolution contract logic, or the data layer feeding the
  list (`useMyWagers` / `WagerRepository`) beyond what is needed to render cards.
- **No contract changes**: This is a frontend presentation change; no Solidity,
  ABI, or subgraph changes are expected.
- **Mockup is reference-only**: `design/wager-grid.dc.html` is a static prototype
  with mock data and a self-contained runtime; it informs visuals and interaction,
  not data wiring.
