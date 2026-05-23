/**
 * Deployed Contract Addresses
 *
 * Active network is selected via VITE_NETWORK_ID. Each network has its own
 * deployment record. Addresses are deterministic via Safe Singleton Factory,
 * so re-running deploy scripts produces the same addresses.
 *
 * Last updated: 2026-05-09 (Amoy network added for Polymarket integration)
 */

// Mordor (Ethereum Classic testnet) legacy v1 deployment — read-only at this point.
const MORDOR_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  treasury: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  roleManagerCore: '0x6a6422Ed3198332AC8DA2852BBff4749B66a3D8D',
  ragequitModule: '0xD6b6eDE9EacDC90e20Fe95Db1875EaBB07004A1c',
  tieredRoleManager: '0x55e6346Be542B13462De504FCC379a2477D227f0',
  tierRegistry: '0x476cf3dEA109D6FC95aD19d246FD4e95693c47a3',
  usageTracker: '0x10f1b557a53C05A92DF820CCfDC77EaB0c732Bde',
  membershipManager: '0xCD172d9888a6F47203dD6f0684f250f6Ac56f6Ed',
  paymentProcessor: '0x6e063138809263820F61146c34a74EB3B2629A59',
  membershipPaymentManager: '0x797717EAf6d054b35A30c9afF0e231a35Bb5abB7',
  friendGroupResolutionLib: '0x1C8780a84539c3c2F98530a2275fB9D2E4eA5aE9',
  friendGroupClaimsLib: '0xca3b4c3e0E04E5Ffcb0983d6e2DfE793BbEEfBbc',
  friendGroupCreationLib: '0xB3060ED1dc17dB2297021D5874821ce13777A657',
  friendGroupMarketFactory: '0xE1eC8d34b36f55015ed636337121CA8EFbA96227',
  nullifierRegistry: '0x5569FEe7f8Bab39EEd08bf448Dd6824640C7d272',
  zkKeyManager: '0xF75bcd3673E379E0a85CC944AA147B7596c7AE67',
  roleManager: '0x55e6346Be542B13462De504FCC379a2477D227f0',
}

// Local Hardhat sandbox (chainId 1337) — populated by deploy.js + sync.
const HARDHAT_CONTRACTS = {
  deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  treasury: '',
  wagerRegistry: '0x31F2B0a0d14a8814af2430154ee39E551b66BA8A',
  membershipManager: '0x9D29Dfe091111099dCd317159Fa41f8E80F50489',
  keyRegistry: '0xb314c4Ee52D9D89bf7FEE66a43aBeAc7D047a5Cb',
  polymarketAdapter: '0x423d2Ca885d67E46062CFF732Eff952f4F736136',
  paymentToken: '0x065606eeE0D7BB3d2e7959D56c3ca177625385a7',
  wmatic: '0xE80bf16CAF66CAe0Ae5aBC4a5ab4acc27361553F',
}

// Polygon Amoy testnet deployment (v2 — P2P betting architecture)
// Run: npx hardhat run scripts/deploy/deploy.js --network amoy
//      npm run sync:frontend-contracts -- --network amoy --chainId 80002
const AMOY_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  treasury: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  // v2 core (populated by `npm run sync:frontend-contracts -- --network amoy --chainId 80002`)
  wagerRegistry: '0x39f1CbC680cDc9831b6dF4D9e4719D3748720aBA',
  membershipManager: '0xFaEbF662aa591fF95e97306b413522efC958540f',
  keyRegistry: '0xb314c4Ee52D9D89bf7FEE66a43aBeAc7D047a5Cb',
  polymarketAdapter: '0x423d2Ca885d67E46062CFF732Eff952f4F736136',
  // Stake / payment tokens (Circle USDC + Wrapped MATIC on Amoy)
  paymentToken: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  wmatic: '0x0ae690AAD8663aaB12a671A6A0d74242332de85f',
  chainlinkDataFeedAdapter: '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23',
  chainlinkFunctionsAdapter: '0x074fC18C1E322a7537b53B8B2Bf0762629E3b532',
  umaAdapter: '0xcEa9b4A01CcD3aA6545ea834a268C69e7eEfee88',
}

const NETWORK_CONTRACTS = {
  63: MORDOR_CONTRACTS,     // Mordor (legacy v1)
  80002: AMOY_CONTRACTS,    // Polygon Amoy (v2)
  1337: HARDHAT_CONTRACTS,  // Local Hardhat sandbox
}

// Default to Mordor (63) when VITE_NETWORK_ID isn't set so existing tests pass.
// The .env / .env.example files set VITE_NETWORK_ID=80002 for the live frontend.
const ACTIVE_CHAIN_ID = parseInt(import.meta.env.VITE_NETWORK_ID || '63', 10)

export const DEPLOYED_CONTRACTS =
  NETWORK_CONTRACTS[ACTIVE_CHAIN_ID] || MORDOR_CONTRACTS

/**
 * Deployment block numbers for event scanning.
 * Keyed by chain ID; used as the starting block when no cached index exists.
 *
 * v1 used friendGroupMarketFactory; v2 uses wagerRegistry. Both kept here to
 * support legacy Mordor reads while Amoy migrates.
 */
const DEPLOYMENT_BLOCKS_BY_CHAIN = {
  63: { friendGroupMarketFactory: 15658191, wagerRegistry: 0 },
  80002: { friendGroupMarketFactory: 0, wagerRegistry: 0 },
}

export const DEPLOYMENT_BLOCKS =
  DEPLOYMENT_BLOCKS_BY_CHAIN[ACTIVE_CHAIN_ID] || { friendGroupMarketFactory: 0, wagerRegistry: 0 }

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
 * Network configuration, derived from VITE_NETWORK_ID
 */
const NETWORK_INFO_BY_CHAIN = {
  63: {
    name: 'Mordor Testnet',
    rpcUrl: 'https://rpc.mordor.etccooperative.org',
    blockExplorer: 'https://etc-mordor.blockscout.com',
  },
  80002: {
    name: 'Polygon Amoy',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    blockExplorer: 'https://amoy.polygonscan.com',
  },
  137: {
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorer: 'https://polygonscan.com',
  },
}

const _activeNetwork = NETWORK_INFO_BY_CHAIN[ACTIVE_CHAIN_ID] || NETWORK_INFO_BY_CHAIN[63]

export const NETWORK_CONFIG = {
  chainId: ACTIVE_CHAIN_ID,
  name: _activeNetwork.name,
  rpcUrl: import.meta.env.VITE_RPC_URL || _activeNetwork.rpcUrl,
  blockExplorer: _activeNetwork.blockExplorer,
}
