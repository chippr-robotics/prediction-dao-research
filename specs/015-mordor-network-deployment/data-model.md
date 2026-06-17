# Phase 1 Data Model: Mordor Network Deployment

**Date**: 2026-06-16 | **Feature**: [spec.md](./spec.md)

This feature adds configuration and a deployment record rather than a runtime database. The "entities" below are the config/record shapes and the derived view-models that drive behavior. See [contracts/](./contracts/) for the precise schemas.

---

## Entity: Mordor Network Profile

Where: `frontend/src/config/networks.js` → `NETWORKS[63]`. Single source of truth for chain metadata.

| Field | Type | Value / Rule |
|-------|------|--------------|
| `chainId` | number | `63` |
| `name` | string | `'Ethereum Classic Mordor'` |
| `isTestnet` | bool | `true` |
| `isPrimary` | bool | `false` |
| `selectable` | bool | `true` — makes it appear on the Network tab |
| `nativeCurrency` | object | `{ decimals: 18, name: 'Ethereum Classic', symbol: 'ETC' }` |
| `rpcUrl` | string | `VITE_RPC_URL_MORDOR` || `https://rpc.mordor.etccooperative.org` |
| `explorer` | object | `{ name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' }` |
| `stablecoin` | object | `{ address: <Classic USD on Mordor>, symbol: 'USC', name: 'Classic USD', decimals: <verified 6 or 18> }` |
| `dex` | object\|null | ETCswap `{ factory, swapRouter, quoter, positionManager, wnative(WETC) }` when all present; else `null` |
| `polymarket` | null | No Polymarket on ETC |
| `contracts` | object | `{}` (legacy field; live addresses come from `contracts.js`) |
| `resources` | object | NEW: `{ faucet: <url>, dexUrl: <ETCswap url> }` — card links not derivable from other fields |
| `capabilities` | getter | `{ polymarketSidebets: false, dex: Boolean(this.dex), friendMarkets: true }` |

**Relationships**: consumed by `getSelectableNetworks()`, `getNetwork()`, `NetworkSettings`, `DexContext`, and `networkCapabilities.getNetworkFeatures()`.

**Validation**: `stablecoin.address` and (if set) every `dex` address match `^0x[0-9a-fA-F]{40}$`. If any required `dex` address is missing, `dex = null` and the swap capability is off.

---

## Entity: Mordor Deployment Record

Where: `deployments/mordor-chain63-v2.json`. Written by `deploy.js`; the source of truth for addresses; consumed by `sync-frontend-contracts.js`. Core-only shape (no oracle adapters). Full schema in [contracts/deployment-record.md](./contracts/deployment-record.md).

| Field | Type | Rule (core-only) |
|-------|------|------------------|
| `network` | string | `"mordor"` |
| `chainId` | number | `63` |
| `deployer` | address | admin key address (from floppy keystore) |
| `treasury` | address | `TREASURY` env or deployer |
| `paymentToken` | address | **real** Classic USD (USC) on Mordor — never a mock |
| `wmatic` | address\|null | real WETC if allowlisted, else omitted/null (no mock) |
| `polymarketCTF` | null | absent — no Polymarket on Mordor |
| `contracts` | object | `{ wagerRegistry, membershipManager, keyRegistry, sanctionsGuard }` only |
| `mocks` | null | MUST be null — no mocks shipped |
| `saltPrefix` | string | `"FairWins-P2P-v2.0-"` |
| `timestamp` | ISO string | deploy time |

---

## Entity: Mordor Contract Config (frontend)

Where: `frontend/src/config/contracts.js` → `MORDOR_CONTRACTS` (replaces the legacy v1 block). v2 shape only.

| Field | Type | Source |
|-------|------|--------|
| `deployer`, `treasury` | address | deployment record |
| `wagerRegistry` | address | record `contracts.wagerRegistry` |
| `membershipManager` | address | record `contracts.membershipManager` |
| `keyRegistry` | address | record `contracts.keyRegistry` |
| `sanctionsGuard` | address | record `contracts.sanctionsGuard` |
| `paymentToken` | address | record `paymentToken` (Classic USD) |

**Removed v1 fields** (must be deleted, not left to orphan): `roleManagerCore, ragequitModule, tieredRoleManager, tierRegistry, usageTracker, paymentProcessor, membershipPaymentManager, friendGroupResolutionLib, friendGroupClaimsLib, friendGroupCreationLib, friendGroupMarketFactory, nullifierRegistry, zkKeyManager, roleManager`. App code references to these degrade to guarded no-ops on Mordor (the intended v1 retirement).

**Absent v2 fields** (intentionally not present → tags grey out): `polymarketAdapter, chainlinkDataFeedAdapter, chainlinkFunctionsAdapter, umaAdapter`.

---

## Derived View-Model: Network Capability Tags

Where: `frontend/src/config/networkCapabilities.js` (NO code change). `getNetworkFeatures(63)` resolves each tag from deployed addresses / `capabilities.dex`.

| Tag | Predicate | Mordor result |
|-----|-----------|---------------|
| P2P Wagers | `hasContract(63,'wagerRegistry')` | ✅ available |
| Memberships | `hasContract(63,'membershipManager')` | ✅ available |
| Encrypted Wagers | `hasContract(63,'keyRegistry')` | ✅ available |
| Sanctions Guard | `hasContract(63,'sanctionsGuard')` | ✅ available |
| Polymarket Oracle | `hasContract(63,'polymarketAdapter')` | ⬜ unavailable |
| Chainlink Oracle | `hasContract(63,'chainlink*Adapter')` | ⬜ unavailable |
| UMA Oracle | `hasContract(63,'umaAdapter')` | ⬜ unavailable |
| Token Swap | `Boolean(getNetwork(63)?.capabilities?.dex)` | ✅ if ETCswap configured, else ⬜ |

---

## Derived View-Model: Available Resolution Types (wager creation)

Where: `frontend/src/components/fairwins/FriendMarketsModal.jsx` (NO code change). Oracle types are gated on `getContractAddressForChain('<adapter>', chainId)` + exposure flag; peer types are always present.

- **Always available on Mordor**: Either, Creator (Me), Opponent (Them), ThirdParty (Friend/Arbitrator).
- **Gated off on Mordor**: Polymarket, ChainlinkDataFeed, ChainlinkFunctions, UMA (no adapter address present).

Canonical enum source: `frontend/src/constants/wagerDefaults.js`.

---

## State / Lifecycle (deployment)

```
[verify Classic USD on Mordor] → blocked if absent
        │ present
        ▼
[mount floppy + admin key] → [deploy core v2 to Mordor] → [write mordor-chain63-v2.json]
        │
        ▼
[replace MORDOR_CONTRACTS v1→v2 shape] → [sync:frontend-contracts] → [networks.js NETWORKS[63]]
        │
        ▼
[validate (read-only) + e2e smoke (peer paths)] → [docs] → [frontend tests] → done
```
