# Feature Specification: Payments-Style Wager Create Sheets

**Feature Branch**: `claude/fairwins-wager-sheet-redesign-xvr24u`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Redesign the wager-creation bottom sheets into a familiar, payments-app-style experience (Cash App / Venmo feel). Amount becomes the hero, an on-screen number pad drives entry, and the wager text is demoted to a secondary memo line. Apply to all wager create flows. Layout only — reuse existing FairWins theme."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enter a stake with an amount-first, number-pad view (Priority: P1)

A person opening any wager-creation sheet is greeted by a large, glanceable stake
amount as the visual centerpiece — the way Cash App and Venmo open on the amount
you're about to send. They tap an on-screen number pad to key in the stake, and
the big figure updates live as they type. The token (USDC) is shown compactly
beside or under the amount so it's unambiguous what currency the stake is in.

**Why this priority**: This is the heart of the redesign and the single most
requested change — the amount is the thing users most want to see clearly and
show to another person, and the number pad is the entry method that makes the
sheet feel like a payments app. Every create flow depends on this control, so it
is the foundation the rest of the redesign is built on. Shipping just this (even
before the other flows are converted) already delivers a recognizably
payments-style entry experience on the first sheet it lands in.

**Independent Test**: Open a wager-create sheet, verify the amount renders as the
oversized hero element, tap number-pad keys and the decimal/backspace, and
confirm the displayed amount and the value submitted to the create action match
what was keyed — with no reliance on the device's native keyboard.

**Acceptance Scenarios**:

1. **Given** a create sheet is open with a default stake, **When** the user taps
   number-pad digits, **Then** the hero amount updates on each tap to reflect the
   entered value.
2. **Given** the user has entered digits, **When** they tap the decimal key and
   two more digits, **Then** the amount shows exactly two decimal places (cents)
   and further decimal-key or extra-digit taps are ignored.
3. **Given** a multi-digit amount is shown, **When** the user taps backspace/delete,
   **Then** the right-most character is removed and the hero amount re-renders.
4. **Given** a valid non-zero amount is entered, **When** the user submits the
   sheet, **Then** the stake passed to the create action equals the amount shown
   in the hero, preserving the existing equal-stake semantics.
5. **Given** the sheet is viewed on a desktop-width browser, **When** the sheet
   renders, **Then** the on-screen number pad is present and usable with pointer
   clicks (not only on touch/mobile widths).

---

### User Story 2 - Add wager details as a secondary "memo" (Priority: P1)

Below the hero amount, the wager description sits as a secondary, memo-style field
— visually subordinate to the amount, the way the note/memo sits under the amount
on a Venmo or Cash App payment. Users type what the wager is about there, but the
sheet's visual hierarchy makes clear the amount is primary and the memo is
supporting context.

**Why this priority**: The user explicitly asked that the wager text become
secondary to the amount, mirroring a payments memo. Without this the sheet is not
a faithful payments-style redesign; it is required for the primary create flow to
be complete (a wager still needs a description). It is P1 because a create sheet
is not usable without both an amount and a description.

**Independent Test**: Open a create sheet, confirm the description field is
rendered beneath the amount with clearly lesser visual weight (memo styling), type
a description, submit, and confirm the same text reaches the create action and the
generated claim-code metadata.

**Acceptance Scenarios**:

1. **Given** a create sheet is open, **When** it renders, **Then** the wager
   description appears below the amount as a memo-style field with clearly lower
   visual prominence than the amount.
2. **Given** the description is empty, **When** the user attempts to submit, **Then**
   submission is blocked and the user is prompted to add the wager description,
   consistent with today's validation.
3. **Given** the user types a description, **When** they submit, **Then** the exact
   text is carried into the create action unchanged (trimmed as today).

---

### User Story 3 - Configure resolution, arbitrator, and deadlines without losing them (Priority: P2)

All existing create controls remain available on the redesigned sheet, just
re-laid-out and de-emphasized relative to the amount: the resolution-path choice
(either-side vs. third-party arbitrator, plus oracle side selection where the flow
uses an oracle), the arbitrator address entry when a third-party is chosen, the
accept/resolve deadlines, and the final create/generate-code action. Nothing that
could be configured before can be lost in the redesign.

**Why this priority**: These controls are necessary for a valid wager and must not
regress, but they are secondary to the amount/memo in the new visual hierarchy and
can be presented in a compact or progressively-disclosed manner below the hero.
P2 because the sheet is still demonstrably "payments-style" with US1+US2, but is
not shippable to production until parity with today's controls is restored.

