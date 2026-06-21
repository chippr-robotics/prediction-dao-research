# Feature Specification: Upgradeable MembershipManager (Separate State from Logic)

**Feature Branch**: `claude/transferable-memberships-ch3hlw`

**Created**: 2026-06-21

**Status**: Draft

**Input**: User description: "Migrate the MembershipManager access/membership contract to an upgradeable UUPS
proxy that separates persistent membership state from swappable contract logic, so future membership changes
ship as in-place implementation upgrades instead of fresh deployments that strand existing memberships. Deploy
the proxy with the current logic first (behavior-neutral); preserve all existing membership state, the on-chain
address, events, and behavior; gate upgrades behind the admin role via the air-gapped floppy keystore."

## Overview

Today the active membership authority (`MembershipManager`) is **not upgradeable**: its state and its logic
live in one deployed contract at a fixed address. Any change to the logic — even a purely additive feature —
requires deploying a **new** contract at a **new** address. Because the new contract starts with empty storage,
every membership, accrued fee, and configuration mapping on the old address is left behind: existing members
are **stranded** on a contract the app no longer points at, and `WagerRegistry` (which reads membership to gate
wager participation) would be pointed at an empty contract.

This feature makes the membership authority **upgradeable** by separating the two concerns:

- a **stable address** that holds all persistent membership state (tiers, memberships, accrued fees, treasury,
  sanctions wiring, Terms hashes, authorized callers) and that users, the frontend, the subgraph, and
  `WagerRegistry` always interact with; and
- a **swappable logic implementation** behind that address, which an authorized administrator can replace.

After this migration, a future feature (the immediate driver is **feature 026 — gift & resell memberships via
redeemable voucher NFTs**) ships as an **in-place logic upgrade**: the on-chain address does not change, every
existing membership remains intact and operable, and only the contract's ABI grows.

