# Feature Specification: Local Dev Environment

**Feature Branch**: `006-local-dev-environment`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "we need a local dev environment where we use a local hardhat environment wqith our wallets haveing funds and an erc20 token we can test with and the ability to test the end to end app locally. we will need two wallets funded"

## Overview

Developers need to exercise the full FairWins wager lifecycle — create, accept, resolve — entirely on their own machine, with no testnet faucets, no real funds, and no waiting on remote networks. Today a developer can start a local chain and deploy the contracts, but the chain comes up with no test token in their wallets, no membership granted (so wager creation is blocked), and the frontend points at stale or empty contract addresses. This feature delivers a repeatable local environment in which two developer wallets are funded with both spendable gas and a test stake token, the application is wired to the local chain automatically, and a developer can drive a wager end-to-end through the UI within minutes of a clean checkout.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stand up a funded local chain (Priority: P1)

A developer on a clean checkout starts the local environment and ends up with a running local blockchain, the FairWins contracts deployed, and two developer wallets that each hold spendable gas, a balance of the test stake token, and whatever permissions are required to participate in a wager.

**Why this priority**: This is the foundation. Without two wallets that can actually hold and stake the test token (and are permitted to create/accept wagers), nothing else in the local flow can be exercised. It is the minimum viable slice — a developer who only gets this far can already script and test contract interactions locally.

**Independent Test**: From a clean checkout, run the documented startup, then inspect both developer wallets and confirm each shows a non-zero gas balance and a non-zero test-token balance, that the deployed contracts are reachable on the local chain, and that each wallet is permitted to create and accept a wager.

**Acceptance Scenarios**:

1. **Given** a clean checkout and no local chain running, **When** the developer starts the local environment, **Then** a local blockchain is running and the FairWins contracts are deployed to it.
2. **Given** the local environment is running, **When** the developer inspects the two designated developer wallets, **Then** each wallet holds a non-zero native gas balance and a non-zero balance of the test stake token.
3. **Given** the two funded wallets, **When** the developer checks whether each wallet may create and accept a wager, **Then** both wallets satisfy the participation requirements (membership/permissions) without any further manual setup.
4. **Given** the test stake token has been distributed, **When** the developer checks each wallet's spending allowance toward the wager contract, **Then** each wallet is able to stake the token (allowance is pre-approved or the approval step is part of the documented flow).

---

### User Story 2 - Drive a wager end-to-end in the app locally (Priority: P2)

A developer points the running application at the local chain and, acting as the two funded wallets, creates a wager from one wallet, accepts it from the other, and resolves it — observing balances and wager state update correctly throughout — without touching any remote network.

**Why this priority**: This is the headline goal ("test the end to end app locally"). It depends on US1 (funded wallets + deployed contracts) and proves the whole stack works together, but it is a distinct, separately testable increment.

**Independent Test**: With US1 satisfied, open the application, connect each developer wallet in turn, create a wager as wallet A, accept it as wallet B, resolve it, and confirm the UI and on-chain balances reflect each transition.

**Acceptance Scenarios**:

1. **Given** the local environment is running and the application is started, **When** the developer opens the app, **Then** it connects to the local chain and shows the locally deployed contracts (not a remote/testnet deployment).
2. **Given** the app is connected as the first funded wallet, **When** the developer creates and funds a wager with the test token, **Then** the wager is created on the local chain and the wallet's token balance decreases by the staked amount.
3. **Given** an open wager and the app connected as the second funded wallet, **When** the developer accepts and funds the wager, **Then** the wager moves to an active/accepted state and the second wallet's token balance decreases by its stake.
4. **Given** an active wager, **When** the wager is resolved through the application, **Then** the wager reaches a terminal resolved state and the winning wallet can claim/receive the payout, with token balances reflecting the outcome.

---

### User Story 3 - Repeatable, documented, and resettable (Priority: P3)

A developer (including a newcomer) can follow a single documented runbook to bring the environment up, knows which wallets are funded and how to import them, and can tear the environment down and recreate a clean state on demand.

**Why this priority**: Makes the environment durable and shareable rather than a one-off that only works on the author's machine. Valuable but not required to prove the flow works the first time.

**Independent Test**: A developer who has never run the environment follows only the written runbook (no tribal knowledge) and reaches a working end-to-end flow; then resets and reaches a clean state again.

**Acceptance Scenarios**:

1. **Given** the project documentation, **When** a newcomer follows the local-environment runbook step by step, **Then** they reach a funded, app-connected, end-to-end-capable state without needing undocumented steps.
2. **Given** a running environment with prior test data, **When** the developer resets the environment, **Then** they return to a clean, freshly funded starting state.
3. **Given** the runbook, **When** the developer looks up wallet details, **Then** the identities of the two funded developer wallets and how to load them into the app are clearly documented.

---

### Edge Cases

