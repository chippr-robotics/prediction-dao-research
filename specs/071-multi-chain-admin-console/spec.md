# Feature Specification: Polygon as the membership reference chain, and all-chains reads across the operations console

**Feature Branch**: `071-multi-chain-admin-console`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "when a user is attempting to access the admin console the platform needs to check polygon for membership and all chains for accrued fees. all admin views must read from all chains. polygon should be the reference chain for membership activities and be the place membership purchases are routed to"

## Overview

Today the platform answers two different questions with the same wrong input: *the chain the
wallet happens to be connected to*.

- **Membership** is read wherever the wallet sits. On mainnet, membership exists in exactly one
  place — Polygon — so a member connected to Ethereum, Optimism, Base, Arbitrum or Ethereum
  Classic is told they have no membership. They have one; the platform looked somewhere it was
  never kept.
- **Operator control state** is read wherever the wallet sits. That state is spread across every
  network the platform is deployed on, so an operator is shown one network's worth of an estate
  that spans many — and the rest reads as *absent* rather than as *not looked at*.

This feature separates *where a fact lives* from *where the wallet is*. Membership gets a single
declared home — the **membership reference chain** — and every membership question is asked
there, including where purchases settle. Operator views stop being wallet-scoped and read the
whole estate, saying honestly which chains answered and which did not.

Two things deliberately do **not** change: a write is still a transaction on exactly one chain and
still requires the wallet to be there, and authority for that write is still verified against the
specific contract on that specific network.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A member's membership follows them across networks (Priority: P1)

A member bought a membership. They connect from whichever network they are using that day — Base
to move USDC, Arbitrum to trade, Ethereum to bridge — and the platform recognises the membership
every time, because it always asks the reference chain. If the reference chain cannot be reached,
the platform says so rather than reporting the member as having nothing.

**Why this priority**: This is the live defect. Membership exists on exactly one mainnet, so every
member on any other network is currently mis-read as unentitled — losing them access they paid
for, on surfaces they reached correctly.

**Independent Test**: Connect an account holding a reference-chain membership to each supported
network in turn and confirm the tier and expiry resolve identically every time. Then make the
reference chain unreachable and confirm the platform reports membership as *unknown*, with a
retry, and never as *none*.

**Acceptance Scenarios**:

1. **Given** an account with an active membership on the reference chain, **When** it connects on any other supported network and opens a membership-gated surface, **Then** the membership resolves with the same tier and expiry as on the reference chain.
2. **Given** an account with no membership anywhere, **When** it connects on any supported network, **Then** the platform reports no membership and offers the purchase path.
3. **Given** the reference chain's endpoint is unreachable, **When** an account opens a membership-gated surface, **Then** the platform states that membership could not be read and offers a retry, and does not state that the account has no membership.
4. **Given** a build configured for a testnet environment, **When** membership is resolved, **Then** it is read from that environment's reference chain and never from a mainnet.

---

### User Story 2 - An operator reaches the console from wherever they are (Priority: P1)

An operator holds an operator role somewhere in the estate. They open the operations console and
get in, and the console tells them where their authority actually lives — rather than refusing
them because their wallet happened to be pointed at a network where they hold nothing.

**Why this priority**: The console is the incident-response surface. An operator refused entry
because of their wallet's current network is an operator who cannot act during an incident. Entry
is a read, and reads should span the estate.

**Independent Test**: With an account holding a role on exactly one network, connect on a
different network and confirm the console opens, lists only the views that account can use, and
names the network each role was found on.

**Acceptance Scenarios**:

1. **Given** an account holding an operator role on any single supported network, **When** it opens the console while connected to a different network, **Then** the console opens and offers the views that role gates.
2. **Given** an account holding no operator role on any network, **When** it opens the console, **Then** access is refused with the existing restricted-access explanation.
3. **Given** an account whose roles are held on more than one network, **When** it views its own permissions, **Then** each role is listed with the network(s) it is held on.
4. **Given** one network's endpoint is unreachable during the entry check, **When** the console resolves entry, **Then** the unreadable network is reported as unread rather than counted as "role not held", and roles found elsewhere still grant entry.

