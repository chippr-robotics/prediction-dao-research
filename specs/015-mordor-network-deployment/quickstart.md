# Quickstart: Mordor Network Deployment — Validation Guide

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Runnable steps that prove the feature works end-to-end. Implementation details live in `tasks.md` (after `/speckit-tasks`); this is the deploy + validation runbook. Commands are run from the repo root.

---

## 0. Prerequisites & blocking verification

```bash
# Confirm the REAL Classic USD (USC) contract on Mordor (chainId 63) — address + decimals.
# Sources: docs.brale.xyz / classicusd.com / https://etc-mordor.blockscout.com
# If no canonical Classic USD exists on Mordor → STOP. The feature is blocked (no mock).
```

- [ ] Classic USD (USC) address on Mordor confirmed + decimals known → set `TOKENS.mordor.USC` and `networks.js` `stablecoin`.
- [ ] (Optional) ETCswap factory/swapRouter/quoter/positionManager + WETC on Mordor confirmed → set `VITE_MORDOR_ETCSWAP_*` / `VITE_MORDOR_WETC`. If unknown, leave unset → swap hidden (still valid).
- [ ] Deployer (admin key) address funded with Mordor test ETC for gas.

## 1. Deploy core v2 to Mordor with the admin key

```bash
npm run floppy:mount
export FLOPPY_KEYSTORE_PASSWORD="<password>"
export TREASURY="0x…"            # optional; defaults to deployer

# Core-only path (skips Polymarket adapter + mocks; real Classic USD only):
npx hardhat run scripts/deploy/deploy.js --network mordor
```

**Expected**: deploys MembershipManager (tier-seeded), WagerRegistry (with `address(0)` Polymarket adapter, Sanctions Guard wired + enforced), KeyRegistry. **No** PolymarketOracleAdapter, **no** MockPolymarketCTF, **no** MockERC20. Writes `deployments/mordor-chain63-v2.json` (see [contracts/deployment-record.md](./contracts/deployment-record.md)). Aborts loudly if Classic USD is unset/invalid.

```bash
npm run floppy:unmount
```

## 2. Sync frontend config (v1 → v2)

```bash
# First: reset MORDOR_CONTRACTS in frontend/src/config/contracts.js to the v2 shape
# (remove all v1-only fields) so sync does not orphan them.
npm run sync:frontend-contracts -- --network mordor --chainId 63
```

**Expected**: `MORDOR_CONTRACTS` now holds `wagerRegistry, membershipManager, keyRegistry, sanctionsGuard, paymentToken` (no oracle adapter keys).

## 3. Read-only on-chain validation

```bash
npx hardhat run scripts/debug/validate-amoy-deployment.js --network mordor
```

**Expected**: core contracts report **LIVE** at the recorded addresses; oracle adapters report intentionally absent. No transactions sent.

## 4. End-to-end smoke (peer-resolution + refund paths)

```bash
npx hardhat run scripts/e2e-wager-flow.js --network mordor
```

**Expected** (oracle steps skipped — none deployed): KeyRegistry register/fetch; MembershipManager purchase a tier in **Classic USD**; create an **Either**-resolution wager in Classic USD, accept, declare winner, claim 2× stake; refund path when opponent never accepts. Requires test USC + test ETC on the e2e accounts.

## 5. Frontend — Network tab

```bash
npm run test:frontend        # NetworkSettings, contractsConfig, capability/resolution cases
npm run frontend             # manual check
```

**Manual checks**:
- [ ] My Account → Network shows a **Mordor** card labeled **Testnet**.
- [ ] Capability tags: P2P Wagers ✓, Memberships ✓, Encrypted Wagers ✓, Sanctions Guard ✓; Polymarket/Chainlink/UMA —; Token Swap ✓ iff ETCswap configured.
- [ ] Card shows docs: ETC native currency, faucet link, Blockscout link, Classic USD stablecoin, ETCswap swap link.
- [ ] Switch to Mordor → wallet prompts to confirm; app activates Mordor; data scoped to Mordor; legacy Testnet/Mainnet toggle degrades (hidden/disabled), not broken.
- [ ] Create-wager offers only Either/Me/Them/Friend; oracle resolution types absent.
- [ ] No legacy v1 Mordor data appears anywhere.

## 6. Docs

- [ ] Network/architecture docs updated: Mordor as a v2 testnet, Classic USD + ETCswap + Blockscout + faucet, capability matrix, and v1 retirement.

---

## Success = spec criteria met

SC-001 (core live + recorded, oracles absent) · SC-002 (selectable + docs) · SC-003 (Classic USD wager end-to-end) · SC-004 (ETCswap swap when liquidity present) · SC-005 (tags truthful, unsupported hidden) · SC-006 (isolation + v1 retired) · SC-007 (admin key, no secrets leaked).
