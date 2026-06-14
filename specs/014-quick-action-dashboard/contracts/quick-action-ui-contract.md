# UI Contract: Quick Action Dashboard Region

The observable contract for the connected "Your Wagers" quick-action region. These
are the guarantees automated tests and reviewers verify. IDs (C#/A#/B#) are stable
references for tasks and test mapping.

## Structure

- **C1**: The region renders exactly one `.quick-actions-grid` container, visible
  when the wallet is connected (or in demo mode).
- **C2**: The grid contains exactly **six** `.quick-action-card` elements, each a
  native `<button>`.
- **C3**: Tiles render in two labeled groups, in DOM order:
  1. **Start a wager** — Friends Decide (1v1), Oracle Settles (1v1), Bookmaker
  2. **Track & share** — My Wagers, Scan QR Code, Share Account
- **C4**: Each group is introduced by a `.qa-group-eyebrow` label: "Start a wager"
  and "Track & share". Group labels are decorative (`role="presentation"`), not
  headings — the page retains a single `<h1>` ("Your Wagers").
- **C5**: The first `.quick-action-card` is "Friends Decide (1v1)".

## Per-tile content (exact strings — must not change)

| Tile | Title | Description |
|------|-------|-------------|
| create-1v1-friends | `Friends Decide (1v1)` | `You and a friend settle the outcome` |
| create-1v1-oracle | `Oracle Settles (1v1)` | `Auto-settles from a linked Polymarket market` (default) / `Auto-settles from Polymarket, Chainlink or UMA` (all-models mode) |
| create-bookmaker | `Bookmaker` | `Offer odds and let a friend take the other side` |
| my-wagers | `My Wagers` | `View active and past wagers` |
| scan-qr | `Scan QR Code` | `Accept a wager from a friend` |
| share-account | `Share Account` | `Show your address as a QR code` |

## Actions (click → flow; unchanged behavior)

- **A1** `create-1v1-friends` → create modal, `initialType=oneVsOne`,
  `resolutionCategory=participant`.
- **A2** `create-1v1-oracle` → create modal, `initialType=oneVsOne`,
  `resolutionCategory=oracle`.
- **A3** `create-bookmaker` → create modal, `initialType=bookmaker`,
  `resolutionCategory=all`.
- **A4** `my-wagers` → opens My Wagers modal.
- **A5** `scan-qr` → opens the QR scanner modal.
- **A6** `share-account` → opens the Address QR modal in the `quick` variant
  (clean QR using the persisted color preference; no color options; no visible
  address text).
- **A7**: Activation works by mouse click and by keyboard (Enter) on a focused
  tile.

## Accessibility

- **B1**: Every tile exposes a non-empty accessible name (`aria-label`, default =
  title).
- **B2**: `Share Account`'s accessible name conveys its QR outcome
  ("Share Account — show your address as a QR code").
- **B3**: Every tile is keyboard focusable with a visible focus indicator
  (`:focus-visible` outline in the tile's accent).
- **B4**: Action and group differentiation never depends on color alone — labels,
  role tags, and icons also distinguish them (WCAG 2.1 AA / Constitution V).
- **B5**: Decorative icons and the accent rail/arrow are `aria-hidden`.

## Action-needed badge (My Wagers)

- **B6**: When `actionNeededCount > 0`, the My Wagers tile shows a visible numeral
  and an sr-only "N wager(s) need(s) action" string; the tile's accessible name
  includes that sentence.
- **B7**: Singular/plural is correct ("1 wager needs action" vs "2 wagers need
  action").
- **B8**: When `actionNeededCount === 0`, no badge or action-needed text renders.
- **B9**: With no wager-activity provider mounted, the region renders without
  error and shows no badge.

## Responsive

- **R1**: At ≥ ~1025px the grid is multi-column; at ≤1024px it is two columns; at
  ≤560px it is a single full-width column.
- **R2**: At a 360px viewport all six tiles show full labels, the badge does not
  overlap other tile content, and there is no horizontal page scroll.

## Motion

- **M1**: Hover/entrance motion is suppressed under
  `prefers-reduced-motion: reduce`.
