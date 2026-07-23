# Feature Specification: Staking Fee Router, Admin Controls & Emergency Pause

**Feature Branch**: `066-staking-admin-controls`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "We need adequate control surfaces for administrative tasks necessary to
manage staking activities — contract-address management and the lifecycle events an operator would
need to manage a change in service, and the ability to pause staking on a network in an emergency. We
also need to route staking through the platform fee mechanics so the treasury can grow."

## User Scenarios & Testing *(mandatory)*

Staking (spec 065) shipped **fee-free** and with its provider addresses and curated validator
allowlist baked into the app at build time, with no way to turn staking off short of a new app build.
That was the right launch cut, but it leaves two gaps for a production financial service: **no revenue
to the treasury**, and **no operator control surface** — when a provider migrates a contract, a
validator must be swapped out, or something goes wrong and staking must be stopped *now*, the only
recourse is a code change and a redeploy, too slow for an incident and invisible in any audit trail.

This feature closes both gaps with a single authoritative, on-chain **staking control surface** (one
per network) that member staking flows pass through. It (1) charges a **platform fee** on staking that
is routed to the FairWins **treasury** — using the same single platform-fee configuration every other
FairWins service uses — so the treasury grows with staking volume; and (2) gives operators a real
**admin surface** to manage the staking service — review and update provider addresses, curate the
validator allowlist, and **pause staking per network in an emergency** — all taking effect at runtime
without an app redeploy and all recorded as an auditable history of who changed what and when. Members
are always treated honestly: the fee is disclosed before they sign, a paused or misconfigured network
shows the same honest "not available right now" state the app already uses, and members can **always
exit** existing positions.

### User Story 1 - Grow the treasury with a platform fee on staking (Priority: P1)

FairWins wants staking to contribute to the treasury like its other services do. When a member stakes,
a platform fee (set through the same single fee configuration used across FairWins) is taken from the
staked amount and sent to the treasury, and the remainder is staked with the provider as usual — all
in one action, so the member signs once and is never left in a half-done state. The member sees the
fee as its own clear line in the confirmation before they sign, and can never be charged more than the
rate they were shown. When the fee rate is set to zero, staking behaves exactly as it does today with
no fee line at all.

**Why this priority**: Treasury growth is the explicit new business goal, and routing staking through
the fee mechanics is the reason the on-chain control surface exists at all — everything else (config,
pause) rides on the same surface. It is independently valuable and testable the moment the fee path
works end to end.

**Independent Test**: With a configured non-zero staking fee, stake a supported asset and verify the
treasury balance increases by the disclosed fee, the net amount is staked with the provider, the
member received the expected position, and the member was shown the fee before signing and charged no
more than the quoted rate; then set the fee to zero and verify staking is byte-for-byte the fee-free
experience.

**Acceptance Scenarios**:

1. **Given** a configured non-zero staking fee on a network, **When** a member stakes, **Then** the
   fee is sent to the treasury, the net remainder is staked with the provider, and the member receives
   the resulting position — atomically, from a single confirmation.
2. **Given** a member is about to stake with a non-zero fee, **When** they review the confirmation,
   **Then** the fee is shown as its own line with its rate, and the amount that will actually be
   staked is shown — before any signature.
3. **Given** a member was shown a fee rate, **When** the transaction executes, **Then** they are
   charged no more than that rate (a rate increase in flight can never overcharge them).
4. **Given** the staking fee is set to zero (or unset), **When** a member stakes, **Then** there is no
   fee line and the experience is identical to the current fee-free staking.
5. **Given** the fee configuration is unreachable or the control surface is not deployed on a network,
   **When** a member stakes, **Then** the app falls back to the honest default (fee-free, direct
   staking) rather than blocking or guessing a rate.

---

### User Story 2 - Emergency pause and resume of staking (Priority: P1)

An authorized emergency responder needs to stop staking on a network immediately — a provider exploit
is suspected, a validator is misbehaving, or a contract address is in doubt. From the admin area they
select the network and pause staking. Within moments the member-facing Stake area on that network
stops offering new stakes and shows the honest unavailable state; **existing positions and the ability
to unstake/withdraw are unaffected** (members must always be able to get their funds back). When the
incident is resolved, the responder resumes staking. Both actions are recorded with the actor and time.

