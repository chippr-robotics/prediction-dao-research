# Feature Specification: Upgradeable MembershipManager (Adopt the UUPS Pattern)

**Feature Branch**: `026-upgradeable-membership`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "Make the MembershipManager contract upgradeable by adopting the same UUPS proxy
pattern and reusable UUPSManaged base established for WagerRegistry (spec 025), so the upcoming
transferable/giftable voucher-NFT membership feature can ship as an in-place implementation upgrade instead
of a fresh redeploy. Deploy the membership proxy with current logic first; preserve all existing memberships,
tier config, accrued fees, and authorized-caller wiring; keep the on-chain address, events, and behavior
unchanged; gate upgrades behind the admin role via the air-gapped floppy keystore. Memberships are 30-day
time-bound so the legacy coexistence window drains in about a month."

## Overview

`MembershipManager` — the contract that sells and tracks paid memberships (tiers, expiries, monthly/concurrent
limits, accrued fees, and the authorized-caller wiring that lets `WagerRegistry` record activity) — is **not
upgradeable**. Like the wager registry before spec 025, any logic change forces a redeploy to a **new
address**, stranding every existing membership and forcing re-wiring of every authorized caller.

This feature makes `MembershipManager` **upgradeable** by adopting the exact pattern feature 025 established
for `WagerRegistry`: an OpenZeppelin **UUPS proxy** with state at a stable address and swappable logic,
reusing the shared `UUPSManaged` base, the storage-layout safety gate, and the deploy/upgrade tooling — **no
new upgrade machinery is invented here**. It is the second adopter of that pattern and the proof that the
pattern is genuinely reusable.

The immediate motivation is the **transferable/giftable membership voucher** feature: with `MembershipManager`
upgradeable, voucher redemption ships as the membership proxy's **first in-place upgrade** (purely additive,
append-only storage) — no membership redeploy, no state migration, no broad role re-grant.

The migration itself is behavior-neutral: the proxy is stood up running the **current** logic, so nothing
about pricing, tiers, expiries, fees, or the purchase/upgrade/extend flows changes at cutover. Because
memberships are **30-day time-bound**, the legacy coexistence window drains in about a month — materially
easier than the open-ended wager case.

This is a funds-bearing, access-control change (it custodies membership payments and accrued fees and governs
who may replace that logic), so it is governed in full by Constitution Principle I.

## Clarifications

### Session 2026-06-20

- Q: What happens to memberships on the prior (non-upgradeable) MembershipManager at cutover? → A:
  **Coexistence, time-bounded.** The proxy is a new deployment; the legacy contract cannot be retro-wrapped.
  Existing memberships remain valid and usable on the legacy address until they expire (≤30 days); all **new**
  purchases/renewals go to the proxy. Because tiers are 30-day time-bound, the legacy contract naturally
  drains within a month, after which it is fully retired. No on-chain migration of membership state.
- Q: Who may authorize a MembershipManager upgrade? → A: The existing **admin role** via the air-gapped
  floppy keystore — the **same `UPGRADER_ROLE` mechanism** from spec 025 (`UUPSManaged`). No new role.
- Q: Does this feature change the voucher behavior itself? → A: No. This feature ONLY makes
  `MembershipManager` upgradeable (behavior-neutral). Voucher redemption is a **separate** feature that ships
  as the first in-place upgrade of the membership proxy; it is out of scope here beyond being the motivating
  consumer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stand up MembershipManager at an upgrade-capable address with zero behavior change (Priority: P1)

The maintainer deploys `MembershipManager` behind a stable, upgrade-capable address running the **current**
logic. From that moment members purchase, upgrade, and extend exactly as before; tier config, expiries,
accrued fees, and the `WagerRegistry` authorized-caller wiring all behave identically. It is a pure
infrastructure cutover.

**Why this priority**: This is the prerequisite and the minimum viable slice — without an upgrade-capable
address holding membership state, there is nothing to upgrade later. It must introduce no regression because
it sits under live membership payments.

**Independent Test**: Deploy the proxy with current logic to a test network, point a test
frontend/`WagerRegistry` at it, and run the full membership lifecycle (purchase each tier, upgrade, extend,
hit monthly/concurrent limits, accrue + withdraw fees, authorize a caller). Confirm identical outcomes to the
non-upgradeable `MembershipManager` and that paid funds and accrued fees are fully accounted for.

