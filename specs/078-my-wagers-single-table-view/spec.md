# Feature Specification: My Wagers — One Table View

**Feature Branch**: `claude/my-wagers-resolution-access`
**Created**: 2026-08-09
**Status**: Draft
**Predecessor**: supersedes spec 019 FR-001/FR-002 (automatic grid↔table by viewport) and
retires the spec 017 card grid + the spec 018 grid/table choice.

**Input**: Member report — the My Wagers cards give no way into the resolution
screen; the member has to change device orientation to reach the details. Asked
for, verbatim: *"for simplicity, lets always use the table view."*

## Problem

My Wagers rendered two list views chosen by viewport (spec 019 FR-001): the
compact card grid below 768px, the table at/above it. A card is an accordion —
its actions, including the resolve control, live in the expanded body. On a phone
the grid never auto-expands, so a wager that needed resolving looked inert. The
practical workaround members found was to rotate the device into landscape, cross
the 768px breakpoint, and use the table. That is not a workaround anyone should
have to discover.

## User Scenarios & Testing

### US1 - One list view everywhere (P1)
My Wagers renders the table at every viewport. Below 640px the same rows restyle
into stacked cards (existing CSS), so nothing scrolls sideways.

**Acceptance**: At a phone width the wager table renders with the wager, amount,
date, state and actions of each row visible; resizing changes nothing about which
view is used. No grid/table or density control exists anywhere in the UI.

### US2 - Resolution reachable from the row (P1)
A member who can resolve a wager reaches the resolution flow directly from its
row, in portrait, with no expansion step and no orientation change.

**Acceptance**: On a 390×844 viewport, a created wager inside its resolve window
shows a Resolve control in its row; tapping it opens the resolution modal.

### US3 - Nothing lost with the card grid (P1)
Every affordance the card carried survives the removal:
- inline decrypt for an encrypted wager, its in-progress state, and its retry
  after a failure — now controls in the row's Actions cell;
- the private-terms hide/show control (spec 018 FR-002) — now in the wager detail
  view, which is also where the decrypted terms are shown;
- the padlock marking a private wager — now beside the row's title;
- the action-needed tag (spec 012 FR-007) — now beside the row's status pill.

**Acceptance**: Each of the above renders and behaves as before, from the table.

## Requirements

- **FR-001**: My Wagers MUST render exactly one list view — the table — at every
  viewport. No code path may select a list view from viewport width, and no view
  or density control may exist in the UI.
- **FR-002**: Every action a row offers (accept, resolve, claim, refund, clear,
  decrypt) MUST be reachable from the row itself, without expanding anything and
  without changing device orientation.
- **FR-003**: Below 640px the table MUST restyle into stacked, self-contained
  rows with touch-sized action buttons and no horizontal scrolling.
- **FR-004**: An encrypted wager MUST offer an inline decrypt control in its row,
  a disabled in-progress state while decrypting, and a retry when decryption or
  the envelope fetch failed. No decrypt control is shown once terms are revealed.
- **FR-005**: The wager detail view MUST show a decrypted private wager's terms
  with a control to conceal and re-reveal them, without re-running decryption
  (spec 018 FR-002, relocated from the card).
- **FR-006**: The action-needed tag MUST render on a row only when no control in
  that row already offers the needed action — it is the fallback signal, never a
  duplicate of a visible button.
- **FR-007**: All other preserved My Wagers behaviour (tabs, filters, sort, empty
  states, network scoping, expired handling, auto-refresh, row-click → detail)
  MUST continue to work unchanged.

## Assumptions
- The 640px stacked-row restyle already existed in `MyMarketsModal.css` for the
  table; this makes it the phone experience rather than a rarely-hit fallback.
- Removing the grid deletes `WagerCard`, `WagerCardGrid` and `WagerList` along
  with the `MyWagersView` / `MyWagersDensity` constants. `wagerVm` and
  `wagerCardHelpers` stay — they are now consumed only by `WagerTable`.
- Frontend-only; no contract/ABI/subgraph changes.