**Why this priority**: This is the core safety lever and the most time-critical capability — the whole
point of a control surface is to act faster than a redeploy in an incident. It shares the same on-chain
surface as the fee router.

**Independent Test**: With an authorized responder account, pause staking on a network and confirm the
member Stake area stops offering new stakes and shows the unavailable state while unstake/withdraw
still work; resume and confirm staking is offered again; verify both actions appear in the audit
history.

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
   opens staking there, **Then** the app falls back safely to its honest default and never shows a
   broken screen.

---

### User Story 3 - Manage staking provider addresses per network (Priority: P2)

A provider migrates a contract, or a new network is brought online, and an operator must update the
addresses the staking flows use. From the Staking controls the operator sees the current provider
addresses for the selected network (the liquid-staking contracts, the delegation manager, the staking
token), each next to its current value, updates the ones that changed, and confirms. The member-facing
staking flows begin using the new addresses at runtime. Every change is recorded with the actor, old
and new value, and time.

**Why this priority**: Address management is the routine operational need behind "a change in
service." It builds on the same control surface as US1/US2.

**Independent Test**: As an authorized operator, change a staking provider address for a network,
confirm the member staking flow resolves the new address, and verify the change (old → new, actor,
time) is in the audit history.

**Acceptance Scenarios**:

1. **Given** an authorized operator, **When** they view the Staking controls for a network, **Then**
   each managed provider address is shown with its current value.
2. **Given** the operator updates a provider address and confirms, **When** a member next uses staking
   on that network, **Then** the flow uses the updated address.
3. **Given** the operator submits an obviously invalid address (malformed, or empty where one is
   required), **When** they confirm, **Then** the change is rejected with a clear reason before it
   takes effect.
4. **Given** an address change is made, **When** the audit history is reviewed, **Then** the change
   records the field, old value, new value, actor, and time.

---

### User Story 4 - Curate the validator allowlist as a service-lifecycle activity (Priority: P2)

The curated delegation validator set must change over time — a validator raises its commission beyond
policy, is jailed, or is replaced. An authorized operator opens the validator allowlist for the
network, sees the current curated validators, and adds, removes, or replaces an entry. Removing a
validator stops it being offered for **new** delegations immediately; members already delegated to it
can still see the position and unstake/withdraw. The change is recorded in the audit history.

**Why this priority**: Validator curation is the other half of "managing a change in service." It is
delegated-staking-specific and builds on the same controls.

**Independent Test**: As an authorized operator, remove a validator and confirm it is no longer
offered for new delegations while a member already delegated to it can still unstake; add a validator
and confirm it appears; verify both changes are in the audit history.

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

### User Story 5 - Least-privilege operator access and audit (Priority: P3)

Not everyone may touch staking controls. Configuration changes (addresses, allowlist) and the fee rate
require a staking-configuration operator; the emergency pause/resume may be exercised by the broader
emergency role so an incident responder can act even without configuration rights. Unauthorized
accounts do not see the controls at all, and no privileged action can be taken without the appropriate
authorization. The full history of staking control actions is reviewable so changes are accountable.

**Why this priority**: Access separation and auditability are essential for a financial control surface
but layer onto the functional stories above.

**Independent Test**: Confirm an account without any staking-operator authorization sees no staking
controls and cannot perform any control action; confirm the configuration role can change
addresses/allowlist/fee; confirm the emergency role can pause/resume; confirm every action is
attributable in the audit history.

**Acceptance Scenarios**:

1. **Given** an account with no staking-operator authorization, **When** they open the admin area,
   **Then** the Staking controls are not shown and no staking control action is possible.
2. **Given** an account with only the emergency authorization, **When** they open the Staking controls,
   **Then** they can pause/resume but cannot change addresses, the allowlist, or the fee.
3. **Given** an account with the staking-configuration authorization, **When** they open the Staking
   controls, **Then** they can change addresses, the allowlist, and the fee rate (bounded by the
   configured cap).