---

### User Story 3 - Accrued fees are visible for the whole estate (Priority: P2)

An operator opens the console and sees what has accrued everywhere fees accrue — per network, in
the unit each network actually holds — instead of one network's balance presented as if it were
the whole picture.

**Why this priority**: A fee balance read on one network and shown without qualification is a
number an operator will act on as if it were the total. Under-reporting the treasury is a
financial-reporting error, not a display bug.

**Independent Test**: With balances seeded on more than one network, open the console and confirm
every network with a fee-bearing deployment is listed with its own balance and unit. Then make one
network unreachable and confirm it is flagged and excluded from any total, and that the total does
not silently shrink.

**Acceptance Scenarios**:

1. **Given** fee-bearing deployments on several networks, **When** the operator opens the fee overview, **Then** each network is listed with its own accrued balance and the unit that balance is denominated in.
2. **Given** two networks whose balances are denominated in different units, **When** a total is displayed, **Then** it is shown per unit and never as a single cross-unit sum.
3. **Given** one network's balance cannot be read, **When** the overview renders, **Then** that network is marked unreadable, is excluded from every total, and the total is labelled partial.
4. **Given** a network has no fee-bearing deployment, **When** the overview renders, **Then** it is shown as not deployed there — distinct from a zero balance and from an unreadable one.

---

### User Story 4 - Every operator view spans the estate (Priority: P2)

An operator picks the network they want to inspect from within any view and sees that network's
control state, whatever their wallet is connected to. When they want to *change* something, the
view tells them plainly that the write happens on that network and that their wallet must be
there, and confirms their authority on that network's contract before offering the control.

**Why this priority**: This generalizes the behaviour the bridge and liquidity surfaces already
have. Until every view works this way, the console is an inconsistent mix — some views showing the
estate, others showing one network — and an operator cannot tell which they are looking at.

**Independent Test**: For each view, connect on network A, scope the view to network B, and confirm
the state shown is B's. Confirm write controls are withheld with an explicit reason while the
wallet is on A, and appear once the wallet is on B and authority on B is confirmed.

**Acceptance Scenarios**:

1. **Given** an operator connected to network A, **When** they scope any view to network B, **Then** the view shows network B's control state.
2. **Given** a view scoped to a network the wallet is not connected to, **When** the operator looks for a write control, **Then** the control is unavailable and the view states that the write happens on that network and the wallet must be switched to it.
3. **Given** an operator whose wallet is on the scoped network but who does not hold the gating role on that network's contract, **When** the view renders, **Then** no write control is offered and the view says the role is not held there.
4. **Given** a view scoped to a network where its contract is not deployed, **When** the view renders, **Then** it says so explicitly rather than rendering empty or zeroed state.
5. **Given** any view, **When** the operator performs a write, **Then** exactly one network is affected and the network is named in the confirmation.

---

### User Story 5 - Membership purchases go to the reference chain (Priority: P2)

A member buys or renews a membership. The purchase is made on the reference chain, wherever they
started from, and the platform says which network the payment will settle on before they sign.

**Why this priority**: Membership must be readable from one place (US1), which is only true if it
is also *written* in one place. A purchase that lands elsewhere creates a membership the
reference-chain read will never see.

**Independent Test**: Start a purchase while connected to a non-reference network and confirm the
flow discloses the reference chain, requires the switch, and completes there — and that no path
exists to complete a purchase on any other network.

**Acceptance Scenarios**:

1. **Given** a member connected to a non-reference network, **When** they begin a membership purchase, **Then** the flow states the purchase settles on the reference chain and offers to switch the wallet there.
2. **Given** a member who declines the switch, **When** the flow ends, **Then** no purchase has been made on any network.
3. **Given** a member on the reference chain without sufficient payment balance there, **When** they begin a purchase, **Then** the shortfall is stated in terms of the reference chain's payment token, rather than counted from balances held elsewhere.
4. **Given** a completed purchase, **When** the member connects on any other supported network, **Then** the new membership resolves (US1).

---

### Edge Cases

