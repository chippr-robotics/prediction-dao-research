import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { NETWORKS, getRpcUrl } from './utils/networkConfig'

// Define Ethereum Classic mainnet
const ethereumClassic = {
  id: NETWORKS.mainnet.chainId,
  name: NETWORKS.mainnet.name,
  nativeCurrency: NETWORKS.mainnet.nativeCurrency,
  rpcUrls: NETWORKS.mainnet.rpcUrls,
  blockExplorers: NETWORKS.mainnet.blockExplorers,
  testnet: NETWORKS.mainnet.testnet,
}

// Define Mordor testnet
const mordor = {
  id: NETWORKS.mordor.chainId,
  name: NETWORKS.mordor.name,
  nativeCurrency: NETWORKS.mordor.nativeCurrency,
  rpcUrls: NETWORKS.mordor.rpcUrls,
  blockExplorers: NETWORKS.mordor.blockExplorers,
  testnet: NETWORKS.mordor.testnet,
}

// Define Hardhat local network (for development)
const hardhat = {
  id: NETWORKS.hardhat.chainId,
  name: NETWORKS.hardhat.name,
  nativeCurrency: NETWORKS.hardhat.nativeCurrency,
  rpcUrls: NETWORKS.hardhat.rpcUrls,
  testnet: NETWORKS.hardhat.testnet,
}

// Get network ID from environment or default to Mordor testnet
const networkId = import.meta.env.VITE_NETWORK_ID 
  ? parseInt(import.meta.env.VITE_NETWORK_ID, 10) 
  : 63

// Get RPC URL from environment or use network default
const mainnetRpcUrl = import.meta.env.VITE_MAINNET_RPC_URL || getRpcUrl('mainnet')
const mordorRpcUrl = import.meta.env.VITE_MORDOR_RPC_URL || getRpcUrl('mordor')
const hardhatRpcUrl = import.meta.env.VITE_HARDHAT_RPC_URL || getRpcUrl('hardhat')

// Define supported chains
const chains = [ethereumClassic, mordor, hardhat]

// Create wagmi config
export const config = createConfig({
  chains,
  connectors: [
    injected({ target: 'metaMask' }),
  ],
  transports: {
    [ethereumClassic.id]: http(mainnetRpcUrl),
    [mordor.id]: http(mordorRpcUrl),
    [hardhat.id]: http(hardhatRpcUrl),
  },
})

// Helper to get expected chain info
export const getExpectedChain = () => {
  switch (networkId) {
    case 61:
      return ethereumClassic
    case 63:
      return mordor
    case 1337:
      return hardhat
    default:
      return mordor
  }
}

export const EXPECTED_CHAIN_ID = networkId
