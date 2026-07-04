# Feature Specification: Wager View Info Tooltips (Reduce Text Density)

**Feature Branch**: `claude/wager-views-text-density-g17f4p`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "Reduce text density in the wager views (create wager / open challenge forms and similar pop-up views). The views are currently dense with explainer text blocks. Move these explainer text blocks into an info icon the user can click/tap to reveal the text in an info speech bubble (tooltip/popover), so the default view shows only the essential form labels and controls."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compact wager creation form with on-demand help (Priority: P1)

A user opens a wager creation view (open challenge or friend wager). Instead of
reading through paragraphs of explainer text between every field, they see a
clean form showing only the essential labels, inputs, and actions. Next to each
label that previously carried an explainer paragraph, a small info icon is
shown. Tapping or clicking the icon reveals the full explainer text in a speech
bubble anchored to the icon; tapping it again, tapping elsewhere, or pressing
Escape dismisses it.

**Why this priority**: The creation forms (the screenshot that motivated this
feature) are the densest views and the primary conversion path — a first-time
user must scroll past six-plus explainer paragraphs to reach the submit button.
This story alone delivers the core value.

**Independent Test**: Open the open-challenge creation view and the friend-wager
creation view. Verify no static explainer paragraphs render by default, each
formerly-explained field shows an info icon, and activating an icon shows the
exact explainer text in a speech bubble that can be dismissed.

**Acceptance Scenarios**:

1. **Given** the open-challenge creation view is open, **When** it first renders, **Then** none of the static explainer paragraphs (e.g. "An open challenge has no named opponent…", "Phrase it so it's clear which side you're on…", "Enter the amount in USD. Only USDC is supported…", "Single-party self-resolution isn't available for open challenges…", "After this, the challenge can no longer be taken and your stake is refundable.", "The outcome must be submitted before this time.") are visible, and an info icon appears adjacent to each corresponding label or control.
2. **Given** a creation view with info icons, **When** the user taps/clicks an info icon, **Then** a speech bubble appears anchored to that icon containing the full explainer text for that field, without shifting or obscuring the field it explains from being usable.
3. **Given** an open speech bubble, **When** the user taps/clicks the same icon again, taps/clicks anywhere outside the bubble, or presses Escape, **Then** the bubble closes.
4. **Given** an open speech bubble, **When** the user opens a different info icon, **Then** the previous bubble closes and only the newly requested bubble is shown (at most one bubble open at a time).
5. **Given** the compact form, **When** the user fills it out and submits without ever opening an info bubble, **Then** creation works exactly as before — the help is optional, not part of the flow.

---

### User Story 2 - Consistent treatment across all wager pop-up views (Priority: P2)

The same info-icon pattern is applied to every wager-related pop-up view that
carries static explainer text — creating a group pool, taking/accepting a
challenge or wager, and the shared deadline timeline explanations — so the
product feels consistent and no view remains a wall of text.

**Why this priority**: Consistency is the point of the UX pass; leaving other
wager views dense would make the product feel patchwork. It builds directly on
the pattern established in Story 1.

**Independent Test**: Open each remaining wager pop-up view (group pool
creation, take/accept challenge, wager acceptance) and verify explainer blocks
are behind info icons using the identical icon and bubble behavior.

**Acceptance Scenarios**:

1. **Given** any wager pop-up view that previously showed a static explainer paragraph, **When** it renders, **Then** the paragraph is replaced by an info icon with the same appearance and interaction behavior as in the creation views.
2. **Given** two different wager views, **When** the user compares their info icons and bubbles, **Then** the icon placement convention (adjacent to the label/control it explains), bubble styling, and dismissal behavior are identical.
3. **Given** a wager view, **When** it renders, **Then** dynamic, state-dependent messages (validation errors, computed deadline summaries like "Open 2 days 0h for a taker…", warnings, and transaction status) remain inline and visible — only static explainer text moves into bubbles.

---

### User Story 3 - Accessible help for keyboard and assistive-technology users (Priority: P3)

A user navigating by keyboard or screen reader can reach each info icon in the
form's tab order, open the bubble with Enter/Space, have its content announced,
and dismiss it with Escape — meeting the project's accessibility standard.

**Why this priority**: Required by the project constitution (WCAG 2.1 AA), but
it hardens the pattern rather than defining it, so it lands after the core
behavior exists.

**Independent Test**: Using only the keyboard (and an accessibility audit
tool), tab to an info icon, open it, confirm the explainer content is
programmatically associated and announced, and dismiss it with Escape.

**Acceptance Scenarios**:

