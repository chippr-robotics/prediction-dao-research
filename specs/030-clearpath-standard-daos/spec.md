# Feature Specification: ClearPath Standard DAOs & External DAO Connectors

**Feature Branch**: `feat/clearpath-standard-daos-030`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "ClearPath Standard DAOs — the foundation of the ClearPath module, shipped before the futarchy spec (029). Two pillars: (A) members launch native standard (traditional-governance) DAOs — token- or NFT-membership voting, a USDC treasury, propose→vote→timelock→execute, roles/ownership — using OpenZeppelin Governor + Timelock; (B) members register, track, and manage DAOs deployed by other platforms, with an Olympia DAO connector first (OZ Governor on Ethereum Classic), designed against the standard IGovernor interface so it generalizes. Embedded as its own My Account (Account Center) tab, wired into membership, notifications, and sanctions, on new UUPS contracts (OZ 5.4.0) for Mordor + Amoy. No futarchy in this spec."

## Overview

ClearPath is the platform's DAO governance module, embedded as its own tab in the
My Account (Account Center) pages. This spec delivers the **standard
(traditional-governance) DAO foundation** and the ability to **connect to DAOs from
other platforms** — so members get a working DAO home immediately. The advanced
**futarchy** governance mode (LMSR conditional markets + welfare-metric resolution)
is a follow-on (spec 029) layered on top of this foundation.

Two pillars:

- **Native standard DAOs** — a member launches a traditional-governance DAO with
  voting weight from a governance **token** or a **membership NFT**, a **USDC
  treasury**, and a standard proposal lifecycle (propose → vote → timelock/queue →
  execute), plus scoped roles, parameter configuration, and ownership
  transfer/renounce. ClearPath uses **standard, audited governance (OpenZeppelin
  Governor + TimelockController)** rather than a bespoke scheme.
- **External DAO registry + connectors** — a member registers an existing DAO
  deployed elsewhere by its address, ClearPath validates it is a recognized
  governance contract, and then **tracks** its real treasury, proposals, vote
  tallies, and membership, and lets the member take **native governance actions**
  (propose / vote / queue / execute) where the external DAO's own rules authorize
  their wallet. The first connector targets **Olympia DAO** on Ethereum Classic (an
  OpenZeppelin Governor + soulbound-NFT-membership treasury DAO); because it is
  built against the standard **IGovernor** interface, it generalizes to any
  Governor-based DAO. ClearPath takes **no custody or authority** over external
  DAOs — it is a registry, dashboard, and action-router.

Because ClearPath's own standard DAOs are themselves OZ Governor, **the same
governance UI serves both native and external DAOs**, and they appear together in
the member's "My DAOs" list, clearly labeled by type/framework and network-scoped.

Like Token Mint (spec 028), ClearPath lives as **its own tab in the My Account
(Account Center)** pages, is gated by **MembershipManager** tiers, surfaces every
action through the **app-level notification system**, enforces **SanctionsGuard**
non-bypassably on value-moving actions, is **theme-aware** (light/dark) and
accessible, runs entirely within the platform's **no-backend** footprint, and shows
**real on-chain state only** — never mock data.

## Clarifications

### Session 2026-06-24

- Q: For native standard DAOs, what determines voting power? → A: **Both, selectable at creation** — a governance token (`ERC20Votes`, may reuse the spec-028 token factory) or a membership NFT (1 member = 1 vote); the **default presented option is membership-NFT** (mirrors Olympia).
- Q: How are registered external DAOs stored / discovered? → A: A lightweight **on-chain, network-scoped `ExternalDAORegistry`** records `(address, framework, label)` for shared discovery + subgraph indexing (fits the no-backend footprint); ClearPath still holds **no authority** over the external DAO.
- Q: What's in the first external-DAO deliverable — track-only or also management? → A: **Include signed native management actions** (create proposal / vote / queue / execute via the connector, user-signed) **from the start**, alongside read-only tracking — not deferred to a later phase.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Launch a standard DAO (Priority: P1)

