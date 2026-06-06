# Interface Contract: Local Dev Environment

This feature's "interface" is the **developer command surface** (npm scripts + a seed
script) and the **post-seed invariants** the environment guarantees. There is no new
network/API surface and no Solidity ABI change. This document is the contract the
implementation and its tests must satisfy.

## 1. Command Surface

### Existing (reused unchanged)
| Command | Effect | Notes |
|---------|--------|-------|
| `npm run node` | Start the local Hardhat node (chainId 1337, RPC :8545) | Long-running; own terminal |
| `npm run deploy:local` | Deploy the v2 contract set to `localhost`; write `deployments/localhost-chain1337-v2.json` | No wallet seeding |
| `npm run frontend` | Start the Vite dev server | Honor `VITE_NETWORK_ID=1337` |

### New / changed
| Command | Type | Contract |
|---------|------|----------|
| `npm run seed:local` | **repointed** → `hardhat run scripts/operations/seed-local.js --network localhost` | Mints token + grants membership + approves allowance for the two wallets. Idempotent. Exits non-zero if the deployment record is missing. |
| `npm run sync:frontend-contracts:local` | **new** → `node scripts/utils/sync-frontend-contracts.js --network localhost --chainId 1337` | Writes the `HARDHAT_CONTRACTS` block from the local deployment record. |
| `npm run setup:local` | **new** orchestrator → `deploy:local && sync:frontend-contracts:local && seed:local` | One command, run against an already-running node. Brings up a fully funded, app-wired environment. |

## 2. `seed-local.js` Contract

**Invocation**: `hardhat run scripts/operations/seed-local.js --network localhost`

**Inputs (with defaults)**:
- Reads `deployments/localhost-chain1337-v2.json` for token + registry addresses. **Required** — error clearly and exit non-zero if absent (instruct the user to run `deploy:local` first).
- Wallets default to signer indices 0 and 1 from the Hardhat provider.
- Amounts default to a generous balance (e.g. 1,000,000 USDC, 1,000 WMATIC) and a large allowance; overridable via env vars (e.g. `SEED_USDC_AMOUNT`).

**Behavior (in order, per wallet)**:
1. `usdc.mint(wallet, usdcAmount)` and `wmatic.mint(wallet, wmaticAmount)`.
2. From the deployer (signer 0, holds `ROLE_MANAGER_ROLE`): `membershipManager.grantMembership(wallet, WAGER_PARTICIPANT_ROLE, Tier.Bronze, 365)`.
3. From `wallet`: `usdc.approve(wagerRegistry, largeAmount)` and `wmatic.approve(wagerRegistry, largeAmount)`.

**Output**: A concise summary per wallet (address, USDC/WMATIC balance, membership active?, allowance) and a final "Local environment seeded" line. No secrets/private keys printed.

**Postconditions (MUST hold; asserted by the integration test)**:
- For each of wallet #0 and #1: `USDC.balanceOf > 0`, `WMATIC.balanceOf > 0`, `checkCanCreate(wallet, WAGER_PARTICIPANT_ROLE) == true`, `USDC.allowance(wallet, wagerRegistry) >= oneStake`.

**Idempotency**: Running twice leaves the environment in the same valid funded state (no error, no corruption).

**Failure modes**:
- Missing deployment record → exit non-zero with a "run deploy:local first" message.
- Not connected to chainId 1337 → exit non-zero (guard against running against a real network).

## 3. Frontend Wiring Contract

- After `sync:frontend-contracts:local`, every address in `HARDHAT_CONTRACTS`
  (`frontend/src/config/contracts.js`) MUST equal the corresponding address in
  `deployments/localhost-chain1337-v2.json` (SC-004). The block is generated, never
  hand-edited (Constitution V).
- With `VITE_NETWORK_ID=1337`, the app MUST resolve contracts from `HARDHAT_CONTRACTS`
  and connect to RPC `http://127.0.0.1:8545`.

## 4. End-to-End Contract (US2)

Acting as the two seeded wallets in the app, a developer MUST be able to:
1. Create + fund a wager as wallet #0 (USDC balance decreases by the stake).
2. Accept + fund it as wallet #1 (wager becomes Active; #1 balance decreases).
3. Resolve it and have the winner claim/receive the payout (terminal Resolved state; balances reflect the outcome).
All without any remote network call.
