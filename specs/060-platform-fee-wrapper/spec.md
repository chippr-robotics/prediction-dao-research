# Feature Specification: Configurable Platform Fee Wrapper

**Feature Branch**: `feat/platform-fee-wrapper`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Configurable platform fee wrapper for external service integrations.
Several services FairWins integrates with (or plans to) do not offer native fee-sharing /
revenue-share programs — examples: Morpho lending vaults (Earn, spec 050), Lido staking, Polygon
liquid staking, Uniswap swaps, and other future integrations. For these, FairWins needs its own
configurable fee wrapper that takes a platform fee (set in basis points) on the relevant action and
routes it to the FairWins treasury. Fees are configurable per service from the admin screen,
transparently disclosed to the user with live rates, denominated in bps with hard caps. The two
previously shipped independent fee systems — OpenSea referral (specs 055/056) and Polymarket
builder-code fee (spec 057) — must be brought under this unified fee management. Documentation and
operational runbooks for the fee system must be added."

## User Scenarios & Testing *(mandatory)*

FairWins earns revenue on integrations two ways. Where the external service offers a native
attribution program (OpenSea referral rewards, Polymarket builder codes), FairWins uses it. Where
the service offers nothing (Morpho lending, Lido staking, Polygon liquid staking, Uniswap swaps),
FairWins currently earns nothing. This feature adds FairWins' own **platform fee wrapper**: when a
member enters one of these wrapped services, a small platform fee — set in basis points, capped,
and configured per service by an operator — is taken from the principal at entry and routed to the
FairWins treasury. The member always sees the live fee, in plain terms, before confirming; a
zero-fee service shows no fee line. All platform fees — wrapper fees and the previously shipped
OpenSea/Polymarket programs — become visible and manageable from one **Fees** screen in the
operations control plane.

### User Story 1 - Member sees and pays a transparent platform fee on Earn deposits (Priority: P1)

A member opens Earn → Lend (spec 050) and deposits into a Morpho vault. Before confirming, the
review step shows a clearly labeled "FairWins platform fee" line with the live rate (e.g.
"0.50% · 0.50 USDC") alongside the amount that will actually be deposited (e.g. "99.50 USDC").
The member confirms once; the fee goes to the FairWins treasury and the remainder enters the
vault, all in the same action. If the operator has set the fee to zero, no fee line appears and
the full amount is deposited. The position and activity views reflect the actually-deposited
amount, never silently absorbing the fee.

**Why this priority**: This is the revenue-generating core of the request and the only part that
touches member funds — it must exist (with its disclosure) before anything else matters. Earn is
the one shipped integration without a revenue program today.

**Independent Test**: With a wrapper fee of 50 bps configured for the lending service, deposit
100 USDC into a vault; verify the treasury receives 0.50 USDC, the vault position reflects
99.50 USDC, and the confirm step disclosed both numbers before signing. Repeat with 0 bps and
verify no fee line and a full 100 USDC deposit.

**Acceptance Scenarios**:

1. **Given** a lending fee of 50 bps, **When** a member reviews a 100 USDC vault deposit, **Then**
   the review step shows a "FairWins platform fee" line of 0.50 USDC (0.50%), the net deposit of
   99.50 USDC, and an info bubble explaining the fee — before any signature is requested.
2. **Given** a confirmed deposit with a 50 bps fee, **When** the transaction completes, **Then**
   the treasury has received exactly the disclosed fee and the member's vault position reflects
   exactly the disclosed net amount, in a single member-confirmed action.
3. **Given** a lending fee of 0 bps, **When** a member deposits, **Then** no fee line is shown and
   the full amount is deposited with no fee transfer.
4. **Given** a member who was shown a 50 bps fee, **When** the operator raises the fee before the
   member's transaction executes, **Then** the member is never charged more than the rate they
   were shown — the action either honors the disclosed rate or fails safely and asks them to
   re-review.
