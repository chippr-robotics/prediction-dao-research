# Phase 0 Research: Mordor Network Deployment

**Date**: 2026-06-16 | **Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves the unknowns surfaced during planning. Items marked **VERIFY (blocking)** are on-chain facts that MUST be confirmed against the live Mordor testnet before the deploy is run; the spec made an existing canonical Classic USD a hard dependency.

---

## D1. Core-only deployment without contract changes

- **Decision**: Deploy only `MembershipManager`, `WagerRegistry`, `SanctionsGuard`, `KeyRegistry`. Construct `WagerRegistry` with `polymarketAdapter_ = address(0)`. Do NOT deploy `PolymarketOracleAdapter`, `MockPolymarketCTF`, or any Chainlink/UMA adapter.
- **Rationale**: `WagerRegistry.sol:126` sets `polymarketAdapter = IOracleAdapter(polymarketAdapter_); // may be zero to disable`. With a zero adapter the Polymarket resolution type is simply unavailable; peer/designated-resolver types (Either/Creator/Opponent/ThirdParty) are always available. No Solidity change is needed. Chainlink/UMA adapters already self-skip when `CHAINLINK_DATA_FEEDS[net]={}`, `CHAINLINK_FUNCTIONS_ROUTER[net]=null`, `UMA_OOV3[net]=null` (already the case for `mordor`).
- **Alternatives considered**: (a) Deploy all 8 with placeholder oracle addresses — rejected: ships inert/mocked contracts (Constitution III, FR-001). (b) Add a new "core-only" contract variant — rejected: unnecessary, the existing contract supports zero adapters.

## D2. Suppress mocks in the deploy path (Constitution III)

- **Decision**: Modify `scripts/deploy/deploy.js` so that for Mordor (and any network flagged no-Polymarket): (1) skip `resolvePolymarketCTF` + `PolymarketOracleAdapter`, passing `address(0)` to `WagerRegistry`; (2) never fall back to a `MockERC20` stablecoin — if `TOKENS.mordor.USC` is unset/invalid, throw and abort; (3) do not deploy a mock wrapped-native — either allowlist the real WETC or construct `WagerRegistry` with `initialTokens = [classicUSD]` only.
- **Rationale**: The stock script (`deploy.js:171-209`) deploys `MockERC20` USDC/WMATIC when `TOKENS[net]` is null and *always* deploys the Polymarket adapter (minting `MockPolymarketCTF` when CTF is null). Mordor is user-facing and selectable, so any of these mocks would violate Constitution III and FR-003. The current mainnet guard (`MAINNET_CHAIN_IDS=[1,61,137]`) does NOT cover Mordor (63), so the existing "no mock on mainnet" protection does not apply — Mordor needs an explicit real-tokens-only path.
- **Alternatives considered**: Gate on `MAINNET_CHAIN_IDS` — rejected: Mordor is a testnet, but the spec still forbids mocks here; a per-network `noPolymarket` / `requireRealStablecoin` flag in `lib/constants.js` is cleaner and reusable.
- **Implementation note**: Prefer `initialTokens = [classicUSD]` (single allowlisted stake token) unless WETC staking is explicitly wanted; this sidesteps the wrapped-native mock entirely. ETCswap's own WETC is used by the swap UI, independent of the registry allowlist.

## D3. Classic USD (USC) on Mordor — the stablecoin

- **Decision**: Reuse the existing on-chain Classic USD (USC) ERC-20 on Mordor as the payment token. Pin its address in `TOKENS.mordor.USC` (`lib/constants.js`) and surface it via `networks.js` `stablecoin`. No mock; **deployment is blocked if it does not exist** on Mordor.
- **Rationale**: Classic USD is Ethereum Classic's first fiat-backed stablecoin (issued by Brale.xyz; the ETCswap DeFi suite is built around `$USC`). classicusd.com explicitly lists Mordor testnet support (Chain ID 63). The repo already carries a candidate `USC = 0xDE093684c796204224BC081f937aa059D903c52a` (labeled 6 decimals) in `lib/constants.js`.
- **VERIFY (blocking)**:
  - Confirm the canonical Classic USD contract address on **Mordor (63)** (the repo candidate may be ETC mainnet vs Mordor — must be checked) via docs.brale.xyz / classicusd.com / `etc-mordor.blockscout.com`.
  - Confirm **decimals** (6 vs 18) — drives all amount formatting (`stablecoin.decimals` in `networks.js`, tier pricing via `toUSDC()` in deploy).
  - Confirm the deployer/admin can hold/use it on Mordor for the e2e smoke (need test USC).
- **Alternatives considered**: Deploy a test stablecoin (Amoy faucet-USDC pattern) — explicitly rejected by clarification Q2 (reuse-existing-only, no mock).

## D4. ETCswap on Mordor — the in-app swap

- **Decision**: Wire ETCswap (Uniswap-V3 fork) as the Mordor `dex` (factory/swapRouter/quoter/positionManager + WETC `wnative`) via env-overridable defaults in `networks.js`, mirroring the Amoy DEX pattern. The Token Swap capability flips on only when all required addresses are present; if ETCswap/liquidity is absent on Mordor, swap is cleanly hidden and the rest of the feature still ships.
- **Rationale**: `networkCapabilities.js` derives the Token Swap tag from `getNetwork(chainId)?.capabilities?.dex`, and the Amoy entry already gates its `dex` object on all addresses being present (returns `null` otherwise). ETCswap has a Mordor presence (a `launchpad-mordor.etcswap.org` exists), and ETCswap docs follow the canonical Uniswap V3 contract set.
- **VERIFY (non-blocking for MVP)**: ETCswap V3 factory / SwapRouter02 / QuoterV2 / NonfungiblePositionManager / WETC addresses on Mordor (63), and whether a Classic USD ↔ WETC pool with liquidity exists. Sources: github.com/etcswap, docs.etcswap.org (mainnet/Mordor addresses not on the public deployments page — pull from repo/Discord/on-chain). If unavailable, ship with `dex = null` (swap hidden) — still a valid MVP.

