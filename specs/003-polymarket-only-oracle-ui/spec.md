# Feature Specification: Polymarket-Only Oracle Selection (Frontend)

**Feature Branch**: `003-polymarket-only-oracle-ui`
**Created**: 2026-06-06
**Status**: Draft
**Input**: "The app currently supports several oracle models. To reduce complexity for new users and operations teams, hide all except the Polymarket markets in the app frontend for now. Users should only see Polymarket markets when they enter the oracle page and not see any option to select anything else. The smart contracts can remain as-is since the functionality will be turned on later as an additional feature."

## Overview

When a user creates an **oracle-resolved** wager, the app currently offers four
oracle models to choose from: **Polymarket**, **Chainlink Data Feed**, **Chainlink
Functions**, and **UMA Optimistic Oracle**. Three of these add choice and
explanation that most users don't need yet and that generate avoidable support and
operations overhead.

This feature **hides every oracle model except Polymarket across the frontend**: a
user creating an oracle wager (in **both** the 1v1 and **Make an Offer** flows) sees only
the Polymarket path and no option to select any other oracle, and no **landing/
marketing** page or onboarding/dashboard copy names or links Chainlink or UMA. The
on-chain contracts are **unchanged** — the other oracle models remain fully
supported on-chain and can be re-exposed later as an additional feature. The hiding
is reversible via a single configuration switch so re-enabling is a flip, not a
rewrite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Creating an oracle wager shows only Polymarket (Priority: P1)

As someone creating an oracle-settled wager, I want a single, obvious oracle path
(Polymarket) so I'm not asked to choose between models I don't understand.

**Why this priority**: This is the core of the request and the highest-traffic
surface; it directly reduces new-user confusion and the support load.

**Independent Test**: Open the oracle wager-creation flow — in **both** the 1v1 and
the **Make an Offer** paths — and confirm Polymarket is the only oracle model presented
and the only one that can be selected.

**Acceptance Scenarios**:

1. **Given** a user opens the oracle ("auto-settled") wager-creation flow, **When**
   the oracle selection is shown, **Then** Polymarket is the only oracle option
   visible and selected; Chainlink Data Feed, Chainlink Functions, and UMA are not
   shown and cannot be chosen.
2. **Given** the oracle flow with only Polymarket available, **When** the user
   proceeds, **Then** they can pick a Polymarket market and create the wager exactly
   as before (no regression to the Polymarket path).
3. **Given** the selection is reduced to one option, **When** the user views it,
   **Then** there is no leftover empty selector, dead tab, or "choose an oracle"
   prompt implying other choices exist.
4. **Given** the **Make an Offer** creation flow (which shares the oracle selection),
   **When** its settlement/oracle dropdown is shown, **Then** no Chainlink Data Feed,
   Chainlink Functions, or UMA option is present — Polymarket is the only oracle
   settlement offered — and the Make an Offer + Polymarket path still works.

### User Story 2 - Oracle messaging (incl. landing pages) reflects Polymarket-only (Priority: P2)

As a new user reading the app's explanatory, onboarding, and **landing/marketing**
copy, I should not be told that Chainlink or UMA are available, so the messaging
matches what I can actually do.