**Acceptance Scenarios**:

1. **Given** the upgradeable `MembershipManager` deployed with current logic, **When** a member runs any
   existing flow (purchase / upgrade / extend / limit checks / fee accrual & withdrawal), **Then** the outcome
   is identical to the prior non-upgradeable contract.
2. **Given** the migration, **When** the frontend and `WagerRegistry` are configured, **Then** they interact
   with a single stable address and need no special handling for it being upgradeable.
3. **Given** funds paid for memberships and accrued fees held by the contract, **When** the upgradeable
   contract is operating, **Then** every balance is fully accounted for and withdrawable through the normal
   treasury/fee paths.

---

### User Story 2 - Upgrade the membership logic in place, preserving the address and all state (Priority: P1)

An authorized administrator replaces `MembershipManager`'s logic with a new version. The on-chain address is
unchanged, and every existing membership (tier, expiry, monthly/concurrent counters), tier configuration,
accrued fees, treasury/payment-token settings, authorized-caller set, and bound terms hashes remain intact and
operable under the new logic. New behavior takes effect immediately, with no fresh deployment and no stranded
memberships.

**Why this priority**: This is the headline capability and the entire reason for the migration — it is what
lets the voucher feature (and every future membership change) ship without abandoning state. Inseparable from
US1.

**Independent Test**: From the deployed proxy with live memberships, deploy a new logic implementation that
adds an additive change, perform the upgrade as the admin, and confirm: the address is unchanged, every
pre-existing membership/tier/fee/wiring value reads back correctly, funds are intact, and the new logic is
active.

**Acceptance Scenarios**:

1. **Given** a deployed upgradeable `MembershipManager` with live memberships and accrued fees, **When** the
   admin upgrades the logic, **Then** the on-chain address is unchanged and the frontend/`WagerRegistry` need
   no repointing.
2. **Given** an upgrade, **When** it completes, **Then** all pre-existing memberships, tier configs, accrued
   fees, authorized callers, and terms hashes read back unchanged and remain operable (no loss, corruption, or
   reset).
3. **Given** an upgrade that adds new functionality (e.g. the voucher path), **When** it completes, **Then**
   the new functions/events are available while every previously existing function/event continues to work
   unchanged.
4. **Given** active memberships at the moment of upgrade, **When** the upgrade completes, **Then** their
   validity, expiry, and limit accounting continue uninterrupted.

---

### User Story 3 - Keep membership upgrades authorized, safe, and auditable (Priority: P2)

Only the admin (via the air-gapped floppy keystore, holding `UPGRADER_ROLE`) can upgrade the membership logic;
anyone else is refused. A storage-incompatible upgrade is blocked before it can take effect, the upgrade
entrypoint can never be permanently locked out, and every upgrade is observable on-chain and recorded in the
deployment artifacts.

**Why this priority**: Upgradeability over a funds-custodying contract is powerful and dangerous; it must be
tightly controlled and observable. Secondary only because it hardens the capability delivered by US1/US2.

**Independent Test**: Attempt an upgrade from a non-admin account (refused); attempt an upgrade with a
storage-incompatible implementation (blocked before it applies); confirm an upgrade emits an observable
on-chain record and is written to the deployment artifacts; confirm the upgrade entrypoint still exists after
an upgrade; confirm re-initialization fails.

**Acceptance Scenarios**:

1. **Given** a non-admin account, **When** it attempts to upgrade the membership logic, **Then** the attempt
   is refused and the logic is unchanged.
2. **Given** a proposed implementation whose storage layout is incompatible with the existing state, **When**
   the upgrade is prepared, **Then** it is blocked before being applied (no silent state corruption).
3. **Given** any successful upgrade, **When** it completes, **Then** it is observable on-chain and the new
   implementation is recorded in the `deployments/` artifacts.
4. **Given** any upgrade, **When** it completes, **Then** the ability to perform future upgrades is preserved
   (the upgrade authorization is never removed or bricked).
5. **Given** the deployed proxy, **When** anyone calls the one-time initializer again, **Then** it reverts.

---

### Edge Cases

- **Authorized-caller wiring across cutover**: `WagerRegistry` must be (re)authorized on the **proxy**
  `MembershipManager` so `recordCreate`/`recordClose` keep working; the legacy contract keeps its existing
  authorization for the memberships still settling there during coexistence.
