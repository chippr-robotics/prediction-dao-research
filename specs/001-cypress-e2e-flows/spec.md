# Feature Specification: Cypress End-to-End Test Flow Coverage

**Feature Branch**: `001-cypress-e2e-flows`

**Created**: 2026-06-05

**Status**: Draft

**Input**: Replace the placeholder/stub Cypress "full" E2E specs with real assertions of the critical FairWins v2 wager user flows, delete the obsolete challenge/dispute spec, and make `npm run test:e2e:full` a trustworthy pre-launch gate.

## Overview

The FairWins v2 wager platform is preparing to go live on Polygon mainnet with real funds. The frontend Cypress "full" end-to-end suite is meant to be the confidence gate that the critical user journeys work before real users transact. Today, several of its specs are placeholders: their only assertion is that a page rendered, so they pass while proving nothing. This feature replaces those stubs with assertions that actually exercise each user flow, removes a spec for a feature that no longer exists, and leaves the suite as a meaningful signal of launch-readiness.

The "user" for this feature is the team relying on the E2E suite to catch regressions in the money-handling flows; the *journeys under test* are the real end-user wager journeys.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paused-protocol safety is verified (Priority: P1)

When the protocol is paused, the app must stop new wagers from being created or accepted, while still allowing money already in escrow to settle, be claimed, or be refunded. This is the emergency brake; it must be proven to behave correctly.

**Why this priority**: Pause is the primary incident-response control for a live, funded contract. A regression that either fails to block new activity, or wrongly blocks settlement of in-flight funds, is the highest-severity launch risk.

**Independent Test**: Drive the app with the protocol in a paused state and assert create/accept are blocked with a clear message, while a pre-existing active wager can still be resolved/claimed/refunded.

**Acceptance Scenarios**:

1. **Given** the protocol is paused, **When** a user attempts to create a wager, **Then** creation is blocked and the UI explains the protocol is paused.
2. **Given** the protocol is paused, **When** the invited opponent attempts to accept an open wager, **Then** acceptance is blocked with a paused-state message.
3. **Given** the protocol is paused and a wager is already active, **When** the resolver settles it and the winner claims, **Then** settlement and claim succeed (settlement is not pause-gated).
4. **Given** the protocol is later unpaused, **When** a user creates a wager, **Then** creation succeeds again.

---

### User Story 2 - Frozen-account restrictions are verified (Priority: P1)

A frozen account must be unable to create, accept, resolve, or claim, and must regain all of those abilities once unfrozen. Moderation must not be bypassable and must not permanently trap funds.

**Why this priority**: Account freezing is a safety/compliance control on a funded platform. If a frozen account can still move funds — or if unfreezing fails to restore access — the control is broken in a way that directly affects user money.

**Independent Test**: Freeze an account and assert each money-affecting action is blocked with a frozen-state message; unfreeze and assert the same actions succeed.

**Acceptance Scenarios**:

1. **Given** an account is frozen, **When** it attempts to create or accept a wager, **Then** the action is blocked and the UI indicates the account is frozen.
2. **Given** a frozen account is the winner of a resolved wager, **When** it attempts to claim the payout, **Then** the claim is blocked.
3. **Given** the account is unfrozen, **When** it retries the previously-blocked action, **Then** the action succeeds.

---

### User Story 3 - Timeout refunds are verified (Priority: P2)

If an invited opponent never accepts, the creator must be refundable after the acceptance deadline. If an oracle-resolved wager is accepted but never resolves, both parties must be refundable after the resolution deadline. No funds may be stranded by inaction.

**Why this priority**: Refund-on-timeout is the guarantee that funds are never permanently stuck. It is critical, but slightly lower than pause/freeze because it is a passive safety net rather than an active control surface.

**Independent Test**: Advance time past each deadline in the relevant wager state and assert the correct party/parties can reclaim the correct amounts, and that refunds are blocked before the deadline.

**Acceptance Scenarios**:

1. **Given** an open wager whose acceptance deadline has passed with no acceptance, **When** the creator requests a refund, **Then** the creator's full stake is returned and the wager shows refunded.
2. **Given** an active oracle-resolved wager whose resolution deadline has passed with no resolution, **When** a refund is triggered, **Then** both parties receive their original stakes back.
3. **Given** a wager whose deadline has NOT yet passed, **When** a refund is attempted, **Then** it is blocked as not-yet-refundable.

---

### User Story 4 - Oracle auto-resolution outcomes are verified (Priority: P2)

For oracle-resolved wagers (Polymarket, Chainlink, UMA), once the external source resolves, anyone may trigger settlement and the correct party must win based on the outcome and the creator's chosen side. A 50/50 Polymarket tie must refund both parties rather than pay a fixed side.

**Why this priority**: Oracle resolution is how a large class of wagers settles. The tie-refund behavior in particular was a recently fixed correctness bug; locking it in with an end-to-end assertion prevents regression of a real-funds payout error.

**Independent Test**: Resolve a mocked oracle condition to each outcome (and to a tie for Polymarket) and assert the resulting winner/refund and payout are correct end-to-end through the UI.

**Acceptance Scenarios**:

1. **Given** an accepted Polymarket wager where the creator chose YES, **When** the market resolves YES and settlement is triggered, **Then** the creator is the winner and can claim the full pot.
2. **Given** an accepted Polymarket wager, **When** the market resolves to a 50/50 tie, **Then** the wager does not pay a fixed side and both parties are refunded after the resolution deadline.
3. **Given** an accepted Chainlink- or UMA-resolved wager, **When** the source resolves, **Then** the correct party is settled as winner.