- **Reference chain unreachable.** Membership resolves to *unknown*, never to *none*. Surfaces that gate on membership refuse the gated action but must attribute the refusal to the failed read, and offer a retry.
- **Every chain unreachable during console entry.** Entry is refused, and the refusal states that no network could be read — distinct from "you hold no role".
- **Partial estate readability.** Any aggregate is labelled partial and names the networks missing from it. A partial total is never presented as complete.
- **Cross-unit aggregation.** Networks whose balances are denominated in different tokens are never summed. Only per-unit subtotals exist.
- **Role held on one network, not another.** Entry is granted (US2) but no write control is offered on a network where the role is not held (US4) — the two questions are answered separately.
- **Wallet switches network mid-session.** A view's scoped network does not change; read state does not silently re-target. Only the availability of write controls changes.
- **Environment cohorts.** A build never reads across the testnet/mainnet boundary: a testnet build's reference chain and estate are testnet-only, a mainnet build's are mainnet-only.
- **A network with no deployment of the contract a view manages.** Reported as not deployed — a distinct state from a zero value and from an unreadable one.
- **Slow networks.** One slow endpoint does not block the rest of a view; each network resolves independently and renders as it arrives.

## Requirements *(mandatory)*

### Functional Requirements

**Membership reference chain**

- **FR-001**: The platform MUST define exactly one **membership reference chain** for the build's environment cohort, and MUST NOT resolve membership on any other chain.
- **FR-002**: The reference chain MUST be Polygon for mainnet builds, and the corresponding Polygon testnet for testnet builds; a build MUST NOT resolve membership across the testnet/mainnet boundary.
- **FR-003**: Every membership question — console entry, tier gating, tier and expiry display, and any membership-derived entitlement — MUST be answered from the reference chain, regardless of the chain the wallet is connected to.
- **FR-004**: When the reference chain cannot be read, membership MUST resolve to a distinct *unknown* state that is never presented as *no membership*, and the surface MUST offer a retry.
- **FR-005**: A membership-gated action MUST be refused while membership is *unknown*, and the refusal MUST attribute itself to the failed read.

**Membership purchases**

- **FR-006**: Membership purchases MUST be routed to the reference chain, and the platform MUST NOT offer or complete a purchase on any other chain.
- **FR-007**: Before a member signs, the purchase flow MUST disclose which network the purchase settles on, and MUST require the wallet to be on that network.
- **FR-008**: Payment-balance sufficiency for a purchase MUST be evaluated against the member's balance on the reference chain only, and any shortfall MUST be stated in the reference chain's payment token.

**Console entry**

- **FR-009**: Entry to the operations console MUST be granted when the account holds any operator role on any chain in the cohort, regardless of the connected chain.
- **FR-010**: The console MUST show, for each operator role, the network(s) on which the account holds it.
- **FR-011**: A chain that could not be read during the entry check MUST be reported as unread and MUST NOT be counted as evidence that a role is not held.
- **FR-012**: Entry MUST be refused when no chain reports any operator role; when no chain could be read at all, the refusal MUST say so rather than asserting the account holds nothing.

**All-chains reads across operator views**

- **FR-013**: Every operator view MUST be able to present the control state of every chain in the cohort where the contract it manages can exist, independent of the connected chain.
- **FR-014**: Each view MUST distinguish, per chain, at least these states: *read successfully*, *contract not deployed on this chain*, and *chain could not be read*. A chain that could not be read MUST NOT render as zero, empty, or absent.
- **FR-015**: A view MUST NOT block on the slowest chain; each chain's state MUST render as it resolves.
- **FR-016**: A view's scoped chain MUST NOT change implicitly when the wallet changes network.

**Writes stay single-chain**

- **FR-017**: A write MUST target exactly one chain, and the confirmation MUST name that chain.
- **FR-018**: A write control MUST be withheld unless the wallet is connected to the scoped chain, and the view MUST state that requirement rather than failing at signature time.
- **FR-019**: A write control MUST be withheld unless the account's authority has been verified against the specific contract on the scoped chain; app-wide or entry-level role signals MUST NOT be treated as authority to write.
- **FR-020**: The platform MUST NOT offer any control that performs one action across multiple chains implicitly.

