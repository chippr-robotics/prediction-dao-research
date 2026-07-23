# Feature Specification: Staking Admin Controls & Emergency Pause

**Feature Branch**: `066-staking-admin-controls`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "We need adequate control surfaces for administrative tasks necessary to
manage staking activities. This includes contract-address management and the lifecycle events an
operator would need to manage a change in service, and the ability to pause staking on a network in an
emergency."

## User Scenarios & Testing *(mandatory)*

Staking (spec 065) ships with its provider addresses and curated validator allowlist baked into the
app at build time, and with no way to turn staking off short of shipping a new app build. That is fine
for launch but leaves operators without the levers a production financial service needs: when a
provider migrates a contract, when a validator must be swapped out, or when something goes wrong and
staking must be stopped *now*, the only recourse today is a code change and a redeploy — too slow for
an incident and invisible in any audit trail.

This feature gives operators a proper **control surface** for staking. An authorized operator can,
from the app's admin area, review and update the staking provider addresses for a network, curate the
validator allowlist (add, remove, or replace a validator as part of a planned service change), and —
critically — **pause staking on a network in an emergency** so the member experience stops offering it
honestly, all taking effect at runtime without an app redeploy and all recorded as an auditable
history of who changed what and when. Members are never left confused: a paused or misconfigured
network shows the same honest "not available right now" state the app already uses, never a broken or
dishonest surface.

### User Story 1 - Emergency pause and resume of staking (Priority: P1)

An authorized emergency responder needs to stop staking on a network immediately — a provider exploit
is suspected, a validator is misbehaving, or a contract address is in doubt. From the admin area they
open the Staking controls, select the network, and pause staking. Within moments the member-facing
Stake area on that network stops offering new stakes and shows the honest unavailable state; existing
positions and the ability to unstake/withdraw are unaffected (members must always be able to get their
funds back). When the incident is resolved, the responder resumes staking and the area returns to
normal. Both actions are recorded with the actor and time.

**Why this priority**: This is the core safety lever and the most time-critical capability — the whole
point of a control surface is to act faster than a redeploy in an incident. It is independently
valuable even before richer config management exists.

**Independent Test**: With an authorized responder account, pause staking on a supported network and
confirm the member Stake area on that network stops offering new stakes and shows the unavailable
state while unstake/withdraw still work; resume and confirm staking is offered again; verify both
actions appear in the audit history.

**Acceptance Scenarios**:

1. **Given** an authorized responder, **When** they pause staking on a network, **Then** the
   member-facing Stake area for that network stops offering new stakes and shows the honest
   unavailable state within one refresh, without an app redeploy.
2. **Given** staking is paused on a network, **When** a member with an existing position opens
   staking, **Then** they can still unstake and withdraw (funds are never trapped by a pause).
3. **Given** staking is paused, **When** the responder resumes it, **Then** new stakes are offered
   again on that network.
4. **Given** a pause or resume is performed, **When** anyone reviews the staking audit history,
   **Then** the action, the acting operator, the affected network, and the time are recorded.
5. **Given** the control surface is unreachable or not yet deployed on a network, **When** a member
   opens staking there, **Then** the app falls back safely to its honest default (staking availability
   as configured) and never shows a broken screen.

---

### User Story 2 - Manage staking provider addresses per network (Priority: P2)

A provider migrates a contract, or a new network is being brought online, and an operator must update
the addresses the staking flows use. From the Staking controls the operator sees the current provider
addresses for the selected network (the liquid-staking contracts, the delegation manager, the staking
token), each shown next to its current value, updates the ones that changed, and confirms. The
member-facing staking flows begin using the new addresses at runtime. Every address change is recorded
with the actor, the old and new value, and the time.

**Why this priority**: Address management is the routine operational need behind "a change in
service." It is less time-critical than the emergency pause but is what makes the service maintainable
without redeploys. It builds on the same control surface as US1.

**Independent Test**: As an authorized operator, change a staking provider address for a network,
confirm the member staking flow resolves the new address, and verify the change (old → new, actor,
time) is in the audit history.

**Acceptance Scenarios**:

