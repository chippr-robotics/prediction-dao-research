# Feature Specification: UX Consistency Harmonization

**Feature Branch**: `claude/ux-consistency-harmonization-lfv7yr`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "Harmonize UX elements so users experience a consistent look and feel across the app. The application UX should focus on simplicity and consistency across views. Requirements: (1) Remove the encryption selectors in the views — encryption is the default and informational only, so removing the selector saves space and improves UX. (2) Update the date/time selector so the user either slides the dots on the timeline itself to set the end time, or taps the time they want to update and a modal lets them set it; this should be a consistent experience across all views requiring time input. (3) Make the timeline slider colorway match site branding instead of orange. (4) Every instance of selecting 'who settles' should use pill-button selection for the available options instead of a dropdown. (5) Staked amount and staked token should be on the same line to save space; staked token should always be selectable. (6) The notification bell is barely visible because it has padding from the button class and @media class on top of it; it should have properly managed CSS so it is always visible. (7) In the Preferences tab of My Account, users should have an option to choose which cards are visible on the quick access view. (User provided 12 mobile screenshots of fairwins.app/app illustrating current inconsistencies.)"

## Overview

FairWins currently offers several wager-creation flows — the private wager form,
the open (code-gated) challenge form, and the group pool form — plus a
dashboard, account area, and notification surface. Each flow evolved
independently, so the same concept is presented with different controls in
different places: "who settles" is a pill row in one form and a dropdown in
another; the end time is a native date-picker field in one form and a
slider-plus-cards arrangement in another; stake amount and token are combined
on one line in one form and split across two stacked fields in another. The
deadline timeline uses an orange/amber colorway that does not match the site's
brand palette, an always-on encryption feature is presented as if it were a
choice, and the notification bell in the header is nearly invisible due to
conflicting styling rules. This feature harmonizes these elements into a single
consistent, simple experience across every view, and gives users control over
which cards appear on their quick access view.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent date/time selection on every timeline (Priority: P1)

A user creating any kind of wager (private wager, open challenge, or group
pool) sets deadlines the same way everywhere: a visual timeline shows the
relevant milestone dots (e.g. accept-by, ends, resolve-by). The user either
drags a dot along the timeline to adjust that deadline, or taps the displayed
time value to open a modal where they set the exact date and time. There is no
separate native date-picker form field, and no "tap to type a date" text link —
the timeline itself and its tap-to-edit modal are the single, consistent way to
set times in the app.

**Why this priority**: Time selection appears in every creation flow and is the
most visibly inconsistent element today (native picker field in one view,
sliders with per-card links in another). It is also the interaction the user
called out with the most detail. Fixing it delivers the largest consistency win
on its own.

**Independent Test**: Open each creation flow (private wager, open challenge,
group pool) and confirm times can be set only via dragging timeline dots or
tapping a time value to open the set-time modal, that the same interaction
works identically in all three flows, and that the resulting deadlines are
reflected in the wager summary.

**Acceptance Scenarios**:

1. **Given** any creation form with a deadline timeline, **When** the user drags a milestone dot along the timeline, **Then** the corresponding deadline updates live as the dot moves and respects the flow's minimum/maximum duration limits.
2. **Given** any creation form showing a deadline value, **When** the user taps the displayed time (or its milestone card), **Then** a modal opens where the exact date and time can be set, and confirming the modal updates the timeline and displayed value.
3. **Given** any creation form, **When** the user looks for a way to set the end time, **Then** no native date-picker field or standalone "type a date" link is present — the timeline dots and tap-to-edit modal are the only entry points.
4. **Given** the set-time modal is open, **When** the user enters a time outside the allowed window (e.g. before minimum duration or past maximum), **Then** the modal prevents confirmation and explains the allowed range.

---

### User Story 2 - One control language across creation forms (Priority: P2)

A user moving between the private wager form, the open challenge form, and the
group pool form sees the same concepts presented with the same controls:
"who settles" is always a row of pill buttons (never a dropdown), the stake
amount and stake token always share a single line with the token always
selectable, and there is no encryption on/off selector — private wagers are
simply encrypted by default, with at most a compact informational indicator.

**Why this priority**: These are the remaining cross-view inconsistencies. They
matter most for users who use more than one flow, and each removal or
harmonization also shortens the forms, supporting the simplicity goal.

**Independent Test**: Open all creation flows side by side and verify: every
"who settles"/"how is it resolved" selection is a pill row, every stake entry
is a single line with an always-tappable token selector, and no encryption
toggle or selector control appears anywhere.

**Acceptance Scenarios**:

