# Feature Specification: Upgradeable WagerRegistry (Separate State from Logic)

**Feature Branch**: `025-upgradeable-registry`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "Migrate the WagerRegistry escrow to an upgradeable proxy that separates
persistent wager state from swappable contract logic, so future feature changes ship as in-place
implementation upgrades instead of fresh deployments that strand existing wagers. Deploy the proxy with
current logic first; preserve all existing wager state, the on-chain address, events, and behavior; gate
upgrades behind the admin role via the air-gapped floppy keystore."

## Overview

Today the active escrow contract (`WagerRegistry`) is **not upgradeable**: its state and its logic live in one
deployed contract at a fixed address. Any change to the logic — even a purely additive feature — requires
deploying a **new** contract at a **new** address. Because the new contract starts with empty storage, every
wager, balance, and mapping on the old address is left behind: existing wagers are **stranded** on a contract
the app no longer points at, and users must be migrated or settled out-of-band on each release.

This feature makes the registry **upgradeable** by separating the two concerns:

- a **stable address** that holds all persistent wager state and that users, the frontend, and the subgraph
  always interact with; and
- a **swappable logic implementation** behind that address, which an authorized administrator can replace.

After this migration, a future feature (the immediate driver is open-challenge wagers, feature 024) ships as
an **in-place logic upgrade**: the on-chain address does not change, every existing wager and escrowed stake
remains intact and operable, and the frontend/subgraph need no repointing — only the contract's ABI grows.

The migration itself is a pure-infrastructure change: the upgradeable registry is first stood up running the
**current** logic, so behavior is byte-for-byte unchanged at cutover. The only thing that changes is that
*future* logic can be swapped in without abandoning state.

This is a high-risk, funds-bearing, access-control change (it controls who may replace the code that custodies
user stakes), so it is governed in full by Constitution Principle I.

## Clarifications

### Session 2026-06-20

- Q: What happens to wagers already created on the prior (non-upgradeable) registry at cutover? → A:
  **Coexistence.** The proxy is a new deployment; the legacy non-upgradeable registry cannot be retro-wrapped,
  so existing wagers stay on the legacy address as **settle-only** (claimable/resolvable/refundable) while all
  **new** wagers are created on the upgradeable proxy. The app surfaces both honestly until the legacy wagers
  drain. Drain-first (pausing new creation and waiting out all resolve deadlines) and on-chain state migration
  were considered and rejected as impractical / unsafe for v1.
- Q: Who may authorize an upgrade? → A: Only the existing **admin role**, signed via the air-gapped floppy
  keystore. No new role or key-management mechanism is introduced.
- Q: How is a state-corrupting upgrade prevented? → A: A **storage-layout compatibility check** must pass
  before any upgrade is applied (new state is append-only; existing slots are never reordered or removed), so
  an incompatible implementation is blocked at deploy/upgrade time rather than corrupting funds after the fact.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stand up the registry at an upgrade-capable address with zero behavior change (Priority: P1)

The maintainer deploys the registry behind a stable, upgrade-capable address running the **current** logic.
From that moment the frontend, subgraph, and users interact with that address, and every existing wager flow
behaves exactly as before. No wager economics, resolution rule, or user-visible behavior changes — it is a
pure infrastructure cutover.

**Why this priority**: This is the prerequisite and the minimum viable slice. Without an upgrade-capable
address holding the state, there is nothing to upgrade. It delivers value on its own: the platform is now
positioned so the *next* feature ships in place. It must introduce no regression, because it sits under live
funds.

**Independent Test**: Deploy the upgradeable registry with the current logic to a test network, point a test
frontend/subgraph at it, and run the full existing wager lifecycle (create → accept → resolve → claim, plus
cancel/decline/draw/refund). Confirm identical outcomes to the non-upgradeable registry and that escrowed
funds are fully accounted for.

**Acceptance Scenarios**:

1. **Given** the upgradeable registry deployed with current logic, **When** a user runs any existing wager
   flow (create/accept/cancel/decline/resolve/draw/refund/claim), **Then** the outcome is identical to the
   prior non-upgradeable registry.