1. **Given** an authorized operator, **When** they view the Staking controls for a network, **Then**
   each managed provider address is shown with its current value.
2. **Given** the operator updates a provider address and confirms, **When** a member next uses
   staking on that network, **Then** the flow uses the updated address.
3. **Given** an operator submits an obviously invalid address (malformed, or empty where one is
   required), **When** they confirm, **Then** the change is rejected with a clear reason before it
   takes effect.
4. **Given** an address change is made, **When** the audit history is reviewed, **Then** the change
   records the field, old value, new value, actor, and time.

---

### User Story 3 - Curate the validator allowlist as a service-lifecycle activity (Priority: P2)

The curated delegation validator set must change over time — a validator raises its commission beyond
policy, is jailed, or is replaced by a better-performing operator. An authorized operator opens the
validator allowlist for the network, sees the current curated validators, and adds, removes, or
replaces an entry. Removing a validator stops it being offered for **new** delegations immediately;
members already delegated to it can still see the position and unstake/withdraw. The change is
recorded in the audit history.

**Why this priority**: Validator curation is the other half of "managing a change in service." It is
delegated-staking-specific and builds on the same controls; it is independently testable once the
control surface exists.

**Independent Test**: As an authorized operator, remove a validator from the allowlist and confirm it
is no longer offered for new delegations in the member Stake area, while a member already delegated to
it can still unstake; add a validator and confirm it appears; verify both changes are in the audit
history.

**Acceptance Scenarios**:

1. **Given** an authorized operator, **When** they open the validator allowlist, **Then** the current
   curated validators for the network are listed.
2. **Given** the operator removes a validator, **When** a member opens the Stake area, **Then** that
   validator is no longer offered for new delegations, but a member already delegated to it can still
   unstake and withdraw.
3. **Given** the operator adds a validator, **When** a member opens the Stake area, **Then** the new
   validator is offered (subject to the same curation/decoration rules as the rest).
4. **Given** the operator attempts to add a duplicate or malformed validator entry, **When** they
   confirm, **Then** the change is rejected with a clear reason.
5. **Given** any allowlist change, **When** the audit history is reviewed, **Then** it records the
   validator, the action (add/remove/replace), the actor, and the time.

---

### User Story 4 - Least-privilege operator access and audit (Priority: P3)

Not everyone may touch staking controls. Configuration changes (addresses, allowlist) require a
staking-configuration operator; the emergency pause/resume may be exercised by the broader emergency
role so an incident responder can act even without configuration rights. Unauthorized accounts do not
see the controls at all, and no privileged action can be taken without the appropriate authorization.
The full history of staking control actions is reviewable so changes are accountable.

**Why this priority**: Access separation and auditability are essential for a financial control
surface but layer onto the functional stories above; they are testable once the controls and roles
exist.

**Independent Test**: Confirm an account without any staking-operator authorization sees no staking
controls and cannot perform any control action; confirm the configuration role can change
addresses/allowlist; confirm the emergency role can pause/resume; confirm every action is attributable
in the audit history.

**Acceptance Scenarios**:

1. **Given** an account with no staking-operator authorization, **When** they open the admin area,
   **Then** the Staking controls are not shown and no staking control action is possible.
2. **Given** an account with only the emergency authorization, **When** they open the Staking
   controls, **Then** they can pause/resume but cannot change addresses or the allowlist.
3. **Given** an account with the staking-configuration authorization, **When** they open the Staking
   controls, **Then** they can change addresses and the allowlist.
4. **Given** any staking control action by any operator, **When** the audit history is reviewed,
   **Then** the action is attributable to the acting operator with a timestamp.

---

### Edge Cases

- **Pause never traps funds**: a pause blocks only *new* stakes/delegations; unstake, withdraw, and
  reward-claim remain available so members can always exit (US1 scenario 2).
- **Control surface undeployed/unreachable**: when the control surface is not deployed on a network or
  cannot be read, the member app falls back to its honest default availability and never shows a
  broken screen; operators see a clear "not available on this network" state instead of failing writes.
- **Config vs. pause divergence**: pausing does not erase configuration; resuming restores the
  previously-configured addresses/allowlist unchanged.