- What happens when the developer starts the application before the local chain and contracts are ready (stale or missing addresses)? The flow should make the wired-up addresses authoritative so the app does not silently target an old deployment.
- What happens when the local chain is restarted and contracts are redeployed at new addresses? Re-running the setup must refresh both the wallet funding and the addresses the application uses.
- What happens when a wallet has gas but no test-token balance (or no allowance)? Wager creation/acceptance must fail clearly, and the setup must prevent this state by funding and approving as part of bring-up.
- What happens when a wallet lacks the participation permission/membership? Wager creation must be blocked with a clear reason, and bring-up must grant it so the default state is "ready".
- What happens if the developer only needs one wallet? Two funded wallets is the required default (one to create, one to accept); a single wallet cannot exercise the accept step.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a way to start a local blockchain on the developer's machine for development and testing.
- **FR-002**: The system MUST deploy the FairWins wager contracts and a test ERC20 stake token to the local chain as part of bringing the environment up.
- **FR-003**: The system MUST fund exactly two designated developer wallets, each with a non-zero native gas balance sufficient to submit transactions.
- **FR-004**: The system MUST give each of the two developer wallets a non-zero balance of the test ERC20 stake token sufficient to create and accept wagers.
- **FR-005**: The system MUST ensure each of the two developer wallets satisfies the participation requirements (e.g., active membership/permissions) needed to create and accept a wager, with no additional manual setup.
- **FR-006**: The system MUST ensure each developer wallet can stake the test token against the wager contract — either by pre-approving the spending allowance or by documenting the approval as an explicit step in the flow.
- **FR-007**: The system MUST make the locally deployed contract addresses the ones the application uses, so the running app targets the local deployment rather than a stale or remote one.
- **FR-008**: Users (developers) MUST be able to run the application against the local chain and complete the full wager lifecycle — create, accept, resolve — using the two funded wallets.
- **FR-009**: The system MUST document the local environment as a repeatable runbook, including the identities of the two funded wallets and how to load them into the application.
- **FR-010**: The system MUST allow the developer to reset/recreate a clean local environment on demand (re-running bring-up restores funded wallets and current contract addresses).
- **FR-011**: Re-running the bring-up after a chain restart or redeploy MUST refresh both wallet funding and the addresses the application uses, so the two never drift apart.
- **FR-012**: The local bring-up MUST NOT require real funds, remote faucets, or access to a public/testnet network.

### Key Entities *(include if feature involves data)*

- **Local blockchain**: An ephemeral chain running on the developer's machine that hosts the deployed contracts and wallet balances for a session.
- **Developer wallet (×2)**: Two known accounts used to play both sides of a wager — one creator, one acceptor — each requiring native gas, a test-token balance, spending allowance, and participation permission.
- **Test stake token**: A development-only ERC20 token, with no real value, used as the wager stake so the full create/accept/resolve flow can run without real assets.
- **FairWins contract set**: The wager registry/management contracts (plus supporting membership/permission components) deployed locally that the application reads from and writes to.
- **Application (frontend)**: The user-facing app that must connect to the local chain, read the local contract addresses, and let a developer drive the wager lifecycle.
- **Local environment runbook**: The documentation that makes bring-up, wallet import, end-to-end testing, and reset repeatable for any developer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean checkout, a developer reaches a running local chain with deployed contracts and two funded wallets in under 5 minutes following the runbook.
- **SC-002**: After bring-up, 2 of 2 developer wallets show a non-zero gas balance and a non-zero test-token balance with zero manual funding steps.
- **SC-003**: A developer can complete a full create → accept → resolve wager flow through the application against the local chain in a single session, with no remote network calls required.
- **SC-004**: 100% of the time, the addresses the application targets after bring-up match the contracts just deployed to the local chain (no stale-address failures).
- **SC-005**: A developer who has never used the environment reaches a working end-to-end flow using only the written runbook, with no undocumented steps.
- **SC-006**: Resetting and re-running bring-up returns the environment to a clean, fully funded starting state every time.

## Assumptions

- The two funded wallets default to well-known local development accounts so their keys can be imported into the application without ceremony; production/admin keys are never used locally.
- "Funds" means both native gas and the test ERC20 stake token; a wallet with only gas is considered not fully funded.
- The local chain is ephemeral — state is expected to be wiped on restart — and the bring-up flow is the source of truth for funded wallets and current contract addresses.
- The test stake token is a development-only token with no real value, minted freely during bring-up.
- Pre-registration of encryption keys for private/encrypted wagers is out of scope for the default flow; the default end-to-end scenario uses a standard (non-private) wager. (Confirm in clarification if private-wager flows must work locally.)
- The end-to-end resolution path used for the default local flow is a manually/locally resolvable wager; wiring a live external oracle is not required to demonstrate the flow.
- This feature targets local developer workflows only; it changes no production deployment, on-chain mainnet state, or admin key handling.