- **In-flight memberships at upgrade**: an upgrade preserves each membership's tier, expiry, and rolling
  monthly/concurrent counters; no member loses time, limits, or standing.
- **Accrued fees at upgrade/cutover**: accrued fees are preserved across an upgrade and remain withdrawable to
  the treasury; the migration moves no funds.
- **Storage-incompatible upgrade**: blocked by the append-only storage-layout check before it applies.
- **Re-initialization attempt**: the one-time initializer cannot be called again (no seizing the admin role or
  resetting tiers/fees).
- **Upgrade while sanctions/pause controls are active**: upgrade authorization is independent of operational
  guards and is never locked out by them.
- **Legacy purchase after cutover**: new purchases/renewals are directed to the proxy; the app does not sell
  new memberships on the legacy address. Existing legacy memberships remain valid until they expire (≤30 days).

## Requirements *(mandatory)*

### Functional Requirements

#### Upgradeability (reusing the spec-025 pattern)

- **FR-001**: `MembershipManager` MUST be made upgradeable so its logic can be replaced **without changing the
  on-chain address** that members, the frontend, and `WagerRegistry` interact with.
- **FR-002**: The feature MUST reuse the shared upgrade primitives from spec 025 — the `UUPSManaged` base, the
  append-only storage-layout safety check, and the deploy/upgrade tooling — and MUST NOT introduce a new or
  parallel upgrade mechanism.
- **FR-003**: An upgrade MUST preserve **all** existing persistent state with no loss, corruption, or reset:
  every membership (tier, expiry, monthly count, concurrent count, anchors), all tier configuration, accrued
  fees, payment-token and treasury settings, the authorized-caller set, and bound terms hashes.
- **FR-004**: After an upgrade, **every** existing membership flow (purchase, upgrade, extend, limit checks,
  fee accrual and withdrawal, authorized-caller hooks) MUST behave identically, and active memberships MUST
  continue uninterrupted.
- **FR-005**: An upgrade MUST be able to introduce **additive** new functions, events, and state (e.g. the
  voucher path) while keeping every previously existing function, event, and error working unchanged.

#### The migration (cutover)

- **FR-006**: The migration MUST first stand up the upgradeable `MembershipManager` running the **current**
  logic, so the cutover introduces no behavioral change (pure infrastructure).
- **FR-007**: The contract's externally observed interface (function signatures, events, errors, and returned
  membership data shape) consumed by the frontend and `WagerRegistry` MUST remain **stable** across the
  migration; subsequent changes are additive only.
- **FR-008**: Memberships on the prior non-upgradeable contract MUST remain valid and usable on their original
  address until they expire; **new** purchases and renewals MUST be directed to the proxy. No on-chain
  migration of membership state is required. The legacy contract is retired once its memberships drain
  (≤30 days).
- **FR-009**: `WagerRegistry` MUST be authorized as a caller on the **proxy** `MembershipManager` so
  `recordCreate`/`recordClose` continue to function; this wiring MUST be part of the cutover.
- **FR-010**: The migration and any upgrade MUST keep all paid funds and accrued fees fully accounted for and
  withdrawable; no upgrade or cutover may strand, lock, or double-count funds.

#### Authorization and safety (inherited from UUPSManaged)

- **FR-011**: Only an authorized **administrator** (the existing admin role via the air-gapped floppy
  keystore, holding `UPGRADER_ROLE`) MUST be able to upgrade the membership logic; any non-admin attempt MUST
  be rejected.
- **FR-012**: A proposed upgrade whose state layout is **incompatible** with the existing stored state MUST be
  prevented before it can take effect; only append-only additions to state are permitted.
- **FR-013**: The one-time initializer that replaces the contract constructor MUST be callable **exactly
  once** and MUST NOT be re-invokable thereafter.
- **FR-014**: The upgrade authorization mechanism MUST be preserved across every upgrade — no upgrade may
  permanently remove or brick the ability to perform future upgrades.

#### Observability and operations

- **FR-015**: Every upgrade MUST be **auditable**: observable on-chain and written to the `deployments/`
  artifacts (the stable proxy address and the current implementation address both recorded).
- **FR-016**: The frontend MUST obtain contract addresses and ABIs only from the generated sync artifacts; the
  proxy is the stable membership address, and after an upgrade only the ABI changes.
