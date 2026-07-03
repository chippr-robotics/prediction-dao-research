# Research: Wager View Info Tooltips

**Feature**: 039-wager-info-tooltips | **Date**: 2026-07-03

No NEEDS CLARIFICATION markers remained in the Technical Context; research
focused on pattern selection, classification of existing copy, accessibility
semantics, and positioning strategy.

## R1 — Component pattern: generalize `ScreeningInfoButton` into a shared `InfoTip`

**Decision**: Build one shared `InfoTip` component
(`frontend/src/components/ui/InfoTip.jsx`) modeled on the existing
`ScreeningInfoButton` (spec 021): a `<button type="button">` rendering an ⓘ SVG
glyph, local `open` state, outside-`mousedown` and Escape listeners while open,
and a conditionally rendered bubble. `ScreeningInfoButton` is refactored to a
thin wrapper over `InfoTip` so exactly one implementation of the
icon/bubble/dismissal behavior exists (FR-006).

**Rationale**: The pattern already exists in the codebase, passed spec 021's
review and axe tests, and matches the interaction the spec asks for
(tap-to-open, outside-tap/Escape to close). Reusing it keeps visual language
consistent and satisfies the constitution's simplicity rule — no new library,
no parallel pattern.

**Alternatives considered**:
- *Floating-UI / Radix / Headless UI popover libraries*: rejected — a new
  runtime dependency for behavior four existing components already hand-roll;
  bundle cost and constitution "new core technology needs justification".
- *Native HTML `popover` attribute / CSS anchor positioning*: attractive
  long-term but anchor positioning is not yet reliable across the supported
  evergreen-browser matrix, and mixing native popover with the app's existing
  z-index/modal stack is riskier than the proven in-tree pattern.
- *CSS-only `:hover`/`:focus` tooltips*: rejected — hover-only fails the
  touch-first requirement and the spec's tap-driven acceptance scenarios.

## R2 — Classification rubric: what moves into a bubble, what stays inline

**Decision**: A text block moves behind an info icon only if it is
**instructional/explanatory copy that does not change while the user acts**.
Classification of the ~43 `.fm-hint` occurrences (full inventory in
[data-model.md](./data-model.md)):