---

### User Story 5 - Expired-membership gating is verified (Priority: P3)

A user whose membership has expired must be blocked from creating new wagers until they renew, with the UI guiding them to renew. Membership is the gate on wager creation.

**Why this priority**: Important for correctness of the access model, but lower risk than the money-safety flows because it gates entry rather than handling escrowed funds.

**Independent Test**: Place a user in an expired-membership state and assert wager creation is blocked with a renewal prompt, then renew and assert creation succeeds.

**Acceptance Scenarios**:

1. **Given** a user with an expired membership, **When** they attempt to create a wager, **Then** creation is blocked and the UI prompts renewal.
2. **Given** the user renews their membership, **When** they retry creation, **Then** it succeeds.

---

### User Story 6 - Admin panel controls are verified (Priority: P3)

An administrator must be able to configure membership tiers, grant/revoke memberships, freeze/unfreeze accounts, and withdraw accrued fees — with the withdrawal recipient defaulting to the configured treasury. Non-admins must not see or use these controls.

**Why this priority**: The admin panel operates the platform's controls, but it is operated by trusted internal users, so a UI regression here is lower user-facing risk than the participant money flows.

**Independent Test**: As an admin, assert each control performs its action and reflects the result; as a non-admin, assert the controls are not accessible.

**Acceptance Scenarios**:

1. **Given** an admin user, **When** they open the admin panel, **Then** tier-config, membership grant/revoke, freeze/unfreeze, and treasury withdrawal controls are available.
2. **Given** an admin opening the treasury withdrawal control, **When** the form loads, **Then** the recipient defaults to the configured treasury address.
3. **Given** a non-admin user, **When** they reach the admin area, **Then** the controls are hidden or access is denied.

---

### Edge Cases

- A spec covering a removed feature (the challenge/dispute path: `resolveDispute`, arbitrator re-resolution, the 24-hour challenge window) must be removed entirely rather than left passing on a stub, because the feature no longer exists and `declareWinner` is final.
- A refund attempted by a non-participant third party on a legitimately-expired wager should still route funds to the correct original parties (refunds are recipient-fixed, not caller-paid).
- A stub left in place (page-render-only assertion) must be treated as a failure of this feature, since it provides false confidence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The E2E suite MUST assert paused-protocol behavior: new creation and acceptance are blocked while in-flight settlement, claim, and refund remain available; and creation works again after unpause.
- **FR-002**: The E2E suite MUST assert frozen-account behavior: create/accept/resolve/claim are blocked while frozen and restored after unfreeze.
- **FR-003**: The E2E suite MUST assert accept-timeout refund (creator made whole) and oracle-resolve-timeout refund (both parties made whole), and that refunds are blocked before the deadline.
- **FR-004**: The E2E suite MUST assert oracle auto-resolution selects the correct winner for Polymarket/Chainlink/UMA, and that a 50/50 Polymarket tie refunds both parties.
- **FR-005**: The E2E suite MUST assert expired-membership blocks creation until renewal.
- **FR-006**: The E2E suite MUST assert admin-panel controls (tier config, grant/revoke membership, freeze/unfreeze, treasury withdrawal defaulting to the configured treasury) for admins, and inaccessibility for non-admins.
- **FR-007**: The obsolete challenge/dispute spec MUST be removed from the suite.
- **FR-008**: Every spec listed above MUST contain meaningful assertions of its flow; a spec whose only assertion is that a page rendered MUST NOT count as covered.
- **FR-009**: The full E2E command MUST pass with the implemented specs (no regressions to the already-substantive specs).

### Key Entities

- **Wager**: an escrowed bet between a creator and an opponent, with a resolution method, an acceptance deadline, and a resolution deadline; transitions Open → Active → Resolved/Refunded.
- **Membership**: a time-bounded entitlement that gates wager creation; can be active, expired, granted, or revoked.
- **Account moderation state**: whether an account is frozen (blocked from money-affecting actions) or normal.
- **Protocol state**: whether the protocol is paused (new activity blocked) or active.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running the full end-to-end suite passes with zero failing specs.
- **SC-002**: Zero specs in the "full" suite assert only that a page rendered; every previously-stubbed target spec asserts its actual user flow.
- **SC-003**: All six prioritized flows (paused-protocol, frozen-accounts, refund-timeout, oracle-resolution, expired-membership, admin-panel) have at least one passing assertion per acceptance scenario listed above.
- **SC-004**: The obsolete challenge/dispute spec is absent from the suite, and no remaining spec references the removed dispute/challenge feature.
- **SC-005**: A reviewer can read each target spec and identify which user flow and outcomes it verifies without running it.

## Assumptions

- The E2E suite runs the UI against a mocked web3 provider (the established `cy.mockWeb3Provider` pattern used by the existing substantive specs); converting the suite to run against a real chain is out of scope.
- The substantive specs that already contain real assertions (membership, wager-creation, acceptance, decline/cancel, manual resolution, claim payouts) are correct and out of scope except where shared helpers are extended.
- The mock provider can be driven into the required states (paused, frozen, expired membership, each oracle outcome including a Polymarket tie, admin vs non-admin) — extending shared Cypress commands/fixtures to express these states is in scope.
- The contract behaviors these flows assert are already covered at the contract level (hardhat unit + integration), so this feature focuses on the UI-through-flow behavior, not re-proving contract math.
