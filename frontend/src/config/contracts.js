/**
 * Deployed contract addresses for the active testnet (Polygon Amoy).
 *
 * Populated by `scripts/utils/sync-frontend-contracts.js` after each deploy;
 * the empty defaults here exist so the module is importable before the first
 * deploy lands. Override individual addresses via VITE_<NAME>_ADDRESS env vars.
 */

export const DEPLOYED_CONTRACTS = {
  deployer: '',
  treasury: '',

  roleManagerCore: '',
  ragequitModule: '',

  tieredRoleManager: '',
  tierRegistry: '',
  usageTracker: '',
  membershipManager: '',
  paymentProcessor: '',
  membershipPaymentManager: '',

  friendGroupResolutionLib: '',
  friendGroupClaimsLib: '',
  friendGroupCreationLib: '',
  friendGroupMarketFactory: '',

  nullifierRegistry: '',
  zkKeyManager: '',

  // Back-compat alias for roleManager → tieredRoleManager
  roleManager: '',
}

/**
 * Deployment block numbers for event scanning.
 * Used as the starting block when no cached index exists, avoiding full-chain scans.
 */
export const DEPLOYMENT_BLOCKS = {
  friendGroupMarketFactory: 0,
}

/**
 * Get contract address from environment or use deployed default
 * @param {string} contractName - Name of the contract
 * @returns {string} Contract address
 */
export function getContractAddress(contractName) {
  // Check environment variables first (for custom deployments)
  // Support both legacy style (VITE_ROLEMANAGER_ADDRESS) and snake-case style (VITE_ROLE_MANAGER_ADDRESS)
  const upper = contractName.toUpperCase()
  const snake = contractName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()

  const envKeys = [`VITE_${upper}_ADDRESS`, `VITE_${snake}_ADDRESS`]
  for (const envKey of envKeys) {
    const envAddress = import.meta.env[envKey]
    if (envAddress) return envAddress
  }

  // Fall back to deployed contract addresses
  return DEPLOYED_CONTRACTS[contractName]
}

/**
 * Network configuration for the active chain. The active chain is selected via
 * VITE_NETWORK_ID and defaults to Polygon Amoy (the Polymarket testnet).
 *
 * Note: this lookup is intentionally inlined rather than imported from
 * networks.js to avoid a circular import (networks.js consumes
 * DEPLOYED_CONTRACTS from this file). For the full chain config — DEX
 * addresses, capabilities, etc. — read from frontend/src/config/networks.js.
 */
const _activeChainId = parseInt(import.meta.env.VITE_NETWORK_ID || '80002', 10)

const _NETWORK_CONFIG_BY_CHAIN = {
  80002: {
    name: 'Polygon Amoy',
    rpcUrl: import.meta.env.VITE_RPC_URL_AMOY || 'https://rpc-amoy.polygon.technology',
    blockExplorer: 'https://amoy.polygonscan.com',
  },
  1337: { name: 'Hardhat', rpcUrl: 'http://127.0.0.1:8545', blockExplorer: '' },
}

const _activeNetwork = _NETWORK_CONFIG_BY_CHAIN[_activeChainId] || _NETWORK_CONFIG_BY_CHAIN[80002]

export const NETWORK_CONFIG = {
  chainId: _activeChainId,
  name: _activeNetwork.name,
  rpcUrl: import.meta.env.VITE_RPC_URL || _activeNetwork.rpcUrl,
  blockExplorer: _activeNetwork.blockExplorer,
}