This is the **exact mirror, for `MembershipManager`, of feature 025 (PR #724) which made `WagerRegistry`
upgradeable** — and it deliberately **reuses the generic upgradeability primitives that 025 already merged**
(the `UUPSManaged` base, the proxy/upgrade deploy tooling, and the storage-layout CI check) rather than
building anything new. The migration itself is a pure-infrastructure change: the upgradeable membership
authority is first stood up running the **current** logic, so behavior is byte-for-byte unchanged at cutover.
The only thing that changes is that *future* logic can be swapped in without abandoning state.

This is a high-risk, value-bearing, access-control change (it controls who may replace the code that holds
accrued USDC fees and gates wager participation), so it is governed in full by Constitution Principle I.

## Clarifications

### Session 2026-06-21

- Q: What happens to memberships already created on the prior (non-upgradeable) `MembershipManager` at cutover?
  → A: **Coexistence.** The proxy is a new deployment; the legacy non-upgradeable contract cannot be
  retro-wrapped, so existing memberships remain readable/usable on the legacy address as-is, while all **new**
  purchases/grants happen on the upgradeable proxy and `WagerRegistry` is pointed at the proxy. Because
  memberships are **30-day time-bound**, legacy state drains within ~a month (a much cheaper coexistence window
  than wagers). No on-chain migration of the memberships mapping. Drain-first and on-chain migration were
  considered and rejected as impractical for v1.
- Q: Who may authorize an upgrade? → A: Only the existing **admin role**, via the air-gapped floppy keystore,
  using the `UPGRADER_ROLE` provided by the shared `UUPSManaged` base (granted at initialization; least
  privilege; reassignable to a timelock/multisig later with no code change).
- Q: How is a state-corrupting upgrade prevented? → A: The **same append-only storage-layout compatibility
  check** 025 introduced (OpenZeppelin upgrade validation in CI) must pass before any upgrade is applied —
  existing slots are never reordered/removed/retyped; new state is append-only behind a trailing storage gap.
- Q: Is any membership behavior changing in this migration? → A: **No.** This is behavior-neutral
  infrastructure only — no change to tiers, pricing, usage limits, sanctions screening, or Terms recording. The
  full existing membership suite must pass unchanged against the proxied contract.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stand up the membership authority at an upgrade-capable address with zero behavior change (Priority: P1)

The maintainer deploys the membership authority behind a stable, upgrade-capable address running the
**current** logic. From that moment the frontend, subgraph, `WagerRegistry`, and users interact with that
address, and every existing membership flow behaves exactly as before. No tier, price, usage-limit, screening,
or Terms behavior changes — it is a pure infrastructure cutover.

**Why this priority**: This is the prerequisite and the minimum viable slice. Without an upgrade-capable address
holding the state, there is nothing to upgrade. It delivers value on its own: the platform is positioned so the
*next* feature (026 voucher redemption) ships in place. It must introduce no regression, because it sits under
live funds and gates wager participation.

**Independent Test**: Deploy the upgradeable membership authority with the current logic to a test network,
point a test frontend/subgraph and a test `WagerRegistry` at it, and run the full existing membership lifecycle
(purchase / upgrade / extend / grant / revoke / hooks) plus a wager create/accept that depends on membership.
Confirm identical outcomes to the non-upgradeable contract and that accrued fees are fully accounted for.

**Acceptance Scenarios**:

1. **Given** the upgradeable membership authority deployed with current logic, **When** a user runs any
   existing membership flow (purchase/upgrade/extend; admin grant/revoke; create/close hooks), **Then** the
   outcome is identical to the prior non-upgradeable contract.
2. **Given** the migration, **When** the frontend, subgraph, and `WagerRegistry` are configured, **Then** they
   interact with a single stable address and require no special handling for it being upgradeable.
3. **Given** accrued USDC fees held by the authority, **When** the upgradeable authority is operating, **Then**
   the balance is fully accounted for and withdrawable through the normal admin path.
4. **Given** `WagerRegistry` pointed at the membership proxy, **When** a member creates or accepts a wager,
   **Then** membership gating (`hasActiveRole`/`checkCanCreate`/`recordCreate`/`recordClose`) behaves exactly as
   before.

---

### User Story 2 - Upgrade the logic in place, preserving the address and all state (Priority: P1)

An authorized administrator replaces the authority's logic with a new version. The on-chain address is
unchanged, and every existing membership (tier, expiry, usage counters), every accrued fee, the treasury and
payment-token config, the sanctions wiring, the Terms-hash records, and the authorized-caller set remain intact
and operable under the new logic. The new behavior takes effect immediately, with no fresh deployment and no
stranded memberships.

**Why this priority**: This is the headline capability — the entire reason for the migration. It is what lets
feature 026 (and every future membership change) ship without abandoning state. It is inseparable from US1: US1
creates the upgrade-capable address, US2 exercises the upgrade.

**Independent Test**: Starting from the deployed upgradeable authority with some live memberships and accrued
fees, deploy a new logic implementation that adds an additive change, perform the upgrade as the admin, and
confirm: the address is unchanged, every pre-existing membership still reads and enforces correctly, accrued
fees are intact, and the new logic is active.

**Acceptance Scenarios**:

1. **Given** a deployed upgradeable authority with live memberships and accrued fees, **When** the admin
   upgrades the logic, **Then** the on-chain address is unchanged and the frontend/subgraph/`WagerRegistry`
   need no repointing.
2. **Given** an upgrade, **When** it completes, **Then** all pre-existing memberships, accrued fees, and config
   mappings read back unchanged and remain operable under the new logic (no loss, corruption, or reset).
3. **Given** an upgrade that adds new functionality, **When** it completes, **Then** the new functions/events
   are available while every previously existing function/event continues to work unchanged.
4. **Given** active memberships at the moment of upgrade, **When** the upgrade completes, **Then** their
   lifecycle (expiry, usage-limit enforcement, revoke) continues uninterrupted.

---

### User Story 3 - Keep upgrades authorized, safe, and auditable (Priority: P2)

Only the admin (via the air-gapped floppy keystore) can upgrade the logic; anyone else is refused. An upgrade
incompatible with the stored state layout is blocked before it can take effect, the upgrade entrypoint can never
be permanently locked out, and every upgrade is observable on-chain and recorded in the deployment artifacts.

**Why this priority**: Upgradeability over a fund-holding, access-gating contract is a powerful, dangerous
capability — it must be tightly controlled and observable, or it becomes the platform's biggest attack surface.
It is secondary only because it hardens the capability delivered by US1/US2 rather than delivering it.

**Independent Test**: Attempt an upgrade from a non-admin account (must be refused); attempt an upgrade with a
storage-incompatible implementation (must be blocked before it applies); confirm an upgrade emits an observable
on-chain record and is written to the deployment artifacts; confirm the upgrade entrypoint still exists after an
upgrade; confirm the one-time initialization cannot be called again.

**Acceptance Scenarios**:

1. **Given** a non-admin account, **When** it attempts to upgrade the logic, **Then** the attempt is refused
   and the logic is unchanged.
2. **Given** a proposed implementation whose storage layout is incompatible with the existing state, **When**
   the upgrade is prepared, **Then** it is blocked before being applied (no silent state corruption).
3. **Given** any successful upgrade, **When** it completes, **Then** it is observable on-chain and the new
   implementation is recorded in the `deployments/` artifacts as the source of truth.
4. **Given** any upgrade, **When** it completes, **Then** the ability to perform future upgrades is preserved
   (the upgrade authorization is never removed or bricked).
5. **Given** the deployed proxy, **When** anyone attempts to re-run the one-time initialization, **Then** it
   reverts (no re-initialization to seize roles or reset state).

---

### Edge Cases

- **Re-initialization attempt**: the one-time initialization that replaces the constructor MUST NOT be callable
  again after the first time, so an attacker cannot re-initialize the authority (e.g., to seize the admin role)
  on the proxy or a fresh implementation.
- **Storage-incompatible upgrade (reordered/removed/retyped state)**: blocked by the compatibility check before
  it applies; never allowed to corrupt existing membership/fee state.
- **Upgrade that adds new state**: only permitted as **append-only** storage (drawing from the trailing gap);
  inserting or reordering existing state is rejected.
- **Inline state initializer behind a proxy**: any value that was set inline at declaration must be set inside
  the initializer instead (inline initializers run in constructor context and do not take effect behind a
  proxy) — verified so no defaulted state silently differs from the legacy contract.
- **Legacy membership interaction after cutover**: a user with a membership on the prior non-upgradeable
  authority retains it on the legacy address until it expires; the app distinguishes legacy from new
  (proxy) memberships without implying the legacy ones moved.
- **`WagerRegistry` repoint**: `WagerRegistry` must reference the membership **proxy** as its membership
  authority after cutover; in-flight wagers must continue to settle correctly across the repoint.
- **Accrued fees at cutover**: accrued USDC on the legacy authority is withdrawn through its normal admin path;
  it is not moved by the migration. New fees accrue on the proxy. No double-counting across the two.
- **Implementation deployed but never pointed to**: a bare logic implementation holds no funds and no state and
  cannot be initialized; only the proxy address custodies funds, so an orphaned implementation is inert.

## Requirements *(mandatory)*

### Functional Requirements

#### Upgradeability

- **FR-001**: The system MUST allow the membership authority's logic to be replaced (upgraded) **without
  changing the on-chain address** that users, the frontend, the subgraph, and `WagerRegistry` interact with.
- **FR-002**: An upgrade MUST preserve **all** existing persistent state with no loss, corruption, or reset:
  every membership (tier, expiry, usage counters), the tier configuration, accrued fees, the payment token and
  treasury, the sanctions-guard wiring, the Terms-hash records, and the authorized-caller set.
- **FR-003**: After an upgrade, **every** existing membership flow (purchase, upgrade, extend, grant, revoke,
  and the create/close hooks) MUST behave identically to before, and active memberships MUST continue their
  lifecycle uninterrupted.
- **FR-004**: An upgrade MUST be able to introduce **additive** new functions, events, and state while keeping
  every previously existing function, event, and error working unchanged.

#### The migration (cutover)

- **FR-005**: The migration MUST first stand up the upgradeable authority running the **current** logic, so the
  cutover itself introduces no behavioral change (pure infrastructure).
- **FR-006**: The authority's externally observed interface (function signatures, events, errors, and the
  `IMembershipManager` surface consumed by `WagerRegistry` and the frontend) MUST remain **stable** across the
  migration; subsequent changes are additive only.