- **Removing an in-use validator**: a validator removed from the allowlist while members are delegated
  to it disappears from *new*-delegation options but remains visible/exitable for existing positions.
- **Invalid or dangerous input**: malformed addresses, empty required fields, duplicate validator
  entries, or a validator identifier that doesn't resolve are rejected before taking effect.
- **Stale reads**: the member app reflects a control change within a bounded refresh window; the UI
  communicates availability as "as of" its last read rather than implying instantaneous global state.
- **Per-network isolation**: pausing or reconfiguring one network never affects another; controls and
  audit history are scoped per network.
- **Concurrent operators**: two operators editing at once resolve to a consistent last-writer state
  with both actions recorded; no silent lost update without a trace in the history.
- **Emergency reachability**: the pause must be exercisable even when non-essential services are
  degraded, so it does not depend on optional infrastructure being healthy.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an authorized operator a control surface, within the app's admin
  area, to review and manage staking configuration and availability per network, without requiring an
  app redeploy for changes to take effect.
- **FR-002**: Operators MUST be able to **pause** and **resume** staking per network; while paused,
  the member-facing staking experience on that network MUST stop offering new stakes/delegations and
  show the app's honest unavailable state, taking effect within one member refresh.
- **FR-003**: A pause MUST NOT prevent members from unstaking, withdrawing, or claiming rewards on
  existing positions — members can always exit; only new stakes/delegations are blocked.
- **FR-004**: Operators MUST be able to view and update the staking provider contract addresses used
  by the staking flows for a network (the liquid-staking contracts, the delegation manager, and the
  staking token), with the current value shown for each and obviously-invalid input rejected before it
  takes effect.
- **FR-005**: Operators MUST be able to curate the delegation validator allowlist per network — add,
  remove, or replace a validator — with duplicates and malformed/unresolvable entries rejected;
  removing a validator MUST stop it being offered for new delegations while leaving existing positions
  visible and exitable.
- **FR-006**: The member-facing staking experience MUST source its provider addresses, validator
  allowlist, and availability from the managed control surface at runtime, and MUST fall back safely to
  an honest default (and never a broken screen) when the control surface is undeployed or unreachable
  on a network.
- **FR-007**: Every staking control action (pause, resume, address change, allowlist add/remove/
  replace) MUST be recorded in an auditable history that captures the action, the affected network, the
  before/after value where applicable, the acting operator, and the time.
- **FR-008**: Access MUST be least-privilege: configuration changes (addresses, allowlist) require a
  staking-configuration authorization; the emergency pause/resume may be exercised by the emergency/
  guardian authorization; accounts without any staking-operator authorization MUST NOT see the
  controls or be able to perform any control action.
- **FR-009**: All staking control state and history MUST be scoped per network; an action on one
  network MUST NOT affect another, and the member app MUST NOT mix control state across the
  testnet/mainnet boundary.
- **FR-010**: The emergency pause MUST remain exercisable when non-essential/optional services are
  degraded — it MUST NOT depend on optional infrastructure being healthy to stop staking.
- **FR-011**: The control surface MUST surface meaningful operator feedback: current values, a clear
  reason on rejected input, confirmation of a completed change, and the change history — so an operator
  can see the effect of their action without guesswork.
- **FR-012**: Member-facing availability driven by the control surface MUST be presented honestly as
  "as of" its last read, and a paused or unavailable network MUST reuse the existing honest
  unavailable-state pattern rather than a bespoke or dishonest surface.
- **FR-013**: Operator documentation MUST describe the staking control surface — how to pause/resume,
  change addresses, curate validators, who is authorized, and how the audit history works — including
  the emergency runbook for pausing in an incident.

### Key Entities *(include if feature involves data)*

- **Staking Control Configuration**: the managed, per-network staking settings — provider contract
  addresses, the curated validator allowlist, and the staking-enabled/paused state — that the member
  app reads at runtime. Attributes: network, provider addresses, validator allowlist entries, paused
  flag, last-updated time.