5. **Given** a withdrawal of an existing position, **When** the member withdraws, **Then** no
   platform fee is taken (fees apply to principal at entry only).

---

### User Story 2 - Operator manages every platform fee from one screen (Priority: P2)

An operator with the appropriate admin role opens a new **Fees** view in the operations control
plane. It lists every platform-fee system in one table: the wrapper-fee services (lending today;
staking and swaps when they ship), the Polymarket builder fee (spec 057), and the OpenSea referral
(specs 055/056). For each entry the operator sees the service, the fee basis, the live rate in
bps, the hard cap, the treasury/beneficiary destination, and where the fee is enforced. The
operator edits a wrapper fee (e.g. lending 0 → 50 bps) or the Polymarket builder-fee bps within
its existing caps, confirms, and the change takes effect without a redeploy or service restart.
Changes above the hard cap are rejected with a clear error. Every change is attributable (who,
when, old → new).

**Why this priority**: Configurability from the admin screen is the second half of the core
request — without it, fees are hardcoded and the unified management requirement is unmet. It
depends on the fee systems existing (Story 1) but not the reverse.

**Independent Test**: As an admin, open the Fees view, change the lending wrapper fee from 0 to
50 bps and the Polymarket taker fee from 50 to 40 bps; verify both take effect live (next member
quote reflects them) with no redeploy, and that a value above the cap is rejected.

**Acceptance Scenarios**:

1. **Given** an operator with the fee-admin role, **When** they open the Fees view, **Then** they
   see all platform-fee systems — wrapper services, Polymarket builder fee, OpenSea referral —
   with live rates, caps, basis, and destinations in one place.
2. **Given** the Fees view, **When** the operator sets the lending wrapper fee to 50 bps and
   confirms, **Then** the next member deposit quote reflects 50 bps without any redeploy.
3. **Given** the Fees view, **When** the operator attempts to set a wrapper fee above the 250 bps
   hard cap (or a Polymarket fee above its spec-057 caps), **Then** the change is rejected with a
   clear message and the prior rate remains in force.
4. **Given** a completed fee change, **When** anyone reviews the change history, **Then** the
   change shows who made it, when, and the old and new values.
5. **Given** an operator without the fee-admin role, **When** they open the control plane,
   **Then** the Fees view is either hidden or read-only for them and every change path is denied.

---

### User Story 3 - Unified fee disclosure across existing surfaces (Priority: P3)

The Polymarket builder fee (Predict) and the OpenSea referral (Collect) join the unified system
without changing what members were promised. Predict's confirm UI keeps its honest builder-fee
line but now reads the live rate from the same fee management the admin edits — an admin change
to the Polymarket bps is reflected in the next order's disclosure. Collect continues to disclose
that its referral costs the member nothing. Anywhere a platform fee applies, the disclosure
pattern is the same: a named fee line, the live rate, the absolute amount, and an info bubble —
never hidden, never stale.

**Why this priority**: Valuable consistency and honesty win, but both surfaces already disclose
correctly today with static config; this story re-points them at the unified source.

**Independent Test**: Change the Polymarket taker-fee bps in the Fees view; verify the Predict
confirm UI shows the new rate on the next order without a frontend or gateway redeploy, and that
Collect's disclosure still shows the no-cost referral.

**Acceptance Scenarios**:

1. **Given** the Polymarket taker fee is changed from 50 to 40 bps in the Fees view, **When** a
   member reviews their next Predict order, **Then** the fee line shows 0.40% and the charged fee
   matches the disclosure.
2. **Given** any surface with a platform fee, **When** a member reaches the final confirm step,
   **Then** the fee appears as its own named line with rate and amount, with an info bubble, and a
   zero fee shows either no line or an explicit "no fee" — never a hidden charge.
3. **Given** the fee management source is unreachable, **When** a member reaches a fee-bearing
   confirm step, **Then** the flow either uses a safe, honestly-labeled known rate or blocks the
   action — it never proceeds while displaying a rate that may understate the charge.

