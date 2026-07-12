# Feature Specification: Create-a-Challenge Home Screen

**Feature Branch**: `claude/fairwins-wager-sheet-redesign-xvr24u`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Make the wager-creation experience the app's home screen — a payments-app home (Cash App / Venmo feel) where the first thing a user sees is the create-a-challenge view itself, not a dashboard of buttons. Oracle settlement becomes a network-gated resolution option in that view. Add Accept-a-challenge and My-rewards entry points near it, and move the multi-button quick-action grid into a 'Wagers' app section. Front-end IA/presentation only; wager/take/rewards logic reused."

## Clarifications

### Session 2026-07-12

- Q: What should the home "My Rewards" entry point open? → A: The existing **My Wagers** view (which already lists claimable payouts and has a "Claim Winnings" action) — no new rewards surface.
- Q: Where should the relocated "Wagers" section live? → A: A **dedicated top-level route** (a "Wagers" page) added as an item in the app's existing primary navigation (the nav drawer).
- Q: What does the inline home create view create? → A: **Open challenge only** (self / third-party / oracle resolution). Other create types (1v1, Make-an-Offer, Group Pool) are created from the Wagers section.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app opens straight into "create a challenge" (Priority: P1)

A person opening FairWins lands directly on the create-a-challenge view — the oversized
amount hero and on-screen number pad, the wager memo, and the resolution selector — the
way Cash App opens on its amount keypad. No dashboard of buttons stands between them and
the core action; the product's purpose is obvious on first load, and they can key in a
stake and post a challenge without navigating anywhere first.

**Why this priority**: This is the essence of the feature — leading with the core mechanic
(open challenges) as the home surface. It is the single most important change and the one
that delivers the "payments-app home" value. Everything else arranges around it. Shipping
just this already transforms the landing experience.

**Independent Test**: Load the app as the home destination and confirm the inline
create-a-challenge view (amount hero + number pad + memo + resolution selector) is the
primary content, not a grid of action buttons, and that a challenge can be created from it
end-to-end using the existing create flow.

**Acceptance Scenarios**:

1. **Given** a user opens the app at the home destination, **When** the home screen renders,
   **Then** the create-a-challenge view (amount hero, number pad, memo, resolution selector)
   is the primary content of the screen — rendered inline, not inside a modal or bottom sheet.
2. **Given** the inline home create view, **When** the user enters a stake on the number pad,
   adds a memo, chooses a resolution path, and confirms, **Then** a challenge is created via
   the existing create flow with the same outcome (claim code) as before.
3. **Given** the home create view, **When** it renders, **Then** it reuses the existing
   payments-style layout (amount keypad, memo, resolution pills with their icons) and the
   compacted, non-scrolling arrangement — consistent with the create sheets it replaces.
4. **Given** a user who is not connected or lacks the required membership, **When** they open
   the home create view, **Then** the view still renders and the create action is gated with
   the same connect/membership prompts as today (no new gating behavior).

---

### User Story 2 - Choose how it's resolved, including oracle, from the home view (Priority: P1)

From the home create view, the user picks how the challenge is resolved: either side submits
the outcome, a named third-party arbitrator decides, or — where available — an oracle
(Polymarket) settles it. The oracle option is presented as a network-gated choice: it is
selectable only where Polymarket settlement is available and is shown clearly locked/greyed
elsewhere. Choosing the oracle option opens a market-search step to pick the market and side;
the standalone "Open Oracle Challenge" modal no longer exists as a separate destination.

**Why this priority**: Consolidating oracle settlement into the one create view (rather than a
separate modal) is required for the home view to be the single, complete entry to creating any
open challenge. Without it, oracle challenges would need a separate surface, defeating the
consolidation. P1 because it's part of making the home create view whole.

**Independent Test**: On the home create view, exercise all three resolution paths; confirm the
oracle option is locked/greyed where Polymarket is unavailable and selectable where it is, that
selecting it opens a market-search step, and that each path creates a challenge with the correct
settlement type via the existing flow.

**Acceptance Scenarios**:

1. **Given** the home create view on a network without Polymarket support, **When** the
   resolution selector renders, **Then** the oracle option is shown locked/greyed and cannot be
   selected, with a reason available.
2. **Given** the home create view on a Polymarket-enabled network, **When** the user selects the
   oracle resolution option, **Then** a market-search step opens; **and When** they pick a market,
   **Then** the view returns to the create view showing the chosen market and a side selection.
3. **Given** each resolution path (self / third-party / oracle), **When** the user completes and
   confirms, **Then** the challenge is created with the corresponding settlement configuration,
   unchanged from today.
4. **Given** the app, **When** a user looks for a separate "Open Oracle Challenge" screen,
   **Then** none exists as a standalone modal — oracle creation happens only within the create view.

---

