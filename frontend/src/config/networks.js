/**
 * Per-chain configuration for the FairWins app.
 *
 * Single source of truth for chain metadata, contract addresses, stablecoin
 * info, DEX deployments, explorer URLs, and per-chain capabilities. Other
 * config (wagmi.js, contracts.js, blockExplorer.js, dex.js) derives from
 * this map.
 *
 * Supported chains:
 *   - Polygon Amoy (80002) — default testnet. Co-locates with Polymarket's
 *     CTF for settle-by-reference; community Uniswap V3 contracts may be
 *     plugged in via VITE_AMOY_UNISWAP_* env vars.
 *   - Polygon Mainnet (137) — production. Canonical Uniswap V3 deployment.
 *   - Hardhat (1337) — local dev.
 *
 * The user-facing Testnet/Mainnet toggle switches between 80002 and 137 via
 * wagmi.switchChain.
 */

// Note: We intentionally do NOT import from ./contracts here — contracts.js
// imports from this file (indirectly, via NETWORK_CONFIG-style lookups) and a
// hard import would create a cycle.

const PRIMARY_CHAIN_ID = 80002
const MAINNET_CHAIN_ID = 137

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
    // Uniswap V3 has no canonical deployment on Polygon Amoy. Community
    // deployments exist; supply them via VITE_AMOY_UNISWAP_* env vars to
    // enable swaps on testnet. When any required address is missing the DEX
    // capability flips off and the swap UI is hidden.
    dex: (() => {
      const factory = import.meta.env?.VITE_AMOY_UNISWAP_FACTORY
      const router = import.meta.env?.VITE_AMOY_UNISWAP_SWAP_ROUTER
      const quoter = import.meta.env?.VITE_AMOY_UNISWAP_QUOTER
      const positionManager = import.meta.env?.VITE_AMOY_UNISWAP_POSITION_MANAGER
      const wnative = import.meta.env?.VITE_AMOY_WMATIC
      if (!factory || !router || !quoter || !wnative) return null
      return {
        factory,
        swapRouter: router,
        quoter,
        positionManager: positionManager || null,
        wnative,
      }
    })(),
    contracts: {}, // populated by sync:frontend-contracts after deploy
    polymarket: {
      ctf: import.meta.env?.VITE_AMOY_POLYMARKET_CTF || null,
      // Gamma API endpoint for Polymarket event search. Polymarket runs the
      // same Gamma instance for testnet listings.
      gammaApiUrl: import.meta.env?.VITE_POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com',
    },
    get capabilities() {
      return {
        polymarketSidebets: true,
        dex: Boolean(this.dex),
        friendMarkets: true,
      }
    },
  },
  137: {
    chainId: 137,
    name: 'Polygon',
    isTestnet: false,
    isPrimary: false,
    nativeCurrency: { decimals: 18, name: 'MATIC', symbol: 'MATIC' },
    rpcUrl: import.meta.env?.VITE_RPC_URL_POLYGON || 'https://polygon-rpc.com',
    explorer: { name: 'Polygonscan', baseUrl: 'https://polygonscan.com' },
    // Native USDC on Polygon (Circle-issued, USDC.e is the bridged variant
    // and is not used here). Decimals=6.
    stablecoin: {
      address: import.meta.env?.VITE_POLYGON_USDC || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    },
    // Canonical Uniswap V3 deployment on Polygon Mainnet.
    // https://docs.uniswap.org/contracts/v3/reference/deployments
    dex: {
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
      quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      wnative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    },
    contracts: {},
    polymarket: {
      ctf: import.meta.env?.VITE_POLYGON_POLYMARKET_CTF || '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
      gammaApiUrl: import.meta.env?.VITE_POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com',
    },
    get capabilities() {
      return {
        polymarketSidebets: true,
        dex: Boolean(this.dex),
        friendMarkets: true,
      }
    },
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
    polymarket: null,
    capabilities: { polymarketSidebets: false, dex: false, friendMarkets: true },
  },
}

export { NETWORKS, PRIMARY_CHAIN_ID, MAINNET_CHAIN_ID }

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
 * Whether a chainId is a supported network.
 */
export function isSupportedChainId(chainId) {
  return Object.prototype.hasOwnProperty.call(NETWORKS, chainId)
}

export function listSupportedChainIds() {
  return Object.keys(NETWORKS).map((id) => parseInt(id, 10))
}

/**
 * Pair of (testnet, mainnet) chain IDs used by the Testnet/Mainnet toggle.
 * Surfaced as a helper so UI code doesn't have to know the numeric values.
 */
export const TESTNET_MAINNET_PAIR = {
  testnet: PRIMARY_CHAIN_ID,
  mainnet: MAINNET_CHAIN_ID,
}
