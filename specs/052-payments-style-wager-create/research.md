# Phase 0 Research: Payments-Style Wager Create Sheets

All Technical Context items were resolvable from the codebase and the requester's
up-front decisions (all-flows scope, custom keypad on all viewports, existing-theme
layout-only). No open `NEEDS CLARIFICATION` remains. The decisions below record the
design choices that shape Phase 1.

---

## D1 — Shared control vs. per-sheet reimplementation

**Decision**: Build a single shared, controlled component `AmountKeypad` in
`frontend/src/components/ui/` and adopt it in all four sheets (satisfies FR-017).

**Rationale**: The stake block is near-identical across surfaces (`fm-stake-input-wrapper
fm-stake-row` + `fm-stake-prefix` + `fm-stake-usd` + `fm-token-select`), so one control
keeps entry behavior and the hero/keypad consistent (SC-006) and gives one place to test
(SC-004) and meet a11y (SC-005). No shared amount/keypad component exists today
(repo-wide grep for `keypad|numpad|hero-amount|NumberPad` → 0 hits), so this is greenfield.

**Alternatives considered**: (a) Restyle each sheet's existing input independently —
rejected: four divergent implementations, inconsistent behavior, 4× the test surface.
(b) A headless hook only — rejected: the hero display + pad markup and a11y wiring are
the bulk of the work and should be shared, not just the state math.

---

## D2 — Styling approach (CSS Module vs. plain CSS)

**Decision**: Plain CSS file `AmountKeypad.css` with semantic class names, consuming
`theme.css` custom properties. Follow the `PillSelect.css` convention (a `ui/` control
that deliberately sits inside `fm-*` sheets).

**Rationale**: The control drops into the `fm-*` wager sheets and must match
`.fm-stake-input-wrapper` / `.fm-odds-presets` with minimal friction; plain CSS + tokens
is the lower-risk fit and matches how PillSelect (the closest analog) is built. Base DS
primitives (Button/Input/Card) use CSS Modules, but those are generic; this control is
wager-sheet-adjacent.

**Tokens to consume** (no new tokens — FR-014): surfaces `--bg-primary` / `--bg-secondary`;
text `--text-primary` / `--text-secondary` / `--text-muted`; accent `--brand-primary`
(+`--brand-primary-rgb`); `--border-color`; `--danger-color`; radii `--radius-md` /
`--radius-lg` / `--radius-full`; `--transition-fast`. The hero uses existing text tokens
at a large size; the primary create button keeps `.fm-btn-primary`.

**Alternatives considered**: CSS Module (`AmountKeypad.module.css`) — rejected for higher
friction integrating with the global `fm-*`/`--token` styling the sheets already use.

---

## D3 — Amount state model & input constraints

**Decision**: The keypad is a **controlled** component: parent owns the canonical stake
string (its existing `stake` / `stakeAmount` / `buyIn` state); `AmountKeypad` receives
`value` + `onChange(nextString)` and renders the hero + pad. Internally it applies keypad
edits as string operations and calls `onChange` with a normalized decimal string.

**Constraints (FR-007)**: at most one decimal separator; at most two fractional digits
(cents). Keystrokes that would violate these are ignored (no-op), not errored. Backspace
removes the right-most character; deleting to empty yields the zero state.

**Rationale**: Controlled keeps the parent as the single source of truth so the value
submitted always equals the hero (SC-004, FR-008), and preserves each sheet's existing
`onBlur` `toFixed(2)` normalization and validation (`canCreate` / `validateForm`) with
minimal change — the sheet keeps its own state, only the *entry widget* changes.

**Zero/empty state (FR-016, edge cases)**: an empty string renders as `$0` (matching the
Cash App reference) and the parent's existing "stake > 0" gate disables submit. The
component treats `''`, `'0'`, `'0.00'` as non-positive for display-emphasis but does not
itself own the submit gate.

**Alternatives considered**: Uncontrolled/internal-state keypad emitting only on commit —
rejected: risks hero/submitted divergence and duplicates state the sheets already hold.

---

## D4 — Token prefix & multi-token support (surface #3 divergence)

**Decision**: `AmountKeypad` takes a `prefix` prop (default `'$'`) and an optional
compact `token` affordance rendered near the hero. Surfaces #1/#2/#4 pass `prefix="$"`
and a static USDC indicator. Surface #3 (`FriendMarketsModal`, multi-token) passes the
token-driven prefix (`$` for STABLE/CUSTOM, none/symbol otherwise) and continues to render
its own token `<select>` beside/under the hero; the keypad does not own token selection.

**Rationale**: Only surface #3 has a live multi-token `<select>` + conditional prefix +
custom-token address field and `min 0.1 / max 1000` bounds. Keeping token selection in the
sheet (passed into the keypad only as display `prefix`/`token`) avoids coupling the shared
control to surface-specific token logic while still letting #3 adopt the hero+pad.

**Validation ownership**: min/max and token-symbol messaging stay in the sheet
(`validateForm`), unchanged. The keypad enforces only format (decimals/precision).

