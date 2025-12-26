/**
 * Network configuration utilities
 * Manages network endpoints and configuration for ETC mainnet, Mordor testnet, and local Hardhat
 */

// Public RPC endpoints from chainlist.org for Ethereum Classic
export const PUBLIC_RPC_ENDPOINTS = {
  mainnet: [
    { url: 'https://etc.etcdesktop.com', name: 'ETC Desktop' },
    { url: 'https://etc.rivet.link', name: 'Rivet' },
    { url: 'https://0xrpc.io/etc', name: '0xRPC' },
    { url: 'https://besu-at.etc-network.info', name: 'ETC Network (Besu)' },
    { url: 'https://geth-at.etc-network.info', name: 'ETC Network (Geth)' },
    { url: 'https://etc.mytokenpocket.vip', name: 'MyTokenPocket' },
  ],
  mordor: [
    { url: 'https://rpc.mordor.etccooperative.org', name: 'ETC Cooperative' },
    { url: 'https://geth-mordor.etc-network.info', name: 'ETC Network (Geth)' },
  ],
  hardhat: [
    { url: 'http://127.0.0.1:8545', name: 'Local Hardhat' },
  ],
}

// WebSocket endpoints for real-time event monitoring
// Note: WebSocket support varies by provider - these are converted from HTTP URLs
export const PUBLIC_WS_ENDPOINTS = {
  mainnet: [
    { url: 'wss://0xrpc.io/etc', name: '0xRPC WS' },
  ],
  mordor: [
    // Most Mordor endpoints don't publicly expose WebSocket
    // Will fallback to HTTP polling if WS not available
  ],
  hardhat: [
    { url: 'ws://127.0.0.1:8545', name: 'Local Hardhat WS' },
  ],
}

// Network configurations
export const NETWORKS = {
  mainnet: {
    id: 61,
    chainId: 61,
    name: 'Ethereum Classic',
    shortName: 'ETC',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETC',
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [PUBLIC_RPC_ENDPOINTS.mainnet[0].url] },
      public: { http: PUBLIC_RPC_ENDPOINTS.mainnet.map(e => e.url) },
    },
    blockExplorers: {
      default: { name: 'BlockScout', url: 'https://etc.blockscout.com' },
    },
    testnet: false,
  },
  mordor: {
    id: 63,
    chainId: 63,
    name: 'Mordor Testnet',
    shortName: 'METC',
    nativeCurrency: {
      name: 'Mordor Ether',
      symbol: 'METC',
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [PUBLIC_RPC_ENDPOINTS.mordor[0].url] },
      public: { http: PUBLIC_RPC_ENDPOINTS.mordor.map(e => e.url) },
    },
    blockExplorers: {
      default: { name: 'BlockScout', url: 'https://etc-mordor.blockscout.com' },
    },
    testnet: true,
  },
  hardhat: {
    id: 1337,
    chainId: 1337,
    name: 'Hardhat Local',
    shortName: 'Hardhat',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: {
      default: { http: ['http://127.0.0.1:8545'] },
      public: { http: ['http://127.0.0.1:8545'] },
    },
    testnet: true,
  },
}

/**
 * Get network configuration by chain ID
 * @param {number} chainId - The chain ID to look up
 * @returns {Object|null} Network configuration or null if not found
 */
export function getNetworkByChainId(chainId) {
  const network = Object.values(NETWORKS).find(n => n.chainId === chainId)
  return network || null
}

/**
 * Get network name by chain ID
 * @param {number} chainId - The chain ID to look up
 * @returns {string} Network name or 'Unknown Network'
 */
export function getNetworkName(chainId) {
  const network = getNetworkByChainId(chainId)
  return network ? network.name : 'Unknown Network'
}

/**
 * Check if a network is a testnet
 * @param {number} chainId - The chain ID to check
 * @returns {boolean} True if testnet, false otherwise
 */
export function isTestnet(chainId) {
  const network = getNetworkByChainId(chainId)
  return network ? network.testnet : false
}

/**
 * Get RPC URL from environment or default for a network
 * @param {string} networkKey - The network key (mainnet, mordor, hardhat)
 * @returns {string} RPC URL
 */
export function getRpcUrl(networkKey) {
  // Check for environment variable override
  if (import.meta.env.VITE_RPC_URL) {
    return import.meta.env.VITE_RPC_URL
  }
  
  // Return default RPC for the network
  const network = NETWORKS[networkKey]
  return network ? network.rpcUrls.default.http[0] : null
}

/**
 * Get all available RPC endpoints for a network
 * @param {string} networkKey - The network key (mainnet, mordor, hardhat)
 * @returns {Array} Array of RPC endpoint objects
 */
export function getAvailableEndpoints(networkKey) {
  return PUBLIC_RPC_ENDPOINTS[networkKey] || []
}

/**
 * Get WebSocket URL from environment or default for a network
 * @param {string} networkKey - The network key (mainnet, mordor, hardhat)
 * @returns {string|null} WebSocket URL or null if not available
 */
export function getWsUrl(networkKey) {
  // Check for environment variable override
  const envKey = `VITE_${networkKey.toUpperCase()}_WS_URL`
  if (import.meta.env[envKey]) {
    return import.meta.env[envKey]
  }
  
  // Return first available WebSocket endpoint for the network
  const wsEndpoints = PUBLIC_WS_ENDPOINTS[networkKey]
  return wsEndpoints && wsEndpoints.length > 0 ? wsEndpoints[0].url : null
}

/**
 * Get all available WebSocket endpoints for a network
 * @param {string} networkKey - The network key (mainnet, mordor, hardhat)
 * @returns {Array} Array of WebSocket endpoint objects
 */
export function getAvailableWsEndpoints(networkKey) {
  return PUBLIC_WS_ENDPOINTS[networkKey] || []
}

/**
 * Get network configuration for the currently selected network from environment
 * @returns {Object} Network configuration
 */
export function getCurrentNetworkConfig() {
  const networkId = import.meta.env.VITE_NETWORK_ID 
    ? parseInt(import.meta.env.VITE_NETWORK_ID, 10) 
    : 63 // Default to Mordor testnet
  
  const network = getNetworkByChainId(networkId)
  return network || NETWORKS.mordor
}

/**
 * Get network key from chain ID
 * @param {number} chainId - The chain ID
 * @returns {string} Network key (mainnet, mordor, hardhat)
 */
export function getNetworkKey(chainId) {
  switch (chainId) {
    case 61:
      return 'mainnet'
    case 63:
      return 'mordor'
    case 1337:
      return 'hardhat'
    default:
      return 'mordor'
  }
}