1. **Given** any view that asks who settles or how the wager is resolved, **When** the user views the options, **Then** the options are presented as pill buttons in a row (with unavailable options visibly disabled and explained), and no dropdown is used for this selection.
2. **Given** any creation form's stake section, **When** the user views it, **Then** the stake amount input and the stake token selector appear on the same line, and tapping the token portion always opens the token selection — even when only one token is currently available (in which case the available option is shown).
3. **Given** any creation form that previously offered an encryption selector or privacy toggle, **When** the user views the form, **Then** no encryption on/off control is present, encryption remains applied by default, and any mention of encryption is a compact informational element that does not accept input and does not visually dominate the form.
4. **Given** a "who settles" pill row, **When** the user selects a pill, **Then** the selection behaves exactly as the previous dropdown selection did (same options, same downstream effect on the form).

---

### User Story 3 - Timeline colorway matches the brand (Priority: P3)

A user looking at any deadline timeline sees segment and dot colors drawn from
the site's brand palette rather than the current orange/amber, so the timeline
feels like part of the same product as the rest of the interface while each
milestone phase remains visually distinguishable.

**Why this priority**: Pure visual polish — no interaction change — but it is
cheap, highly visible, and directly requested. It depends lightly on Story 1's
timeline being the canonical time control.

**Independent Test**: Render every view containing a deadline timeline and
verify no orange/amber timeline segments or dots remain, that the colors used
come from the brand palette, and that adjacent phases are still distinguishable
(including for color-blind users via non-color cues or sufficient contrast).

**Acceptance Scenarios**:

1. **Given** any deadline timeline in the app, **When** it renders, **Then** its segments, dots, and matching milestone cards use brand-palette colors and no orange/amber colorway remains.
2. **Given** a timeline with multiple phases (e.g. accept window, active window, resolve window), **When** the user views it, **Then** each phase is still visually distinguishable and its milestone card/label pairing remains unambiguous, meeting accessibility contrast requirements.

---

### User Story 4 - Notification bell is always visible (Priority: P3)

A user glancing at the app header can always see the notification bell clearly,
at every screen size, with a comfortable tap target — it is never clipped,
shrunk, or crowded out by inherited spacing rules.

**Why this priority**: Small, contained fix, but notifications are a primary
re-engagement surface; an invisible bell means missed activity.

**Independent Test**: View the header at common mobile, tablet, and desktop
sizes and verify the bell is fully visible, correctly sized, and tappable at
each, including when an unread-count badge is shown.

**Acceptance Scenarios**:

1. **Given** the app header on any supported screen size, **When** the page renders, **Then** the notification bell is fully visible, not clipped or overlapped, and meets minimum touch-target size.
2. **Given** the user has unread notifications, **When** the header renders, **Then** the unread indicator is visible alongside the bell without being cut off.

---

### User Story 5 - Choose which cards appear on quick access (Priority: P3)

A user opens the Preferences tab in My Account and sees a list of the cards
available on the quick access view, each with a visibility control. Cards they
turn off no longer appear on the quick access view; cards they turn back on
reappear. The choice persists for that user across sessions on the same device.

**Why this priority**: Personalization rather than consistency — valuable, but
independent of the harmonization work and lowest urgency.

**Independent Test**: Toggle individual cards off and on in Preferences and
confirm the quick access view updates accordingly and the setting survives a
page reload.

**Acceptance Scenarios**:

1. **Given** the Preferences tab in My Account, **When** the user views it, **Then** it lists every card available on the quick access view with its current visibility state.
2. **Given** a card is toggled off in Preferences, **When** the user returns to the quick access view, **Then** that card is not shown and the remaining cards fill the space cleanly.
3. **Given** the user has customized card visibility, **When** they reload the app on the same device, **Then** their card visibility choices are preserved.
4. **Given** the user has hidden all cards, **When** they open the quick access view, **Then** a friendly empty state explains that cards are hidden and points to Preferences to restore them.

---

### Edge Cases