---

### User Story 4 - Future integrations plug into the wrapper, and operators can run it (Priority: P4)

Lido staking, Polygon liquid staking, Uniswap swaps, and other future integrations adopt the same
wrapper: each new service is registered with its own fee entry (0..cap bps), inherits the same
admin management, member disclosure pattern, and treasury routing, without redesigning fees each
time. Developer documentation explains how to wire a new service in; an operations runbook covers
setting/adjusting fees, verifying treasury receipts, the change history, emergency zeroing of a
fee, and what to check when disclosures and charges disagree.

**Why this priority**: This is the "wrapper is a platform primitive" payoff and the documentation
requirement — necessary for the stated future services, but nothing member-facing ships in this
story beyond the docs.

**Independent Test**: Following only the developer guide, register a hypothetical new service in a
test environment with a 25 bps fee; verify it appears in the Fees admin view and produces correct
quotes. Verify the runbook's fee-change and emergency-zero procedures work as written.

**Acceptance Scenarios**:

1. **Given** the developer guide, **When** a developer registers a new wrapped service, **Then**
   it appears in the Fees view with its own rate, cap, and destination, and member disclosure
   works with no fee-system code changes.
2. **Given** the runbook, **When** an operator follows the emergency procedure to zero a fee,
   **Then** the fee is 0 for all subsequent member actions and the change is recorded.
3. **Given** the documentation site, **When** a member looks up platform fees, **Then** a plain-
   language page explains what fees FairWins charges, where they appear, and that rates are always
   shown before confirming.

---

### Edge Cases

- Fee rounding: a fee computed on a tiny principal rounds to zero in the asset's smallest unit —
  the deposit proceeds with a zero fee (never over-charges, never blocks).
- Rate change in flight: an admin changes the fee between the member's quote and execution — the
  member pays at most the disclosed rate (Story 1, scenario 4).
- Treasury destination unset or invalid for a network — fee-bearing actions on that network must
  not send funds to a dead address: the fee falls back to zero (with the discrepancy surfaced to
  operators) or the action is blocked; funds are never lost.
- The service the wrapper fronts fails after the fee leg (e.g. vault deposit reverts) — the
  member's whole action reverts atomically; the treasury must not keep a fee for an action that
  did not happen.
- Fee config source unreachable on a member surface — disclosure never silently shows a stale
  lower rate while a higher one is charged (Story 3, scenario 3).
- Two operators edit the same fee concurrently — last write wins, both changes appear in history;
  no state where cap enforcement is bypassed.
- A network where the wrapper is not yet deployed — member surfaces behave as today (no fee, no
  fee line); the admin view shows the service as not available on that network rather than
  implying a fee is active.
- Non-member or sanctioned wallet attempts a wrapped action — existing eligibility rules (spec
  050 and platform screening) are unchanged by the fee wrapper; the fee never bypasses them.

## Requirements *(mandatory)*

### Functional Requirements

**Wrapper fee on member actions**

- **FR-001**: The system MUST be able to charge a FairWins platform fee, denominated in basis
  points of the principal, at entry into a wrapped external service, routing the fee to the
  FairWins treasury and the remainder into the external service in a single member-confirmed
  action.
- **FR-002**: Fees MUST apply to principal at entry only. Exits (withdrawals, unstaking, claim of
  rewards) MUST NOT incur a platform fee in this feature.
- **FR-003**: The fee-and-forward action MUST be atomic: if the external-service leg fails, the
  entire action (including the fee transfer) reverts; the treasury never retains a fee for an
  action that did not complete.
- **FR-004**: Each wrapped service MUST have its own independently configurable rate from 0 bps up
  to a hard cap of **250 bps**, enforced at the point where the fee is charged (not only in the
  admin UI). A configured rate of 0 MUST result in no fee transfer at all.