1. **Given** a wager view with info icons, **When** the user tabs through the form, **Then** each info icon is focusable in a logical order and has an accessible name identifying what it explains.
2. **Given** a focused info icon, **When** the user presses Enter or Space, **Then** the bubble opens and its content is announced by assistive technology; **When** the user presses Escape, **Then** it closes and focus returns to the icon.
3. **Given** the updated views, **When** the automated accessibility audits run, **Then** they pass with no new violations (contrast, focus visibility, name/role/value for the icons and bubbles).

---

### Edge Cases

- Info icon near the edge of a small phone screen: the bubble must reposition or constrain itself so its text stays fully within the viewport instead of being clipped.
- Long explainer text (multi-sentence paragraphs): the bubble wraps and scrolls the page position appropriately rather than overflowing other controls.
- A bubble is open when the underlying view scrolls, re-renders (e.g. a field value changes), or the modal closes: the bubble must close or track its anchor — never float detached from its icon.
- Touch devices have no hover: the pattern must be fully tap-driven; hover may enhance on pointer devices but nothing may be hover-only.
- A field whose explainer text varies by state (e.g. resolution-method explanation that differs for open challenges) shows the text matching the current state at the moment the bubble opens.
- Rapidly tapping multiple icons: at most one bubble is ever visible; no orphaned or stacked bubbles.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Wager pop-up views (open-challenge creation, friend-wager creation, group-pool creation, take/accept flows, and the shared deadline timeline) MUST NOT display static explainer paragraphs inline by default.
- **FR-002**: Each removed explainer block MUST be replaced by an info icon placed adjacent to the label or control it explains, and every removed explainer's full text MUST remain reachable through its icon (no help content is deleted).
- **FR-003**: Activating an info icon (tap or click) MUST reveal the corresponding explainer text in a speech-bubble popover visually anchored to that icon.
- **FR-004**: An open bubble MUST be dismissible by re-activating its icon, activating anywhere outside the bubble, or pressing Escape; opening another icon's bubble MUST close the current one, so at most one bubble is visible at a time.
- **FR-005**: Dynamic and state-dependent text — validation errors, warnings, computed summaries (e.g. live deadline countdowns), and transaction/status feedback — MUST remain inline and always visible; only static explanatory copy moves into bubbles.
- **FR-006**: The info icon and bubble MUST use one shared visual and interaction design across all wager views (same icon glyph, bubble styling, and dismissal behavior).
- **FR-007**: Info icons MUST be operable by keyboard (focusable, activatable with Enter/Space, dismissible with Escape) and expose the bubble content to assistive technology, meeting WCAG 2.1 AA with no new automated-audit violations.
- **FR-008**: Bubbles MUST remain fully readable within the viewport on small screens (down to common phone widths), repositioning as needed rather than clipping.
- **FR-009**: Where explainer content depends on the current form state, the bubble MUST show the text applicable to the state at the time it is opened.
- **FR-010**: Removing inline explainers MUST NOT change any wager behavior, field validation, or submission flow — the change is presentational only.

### Key Entities

- **Explainer content item**: A unit of static help text formerly rendered inline; attributes: the wager view it belongs to, the field/control it explains, its full text (possibly state-dependent variants).
- **Info bubble**: The transient speech-bubble surface that presents one explainer content item, anchored to its icon; at most one exists at a time per view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a standard phone-sized screen, the open-challenge creation form's default (unopened-bubbles) height shrinks by at least 30% versus the current version, and the visible word count outside of labels, values, and buttons drops by at least 70%.
- **SC-002**: 100% of the static explainer blocks currently present in the wager pop-up views are reachable via an info icon — none are visible by default and none are lost.
- **SC-003**: Users can open and dismiss any info bubble in under 5 seconds using touch, mouse, or keyboard alone.
- **SC-004**: Automated accessibility audits pass on every updated view with zero new violations.
- **SC-005**: Wager creation and acceptance completion rates are unchanged or improved after the change (no regression caused by hiding guidance).

## Assumptions

- "Wager views" covers the wager-related pop-up/modal surfaces: open-challenge creation, friend-wager creation, group-pool creation, take/accept-challenge flows, and shared pieces they embed (e.g. the deadline timeline). Non-wager surfaces (dashboard, membership, swap) are out of scope for this feature even if they have similar text.
- The existing explainer wording is kept as-is when moved into bubbles; copy rewriting is out of scope (minor trims to fit a bubble are acceptable, meaning-preserving).
- Validation errors, dynamic warnings (e.g. sanctions/membership gating messages), and computed summaries are not "explainer text" and stay inline.
- A tap/click-triggered bubble is required because the primary audience is mobile; hover behavior on desktop is an optional enhancement, not a requirement.
- No persistence or per-user "don't show again" state is needed; bubbles are stateless and on-demand.
- The existing onboarding tutorial continues to provide first-run guidance; this feature does not replace it.
