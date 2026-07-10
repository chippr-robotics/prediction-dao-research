# Feature Specification: Ethereum Mainnet & Testnet Support

**Feature Branch**: `047-ethereum-mainnet-support`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Add Ethereum mainnet support (issue #847). Currently the system does not support Ethereum mainnet as a supported digital asset network. As a passkey or wallet user, I want to send and receive digital assets on Ethereum mainnet and the Hoodi & Sepolia testnets so that I can interact with the broader digital asset ecosystem. Acceptance scenarios: (1) Given a passkey user, they can navigate to the networks tab and select Ethereum mainnet or any of its testnets and the system properly sets this as the appropriate network. (2) Given a user with Ethereum digital assets, they are able to navigate to the portfolio view and see Ethereum assets alongside the other assets. Priority P2. Primary affected area: Frontend (frontend/)."

## Overview

Today the app knows about Ethereum mainnet only as a **ClearPath-only** network — a
member can track a DAO there, but the network is not offered as a place to hold, view,
send, or receive everyday assets. Sepolia is present purely as a background
portfolio-scan target and is **not** offered in the network switcher, and the Hoodi
testnet is not modelled at all. Yet a large share of DAOs, stablecoins, and other
digital assets live on Ethereum, and members reasonably expect the app to treat
Ethereum like the other first-class networks (Polygon, Ethereum Classic).

This feature promotes the **Ethereum family** — **Ethereum mainnet** plus its
**Hoodi** and **Sepolia** testnets — to **user-selectable value networks**. A member
can pick Ethereum (or a Hoodi/Sepolia testnet) from the networks surface, and once on
it, use the existing send/receive experience to move that network's native coin and
supported tokens. Ethereum-held balances appear in the cross-network portfolio
alongside every other network's holdings.

The feature is deliberately **additive and honest**. It does not deploy wager escrow,
in-app swaps, or other app-specific infrastructure onto Ethereum. Every capability the
Ethereum networks do **not** offer continues to disclose itself as unavailable
(constitution "honest state" principle) rather than presenting a dead action. What
changes is that "send, receive, and see my assets" moves from unavailable to available
on the Ethereum family, and the networks become selectable so a member can reach them.

## Clarifications

### Session 2026-07-10

- Q: On Ethereum mainnet, must a **passkey** (smart-account) user be able to send, or is
  wallet/EOA send sufficient for this cut? → A: Wallet/EOA send-and-receive is the
  required capability for the Ethereum family in this cut. Passkey smart-account
  submission on the Ethereum family is **not** required here and continues to disclose
  itself as unavailable where the underlying account-abstraction infrastructure is not
  present (honest-state). A passkey user with a linked wallet still transacts through
  that wallet. (See Assumptions and FR-010.)
- Q: Does "send" have to be **gasless** on the Ethereum family? → A: No. Sends use the
  standard path: gasless where the network's stablecoin and relay infrastructure
  actually support it, otherwise a self-submitted transfer that pays the network's
  native fee. The member is never stranded and the fee treatment is disclosed honestly
  before they confirm.
- Q: Which exact testnets are in scope, and is Hoodi already modelled? → A: Sepolia
  (already modelled but not selectable) and Hoodi (not yet modelled) are the two
  testnets in scope. Both are surfaced as selectable testnet networks alongside
  Ethereum mainnet.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select an Ethereum network (Priority: P1)

A member opens the networks surface, sees Ethereum mainnet (and its Hoodi and Sepolia
testnets) listed among the switchable networks with their real capabilities shown, and
selects one. The app switches the active network to the chosen Ethereum network and
reflects the change everywhere the active network is displayed.

**Why this priority**: Selecting the network is the entry point for every other
Ethereum interaction — sending, receiving, and network-scoped views all depend on the
member being able to reach the network first. It is the smallest slice that delivers
standalone value (a member can now put the app on Ethereum) and directly satisfies
acceptance scenario 1 from the issue.

**Independent Test**: From the networks surface, confirm Ethereum mainnet, Hoodi, and
Sepolia each appear as selectable networks, select each in turn, and verify the app's
active network updates to the selected network and persists.

**Acceptance Scenarios**:

1. **Given** a member on the networks surface, **When** they view the list of
   switchable networks, **Then** Ethereum mainnet, Hoodi, and Sepolia each appear as
   selectable networks with their capability tags shown honestly.
2. **Given** a member on the networks surface, **When** they select Ethereum mainnet,
   **Then** the app sets Ethereum mainnet as the active network and every active-network
   indicator updates to Ethereum.
3. **Given** a member on the networks surface, **When** they select Hoodi or Sepolia,
   **Then** the app sets that testnet as the active network.
4. **Given** the member has selected an Ethereum network, **When** they return to the
   app later, **Then** the previously selected Ethereum network is still the active
   network (selection persists as with any other network).

---

### User Story 2 - See Ethereum assets in the portfolio (Priority: P1)

A member who holds assets on Ethereum opens the portfolio view and sees their Ethereum
holdings (native coin and supported tokens) listed alongside their holdings on every
other network, correctly labelled with the Ethereum network they live on and included
in the portfolio's totals.

**Why this priority**: This is the second acceptance scenario from the issue and the
primary reason a member cares about "Ethereum support" — visibility of what they hold.
It is independently testable and valuable even before send/receive is exercised.

**Independent Test**: With a connected account that holds an Ethereum asset, open the
portfolio and confirm the Ethereum holding appears with the correct network label and
contributes to the portfolio totals; confirm testnet holdings appear only when the
member has opted into showing testnet assets.

**Acceptance Scenarios**:

1. **Given** a connected account holding assets on Ethereum mainnet, **When** the member
   opens the portfolio view, **Then** the Ethereum holdings appear alongside holdings
   from other networks, labelled with the Ethereum network.
2. **Given** an Ethereum holding with a resolvable value, **When** the portfolio
   computes totals, **Then** the Ethereum holding contributes to the portfolio's value
   summary on the same basis as other networks' holdings.
3. **Given** the member has **not** enabled showing testnet assets, **When** they open
   the portfolio, **Then** Hoodi and Sepolia holdings are excluded; **When** they enable
   testnet assets, **Then** Hoodi and Sepolia holdings appear.
4. **Given** an Ethereum asset whose value cannot be resolved, **When** it is shown in
   the portfolio, **Then** its value is disclosed as unavailable rather than shown as
   zero, and it is excluded from value sums (existing honest-state rule).

---

### User Story 3 - Send and receive assets on an Ethereum network (Priority: P2)

While the active network is an Ethereum network, a member sends the network's native
coin or a supported token to another address, and can present their address (including
a scannable form) to receive assets on that network.

**Why this priority**: Send/receive is the fuller expression of "interact with the
broader digital asset ecosystem," but it builds on network selection (Story 1) and is
naturally reached after a member can get onto the network and see their balances. It is
P2 because the two acceptance scenarios in the issue are satisfied by Stories 1 and 2;
send/receive completes the user's stated intent.

**Independent Test**: With the active network set to an Ethereum network and a funded
account, initiate a transfer of the native coin (and a supported token) to a chosen
recipient and confirm it succeeds; open the receive surface and confirm the member's
Ethereum address is shown with a scannable form.

**Acceptance Scenarios**:

1. **Given** a member whose active network is an Ethereum network with a funded balance,
   **When** they send the network's native coin to a valid recipient, **Then** the
   transfer is submitted on the Ethereum network and, on success, the member is informed
   and the balance reflects the send.
2. **Given** a member on an Ethereum network, **When** they open the transfer surface,
   **Then** the fee treatment (gasless where supported, otherwise a native-fee
   self-submit) is disclosed before they confirm, and they are never left without a
   working path to send.
3. **Given** a member on an Ethereum network, **When** they open the receive surface,
   **Then** their Ethereum address is displayed with a scannable form for the counterpart
   to send to.
4. **Given** a member attempts to send to an address flagged by sanctions screening,
   **When** they try to confirm, **Then** the send is blocked (existing screening rule,
   unchanged on Ethereum).

---

### Edge Cases

- **Unavailable capability on Ethereum**: When a member is on an Ethereum network and
  reaches a surface for a capability that Ethereum does not offer (e.g. in-app swap,
  wager creation), the surface discloses it as unavailable on this network rather than
  presenting a broken action.
- **Network read failure**: If balances for an Ethereum network cannot be read, the
  portfolio reports the affected assets as unread (never as zero) and the rest of the
  portfolio still renders.
- **Testnet visibility**: Hoodi and Sepolia holdings must never appear in the portfolio
  or inflate totals unless the member has opted into showing testnet assets.
- **Switch failure**: If the member's wallet declines or fails the network switch, the
  active network is unchanged and the member is told the switch did not complete.
- **No configured value token**: If a supported token has no address configured on a
  given Ethereum network, the send picker still offers the native coin so the transfer
  surface stays usable.
- **Testnet/mainnet distinction**: A member must be able to tell at a glance which
  Ethereum entries are testnets so they do not mistake a testnet for mainnet.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer Ethereum mainnet as a user-selectable network on the
  networks surface.
- **FR-002**: The system MUST offer the Hoodi and Sepolia testnets as user-selectable
  networks on the networks surface, visually distinguishable as testnets.
- **FR-003**: When a member selects an Ethereum network, the system MUST set it as the
  active network and update every active-network indicator accordingly.
- **FR-004**: The system MUST persist the selected Ethereum network as the active
  network across sessions on the same basis as any other selectable network.
- **FR-005**: The networks surface MUST display each Ethereum network's real
  capabilities, showing capabilities that are not available on Ethereum as unavailable
  rather than implying they work.
- **FR-006**: The portfolio view MUST include a connected account's Ethereum mainnet
  holdings (native coin and supported tokens) alongside holdings from other networks,
  labelled with the network they belong to.
- **FR-007**: The portfolio MUST include Hoodi and Sepolia holdings only when the member
  has enabled showing testnet assets, and exclude them otherwise.
- **FR-008**: Ethereum holdings MUST contribute to portfolio value totals on the same
  basis as other networks, and any holding whose value cannot be resolved MUST be
  disclosed as unavailable (never rendered as zero) and excluded from value sums.
- **FR-009**: While an Ethereum network is active, a member MUST be able to send that
  network's native coin, and any supported token that is configured on that network, to
  a valid recipient address or resolvable name.
- **FR-010**: Sending on an Ethereum network MUST provide a working path for a
  wallet/EOA-connected member: gasless where the network's stablecoin and relay
  infrastructure support it, otherwise a self-submitted transfer paying the network's
  native fee. The member MUST NOT be left without a way to send (never-stranded).
- **FR-011**: The send surface MUST disclose the fee treatment (gasless vs. native fee)
  before the member confirms.
- **FR-012**: While an Ethereum network is active, a member MUST be able to view and
  present their address for that network in a scannable form to receive assets.
- **FR-013**: Sanctions screening on sends MUST apply on the Ethereum networks exactly
  as it does on existing networks; a send to a flagged address MUST be blocked.
- **FR-014**: Every value shown for an Ethereum network (balances, prices) MUST come from
  verifiable network sources; the system MUST NOT fabricate balances or prices, and MUST
  reflect real amounts only.
- **FR-015**: Adding the Ethereum networks MUST NOT change the behaviour, availability,
  or defaults of the existing networks, and MUST NOT change the app's default/home
  network.
- **FR-016**: The Ethereum networks MUST be resolvable by their standard network
  identifiers so the correct network is always used and one network's data never leaks
  into another's view.

### Key Entities *(include if data involved)*

- **Ethereum network**: A member-selectable EVM network in the Ethereum family —
  Ethereum mainnet, Hoodi testnet, or Sepolia testnet — each with a standard network
  identifier, a native coin, a testnet/mainnet flag, and a set of capabilities (send,
  receive, portfolio inclusion enabled; app-specific infrastructure not deployed).
- **Supported token**: A token available for send/receive and portfolio display on a
  given Ethereum network (e.g. the network's native coin and configured stablecoins).
- **Portfolio holding**: A connected account's balance of a native coin or supported
  token on a specific network, carrying its network identity so holdings never mix
  across networks, and an optionally-resolvable value.
- **Network capability set**: The per-network record of which app features are available,
  used to drive honest availability disclosure on the networks surface and throughout
  the app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can select Ethereum mainnet, Hoodi, or Sepolia from the networks
  surface and have it become the active network in a single action, with 100% of the
  three networks present and selectable.
- **SC-002**: A connected account's Ethereum mainnet holdings appear in the portfolio in
  the same view as other networks' holdings within the portfolio's normal load time,
  with no separate step required to "add" Ethereum.
- **SC-003**: 100% of capabilities not available on an Ethereum network are shown as
  unavailable (no member can start an action that cannot complete on that network).
- **SC-004**: A member on an Ethereum network can complete a native-coin send to a valid
  recipient and see the result reflected, with the fee treatment disclosed before
  confirmation.
- **SC-005**: Testnet (Hoodi, Sepolia) holdings appear in the portfolio only when the
  member has opted into testnet assets — 0 testnet holdings leak into the default
  portfolio view or its totals.
- **SC-006**: Introducing the Ethereum networks causes no change to the existing
  networks' behaviour or to the app's default network (0 regressions in existing
  network selection, portfolio, and transfer flows).

## Assumptions

- **Hoodi identity**: Hoodi is the current Ethereum long-lived proof-of-stake testnet
  (standard chain identifier 560048), with its native coin denominated in test ETH. Its
  exact endpoint/explorer details are configuration values resolved during planning; if
  the canonical identifier differs at implementation time it is corrected there.
- **Sepolia already modelled**: Sepolia already exists in the network model as a
  background portfolio-scan target; this feature makes it user-selectable rather than
  introducing it from scratch.
- **Ethereum mainnet already partly modelled**: Ethereum mainnet already exists as a
  ClearPath-only network; this feature broadens its enabled capabilities to include
  send, receive, and portfolio inclusion — it does not create the network from nothing.
- **Wallet/EOA send is the required path**: Passkey (smart-account) submission on the
  Ethereum family is out of scope for this cut and stays honestly disclosed as
  unavailable where its infrastructure is absent; a passkey member with a linked wallet
  transacts through that wallet.
- **No app-specific infrastructure on Ethereum**: This feature does not deploy wager
  escrow, membership, in-app swap, or oracle contracts to the Ethereum networks. Those
  capabilities remain unavailable and are disclosed as such.
- **Existing surfaces are reused**: The networks surface, portfolio view, and
  send/receive (transfer) surfaces already exist and operate against the active or
  scanned networks; this feature extends the set of networks they cover rather than
  building new surfaces.
- **Supported tokens on Ethereum**: The initial supported tokens are the network's native
  coin and its canonical stablecoin(s); a broader curated token list is a follow-on and
  not required for this feature.
- **Default network unchanged**: The app's default/home network is unchanged by this
  feature.

## Dependencies

- The existing network-selection surface, cross-network portfolio, and send/receive
  (transfer) surfaces.
- Verifiable on-network read access (balances and, where available, prices) for each
  Ethereum network.
- The existing sanctions-screening path applied to sends.
