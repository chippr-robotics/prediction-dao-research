# Quickstart: Local Dev Environment (end-to-end)

This is the developer runbook. Following it from a clean checkout should reach a funded,
app-wired, end-to-end-capable environment in under 5 minutes (SC-001). It depends on the
artifacts this feature adds (`seed-local.js`, the `setup:local` / `seed:local` /
`sync:frontend-contracts:local` npm scripts); until those land, the commands marked
**(new)** will not exist yet.

## Prerequisites

- Node + dependencies installed (`npm install`, `npm --prefix frontend install`).
- Nothing else running on `127.0.0.1:8545`.
- MetaMask (or any wallet) for the browser flow.

## 1. Start the local chain (Terminal A)

```bash
npm run node
```
Leave this running. It exposes RPC at `http://127.0.0.1:8545`, chainId `1337`, with 20
accounts × 100,000 ETH.

## 2. Deploy, wire the frontend, and fund the wallets (Terminal B)

```bash
npm run setup:local      # (new) = deploy:local → sync:frontend-contracts:local → seed:local
```
Or run the steps individually:
```bash
npm run deploy:local                    # deploy v2 set → deployments/localhost-chain1337-v2.json
npm run sync:frontend-contracts:local   # (new) write HARDHAT_CONTRACTS from that record
npm run seed:local                      # (new) mint token + grant membership + approve, for 2 wallets
```

**Expected**: a per-wallet summary showing non-zero USDC + WMATIC balances, active
`WAGER_PARTICIPANT` membership, and a large WagerRegistry allowance for both wallets, then
`Local environment seeded`.

## 3. The two funded wallets

These are the first two default Hardhat accounts (deterministic; local-only; no real
value):

| Role | Address | Hardhat account |
|------|---------|-----------------|
| Wallet #0 (creator / deployer) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Account #0 |
| Wallet #1 (acceptor) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Account #1 |

`npm run node` prints all 20 accounts **with their private keys** on startup. In
MetaMask: add a network (RPC `http://127.0.0.1:8545`, chainId `1337`), then **Import
account** using the private key printed for Account #0 and Account #1. The keys are not
duplicated here so this repo never commits private keys — copy them from the node's
console output.

## 4. Run the app against the local chain (Terminal B or C)

```bash
VITE_NETWORK_ID=1337 npm run frontend
```
Open the app; confirm it reports the local network and the locally-deployed contract
addresses (matching `deployments/localhost-chain1337-v2.json`).

## 5. Drive a wager end-to-end (the validation that proves the feature)

1. Connect as **Wallet #0** → create and fund a wager (e.g. a friends-decide / non-oracle
   wager) staking USDC. Confirm #0's USDC balance drops by the stake.
2. Connect as **Wallet #1** → accept and fund the same wager. Confirm it becomes Active
   and #1's USDC balance drops by its stake.
3. Resolve the wager → confirm it reaches a terminal Resolved state and the winning wallet
   can claim/receive the payout, with balances reflecting the outcome.

No step should require a remote network call (SC-003).

## 6. Reset to a clean state

Stop `npm run node` (Ctrl-C) and restart it, then re-run `npm run setup:local`. The
environment returns to a fresh, fully funded starting state (SC-006). `seed:local` is
idempotent, so re-running it alone after a redeploy also restores funding.

## Automated check

The integration test asserts the post-seed invariants without the browser:
```bash
npx hardhat test test/integration/seed-local.test.js
```
It verifies, for both wallets: token balance > 0, `checkCanCreate == true`, and
allowance ≥ one stake — and that addresses match the local deployment record.

## Notes / out of scope

- The default end-to-end uses a **non-oracle** wager so resolution needs no external
  oracle. `MockPolymarketCTF` is deployed locally if an oracle-style demo is wanted later.
- **Private/encrypted** wagers (KeyRegistry pubkey pre-registration) are out of scope for
  this default flow.
- Frontend addresses come only from `sync-frontend-contracts.js`; never hand-edit
  `HARDHAT_CONTRACTS`.
