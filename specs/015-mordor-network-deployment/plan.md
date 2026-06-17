# Implementation Plan: Mordor Network Deployment

**Branch**: `015-mordor-network-deployment` | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-mordor-network-deployment/spec.md`

## Summary

Deploy the Ethereum-Classic-compatible subset of the FairWins v2 contracts to the Mordor testnet (chainId 63) using the air-gapped admin key, reusing the on-chain Classic USD (USC) stablecoin as the payment token, then register Mordor as a selectable network on the My Account → Network tab with accurate capability tags and operational documentation.

Key technical findings that shape the approach:

- **No contract changes are required.** `WagerRegistry` already accepts `address(0)` for the Polymarket adapter (`WagerRegistry.sol:126` — "may be zero to disable"), and `setSanctionsGuard`/`setOracleAdapter` document zero-as-disable. The core subset (wager registry, membership manager, key registry, sanctions guard) deploys against existing audited bytecode.
- **The change surface is the deploy script + frontend config**, not Solidity. The current `scripts/deploy/deploy.js` always deploys `PolymarketOracleAdapter` and, when `POLYMARKET_CTF[network]` is null, mints a `MockPolymarketCTF`; it also deploys a mock wrapped-native when `WMATIC` is null. Both would inject mocks onto a user-facing network — a Constitution III violation. The deploy path must be adjusted to skip the Polymarket adapter/mock on Mordor (pass `address(0)`), use real tokens only, and **hard-block if real Classic USD is absent** (no MockERC20 stablecoin fallback).
- **The Network tab is data-driven.** Capability tags (`networkCapabilities.js`) derive from deployed addresses + `capabilities.dex`, and `FriendMarketsModal` already gates oracle resolution types on deployed adapters. So once Mordor is registered selectable and synced, tags and resolution gating are correct automatically. The one genuine UI gap is per-network operational docs (faucet/explorer/stablecoin/swap), which the card does not show today.
- **v1 is retired by replacing the `MORDOR_CONTRACTS` block** in `contracts.js` with a v2 shape. The sync script only adds/updates keys (it does not prune), so the block must be reset to the v2 shape first. Legacy v1 references in app code degrade gracefully (guarded presence checks; `keyRegistry || zkKeyManager` fallback resolves to v2).

## Technical Context

**Language/Version**: Solidity ^0.8.x via Hardhat (no contract source changes); Node.js 22 for deploy/sync scripts; React 18 + Vite for the frontend.

**Primary Dependencies**: Existing FairWins v2 contract suite; Hardhat + ethers v6 (deploy); wagmi/viem (frontend network + `switchChain`); on-chain Ethereum Classic dependencies — Classic USD (USC) ERC-20, ETCswap (Uniswap-V3 fork: factory/swapRouter/quoter/positionManager), and Wrapped ETC (WETC).

**Storage**: `deployments/mordor-chain63-v2.json` is the source-of-truth deployment record; frontend reads generated config in `frontend/src/config/{networks,contracts}.js`.

**Testing**: Hardhat post-deploy validation (`scripts/debug/validate-amoy-deployment.js --network mordor`) and end-to-end smoke (`scripts/e2e-wager-flow.js --network mordor`, restricted to peer-resolved + refund paths since no oracle adapters exist); Vitest for frontend (NetworkSettings, contracts config, capability/resolution gating).

**Target Platform**: Ethereum Classic Mordor testnet (chainId 63, RPC `https://rpc.mordor.etccooperative.org`, explorer `https://etc-mordor.blockscout.com`); browser SPA (no backend — fixed footprint).

**Project Type**: Web — Solidity contracts (deploy-only here) + scripts + React frontend.

**Performance Goals**: Not a performance feature. Network-tab capability tags are computed client-side from config (no chain calls), so card render stays instant.

**Constraints**: No app backend (fixed footprint). No mocks/placeholders in shipped paths (Constitution III) — real Classic USD/WETC/ETCswap only; deployment blocks if real Classic USD is absent. Admin/deployer key only via the air-gapped floppy keystore; no plaintext keys/secrets in logs or VCS. Frontend addresses/ABIs/network config come only from generated sync artifacts (Constitution V). Network-scoped data must not leak across chains; Mordor labeled testnet.

**Scale/Scope**: One new network. ~4 core contracts deployed. Touch points: 1 deploy script + 1 constants file (deploy side); `networks.js`, `contracts.js`, `NetworkSettings.jsx`/`.css` (frontend); `hardhat.config.js` already has the `mordor` network; docs + tests. Pre-deploy verification of 3 external address sets (Classic USD, ETCswap, WETC) on Mordor.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|-----------|--------|
| **I. Security-First Smart Contracts** | No Solidity changes — existing audited v2 bytecode is deployed via the deterministic script. The `address(0)` Polymarket adapter and enforced Sanctions Guard are intended, documented contract capabilities. Admin/deployer key flows through the floppy keystore. Slither/Medusa posture is unchanged (no new contract code). Highest-risk surfaces (fund custody, access control) reuse the mainnet-parity configuration. | ✅ PASS |
| **II. Test-First & Coverage** | Deploy validated by the read-only validator + an on-chain e2e smoke (peer-resolution, claim, refund paths) on Mordor. Frontend adds Vitest cases for the Mordor card, per-chain contract resolution, capability tags, and oracle-gating-off. No contract interface changes → no contract test changes, but resolution/refund paths are exercised on the new network. | ✅ PASS (test tasks enumerated) |
| **III. Honest State, No Mocks in Shipped Paths** | **This is the gating principle.** Mordor is user-facing and selectable, so NO mocks may ship: deploy must skip `MockPolymarketCTF`/`PolymarketOracleAdapter` (zero adapter), must not deploy a mock stablecoin (block if real Classic USD absent), and must not deploy a mock wrapped-native. Capability tags reflect real deployment; v1 data retired; data scoped per-chain. The required deploy-script changes exist precisely to uphold this. | ✅ PASS (drives the deploy-script work) |
| **IV. Fail Loudly in CI** | New/updated Vitest + lint must pass with no `continue-on-error`. Deploy validation is a manual operator gate, not a CI mock. | ✅ PASS |
| **V. Accessible, Consistent Frontend** | New network-card documentation meets WCAG 2.1 AA (semantic markup, external links with `rel="noopener noreferrer"`, accessible names); axe/Lighthouse in CI. All Mordor addresses/config come from `networks.js` + the synced `contracts.js` (no hand-copied addresses in components). | ✅ PASS |
| **Additional — Key mgmt / Deployments / Archive** | Admin key via floppy keystore; `deployments/mordor-chain63-v2.json` is the recorded source of truth; no `contracts-archive/` imports. | ✅ PASS |