2. **Given** the migration, **When** the frontend and subgraph are configured, **Then** they interact with a
   single stable address and require no special handling for it being upgradeable.
3. **Given** escrowed stakes held by the registry, **When** the upgradeable registry is operating, **Then**
   every balance is fully accounted for and withdrawable through the normal claim/refund paths.

---

### User Story 2 - Upgrade the logic in place, preserving the address and all state (Priority: P1)

An authorized administrator replaces the registry's logic with a new version. The on-chain address is
unchanged, and every existing wager (parties, stakes, status, deadlines, resolution config, winner), every
escrowed balance, and every side mapping remains intact and operable under the new logic. The new behavior
takes effect immediately for new and in-flight actions, with no fresh deployment and no stranded wagers.

**Why this priority**: This is the headline capability — the entire reason for the migration. It is what lets
feature 024 (and every future change) ship without abandoning state. It is inseparable from US1: US1 creates
the upgrade-capable address, US2 exercises the upgrade.

**Independent Test**: Starting from the deployed upgradeable registry with some live wagers, deploy a new
logic implementation that adds an additive change, perform the upgrade as the admin, and confirm: the address
is unchanged, every pre-existing wager still reads and resolves correctly, escrowed funds are intact, and the
new logic is active.

**Acceptance Scenarios**:

1. **Given** a deployed upgradeable registry with live wagers and escrowed funds, **When** the admin upgrades
   the logic, **Then** the on-chain address is unchanged and the frontend/subgraph need no repointing.
2. **Given** an upgrade, **When** it completes, **Then** all pre-existing wagers, balances, and mappings read
   back unchanged and remain operable under the new logic (no loss, corruption, or reset).
3. **Given** an upgrade that adds new functionality, **When** it completes, **Then** the new functions/events
   are available while every previously existing function/event continues to work unchanged.
4. **Given** in-flight wagers (Open or Active) at the moment of upgrade, **When** the upgrade completes,
   **Then** their lifecycle (accept, resolve, claim, refund, draw) continues uninterrupted.

---

### User Story 3 - Keep upgrades authorized, safe, and auditable (Priority: P2)

Only the admin (via the air-gapped floppy keystore) can upgrade the logic; anyone else is refused. An upgrade
that is incompatible with the stored state layout is blocked before it can take effect, the upgrade
entrypoint can never be permanently locked out, and every upgrade is observable on-chain and recorded in the
deployment artifacts.

**Why this priority**: Upgradeability is a powerful, dangerous capability over funds — it must be tightly
controlled and observable, or it becomes the platform's biggest attack surface. It is secondary only because
it hardens the capability delivered by US1/US2 rather than delivering it.

**Independent Test**: Attempt an upgrade from a non-admin account (must be refused); attempt an upgrade with a
storage-incompatible implementation (must be blocked before it applies); confirm an upgrade emits an
observable on-chain record and is written to the deployment artifacts; confirm the upgrade entrypoint still
exists after an upgrade.

**Acceptance Scenarios**:

1. **Given** a non-admin account, **When** it attempts to upgrade the logic, **Then** the attempt is refused
   and the logic is unchanged.
2. **Given** a proposed implementation whose storage layout is incompatible with the existing state, **When**
   the upgrade is prepared, **Then** it is blocked before being applied (no silent state corruption).
3. **Given** any successful upgrade, **When** it completes, **Then** it is observable on-chain (an upgrade is
   recorded) and the new implementation is recorded in the `deployments/` artifacts as the source of truth.
4. **Given** any upgrade, **When** it completes, **Then** the ability to perform future upgrades is preserved
   (the upgrade authorization is never removed or bricked).

---

### Edge Cases

- **Upgrade attempted while paused / emergency stop active**: upgrade and operational controls remain
  consistent with the existing emergency-pause behavior; pausing must not lock out the admin's ability to
  upgrade (e.g., to ship a fix), and an upgrade must not silently re-enable a paused contract.