- **FR-017**: The migration MUST be validated on the testnet (Amoy) and pass the full existing test suite
  before any mainnet (Polygon) cutover; legacy read-only networks (Mordor/ETC) are out of scope.

### Key Entities *(include if feature involves data)*

- **MembershipManager Proxy (stable front)**: The permanent on-chain address that custodies membership state
  and funds and that members / frontend / `WagerRegistry` interact with. Survives every upgrade.
- **MembershipManager Implementation (swappable)**: The replaceable logic contract. Holds no state of its own;
  only the proxy does. One active version at a time.
- **Membership State**: Per-member tier, expiry, rolling monthly count, concurrent count, and anchors —
  preserved across upgrades.
- **Tier Configuration**: Per-role tier pricing, duration, active flag, and limits — preserved across
  upgrades.
- **Accrued Fees / Treasury / Payment Token**: Funds and settings the contract custodies — preserved and
  withdrawable across upgrades.
- **Authorized Callers**: The set (notably `WagerRegistry`) permitted to call membership hooks — preserved;
  re-wired to the proxy at cutover.
- **Upgrade Authorization (`UPGRADER_ROLE`)**: The admin-gated capability (from `UUPSManaged`) to point the
  proxy at a new implementation; bound to the floppy-keystore admin.
- **Legacy MembershipManager**: The prior non-upgradeable deployment; valid until its (≤30-day) memberships
  expire, then retired.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A membership-logic upgrade changes contract behavior with the **on-chain address unchanged** —
  the frontend and `WagerRegistry` require no address change to keep working.
- **SC-002**: **100%** of existing memberships, tier configs, accrued fees, authorized callers, and terms
  hashes remain readable and operable after an upgrade (no state loss or corruption).
- **SC-003**: **100%** of the existing `MembershipManager` test suite passes against the proxied contract with
  no regression (behavior-neutral migration).
- **SC-004**: An unauthorized upgrade attempt is rejected **100%** of the time; only `UPGRADER_ROLE` can
  upgrade.
- **SC-005**: A storage-incompatible upgrade is blocked **before** deployment and is never silently applied.
- **SC-006**: The voucher-redemption feature deploys as an in-place upgrade of the membership proxy with
  **zero stranded memberships** and **zero address changes**.
- **SC-007**: **Every** upgrade is observable on-chain and recorded in the `deployments/` artifacts.
- **SC-008**: Re-initialization of the contract after the first initialization fails **100%** of the time.
- **SC-009**: The feature adds **no new upgrade machinery** — it reuses `UUPSManaged`, the storage-layout
  check, and the deploy/upgrade tooling from spec 025 (verified by inspection: no duplicated proxy/auth code).

## Assumptions

- **Builds directly on spec 025.** `UUPSManaged`, `scripts/deploy/lib/upgradeable.js`, and the
  `check:storage-layout` gate already exist and are contract-agnostic; this feature adopts them. Spec 025 MUST
  be merged/deployed first on each target network.
- **UUPS proxy, same as WagerRegistry.** State at the proxy; logic swappable; `_disableInitializers` on the
  implementation; one-time `initialize`; non-brickable `_authorizeUpgrade` gated by `UPGRADER_ROLE`. Internals
  belong to `plan.md`.
- **Cutover = coexistence, time-bounded.** The live non-upgradeable `MembershipManager` cannot be
  retro-wrapped; existing memberships settle on the legacy address and drain within ~30 days (their tier
  duration); new purchases use the proxy. No on-chain state migration.
- **Admin keys unchanged.** Upgrades authorized by the existing admin role via the floppy keystore; no new
  roles or key mechanisms.
- **Backward compatibility.** The external interface (functions, events, errors, membership data shape) is
  stable across the migration so the frontend, `WagerRegistry`, and the voucher feature layer additive changes
  on top.
- **No change to membership economics.** Pricing, tiers, durations, limits, and fee math are untouched; this
  is an infrastructure migration only.
- **Conversion gotcha (carried from 025).** Any inline state initializers MUST move into `initialize` (inline
  initializers do not run behind a proxy); storage stays append-only with a trailing `__gap`.
- **Networks**: Polygon mainnet + Amoy testnet; legacy read-only networks (Mordor/ETC) out of scope.
- **Dependent feature**: transferable/giftable membership **voucher redemption** is sequenced to ship as the
  **first in-place upgrade** of this proxy and depends on this feature being deployed first.
