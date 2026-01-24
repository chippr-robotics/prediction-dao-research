/**
 * Contract addresses for the FairWins prediction market platform
 * These are placeholder addresses - update with deployed contract addresses
 */

// Contract addresses by network
const ADDRESSES_BY_NETWORK = {
  // ETC Mainnet (Chain ID 61)
  61: {
    conditionalMarketFactory: '',
    friendGroupMarketFactory: '',
    tieredRoleManager: '',
    proposalRegistry: '',
    tokenMintFactory: ''
  },
  // Mordor Testnet (Chain ID 63) - Updated 2026-01-24
  63: {
    conditionalMarketFactory: '0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a',
    friendGroupMarketFactory: '0x0E118DEf0946f0e7F1BEAAA385c6c37CAc6acfa7',
    tieredRoleManager: '0x55e6346Be542B13462De504FCC379a2477D227f0',
    proposalRegistry: '0x095146344Ab39a0cbF37494Cb50fb293E55AF76E',
    tokenMintFactory: '0x5bBa4c4985c36525D14D7d7627Ab479B8b2E2205',
    ragequitModule: '0xD6b6eDE9EacDC90e20Fe95Db1875EaBB07004A1c',
    membershipPaymentManager: '0x797717EAf6d054b35A30c9afF0e231a35Bb5abB7'
  }
}

// Get current chain ID from environment or default to Mordor testnet
const getChainId = () => {
  return parseInt(import.meta.env.VITE_CHAIN_ID || '63', 10)
}

// Export contract addresses for current network
export const CONTRACT_ADDRESSES = {
  get conditionalMarketFactory() {
    return ADDRESSES_BY_NETWORK[getChainId()]?.conditionalMarketFactory || ''
  },
  get friendGroupMarketFactory() {
    return ADDRESSES_BY_NETWORK[getChainId()]?.friendGroupMarketFactory || ''
  },
  get tieredRoleManager() {
    return ADDRESSES_BY_NETWORK[getChainId()]?.tieredRoleManager || ''
  },
  get proposalRegistry() {
    return ADDRESSES_BY_NETWORK[getChainId()]?.proposalRegistry || ''
  },
  get tokenMintFactory() {
    return ADDRESSES_BY_NETWORK[getChainId()]?.tokenMintFactory || ''
  }
}

// Update addresses for a specific network (useful for development)
export const setNetworkAddresses = (chainId, addresses) => {
  ADDRESSES_BY_NETWORK[chainId] = {
    ...ADDRESSES_BY_NETWORK[chainId],
    ...addresses
  }
}

export default CONTRACT_ADDRESSES