- **Validator Allowlist Entry**: one curated delegation target under management. Attributes: network,
  validator identifier, validator contract reference, listing status (listed/removed).
- **Staking Control Action (Audit Record)**: an accountable record of an operator action. Attributes:
  type (pause/resume/address-change/allowlist-add/remove/replace), network, field + before/after value
  where applicable, acting operator, timestamp.
- **Staking Operator Authorization**: the permission that gates control actions. Attributes: operator
  account, authorization kind (staking-configuration vs. emergency/guardian), network scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized responder can pause staking on a network and have the member Stake area
  stop offering new stakes within one member refresh, with **no** app redeploy.
- **SC-002**: While staking is paused on a network, 100% of members with existing positions can still
  reach unstake/withdraw/claim — a pause never blocks an exit.
- **SC-003**: 100% of staking control actions (pause, resume, address change, allowlist change) appear
  in the audit history attributable to the acting operator with a timestamp.
- **SC-004**: An operator can complete a provider-address change or a validator add/remove and see it
  reflected in the member Stake area within one refresh, without a redeploy.
- **SC-005**: 0 accounts without staking-operator authorization can view or perform any staking control
  action; configuration and emergency authorizations grant exactly their intended actions and no more.
- **SC-006**: On a network where the control surface is undeployed or unreachable, 0 members see a
  broken staking screen — the app falls back to its honest default availability.
- **SC-007**: Control state and audit history are correctly isolated per network in 100% of cases (no
  cross-network or cross-testnet/mainnet leakage).
- **SC-008**: Operator documentation exists and lets a new operator perform an emergency pause by
  following the runbook, unaided, on their first attempt.

## Assumptions

- **Authoritative, on-chain control surface**: per the product decision, staking configuration and the
  pause switch are held in an authoritative, auditable, on-chain control surface (one per network),
  read by the member app at runtime — chosen over a client-only feature flag or an optional off-chain
  service so that changes and pauses are cryptographically accountable and survive independent of the
  app build. This introduces a new value-adjacent control contract and therefore follows the project's
  security-review path in planning.
- **Builds on spec 065**: this feature manages the staking service delivered by spec 065; it replaces
  spec 065's build-time provider/allowlist constants as the *source of truth the member app reads*,
  while spec 065's flows, UI, and honest-state behavior are otherwise unchanged. The member app keeps a
  safe built-in default so staking still works if the control surface is absent (backwards-compatible).
- **Reuses the existing admin + role model**: the controls live in the existing admin area and reuse
  the existing operator role framework and audit/notification systems rather than inventing new ones;
  a staking-configuration authorization is added, and the existing emergency/guardian authorization
  gates the pause.
- **Scope of "management"**: managing addresses, the validator allowlist, and per-network pause/resume
  is in scope. Changing the economic terms of third-party providers, running FairWins-operated
  validators, or holding member funds are explicitly **out of scope** — the service remains
  non-custodial and members always transact from their own wallets.
- **Non-custodial pause semantics**: because staking is non-custodial, "pause" means the app stops
  *offering* staking and the control surface stops authorizing new stakes; it is not, and cannot be, a
  guarantee that a determined user could not call a third-party protocol directly outside the app.
- **Networks**: management applies to the networks where staking is offered (Ethereum mainnet at
  launch, per spec 065), and extends to future staking networks by the same per-network model.
- **Emergency independence**: the pause is designed to work without depending on optional/off-chain
  infrastructure, so it is available during incidents that degrade non-essential services.

## Dependencies

- **Spec 065 (Liquid & Delegated Staking)** — the member-facing staking feature this controls; its
  provider config, validator allowlist, and availability gating are the surfaces this feature makes
  operator-managed.
- The existing **admin area** and its tab/registration + role-gating model (the ProtocolConfig and
  Fees tabs are the precedent for an operator-edits-config surface).
- The existing **operator role / access-control model** (a new staking-configuration authorization
  plus the existing emergency/guardian authorization).
- The existing **audit / activity-history** and notification systems for recording and surfacing
  control actions.
- The existing **upgradeable-contract and security-review** process for the new control contract.
- The FairWins documentation site for the operator guide and emergency runbook.
