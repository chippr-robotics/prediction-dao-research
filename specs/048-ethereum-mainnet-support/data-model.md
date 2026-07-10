# Phase 1 Data Model: Ethereum Mainnet & Testnet Support

This feature adds **no persisted data and no schema**. The "entities" are frontend
configuration records in the existing single-source-of-truth files. This document
specifies their concrete shapes and validation rules so `/speckit-tasks` and
implementation have an exact target.

## Entity: Network (config/networks.js `NETWORKS[chainId]`)

Existing shape, reused. New/changed instances:

### Ethereum mainnet (chainId 1) — promote comments; capabilities unchanged

Already present as a value/ClearPath network with `selectable: true`. No capability-flag
change (send/receive/portfolio are not capability flags). Only the descriptive comments are
refreshed to reflect it is now a first-class value network. Fields relied on:

| Field | Value | Note |
|-------|-------|------|
| `chainId` | `1` | |
| `name` | `Ethereum` | |
| `isTestnet` | `false` | |
| `selectable` | `true` | unchanged |
| `nativeCurrency` | `{ decimals: 18, name: 'Ether', symbol: 'ETH' }` | |
| `stablecoin` | native USDC `0xA0b8…eB48`, decimals 6, `domainVersion: '2'` | unchanged |
| `dex` | `null` | no in-app swap (honest disclosure) |
| `contracts` | `{}` | no app deployment |
| `capabilities` | `clearpath: true`; dex/passkey/polymarket/friendMarkets `false` | unchanged |

### Sepolia (chainId 11155111) — flip to selectable

Existing entry changes exactly one field:

| Field | From | To |
|-------|------|----|
| `selectable` | `false` | `true` |

All other fields (native ETH, faucet USDC stablecoin, `isTestnet: true`, capabilities all
`false`) unchanged.

### Hoodi (chainId 560048) — NEW entry

Mirror the Sepolia entry shape:

| Field | Value |
|-------|-------|
| `chainId` | `560048` |
| `name` | `Hoodi` |
| `isTestnet` | `true` |
| `isPrimary` | `false` |
| `selectable` | `true` |
| `nativeCurrency` | `{ decimals: 18, name: 'Hoodi Ether', symbol: 'ETH' }` |
| `rpcUrl` | `import.meta.env?.VITE_RPC_URL_HOODI \|\| 'https://ethereum-hoodi-rpc.publicnode.com'` |
| `explorer` | `{ name: 'Etherscan', baseUrl: 'https://hoodi.etherscan.io' }` |
| `subgraphUrl` | `null` |
| `stablecoin` | `VITE_HOODI_USDC` → **null by default** (no invented address; see research R2) |
| `dex` | `null` |
| `contracts` | `{}` |
| `polymarket` | `null` |
| `passkey` | `null` |
| `capabilities` | all `false` (dex, passkeyAccounts, polymarketSidebets, friendMarkets, clearpath) |

**Validation rules** (asserted by tests):
- `isSupportedChainId(560048) === true`; `getNetwork(560048).name === 'Hoodi'`.
- Appears in `getSelectableNetworks()`; sorted after mainnets (testnet).
- `rpcUrl` matches `^https?://`; `explorer.baseUrl` contains `etherscan`.
- Every capability flag is `false` (honest disclosure — no app infra on Hoodi).
- If `stablecoin` is null, `getPortfolioRegistry(560048)` yields the native entry (+ any
  real curated token), never an empty-address stablecoin entry.

## Entity: Selectable-network set (getSelectableNetworks)

Derived, not stored. Post-change the set MUST include chainIds
`{137, 61, 1, 63, 80002, 11155111, 560048}` (mainnets before testnets). No entry removed.

## Entity: Wagmi chain registration (wagmi.js)

Non-persisted runtime config. Adds three chains to `createConfig({ chains })`:

| chainId | Source | Transport |
|---------|--------|-----------|
| `1` | `mainnet` from `wagmi/chains` | `http(networkId===1 ? rpcUrl : 'https://ethereum-rpc.publicnode.com')` |
| `11155111` | `sepolia` from `wagmi/chains` | `http('https://ethereum-sepolia-rpc.publicnode.com')` |
| `560048` | inline `hoodi` def (like `mordor`) | `http('https://ethereum-hoodi-rpc.publicnode.com')` |

**Rules**: `polygon` stays first in the `chains` array (wagmi default chain — FR-015);
`getExpectedChain` gains `case 1 / 11155111 / 560048`. RPC defaults MUST match the
corresponding `networks.js` `rpcUrl` defaults (single-source consistency).

## Entity: Curated token (config/assetTaxonomy.js `CURATED_REGISTRY[1]`)

Append canonical Ethereum-mainnet ERC-20s (WETH already present):

| symbol | address | decimals | categoryId | baselineSymbol |
|--------|---------|----------|------------|----------------|
| `USDT` | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 | `payment-stablecoins` | — |
| `DAI` | `0x6B175474E89094C44Da98b954EedeAC495271d0F` | 18 | `payment-stablecoins` | — |

Also add to `UNDERLYING_META`: `DAI: { name: 'Dai Stablecoin', homeChainId: null }`.
(USDC arrives via the network `stablecoin`; ETH native + WETH already handled.)

**Rules**: addresses are canonical checksummed mainnet deployments; each stablecoin values
at par $1; no non-canonical or unverifiable token added.

## Entity: Price feed (config/priceFeeds.js `CHAINLINK_FEEDS[1]`)

Add the mainnet feed block (canonical AggregatorV3 `*/USD`, 8-decimal):

| symbol | feed address (env-overridable) |
|--------|-------------------------------|
| `ETH` | `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419` |
| `BTC` | `0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c` |
| `LINK` | `0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c` |

**Rules**: feeds resolve ETH & WETH (WETH prices as ETH via `underlyingSymbolOf`);
`FEED_MAX_AGE_SECONDS` staleness rule unchanged; assets without a feed and not par stay
`usd: null` (honest, excluded from sums).

## Entity: Explorer base URL (config/blockExplorer.js)

Change resolution from a hardcoded map to the network config:

- `getBlockscoutBaseUrl(chainId)` → prefer `getNetwork(chainId)?.explorer?.baseUrl`; fall
  back to the existing map for chains already listed; **remove the silent Amoy default** —
  an unknown chain yields no base URL (callers render no link) rather than a wrong-network
  link.

**Rules** (asserted by tests): `getBlockscoutUrl(1, addr)` contains `etherscan.io` and
never `polygonscan`; `getBlockscoutUrl(11155111, addr)` contains `sepolia.etherscan.io`;
`getBlockscoutUrl(560048, addr)` contains `hoodi.etherscan.io`; existing chains (61/63/137/
80002) unchanged.

## State & lifecycle

None. Network selection is transient wallet/wagmi state (as today). The only member-scoped
persisted preference involved — "show testnet assets" — already exists and is unchanged; it
gates whether Hoodi/Sepolia holdings appear in the portfolio (FR-007).

## Cross-entity invariants

- **No leak (FR-016)**: every per-chain lookup (tokens, feeds, explorer, subgraph) is keyed
  strictly by `chainId`; no default that substitutes another network's identity.
- **Honest capability (FR-005, III)**: capability flags for the Ethereum family stay `false`
  except where genuinely available; the Network tab tags and `NetworkUnavailableNotice`
  reflect them unchanged.
- **Default unchanged (FR-015)**: `PRIMARY_CHAIN_ID`/`MAINNET_CHAIN_ID` = 137, wagmi default
  chain = polygon — untouched.