- Dragging a timeline dot on a small touchscreen: dots must have a large enough hit area to drag precisely, and dragging must not scroll the page underneath.
- Two milestone dots dragged close together (e.g. accept-by immediately before ends): the timeline must enforce minimum separation and keep both dots individually grabbable.
- A flow whose duration limits change (e.g. min 1h, max 21d): both dragging and the set-time modal must clamp to the same limits and explain them the same way.
- Only one stake token is available on the active network: the token control still opens and shows the single option, making clear why there is only one.
- An option in the "who settles" pill row is unavailable (e.g. oracle settlement requiring a locked tier): the pill is shown disabled with an explanation, matching how other views present locked options.
- Notification bell with a very large unread count: badge must not push the bell out of view or break header layout.
- Every quick access card hidden: quick access view must show a recoverable empty state rather than a blank screen.
- Existing wagers created before this change: their detail/summary views must render correctly with the harmonized timeline visuals.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All views that previously offered an encryption selector or privacy toggle MUST no longer present any encryption control; encryption MUST remain applied by default with behavior unchanged.
- **FR-002**: Any remaining mention of encryption in creation flows MUST be a compact, non-interactive informational element (with access to the existing "how encryption works" explanation) that occupies visibly less space than the removed selector block.
- **FR-003**: Every view that accepts a date/time input MUST use the shared timeline control: users set times by dragging milestone dots on the timeline or by tapping a displayed time value to open a set-time modal.
- **FR-004**: The set-time modal MUST allow setting an exact date and time, MUST enforce the same minimum/maximum bounds as dot-dragging, and MUST explain the allowed range when the user picks an out-of-range value.
- **FR-005**: Native date-picker form fields and standalone "tap to type a date" links MUST be removed from all views in favor of the shared timeline control.
- **FR-006**: The timeline control MUST behave identically (same gestures, same modal, same validation messaging pattern) in every flow that uses it, differing only in which milestones it shows and its duration bounds.
- **FR-007**: All timeline segments, milestone dots, and their paired milestone cards MUST use colors from the site's brand palette; the orange/amber colorway MUST be removed.
- **FR-008**: Timeline phases MUST remain visually distinguishable after recoloring, meeting the project's accessibility contrast requirements, and MUST NOT rely on color alone to distinguish milestones.
- **FR-009**: Every "who settles" / "how is it resolved" selection in the app MUST be presented as a pill-button row; dropdown presentation of these options MUST be removed everywhere.
- **FR-010**: Pill rows MUST present unavailable options as visibly disabled with an accessible explanation of why they are unavailable, and MUST preserve the exact option set and downstream behavior of the controls they replace.
- **FR-011**: In every creation flow, the stake amount input and stake token selector MUST appear on a single line, with the token control always interactive — including when only one token is available.
- **FR-012**: The notification bell MUST be fully visible, unclipped, and meet minimum touch-target sizing at all supported screen sizes, with its styling isolated from generic button and responsive rules that previously obscured it.
- **FR-013**: The Preferences tab in My Account MUST list all quick access cards with individual visibility controls.
- **FR-014**: The quick access view MUST show only the cards the user has left visible, MUST reflow cleanly, and MUST show a recoverable empty state when all cards are hidden.
- **FR-015**: Quick access card visibility choices MUST persist for the user across sessions on the same device, and all cards MUST default to visible for users who have never customized them.
- **FR-016**: All harmonized controls (timeline, set-time modal, pill rows, stake line, bell, preference toggles) MUST be operable by keyboard and assistive technology, consistent with the project's accessibility standard.

### Key Entities

- **Quick access card preference**: A per-user, per-device record of which quick access cards are visible; one visibility flag per known card, defaulting to visible.
- **Deadline milestone**: A named point on a wager timeline (e.g. accept-by, ends, resolve-by) with a timestamp, allowed range, and brand-palette phase color; the unit manipulated by dot-dragging and the set-time modal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of views that accept a date/time input use the shared timeline interaction (drag a dot or tap-to-edit modal); zero native date-picker fields or "type a date" links remain.
- **SC-002**: 100% of "who settles"/"how is it resolved" selections render as pill rows; zero dropdowns remain for these selections.
- **SC-003**: Zero encryption selectors remain in any view, and each affected form is measurably shorter (at least one full control block removed) than before.
- **SC-004**: Zero orange/amber timeline elements remain; every timeline color is drawn from the documented brand palette and passes the project's accessibility contrast checks.
- **SC-005**: The notification bell passes visibility and touch-target checks at all supported breakpoints with zero clipped or overlapped renderings.
- **SC-006**: A user can set an exact end date and time in 3 interactions or fewer from any creation form (tap time → set value → confirm).
- **SC-007**: A user can hide or show any quick access card from Preferences in 2 interactions or fewer, and the choice survives an app reload 100% of the time.
- **SC-008**: In moderated usability checks, users who complete one creation flow can complete a different creation flow without asking how to set the time or who settles (task completion without assistance).

## Assumptions

- The site's brand palette is the existing green-led colorway used by primary actions and branding across the app; "match site branding" means drawing timeline colors from that documented palette rather than introducing new hues.
- Removing the encryption *selector* does not change encryption behavior: private wagers remain encrypted by default exactly as today; this feature is presentation-only for encryption.
- A compact informational encryption indicator (with access to the existing "how encryption works" content) is retained rather than removing every mention of encryption, since the user described the feature as "informational only".
- "Who settles" harmonization covers all settlement/resolution-chooser controls in creation flows (including "How is it resolved?" in the open challenge and "Who must approve the payout?" in group pools), with each flow keeping its own option set.
- Pill rows follow the existing pill pattern already shipped in the private wager form (Me / Them / Friend / Oracle), including its disabled-option treatment.
- Stake token selectability is scoped to tokens supported on the active network; when only one token is supported, the selector still opens and shows that single option.
- Quick access card visibility is a per-device preference (stored locally, like existing UI preferences) and does not require on-chain or server-side storage; cross-device sync is out of scope.
- The set of quick access cards is the set of cards currently shown on the quick access/dashboard view; adding new cards is out of scope.
- Mobile-first: the screenshots are mobile, and mobile is the primary target, but the harmonized controls must also work at tablet/desktop sizes.
- No smart-contract or on-chain changes are required; this is a frontend-only feature.