An authorized member creates a native standard DAO, choosing its name, purpose,
voting-weight source (a governance token or a membership NFT), a USDC treasury, and
governance parameters (voting delay/period, quorum, timelock). The transaction is
submitted on-chain and, once confirmed, the DAO appears in the member's "My DAOs"
list with its real deployed governor + treasury.

**Why this priority**: The smallest end-to-end slice that proves the full create →
deploy → list → govern loop against real on-chain state, and the foundation the
proposal lifecycle (US4) and futarchy (spec 029) build on. The MVP.

**Independent Test**: Connect an authorized wallet, create a token-voted standard
DAO, confirm the transaction, and verify the deployed governor + timelock + treasury
exist on-chain and appear in My DAOs — no mock data anywhere.

**Acceptance Scenarios**:

1. **Given** an authorized member, **When** they submit a valid DAO creation (name,
   purpose, voting source, treasury, params), **Then** a governor + timelock + USDC
   treasury are deployed on-chain and the confirmed DAO address is shown.
2. **Given** a creation form, **When** the member picks token-weighted vs
   NFT-membership voting, **Then** the deployed DAO uses exactly that voting source.
3. **Given** a pending creation, **When** it is unconfirmed, **Then** the UI shows
   it pending and does not present the DAO as finalized until the chain confirms.
4. **Given** a wallet below the required membership tier or a sanctioned wallet,
   **When** it attempts to create a DAO, **Then** the action is blocked with a
   surfaced reason (before signing and on-chain).

---

### User Story 2 - Discover, inspect & join DAOs (Priority: P1)

From the My Account → **ClearPath** tab, a member browses DAOs on the active
network (native + external, clearly labeled), opens a DAO's detail view (purpose,
treasury, proposals, members, roles), and joins or follows a DAO they are eligible
for.

**Why this priority**: Establishes the Account Center module home and makes launched
and registered DAOs visible/usable; paired with US1/US3 it yields the complete
"create or add a DAO, find it, engage" loop.

**Independent Test**: After a DAO is created/registered, open the ClearPath tab,
find it in the explorer, open its detail view and confirm the displayed
treasury/members/proposals match real on-chain values, then join/follow it.

**Acceptance Scenarios**:

1. **Given** DAOs exist on the active network, **When** a member opens the ClearPath
   explorer, **Then** each DAO shows name, type/framework (native vs external),
   member/holder count, treasury balance, and active-proposal count from chain/index.
2. **Given** a DAO detail view, **When** a member opens it, **Then** treasury,
   members, proposals, and roles are shown truthfully from chain.
3. **Given** an eligible member, **When** they join/follow a DAO, **Then** it appears
   in their "My DAOs" list (native + external unified, labeled).
4. **Given** the active network, **When** DAOs are listed, **Then** only that
   network's DAOs appear and data never leaks across networks; on a network without
   ClearPath deployed, the feature is disabled with a truthful message.

---

### User Story 3 - Register & track an external DAO (Priority: P1)

A member registers an existing DAO deployed by another platform (e.g. **Olympia
DAO**) by its address; ClearPath validates it is a recognized governance contract,
adds it to the registry with an optional label, and tracks its real treasury,
proposals + vote tallies + states, and membership — read-only.

**Why this priority**: The user emphasized that adding and tracking DAOs from other
platforms is important; this is independently valuable (a multi-DAO dashboard) even
before native creation, and it shares the unified My DAOs surface with US1/US2.

**Independent Test**: Register a real external DAO (Olympia on Mordor) by address,
confirm it is validated and added, and confirm its treasury balance, proposals, and
membership shown match the external DAO's real on-chain state — with a truthful
"unavailable" state if the data source is unreachable, never fabricated rows.

**Acceptance Scenarios**:

1. **Given** the address of a recognized external governance contract, **When** a
   member registers it, **Then** it is validated, added to the network-scoped
   registry with its framework/type and label, and appears in My DAOs / Explorer.
2. **Given** an address that is not a recognized governance contract, **When** a
   member tries to register it, **Then** registration is rejected with a truthful
   reason and nothing is added.
3. **Given** a registered external DAO, **When** its detail view is opened, **Then**
   its treasury, proposals + vote tallies + states, and membership are shown
   truthfully from the external DAO's on-chain state/index.