**Independent Test**: For each converted flow, exercise every pre-existing control
(resolution paths, arbitrator entry, deadlines) on the redesigned sheet and confirm
each still collects and submits the same values as before, with the same validation.

**Acceptance Scenarios**:

1. **Given** the redesigned sheet, **When** the user selects the third-party
   arbitrator path, **Then** the arbitrator address entry (with its address-book
   and QR-scan helpers) appears and its value is validated and submitted as today.
2. **Given** the redesigned sheet, **When** the user adjusts the accept and resolve
   deadlines, **Then** the deadline values are collected and submitted with the
   same bounds and ordering rules as today.
3. **Given** an oracle-backed create flow, **When** the sheet renders, **Then** the
   oracle market/side selection remains available and its selection submits as
   today.
4. **Given** all required fields are valid, **When** the user taps the primary
   create action, **Then** the existing create/generate-code outcome (including
   membership gating and claim-code generation) is produced unchanged.

---

### User Story 4 - Consistent payments-style layout across every create flow (Priority: P2)

The same amount-first, number-pad, memo-secondary layout is applied consistently
to all four create surfaces — the Open Challenge sheet, the Oracle (Polymarket)
Open Challenge sheet, the 1v1 create-a-wager modal, and the group Wager Pool create
flow — so creating any kind of wager feels the same.

**Why this priority**: Consistency is a core goal, but each surface can be converted
independently and the value is realized incrementally. P2 because the redesign
delivers value on the first converted surface; full consistency is the completion
state, not the MVP.

**Independent Test**: Open each of the four create surfaces and confirm each
presents the shared amount-first hero, the on-screen number pad, and the memo-style
description, with the same interaction behavior.

**Acceptance Scenarios**:

1. **Given** any of the four create surfaces, **When** it opens, **Then** it shows
   the shared payments-style layout (hero amount, number pad, memo) and behaves
   consistently across surfaces.
2. **Given** a surface with additional required inputs (e.g. group pool or oracle
   specifics), **When** it renders, **Then** those inputs are presented below the
   shared hero region without breaking the payments-style hierarchy.

---

### Edge Cases

- **Empty / zero amount**: The hero shows a clear zero state (e.g. `$0`), the
  primary action is disabled, and submission is blocked until a positive amount is
  entered.
- **Leading decimal / multiple decimals**: Tapping the decimal key first yields a
  well-formed value (e.g. `0.`), and a second decimal-key tap is ignored so only one
  decimal point can exist.
- **Excess precision**: Entry beyond two decimal places (cents) is rejected or
  truncated, matching USDC's practical precision.
- **Very large amount**: The hero amount scales down or otherwise remains fully
  legible without overflowing the sheet; the layout does not break.
- **Backspace to empty**: Deleting all characters returns to the zero state rather
  than an invalid/blank hero.
- **Insufficient balance**: Existing balance/allowance checks still fire on submit
  and surface the same honest error messaging as today.
- **Membership gating**: Users below the required membership tier are still gated
  from creating, with the same messaging as today.
- **Keyboard / assistive input**: The number pad is operable by keyboard and screen
  reader (each key is a labeled control), and the amount's live value is announced
  to assistive technology.
- **Reduced-motion / small screens**: The hero and number pad remain usable at the
  smallest supported viewport and respect reduced-motion preferences.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All four wager-creation surfaces (Open Challenge, Oracle Open
  Challenge, 1v1 create-a-wager, group Wager Pool create) MUST present a
  payments-style layout in which the stake amount is the visual hero of the sheet.
- **FR-002**: The stake amount MUST be displayed as a large, high-legibility figure
  intended to be readable at a glance and shown to another person.
- **FR-003**: The active stake token (USDC) MUST be indicated compactly adjacent to
  the amount so the currency of the stake is unambiguous.
- **FR-004**: Each create surface MUST provide an on-screen number pad with keys for
  digits 0–9, a decimal separator, and a backspace/delete key, and users MUST be
  able to enter the full stake amount using only that pad.
- **FR-005**: The on-screen number pad MUST be present and operable on all viewports
  (mobile and desktop), not conditionally shown only on touch or narrow screens.
- **FR-006**: The hero amount MUST update live as the user enters or deletes
  characters via the number pad.
- **FR-007**: Amount entry MUST constrain input to a valid monetary value — at most
  one decimal separator and at most two fractional digits (cents) — and reject or
  ignore keystrokes that would violate this.
- **FR-008**: The value submitted to the create action MUST equal the amount shown
  in the hero, preserving the existing equal-stake (each-side) semantics.
