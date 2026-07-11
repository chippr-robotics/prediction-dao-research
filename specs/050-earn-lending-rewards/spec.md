# Feature Specification: Earn Section — Lending & Rewards

**Feature Branch**: `050-earn-lending-rewards`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "Earn section (GitHub issue #861): members need a way to participate
in DeFi protocols and earn returns on their assets at rest. Add an Earn sub-section in the Finance
section where members can lend funds on chain (Morpho vaults) to earn a return, with full
integration so the user can see and claim rewards. If Morpho allows a platform fee or
identification that FairWins originated the transaction (treasury reward), configure that. The UI
must be non-intimidating for non-technical users, using info bubbles to explain areas, and the
feature must be documented on the FairWins documentation site."

## User Scenarios & Testing *(mandatory)*

FairWins members hold stablecoins and other assets in their connected accounts between wagers.
Today those assets sit idle. This feature adds an **Earn** sub-section to the Finance area where a
member can put supported assets to work in audited, third-party lending vaults (Morpho), watch the
position grow, withdraw at any time, and see & claim any bonus reward tokens the lending protocol
distributes — all in plain, non-intimidating language. Earning opportunities beyond lending
(staking, bridges) are presented honestly as not yet available.

### User Story 1 - Discover Earn and lend idle assets (Priority: P1)

A member opens the app's navigation and sees a new **Earn** entry (with its own icon) in the
Finance group. Opening it shows a friendly hub that explains, in plain language, what earning is
and what's available. Under **Lend**, the member sees a curated list of lending vaults for the
active network family — each with the asset it accepts, the current estimated yearly return (APY),
the amount already deposited by all lenders, who manages the vault, and an info bubble explaining
every unfamiliar term. The member picks a vault, enters an amount (with a Max shortcut bounded by
their balance), reviews a clear summary of what will happen, confirms in their wallet, and sees
their new position reflected. Every step has an info bubble; nothing assumes prior DeFi knowledge.

**Why this priority**: This is the core of the request — a member cannot earn anything until they
can discover the section and deposit. It is independently valuable even before rewards or
portfolio links exist.

**Independent Test**: With a connected account holding a supported stablecoin on a supported
network, navigate to Earn, deposit into a vault, and confirm the position (deposited amount +
current value) appears in the Earn section. Delivers the full lend-to-earn loop.

**Acceptance Scenarios**:

1. **Given** a connected member on any network, **When** they open the app navigation, **Then**
   an "Earn" item with a unique icon appears in the Finance group and routes to the Earn section.
2. **Given** a member on a network where lending is supported, **When** they open Earn → Lend,
   **Then** they see a list of curated vaults showing asset, estimated APY, total deposits,
   curator, and the protocol's name — each concept explained by an info bubble.
3. **Given** a member viewing a vault with a balance of the vault's asset, **When** they enter an
   amount within their balance and confirm the deposit (including any token-spending approval),
   **Then** the deposit executes, a success state is shown, and their position appears with its
   current value.
4. **Given** a member with an active position, **When** they choose Withdraw and confirm, **Then**
   the withdrawal returns the asset (including earned yield) to their account and the position
   shrinks or closes accordingly.
5. **Given** a member on a network family with no lending support (e.g. an Ethereum Classic
   network), **When** they open Earn, **Then** the section explains honestly that lending is not
   available on this network and names the networks where it is — no mock data, no dead buttons
   without explanation.

---

### User Story 2 - See and claim rewards (Priority: P2)

A member who has lent through Earn may accrue bonus reward tokens distributed by the lending
protocol's rewards program (separate from the lending yield itself). In Earn → Rewards, the member
sees any reward balances attributable to their account — what token, how much is claimable now,
and an info bubble explaining where rewards come from and why they update periodically. One action
claims the claimable rewards to their account. If they have no rewards, the section says so
plainly and explains how rewards accrue.

**Why this priority**: Rewards are real value users would otherwise strand; the issue explicitly
asks for full rewards integration. It depends on User Story 1 existing but is separately testable
against any address with accrued rewards.

**Independent Test**: With an account that has accrued protocol rewards, open Earn → Rewards,
verify the claimable balance is listed, claim, and verify the tokens arrive and the claimable
balance reflects the claim.

**Acceptance Scenarios**:

1. **Given** a member with claimable rewards on the active network, **When** they open Earn →
   Rewards, **Then** each reward token is listed with its claimable amount and an explanation of
   its origin.
2. **Given** a member views a listed reward, **When** they confirm Claim in their wallet, **Then**
   the reward tokens are transferred to their account and the UI reflects the updated claimable
   amount.
3. **Given** a member with no rewards, **When** they open Earn → Rewards, **Then** the section
   states there is nothing to claim yet and explains how lending positions can accrue rewards.
4. **Given** reward data cannot be fetched (service unreachable), **When** the member opens
   Rewards, **Then** the UI says reward information is temporarily unavailable — it never shows a
   zero balance as if it were confirmed truth.

---

### User Story 3 - Reach Earn from the portfolio and audit every action (Priority: P3)

