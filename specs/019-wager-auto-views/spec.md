# Feature Specification: My Wagers — Automatic Views & Simplification

**Feature Branch**: `claude/wager-auto-views`
**Created**: 2026-06-18
**Status**: Draft
**Predecessor**: builds on specs 017 & 018 (My Wagers card grid + table view), merged.

**Input**: Iteration feedback to automate and simplify My Wagers:
1. Small displays always use compact cards; wider displays use the table — chosen
   automatically by viewport, removing the manual Grid/Table and density toggles.
2. The list auto-refreshes, so the manual refresh button is removed.
3. The tab strip spans the full width so the tabs are not cramped.

## User Scenarios & Testing

### US1 - Automatic view by viewport (P1)
The view is chosen by screen width: narrow/mobile → compact card grid; wide
desktop → table. No manual Grid/Table toggle and no density toggle.

**Acceptance**: At a narrow width the grid (compact cards) renders; at a wide
width the table renders; resizing across the breakpoint switches the view with no
user control involved.

### US2 - Auto-refresh (P2)
The wager list refreshes itself on an interval while the modal is open, so the
manual refresh button is removed.

**Acceptance**: The refresh button is gone; the list re-fetches periodically while
open and stops when closed.

### US3 - Full-width tabs (P3)
The tab strip (Participating / Created / Arbitrating / History) stretches across
the available width so tabs are evenly spaced, not cramped to the left.

**Acceptance**: Tabs fill the width with equal share; the active tab is still
clearly indicated.

## Requirements

- **FR-001**: The view MUST be selected automatically from viewport width — below
  the breakpoint the compact card grid; at/above it the table — with no manual
  view or density toggle in the UI.
- **FR-002**: On small displays the card grid MUST render in compact density.
- **FR-003**: The wager list MUST auto-refresh on an interval while the modal is
  open, and the manual refresh button MUST be removed.
- **FR-004**: Auto-refresh MUST stop when the modal closes/unmounts.
- **FR-005**: The tab strip MUST span the full toolbar width with tabs sharing the
  space evenly.
- **FR-006**: All preserved My Wagers behavior (tabs, filters, sort, empty states,
  network scoping, expired handling, decryption flow, inline actions, hide/show
  terms, row-click → detail in table) MUST continue to work.

## Assumptions
- Breakpoint: 768px (reuses the app's existing `useMediaQuery`/mobile breakpoint).
  ≥768px → table; <768px → compact grid.
- Auto-refresh interval: 30s (on-chain data; avoids hammering RPC), via the
  existing FriendMarkets refresh; pauses with the modal closed.
- Removing the manual toggles is intended simplification (per the annotated
  feedback) — view is fully automatic; session-persisted view/density prefs from
  spec 018 are dropped.
- Frontend-only; no contract/ABI/subgraph changes.
