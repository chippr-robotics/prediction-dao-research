/**
 * Deployed Contract Addresses on Mordor Testnet
 *
 * These addresses are deterministically deployed and should remain consistent
 * across deployments. Update these if contracts are redeployed.
 *
 * Last updated: 2026-03-06 (P2P wager focus refactor)
 */

export const DEPLOYED_CONTRACTS = {
  // Deployer / Treasury
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  treasury: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',

  // Core Contracts
  roleManagerCore: '0x6a6422Ed3198332AC8DA2852BBff4749B66a3D8D',
  ragequitModule: '0xD6b6eDE9EacDC90e20Fe95Db1875EaBB07004A1c',

  // RBAC Contracts (02-deploy-rbac.js)
  tieredRoleManager: '0x55e6346Be542B13462De504FCC379a2477D227f0',
  tierRegistry: '0x476cf3dEA109D6FC95aD19d246FD4e95693c47a3',
  usageTracker: '0x10f1b557a53C05A92DF820CCfDC77EaB0c732Bde',
  membershipManager: '0xCD172d9888a6F47203dD6f0684f250f6Ac56f6Ed',
  paymentProcessor: '0x6e063138809263820F61146c34a74EB3B2629A59',
  membershipPaymentManager: '0x797717EAf6d054b35A30c9afF0e231a35Bb5abB7',

  // P2P Wager Contracts (03-deploy-markets.js) - v7 with external library refactor
  friendGroupResolutionLib: '0x1C8780a84539c3c2F98530a2275fB9D2E4eA5aE9',
  friendGroupClaimsLib: '0xca3b4c3e0E04E5Ffcb0983d6e2DfE793BbEEfBbc',
  friendGroupCreationLib: '0xB3060ED1dc17dB2297021D5874821ce13777A657',
  friendGroupMarketFactory: '0xE1eC8d34b36f55015ed636337121CA8EFbA96227',

  // Privacy & Key Management
  nullifierRegistry: '0x5569FEe7f8Bab39EEd08bf448Dd6824640C7d272',
  zkKeyManager: '0xF75bcd3673E379E0a85CC944AA147B7596c7AE67',

  // Back-compat aliases
  roleManager: '0x55e6346Be542B13462De504FCC379a2477D227f0',
}

/**
 * Deployment block numbers for event scanning.
 * Used as the starting block when no cached index exists, avoiding full-chain scans.
 */
export const DEPLOYMENT_BLOCKS = {
  friendGroupMarketFactory: 15658191,
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
 * Network configuration for Mordor testnet
 */
export const NETWORK_CONFIG = {
  chainId: parseInt(import.meta.env.VITE_NETWORK_ID || '63', 10),
  name: 'Mordor Testnet',
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://rpc.mordor.etccooperative.org',
  blockExplorer: 'https://etc-mordor.blockscout.com'
}