- **FR-007**: Memberships created on the prior non-upgradeable authority MUST remain readable and usable on
  their original address after cutover; the app MUST present legacy and new (upgradeable) memberships honestly
  and distinctly until the legacy memberships drain. No on-chain migration of legacy state is required.
- **FR-008**: The migration and any upgrade MUST keep all accrued USDC fully accounted for and withdrawable; no
  upgrade or cutover may strand, lock, or double-count fees.
- **FR-009**: `WagerRegistry` MUST be repointed to the membership **proxy** as its membership authority at
  cutover, and membership gating of wager participation MUST behave exactly as before.

#### Reuse of established primitives

- **FR-010**: The migration MUST **reuse** the generic upgradeability primitives already delivered by feature
  025 (the shared upgrade base, the proxy/upgrade deploy tooling, and the storage-layout compatibility check) —
  it MUST NOT introduce a second, parallel upgrade mechanism.

#### Authorization and safety

- **FR-011**: Only an authorized **administrator** (the existing admin role, via the air-gapped floppy keystore,
  holding the dedicated upgrade authorization) MUST be able to perform an upgrade; any non-admin attempt MUST be
  rejected.
- **FR-012**: A proposed upgrade whose state layout is **incompatible** with the existing stored state
  (reordered, removed, or retyped storage) MUST be prevented before it can take effect; only append-only
  additions to state are permitted.
- **FR-013**: The one-time initialization that replaces the contract constructor MUST be callable **exactly
  once** and MUST NOT be re-invokable thereafter (no re-initialization to seize roles or reset state).
- **FR-014**: The upgrade authorization mechanism MUST be preserved across every upgrade — an upgrade MUST NOT
  be able to permanently remove or brick the ability to perform future upgrades.
- **FR-015**: A bare logic implementation MUST NOT be initializable (its initializers are disabled), so it
  cannot be hijacked independently of the proxy.

#### Observability and operations

