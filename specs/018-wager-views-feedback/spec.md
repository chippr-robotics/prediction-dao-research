# Feature Specification: My Wagers — Views & Privacy Feedback

**Feature Branch**: `claude/wager-views-feedback`
**Created**: 2026-06-18
**Status**: Draft
**Predecessor**: builds on spec 017 (My Wagers card grid), now merged.

**Input**: Post-merge review feedback on the card grid:
1. The card's "View details" button is redundant — the expanded card already
   shows the same information as the detail view.
2. Users must be able to re-hide a private bet's decrypted description to avoid
   shoulder-surfing exposure after decrypting it.
3. Provide a table/list view option alongside the grid: minimal columns
   (wager, amount, date, state, actions); clicking a wager opens its full details.
4. The view-switch control must sit inline with the refresh and density buttons.

## User Scenarios & Testing

### US1 - Remove the redundant "View details" (P2)
The expanded grid card is the detail surface; the separate "View details" button
is removed. The full `MarketDetailView` is still reachable from the table view.

**Acceptance**: Expanding a grid card shows terms/metadata/actions with no
"View details" button.

### US2 - Re-hide decrypted private terms (P1)
After decrypting an encrypted ("private") wager, the card shows the terms with a
control to hide them again; hiding re-conceals the terms text (view-only — the
data stays decrypted in memory) and offers a "Show terms" control to reveal.

**Acceptance**: Decrypt a private wager → terms visible + "Hide" control →
clicking hides the terms and shows "Show terms" → clicking reveals them again.
Hiding is per-card and does not re-trigger decryption.

### US3 - Table view (P1)
A table/list view presents wagers in compact rows — wager, amount, date, state,
actions — mirroring the pre-redesign table. Clicking a row (not an action) opens
the wager's full detail view. All inline actions behave as in the grid.

**Acceptance**: Switch to table view → wagers render as rows with those columns →
clicking a row opens the detail view → action buttons run the existing flows.

### US4 - View toggle placement (P2)
A Grid/Table toggle sits in the toolbar inline with the density and refresh
controls. The chosen view is remembered for the session. The density toggle is
only shown in grid view (it has no effect on the table).

**Acceptance**: The Grid/Table toggle renders next to refresh/density; switching
persists for the session.

## Requirements

- **FR-001**: The grid card MUST NOT render a "View details" button; the expanded
  card is the detail surface for grid view.
- **FR-002**: For an encrypted wager whose terms have been decrypted, the card
  MUST provide a control to hide the terms again and to re-show them, without
  re-running decryption. Hiding is per-card and view-only.
- **FR-003**: The view MUST offer a table view with columns wager, amount, date,
  state, and actions; a row click (outside an action control) MUST open the
  wager's full detail view (`MarketDetailView`).
- **FR-004**: The table view MUST surface the same contextual actions as the grid
  (accept/resolve/claim/refund/reclaim/respond-to-draw) wired to the existing
  handlers, with no change to on-chain semantics.
- **FR-005**: A Grid/Table view toggle MUST be placed inline with the refresh and
  density controls; the selected view MUST persist for the session.
- **FR-006**: The density toggle MUST only be shown in grid view.
- **FR-007**: All preserved My Wagers behavior (tabs, filters, sort, empty states,
  network scoping, expired handling, decryption flow) MUST continue to work in
  both views.

## Assumptions
- Default view is grid (current behavior); view + density persist via
  sessionStorage, matching spec 017's density approach.
- "Private bets" = encrypted wagers; the hide/show control only appears once such
  a wager is decrypted (plain wagers have nothing to hide).
- Table view reaches details via row click (replacing the grid's removed
  "View details"); the grid reaches details via inline expansion.
- Frontend-only; no contract/ABI/subgraph changes.