4. **Given** a network without indexing for the external DAO, **When** its data is
   requested, **Then** ClearPath falls back to on-chain reads or shows a truthful
   "unavailable on this network" state — never fabricated data.

---

### User Story 4 - Run a proposal on a native DAO (Priority: P2)

A member of a native standard DAO submits a proposal (a USDC treasury action or a
parameter change), other members vote during the voting period, and after the
timelock the passed proposal is queued and executed.

**Why this priority**: Proposals are the unit of governance; this completes the
native standard-DAO lifecycle on top of US1, and is the standard counterpart the
futarchy spec later swaps the decision mechanism into.

**Independent Test**: Submit a treasury-funding proposal, cast enough votes to reach
quorum and succeed, advance past the timelock, queue and execute it, and confirm the
recipient is funded on-chain; separately, a defeated proposal performs no action.

**Acceptance Scenarios**:

1. **Given** an eligible member, **When** they submit a valid proposal, **Then** it
   is recorded with a voting schedule and its state progresses (pending → active).
2. **Given** an active proposal, **When** members cast votes, **Then** tallies
   update on-chain and the proposal succeeds iff quorum + majority are met.
3. **Given** a succeeded proposal, **When** the timelock elapses and it is queued
   and executed, **Then** the treasury action executes on-chain (recipient funded /
   parameter changed) exactly once.
4. **Given** a defeated or expired proposal, **When** execution is attempted, **Then**
   it is rejected and no treasury action occurs.

---

### User Story 5 - Manage an external DAO (Priority: P2)

For a registered external DAO, where the connected wallet is authorized by the
external DAO's own rules, the member takes native governance actions — create a
proposal, cast a vote, queue, execute — constructed by the connector and signed by
the member; ClearPath holds no authority of its own.

**Why this priority**: "Connect with and manage" the external DAO is the second half
of the external-DAO ask; it depends on registration/tracking (US3) and reuses the
same IGovernor surface as native DAOs (US4).

**Independent Test**: On a registered Olympia DAO, as a wallet holding its
membership NFT, cast a vote on an open proposal through ClearPath and confirm the
vote is recorded on the external DAO; as a wallet without authority, confirm the
action is rejected by the external DAO's own rules.

**Acceptance Scenarios**:

1. **Given** a registered external DAO and an authorized wallet, **When** the member
   casts a vote / creates a proposal / queues / executes through ClearPath, **Then**
   the action is executed on the external DAO's own contract, signed by the member.
2. **Given** a wallet not authorized by the external DAO's rules, **When** it
   attempts such an action, **Then** the external DAO rejects it and the reason is
   surfaced.
3. **Given** an external action that moves value through a ClearPath-mediated path,
   **When** the actor or recipient is sanctioned, **Then** sanctions screening blocks
   it.
4. **Given** a framework ClearPath has no connector for, **When** management is
   requested, **Then** ClearPath tracks read-only and offers a truthful deep-link to
   the external app rather than a broken action.

---

### User Story 6 - Administer a DAO: roles, parameters & ownership (Priority: P2)

A native-DAO administrator grants/revokes scoped roles (e.g. proposer, treasurer,
canceller), configures governance parameters, and transfers or renounces
administrative ownership.

**Why this priority**: Delegated least-privilege administration and safe hand-off
are required for real organizations operating a DAO.

**Independent Test**: Grant the proposer role to a second wallet and confirm only it
(and admins) can propose; revoke it and confirm proposing is blocked; transfer
ownership and confirm the prior admin loses authority.

**Acceptance Scenarios**:

1. **Given** a DAO, **When** an admin grants a role, **Then** that address can
   perform exactly the actions the role authorizes and nothing more (on-chain).
2. **Given** a role holder, **When** an admin revokes the role, **Then** the address
   can no longer perform that action.
3. **Given** governance parameters, **When** an admin updates them (within the rules),
   **Then** subsequent proposals use the updated parameters.
4. **Given** ownership transfer/renounce, **When** an admin assigns a new owner or
   renounces, **Then** authority moves accordingly (renounce irreversible, behind a
   clear warning) and unauthorized callers are rejected on-chain.

---