**Accrued fees**

- **FR-021**: Accrued fees MUST be presented for every chain in the cohort carrying a fee-bearing deployment, each with its own balance and the unit that balance is denominated in.
- **FR-022**: Balances denominated in different units MUST NOT be summed; totals MUST be per unit.
- **FR-023**: A chain whose balance could not be read MUST be excluded from every total, MUST be flagged, and any total computed without it MUST be labelled partial and name what is missing.

### Key Entities

- **Membership reference chain**: The single chain, per environment cohort, that is the authority for membership state. One per build; not operator-configurable at runtime.
- **Environment cohort**: The set of chains a build may read — mainnets for a mainnet build, testnets for a testnet build. Reads never cross cohorts.
- **Chain read result**: The outcome of reading one contract on one chain. Carries one of *read*, *not deployed*, or *unreadable*, plus the value when read and the reason when not.
- **Scoped chain**: The chain an operator view is currently showing. Chosen by the operator, independent of the wallet's network, and unchanged by wallet network changes.
- **Per-chain authority**: Whether an account holds a given role on a given contract on a given chain. Distinct from console entry, which is an estate-wide question.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member holding a membership resolves that membership identically from 100% of supported networks in the cohort, with no network reporting them as unentitled.
- **SC-002**: An operator holding a role on any one network can open the console and see that role's views from 100% of supported networks in the cohort.
- **SC-003**: The fee overview accounts for 100% of the cohort's fee-bearing deployments; every network is shown as read, not deployed, or unreadable, with no network silently omitted.
- **SC-004**: Zero displayed aggregates combine balances of different units, and zero aggregates computed from an incomplete set of networks are presented without a partial label.
- **SC-005**: In every operator view, a wallet on the wrong network is told so before signing rather than at signature time — no write attempt fails because the wallet was on the wrong chain.
- **SC-006**: 100% of membership purchases settle on the reference chain; no path exists that completes a purchase elsewhere.
- **SC-007**: An unreachable network never renders as a zero or an absence anywhere in the console — every such case is attributable to a read failure in the interface.
- **SC-008**: No build reads membership or control state across the testnet/mainnet boundary.

## Assumptions

- **Polygon is already the only mainnet home of membership.** Membership is deployed on Polygon and on testnet/local networks only; no other mainnet carries it. Anchoring membership to Polygon therefore strands no existing member — it corrects a lookup that was pointed at chains where membership was never kept.
- **The reference chain is build configuration, not a runtime choice.** Operators and members do not select it; it follows the build's environment cohort, which is how the platform already avoids testnet/mainnet leakage.
- **Reads use each chain's own endpoint.** Reading a chain the wallet is not connected to uses that chain's configured endpoint, with the member's own endpoint override honoured where one is set. No new custody, signing, or key material is involved in any read.
- **Bridging is out of scope.** A member whose funds are on another network is told to switch and fund on the reference chain. Moving those funds is the existing transfer/bridge surface's job, not this feature's.
- **The existing per-network pattern is the model.** The bridge and liquidity operator surfaces already read every capable network with per-network endpoints and gate writes on the wallet's chain; this feature generalizes that behaviour rather than inventing a second approach.
- **No contract changes.** This is a resolution and presentation change. No on-chain interface, storage layout, or deployment is altered.
- **Console entry stays a coarse signal.** Entry means "you hold something somewhere". It is not authority to act, and every write path re-checks authority against the contract on the scoped chain — the separation the existing least-privilege behaviour already relies on.
- **Aggregate freshness is best-effort.** Chains resolve independently, so an aggregate may briefly reflect different read times per chain; where that matters, the interface shows per-chain freshness rather than implying a single instant.

## Out of Scope

- Moving membership to more than one chain, or replicating membership state across chains.
- Bridging funds to the reference chain as part of the purchase flow.
- Any control that executes one operator action across several chains in a single step.
- Changes to which roles gate which views, or to the on-chain role model.
- Contract deployments to networks that do not currently carry a given contract.