4. **Given** any staking control action by any operator, **When** the audit history is reviewed,
   **Then** the action is attributable to the acting operator with a timestamp.

---

### Edge Cases

- **Fee never blocks the exit path**: the platform fee applies to staking (the value-in action) only;
  unstake, withdraw, and reward-claim are never fee-gated and always work.
- **Fee ceiling honored**: a member is charged at most the rate they were shown; a rate change in
  flight can never overcharge (the quoted rate is a hard ceiling on the transaction).
- **Zero fee is invisible and identical**: a zero/unset fee produces no fee line and byte-identical
  behavior to fee-free staking.
- **Fee cap enforced**: the staking fee can never be set above the configured maximum for the service;
  an attempt to exceed it is rejected.
- **Pause never traps funds**: a pause blocks only *new* stakes/delegations; unstake, withdraw, and
  reward-claim remain available so members can always exit.
- **Control surface undeployed/unreachable**: when the control surface (or the fee configuration) is
  not deployed on a network or cannot be read, the member app falls back to its honest default —
  fee-free, direct staking, availability as configured — and never shows a broken screen; operators
  see a clear "not available on this network" state instead of failing writes.
- **Config vs. pause divergence**: pausing does not erase configuration or the fee rate; resuming
  restores the previously-configured state unchanged.
- **Removing an in-use validator**: a validator removed from the allowlist while members are delegated
  to it disappears from *new*-delegation options but remains visible/exitable for existing positions.
- **Invalid or dangerous input**: malformed addresses, empty required fields, duplicate validator
  entries, an unresolvable validator identifier, or an over-cap fee are rejected before taking effect.
- **Stale reads**: the member app reflects a control/fee change within a bounded refresh window and
  communicates availability and the fee as "as of" its last read rather than implying instantaneous
  global state.
- **Per-network isolation**: pausing, reconfiguring, or setting the fee on one network never affects
  another; controls, fee, and audit history are scoped per network and never cross the
  testnet/mainnet boundary.
- **Emergency reachability**: the pause must be exercisable even when non-essential services are
  degraded, so it does not depend on optional infrastructure being healthy.
- **No custody beyond the single action**: routing a stake through the control surface to charge the
  fee is atomic — the surface never holds member funds across transactions, and a failure returns the
  member to their starting state with nothing moved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST charge a platform fee on staking (the value-in action) that is routed to
  the FairWins treasury, taken from the staked amount with the net remainder staked with the provider,
  executed atomically so a member signs once and is never left in a partial state.
- **FR-002**: The staking fee rate MUST come from the single platform-fee configuration used across
  FairWins services (the same source of truth as other service fees), MUST be capped at a configured
  maximum for the service, and MUST be settable to zero; a zero/unset fee MUST produce no fee line and
  behavior identical to fee-free staking.
- **FR-003**: The member MUST see the staking fee as its own line — with its rate and the resulting
  net amount to be staked — before any signature, and MUST be charged no more than the rate they were
  shown (the quoted rate is a hard ceiling for that transaction).
- **FR-004**: The platform fee MUST apply only to staking (value-in); unstake, withdraw, and reward
  claim MUST never be fee-gated so members can always exit an existing position.
- **FR-005**: The system MUST provide an authorized operator a control surface, within the app's admin
  area, to review and manage staking configuration, the fee rate, and availability per network,
  without requiring an app redeploy for changes to take effect.
- **FR-006**: Operators MUST be able to **pause** and **resume** staking per network; while paused,
  the member-facing staking experience on that network MUST stop offering new stakes/delegations and
  show the honest unavailable state within one member refresh, while unstake/withdraw/claim remain
  available.
- **FR-007**: Operators MUST be able to view and update the staking provider contract addresses used
  by the staking flows for a network (the liquid-staking contracts, the delegation manager, and the
  staking token), with the current value shown for each and obviously-invalid input rejected before it
  takes effect.
- **FR-008**: Operators MUST be able to curate the delegation validator allowlist per network — add,
  remove, or replace a validator — with duplicates and malformed/unresolvable entries rejected;
  removing a validator MUST stop it being offered for new delegations while leaving existing positions
  visible and exitable.
