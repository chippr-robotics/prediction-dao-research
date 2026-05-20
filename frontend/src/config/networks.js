/**
 * Per-chain configuration for the FairWins app.
 *
 * This is the single source of truth for chain metadata, contract addresses,
 * stablecoin info, explorer URLs, and per-chain feature capabilities. All other
 * config files (wagmi.js, thirdweb.js, contracts.js, blockExplorer.js) derive
 * their values from this map.
 *
 * Polygon Amoy is the only supported testnet — it co-locates with Polymarket's
 * Conditional Tokens Framework so friend markets can settle by referenced
 * lookup without a bridge. Hardhat (1337) is kept for local development only.
 */

// Note: We intentionally do NOT import from ./contracts here — contracts.js
// imports from this file (indirectly, via NETWORK_CONFIG-style lookups) and a
// hard import would create a cycle.

const PRIMARY_CHAIN_ID = 80002

const NETWORKS = {
  80002: {
    chainId: 80002,
    name: 'Polygon Amoy',
    isTestnet: true,
    isPrimary: true,
    nativeCurrency: { decimals: 18, name: 'MATIC', symbol: 'MATIC' },
    rpcUrl: import.meta.env?.VITE_RPC_URL_AMOY || 'https://rpc-amoy.polygon.technology',
    explorer: { name: 'Polygonscan', baseUrl: 'https://amoy.polygonscan.com' },
    // Polymarket testnet USDC on Amoy. The exact address must be set per
    // deployment via VITE_AMOY_USDC — there is no committed default because
    // Polymarket's testnet configuration changes from time to time.
    stablecoin: {
      address: import.meta.env?.VITE_AMOY_USDC || null,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    },
    // No official Uniswap V3 deployment on Amoy at time of writing. The friend-
    // market settle-by-referenced-lookup flow does not require the DEX path.
    dex: null,
    contracts: {}, // populated by sync:frontend-contracts after deploy
    polymarket: { ctf: import.meta.env?.VITE_AMOY_POLYMARKET_CTF || null },
    capabilities: { polymarketSidebets: true, dex: false, friendMarkets: true },
  },
  1337: {
    chainId: 1337,
    name: 'Hardhat',
    isTestnet: true,
    isPrimary: false,
    nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
    rpcUrl: 'http://127.0.0.1:8545',
    explorer: { name: 'Local', baseUrl: '' },
    stablecoin: null,
    dex: null,
    contracts: {},
    capabilities: { polymarketSidebets: false, dex: false, friendMarkets: true },
  },
}

export { NETWORKS, PRIMARY_CHAIN_ID }

export function getCurrentChainId() {
  const env = import.meta.env?.VITE_NETWORK_ID
  return env ? parseInt(env, 10) : PRIMARY_CHAIN_ID
}

export function getNetwork(chainId) {
  return NETWORKS[chainId] || NETWORKS[getCurrentChainId()] || NETWORKS[PRIMARY_CHAIN_ID]
}

export function isDexAvailable(chainId) {
  return Boolean(getNetwork(chainId)?.dex)
}

/**
 * Whether a chainId is a supported network. The app supports Polygon Amoy
 * (the Polymarket testnet, primary) and Hardhat (local dev) only.
 */
export function isSupportedChainId(chainId) {
  return Object.prototype.hasOwnProperty.call(NETWORKS, chainId)
}

export function listSupportedChainIds() {
  return Object.keys(NETWORKS).map((id) => parseInt(id, 10))
}
