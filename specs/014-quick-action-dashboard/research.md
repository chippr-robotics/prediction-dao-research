# Phase 0 Research: Quick Action Dashboard Redesign

The spec is presentation-only with a fixed action set, so research focuses on
*how* to express grouping and per-action identity within the existing React/CSS
stack while keeping the established test and accessibility contracts intact. There
were no open `NEEDS CLARIFICATION` items after `/speckit-clarify` (group count
resolved to two).

## R1. Grouping mechanism within the existing grid

- **Decision**: Keep a single `.quick-actions-grid` CSS grid container; render two
  full-width group-header rows (`grid-column: 1 / -1`) interleaved with the tiles.
- **Rationale**: Existing E2E/a11y tests query `.quick-actions-grid` (singular,
  must be visible) and iterate `.quick-action-card`. A single container with
  spanning headers preserves those selectors and keeps all six tiles in one
  tab/iteration order, while still rendering as two labeled clusters.
- **Alternatives considered**: Two separate `.quick-actions-grid` wrappers
  (risked multiple matches against `should('be.visible')` and split card
  iteration); a flex column of sections (loses the uniform multi-column grid
  alignment the tiles need).

## R2. Per-action accent without a class explosion

- **Decision**: Each tile sets two inline CSS custom properties — `--qa-accent`
  (hex) and `--qa-accent-rgb` (`"r, g, b"`) — consumed by the rail, icon chip
  (`rgba(var(--qa-accent-rgb), 0.12)`), hover glow, focus ring, tag, and arrow.
- **Rationale**: One color source per tile drives every accented element; adding
  or recoloring an action is a one-line data change. Avoids six bespoke CSS
  classes and keeps the stylesheet DRY.
- **Alternatives considered**: A utility class per color (verbose, duplicative);
  CSS `color-mix()` only (narrower browser support than the rgba-channel trick and
  unnecessary given we already carry the rgb string).

## R3. Accessibility — color is not the only signal

- **Decision**: Differentiate actions and groups by **label + small role tag +
  distinct icon**, not color alone. Preserve every accessible name: tile
  `aria-label` (defaults to title; Share Account keeps its "show your address as a
  QR code" wording), the My Wagers badge keeps a visible count plus an sr-only
  "N wager(s) need(s) action" string. Group eyebrow rows are
  `role="presentation"` decorative labels, not headings, so they don't disturb the
  existing single-`<h1>` heading hierarchy.
- **Rationale**: WCAG 2.1 AA (Constitution V) + SC-003: meaning must survive for
  color-blind and screen-reader users. Decorative group labels avoid introducing
  competing headings that the heading-hierarchy test asserts against.
- **Alternatives considered**: `<h2>`/`<h3>` group headings (would add headings the
  a11y/heading tests don't expect and clutter the AT heading list); color-only
  grouping (fails SC-003 / FR-010).

## R4. Tile layout and the action-needed badge

- **Decision**: Horizontal tile — `grid-template-columns: auto 1fr auto`
  (icon · content · arrow) — with the badge absolutely positioned top-right and a
  higher `z-index` so it never collides with the arrow column. Reflow to a single
  full-width column at ≤560px; keep the arrow visible on touch (no hover).
- **Rationale**: A directional, left-accented tile reads as more "actionable" than
  the old centered card and gives the badge a stable corner anchor. Single column
  on phones satisfies SC-004 (full labels, no overlap, no horizontal scroll at
  360px).
- **Alternatives considered**: Keeping the centered vertical card (less visually
  distinct; badge had no natural anchor); a two-column phone layout (cramped for
  horizontal tiles and risks label truncation).

## R5. Motion

- **Decision**: Lift/glow on hover and icon scale, all gated behind
  `@media (prefers-reduced-motion: reduce)` which disables the transitions and
  transforms. Reuse the existing `fadeInUp` section entrance.
- **Rationale**: FR-011 + Constitution V. Tasteful affordance without motion that
  ignores user preference.
- **Alternatives considered**: Entrance stagger per tile (unnecessary complexity,
  YAGNI per Constitution workflow §4).

## R6. Test-contract preservation (Principle II)

- **Decision**: Treat the existing Vitest + Cypress specs as the regression
  contract. Preserve selectors (`.quick-actions-grid`, `.quick-action-card` as
  `<button>` with `aria-label`), keep Friends Decide as the first tile (a11y Enter
  → opens dialog), and keep exact label/description strings. Update only the stale
  `DSH-01` assertion (it asserted 5 tiles in an old order; reality is six grouped
  tiles) and add an assertion for the two group labels.
- **Rationale**: The full frontend suite (1206 tests) is the safety net for a
  presentation refactor; selector stability means the redesign is provably
  behavior-preserving.
- **Alternatives considered**: Rewriting tests around new selectors (larger diff,
  weaker behavior-equivalence guarantee).
