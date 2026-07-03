# Research: UX Consistency Harmonization (038)

**Date**: 2026-07-03 · **Input**: [spec.md](./spec.md) · codebase survey of `frontend/`

All Technical Context unknowns are resolved below. Line references are to the
codebase at the time of planning.

## R1 — Encryption selector removal

**Current state**: Only `FriendMarketsModal.jsx` renders an encryption control
(lines ~1810–1911): a functional checkbox switch bound to
`enableEncryption` (default `true`), an "End-to-End Encrypted" badge, and an
expandable "How encryption works" panel. The flag is genuinely wired: it gates
the encrypt branch in `handleSubmit` (~line 906), sets
`encryptedMetadata`/`isEncrypted` on submission, and turning it off creates a
publicly readable wager. `OpenChallengeModal` and `GroupPoolModal` have no
encryption toggle (their privacy model is the claim code).

**Decision**: Remove the switch UI and the `enableEncryption` state; the
encrypt branch always runs. Replace the current toggle block with a compact,
non-interactive indicator row (lock icon + "End-to-end encrypted" text) with a
small disclosure to the existing "How encryption works" content. Keep the
downstream `isEncrypted`/`encryptedMetadata` fields — they now always reflect
the encrypted path for newly created private wagers.

**Honest-state handling (Constitution III)**: today, when the opponent's
public key cannot be resolved, the user's workaround was to disable
encryption. With the switch gone, that failure MUST surface as an inline
truthful message on the opponent-address field ("This address hasn't published
an encryption key yet — the wager can't be created encrypted") and block
submission rather than silently creating a public wager. The indicator never
renders "encrypted" for anything that will not actually be encrypted.

**Alternatives considered**: (a) keep toggle but collapse into an "advanced"
section — rejected: spec explicitly removes the selector, and an off-switch
contradicts "encryption is the default"; (b) auto-fallback to unencrypted with
a notice — rejected: violates honest-state expectations and silently changes
the privacy of user data.

## R2 — Unified date/time control

**Current state**: three divergent patterns:
1. `FriendMarketsModal` — native `<input type="datetime-local">` (`#fm-end-date`)
   plus a **display-only** derived timeline (gradient track, nodes, three
   read-only stat tiles Accept by / Ends / Resolve by).
2. `OpenChallengeModal` + `GroupPoolModal` — shared `DeadlineTimeline`
   component: two `<input type="range">` sliders, a decorative (aria-hidden,
   non-draggable) dot track, and tile buttons revealing an inline
   "Tap to type a date" `datetime-local` field.
3. Milestone tiles in flow 1 are not tappable at all.

**Decision**: Rework `DeadlineTimeline` into the single canonical control and
adopt it in all three flows:
- **Draggable dots**: the milestone dots on the track become the drag handles
  (Pointer Events: `setPointerCapture`, `touch-action: none` on the track so
  dragging never scrolls the page). The two separate range sliders are
  removed. Each dot remains a real focusable control for accessibility
  (`role="slider"` with `aria-valuemin/max/now/text`, arrow-key stepping) —
  this keeps the existing keyboard path the sliders provided.
- **Tap-to-edit modal**: tapping a milestone tile (or the displayed time
  value) opens a new `SetTimeModal` containing a labelled
  `datetime-local` input scoped to that milestone's allowed range, with
  Cancel/Set actions and an inline explanation of the range on invalid input.
  The inline `oc-manual-entry` block and "Tap to type a date" links are
  removed. (A native input *inside* the modal is permitted — the spec removes
  standalone native picker form fields, and the modal is the consistent entry
  point.)
- **FriendMarketsModal adoption**: `#fm-end-date` is removed; the existing
  derived timeline becomes the interactive control with the **Ends** dot
  draggable and its tile tap-to-edit ("Accept by" and "Resolve by" stay
  derived and read-only, as today). Bounds continue to come from
  `WAGER_DEFAULTS.MIN/MAX_TRADING_PERIOD_SECONDS`.
- **Shared math**: clamp/step/derive helpers consolidate in
  `wagerTimeline.js` so dragging and the modal enforce identical bounds
  (spec FR-004/FR-006). Existing accept-drags-resolve-at-constant-gap
  behavior in `DeadlineTimeline` is preserved.

**Alternatives considered**: (a) third-party date-picker library — rejected:
adds a dependency, fights the timeline metaphor, and the constitution prefers
the smallest change; (b) making tiles open the native picker directly —
rejected: native pickers render inconsistently across platforms (the reported
screenshots show the Android wheel), while a modal wrapping `datetime-local`
keeps one consistent frame with app-controlled validation messaging;
(c) keeping range sliders alongside draggable dots — rejected: duplicate
affordances for the same value contradict the simplicity goal.

## R3 — Timeline brand colorway

**Current state**: phase colors are CSS custom properties scoped to
`.fm-endtime` in `FriendMarketsModal.css` (~lines 264–268):
`--fm-accept: #E8910C` (amber), `--fm-active: #36B37E` (green),
`--fm-resolve: #8C7CF0` (purple). The brand palette in `theme.css` is
`--brand-primary: #36B37E` ("Winning Green") and
`--brand-secondary: #4C9AFF` ("Odds Blue").

**Decision**: Promote the phase colors to global tokens in `theme.css`
(`--timeline-accept`, `--timeline-active`, `--timeline-resolve`) and map:
- accept/join phase → `var(--brand-secondary)` (#4C9AFF) — replaces amber;
- active/ends phase → `var(--brand-primary)` (#36B37E) — unchanged hue,
  now referencing the token instead of a literal;
- resolve phase → keep the existing purple #8C7CF0, defined once as a theme
  token (it is not orange and already reads as a FairWins accent; introducing
  a third brand hue is out of scope).
`.fm-endtime` consumes the global tokens (old scoped definitions deleted), so
every timeline surface recolors at once. Tile tints (`rgba(...,0.08)`
backgrounds) derive from the same tokens. Milestones keep non-color cues
(distinct labels, dot positions, tile headings) and new light/dark contrast is
validated with the existing axe/Lighthouse tooling (FR-008).

**Alternatives considered**: all-green monochrome ramp — rejected: adjacent
phases become hard to distinguish, especially for low-vision users; inventing
new hues outside `theme.css` — rejected: perpetuates the drift this feature
exists to fix.

## R4 — "Who settles" pill rows

**Current state**:
- Pill pattern exists as a **CSS convention only** (`.fm-resolution-tabs` /
  `.fm-resolution-tab` in `FriendMarketsModal.css` ~1734–1782), used by the
  oracle/offer flow tab strip (Me/Them/Either/Friend/Oracle/…) and copied by
  className into `GroupPoolModal`'s "Who must approve the payout?" radio row.
- Two `<select>` dropdowns remain: `#fm-resolution-type` "Who Can Resolve?"
  (participant flow; options Me (Creator) / Them (Opponent) / Either of Us /
  A Friend) and `#oc-resolution` "How is it resolved?" (Either side submits /
  A named third-party arbitrator).

**Decision**: Extract a reusable `PillSelect` component into
`components/ui/` (props: `options[{value,label,icon?,disabled?,disabledReason?}]`,
`value`, `onChange`, `label`, `multiline?`) with `role="radiogroup"` /
`role="radio"` semantics, roving tab index, and the existing
`.active`/`.locked` visual states. Replace both dropdowns with it, preserving
the exact option values (`ResolutionType` enum in `constants/wagerDefaults.js`;
`OPEN_RESOLUTION_TYPES` in `hooks/useOpenChallengeCreate.js`) and downstream
behavior (FR-010). Migrate the two existing className-convention call sites
(`FriendMarketsModal` tab strip, `GroupPoolModal` threshold row) onto the
component so there is one implementation; CSS moves to `PillSelect.css` with
the old selectors aliased during migration.

**Alternatives considered**: styling `<select>` to look like pills — rejected:
cannot render locked-option explanations or icons and keeps two interaction
models; radio inputs with label styling — considered, but button-based
radiogroup matches the shipped pattern and its tests.

## R5 — Stake amount + token on one line

**Current state**:
- `FriendMarketsModal`: separate "Stake Amount" input (with `$` prefix or
  symbol suffix) and a separate full-width "Stake Token" `<select
  className="fm-token-select">` (STABLE / WNATIVE / NATIVE / CUSTOM, from
  `DexContext` per-chain token config; CUSTOM reveals an address input).
- `OpenChallengeModal` / `GroupPoolModal`: amount input with `$` prefix and a
  **hardcoded, non-interactive** `USDC` suffix span — stablecoin only.

**Decision**: One `fm-stake-row` layout everywhere: amount input and token
control share the line, token rendered as the trailing element of the input
group.
- `FriendMarketsModal`: move the existing token `<select>` inline as the
  suffix element; CUSTOM still expands an address field below the row.
- `OpenChallengeModal`/`GroupPoolModal`: the `USDC` suffix becomes an
  interactive token control that opens the token options for the active chain.
  These flows currently support only the chain stablecoin, so the picker shows
  the single option with a short note ("Only USDC is supported for
  open challenges/pools on this network") — satisfying "always selectable"
  (FR-011) without pretending unsupported tokens work (Constitution III).

**Alternatives considered**: enabling multi-token stakes in the
challenge/pool flows — rejected: changes on-chain product scope (pools escrow
USDC by design, spec 034) and is far beyond a UX-harmonization feature.

## R6 — Notification bell visibility

**Current state**: `NotificationBell.css` sizes the bell as a fixed 36×36
circular flex button but never resets padding. The **global rule
`button { padding: 0.6em 1.2em; border: 1px solid transparent; ... }` in
`index.css` (~lines 49–60)** therefore applies inside the fixed box
(`box-sizing: border-box` from the `App.css` universal reset), leaving the
18×18 icon negative horizontal content space — the crushed/clipped bell in the
screenshots. `.header-actions` tightens `gap` at ≤768px but has no
bell-specific rules.

**Decision**: Fix locally in `NotificationBell.css`: explicit
`padding: 0; border: none; background: <its own token>;` plus
`min-width/min-height: 36px` so no inherited or future generic `button` /
`@media` rule can shrink it; keep `flex-shrink: 0`. Add a regression test
asserting the rendered bell exposes the icon and unread badge (and a computed
`padding: 0`) at mobile viewport. 36px meets the WCAG 2.1 AA minimum target
size guidance used elsewhere in the app; badge overflow is capped (e.g. "99+")
so large counts cannot distort layout.

**Alternatives considered**: descoping the global `button` rule in
`index.css` — attractive but risky: every button in the app implicitly relies
on it; auditing that fallout belongs to a broader restyle, not this feature.
The bell opting out is the smallest honest fix. (Noted as future cleanup.)

## R7 — Quick access card preferences

**Current state**: the "quick access" view is `fairwins/Dashboard.jsx`'s
`QuickActionCard` grid — 9 cards: Friends Decide (1v1), Oracle Settles (1v1),
Make an Offer, Open Challenge, Group Pool, Enter a Phrase, My Wagers,
Scan QR Code, Share Account. `AccountDashboard.jsx` has **no tabs and no
Preferences panel** — that surface is net-new. Three persistence patterns
exist: wallet-scoped `userStorage` (`fw_user_${address}_${key}`) via
`UserPreferencesContext`; plain device-scoped localStorage utils
(`qrColorPreference.js` → `fairwins_qrcolor_v1`, `wordListLanguage.js`); and
the theme hook.

**Decision**: Device-scoped plain-localStorage util
`utils/quickAccessPreference.js` (key `fairwins_quickaccess_v1`) storing the
set of **hidden** card ids, mirroring the documented `qrColorPreference.js`
pattern. Semantics: unknown/removed ids are ignored on read; cards absent from
the stored set (including future new cards) default to visible; empty storage
= all visible (FR-015). A new `PreferencesPanel` in the Account area lists all
9 cards with switches; `Dashboard.jsx` filters its card list through the
preference and shows a recoverable empty state pointing at Preferences when
everything is hidden (FR-014). The spec scopes visibility per device, matching
this pattern; wallet-scoped sync is explicitly out of scope.

**Alternatives considered**: wallet-scoped `userStorage` — rejected: card
layout is a device/UI concern (spec assumption), wallet-scoping would make
cards "disappear" when switching accounts on a shared device and requires a
connected wallet before preferences work; extending `UserPreferencesContext` —
same objection, plus it forces a provider dependency into `Dashboard`.

## R8 — Testing approach

**Decision**: Follow the established patterns — Vitest + Testing Library with
`vi.mock` of contexts/hooks, rendered in `MemoryRouter`, queries by
role/label; axe coverage via `vitest-axe` for the reworked timeline, modal,
pill rows, and preferences panel. Add the currently missing direct tests for
`DeadlineTimeline` (drag via Pointer Events simulation + keyboard arrows +
bound clamping) and `wagerTimeline.js` helpers. Update
`FriendMarketsModal.test.jsx`, `GroupPoolModal.test.jsx`, open-challenge
tests, `Dashboard.test.jsx`, and `NotificationBell.test.jsx` in the same PR as
the behavior changes (Constitution II). Cypress smoke paths for the three
creation flows remain valid because option sets and submitted values are
unchanged.