- **FR-009**: The member-facing staking experience MUST source its provider addresses, validator
  allowlist, availability, and fee rate from the managed control surface at runtime, and MUST fall
  back safely to an honest default (fee-free, direct staking, availability as configured — never a
  broken screen) when the control surface or fee configuration is undeployed or unreachable.
- **FR-010**: Every staking control action (fee-rate change, pause, resume, address change, allowlist
  add/remove/replace) MUST be recorded in an auditable history that captures the action, the affected
  network, the before/after value where applicable, the acting operator, and the time.
- **FR-011**: Access MUST be least-privilege: configuration changes (addresses, allowlist, fee rate)
  require a staking-configuration authorization; the emergency pause/resume may be exercised by the
  emergency/guardian authorization; accounts without any staking-operator authorization MUST NOT see
  the controls or be able to perform any control action.
- **FR-012**: All staking control state, fee, and history MUST be scoped per network; an action on one
  network MUST NOT affect another, and the member app MUST NOT mix control state across the
  testnet/mainnet boundary.
- **FR-013**: The emergency pause MUST remain exercisable when non-essential/optional services are
  degraded — it MUST NOT depend on optional infrastructure being healthy to stop staking.
- **FR-014**: The control surface MUST surface meaningful operator feedback: current values, the live
  fee rate and its cap, a clear reason on rejected input, confirmation of a completed change, and the
  change history — so an operator can see the effect of their action without guesswork.
- **FR-015**: Member-facing availability and fee driven by the control surface MUST be presented
  honestly as "as of" its last read, and a paused or unavailable network MUST reuse the existing
  honest unavailable-state pattern rather than a bespoke or dishonest surface.
- **FR-016**: The staking service MUST remain non-custodial across transactions — routing a stake
  through the control surface to charge the fee is atomic, the surface MUST NOT hold member funds
  between transactions, and a failed stake MUST return the member to their starting state with nothing
  moved.
- **FR-017**: Operator documentation MUST describe the staking control surface — how the fee works and
  how to set it, how to pause/resume, change addresses, curate validators, who is authorized, and how
  the audit history works — including the emergency runbook for pausing in an incident.

### Key Entities *(include if feature involves data)*

- **Staking Control Configuration**: the managed, per-network staking settings the member app reads at
  runtime — provider contract addresses, the curated validator allowlist, the staking fee rate, and
  the staking-enabled/paused state. Attributes: network, provider addresses, validator allowlist
  entries, fee rate, fee cap, paused flag, last-updated time.
- **Staking Fee Charge**: the treasury-bound fee taken when a member stakes. Attributes: network,
  staking action, gross staked amount, fee rate applied, fee amount to treasury, net amount staked,
  member-quoted ceiling, transaction reference.
- **Validator Allowlist Entry**: one curated delegation target under management. Attributes: network,
  validator identifier, validator contract reference, listing status (listed/removed).
- **Staking Control Action (Audit Record)**: an accountable record of an operator action. Attributes:
  type (fee-change/pause/resume/address-change/allowlist-add/remove/replace), network, field +
  before/after value where applicable, acting operator, timestamp.
- **Staking Operator Authorization**: the permission that gates control actions. Attributes: operator
  account, authorization kind (staking-configuration vs. emergency/guardian), network scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a configured non-zero staking fee, 100% of stakes route the fee to the treasury and
  stake the net remainder in a single member confirmation; the measured treasury increase equals the
  disclosed fee for every stake.
- **SC-002**: 100% of fee-bearing stakes disclose the fee (rate + net) before signature, and 0 members
  are ever charged more than the rate they were shown.
- **SC-003**: With the staking fee set to zero, the staking experience is byte-for-byte identical to
  fee-free staking (no fee line, no extra step).
- **SC-004**: An authorized responder can pause staking on a network and have the member Stake area
  stop offering new stakes within one member refresh, with no app redeploy; while paused, 100% of
  members with existing positions can still unstake/withdraw/claim.
- **SC-005**: 100% of staking control actions (fee change, pause, resume, address change, allowlist
  change) appear in the audit history attributable to the acting operator with a timestamp.