**Alternatives considered**: Bake the token `<select>` into `AmountKeypad` — rejected:
surfaces #1/#2/#4 are USDC-locked and would carry unused complexity, and #3's custom-token
address flow is out of scope for a display control.

---

## D5 — Layout re-ordering per sheet (hero first, memo second)

**Decision**: In each sheet, move the amount (now `AmountKeypad`) to the top of the form
as the hero, place the description directly beneath it as a **memo-style** field (lower
visual weight, memo affordance), and group the remaining controls (resolution / oracle
side / arbitrator / deadlines) below in a compact "details" region. The primary action
keeps `.fm-btn-primary` pinned to the bottom (`.fm-form-actions` / `.fm-success-actions`).

**Per-surface mapping**:
- **#1 Open Challenge** (`MakerPanel`): hero = `stake`; memo = `description` (`oc-desc`);
  details = `PillSelect` resolution + conditional `ArbitratorField` + `DeadlineTimeline`.
- **#2 Oracle Open Challenge** (`OracleMakerPanel`): hero = `stake`; the "memo" is the
  selected Polymarket market card + YES/NO side picker (description is auto-composed, so the
  market/side selection is the primary context under the hero); details = derived read-only
  timeline. No free-text memo here (keep auto-composed description).
- **#3 1v1** (`FriendMarketsModal`): hero = `stakeAmount` with token prefix; memo =
  `description`; details = resolution tabs/dropdown, opponent/arbitrator, Polymarket picker
  + side, odds/leverage, `DeadlineTimeline`. Keep token `<select>` adjacent to the hero.
- **#4 Group Pool** (`CreatePanel`): hero = `buyIn` ("Buy-in — each member"); memo =
  (pools have no free-text description today) — keep the pool's existing fields (max members,
  approval threshold `PillSelect`, join/resolve `DeadlineTimeline`) as the details region; no
  new memo field is invented (documented assumption).

**Rationale**: Faithfully mirrors Cash App/Venmo (amount hero, memo under it) while keeping
each surface's mandatory inputs. Where a surface has no free-text description (#4) or an
auto-composed one (#2), we do not fabricate a memo — we keep the primary context each
surface actually needs (FR-010, no capability loss; assumptions in spec honored).

**Alternatives considered**: Force a uniform memo field on every surface — rejected: #2's
description is derived and #4 has none; inventing fields would violate "retain existing
capabilities, don't add scope."

---

## D6 — On-screen pad on all viewports (incl. desktop)

**Decision**: Render the pad for all viewports (FR-005). Pad keys are real `<button
type="button">` elements in a 3-column grid (1-9, then decimal / 0 / backspace), so pointer
clicks work on desktop and taps on mobile. Also allow physical-keyboard digit/decimal/
Backspace input to update the same value for desktop ergonomics and a11y, without hiding
the pad.

**Rationale**: The requester explicitly chose "custom keypad, all viewports." Real buttons
give free keyboard focus/activation and screen-reader labels (SC-005). Supporting hardware
keys in parallel is an a11y/ergonomics win, not a replacement for the pad.

**Alternatives considered**: Show pad only on touch/narrow — rejected by the requester's
answer. `type="number"` native input — rejected: the goal is a custom pad, and native
number inputs vary across browsers.

---

## D7 — Accessibility approach (WCAG 2.1 AA)

**Decision**: (a) Each pad key is a labeled button (`aria-label` for decimal/backspace,
digit text for numbers). (b) The hero read-out is exposed as a live value — a visually
hidden label + `aria-live="polite"` region announcing the current amount + token, or an
`role="status"` mirror — so screen-reader users hear updates. (c) The pad container has an
accessible group name (e.g. `aria-label="Amount keypad"`). (d) Focus order: hero →
pad keys → memo → details → primary action. (e) Respect `prefers-reduced-motion` for any
key-press animation.

**Rationale**: Meets FR-015/SC-005 and the constitution's Principle V (axe/Lighthouse gate
in CI). Mirrors the test approach already used (role/name-based queries in
`__tests__/*.test.jsx`).

**Alternatives considered**: Div-based keys with click handlers — rejected: fails keyboard
operability and a11y audits.

---

## D8 — Testing strategy

**Decision**: (a) `AmountKeypad.test.jsx` — unit tests: digit entry updates hero; decimal
adds one point only; precision capped at 2; backspace removes/reaches zero-state; `onChange`
emits the normalized string; keys are role-queryable buttons; prefix/token render. (b)
Per-surface tests: assert `AmountKeypad` is rendered and that submitting passes the same
stake value the sheet held before (guard against value/hero divergence and regression of
the submit contract). Reuse the established mock-the-hook pattern
(`vi.mock(...).mockReturnValue`) so no chain calls run.

**Rationale**: Principle II (test-first alongside behavior); SC-004 verified directly.

**Alternatives considered**: Only E2E — rejected: slower, and unit coverage of the entry
math is where regressions hide.
