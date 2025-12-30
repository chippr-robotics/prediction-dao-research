import { createThirdwebClient } from 'thirdweb'
import { defineChain } from 'thirdweb/chains'

// Get client ID from environment
const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID || 'demo-client-id'

// Warn if using demo client ID (only in development)
if (!import.meta.env.VITE_THIRDWEB_CLIENT_ID && import.meta.env.DEV) {
  console.warn(
    'ThirdWeb: Using demo client ID. For production, please set VITE_THIRDWEB_CLIENT_ID in your .env file. ' +
    'Get your client ID at https://thirdweb.com/dashboard'
  )
}

// Create ThirdWeb client
export const thirdwebClient = createThirdwebClient({
  clientId,
})

// Get network ID from environment or default to Mordor testnet
const networkId = import.meta.env.VITE_NETWORK_ID 
  ? parseInt(import.meta.env.VITE_NETWORK_ID, 10) 
  : 63

// Get RPC URL from environment
const rpcUrl = import.meta.env.VITE_RPC_URL || 'https://rpc.mordor.etccooperative.org'

// Define Ethereum Classic mainnet for ThirdWeb
export const ethereumClassic = defineChain({
  id: 61,
  name: 'Ethereum Classic',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETC',
  },
  rpc: 'https://etc.rivet.link',
  blockExplorers: [
    {
      name: 'BlockScout',
      url: 'https://blockscout.com/etc/mainnet',
    },
  ],
  testnet: false,
})

// Define Mordor testnet for ThirdWeb
export const mordor = defineChain({
  id: 63,
  name: 'Mordor',
  nativeCurrency: {
    decimals: 18,
    name: 'Mordor Ether',
    symbol: 'METC',
  },
  rpc: rpcUrl,
  blockExplorers: [
    {
      name: 'BlockScout',
      url: 'https://blockscout.com/etc/mordor',
    },
  ],
  testnet: true,
})

// Define Hardhat local network for ThirdWeb
export const hardhat = defineChain({
  id: 1337,
  name: 'Hardhat',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpc: 'http://127.0.0.1:8545',
  testnet: true,
})

// Helper to get expected chain info
export const getThirdWebChain = () => {
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

// All supported chains for ThirdWeb
export const supportedChains = [ethereumClassic, mordor, hardhat]