### User Story 7 - Review activity & event history (Priority: P3)

Any user reviewing a DAO (native or external) sees its on-chain governance history —
DAO created/registered, member joined, proposal created, votes, queued, executed —
with type, actor, transaction, and time, filterable by category.

**Why this priority**: An auditable governance trail builds trust but is read-only
and depends on event indexing.

**Independent Test**: Create and execute a proposal, then open the activity history
and confirm both events appear with the correct actor, transaction, and time, and
that category filters narrow the list.

**Acceptance Scenarios**:

1. **Given** a DAO with on-chain actions, **When** the activity view is opened,
   **Then** each event shows type, detail, actor, transaction, and time from indexed
   on-chain data.
2. **Given** the activity view, **When** the user filters by category, **Then** only
   matching events are shown.
3. **Given** a network without indexing, **When** the activity view is opened, **Then**
   it falls back to on-chain reads or is disabled with a truthful message — never
   fabricated events.

---

### User Story 8 - Inspect the contract surface (Priority: P3)

Any user can view a DAO's contract surface: its governor/treasury/voting-token
addresses, framework/type, per-network deployment, and (for native DAOs) metadata;
and can copy addresses or the governor ABI, with explorer deep links.

**Why this priority**: Transparency about the underlying contracts supports trust and
integration, and is read-only.

**Independent Test**: Open a DAO's contract view and confirm the displayed
governor/treasury addresses and framework match the real deployment/registry and
explorer; copy an address/ABI and confirm correctness.

**Acceptance Scenarios**:

1. **Given** a native or external DAO, **When** the contract view is opened, **Then**
   its governor/treasury/token addresses, framework, and explorer links reflect the
   real on-chain/registry state.
2. **Given** the contract view, **When** the user copies an address or ABI, **Then**
   the copied value matches the deployed contract.
3. **Given** an external DAO, **When** the view is shown, **Then** it is clearly
   labeled as externally deployed (ClearPath holds no authority over it).

---

### Edge Cases

- **Invalid DAO/proposal metadata**: empty name/purpose, invalid voting source,
  a funding amount exceeding the treasury, or an invalid recipient are rejected
  before submission.
- **Invalid external address**: registering an EOA, a non-governance contract, or a
  contract on the wrong network is rejected with a truthful reason; nothing is added.
- **Transaction failure / rejection**: a reverted or user-rejected create, register,
  propose, vote, queue, or execute leaves no phantom DAO/proposal in any list.
- **Membership revoked mid-session**: a member whose tier drops below the requirement
  can no longer create/register, reflected on next action.
- **Sanctioned actors**: a sanctioned wallet cannot create a DAO, fund a treasury,
  execute a disbursement, or be a disbursement recipient, in every ClearPath-mediated
  flow.
- **External DAO not authorizing the wallet**: a management action the external DAO's
  rules forbid is rejected by the external DAO; ClearPath surfaces the reason and
  does not imply success.
- **Unsupported external framework**: ClearPath tracks read-only and deep-links to
  the external app rather than offering a broken action.
- **Treasury underfunded for an executed action**: execution that would exceed the
  treasury balance is rejected; an executed proposal cannot overdraw the vault.
- **Network without support / subgraph-less**: the feature self-disables truthfully,
  and tracking falls back to on-chain reads or a truthful "unavailable" state — never
  fabricated rows.

## Requirements *(mandatory)*

### Functional Requirements

**Native standard DAOs (US1/US4)**

- **FR-001**: The system MUST allow an authorized member to create a native standard
  DAO specifying at least name, purpose, a **voting-weight source selectable at
  creation — a governance token (`ERC20Votes`) or a membership NFT (1 member = 1
  vote), defaulting to membership-NFT** — a USDC treasury, and governance parameters
  (voting delay, voting period, quorum, timelock delay), deploying the governance +
  treasury contracts on-chain.
- **FR-002**: A native DAO MUST support a standard proposal lifecycle — submit a
  proposal (a USDC treasury action or a parameter change), vote during the voting
  period, and (after the timelock) queue and execute a passed proposal — with vote
  tallies and proposal state read truthfully from chain.
