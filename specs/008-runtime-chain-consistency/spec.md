# Feature Specification: Runtime Chain Consistency Across Frontend Modals

**Feature Branch**: `fix/membership-purchase-chain-aware` (expands PR #643)

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Make every modal and on-chain read in the FairWins frontend reflect the wallet's currently-connected network, not the network the app was built with. Today many contract-address and RPC-provider lookups are bound to the build-time VITE_NETWORK_ID. Extend the chain-consistency guarantee from the membership purchase/tier flow (already fixed in PR #643) to ALL modals and read paths."

## Background & Motivation

The app's network gate accepts **any** supported chain (it treats the wallet as "on the correct network" if the connected chain is one of the supported networks, currently Polygon mainnet, Polygon Amoy testnet, and a local dev chain). However, several read and display paths select *which chain's data to show* from a **build-time** default rather than from the wallet's **currently-connected** chain. The two notions disagree, so a user on a supported-but-non-default chain can see or act on the wrong network's data.

Two confirmed defects (both fixed for the membership purchase/tier flow in PR #643) demonstrate the class of bug:

1. **"The purchase contract is not found."** Buying a membership while the wallet was on a supported-but-non-default chain failed with a misleading error, because the purchase resolved the build-time chain's contract address and found nothing deployed at it on the connected chain.
2. **Testnet tier leaked into the mainnet view.** A user holding a Silver membership on the testnet, after switching to mainnet, was shown "current membership is already Silver" and offered only higher tiers — because the current-tier read was bound to the build-time chain.

This feature generalizes the fix: the binding rule (project constitution, Principle III) is that **network-scoped data MUST be scoped to the active network and never leak across testnet/mainnet boundaries**. This specification makes that the guaranteed behavior for *every* modal and read/display/transaction path in the frontend, rather than something fixed one flow at a time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See and act on the network my wallet is actually on (Priority: P1)

A connected user opens any modal or view. Every chain-scoped value they see — membership tier and status, tier prices and limits, token balances and allowances, the stablecoin/token in use, available actions, wager lists and details, admin readouts — reflects the network their wallet is currently connected to. Any transaction they initiate executes on that same network, and the figures shown before they sign (price, amount, token) match what the transaction will actually do on that network.

**Why this priority**: This is the core guarantee and the source of the reported defects. Without it, users transact against, or make decisions based on, the wrong chain's data — a correctness and funds-safety issue on a live payment surface. It is the MVP: if only this is delivered, the product is correct for users who stay on one network.

**Independent Test**: Connect a wallet on each supported network in turn and open every modal; confirm all displayed chain-scoped values and all initiated transactions correspond to the connected network (e.g., a user with no membership on the connected network is offered all tiers; balances/prices are that network's).

**Acceptance Scenarios**:

1. **Given** a wallet connected to the testnet with a Silver membership, **When** the user switches to mainnet (where they have no membership) and opens the membership modal, **Then** they are offered all tiers starting from the lowest, with no "already Silver" message.
2. **Given** a wallet connected to a supported network, **When** the user opens a purchase or wager modal, **Then** the prices, limits, balances, and token shown are those of the connected network.
3. **Given** the figures shown before signing, **When** the user confirms a transaction, **Then** the executed transaction uses the same network, token, and amount that were displayed.

---

### User Story 2 - Switching networks updates the UI immediately (Priority: P2)

While using the app, the user changes networks in their wallet (or via the in-app network toggle/switch). All visible chain-scoped values refresh to the new network without a full page reload, and no value from the previous network lingers.

**Why this priority**: The app actively supports a testnet/mainnet toggle, so switching is a normal action. Stale data after a switch is exactly what produced the "Silver on mainnet" defect. High value, but secondary to the base correctness in P1.

**Independent Test**: With a modal open, switch networks and observe that all chain-scoped values re-resolve to the new network and that no stale values are shown during or after the switch.

**Acceptance Scenarios**:

1. **Given** a modal open while connected to network A, **When** the user switches to network B, **Then** all chain-scoped values shown in that modal re-resolve to network B with no stale network-A values.
2. **Given** a chain-scoped value is being re-fetched after a switch, **When** the new value has not yet loaded, **Then** the UI shows a loading state rather than the previous network's value.

---

### User Story 3 - Clear guidance when an action isn't available on the connected network (Priority: P3)

The user is connected to a network that has no deployment for a contract a given action needs (or to a network not supported at all). Instead of a silent wrong-chain read or a generic error, the user sees a clear "not available on this network" message that names a supported network and offers a one-click switch.

**Why this priority**: Turns the remaining failure modes into actionable guidance. Important for trust and supportability, but the happy-path correctness (P1) and switch-refresh (P2) deliver most of the value.

**Independent Test**: Connect to a network lacking a needed deployment and attempt the action; confirm a clear, actionable "switch network" prompt appears (no generic "contract not found" wording, no wrong-chain data).

**Acceptance Scenarios**:

1. **Given** a wallet on a network with no deployment for the needed contract, **When** the user attempts the action, **Then** the UI shows an actionable message naming a supported network and offering to switch, and does not read the build-time network's data.
2. **Given** a wallet on an unsupported network, **When** the user opens an action that requires a contract, **Then** the UI prompts a switch to a supported network rather than showing build-time data.

---

### Edge Cases

- **Wallet on an unsupported chain** (e.g., Ethereum mainnet): every contract-dependent action prompts a switch; no build-time data is shown as if it were the user's.
- **Partial deployment** on a supported chain (some contracts present, others not): availability is determined per contract, so an unrelated, fully-deployed action still works while the missing one shows the switch prompt.
- **Network switch mid-flow** (data loaded on network A, user switches to network B before signing): the flow re-validates the connected network before signing and either refreshes for B or blocks with the switch prompt — it never signs a network-A-derived transaction on network B.
- **Display vs. execution mismatch**: a price/limit/amount shown must never be from a different network than the one the transaction executes on.
- **Locally cached / persisted chain-scoped data** (e.g., stored tier, role, or purchase records keyed only by account): must not surface a value from one network while connected to another.
- **No wallet connected**: read-only browsing may default to the app's primary/home network; the consistency guarantee takes effect once a wallet is connected.
- **Legacy read-only network** (the deprecated v1 chain): out of scope — those views remain read-only legacy and are not part of this guarantee.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every modal and view MUST select contract addresses based on the wallet's currently-connected network, not a build-time network default.
- **FR-002**: Every on-chain read MUST be executed against the wallet's currently-connected network.
- **FR-003**: All chain-scoped values displayed to the user — membership tier and status, tier prices, tier limits, token balances, allowances, token/stablecoin identity, available actions, and wager lists/details — MUST reflect the connected network.
- **FR-004**: Any transaction the user initiates MUST execute on the connected network, and the values shown before signing (price, amount, token) MUST match what the transaction will do on that network.
- **FR-005**: When the user switches networks, all chain-scoped displays MUST refresh to the new network without a full page reload, and MUST NOT show data from the previous network (showing a loading state until the new data resolves).
- **FR-006**: When the connected network has no deployment for a contract a view needs, the UI MUST show a clear "not available on this network" state and offer a one-click switch to a supported network, instead of reading build-time data or showing a generic error.
- **FR-007**: Locally cached or persisted chain-scoped data MUST be scoped per network so a value from one network is never shown while connected to another.
- **FR-008**: Error and empty-state messages for network-mismatch situations MUST be actionable — naming the required network and offering to switch — not generic "contract not found" wording.
- **FR-009**: No user-facing read, display, or transaction path may choose its data source from the build-time network identifier. The build-time default MAY remain only as a fallback for the disconnected (no-wallet) state.
- **FR-010**: The membership purchase flow (tier gating, prices, limits, balances, purchase/upgrade/extend) MUST present options consistent with the connected network (e.g., a user with no membership on the connected network is offered all tiers).
- **FR-011**: A repeatable check (automated test and/or audit) MUST exist that fails if a user-facing chain-scoped path resolves its address or provider from the build-time network instead of the connected network, to prevent regressions.

### Key Entities

- **Connected Network**: the network the wallet is currently on (its chain identifier). The single source of truth for which network's data the UI shows and acts on while a wallet is connected.
- **Deployment Set**: the collection of contract addresses for a given network, sourced from the generated sync artifacts. May be complete, partial, or absent for a given supported network.
- **Chain-Scoped Value**: any value displayed or used that is derived from a contract on a specific network (tier, status, price, limit, balance, allowance, token identity, wager, role).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user connected on any supported network sees only that network's data and options in 100% of modals (zero cross-network leakage), verified across the membership, wager (create/accept/claim/refund), and admin flows.
- **SC-002**: Switching networks updates all visible chain-scoped values within 2 seconds, with zero stale values from the previous network observed during QA.
- **SC-003**: When connected to a network without a needed deployment, 100% of affected actions present a clear "switch network" prompt rather than a generic error or wrong-network data.
- **SC-004**: Pre-transaction values (price, amount, token) match the executed transaction's network and amount in 100% of sampled purchases and wagers.
- **SC-005**: Zero reproductions, across all supported networks in QA, of the two known defects — "purchase contract is not found" on a supported network, and a testnet membership tier shown on mainnet.
- **SC-006**: Re-targeting the build-time network default and re-running the UI shows that displayed data follows the connected wallet, not the build target, for 100% of audited chain-scoped paths.

## Assumptions

- The wallet's current network identifier is reliably available at runtime (the app already exposes it).
- The set of supported networks is unchanged (Polygon mainnet, Polygon Amoy testnet, local dev chain); changing which networks are supported is out of scope.
- Contract addresses come from the generated per-network sync artifacts (constitution Principle V); no new addresses or deployments are introduced by this feature.
- A chain-aware resolution capability already exists and is used by some paths (and adopted by the membership flow in PR #643); this feature generalizes that pattern to all user-facing paths rather than introducing a new mechanism.
- When no wallet is connected, the UI may default to the primary/home network for read-only browsing; the consistency guarantee applies once a wallet is connected.
- No application backend is added; this is purely frontend read/resolve consistency (consistent with the project's fixed no-backend footprint).

## Out of Scope

- Changing which networks are supported, or adding/removing network support.
- Smart-contract changes, redeploys, or new on-chain addresses.
- Backend or subgraph/indexer changes.
- The deprecated v1 legacy network's read-only views (they remain legacy and are not brought under this guarantee).
- Visual redesign of modals beyond the messaging/loading states needed for network consistency.
