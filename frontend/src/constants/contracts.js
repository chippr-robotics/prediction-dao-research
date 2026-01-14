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
  // Mordor Testnet (Chain ID 63)
  63: {
    conditionalMarketFactory: '0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac',
    friendGroupMarketFactory: '0xD9A26537947d99c6961C1013490f0B80d1DFE283',
    tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
    proposalRegistry: '0xBB402Bc027eB1534B73FB41b5b3040B4a803b525',
    tokenMintFactory: '0x8D4485C3bDb16dc782403B36e8BC2524000C54DB',
    ragequitModule: '0x1D30f1DBF2f7B9C050F5de8b98Dc63C54Bfff1e7',
    membershipPaymentManager: '0xA61C3a81e25E8E5E7A6A7EceBEd7e1BF58533e28'
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