- **FR-005**: A member MUST never be charged a higher rate than the one disclosed to them at
  confirmation time, even if an operator raises the rate while their action is in flight; the
  action either honors the disclosed rate or fails safely.
- **FR-006**: Fee amounts MUST round in the member's favor (round down) in the asset's smallest
  unit; a fee that rounds to zero is charged as zero.
- **FR-007**: In this feature, the wrapper MUST be wired into the existing Earn lending flow
  (spec 050 vault deposits) as its first consumer. Lido staking, Polygon liquid staking, and
  Uniswap swaps are explicitly out of scope to build, but the wrapper MUST NOT assume anything
  lending-specific that would prevent those services from registering later with only
  configuration and service-specific glue.
- **FR-008**: The wrapper MUST NOT weaken existing eligibility and screening rules on wrapped
  actions (membership roles, sanctions screening, network scoping); it composes with them,
  never bypasses them.

**Unified fee management (admin)**

- **FR-009**: The operations control plane MUST gain a Fees view listing every platform-fee
  system — wrapper services, the Polymarket builder fee (spec 057), and the OpenSea referral
  (specs 055/056) — showing for each: service, fee basis, live rate in bps, hard cap, beneficiary/
  treasury destination, enforcement point, and per-network availability.
- **FR-010**: Operators with the fee-admin capability MUST be able to change wrapper-service rates
  and the Polymarket builder-fee rates (within the spec-057 caps of 100 bps taker / 50 bps maker)
  from the Fees view, with changes taking effect for subsequent member actions without a redeploy
  or restart. The OpenSea referral has no rate (no-cost program); its beneficiary and status are
  displayed, and its beneficiary MAY remain deployment-managed.
- **FR-011**: Fee changes MUST be restricted to an explicit fee-admin capability; viewing MAY be
  granted more broadly. Unauthorized change attempts MUST be denied at the enforcement layer, not
  merely hidden in the UI.
- **FR-012**: Every fee change MUST be recorded and reviewable: actor, timestamp, service,
  old value, new value. Attempts to exceed a hard cap MUST be rejected with a clear error and
  MUST NOT alter the effective rate.
- **FR-013**: The treasury/beneficiary destination for wrapper fees MUST be configurable per
  network by the same admin capability, with validation that prevents routing fees to an obviously
  invalid destination (unset, zero, or malformed). Networks with no valid destination MUST charge
  no fee rather than lose funds.

**Member transparency**

- **FR-014**: Every fee-bearing confirm step MUST disclose, before any signature: a named
  "FairWins platform fee" (or equivalent) line, the live rate (percent), the absolute fee amount
  in the asset, and the net amount reaching the external service, with a plain-language info
  bubble. Zero-fee actions show no fee line (or an explicit "no fee") and MUST NOT show a fee.
- **FR-015**: Disclosed rates MUST be live: sourced from the same configuration the admin edits,
  such that an admin change is reflected in the next quote on every surface (Earn, Predict)
  without redeploying. If the live rate cannot be obtained, the surface MUST NOT proceed on a
  possibly-understated rate (block, or use a rate that is provably an upper bound and label it).
- **FR-016**: The Predict builder-fee disclosure (spec 057) and Collect referral disclosure
  (spec 056) MUST be preserved in meaning and prominence while re-pointing at the unified fee
  source; existing promises to members (e.g. Collect referral costs the member nothing) MUST NOT
  change.
- **FR-017**: The public documentation site MUST gain a plain-language page describing FairWins
  platform fees: which surfaces have them, how rates are shown, and the caps.

**Documentation & operations**

- **FR-018**: A developer guide MUST document the fee system end to end: architecture, how fees
  are charged and capped, how disclosure works, and the exact steps to register a future service
  (e.g. Lido, Polygon liquid staking, Uniswap) with the wrapper.
