/**
 * Deployed Contract Addresses on Mordor Testnet
 * 
 * These addresses are deterministically deployed and should remain consistent
 * across deployments. Update these if contracts are redeployed.
 */

export const DEPLOYED_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  // Source of truth: deployments/mordor-chain63-deterministic-deployment.json
  tieredRoleManager: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8', // RoleManagerCore
  welfareRegistry: '0x31c8028D872e8c994A1b505A082ABD1B367673e7',
  proposalRegistry: '0xBB402Bc027eB1534B73FB41b5b3040B4a803b525',
  marketFactory: '0xF3dA3ec2700b050066609D90e5cDdFE02F923177', // ConditionalMarketFactory
  privacyCoordinator: '0x99C4CA1dB381C91c3Ad350bCE79fC8B661671F32',
  oracleResolver: '0x8DfE774E72482aeDF5eaE6A43E9F181343E42E86',
  ragequitModule: '0xc6E2a7a5A12d4Dfb290ef3934F6Ed7fF3C2496bc',
  futarchyGovernor: '0x352D9997a6454AA1E0CEAFb6f8199c501b48d886',
  fairWinsToken: '0xec6Ed68627749b9C244a25A6d0bAC8962043fdcB',
  treasuryVault: '0x93F7ee39C02d99289E3c29696f1F3a70656d0772',

  // Back-compat aliases used throughout the frontend
  roleManager: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8', // alias for RoleManagerCore
  roleManagerCore: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8'
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