- **Storage-incompatible upgrade (reordered/removed/retyped state)**: blocked by the compatibility check
  before it applies; never allowed to corrupt existing wager/fund state.
- **Re-initialization attempt**: the one-time initialization that replaces the constructor MUST NOT be
  callable again after the first time, so an attacker cannot re-initialize the registry (e.g., to seize the
  admin role) on the proxy or a fresh implementation.
- **Upgrade that adds new state**: only permitted as **append-only** storage; inserting or reordering existing
  state is rejected.
- **Legacy wager interaction after cutover**: a user with a wager on the prior non-upgradeable registry can
  still claim/resolve/refund it on the legacy address; the app distinguishes legacy (settle-only) from new
  (proxy) wagers without implying the legacy ones moved.
- **Funds at cutover**: escrowed stakes on the legacy registry are not moved by the migration; they settle on
  the legacy address. New escrow accrues on the proxy. No double-counting across the two.
- **Implementation deployed but never pointed to**: a bare logic implementation holds no funds and no state;
  only the proxy address custodies funds, so an orphaned implementation is inert.

## Requirements *(mandatory)*

### Functional Requirements

#### Upgradeability

- **FR-001**: The system MUST allow the wager contract's logic to be replaced (upgraded) **without changing
  the on-chain address** that users, the frontend, and the subgraph interact with.
- **FR-002**: An upgrade MUST preserve **all** existing persistent state with no loss, corruption, or reset:
  every wager (status, parties, stakes, deadlines, resolution config, winner), every escrowed balance, the
  membership/sanctions wiring, and every side mapping (e.g., terms-version hashes, draw consent).
- **FR-003**: After an upgrade, **every** existing wager flow (create, accept, cancel, decline, resolve, draw,
  refund, claim) MUST behave identically to before, and any in-flight wager (Open or Active) MUST continue its
  lifecycle uninterrupted.
- **FR-004**: An upgrade MUST be able to introduce **additive** new functions, events, and state while keeping
  every previously existing function, event, and error working unchanged.

#### The migration (cutover)

- **FR-005**: The migration MUST first stand up the upgradeable registry running the **current** logic, so the
  cutover itself introduces no behavioral change (pure infrastructure).
- **FR-006**: The contract's externally observed interface (function signatures, events, errors, and the
  returned wager data shape) consumed by the frontend and subgraph MUST remain **stable** across the
  migration; subsequent changes are additive only.
- **FR-007**: Wagers created on the prior non-upgradeable registry MUST remain claimable, resolvable, and
  refundable after cutover on their original address; the app MUST present legacy (settle-only) and new
  (upgradeable) wagers honestly and distinctly until the legacy wagers drain. No on-chain migration of legacy
  state is required.
- **FR-008**: The migration and any upgrade MUST keep all escrowed funds fully accounted for and withdrawable;
  no upgrade or cutover may strand, lock, or double-count user stakes.

#### Authorization and safety

- **FR-009**: Only an authorized **administrator** (the existing admin role, signed via the air-gapped floppy
  keystore) MUST be able to perform an upgrade; any non-admin attempt MUST be rejected.
- **FR-010**: A proposed upgrade whose state layout is **incompatible** with the existing stored state
  (reordered, removed, or retyped storage) MUST be prevented before it can take effect; only append-only
  additions to state are permitted.
- **FR-011**: The one-time initialization that replaces the contract constructor MUST be callable **exactly
  once** and MUST NOT be re-invokable thereafter (no re-initialization to seize roles or reset state).
- **FR-012**: The upgrade authorization mechanism MUST be preserved across every upgrade — an upgrade MUST NOT
  be able to permanently remove or brick the ability to perform future upgrades.
- **FR-013**: Upgrade capability MUST be consistent with the existing emergency controls (pause/unpause): the
  contract can be guarded/halted as today, and pausing MUST NOT lock the admin out of shipping an upgrade.

#### Observability and operations

- **FR-014**: Every upgrade MUST be **auditable**: observable on-chain (the change of logic is recorded) and
  written to the `deployments/` artifacts, which remain the source of truth for on-chain addresses
  (including the stable proxy address and the current implementation).