## D5. Mordor network metadata (frontend + faucet/explorer)

- **Decision**: `NETWORKS[63]` = `{ chainId: 63, name: 'Ethereum Classic Mordor', isTestnet: true, isPrimary: false, selectable: true, nativeCurrency: { decimals: 18, name: 'Ethereum Classic', symbol: 'ETC' }, rpcUrl: VITE_RPC_URL_MORDOR || 'https://rpc.mordor.etccooperative.org', explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' }, stablecoin: { address: VITE_MORDOR_USC || <USC>, symbol: 'USC', name: 'Classic USD', decimals: <verified> }, dex: <ETCswap or null>, polymarket: null, contracts: {}, capabilities: { polymarketSidebets: false, dex: Boolean(this.dex), friendMarkets: true } }`. Add a per-network `resources`/`docs` object for faucet + swap URLs not otherwise on the network object.
- **Rationale**: Mirrors the existing Amoy entry shape so `getSelectableNetworks()` and `NetworkSettings` pick it up automatically. `explorer.baseUrl`, `nativeCurrency`, and `stablecoin.name` already cover most card docs; only faucet + DEX URLs need a new field.
- **VERIFY**: Mordor faucet URL (e.g. the ETC Cooperative faucet) and ETCswap app/swap URL for the card links. RPC `https://rpc.mordor.etccooperative.org` and explorer `https://etc-mordor.blockscout.com` are confirmed (repo `lib/constants.js` + Blockscout).

## D6. v1 → v2 replacement in `contracts.js`

- **Decision**: Replace the entire `MORDOR_CONTRACTS` block with the v2 shape (`deployer, treasury, wagerRegistry, membershipManager, keyRegistry, sanctionsGuard, paymentToken`), removing all v1-only fields. Then run `npm run sync:frontend-contracts -- --network mordor --chainId 63` to fill addresses from the record.
- **Rationale**: The sync script only adds/updates keys within the named block — it does not prune — so the v1 fields must be removed by hand first or they orphan. App-code references to v1 fields degrade gracefully: `keyRegistryService.js` resolves `keyRegistry || zkKeyManager` (v2 `keyRegistry` wins), and `blockchainService.js` guards `friendGroupMarketFactory`/`tierRegistry`/`tieredRoleManager` with presence checks, so their absence on Mordor cleanly disables those legacy paths (the desired v1 retirement).
- **VERIFY**: After replacement, smoke the app on Mordor to confirm no code path throws on the now-absent v1 fields (expected: guarded no-ops).

## D7. Second-testnet toggle assumption (`useNetworkMode`)

- **Decision**: Keep the Network-tab cards as the canonical switcher (already generic over all `selectable` networks via `wagmi.switchChain`). Make the legacy binary Testnet/Mainnet toggle degrade gracefully when the active chain is Mordor: when `useNetworkMode()` returns `isOtherChain` (Mordor 63 ∉ `TESTNET_MAINNET_PAIR`), hide/disable the toggle with a hint to use Network settings, rather than render a broken state.
- **Rationale**: `TESTNET_MAINNET_PAIR = { testnet: 80002, mainnet: 137 }` is binary; Mordor falls through to `mode:'other'`. PR #695 already relocated network selection to the Network tab, so cards are the primary path; the toggle only needs to not break.
- **Alternatives considered**: Generalize the toggle into an N-network control — rejected (YAGNI; the cards already do this). Remove the toggle entirely — deferred (larger change; not required by this spec).

## D8. Admin-key deploy via floppy keystore

- **Decision**: Deploy with `npm run floppy:mount`, `export FLOPPY_KEYSTORE_PASSWORD=…`, then `npx hardhat run scripts/deploy/deploy.js --network mordor`. The `mordor` hardhat network uses `accounts: floppyKeys` with no `PRIVATE_KEY` fallback; the admin key is `admin-keystore.json` (single key) or the first key derived from `mnemonic-keystore.json`.
- **Rationale**: Matches the constitution's air-gapped key workflow; no secret is committed or printed. `package.json`'s `deploy:mordor` points at a non-existent `deploy-deterministic.js`, so invoke `deploy.js` directly (and optionally fix the npm script).
- **VERIFY**: Deployer (admin key) address is funded with enough Mordor test ETC for gas, and `TREASURY` is set (or defaults to deployer).

---

## Summary of blocking pre-deploy gates

1. **Classic USD on Mordor** — canonical address + decimals confirmed on-chain (D3). Without it the feature is blocked.
2. **Deploy-script real-tokens-only + zero-Polymarket path** implemented and unit-sanity-checked before mainnet-style run (D2).
3. **Deployer funded** with Mordor test ETC; admin keystore mounts and loads (D8).

Non-blocking (degrade gracefully): ETCswap/liquidity (D4 — swap hidden if absent), faucet/swap URLs (D5).
