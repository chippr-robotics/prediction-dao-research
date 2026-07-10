# Feature Specification: Mask Sensitive Values

**Feature Branch**: `claude/mask-sensitive-values-e6o6a6`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Provide an instant visual toggle to hide account balances and portfolio totals in public spaces."

## Overview

Members open FairWins in places where other people can see their screen — a
coffee shop, a shared desk, a train, while screen-sharing on a call, or when
handing their phone to a friend to look at a wager. In those moments the exact
dollar figures on screen (wallet balances, the portfolio total, category
subtotals, per-asset USD values, stake amounts) are private information the
member may not want a bystander to read. Today those numbers are always shown,
so the only way to hide them is to close the app or navigate away.

This feature adds an always-available **privacy toggle** that instantly masks
every sensitive monetary value in the interface — replacing the digits with a
neutral placeholder (e.g. `••••`) — while leaving the rest of the app fully
usable. One tap hides the numbers; one tap brings them back. The member's
choice is remembered so the app stays in their preferred state the next time
they open it. Nothing about balances, holdings, or on-chain state changes — this
is purely a display-level mask over values that are already the member's own.

## Clarifications

### Session 2026-07-10

- Q: What should the privacy preference be keyed to (per-device vs per-account)? → A: Per connected account — each wallet address remembers its own masked/revealed state on the local device; before any account is connected the default (revealed) applies.
- Q: Where should the always-available privacy toggle live? → A: A persistent global control in the app header/navigation, visible on every screen.
- Q: Which additional monetary figures should v1 mask beyond the core set? → A: All on-screen monetary figures — including activity/transaction-history amounts and pending payout/winnings amounts, not just balances, totals, subtotals, per-asset values, and stakes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instantly hide my balances in a public space (Priority: P1)

A member is viewing FairWins where someone could see their screen. They tap a
single, always-reachable privacy control and every balance, portfolio total,
subtotal, per-asset USD value, and stake figure on screen is immediately
replaced with a masked placeholder. The layout does not jump or break, and the
member can still navigate, read labels, and operate the app normally. Tapping
the control again reveals the real values.

**Why this priority**: This is the feature. A member who can hide sensitive
figures on demand gets the entire core value even if nothing else ships. Without
it, there is no privacy affordance at all.

**Independent Test**: On any screen that shows a monetary value (dashboard,
wallet, portfolio), tap the privacy toggle and verify every sensitive figure is
masked and the layout stays intact; tap again and verify the real values return.

**Acceptance Scenarios**:

1. **Given** a member on the portfolio view with a visible total and per-asset
   USD values, **When** they activate the privacy toggle, **Then** the portfolio
   total, every category subtotal, and every per-asset USD value are replaced
   with a masked placeholder and no real digits remain visible.
2. **Given** the privacy toggle is active and values are masked, **When** the
   member deactivates it, **Then** all previously masked values return to their
   exact real figures.
3. **Given** the privacy toggle is active, **When** the member navigates to a
   different screen that also shows sensitive values, **Then** those values are
   masked on arrival without the member having to toggle again.
4. **Given** a masked value, **When** it is displayed, **Then** the surrounding
   layout, alignment, and controls remain stable (no visible jump, reflow, or
   overlap caused by masking).

---

### User Story 2 - Keep my privacy preference between sessions (Priority: P2)

A member who habitually keeps balances hidden wants the app to open in the state
they left it. When they turn the privacy toggle on and later close and reopen
the app (or refresh), the toggle is still on and sensitive values are masked
from the first render, so a bystander never sees a flash of real numbers.

**Why this priority**: Persistence turns a one-off gesture into a durable
privacy posture and prevents an accidental reveal on app launch. It builds
directly on P1 and is meaningless without it.

**Independent Test**: Activate the toggle, fully reload/reopen the app, and
verify values render already masked with the toggle shown as active — without a
visible flash of unmasked values before masking applies.

**Acceptance Scenarios**:

1. **Given** the privacy toggle was active when the member last used the app,
   **When** they reopen or refresh the app, **Then** sensitive values render
   masked from the initial display and the toggle is shown as active.
2. **Given** the privacy toggle was inactive when the member last used the app,
   **When** they reopen or refresh the app, **Then** sensitive values render
   revealed and the toggle is shown as inactive.
3. **Given** a member has never set the toggle, **When** they open the app for
   the first time, **Then** sensitive values are revealed by default and the
   toggle is available to activate.

---

### User Story 3 - Understand what is hidden and reveal it deliberately (Priority: P3)

A member wants confidence about what the toggle covers and an easy way to check
a single figure without fully un-masking the whole app. The privacy control is
clearly labeled and discoverable, communicates its current on/off state, and
optionally lets the member briefly reveal a masked value (e.g. by pressing and
holding or tapping a single value) without changing the global toggle.

**Why this priority**: This is a usability refinement that increases trust and
convenience. The feature is fully valuable without it, so it ships last.

**Independent Test**: Locate the privacy control, confirm its label and
on/off state are clear, and confirm a member can peek at one masked value
without turning the global toggle off.

**Acceptance Scenarios**:

1. **Given** the privacy toggle, **When** a member looks at it, **Then** its
   purpose and current state (masked vs revealed) are clearly indicated.
2. **Given** a masked value and the global toggle still active, **When** the
   member performs the peek gesture on that single value, **Then** only that
   value is briefly revealed and it re-masks afterward while every other value
   stays masked.

---

### Edge Cases

- **A value that is legitimately zero or unavailable**: masking must not turn a
  masked figure into a misleading `$0.00`; when revealed again the honest state
  (real amount, or "price unavailable") is restored exactly as before.
- **Non-monetary numbers**: counts that are not financially sensitive (e.g. a
  number of participants, a countdown timer, a wager ID) are NOT masked, so the
  app stays legible while balances are hidden. The set of masked fields is
  defined explicitly rather than by "any number on screen."
- **New content loading while masked**: values that arrive after the toggle is
  active (async loads, live updates, newly opened panels, modals) must appear
  masked, never flashing real digits first.
- **Copy / accessibility exposure**: while masked, a sensitive value must not be
  readable through selecting/copying the text or through the screen-reader
  accessible name — the mask applies to the exposed content, not just the
  visual glyphs.
- **Screenshots and screen-share**: a screenshot or shared screen taken while
  masked shows the placeholders, since masking operates on what is rendered.
- **Switching accounts**: because the preference is keyed to the connected
  account, switching to a different account applies that account's own remembered
  state (revealed if it has never been set); the switch must not flash the new
  account's real values if that account's saved state is masked.
- **Layout under different value widths**: masking a long value and a short
  value should not cause the row to resize in a way that reveals the original
  magnitude (the placeholder should not encode digit count).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single privacy toggle as a persistent
  control in the app header/navigation, visible and operable from every screen
  that can display sensitive monetary values, without deep navigation.
- **FR-002**: Activating the toggle MUST immediately replace every sensitive
  monetary value currently on screen with a neutral masked placeholder, and
  deactivating it MUST immediately restore the exact real values.
- **FR-003**: The system MUST mask every on-screen monetary figure. This
  explicitly includes: wallet/account balances, the portfolio total, category
  subtotals, per-asset amounts and USD values, wager stake amounts,
  activity/transaction-history amounts, and pending payout/winnings amounts. The
  system MUST NOT mask non-sensitive numbers such as participant counts, timers,
  dates, or identifiers.
- **FR-004**: The masked state MUST apply globally across the app: while active,
  every sensitive value on the current and any subsequently visited screen is
  masked, including values that load or update asynchronously after activation.
- **FR-005**: The system MUST persist the member's toggle choice keyed to the
  connected account, so that each account's masked/revealed state is retained
  across app reloads and new sessions on the same device, and switching accounts
  restores that account's own remembered state.
- **FR-006**: When the persisted state is "masked," the app MUST render
  sensitive values masked from the initial display, with no visible flash of
  real values before the mask applies.