- **FR-015**: The frontend MUST obtain contract addresses and ABIs only from the generated sync artifacts
  (never hand-copied), and after an upgrade only the ABI changes — the address stays the same.
- **FR-016**: The migration MUST be validated on the testnet (Amoy) and pass the full existing test suite
  before any mainnet (Polygon) cutover; legacy read-only networks (Mordor/ETC) are out of scope.

### Key Entities *(include if feature involves data)*

- **Registry Address (stable front)**: The single, permanent on-chain address that custodies all wager state
  and escrowed funds and that every integrator interacts with. Survives every upgrade.
- **Logic Implementation (swappable)**: The replaceable contract code that defines registry behavior. Holds no
  user funds or state on its own; only the stable address does. Multiple versions exist over time; exactly one
  is active.
- **Upgrade Authorization**: The admin-gated capability to point the stable address at a new logic
  implementation. Bound to the existing admin role and the floppy-keystore signing flow.
- **Storage Layout**: The shape and ordering of the registry's persistent state, which MUST remain
  append-only-compatible across upgrades; the contract that the compatibility check protects.
- **Legacy Registry**: The prior non-upgradeable deployment. After cutover it is settle-only: existing wagers
  remain claimable/resolvable there, but no new wagers are created on it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A logic upgrade changes contract behavior with the **on-chain address unchanged** — the
  frontend and subgraph require no address change to keep working.
- **SC-002**: **100%** of existing wagers, balances, and mappings remain readable and operable after an
  upgrade (no state loss or corruption), verified by reading back a representative live set pre/post upgrade.
- **SC-003**: **100%** of the existing contract test suite passes against the upgradeable registry with no
  regression (the migration is behavior-neutral).
- **SC-004**: An unauthorized upgrade attempt is rejected **100%** of the time; only the admin role can
  upgrade.
- **SC-005**: A storage-incompatible upgrade is blocked **before** deployment by the compatibility check and
  is never silently applied.
- **SC-006**: A subsequent feature (the open-challenge feature 024) deploys as an in-place upgrade with **zero
  stranded wagers** and **zero address changes**.
- **SC-007**: **Every** upgrade is observable on-chain and recorded in the `deployments/` artifacts.
- **SC-008**: Re-initialization of the registry after the first initialization fails **100%** of the time.

## Assumptions

- **Proxy approach (the chosen "how", detailed in the plan)**: the team has decided on a **UUPS-style
  upgradeable proxy** (OpenZeppelin) — persistent state lives at the proxy address; logic lives in a swappable
  implementation; upgrade authorization is enforced in the implementation and gated by the admin role. The
  spec is written at the capability level; proxy internals belong to `plan.md`.
- **Cutover = coexistence (not migration)**: the live non-upgradeable registry cannot be retro-wrapped, so the
  one-time cost is that legacy wagers settle on the old address while new wagers use the proxy. Drain-first and
  on-chain state migration were rejected as impractical/risky for v1 (see Clarifications).
- **Admin keys unchanged**: upgrades are authorized by the existing admin role and signed with the air-gapped
  floppy keystore; no new roles or key-management mechanisms are introduced.
- **Backward compatibility**: the registry's external interface (functions, events, errors, wager data shape)
  is stable across the migration, so the frontend, subgraph, and feature 024 layer additive changes on top
  without breaking existing integrations.
- **No change to wager economics or resolution rules**: this is an infrastructure migration only; stakes,
  payouts, the set of resolution types, and resolution rules are untouched.
- **Deterministic, recorded deployments**: deployment scripts and `deployments/` artifacts remain the source
  of truth; the stable proxy address and current implementation address are both recorded.
- **Networks**: applies to the live deployments (Polygon mainnet, Amoy testnet); legacy read-only networks
  (Mordor/ETC) are out of scope.
- **Dependent feature**: feature 024 (open-challenge wagers) is sequenced to ship as the **first in-place
  upgrade** of this proxy and depends on this feature being deployed first on each target network.