A member viewing an asset in their Portfolio sees an **Earn** action alongside Trade and Transfer.
When earning is possible for that asset on its network, the action takes them straight to the
matching lending view with the asset preselected; when it isn't, the action is visibly disabled
with a reason. Every earn activity the member performs — deposit, withdrawal, reward claim — is
recorded in the platform activity log for record keeping.

**Why this priority**: This wires Earn into the member's existing journeys (portfolio-first
discovery, audit trail). It builds on Stories 1–2 and completes the issue's acceptance scenarios.

**Independent Test**: From the portfolio detail of a supported stablecoin, tap Earn and land on
the vault list filtered/preselected for that asset; perform a deposit and confirm an activity log
entry is recorded.

**Acceptance Scenarios**:

1. **Given** a member views a portfolio asset that can be lent on its network, **When** they tap
   the Earn action, **Then** they land in Earn → Lend scoped to that asset and network.
2. **Given** a member views a portfolio asset that cannot be lent, **When** they look at the Earn
   action, **Then** it is disabled with a plain-language reason (never a dead or missing control).
3. **Given** a member completes a deposit, withdrawal, or reward claim, **When** they open the
   platform activity feed, **Then** an entry describes the action (asset, amount, vault/reward,
   time) with a link to the transaction.

---

### Edge Cases

- **Unsupported network active**: Earn stays visible in navigation; the section explains lending
  availability honestly per network and offers the network switcher — no cross-network data leak.
- **Vault/APY data source unreachable**: vault list shows an honest "temporarily unavailable"
  state; deposits are disabled while data is stale rather than shown with wrong numbers.
- **Amount edge cases**: zero, dust, more than balance, or more than the vault accepts — all
  rejected before any wallet prompt, with a reason.
- **Two-step deposits**: when a token-spending approval is required first, the flow explains the
  two prompts up front so the second wallet prompt is expected, not alarming.
- **Withdrawal limits**: when a vault temporarily cannot honor a full withdrawal (liquidity is
  deployed), the UI surfaces the currently withdrawable amount honestly.
- **Rewards cadence**: reward figures update on the protocol's schedule (hours, not seconds); the
  UI communicates "as of" freshness instead of implying real-time accrual.
- **Reward claim replay**: after a claim, the claimable amount reflects the cumulative-claim model
  used by the protocol (claiming twice never double-pays and never errors confusingly).
- **Testnet/mainnet boundary**: positions, vault lists, and rewards are scoped to the active
  network and never mix across the boundary.
- **Fee/attribution honesty**: if and when a platform fee applies to earn flows, it is disclosed
  in the flow before confirmation; while no fee applies, no fee is implied.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST add an "Earn" sub-section to the Finance navigation group with a
  unique icon, reachable on all networks.
- **FR-002**: The Earn section MUST present earning opportunity areas (lending now; staking and
  bridges as honestly-labeled future areas) and let the member navigate between the areas, each
  with a view relevant to that opportunity.
- **FR-003**: On supported networks, the Lend area MUST list curated lending vaults with, at
  minimum: accepted asset, estimated net yearly return (APY), total deposits, curator identity,
  and the underlying protocol's identity; the data MUST come from live protocol data, never
  hardcoded samples.
- **FR-004**: Members MUST be able to deposit a chosen amount of a vault's asset (bounded by
  balance and any vault limits) and withdraw from their position at any time the vault permits,
  with pre-transaction validation of amounts and a clear summary before each wallet prompt.
- **FR-005**: The system MUST show the member's active lending positions (amount deposited,
  current value, and the difference earned) scoped to the active network.
- **FR-006**: The Rewards area MUST show reward tokens attributable to the member's account with
  claimable amounts, and let the member claim them in a single action; claimed amounts MUST
  follow the protocol's cumulative accounting so repeat claims are safe.
- **FR-007**: When reward or vault data is unavailable, the system MUST present an explicit
  unavailable state and MUST NOT present zeros or stale numbers as current truth.
- **FR-008**: Lending availability MUST be a per-network capability: enabled networks are
  configured (not hardcoded in components), and unsupported networks present an honest
  explanation naming where lending is available.
- **FR-009**: The portfolio asset detail view MUST offer an "Earn" action that deep-links to the
  Lend area scoped to that asset and network when supported, and is disabled with a
  plain-language reason when not.
- **FR-010**: Every earn action (deposit, withdrawal, reward claim) MUST be recorded in the
  platform activity feed with asset, amount, counterpart (vault or reward token), timestamp, and
  transaction link.
- **FR-011**: Every screen in the Earn section MUST explain unfamiliar concepts (APY, vault,
  curator, rewards, approvals, withdrawal liquidity) via the app's info-bubble pattern, in
  plain language suitable for non-technical members; no jargon may appear without an explanation
  adjacent to it.
- **FR-012**: The Earn section MUST display the lending protocol's identity ("Powered by Morpho")
  and a risk disclosure that lending involves third-party smart-contract risk and yields are
  variable and not guaranteed by FairWins.