- **FR-007**: The default state MUST be "revealed" (values shown) for any
  account that has not yet set the toggle, and while no account is connected.
- **FR-008**: Masking MUST NOT alter, recompute, or lose the underlying values;
  toggling off MUST reproduce the identical figures (including honest
  "unavailable" / non-zero states) that would have been shown without the
  feature.
- **FR-009**: The masked placeholder MUST NOT encode the magnitude or digit
  count of the hidden value (a large balance and a small balance mask to
  indistinguishable placeholders).
- **FR-010**: Masking MUST prevent the sensitive value from being exposed
  through text selection/copy and through the accessibility (screen-reader)
  accessible name while the value is masked.
- **FR-011**: Applying or removing the mask MUST preserve layout stability — no
  reflow, jump, or overlap that degrades usability — and MUST keep all other
  app functionality available while masked.
- **FR-012**: The privacy control MUST clearly communicate its current state
  (masked vs revealed) so the member can tell at a glance whether values are
  hidden.
- **FR-013**: The system SHOULD allow a member to briefly reveal a single masked
  value (a "peek") without turning off the global toggle, after which that value
  re-masks. *(Supports User Story 3; optional for MVP.)*
- **FR-014**: The privacy preference MUST be treated as a local, per-account
  presentation setting stored on the device and MUST NOT depend on network/on-chain
  state or leak across the testnet/mainnet network boundary in a way that changes
  displayed balances.

### Key Entities *(include if feature involves data)*

- **Privacy Preference**: A presentation setting with two states — masked or
  revealed — stored locally on the device and keyed to the connected account, so
  each account remembers its own state across sessions. Defaults to revealed for
  a not-yet-set account and while no account is connected. It governs display
  only and holds no financial data.
- **Sensitive Value Field**: Any on-screen monetary figure subject to masking —
  balances, portfolio total, subtotals, per-asset values, stake amounts,
  activity/transaction-history amounts, and pending payout/winnings amounts.
  Non-monetary figures (counts, timers, dates, identifiers) are explicitly
  excluded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any screen showing a sensitive value, a member can hide all
  such values with a single interaction (one tap/click), and the values are
  masked in under one second.
- **SC-002**: When the toggle is active, 100% of the defined sensitive value
  fields on the current screen are masked, and 0 real sensitive digits remain
  visible (including in newly loaded content and in copied text).
- **SC-003**: After activating the toggle and reopening the app, sensitive
  values render already masked on 100% of reloads, with no observable flash of
  real values before masking.
- **SC-004**: Toggling the mask on and off reproduces the exact same displayed
  figures 100% of the time (no value is altered, rounded differently, or lost).
- **SC-005**: In usability testing, at least 90% of members can find and use the
  privacy toggle without assistance on their first attempt.
- **SC-006**: Non-sensitive information (labels, counts, timers, navigation)
  remains fully readable and the app remains fully operable while masked, with no
  layout breakage reported.

## Assumptions

- The scope is the FairWins frontend/web experience; masking is a client-side
  presentation concern and does not require any smart-contract or subgraph
  change.
- "Sensitive values" are all on-screen monetary figures (balances, totals,
  subtotals, per-asset values, stake amounts, activity/transaction-history
  amounts, pending payout/winnings amounts). Identifiers, counts, dates, and
  timers are out of scope for masking unless later specified.
- The preference is stored locally on the device and keyed to the connected
  account; syncing the preference across a member's devices is out of scope for
  v1.
- The default is revealed, matching current behavior, so existing members see no
  change until they opt in.
- Masking protects against casual over-the-shoulder / shared-screen viewing; it
  is not a defense against a determined attacker with developer tools or full
  device access, and this is acceptable for the feature's intent.
- The toggle affects only display; underlying values, calculations, and on-chain
  state are unchanged, satisfying the project's "honest state" principle.
- A per-value "peek" affordance (FR-013 / User Story 3) is desirable but not
  required for the initial release.