- **FR-003**: A native DAO's treasury MUST be disbursable only by an executed
  proposal, MUST reject an action that would overdraw it, and MUST execute a passed
  proposal's action **exactly once**.
- **FR-004**: DAO and proposal creation MUST execute as real on-chain transactions
  and MUST NOT present a DAO/proposal as finalized before the chain confirms it. No
  mock-only flow may ship in production paths.

**External DAO registry & connectors (US3/US5)**

- **FR-005**: The system MUST allow a member to register an existing external DAO by
  (network, address, framework/type) with an optional label into a lightweight
  **on-chain, network-scoped registry** (shared discovery + subgraph-indexable), MUST
  validate that the address is a recognized governance contract (e.g. responds to the
  standard IGovernor interface) before adding, and MUST reject unrecognized/invalid
  addresses. The registry grants ClearPath **no authority** over the external DAO.
- **FR-006**: The system MUST track a registered external DAO **read-only** — its
  treasury balance, proposals + vote tallies + proposal states, and membership —
  sourced from the external DAO's on-chain state/indexing, strictly network-scoped
  and truthful.
- **FR-007**: Where the connected wallet is authorized by the external DAO's **own**
  rules, the system MUST allow native governance actions (create proposal, cast
  vote, queue, execute) constructed through a per-framework connector and signed by
  the member; the system MUST take no custody or authority of its own over external
  DAOs and MUST surface the external DAO's rejection reason when an action is not
  authorized.
- **FR-008**: The system MUST ship an **Olympia** connector first, designed against
  the standard IGovernor interface so it generalizes to other Governor-based DAOs;
  for frameworks without a connector, the system MUST track read-only and offer a
  truthful deep-link rather than a broken action.

**Unified discovery & administration (US2/US6/US7/US8)**

- **FR-009**: The system MUST present native and external DAOs together in a member's
  DAO list and an active-network explorer, each clearly labeled by type/framework and
  network-scoped, and MUST let an eligible member join/follow a DAO.
- **FR-010**: A native DAO MUST be administered through scoped, least-privilege roles
  (e.g. proposer, treasurer, canceller, admin); the system MUST allow an admin to
  grant/revoke roles and configure governance parameters, with every role-gated
  action enforced on-chain, and MUST allow ownership transfer and irreversible
  renounce (behind a clear warning).
- **FR-011**: The system MUST present a per-DAO activity/event history (type, detail,
  actor, transaction, time) with category filtering, and a contract surface
  (governor/treasury/token addresses, framework, per-network deployment, explorer
  links, copy address/ABI), sourced from real on-chain/indexed/registry state.

**Platform integration & cross-cutting (parity with spec 028)**

- **FR-012**: ClearPath MUST be presented as **its own section/tab within the My
  Account (Account Center)** pages — not a standalone sub-app and not a top-level app
  navigation tab — consistent with the Token Mint module (spec 028). This spec
  establishes the ClearPath module home.
- **FR-013**: Authorization MUST integrate with the platform's **existing
  membership/access-control system** (MembershipManager tiers/roles) to gate creating
  a native DAO, registering an external DAO, and privileged actions — not a parallel
  permission system.
- **FR-014**: Every user-initiated action (create DAO, register external DAO, join,
  propose, vote, queue, execute, role grant/revoke, ownership transfer) MUST surface
  through the **app-level notification system** with honest submitted/confirmed/failed
  state; passive background data loads MUST use accessible inline status/alerts rather
  than toasts.
- **FR-015**: The platform's **sanctions screening** MUST be enforced non-bypassably
  and fail-closed on every ClearPath-mediated value-moving action (create a DAO, fund
  a treasury, execute a disbursement) and on disbursement recipients, using the same
  sanctions system as the rest of the platform; read-only tracking of external DAOs
  is not gated.
- **FR-016**: ClearPath data MUST be **scoped to the active network** and MUST NOT
  leak across networks; on networks where the feature is not deployed it MUST be
  disabled with a truthful explanation.
- **FR-017**: The feature MUST surface honest transaction state and MUST NOT leave
  phantom DAOs, proposals, or registry entries in any list when a transaction does
  not confirm.