- **FR-016**: Every upgrade MUST be **auditable**: observable on-chain (the change of logic is recorded) and
  written to the `deployments/` artifacts, which remain the source of truth for on-chain addresses (including
  the stable proxy address and the current implementation).
- **FR-017**: The frontend MUST obtain contract addresses and ABIs only from the generated sync artifacts
  (never hand-copied), and after an upgrade only the ABI changes — the address stays the same.
- **FR-018**: The migration MUST be validated on the testnet (Amoy) and pass the full existing membership and
  wager test suites before any mainnet (Polygon) cutover; legacy read-only networks (Mordor/ETC) are out of
  scope.

### Key Entities *(include if feature involves data)*

- **Membership Authority Address (stable front)**: The single, permanent on-chain address that custodies all
  membership state and accrued fees and that every integrator (users, frontend, subgraph, `WagerRegistry`)
  interacts with. Survives every upgrade.
- **Logic Implementation (swappable)**: The replaceable contract code that defines membership behavior. Holds no
  funds or state on its own; its initializers are disabled. Many versions over time; exactly one is active.
- **Upgrade Authorization**: The admin-gated capability to point the stable address at a new logic
  implementation. Bound to the existing admin role and the floppy-keystore signing flow; reassignable to a
  timelock/multisig later.
- **Storage Layout**: The ordered persistent state of the implementation, which MUST remain append-only
  -compatible across upgrades; the contract the compatibility check protects.
- **Legacy Authority**: The prior non-upgradeable `MembershipManager` deployment. After cutover it is read/use
  -only for existing memberships until they expire; no new memberships are created on it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A logic upgrade changes contract behavior with the **on-chain address unchanged** — the frontend,
  subgraph, and `WagerRegistry` require no address change to keep working.
- **SC-002**: **100%** of existing memberships, accrued fees, and config mappings remain readable and operable
  after an upgrade (no state loss or corruption), verified by reading back a representative set pre/post upgrade.
- **SC-003**: **100%** of the existing membership and wager test suites pass against the upgradeable authority
  with no regression (the migration is behavior-neutral).
- **SC-004**: An unauthorized upgrade attempt is rejected **100%** of the time; only the admin authorization can
  upgrade.
- **SC-005**: A storage-incompatible upgrade is blocked **before** deployment by the compatibility check and is
  never silently applied.
- **SC-006**: A subsequent feature (the feature 026 voucher redemption) deploys as an in-place upgrade with
  **zero stranded memberships** and **zero address changes**.
- **SC-007**: **Every** upgrade is observable on-chain and recorded in the `deployments/` artifacts.
- **SC-008**: Re-initialization of the authority after the first initialization fails **100%** of the time.

## Assumptions

- **Reuse of 025 primitives**: the shared upgrade base, deploy/upgrade tooling, storage-layout check, and the
  `@openzeppelin/contracts-upgradeable` + upgrade-validation dependencies introduced by feature 025 are present
  and reused as-is; this feature adds no new upgrade mechanism.
- **Chosen approach (the "how", detailed in the plan)**: a **UUPS-style upgradeable proxy** — persistent state
  at the proxy address; logic in a swappable implementation; upgrade authorization enforced in the
  implementation and gated by the admin role. Proxy internals belong to `plan.md`.
- **Cutover = coexistence (not migration)**: the live non-upgradeable authority cannot be retro-wrapped, so
  legacy memberships settle on the old address while new ones use the proxy; the 30-day membership term makes
  this drain window short. Drain-first and on-chain migration were rejected for v1.
- **Admin keys unchanged**: upgrades are authorized by the existing admin role and signed with the air-gapped
  floppy keystore; no new roles or key-management mechanisms beyond the least-privilege upgrade role.
- **Behavior-neutral**: no change to membership economics, tiers, pricing, usage limits, sanctions screening, or
  Terms recording; the external `IMembershipManager` surface is stable across the migration.
- **Deterministic, recorded deployments**: deployment scripts and `deployments/` artifacts remain the source of
  truth; the stable proxy address and current implementation address are both recorded.
- **Networks**: applies to the live deployments (Polygon mainnet, Amoy testnet); legacy read-only networks
  (Mordor/ETC) are out of scope.

## Dependencies

- **Feature 025 / PR #724 (Upgradeable WagerRegistry → generic UUPS primitives)** — provides the reusable
  upgrade base, the proxy/upgrade deploy tooling, and the storage-layout compatibility CI check this migration
  builds on. Already merged.

## Out of Scope

- The voucher/redemption feature itself (feature 026), which ships as the first in-place upgrade of this proxy.
- The generic UUPS primitives (already delivered by feature 025 / PR #724).
- Any change to membership economics, tiers, pricing, usage limits, sanctions screening, or Terms recording
  behavior — this is a behavior-neutral migration only.
- On-chain migration of legacy membership state (coexistence is used instead).
