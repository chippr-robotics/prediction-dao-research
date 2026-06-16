# Phase 1 Data Model: Quick Action Dashboard Redesign

This feature introduces no persisted or on-chain data. The "data model" is the
in-memory **view model** that drives the quick-action region — the shape of each
tile descriptor and how tiles roll up into groups. All values are static client
config except the action-needed badge, which derives from existing runtime state.

## Entities

### QuickAction (view-model record)

One dashboard tile. An array of these is declared in `QuickActions` and rendered
by `QuickActionCard`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable action key; switch target in `handleQuickAction` (`create-1v1-friends`, `create-1v1-oracle`, `create-offer`, `my-wagers`, `scan-qr`, `share-account`). |
| `category` | `'create' \| 'track' \| 'qr'` | Drives the group a tile renders in and the `qa-{category}` modifier class. |
| `accent` | string (hex) | Per-action color; sets `--qa-accent`. |
| `accentRgb` | string (`"r, g, b"`) | Same color as channels; sets `--qa-accent-rgb` for rgba tints. |
| `tag` | string | Short non-color role cue (e.g. "People settle", "Scan", "Share"). |
| `icon` | JSX (SVG) | Inline stroke icon, `aria-hidden`. |
| `title` | string | Visible label — exact, preserved (see Validation). |
| `description` | string | Visible caption — exact, preserved. |
| `ariaLabel` | string \| undefined | Overrides accessible name when the title is ambiguous (Share Account) or carries badge context (My Wagers). Falls back to `title`. |
| `badge` | BadgeDescriptor \| null | Present only on My Wagers when a count > 0. |

### BadgeDescriptor

Action-needed indicator attached to the My Wagers tile.

| Field | Type | Notes |
|-------|------|-------|
| `count` | number | Visible numeral; rendered `aria-hidden`. |
| `label` | string | Full sentence "N wager(s) need(s) action"; rendered sr-only and folded into the tile's `ariaLabel`. Correct singular/plural per count. |

**Source**: `count` = `useWagerActivityOptional()?.actionNeededCount ?? 0`
(existing spec-012 watcher). The badge is omitted entirely when count is 0, and
the tile renders without crashing when the watcher provider is absent.

### ActionGroup (presentational grouping)

A labeled cluster rendered as a full-width header row plus its member tiles.
Fixed at two groups (per `/speckit-clarify`).

| Field | Type | Notes |
|-------|------|-------|
| `key` | `'create' \| 'track'` | Group identity / header modifier (`qa-group-header--track`). |
| `eyebrow` | string | Visible label: "Start a wager" / "Track & share". |
| `sub` | string | Secondary caption (e.g. "Pick who settles the outcome"). |
| `members` | QuickAction[] | "create" → 3 creation tiles; "track" → My Wagers, Scan QR, Share Account. |

## Relationships

- `ActionGroup 1—* QuickAction` via `QuickAction.category` (`create` → "Start a
  wager"; `track` and `qr` → "Track & share").
- `QuickAction 0..1—1 BadgeDescriptor` — only My Wagers, only when count > 0.
- Each `QuickAction.id` maps 1:1 to a branch in the existing `handleQuickAction`
  dispatcher (no new flows; FR-005).

## Validation rules

- Titles and descriptions MUST equal the existing strings exactly (FR-004/FR-005;
  asserted by `Dashboard.test.jsx`).
- Every tile MUST resolve to a non-empty accessible name (`ariaLabel || title`)
  and remain a focusable `<button>` (FR-008; asserted by `22-accessibility.cy.js`).
- The "create" group MUST render before "track" so Friends Decide stays the first
  `.quick-action-card` (a11y Enter-opens-dialog test).
- Within "track", the two QR tiles MUST stay visually distinguishable from each
  other and from My Wagers via accent + icon (FR-001/FR-010).
- Accent colors MUST remain legible in light and dark themes (rgba tints over the
  themed `--surface-color`).

## State & lifecycle

No tile-local state. The only dynamic input is `actionNeededCount`, which flows
from the watcher context through props on each render; changing it adds/removes
the My Wagers badge and updates the singular/plural label. No transitions,
persistence, or network calls are introduced by this feature.