**Why this priority**: Mismatched copy ("auto-settles from Polymarket, Chainlink or
UMA") and landing-page links to Chainlink/UMA re-introduce the very confusion the
change removes, and erode trust at the first impression.

**Independent Test**: Review the oracle-related descriptions, onboarding content, and
every landing/marketing page; confirm they mention only Polymarket as the available
auto-settlement source and contain no "Chainlink" or "UMA" text/links.

**Acceptance Scenarios**:

1. **Given** the dashboard/oracle descriptions, **When** displayed, **Then** they
   reference Polymarket as the auto-settlement source and do not advertise
   Chainlink or UMA as selectable.
2. **Given** the onboarding/explainer content, **When** a new user reads it, **Then**
   it does not present Chainlink or UMA as available oracle options.
3. **Given** any landing/marketing page (incl. the footer "Oracles" list), **When**
   it renders, **Then** it lists only Polymarket — the words/links "Chainlink" and
   "UMA" are absent.

### User Story 3 - Re-enabling later is a single switch (Priority: P3)

As an operator who will turn these oracle models back on later, I need the hiding to
be controlled by one clearly-named switch so re-enabling does not require hunting
through the UI or risk leaving fragments behind.

**Why this priority**: The request explicitly anticipates re-enabling "at a later
date"; making it a flip avoids a second project and reduces the chance the partial
removal rots.

**Independent Test**: Flip the switch to "all oracles" and confirm Chainlink and UMA
options reappear in the creation flow and copy, with no other change needed.

**Acceptance Scenarios**:

1. **Given** the configuration switch set to "Polymarket only", **When** the app
   runs, **Then** only Polymarket is offered (the default for this feature).
2. **Given** the switch set to "all oracles", **When** the app runs, **Then** the
   full set (Polymarket, Chainlink Data Feed, Chainlink Functions, UMA) is offered
   again — restoring today's behavior.

### Edge Cases

- A wager that was already created with a non-Polymarket oracle model (or arrives
  via a shared link) MUST still **display and resolve correctly** — hiding affects
  *creation/selection*, not viewing or settlement of existing wagers.
- A deep link or saved draft that pre-selects a now-hidden oracle model must fall
  back gracefully (e.g., to the Polymarket path or a clear, non-broken state), not
  show an empty/locked selector.
- No selectable control anywhere in the user creation flow may let a user pick a
  hidden oracle model (no hidden-but-clickable tabs, dropdown entries, or keyboard
  paths).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: In the user-facing oracle wager-creation flow — including **both the
  1v1 and the Make an Offer** paths — the system MUST present **only Polymarket** as the
  oracle model — visible, selected, and the sole selectable oracle option. Chainlink
  Data Feed, Chainlink Functions, and UMA MUST NOT be selectable by any means
  (visible control, hidden control, dropdown entry, or keyboard navigation).
- **FR-002**: When only Polymarket is available, the creation flow MUST present it
  without leftover UI implying other choices exist (no empty oracle selector, dead
  tab strip, or "pick an oracle" step that offers nothing else).
- **FR-003**: The Polymarket creation path MUST continue to work unchanged
  (market search/selection, condition linking, and wager creation).
- **FR-004**: User-facing descriptive, onboarding, **and landing/marketing** copy
  MUST NOT advertise or link Chainlink or UMA while the feature is active. The
  landing footer "Oracles" list MUST show only Polymarket; no landing/marketing page
  may contain the words/links "Chainlink" or "UMA".
- **FR-005**: The set of exposed oracle models MUST be controlled by a single,
  clearly-named configuration switch, defaulting to **Polymarket-only**, and
  restorable to the full set without further code changes.
- **FR-006**: Existing or incoming wagers that use a hidden oracle model MUST still
  display and settle correctly; only **creation/selection** is restricted.
- **FR-007**: The on-chain contracts and their oracle support MUST remain
  unchanged (no contract, ABI, or deployment changes).

### Key Entities

- **Oracle Model (resolution type)**: the auto-settlement source for an oracle
  wager — one of Polymarket, Chainlink Data Feed, Chainlink Functions, UMA. State
  for this feature: `exposed | hidden`. Default: only Polymarket `exposed`.
- **Oracle Exposure Setting**: the single switch governing which oracle models are
  offered in the UI; values `polymarket-only` (default) | `all`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the oracle creation flow — **1v1 and Make an Offer** — **100%** of users
  are offered exactly one oracle model (Polymarket) and **0** paths exist to select
  Chainlink or UMA.
- **SC-002**: The Polymarket creation path (1v1 and Make an Offer) completes successfully
  with **no regression** versus today.
- **SC-003**: No user-facing oracle copy, onboarding, or **landing/marketing** page
  names or links Chainlink or UMA while the feature is active (a text scan of every
  rendered landing/marketing page finds **zero** occurrences).
- **SC-004**: Flipping the exposure setting to `all` restores all four oracle
  models in the UI with **no additional change**, proving reversibility.
- **SC-005**: Wagers using a hidden oracle model still render and resolve correctly
  (no broken/locked states).
- **SC-006**: Zero changes to Solidity, ABIs, or deployments.

## Assumptions

- "The oracle page" = the user-facing flow for creating an **auto-settled / oracle**
  wager (the "Oracle Settles" path and its oracle-model selection), not a separate
  route.
- Smart contracts and on-chain oracle adapters remain deployed and functional; this
  is a **frontend-only** change, reversible via configuration.
- Hiding applies to **creation/selection** and advertising copy; **viewing and
  settlement** of any existing non-Polymarket oracle wager is preserved.
- "Polymarket markets" in the request refers to the Polymarket oracle resolution
  model (linked-market auto-settlement), the model already used in the platform.
- **Scope decided 2026-06-06**: this change applies to the **end-user** surfaces —
  the oracle creation flow (**1v1 and Make an Offer**), the dashboard/onboarding copy,
  and the **landing/marketing pages** (folded in from 004; the landing footer
  "Oracles" list + the Make an Offer dropdown share the same exposure switch). The
  **admin Oracle Adapters tab is out of scope and unchanged** — operations keep full
  visibility/management of all deployed adapters (including the dormant Chainlink/UMA
  ones) so they can operate Polymarket and keep the others warm for the later
  re-enable. The Make an Offer dropdown's oracle options already derive from the same
  exposed-oracle list as the 1v1 flow, so the single switch governs it.

## Out of Scope

- Any change to smart contracts, ABIs, or deployments.
- Removing or disabling the Chainlink/UMA oracle adapters on-chain.
- The **admin Oracle Adapters tab** (operations surface) — left unchanged; ops
  retains full management of all adapters.
- Building the future "additional feature" that re-enables these models for users.
- Changing how Polymarket itself works.