- **SC-006**: An operator can complete a fee change, provider-address change, or validator add/remove
  and see it reflected in the member Stake area within one refresh, without a redeploy; the fee can
  never be set above the configured cap.
- **SC-007**: 0 accounts without staking-operator authorization can view or perform any staking control
  action; configuration and emergency authorizations grant exactly their intended actions and no more.
- **SC-008**: On a network where the control surface or fee configuration is undeployed or unreachable,
  0 members see a broken or fee-guessing staking screen — the app falls back to the honest default.
- **SC-009**: Control state, fee, and audit history are correctly isolated per network in 100% of cases
  (no cross-network or cross-testnet/mainnet leakage).
- **SC-010**: Operator documentation exists and lets a new operator set the staking fee and perform an
  emergency pause by following the runbook, unaided, on their first attempt.

## Assumptions

- **Fee routing reuses the single platform-fee configuration**: the staking fee is expressed through
  the same platform-fee configuration and treasury routing every other FairWins service uses (the
  spec-060 fee mechanism), registered as a staking service with its own hard cap — not a new,
  parallel fee store. This resolves the fee-router path that spec 065 deferred (065 research R6).
- **Authoritative, on-chain control surface (a staking router)**: per the product decision, staking
  configuration, the fee, and the pause switch are held in an authoritative, auditable, on-chain
  control surface (one per network) that member staking flows route through so the fee can be charged
  and the pause enforced. This is a value-adjacent control contract and therefore follows the
  project's security-review path in planning (transient-only custody, atomic fee-and-forward,
  reentrancy-safe).
- **Builds on spec 065**: this feature manages and monetizes the staking service delivered by spec 065;
  it becomes the source of truth the member app reads (replacing 065's build-time provider/allowlist
  constants) and the path member stakes route through, while 065's flows, UI, and honest-state
  behavior are otherwise preserved. The member app keeps a safe built-in default (fee-free, direct
  staking) so staking still works if the control surface is absent — a backwards-compatible rollout.
- **Reuses the existing admin + role + fee-admin model**: the controls live in the existing admin area
  and reuse the existing operator role framework, the existing fee-administration model, and the audit/
  notification systems rather than inventing new ones; a staking-configuration authorization is added
  and the existing emergency/guardian authorization gates the pause.
- **Scope of "management"**: managing the fee rate, provider addresses, the validator allowlist, and
  per-network pause/resume is in scope. Changing third-party providers' own economics, running
  FairWins-operated validators, or holding member funds across transactions are explicitly **out of
  scope** — the service remains non-custodial and members transact from their own wallets.
- **Non-custodial pause semantics**: because staking is non-custodial, "pause" means the app and the
  control surface stop *offering/authorizing* new stakes; it is not, and cannot be, a guarantee that a
  determined user could not call a third-party protocol directly outside the app.
- **Networks**: management and fees apply to the networks where staking is offered (Ethereum mainnet
  at launch, per spec 065), and extend to future staking networks by the same per-network model.

## Dependencies

- **Spec 065 (Liquid & Delegated Staking)** — the member-facing staking feature this controls and
  monetizes; its provider config, validator allowlist, availability gating, and stake flows are the
  surfaces this feature makes operator-managed and fee-bearing.
- **Spec 060 (Platform Fee Wrapper / FeeRouter)** — the single source of truth for fee configuration
  and treasury routing; staking registers as a fee service (with its own cap) and reads its rate from
  it, and the member surfaces disclose the quoted rate and pass it as the charged ceiling.
- The existing **admin area** and its tab/registration + role-gating model (the ProtocolConfig and
  Fees tabs are the precedent for an operator-edits-config surface).
- The existing **operator role / access-control and fee-administration model** (a new
  staking-configuration authorization plus the existing emergency/guardian and fee-admin
  authorizations).
- The existing **audit / activity-history** and notification systems for recording and surfacing
  control actions.
- The existing **upgradeable-contract and security-review** process for the new control/router
  contract.
- The FairWins documentation site for the operator guide and emergency runbook.