- **FR-018**: The contracts that hold authority/state over the ClearPath system
  (factory, registry, native governance/treasury) MUST follow the project's
  **upgradeable-contract pattern** where they hold state or authority, preserving
  state across logic upgrades, with append-only storage validated by the
  storage-layout gate.
- **FR-019**: The ClearPath UI MUST be **theme-aware** (respecting the app's
  light/dark theme variables) and MUST meet WCAG 2.1 AA, following the token module's
  theming approach.
- **FR-020**: The feature MUST operate within the platform's **no-backend footprint**
  (no app server added); DAO/proposal/member/activity enumeration (native and
  external) MUST use subgraph indexing with an on-chain RPC fallback or a **truthful
  disable** on subgraph-less networks (Mordor/ETC) — it MUST NOT display fabricated
  DAOs, proposals, members, or events.

### Key Entities *(include if feature involves data)*

- **Standard DAO (native)**: A traditional-governance DAO created through the
  feature. Attributes: name, purpose, voting source (governance token or membership
  NFT), governor + timelock + treasury addresses, governance parameters, network,
  creator/admins.
- **Voting Source**: A governance token (token-weighted) or a membership NFT
  (membership-weighted) that determines voting power for a native DAO.
- **Treasury / Vault**: A native DAO's USDC funds, disbursable only by an executed
  proposal.
- **Proposal**: A funded action (treasury action = amount + recipient, or a
  parameter change) with a standard state lifecycle (pending → active →
  succeeded/defeated → queued → executed/expired) and a voting schedule.
- **Vote**: A member's cast vote on a proposal, weighted by the voting source.
- **Administrative Role**: A scoped authority over a native DAO (e.g. proposer,
  treasurer, canceller, admin), least-privilege, tracked with grant time.
- **External DAO**: A registry entry for a DAO deployed by another platform —
  network, address, framework/type, label, and discovered governor/treasury/token
  references; tracked read-only, managed via the user's own authority.
- **DAO Connector / Adapter**: A per-framework read+act interface (Olympia / OZ
  Governor first) ClearPath uses to read an external DAO's state and construct native
  actions for the user to sign.
- **DAO Registry / List**: The per-network record of native DAOs created and external
  DAOs registered through the feature, used for discovery and a member's DAO list.
- **Governance Activity Event**: An indexed on-chain event (created/registered,
  joined, proposed, voted, queued, executed) powering the activity history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized member can create a native standard DAO and see it
  confirmed with its real on-chain governor + treasury, end-to-end, in under 3
  minutes on a supported network.
- **SC-002**: 100% of DAOs/proposals/registry entries shown as created/registered in
  the UI correspond to confirmed on-chain state — zero phantom or mock entries appear.
- **SC-003**: A member can register a real external DAO (e.g. Olympia on Mordor) and
  see its actual treasury, proposals, and membership from chain in 100% of supported
  cases; an unrecognized address is rejected, and an unreadable data source yields a
  truthful "unavailable" state — never fabricated rows.
- **SC-004**: Treasury safety holds for native DAOs: only an executed proposal
  disburses funds, the treasury can never overdraw, and a passed proposal executes
  exactly once — verified by tests.
- **SC-005**: No sanctioned address can create a DAO, fund a treasury, execute a
  disbursement, or be a disbursement recipient, in any ClearPath-mediated flow.
- **SC-006**: Authorization holds: only members with the required tier/role can
  create/register/administer, and unauthorized callers are rejected on-chain (not only
  in the UI), verified for both authorized and unauthorized paths.
- **SC-007**: An external management action taken through ClearPath succeeds only when
  the external DAO's own rules authorize the wallet, is signed by the member, and
  leaves ClearPath with no authority over the external DAO — verified against a real
  Governor DAO.
- **SC-008**: ClearPath data never crosses network boundaries: switching networks
  shows only that network's DAOs in 100% of cases, and unsupported networks disable
  the feature with a clear message.
- **SC-009**: Every user-initiated ClearPath action is a real on-chain transaction
  with honest pending/confirmed/failed state surfaced through the app notification
  system — verified by tests covering success and failure paths.