### User Story 3 - Accept a challenge and view My Rewards from home (Priority: P2)

Near the home create view, the user has clear, primary entry points to the two other things they
most commonly do: **Accept a challenge** (enter the four-word code / phrase to take a challenge)
and **My Rewards** (view their winnings / claimable rewards). These sit alongside the create
action the way secondary actions flank the primary action on a payments home, and route into the
existing take-a-challenge and rewards flows.

**Why this priority**: The home screen should cover the primary loop — create, accept, collect —
not just create. These entries make the home a complete hub. P2 because the home is already
valuable with just the create view (US1/US2); accept + rewards complete it but can follow.

**Independent Test**: From the home screen, activate "Accept a challenge" and confirm it opens the
existing take-a-challenge / phrase-entry flow; activate "My Rewards" and confirm it opens the
user's winnings / rewards view.

**Acceptance Scenarios**:

1. **Given** the home screen, **When** it renders, **Then** an "Accept a challenge" entry point and
   a "My Rewards" entry point are visible near the create view as primary/secondary actions.
2. **Given** the home screen, **When** the user activates "Accept a challenge", **Then** the existing
   phrase-entry / take-a-challenge flow opens (unchanged behavior).
3. **Given** the home screen, **When** the user activates "My Rewards", **Then** the user's winnings /
   rewards view opens (reusing the existing rewards/claim surface).

---

### User Story 4 - All wager types stay accessible from a "Wagers" section (Priority: P2)

The full set of create types and actions that used to crowd the home grid — 1v1 friends-decide,
1v1 oracle, make an offer, open challenge, group pool, plus enter phrase, my wagers, scan QR, and
share account — moves into an app section/destination labeled **Wagers**. Nothing is removed; the
home screen is decluttered while every wager type and action remains reachable in one place.

**Why this priority**: Relocating (not deleting) the grid is what lets the home lead with the core
create view without losing breadth. P2 because it depends on the home restructure (US1) but is
essential to "everything still accessible."

**Independent Test**: Navigate to the "Wagers" section and confirm every create type and action
previously on the home grid is present and launches its existing flow; confirm the home screen no
longer shows that multi-button grid.

**Acceptance Scenarios**:

1. **Given** the app, **When** the user navigates to the "Wagers" section, **Then** all previously
   home-grid create types (1v1 friends-decide, 1v1 oracle, make an offer, open challenge, group
   pool) and actions (enter phrase, my wagers, scan QR, share account) are present and launch their
   existing flows.
2. **Given** the home screen, **When** it renders, **Then** the multi-button quick-action grid is no
   longer part of it (it lives in the Wagers section instead).
3. **Given** the Wagers section, **When** the user launches any item, **Then** its behavior is
   unchanged from when it lived on the home grid.

---

### Edge Cases

- **Disconnected / no membership**: The home create view renders for everyone; creating is gated
  with the existing connect/membership prompts (no new blocking screen replaces the home view).