- **FR-009**: The wager description MUST be presented as a secondary, memo-style
  field positioned below and visually subordinate to the amount.
- **FR-010**: The redesign MUST retain every control available in today's create
  sheets — resolution-path selection (either-side / third-party arbitrator), oracle
  market/side selection where applicable, arbitrator address entry (including its
  address-book and QR-scan helpers) for the third-party path, and the accept/resolve
  deadlines — with no loss of capability.
- **FR-011**: The redesign MUST preserve all existing validation, including
  non-empty description, positive stake, valid arbitrator when third-party is
  selected, and valid/ordered deadlines, blocking submission until satisfied.
- **FR-012**: The redesign MUST preserve existing membership gating and the existing
  create/generate-code outcome, including claim-code generation and the associated
  encrypted metadata.
- **FR-013**: The redesign MUST NOT alter smart contracts, escrow behavior,
  resolution logic, oracle integrations, or claim-code cryptography — it is a
  presentation and interaction change to the create sheets only.
- **FR-014**: The redesigned sheets MUST be styled using FairWins' existing design
  tokens and current theme (payments-first layout only, no new/neon visual
  aesthetic) so they feel native to the rest of the app.
- **FR-015**: The number pad, hero amount, and memo field MUST meet the project's
  accessibility standard (WCAG 2.1 AA): each pad key is a labeled, keyboard-operable
  control, and the live amount value is available to assistive technology.
- **FR-016**: The zero/empty amount state MUST be clearly presented and MUST disable
  the primary create action until a positive amount is entered.
- **FR-017**: The on-screen number-pad amount-entry control SHOULD be provided as a
  single shared control reused across all four surfaces, so behavior stays
  consistent and there is one place to test and maintain it.

### Key Entities *(include if feature involves data)*

- **Stake amount**: The monetary value each side wagers, entered via the number pad
  and shown as the hero; constrained to a valid USDC amount (up to two decimals).
- **Wager memo (description)**: The free-text description of what the wager is about,
  demoted to a secondary field; carried unchanged into the existing claim-code
  metadata.
- **Resolution configuration**: The resolution path (either-side / third-party /
  oracle), the arbitrator address (when third-party), and any oracle market/side —
  unchanged in meaning, re-laid-out in the sheet.
- **Deadlines**: The accept and resolve deadline values, unchanged in bounds and
  ordering, re-laid-out beneath the hero region.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can enter a stake amount and create a wager using only the
  on-screen number pad, without invoking the device's native keyboard for the
  amount, on all four create surfaces.
- **SC-002**: On every create surface, a first-time viewer identifies the stake
  amount as the most prominent element of the sheet (the amount is unmistakably the
  visual hero relative to the description and other controls).
- **SC-003**: 100% of controls available in the pre-redesign create sheets remain
  available and functional in the redesigned sheets (no capability regression),
  verified control-by-control per surface.
- **SC-004**: The value shown in the hero matches the value submitted to the create
  action in 100% of entry sequences, including decimal and backspace edits.
- **SC-005**: The redesigned sheets pass the project's automated accessibility
  checks (WCAG 2.1 AA) with no new violations introduced by the number pad, hero
  amount, or memo field.
- **SC-006**: All four create surfaces present a visually consistent payments-style
  layout, such that a reviewer cannot identify a surface that uses the old
  form-first arrangement.
- **SC-007**: Creating a wager via a redesigned sheet takes no more taps/steps than
  the pre-redesign flow for an equivalent wager (the redesign does not add friction).

## Assumptions

- The amount-entry control operates in whole USD/USDC units with cents precision
  (two decimal places), matching today's stake input and USDC's practical precision.
- USDC remains the only stake token surfaced today; the compact token indicator is
  present but does not need to offer multiple tokens for this feature.
- The existing create hooks/actions and their submitted value shapes remain the
  integration point; this feature changes how values are gathered and presented, not
  what is ultimately submitted on-chain.
- "All wager create flows" means exactly the four surfaces named (Open Challenge,
  Oracle Open Challenge, 1v1 create-a-wager, group Wager Pool create); taking/
  accepting a challenge (the unified lookup) is explicitly out of scope.
- Existing shared controls for resolution paths, arbitrator entry, and deadlines are
  reused as-is where possible and simply repositioned within the new layout.
- The current dark theme and existing design tokens are sufficient to express the
  payments-style hierarchy; no new color system or "quantum/neon" styling is
  introduced.
- Each create surface can be converted independently and shipped incrementally
  without breaking the others.
