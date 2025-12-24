import { http, createConfig } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Define Hardhat local network
const hardhat = {
  id: 1337,
  name: 'Hardhat',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] },
  },
  testnet: true,
}

// Get network ID from environment or default to Hardhat
const networkId = import.meta.env.VITE_NETWORK_ID 
  ? parseInt(import.meta.env.VITE_NETWORK_ID, 10) 
  : 1337

// Get RPC URL from environment
const rpcUrl = import.meta.env.VITE_RPC_URL || 'http://localhost:8545'

// Define supported chains
const chains = [hardhat, sepolia, mainnet]

// Create wagmi config
export const config = createConfig({
  chains,
  connectors: [
    injected({ target: 'metaMask' }),
  ],
  transports: {
    [hardhat.id]: http(rpcUrl),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
})

// Helper to get expected chain info
export const getExpectedChain = () => {
  switch (networkId) {
    case 1:
      return mainnet
    case 11155111:
      return sepolia
    case 1337:
    default:
      return hardhat
  }
}

export const EXPECTED_CHAIN_ID = networkId
