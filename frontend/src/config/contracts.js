/**
 * Deployed Contract Addresses on Mordor Testnet
 *
 * These addresses are deterministically deployed and should remain consistent
 * across deployments. Update these if contracts are redeployed.
 *
 * Last updated: 2026-03-01 (FriendGroupMarketFactory v7 - external library refactor)
 */

export const DEPLOYED_CONTRACTS = {
  // Deployer / Treasury
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  treasury: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',

  // Core Contracts (01-deploy-core.js)
  roleManagerCore: '0x6a6422Ed3198332AC8DA2852BBff4749B66a3D8D',
  welfareRegistry: '0x034494F9eA0821FB6167EcA41A6850fd2D11b8b1',
  proposalRegistry: '0x095146344Ab39a0cbF37494Cb50fb293E55AF76E',
  marketFactory: '0xc56631DB29c44bb553a511DD3d4b90d64C95Cd9C',
  privacyCoordinator: '0x9897CBb96b1931A3c019A9d2126dab59630D4414',
  oracleResolver: '0x2AaCC0D91AF255667683ece0A363649Cc9Ed8776',
  ragequitModule: '0xD6b6eDE9EacDC90e20Fe95Db1875EaBB07004A1c',
  futarchyGovernor: '0x0292a5bdf60E851c043bDceE378D505801A6aEef',
  tokenMintFactory: '0x5bBa4c4985c36525D14D7d7627Ab479B8b2E2205',
  daoFactory: '0x9B1692272D54CA7b4dEAa7622aBddb6059eb8202',

  // RBAC Contracts (02-deploy-rbac.js)
  tieredRoleManager: '0x55e6346Be542B13462De504FCC379a2477D227f0',
  tierRegistry: '0x476cf3dEA109D6FC95aD19d246FD4e95693c47a3',
  usageTracker: '0x10f1b557a53C05A92DF820CCfDC77EaB0c732Bde',
  membershipManager: '0xCD172d9888a6F47203dD6f0684f250f6Ac56f6Ed',
  paymentProcessor: '0x6e063138809263820F61146c34a74EB3B2629A59',
  membershipPaymentManager: '0x797717EAf6d054b35A30c9afF0e231a35Bb5abB7',

  // Market Contracts (03-deploy-markets.js) - v7 with external library refactor
  ctf1155: '0x5baBA40b92EE6C9D4245DFd39f7d9Ab1Abf9E1D5',
  friendGroupResolutionLib: '0x1C8780a84539c3c2F98530a2275fB9D2E4eA5aE9',
  friendGroupClaimsLib: '0xca3b4c3e0E04E5Ffcb0983d6e2DfE793BbEEfBbc',
  friendGroupCreationLib: '0xB3060ED1dc17dB2297021D5874821ce13777A657',
  friendGroupMarketFactory: '0xE1eC8d34b36f55015ed636337121CA8EFbA96227',

  // Perpetual Futures Contracts (v2.1 - fixed decimals + ownership)
  fundingRateEngine: '0x32AD4F7a1e05138fc0F485c786aeDB90dBE100e8',
  perpFactory: '0xE3B84aecc9Ee0D2a35530BfAcb3D184c372cdc71',

  // Registry Contracts (04-deploy-registries.js)
  marketCorrelationRegistry: '0x2a820A38997743fC3303cDcA56b996598963B909',
  nullifierRegistry: '0x5569FEe7f8Bab39EEd08bf448Dd6824640C7d272',

  // Back-compat aliases
  roleManager: '0x55e6346Be542B13462De504FCC379a2477D227f0',
}

/**
 * Deployment block numbers for event scanning.
 * Used as the starting block when no cached index exists, avoiding full-chain scans.
 */
export const DEPLOYMENT_BLOCKS = {
  marketFactory: 15403608,
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