- **Oracle unavailable mid-session** (network switch): the oracle resolution option's locked/greyed
  state updates to reflect the current network; a challenge in progress on the oracle path handles a
  loss of availability gracefully (surface, don't silently drop).
- **Backing out of the oracle market-search step**: returning without picking a market leaves the
  create view in a coherent state (reverts to a non-oracle resolution or prompts to pick a market),
  never a stranded oracle selection with no market.
- **Amount zero / invalid**: the create action stays disabled in the zero state, same as the current
  payments-style entry.
- **Deep links** (e.g. a take-a-challenge code link): continue to route to the correct flow even
  though the home surface changed.
- **Small screens**: the home create view remains non-scrolling and legible at the smallest supported
  viewport, consistent with the compacted create layout.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The home destination MUST render the **open-challenge** create view inline (not in a
  modal or bottom sheet) as its primary content: the amount hero, on-screen number pad, wager memo,
  and resolution selector. Other create types (1v1, Make-an-Offer, Group Pool) are NOT inlined on
  home — they are created from the Wagers section (FR-010).
- **FR-002**: The home create view MUST reuse the existing payments-style components and layout — the
  amount keypad, memo field, and resolution pills with their icons — and the compacted, non-scrolling
  arrangement, with no new visual system.
- **FR-003**: A user MUST be able to create an open challenge entirely from the home view, producing
  the same outcome (claim code and escrow behavior) as the current create flow.
- **FR-004**: The resolution selector on the home view MUST offer self-resolution (either side
  submits), third-party arbitrator, and oracle (Polymarket) settlement.
- **FR-005**: The oracle resolution option MUST be selectable only where Polymarket settlement is
  available on the active network, and MUST be shown clearly locked/greyed (with a reason) where it
  is not.
- **FR-006**: Selecting the oracle resolution option MUST open a market-search step to choose a market
  and side, and return to the create view once a market is chosen.
- **FR-007**: The standalone "Open Oracle Challenge" modal MUST be retired; oracle challenge creation
  MUST happen only within the consolidated create view.
- **FR-008**: The home screen MUST present primary entry points for "Accept a challenge" (four-word
  phrase / code entry to take a challenge) and "My Rewards" (winnings / rewards), positioned near the
  create view.
- **FR-009**: The "Accept a challenge" entry MUST open the existing take-a-challenge / phrase-entry
  flow, and "My Rewards" MUST open the existing **My Wagers** view (which already lists claimable
  payouts and provides the "Claim Winnings" action) — both with unchanged underlying behavior. No new
  rewards/winnings surface is introduced.
- **FR-010**: The full set of create types and actions previously on the home quick-action grid (1v1
  friends-decide, 1v1 oracle, make an offer, open challenge, group pool, enter phrase, my wagers, scan
  QR, share account) MUST be accessible from a **dedicated top-level "Wagers" route/page**, reachable
  from an item added to the app's existing primary navigation (the nav drawer).
- **FR-011**: The multi-button quick-action grid MUST no longer appear on the home screen; it MUST live
  in the "Wagers" section instead.
- **FR-012**: Every item relocated to the "Wagers" section MUST launch the same flow with the same
  behavior it had on the home grid (no capability lost in the move).
- **FR-013**: The home create view MUST render for users who are not connected or lack the required
  membership, gating only the create action with the existing prompts (no new pre-home blocking state
  that hides the create view).
- **FR-014**: The change MUST NOT alter smart contracts, escrow, resolution logic, oracle integrations,
  membership gating rules, or claim-code cryptography — it is a front-end information-architecture and
  presentation change reusing existing flows.
- **FR-015**: The home create view and its entry points MUST meet the project's accessibility standard
  (WCAG 2.1 AA), consistent with the existing create components.
- **FR-016**: Existing deep links and routes that targeted create/take flows MUST continue to route to
  the correct destination after the home surface changes.

### Key Entities *(include if feature involves data)*

- **Home create view**: The inline create-a-challenge surface — amount, memo, resolution selection
  (self / third-party / oracle) — reusing the existing create panel's state and submission.
- **Resolution path**: self-resolution, third-party arbitrator, or oracle (Polymarket); the oracle
  path carries a selected market + side and is network-gated.
- **Home entry points**: "Create" (the inline view), "Accept a challenge", and "My Rewards" — the
  primary actions of the home surface.
- **Wagers section**: The relocated destination holding all create types and secondary actions
  previously on the home grid.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On opening the app at the home destination, the create-a-challenge view is the primary
  content with zero intermediate button-grid screens — a first-time viewer identifies "create a
  challenge" as what the home screen is for.
- **SC-002**: A user can create an open challenge from the home view without navigating to any other
  screen first (a challenge is creatable in a single, uninterrupted flow on the landing surface).
- **SC-003**: All three resolution paths are reachable from the home view, with the oracle option
  correctly locked on non-Polymarket networks and selectable on Polymarket networks — verified per
  network state.
- **SC-004**: "Accept a challenge" and "My Rewards" are reachable directly from the home screen and
  open the existing flows.
- **SC-005**: 100% of the create types and actions previously on the home grid remain reachable from
  the "Wagers" section (no capability regression), verified item-by-item.
- **SC-006**: No standalone "Open Oracle Challenge" modal remains; oracle challenges are created only
  from the consolidated view.
- **SC-007**: The home create view passes the project's automated accessibility checks (WCAG 2.1 AA)
  with no new violations, and remains non-scrolling at the smallest supported viewport.

## Assumptions

- The "Wagers" destination is a dedicated top-level route/page added to the app's existing nav
  drawer (resolved in Clarifications) — it reuses the app's current navigation pattern rather than
  introducing a new global bottom tab bar.
- "My Rewards" opens the existing My Wagers view, which already surfaces claimable payouts and the
  "Claim Winnings" action (resolved in Clarifications); no new rewards computation or surface is
  introduced. (This is distinct from the Finance → Earn "Rewards" area, which covers DeFi lending
  rewards, not wager winnings.)
- "Accept a challenge" reuses the existing unified phrase-lookup / take-a-challenge flow (today's
  "Enter Words").
- The home create view defaults to self-resolution (either side submits), matching the current
  create default, with oracle offered only where available.
- The home inline create view is open-challenge-only (resolved in Clarifications); other create
  types (1v1, offer, pool) are created from the Wagers section, not inlined on home.
- The Polymarket ticker crawler, if retained, routes into the home create view's oracle path rather
  than a separate modal.
- The existing payments-style keypad, memo, resolution pills (with new SVG icons), and compacted
  layout from the prior work are reused as-is.
- No changes to authentication, wallet connection, or membership mechanics beyond where the existing
  gating prompts appear.
