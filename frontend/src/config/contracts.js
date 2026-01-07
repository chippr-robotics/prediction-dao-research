/**
 * Deployed Contract Addresses on Mordor Testnet
 * 
 * These addresses are deterministically deployed and should remain consistent
 * across deployments. Update these if contracts are redeployed.
 */

export const DEPLOYED_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  welfareRegistry: '0x8fE770a847C8BE899C51C16A21aDe6b6a2a5547D',
  proposalRegistry: '0xf5cB8752a95afb0264ABd2E6a7a543B795Dd0fB1',
  marketFactory: '0xd1B610a650EE14e42Fb29Ec65e21C53Ea8aDb203',
  privacyCoordinator: '0x47d0D47686181B29b7BdF5E8D95ea7bA90C837b9',
  oracleResolver: '0x19374Dd329fD61C5e404e0AE8397418E0f322Fba',
  ragequitModule: '0x243c90c69Cd8f035D93DD5100dbc5b3753E8a593',
  futarchyGovernor: '0xD37907b23d063F0839Ff2405179481822862C27A',
  fairWinsToken: '0xec6Ed68627749b9C244a25A6d0bAC8962043fdcB',
  treasuryVault: '0x93F7ee39C02d99289E3c29696f1F3a70656d0772'
  /** @todo Add zkKeyManager address when contract is deployed */
}

/**
 * Get contract address from environment or use deployed default
 * @param {string} contractName - Name of the contract
 * @returns {string} Contract address
 */
export function getContractAddress(contractName) {
  // Check environment variables first (for custom deployments)
  const envKey = `VITE_${contractName.toUpperCase()}_ADDRESS`
  const envAddress = import.meta.env[envKey]
  
  if (envAddress) {
    return envAddress
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