- **SC-010**: DAO/proposal/member/activity data shown matches real on-chain/indexed
  state (no fabricated rows); on networks without indexing the affected view falls
  back to on-chain reads or disables truthfully in 100% of cases.
- **SC-011**: The ClearPath UI renders correctly in light and dark themes and passes
  automated accessibility (axe) checks with no violations.
- **SC-012**: The full automated test suite (contract unit + integration +
  upgrade-lifecycle, subgraph Matchstick, frontend Vitest incl. axe) passes in CI,
  and security static analysis/fuzzing report no new high/critical findings.

## Assumptions

- **Governance basis**: Native standard DAOs use **OpenZeppelin Governor +
  TimelockController** with OZ Votes-based voting power — a governance token
  (`ERC20Votes`, which may reuse the spec-028 token factory) or a membership NFT
  (`ERC721Votes`/soulbound), selectable at creation. The default presented option is
  membership-NFT (1 member = 1 vote), mirroring Olympia; token-weighted is the
  alternative. OZ Governor on OZ 5.4.0 / EVM `paris` (ETC/Mordor-compatible) is
  assumed deployable — to be confirmed in planning (OZ ≥ 5.5 needs Cancun `mcopy`).
- **External connector**: The Olympia connector targets the standard OZ **IGovernor**
  interface (`propose`, `castVote`, `state`, `proposalVotes`, `queue`, `execute`) plus
  reading the treasury balance and membership token, so it generalizes to any
  Governor-based DAO. Olympia is OZ Governor v5.1.0 (soulbound NFT = 1 vote) +
  TimelockController + OlympiaTreasury + OlympiaExecutor + SanctionsOracle, deployed on
  ETC mainnet + Mordor (demo_v0.2; github.com/olympiadao). Additional frameworks
  (Aragon/Moloch/Safe) are later connectors.
- **No authority over external DAOs**: "Manage" means ClearPath constructs native
  governance actions the member **signs** with their own wallet, gated by the external
  DAO's own access control; ClearPath holds no keys, roles, or custody, and offers a
  deep-link to the external app as a fallback. A lightweight on-chain registry records
  registered external DAOs (network-scoped, for shared discovery + indexing) but
  grants ClearPath no power over them. **Signed management actions are in scope for
  this spec from the start** (clarified 2026-06-24) — not deferred to a later phase —
  alongside read-only tracking.
- **Reuse of platform infrastructure**: Integrates with the existing
  `MembershipManager` (authorization) and `SanctionsGuard` (screening) and reuses the
  per-network **USDC** as the native treasury asset, `UUPSManaged`,
  `lib/upgradeable.js`, `check:storage-layout`, `sync:frontend-contracts`, the
  subgraph data-source-template pattern, and the app notification/theme systems.
- **On-chain stack & networks**: New upgradeable contracts target OpenZeppelin 5.4.0
  / Solidity ^0.8.24 / EVM `paris`, inherit `UUPSManaged`, use a one-time
  `initialize`, keep storage append-only with a trailing gap (storage-layout gated),
  and deploy to **Mordor (63) + Amoy (80002)** first (Polygon later).
- **Account Center placement**: ClearPath is embedded as a tab in the My Account
  (Account Center) pages exactly like the spec-028 Tokens tab — not a standalone app
  and not a top-level nav item; the old dual-app architecture is not revived.
- **Archived designs are reference only**: `contracts-archive/core/DAOFactory.sol` and
  `docs/archived/` inform the design but are **not** imported or deployed; new active
  contracts are written against current standards. `docs/system-overview/
  governance.md` (which currently states "no DAO") is updated to reflect ClearPath as
  an opt-in module.
- **Sequencing**: This standard-DAO foundation ships first; the **futarchy** governance
  mode (spec 029 — LMSR conditional markets + welfare-metric resolution) is the
  follow-on layered on top. Native standard DAOs being OZ Governor means the same
  governance UI serves native and external DAOs.
- **Indexing dependency**: Discovery, proposal/member lists, and activity history
  depend on subgraph indexing; on subgraph-less networks (Mordor/ETC) they fall back
  to on-chain reads where feasible or disable truthfully — never fabricated
  (Constitution III).