Moves into `InfoTip` (static explainer, ~24 blocks):
- View intros ("An open challenge has no named opponent…", "Everyone pays the
  same buy-in into one pot…").
- Field guidance ("Phrase it so it's clear which side you're on…", "Enter the
  amount in USD. Only USDC is supported…", arbitrator explanations, Polymarket
  browse guidance, "Joining closes automatically once the pool fills.",
  "We'll find whatever the words point to…", "Save your code to re-read the
  terms later.").
- Timeline milestone hints ("After this, the challenge can no longer be
  taken…", "The outcome must be submitted before this time.") via the
  `DeadlineTimeline` `hint` prop.
- State-dependent explainers (resolution-method text, `KIND_HELP[kind]`,
  key-backup availability text, stake-token guidance): move, rendering the
  variant for the current state at open time (FR-009).

Stays inline (dynamic or risk-bearing, per FR-005 and constitution III):
- `role="alert"` validation ("Pick an acceptance time in the future…") and
  error banners.
- `role="status"` transaction progress messages.
- Computed summaries (deadline duration line, "Your opponent will be taking
  **X**…" side confirmation, odds explanation bound to the chosen multiplier,
  oracle `lockedReason` gating text).
- **Security warnings**: the four-word-code brute-force caveat and the
  encryption honesty text ("End-to-end encrypted…") remain visible — hiding
  risk disclosure behind an optional tap would undermine honest-state UX.

**Rationale**: Draws the FR-005 line mechanically so the implementation sweep
is unambiguous and reviewable item-by-item.

**Alternatives considered**: Moving *everything* including warnings (rejected:
constitution III honesty), or only the two creation intros (rejected: fails
SC-001's ≥70 % visible-word reduction).

## R3 — Accessibility semantics: toggletip with live-region announcement

**Decision**: Implement `InfoTip` as a **toggletip**: trigger is a real
`<button>` with a specific `aria-label` ("About: <field label>"),
`aria-expanded`, and `aria-controls` pointing at the bubble container; the
bubble container is always in the DOM as a `aria-live="polite"` region whose
content is injected on open (so screen readers announce it); Escape closes and
returns focus to the trigger; outside interaction closes without stealing
focus. Icon hit area ≥ 24×24 CSS px; bubble text inherits theme tokens with AA
contrast in light and dark themes.

**Rationale**: The classic disclosure/`aria-describedby` tooltip pattern is
hover/focus-triggered and fails tap-first use; a `role="dialog"` (as
`ScreeningInfoButton` uses today) is heavier than needed for plain text and
implies focus trapping. The toggletip live-region pattern (Inclusive
Components) is the accepted answer for tap-to-reveal help text and satisfies
FR-007's Enter/Space/Escape and announcement scenarios; vitest-axe validates
name/role/value.

**Alternatives considered**: `role="tooltip"` + `aria-describedby` (announces
before opening, wrong for tap-triggered); `role="dialog"` (overkill, focus
management burden for one paragraph; kept only for the link-containing
`ScreeningInfoButton` content via a wrapper prop if needed).

## R4 — Single-open coordination across independent components

**Decision**: When an `InfoTip` opens, it dispatches a
`fairwins:infotip-open` `CustomEvent` (with a unique per-instance id) on
`document`; every mounted `InfoTip` listens and closes itself when it sees
another instance's event. No context provider, no global store.

**Rationale**: Bubbles live in many components (modals, timeline, panels) that
don't share a parent below the app root; a DOM event gives "at most one open"
(FR-004) with zero API surface on host components and is trivially unit-tested.

**Alternatives considered**: React context provider at app root (rejected:
every wager modal must be wrapped, more plumbing for the same behavior);
module-level singleton with subscriber set (equivalent but less idiomatic to
test than DOM events); allowing multiple open bubbles (rejected by FR-004).

## R5 — Bubble positioning and viewport containment

**Decision**: CSS-first positioning — the bubble is absolutely positioned
relative to the icon wrapper (as `ScreeningInfo.css` does), with
`max-width: min(20rem, calc(100vw - 2rem))`, and a small `useLayoutEffect`
that measures the opened bubble via `getBoundingClientRect()` and applies a
horizontal offset (and above/below flip) when it would overflow the viewport.
The bubble closes on modal scroll/unmount because it is rendered in-flow with
its anchor (no portal), so it can never float detached (edge case in spec).

**Rationale**: Handles the two real failure modes on a 320 px screen (right-edge
clipping, bottom-edge clipping) with ~20 lines instead of a positioning
library; rendering in-flow inside the modal keeps stacking-context behavior
predictable inside existing `fm-*` modals.

**Alternatives considered**: Portal to `document.body` with scroll/resize
tracking (rejected: re-introduces the detached-bubble edge case and z-index
juggling with modal overlays); Floating-UI (rejected per R1).

## R6 — Test strategy against SC-001/SC-002 (measurable outcomes)

**Decision**: Unit-level enforcement of SC-002: each updated view test asserts
(a) the explainer string is **not** visible on initial render, (b) activating
the matching info icon makes it visible, and (c) Escape/outside-click hides
it. A repo-grep-style test (or review checklist item in tasks.md) confirms no
static explainer `.fm-hint` remains in the swept views. SC-001's form-height /
word-count reduction is verified manually per quickstart.md (mobile viewport
before/after), not automated. Existing axe suites (`DeadlineTimeline.axe`,
`PillSelect.axe`, `clearpath.accessibility`) are extended with `InfoTip`
open-state scans (SC-004).

**Rationale**: Keeps the measurable criteria testable without brittle
pixel-height CI assertions; matches how spec 038 validated its layout changes.