- **FR-019**: An operations runbook MUST cover: viewing current fees, changing a fee (including
  verification steps), changing the treasury destination, emergency-zeroing a fee, reconciling
  treasury receipts against expected fees, and diagnosing disclosure/charge mismatches.
- **FR-020**: Fee totals MUST be observable by operators: for wrapper fees, the treasury
  destination's receipts per service are verifiable from recorded events/records sufficient for
  the runbook's reconciliation procedure.

### Key Entities

- **Fee Service (wrapped service)**: An external integration fronted by the wrapper — lending
  (Morpho, first consumer), later staking and swaps. Attributes: identifier, display name, fee
  basis (principal-at-entry), rate (bps), hard cap (250 bps), per-network availability, treasury
  destination.
- **Fee Schedule / Rate**: The live bps value for one service (and, for Polymarket, the
  taker/maker pair with spec-057 caps). Editable by fee-admins; readable by all member surfaces.
- **Fee Change Record**: An attributable history entry — actor, time, service, old → new value.
- **Treasury Destination**: The per-network FairWins account receiving wrapper fees.
- **Fee Disclosure (quote)**: What the member sees at confirm time — rate, absolute fee, net
  amount — and the ceiling the member actually consents to (FR-005).
- **Attribution Programs (existing)**: Polymarket builder fee (real member cost, editable bps)
  and OpenSea referral (no member cost, display/status) — managed and displayed alongside wrapper
  fees.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a nonzero lending fee configured, 100% of completed Earn deposits transfer
  exactly the disclosed fee to the treasury and exactly the disclosed net amount into the vault
  (verified across the test matrix including rounding edge cases).
- **SC-002**: 100% of fee-bearing confirm flows show the fee line (rate, amount, net) before any
  signature; zero-fee flows never show a fee. Verified by automated UI tests on Earn and Predict.
- **SC-003**: An operator can view every platform-fee system and change any editable rate from
  one screen in under 2 minutes, with the new rate live on member surfaces in under 1 minute,
  with no redeploy.
- **SC-004**: No member action can ever be charged above the disclosed rate or above the hard cap
  — attempts are rejected in tests at both the admin layer and the enforcement layer.
- **SC-005**: A developer following only the guide can register a new test service with a fee and
  see it correctly quoted and managed, without modifying the fee system itself.
- **SC-006**: 100% of fee changes appear in the reviewable history with actor, time, and
  old → new values.

## Assumptions

- **Fee basis**: Confirmed by the requester — fees are charged on principal at entry (deposit /
  stake / swap input amount), not on yield or at exit.
- **Hard cap**: Confirmed by the requester — 250 bps (2.5%) for wrapper services. Polymarket
  builder-fee caps stay as shipped in spec 057 (100 taker / 50 maker) since they are enforced by
  that integration's own rules.
- **Legacy systems become editable**: Confirmed by the requester — Polymarket builder-fee bps
  move from deploy-time-only settings to live admin-editable configuration (within caps). The
  OpenSea referral has no rate to edit; it is displayed in the unified view.
- **Scope of consumers**: Confirmed by the requester — this feature builds the framework and
  wires it into the existing Earn/Morpho lending flow only. Lido, Polygon liquid staking, and
  Uniswap adopt the wrapper in their own future specs.
- **Treasury**: Wrapper fees route to a FairWins-controlled treasury destination configured per
  network, consistent with the existing deployments-as-source-of-truth practice; this feature
  does not introduce treasury governance changes.
- **Who administers fees**: Fee administration is an operator capability in the existing
  operations control plane role model; this feature adds a fee-admin capability rather than a new
  admin surface.
- **Earn UX baseline**: Spec 050's Earn flow (deposit review step, info bubbles, activity views)
  exists and is the surface this feature extends; Earn's current behavior with no fee configured
  is unchanged.
- **No retroactive fees**: Existing positions entered before a fee is configured are never
  charged retroactively; fees apply only to new entries after the rate is set.