- **FR-013**: The system MUST NOT charge a platform fee on earn flows in this release. Because the
  protocol offers no transaction-source referral mechanism, platform attribution is satisfied by
  the protocol-mandated UI attribution; the documented path to treasury revenue (a fee-wrapper
  vault owned by the FairWins treasury) is recorded as a decision for a future release and MUST
  be documented in this feature's design records.
- **FR-014**: User documentation for the Earn section (what it is, how to lend, how to withdraw,
  how rewards work, risks, fees) MUST be published on the FairWins documentation site and
  linked from the Earn section.
- **FR-015**: All Earn views MUST meet the app's accessibility standard (WCAG 2.1 AA), including
  the info bubbles, forms, and claim/deposit/withdraw controls.

### Key Entities *(include if feature involves data)*

- **Earning Opportunity Area**: a category of passive earning (Lend now; Staking, Bridges
  future). Attributes: name, availability state per network, explanatory copy.
- **Lending Vault**: a third-party managed on-chain vault that accepts one asset and lends it
  out. Attributes: network, address, name, accepted asset, estimated net APY, total deposits,
  curator, protocol identity, listing/curation status.
- **Lending Position**: a member's stake in one vault. Attributes: member account, vault,
  deposited value, current value, earnings to date.
- **Reward Balance**: protocol-distributed bonus tokens attributable to a member. Attributes:
  network, reward token, cumulative earned, cumulative claimed, claimable now, data freshness.
- **Earn Activity Entry**: audit record of a deposit, withdrawal, or claim. Attributes: type,
  asset/token, amount, vault or reward source, timestamp, transaction reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member holding a supported stablecoin can go from opening the Earn section to a
  confirmed lending deposit in under 3 minutes without external help.
- **SC-002**: 100% of DeFi-specific terms visible in the Earn section (APY, vault, curator,
  rewards, approval, withdrawal liquidity) have an adjacent plain-language info bubble.
- **SC-003**: Members can see and claim 100% of the rewards the protocol attributes to their
  address on supported networks, and a completed claim is reflected in the UI within one refresh.
- **SC-004**: 100% of earn deposits, withdrawals, and claims performed in the app produce an
  activity-feed entry with a working transaction link.
- **SC-005**: On unsupported networks, 0 earn actions are offered as if available; every
  unavailable state names at least one network where earning is available.
- **SC-006**: The portfolio Earn action routes to the correct pre-scoped lend view for 100% of
  lendable assets, and is never rendered as an unexplained dead control for non-lendable ones.
- **SC-007**: Accessibility audits of the new Earn views pass with zero critical violations.
- **SC-008**: The documentation site gains an Earn user guide covering lending, withdrawing,
  rewards, risks, and fees, reachable from the site navigation and from the Earn section itself.

## Assumptions

- **Lending protocol**: Morpho is the lending integration for this feature (per the issue),
  reusing its curated/whitelisted vault listings rather than FairWins operating vaults. The
  protocol's own vault-listing curation is trusted as the quality filter, with FairWins able to
  narrow the list via configuration.
- **Supported networks (initial)**: Ethereum mainnet and Polygon PoS — the intersection of
  FairWins-configured networks and the protocol's deployments. Ethereum Classic family and other
  configured networks present the honest unavailable state. Networks are added by configuration
  later (e.g. Base) without code restructuring.
- **Rewards program**: protocol rewards are distributed through the protocol's current rewards
  system (Merkl, per protocol governance MIP-111); the deprecated legacy rewards flow described
  in older tutorials is out of scope beyond linking members to the protocol's legacy claim page.
  Reward data freshness follows that system's update cadence (~hours).
- **Platform fee / attribution**: the protocol offers **no** transaction-source referral or fee
  parameter. Mandated UI attribution ("Powered by Morpho") is implemented now; treasury revenue
  via a FairWins fee-wrapper vault (or a curator revenue-share agreement) is deliberately
  deferred to a future feature because it introduces a new value-bearing contract surface. This
  resolves the issue's conditional request with a documented decision rather than silence.
- **Scope of earning areas**: lending ships now; staking and bridge earning are represented as
  honest "not yet available" areas (matching the existing disabled "Stake" action precedent) and
  specified separately later.
- **Custody model**: deposits are made directly from the member's connected account to the
  protocol; FairWins never takes custody of deposited assets or rewards.
- **Testnets**: the protocol's data services do not cover testnets, so testnet behavior is the
  honest unavailable state; automated tests exercise flows with simulated data at the test layer
  only (never shipped).
- **No new backend**: the feature is frontend-only, consuming the protocol's public data services
  and on-chain contracts, consistent with the app's no-backend footprint.

## Dependencies

- Existing per-network configuration and capability gating (single source of truth for networks).
- Existing navigation model (Finance group), portfolio asset detail actions, info-bubble
  component, and platform activity feed.
- Morpho protocol: vault contracts (ERC-4626), public data API for vault/position/APY data, and
  the Merkl rewards API + on-chain distributor for reward claims.
- FairWins documentation site (MkDocs) for the user guide.
