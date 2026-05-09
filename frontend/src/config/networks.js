/**
 * Per-chain configuration for the FairWins app.
 *
 * This is the single source of truth for chain metadata, contract addresses,
 * stablecoin info, explorer URLs, and per-chain feature capabilities. All other
 * config files (wagmi.js, thirdweb.js, contracts.js, blockExplorer.js,
 * etcswap.js) derive their values from this map.
 *
 * Adding a new chain: append a new entry keyed by chainId. The capabilities
 * object controls which features are available — Polymarket-pegged side bets
 * only work on chains that co-locate with Polymarket's CTF (currently Polygon
 * Amoy as the testnet).
 */

// Note: We intentionally do NOT import from ./contracts here — contracts.js
// imports from this file (indirectly, via NETWORK_CONFIG-style lookups) and a
// hard import would create a cycle. Per-chain Mordor contract addresses live
// in contracts.js as DEPLOYED_CONTRACTS; consumers that need the contracts
// map should import from there directly.

// ETCSwap V3 addresses on Mordor. These are the addresses currently deployed
// on the Mordor testnet — same Uniswap V3 ABI surface as on Polygon.
const ETCSWAP_MORDOR_DEX = {
  factory: '0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC',
  swapRouter: '0xEd88EDD995b00956097bF90d39C9341BBde324d1',
  positionManager: '0x3CEDe6562D6626A04d7502CC35720901999AB699',
}

const PRIMARY_CHAIN_ID = 80002

const NETWORKS = {
  61: {
    chainId: 61,
    name: 'Ethereum Classic',
    isTestnet: false,
    isPrimary: false,
    limitedFunctionality: false,
    nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETC' },
    rpcUrl: 'https://etc.rivet.link',
    explorer: { name: 'Blockscout', baseUrl: 'https://etc.blockscout.com' },
    stablecoin: null,
    dex: null,
    contracts: {},
    capabilities: { polymarketSidebets: false, dex: false, friendMarkets: false },
  },
  63: {
    chainId: 63,
    name: 'Mordor',
    isTestnet: true,
    isPrimary: false,
    // Mordor is kept live but Polymarket-pegged side bets are unavailable here
    // because Polymarket's CTF only exists on Polygon. Surfaces that depend on
    // it should hide or disable behind the limited-functionality banner.
    limitedFunctionality: true,
    nativeCurrency: { decimals: 18, name: 'Mordor Ether', symbol: 'METC' },
    rpcUrl: 'https://rpc.mordor.etccooperative.org',
    explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' },
    stablecoin: {
      address: '0xDE093684c796204224BC081f937aa059D903c52a',
      symbol: 'USC',
      name: 'Classic USD',
      decimals: 6,
    },
    dex: ETCSWAP_MORDOR_DEX,
    // Mordor contract addresses are managed in frontend/src/config/contracts.js
    // (DEPLOYED_CONTRACTS). Keep this empty to avoid the circular import — code
    // that needs the per-contract addresses on Mordor should import from
    // contracts.js, not from networks.js.
    contracts: {},
    capabilities: { polymarketSidebets: false, dex: true, friendMarkets: true },
  },
  80002: {
    chainId: 80002,
    name: 'Polygon Amoy',
    isTestnet: true,
    isPrimary: true,
    limitedFunctionality: false,
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
    // No official Uniswap V3 deployment on Amoy at time of writing. Set to null
    // and let consumers branch on `isDexAvailable`. The friend-market settle-by-
    // referenced-lookup flow does not require the DEX path.
    dex: null,
    contracts: {}, // populated by sync:frontend-contracts:amoy after deploy
    polymarket: { ctf: import.meta.env?.VITE_AMOY_POLYMARKET_CTF || null },
    capabilities: { polymarketSidebets: true, dex: false, friendMarkets: true },
  },
  1337: {
    chainId: 1337,
    name: 'Hardhat',
    isTestnet: true,
    isPrimary: false,
    limitedFunctionality: false,
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
 * Whether a chainId is a supported network. Used by the wallet/web3 contexts
 * to allow either Mordor (limited functionality) or Polygon Amoy (primary)
 * without prompting the user to switch — the per-chain capabilities map
 * controls what features each chain can actually do.
 */
export function isSupportedChainId(chainId) {
  return Object.prototype.hasOwnProperty.call(NETWORKS, chainId)
}

export function listSupportedChainIds() {
  return Object.keys(NETWORKS).map((id) => parseInt(id, 10))
}
