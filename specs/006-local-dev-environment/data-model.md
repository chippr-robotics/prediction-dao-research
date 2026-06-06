# Phase 1 Data Model: Local Dev Environment

This feature has no new persistent schema. The "data model" here describes the runtime
entities the environment manipulates and the state transitions the seed step and the
end-to-end flow drive. It exists to make the post-seed invariants explicit and testable.

## Entities

### Local Chain
- **What**: An ephemeral Hardhat node, chainId `1337`, RPC `http://127.0.0.1:8545`.
- **Attributes**: 20 deterministic accounts × 100,000 native ETH; auto-mining.
- **Lifecycle**: Started by `npm run node`; all state wiped on restart.
- **Relationships**: Hosts the Contract Set and all wallet balances.

### Developer Wallet (×2)
- **What**: Hardhat accounts #0 and #1, used as wager creator and acceptor.
  - `#0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (also deployer / `ROLE_MANAGER_ROLE`)
  - `#1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- **Funded-state attributes** (the invariants the seed step must establish):
  | Attribute | Source | Post-seed requirement |
  |-----------|--------|------------------------|
  | `nativeBalance` | node config | > 0 (provided by node) |
  | `tokenBalance(USDC)` | `MockERC20.mint` | > 0 (e.g. 1,000,000 USDC) |
  | `tokenBalance(WMATIC)` | `MockERC20.mint` | > 0 (e.g. 1,000 WMATIC) |
  | `membership(WAGER_PARTICIPANT_ROLE)` | `grantMembership` | active tier ≥ Bronze, not expired ⇒ `checkCanCreate == true` |
  | `allowance(→ WagerRegistry)` | `approve` | ≥ a single stake (large pre-approval) |
- **Relationships**: Holds Test Token balances; has a Membership record in MembershipManager; participates in Wagers in WagerRegistry.

### Test Stake Token
- **What**: `MockERC20` instances deployed locally — USDC (6 decimals) and WMATIC (18 decimals). Dev-only, no real value.
- **Attributes**: `address` (from deployment record), `decimals`, `symbol`.
- **Lifecycle**: Deployed by `deploy.js` with `initialSupply = 0`; balances created by the seed step's `mint`.
- **Relationships**: Staked into Wagers; allowance granted to WagerRegistry.

### FairWins Contract Set (v2)
- **What**: `WagerRegistry`, `MembershipManager`, `KeyRegistry`, `PolymarketOracleAdapter` (+ `MockPolymarketCTF`), deployed by `deploy.js`.
- **Attributes**: addresses recorded under `contracts.*` in the deployment record.
- **Relationships**: WagerRegistry calls MembershipManager.`checkCanCreate`; pulls Test Token via `transferFrom`.

### Deployment Record
- **What**: `deployments/localhost-chain1337-v2.json` — the source of truth for local addresses.
- **Attributes (shape used downstream)**: `network`, `chainId`, `deployer`, top-level `paymentToken` (USDC) + `wmatic`, and `contracts.{wagerRegistry,membershipManager,keyRegistry,polymarketAdapter}`.
- **Relationships**: Read by `seed-local.js` (to find token + registry addresses) and by `sync-frontend-contracts.js` (to write the frontend config block).

### Frontend Config Block (`HARDHAT_CONTRACTS`)
- **What**: The chainId-1337 address block in `frontend/src/config/contracts.js`.
- **Attributes**: `wagerRegistry`, `membershipManager`, `keyRegistry`, `polymarketAdapter`, `paymentToken`, `wmatic`, `deployer`.
- **Lifecycle**: **Generated** by `sync-frontend-contracts.js` — never hand-edited (Constitution V). Active only when `VITE_NETWORK_ID=1337`.
- **Relationships**: Consumed by the app to target the local Contract Set.

### Local Environment Runbook
- **What**: The documented steps (`quickstart.md` + `docs/developer-guide/setup.md`) that make bring-up, wallet import, end-to-end testing, and reset repeatable.

## State Transitions

### Wallet funding (driven by `seed-local.js`)
```
Unfunded (gas only)
   │  mint(USDC), mint(WMATIC)            → has token balance
   │  grantMembership(.., Bronze, 365)    → checkCanCreate == true
   │  approve(WagerRegistry, large)       → can stake without extra approval
   ▼
Funded & wager-ready   ── (node restart) ──▶ Unfunded ── (re-run setup:local) ──▶ Funded & wager-ready
```
Idempotent: re-running the seed from a Funded state is a no-op-equivalent (re-mint adds, re-grant overwrites, re-approve resets).

### Wager lifecycle (driven through the app, US2)
```
(wallet #0)                (wallet #1)                 (resolver)
Create ──▶ Open ──── accept ───▶ Active ──── resolve ───▶ Resolved ──── claim ───▶ Settled
  │ stake pulled        │ stake pulled                       │ winner payout
  ▼                     ▼                                    ▼
#0 token balance ↓   #1 token balance ↓                winner token balance ↑
```
The default flow uses a non-oracle resolution (creator/opponent/either) so `resolve`
requires no external oracle. Encrypted/private wagers are out of scope.

## Validation Rules (asserted by the integration test)

For each of wallet #0 and #1, after `setup:local`:
1. `USDC.balanceOf(wallet) > 0` and `WMATIC.balanceOf(wallet) > 0`.
2. `membershipManager.checkCanCreate(wallet, WAGER_PARTICIPANT_ROLE) == true`.
3. `USDC.allowance(wallet, wagerRegistry) >= oneStake`.
4. The token/registry addresses used by the test match `deployments/localhost-chain1337-v2.json`.