**Gate result: PASS.** One justified deviation (a deploy-script modification rather than "run the script unchanged") is logged in Complexity Tracking; it exists to satisfy Principle III.

## Project Structure

### Documentation (this feature)

```text
specs/015-mordor-network-deployment/
├── plan.md              # This file
├── spec.md              # Feature spec (with Clarifications)
├── research.md          # Phase 0 — decisions + pre-deploy verification gates
├── data-model.md        # Phase 1 — entities & config shapes
├── quickstart.md        # Phase 1 — runnable deploy + validation guide
├── contracts/           # Phase 1 — interface contracts
│   ├── deployment-record.md     # mordor-chain63-v2.json schema (core-only)
│   ├── network-config.md        # NETWORKS[63] + docs shape in networks.js
│   └── network-tab-card.md      # Network-tab card contract (tags + docs)
└── checklists/
    └── requirements.md  # Spec quality checklist (passing)
```

### Source Code (repository root)

```text
# Deploy / scripts (Hardhat, Node)
scripts/deploy/deploy.js                 # MODIFY: core-only path for Mordor (skip Polymarket adapter+mock; real-token-only; block if no Classic USD; real WETC or single-token allowlist)
scripts/deploy/lib/constants.js          # MODIFY: mordor TOKENS (Classic USD = USC, WETC) + NETWORK_CONFIG verified; keep oracle configs null
hardhat.config.js                        # REUSE: `mordor` network (chainId 63, floppyKeys) already present
deployments/mordor-chain63-v2.json       # CREATE (by deploy run): source-of-truth record, core contracts only
scripts/debug/validate-amoy-deployment.js# REUSE: run with --network mordor for read-only validation
scripts/e2e-wager-flow.js                # REUSE: peer-resolution + refund paths on --network mordor

# Frontend (React + Vite)
frontend/src/config/networks.js          # MODIFY: add NETWORKS[63] (ETC, Blockscout, Classic USD, ETCswap) + per-network docs; handle 2nd-testnet toggle assumption
frontend/src/config/contracts.js         # MODIFY: replace v1 MORDOR_CONTRACTS block with v2 shape (sync fills addresses)
frontend/src/config/networkCapabilities.js # NO CHANGE (data-driven tags)
frontend/src/components/wallet/NetworkSettings.jsx # MODIFY: render per-network operational docs (faucet/explorer/stablecoin/swap)
frontend/src/components/wallet/NetworkSettings.css # MODIFY: docs styles
frontend/src/hooks/useNetworkMode.js     # REVIEW/MODIFY: graceful handling when active chain is Mordor (isOtherChain) so the binary Testnet/Mainnet toggle degrades, not breaks
scripts/utils/sync-frontend-contracts.js # REUSE: maps mordor-chain63-v2.json → MORDOR_CONTRACTS

# Tests
frontend/src/test/NetworkSettings.test.jsx     # MODIFY: Mordor card + tags + docs + switch
frontend/src/test/contractsConfig.test.js      # MODIFY: per-chain (63) resolution; oracle adapters undefined
frontend/src/test/*                            # ADD: capability/resolution-gating-off cases as needed

# Docs
docs/ (architecture / network docs)      # MODIFY: Mordor as v2 testnet; Classic USD/ETCswap/explorer/faucet; v1 retirement
```

**Structure Decision**: Reuse the established deploy → record → sync → frontend-config pipeline. The deploy-side change is confined to `deploy.js` + `lib/constants.js` (no Solidity). The frontend change is additive config (`networks.js`, `contracts.js`) plus one component enhancement (`NetworkSettings.jsx`). `networkCapabilities.js` and the `FriendMarketsModal` oracle gating need no changes — they already derive behavior from deployed addresses.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Modify `deploy.js` instead of running it unchanged | The stock script always deploys `PolymarketOracleAdapter` + a `MockPolymarketCTF` (and a mock wrapped-native) when oracle/token config is null. On a user-facing, selectable network this ships mocks. The script must instead skip the adapter (pass `address(0)`, supported by `WagerRegistry`), use real tokens only, and hard-block when real Classic USD is absent. | Running as-is would deploy mocks onto Mordor — a direct Constitution III violation (no mocks/testnet shortcuts in shipped paths) and a breach of FR-001/FR-003. There is no config-only way to suppress the always-on Polymarket adapter + mock CTF. |
| Touch the binary `TESTNET_MAINNET_PAIR` toggle assumption | Mordor is a second testnet; `useNetworkMode` returns `mode:'other'` for it, which the legacy Testnet/Mainnet toggle does not expect. | Ignoring it would leave the toggle in a broken state when Mordor is active. The minimal fix (degrade/hide the toggle on `isOtherChain`, switching handled by the Network-tab cards) avoids a larger toggle redesign. |
