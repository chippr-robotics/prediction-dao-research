# Feature Specification: ClearPath Network-Agnostic Multi-Network DAO Support

**Feature Branch**: `042-clearpath-multi-network`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "We need to make the ClearPath app network agnostic so it is more capable of supporting DAOs on different networks. We are integrating with several services such as ENS, Morpho, Uniswap, and potentially others which live on different chains. Since our app plans to integrate with them we should also support their DAO activities and ClearPath is the most direct and obvious place for these to live."

## Overview

ClearPath (spec 030) is the platform's DAO governance module — a registry, dashboard,
and action-router for standard-governance DAOs, embedded as a My Account (Account
Center) tab. Today it can only reach DAOs on the app's **wager networks**, and its
whole surface self-disables anywhere the on-chain `ExternalDAORegistry` is not
deployed (currently only Ethereum Classic Mordor). Yet the DAOs the platform most
wants to support — **ENS, Uniswap, Morpho, and others** — live on chains ClearPath
does not treat as first-class, principally **Ethereum mainnet** (with Base, Arbitrum,
and Optimism as follow-ons).

This feature makes ClearPath **network-agnostic**: a member can discover, track, and
(where the DAO's own rules authorize their wallet) act on a governance DAO on any
supported EVM network, **without** the platform having to deploy wager/DEX/registry
infrastructure on that network first. It removes two structural blockers:

1. **A closed network model.** The per-chain config assumes every network is a full
   wager network (escrow, USDC treasury asset, DEX, passkey). There is no concept of a
   **read-capable, ClearPath-only network**. This feature introduces networks whose
   only enabled capability is ClearPath DAO tracking — so Ethereum mainnet can be added
   for governance **without** the app implying wagers or swaps run there.

2. **Registry-gated availability.** ClearPath treats the presence of a deployed
   `ExternalDAORegistry` as the on/off switch for the entire module. Because the reads
   are pure client-side RPC, this gate is unnecessary and wrongly disables the module on
   every chain without the contract. This feature makes the on-chain registry an
   **optional shared-discovery layer** (used where it exists, e.g. Mordor) with a
   **registry-less fallback** (a per-member client-side tracked-DAO list) everywhere
   else, so a member can register-by-address and track a DAO on Ethereum mainnet with no
   new contract deploy.

It also generalizes the connector layer. ClearPath already reads any OpenZeppelin
`IGovernor` DAO generically (ENS qualifies — it is an OZ Governor on Ethereum mainnet).
But **Uniswap governance is GovernorBravo/Compound-style** (a different interface), and
Morpho's on-chain governance differs again. This feature turns the single OZ-Governor
connector into a **pluggable, per-framework connector layer** — shipping **OZ Governor
+ GovernorBravo** so ENS and Uniswap both work, and leaving Morpho and further
frameworks as drop-in follow-on connectors that reuse the same ClearPath UI.

Every ClearPath invariant from spec 030 is preserved: strictly network-scoped (data
never leaks across chains), **honest** empty/partial/error/unavailable states (never
fabricated DAOs/proposals/members), **no custody or authority** over external DAOs (the
member signs their own actions, gated by the DAO's own rules), subgraph-less live
indexing via bounded chunked log scans, theme-aware + WCAG 2.1 AA, no added backend,
and non-bypassable sanctions screening on any value-moving ClearPath-mediated action.

## Clarifications

### Session 2026-07-06

- Q: What determines that ClearPath is "available" on a network, now that it no longer
  depends on a deployed registry? → A: A network is ClearPath-capable when it declares a
  `clearpath` capability in its per-chain config and has a usable read RPC; the on-chain
  `ExternalDAORegistry` is **optional** and only adds shared cross-member discovery where
  it happens to be deployed.
- Q: Where are tracked DAOs stored on a registry-less network? → A: In a **per-member,
  per-network client-side list** (browser-local, keyed by wallet + chainId), mirroring
  the no-backend footprint. On a registry network the on-chain registry remains the
  shared source; the two are merged for display and never cross network boundaries.
- Q: How far does framework support go in this cut? → A: **OZ Governor + GovernorBravo**
  connectors ship (covering ENS and Uniswap). Morpho and other frameworks are pluggable
  follow-on connectors; until one exists, such a DAO is tracked read-only where possible
  and otherwise offered a truthful deep-link to its native app — never a broken action.
- Q: Do we deploy `ExternalDAORegistry` to the new networks (e.g. Ethereum mainnet)?
  → A: **No** — deploying the UUPS registry to expensive L1s is explicitly out of scope
  and MUST NOT be a precondition. The registry-less path is the mechanism on new networks.

### Session 2026-07-06 (clarify)

- Q: Does the first cut ship member-signed **write** actions (vote/queue/execute/propose)
  on the new ClearPath-only networks, or read-only tracking first? → A: **Read + act** —
  cut 1 ships read-only tracking AND member-signed governance actions on new networks,
  each gated by the DAO's own rules and by sanctions screening where a sanctions source is
  available (per FR-013); ClearPath still holds no custody/authority.
- Q: How does the registry-less tracked-DAO list persist — device-local or synced across
  the member's devices? → A: **Device-local only** — the list lives in the browser keyed by
  wallet + chainId and is NOT synced across devices in this cut; cross-device sync (e.g. via
  spec 032 encrypted data sync) is a deliberate follow-on that would not change the
  connector or UI. A tracked entry is scoped to the origin/device that created it.
- Q: What is the sanctions posture for signed governance actions on a network with no
  platform sanctions source (e.g. Ethereum mainnet)? → A: **Screen where available; rely on
  the external DAO's own rules where not.** ClearPath screens the connected signer against
  the platform sanctions source on networks where that source is deployed; on a network
  without one, member-signed **external-DAO governance** actions still proceed because
  ClearPath is non-custodial and the external DAO's own contracts/rules authorize and route
  the value. ClearPath's OWN custodial value-moving flows (e.g. native treasury funding —
  out of scope here) always require the gate and are never offered ungated.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select a ClearPath-only network (Priority: P1)

From My Account, a member selects a network that the platform supports **for DAO
governance only** — Ethereum mainnet first — and ClearPath becomes usable there for
discovery and tracking, while features that are not deployed on that network (wagers,
swaps, passkey login, memberships) are honestly shown as unavailable rather than
presented as working.

**Why this priority**: This is the structural unlock. Without a read-capable,
ClearPath-only network, none of the target DAOs (ENS/Uniswap/Morpho on Ethereum
mainnet) are reachable at all. It is the smallest slice that proves the network model
has been opened without breaking the honesty guarantees for the other features.

**Independent Test**: Add Ethereum mainnet as a ClearPath-only network, select it,
confirm the ClearPath tab is enabled and every non-ClearPath feature surface (wager
create, swap, passkey option) is either hidden or shows a truthful "not available on
this network" state — with no fabricated balances, wagers, or DEX quotes.

**Acceptance Scenarios**:

1. **Given** a ClearPath-only network is configured, **When** a member opens the network
   switcher, **Then** the network is offered and labeled by what it actually supports
   (DAO governance), not as a full wager network.
2. **Given** a member is on a ClearPath-only network, **When** they open ClearPath,
   **Then** the module is enabled and operates against that network's DAOs.
3. **Given** a member is on a ClearPath-only network, **When** they navigate to wagers,
   swaps, or passkey login, **Then** each self-disables with a truthful reason and shows
   no fabricated data.
4. **Given** any supported network, **When** ClearPath resolves what is available,
   **Then** it derives availability from that network's declared capabilities — never
   from an assumption that every network is a full wager network.

---

### User Story 2 - Track a DAO on a registry-less network (Priority: P1)

On a network with no deployed `ExternalDAORegistry` (e.g. Ethereum mainnet), a member
registers a governance DAO by its address; ClearPath validates it is a recognized
governance contract, adds it to the member's tracked-DAO list, and tracks its real
treasury, proposals + vote tallies + states, and membership — read-only — with no new
contract deploy.

**Why this priority**: This is the core capability the user asked for — reaching
ENS/Uniswap/Morpho where they live — and it must not depend on deploying a registry to
mainnet. It is independently valuable (a multi-DAO dashboard spanning networks) even
before any management action.

**Independent Test**: On Ethereum mainnet (registry-less), register the real ENS
Governor by address, confirm it validates and is added to My DAOs, and confirm the
displayed treasury/proposals/membership match its real on-chain state — with a truthful
"unavailable" state if the data source is unreachable, never fabricated rows. Confirm
the tracked entry is scoped to that wallet + network and does not appear on a different
network.

**Acceptance Scenarios**:

1. **Given** a registry-less network, **When** a member registers a recognized
   governance address, **Then** it is validated, added to their per-network tracked
   list, and appears in My DAOs / Explorer — no on-chain registry write required.
2. **Given** a registry network (e.g. Mordor), **When** a member registers a DAO, **Then**
   the on-chain registry is used as before, and registry entries + the member's local
   entries are merged for display without duplication or cross-network leakage.
3. **Given** an address that is not a recognized governance contract, **When** a member
   tries to track it, **Then** tracking is rejected with a truthful reason and nothing is
   added.
4. **Given** a tracked DAO, **When** its detail view is opened, **Then** its treasury,
   proposals + tallies + states, and membership are shown truthfully from chain, with an
   honest empty/partial/error state when a source is unreachable.
5. **Given** the member switches networks, **When** the DAO list re-renders, **Then**
   only the active network's tracked DAOs appear and no data crosses networks.

---

### User Story 3 - Track & act on a GovernorBravo DAO (e.g. Uniswap) (Priority: P1)

A member tracks a **GovernorBravo/Compound-style** DAO (Uniswap governance on Ethereum
mainnet), sees its proposals, tallies, and states read through a **GovernorBravo
connector**, and — where the DAO's own rules authorize their wallet — casts a vote /
queues / executes, constructed by the connector and signed by the member. ClearPath
holds no authority of its own.

**Why this priority**: Uniswap is a named target and it is **not** an OZ IGovernor DAO,
so without a second connector the "network-agnostic" claim is incomplete for the very
integrations that motivated the work. It proves the connector layer is genuinely
pluggable.

**Independent Test**: Track the real Uniswap Governor (Bravo) on Ethereum mainnet, list
its proposals with live state + tallies via the Bravo connector, and — as a wallet
holding sufficient UNI voting power — cast a vote through ClearPath and confirm it is
recorded on Uniswap's own contract; as a wallet without authority, confirm the action is
rejected by the DAO's own rules with the reason surfaced.

**Acceptance Scenarios**:

1. **Given** a GovernorBravo DAO address, **When** a member tracks it, **Then** ClearPath
   detects the framework and reads its proposals/tallies/states through the Bravo
   connector (Compound-style state + `quorumVotes`/`proposalThreshold` semantics).
2. **Given** an OZ IGovernor DAO (e.g. ENS) and a GovernorBravo DAO (e.g. Uniswap) both
   tracked, **When** the member views them, **Then** the **same ClearPath UI** renders
   both, each labeled by its detected framework.
3. **Given** an authorized wallet, **When** the member votes / queues / executes on the
   Bravo DAO through ClearPath, **Then** the action executes on the DAO's own contract,
   signed by the member, using the Bravo action encoding.
4. **Given** a wallet not authorized by the DAO's rules, **When** it attempts such an
   action, **Then** the DAO rejects it and the reason is surfaced — ClearPath never
   implies success.
5. **Given** a DAO whose framework has no connector yet (e.g. Morpho's scheme), **When**
   management is requested, **Then** ClearPath tracks read-only where possible and offers
   a truthful deep-link to the external app rather than a broken action.

---

### User Story 4 - Discover DAOs across networks in a unified list (Priority: P2)

A member sees native (where applicable) and external DAOs from the active network
together in "My DAOs" and the explorer, each clearly labeled by type/framework and
network, and can switch networks to move between, e.g., their Mordor Olympia DAO and
their Ethereum-mainnet ENS/Uniswap DAOs — always strictly network-scoped.

**Why this priority**: Makes the multi-network reach usable day-to-day and confirms the
network-scoping guarantees hold as the surface spans more chains. Depends on US1–US3.

**Independent Test**: Track DAOs on two networks, switch between them, and confirm each
network shows only its own DAOs (labeled by framework + network), with no bleed-through
and a truthful disabled state on a network where ClearPath is not configured.

**Acceptance Scenarios**:

1. **Given** DAOs tracked on multiple networks, **When** a member views My DAOs on a
   given network, **Then** only that network's DAOs appear, each labeled by
   framework/type and network.
2. **Given** a network where ClearPath is not configured, **When** the member selects it,
   **Then** ClearPath self-disables with a truthful message and lists nothing.
3. **Given** the explorer, **When** DAOs are listed, **Then** each shows name,
   framework/type, member/holder count, treasury balance, and active-proposal count from
   chain/index, or an honest partial/unavailable state.

---

### User Story 5 - Compose a proposal across frameworks (Priority: P3)

Where the member is authorized, the existing calldata-free proposal builder composes a
proposal for the tracked DAO regardless of framework — the correct encoding
(`propose` arguments and semantics) is produced for OZ Governor vs GovernorBravo — with a
live preview and the same field-level validation and pre-sign guards as spec 030.

**Why this priority**: Rounds out "manage, not just watch" for the new frameworks, but it
is the most advanced surface and depends on US3's connector work.

**Independent Test**: On an OZ Governor DAO and on a GovernorBravo DAO, compose a
multi-action proposal through the builder without writing calldata; confirm the encoded
call matches the chosen actions under each framework's `propose` signature, with a live
preview and validation, and that submission surfaces the DAO's own authorization/revert
reason honestly.

**Acceptance Scenarios**:

1. **Given** an OZ Governor DAO, **When** a member composes a proposal, **Then** the
   builder produces the OZ `propose(targets, values, calldatas, description)` encoding as
   in spec 030.
2. **Given** a GovernorBravo DAO, **When** a member composes the equivalent proposal,
   **Then** the builder produces the Bravo `propose` encoding (targets, values,
   signatures, calldatas, description) correctly.
3. **Given** either framework, **When** input is invalid or the wallet is unauthorized,
   **Then** submission is blocked with a truthful field-level or DAO-revert reason.

---

### Edge Cases

- **Unknown/ambiguous framework**: An address that answers neither the OZ IGovernor nor
  the GovernorBravo probe is rejected for tracking with a truthful reason; an address that
  answers a read surface but has no connector for actions is tracked read-only with a
  deep-link fallback (never a broken action button).
- **Registry-less list hygiene**: A tracked entry that later fails validation (e.g. a
  self-destructed or wrong-network contract) is shown in an honest error state and can be
  removed; it is never silently fabricated back.
- **Cross-network leakage**: A DAO tracked on network A must never appear, or have its
  balances/proposals read, while the member is on network B — verified on every switch.
- **Duplicate registration**: Registering an address already tracked (locally or on the
  registry) is a no-op with a truthful "already tracked" notice, not a duplicate row.
- **RPC-limited reads**: On a network whose public RPC caps `eth_getLogs`, the live
  indexer returns a truthful partial/error state, never a fabricated proposal list.
- **Sanctioned actor**: On a network where the platform sanctions source is deployed, a
  sanctioned connected signer is blocked fail-closed from ClearPath-mediated governance
  actions, and any ClearPath-custodial value-moving flow is blocked; a ClearPath-custodial
  flow is never offered on a network without a sanctions source. On a network with no
  platform sanctions source, member-signed **external-DAO** governance actions proceed under
  the external DAO's own rules (see FR-013) — ClearPath adds no gate it cannot honestly
  enforce and never silently fabricates a "screened" result.
- **Wrong-network address**: Registering a governance contract that only exists on a
  different network is rejected with a truthful "no contract at this address on this
  network" reason.
- **Capability drift**: A network configured as ClearPath-only must never surface a
  wager/swap/passkey affordance as usable; if config is inconsistent, the feature
  self-disables truthfully rather than presenting a broken path.

## Requirements *(mandatory)*

### Functional Requirements

**Open network model (US1)**

- **FR-001**: The system MUST support **ClearPath-only, read-capable networks** — networks
  a member can select where DAO governance is enabled but wager/DEX/passkey/membership
  infrastructure is not — and MUST add **Ethereum mainnet** as the first such network.
- **FR-002**: Every platform feature (wagers, swaps, passkey login, memberships,
  oracles, and ClearPath) MUST derive its availability on a given network from that
  network's **declared per-chain capabilities**, so a feature that is not deployed on a
  network is honestly shown as unavailable and never presents fabricated data there.
- **FR-003**: The network switcher MUST present each selectable network labeled by what it
  actually supports, so a ClearPath-only network is not implied to be a full wager
  network.

**Registry-optional tracking (US2)**

- **FR-004**: ClearPath availability on a network MUST NOT require a deployed
  `ExternalDAORegistry`; the module MUST be available on any network that declares the
  ClearPath capability and has a usable read RPC.
- **FR-005**: The system MUST let a member **register/track a DAO by address on any
  ClearPath-capable network with no on-chain registry**, storing it in a **per-member,
  per-network, device-local** tracked list (browser storage keyed by wallet + chainId)
  within the platform's no-backend footprint; cross-device sync is out of scope for this
  cut (see Assumptions).
- **FR-006**: Where an on-chain `ExternalDAORegistry` **is** deployed (e.g. Mordor), the
  system MUST continue to use it as the shared-discovery source and MUST **merge** its
  entries with the member's local entries for display — de-duplicated and strictly
  network-scoped, with no cross-network leakage.
- **FR-007**: Registration MUST validate that the address is a recognized governance
  contract on the **active network** before adding it, and MUST reject EOAs,
  non-governance contracts, wrong-network addresses, and duplicates with truthful reasons.
- **FR-008**: The system MUST track a registered DAO **read-only** — treasury balance,
  proposals + vote tallies + states, and membership — sourced from the DAO's on-chain
  state via subgraph where available or a bounded chunked on-chain log scan where not,
  with truthful empty/partial/error states and no fabricated rows.

**Pluggable multi-framework connectors (US3/US5)**

- **FR-009**: The connector layer MUST be **pluggable per governance framework** behind a
  common ClearPath connector interface, so a new framework can be added without rewriting
  the ClearPath UI, discovery, or action flows.
- **FR-010**: The system MUST ship both an **OpenZeppelin Governor** connector (covering
  ENS and any OZ IGovernor DAO) and a **GovernorBravo/Compound** connector (covering
  Uniswap), and MUST **detect** a tracked DAO's framework from its on-chain interface and
  route reads/actions through the matching connector.
- **FR-011**: For a DAO whose framework has **no** connector, the system MUST track it
  read-only where feasible and offer a **truthful deep-link** to the external app rather
  than presenting a broken action.
- **FR-012**: Where the connected wallet is authorized by the DAO's **own** rules, the
  system MUST allow native governance actions (create proposal, cast vote, queue, execute)
  constructed through the matching connector and **signed by the member**, taking no
  custody or authority of its own and surfacing the DAO's rejection reason when an action
  is not authorized. The proposal builder MUST produce the correct per-framework `propose`
  encoding.

**Cross-cutting parity with spec 030 / constitution**

- **FR-013**: The platform's **sanctions screening** MUST be enforced non-bypassably and
  fail-closed on every **ClearPath-custodial** value-moving flow (e.g. native DAO treasury
  funding — out of scope here) and on its disbursement recipients, using the same sanctions
  system as the rest of the platform; such a custodial flow MUST NEVER be offered on a
  network where the sanctions source is unavailable. For **external-DAO governance actions**
  (vote/propose/queue/execute on a DAO's own contracts, which ClearPath routes but does not
  custody), the system MUST screen the connected signer against the platform sanctions
  source **on networks where that source is deployed**; on a network without a platform
  sanctions source, these member-signed actions proceed under the **external DAO's own
  rules/compliance** (ClearPath is non-custodial and adds no gate it cannot honestly
  enforce). Read-only tracking is never gated.
- **FR-014**: All ClearPath data MUST be **strictly network-scoped** and MUST NOT leak
  across networks (tracked lists, registry entries, treasuries, proposals, membership,
  and reads), verified on every network switch.
- **FR-015**: Every user-initiated ClearPath action MUST be a real on-chain transaction
  (or local list mutation for tracking) with honest submitted/confirmed/failed state
  surfaced through the app-level **notification system**; passive background loads MUST use
  accessible inline status rather than toasts, and no phantom DAO/proposal/tracked entry
  may persist when a transaction does not confirm.
- **FR-016**: The ClearPath UI MUST remain **theme-aware** (light/dark) and meet
  **WCAG 2.1 AA**, and the feature MUST operate within the platform's **no-backend
  footprint** (no app server added).
- **FR-017**: Authorization for privileged ClearPath actions MUST continue to integrate
  with the platform's existing **membership/access-control** system where those actions
  are platform-gated; tracking a public governance DAO read-only is not membership-gated.
- **FR-018**: ClearPath MUST remain embedded as **its own tab within My Account (Account
  Center)** — not a standalone sub-app or a new top-level nav item — consistent with
  spec 030.

### Key Entities *(include if feature involves data)*

- **Network Capability Profile**: The declared set of capabilities a network supports
  (e.g. wagers, DEX, passkey, memberships, oracles, **ClearPath DAO governance**),
  determining which features are offered and gated on that network. A **ClearPath-only
  network** declares ClearPath and read-RPC availability but not wager/DEX/passkey.
- **ClearPath-Capable Network**: A network on which ClearPath's discovery/tracking/action
  surface operates, regardless of whether an on-chain `ExternalDAORegistry` is deployed.
- **Tracked DAO (registry-less)**: A per-member, per-network record of a DAO the member is
  tracking on a network with no on-chain registry — (network, address, detected framework,
  optional label) — held **device-local** (browser storage keyed by wallet + chainId)
  within the no-backend footprint, never crossing networks, and not synced across devices
  in this cut.
- **External DAO Registry (optional)**: The existing on-chain, network-scoped shared
  registry (e.g. on Mordor) — now one of two discovery sources, merged with the member's
  local tracked list where present, granting ClearPath no authority.
- **Governance Framework**: The interface family a DAO exposes (OpenZeppelin Governor,
  GovernorBravo/Compound, or another), detected from the contract and used to select the
  connector.
- **DAO Connector (per framework)**: A pluggable read+act adapter behind a common
  interface that reads a DAO's state and constructs native actions for the member to sign;
  OZ Governor and GovernorBravo ship, others are follow-ons.
- **Governance DAO (tracked)**: A DAO reached through ClearPath on any supported network —
  its detected framework, network, treasury/vault references, proposals, tallies, states,
  and membership, tracked read-only and managed only via the member's own authority.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can select Ethereum mainnet as a ClearPath-only network and open a
  usable ClearPath tab there, while wagers, swaps, and passkey login each show a truthful
  "not available on this network" state — with zero fabricated balances, wagers, or quotes.
- **SC-002**: A member can register and track a real DAO on a **registry-less** network
  (e.g. ENS Governor on Ethereum mainnet) and see its actual treasury, proposals, and
  membership from chain, with **no new contract deployed** — an unrecognized address is
  rejected and an unreadable source yields a truthful "unavailable" state, never
  fabricated rows.
- **SC-003**: A member can track and (where authorized) act on a **GovernorBravo** DAO
  (e.g. Uniswap) and an **OZ Governor** DAO (e.g. ENS) through the **same** ClearPath UI,
  each labeled by its detected framework — verified against the real contracts.
- **SC-004**: ClearPath data never crosses network boundaries: switching networks shows
  only that network's tracked DAOs in 100% of cases, and a network without ClearPath
  configured disables the feature with a clear message.
- **SC-005**: On a network with an on-chain registry (Mordor) and a network without one
  (Ethereum mainnet), the member's DAO list is correct on both — registry + local entries
  merged and de-duplicated on the registry network, local-only on the other — with no
  duplication or leakage.
- **SC-006**: Adding a **new governance framework** connector requires **no change** to the
  ClearPath discovery, list, detail, or action UI — demonstrated by the OZ and Bravo
  connectors sharing that UI, and documented as the extension path for Morpho/others.
- **SC-007**: On every network where the platform sanctions source is deployed, a sanctioned
  connected signer is blocked from ClearPath-mediated governance actions and from any
  ClearPath-custodial value-moving flow; and no ClearPath-custodial value-moving flow is ever
  offered on a network without a sanctions source — verified for both the screened-network
  and no-source cases.
- **SC-008**: Every user-initiated ClearPath action surfaces honest pending/confirmed/
  failed state through the app notification system, and no phantom DAO/proposal/tracked
  entry remains when a transaction does not confirm — verified for success and failure.
- **SC-009**: The ClearPath UI renders correctly in light and dark themes and passes
  automated accessibility (axe) checks with no violations across the new multi-network
  surfaces.
- **SC-010**: The full automated test suite (frontend Vitest incl. axe, plus any touched
  contract/subgraph suites) passes in CI, and security static analysis reports no new
  high/critical findings.

## Assumptions

- **Motivating targets**: ENS (OZ Governor), Uniswap (GovernorBravo/Compound), and Morpho
  all live principally on **Ethereum mainnet (chainId 1)**, which is therefore the first
  network to add; Base (8453), Arbitrum (42161), and Optimism (10) are follow-ons that opt
  in the same way (declare the ClearPath capability + a read RPC).
- **No new L1 contract deploys**: Deploying `ExternalDAORegistry` (or any ClearPath
  contract) to Ethereum mainnet or other new networks is **out of scope**; the
  registry-less tracked-list path is the mechanism there. The on-chain registry remains in
  use only where already deployed (Mordor).
- **Frameworks shipped now**: OZ Governor + GovernorBravo connectors. Morpho's governance
  and any other framework are **pluggable follow-on connectors**; until one exists such a
  DAO is read-only + deep-link. ENS is assumed to be a standard OZ Governor and Uniswap a
  standard GovernorBravo, to be confirmed against the live contracts during planning.
- **No authority over external DAOs**: "Manage" means ClearPath constructs actions the
  member **signs** with their own wallet, gated by the DAO's own access control; ClearPath
  holds no keys, roles, or custody, and offers a deep-link fallback.
- **Reuse of platform infrastructure**: Integrates with the existing per-chain config,
  capability gating (`networkCapabilities.js` pattern), the ClearPath connector +
  live-indexing code (spec 030), the notification/theme systems, sanctions screening, and
  membership/access-control — extended, not replaced. No new backend is added.
- **Read reliability**: Each new network needs a usable read RPC (with a sensible default
  and an env override), and reads must degrade truthfully where a public RPC caps
  `eth_getLogs` — reusing spec 030's bounded, chunked live-indexing fallback.
- **Out of scope for the first cut**: deploying the registry to new L1s; native DAO
  creation on new networks (spec 030's native pillar remains deferred / unchanged);
  enabling wagers, DEX/swaps, or passkey login on ClearPath-only networks; and
  **cross-device sync of the device-local tracked-DAO list** (a deliberate follow-on that
  could layer on spec 032's encrypted data sync without changing the connector or UI).
- **Sanctions on new networks**: The platform sanctions source is not deployed on every new
  ClearPath-only network (e.g. Ethereum mainnet). Per the clarified posture, ClearPath
  screens the connected signer where that source exists and otherwise lets member-signed
  **external-DAO** governance actions proceed under the external DAO's own compliance (it is
  non-custodial). ClearPath's own custodial value-moving flows are out of scope for new
  networks in this cut and are never offered without the gate. Planning confirms which
  networks carry a sanctions source and wires the per-network screening accordingly.
