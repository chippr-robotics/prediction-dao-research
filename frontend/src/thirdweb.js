import { createThirdwebClient } from 'thirdweb'
import { defineChain } from 'thirdweb/chains'

// Get client ID from environment
const envClientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID

// Validate client ID: allow demo ID only in development, warn in production
if (!envClientId) {
  if (import.meta.env.DEV) {
    console.warn(
      'ThirdWeb: Using demo client ID. For production, please set VITE_THIRDWEB_CLIENT_ID in your .env file. ' +
      'Get your client ID at https://thirdweb.com/dashboard'
    )
  } else {
    console.error(
      'ThirdWeb: VITE_THIRDWEB_CLIENT_ID must be set in production builds. ' +
      'Get your client ID at https://thirdweb.com/dashboard'
    )
  }
}

const clientId = envClientId || 'demo-client-id'

// Create ThirdWeb client
export const thirdwebClient = createThirdwebClient({
  clientId,
})

// Get network ID from environment or default to Polygon Amoy (the primary
// post-migration). Mordor is still supported for limited-functionality access
// but is no longer the default.
const networkId = import.meta.env.VITE_NETWORK_ID
  ? parseInt(import.meta.env.VITE_NETWORK_ID, 10)
  : 80002

// Get RPC URL from environment, falling back to the Amoy public RPC.
const rpcUrl =
  import.meta.env.VITE_RPC_URL ||
  import.meta.env.VITE_RPC_URL_AMOY ||
  'https://rpc-amoy.polygon.technology'

// Define Polygon Amoy testnet for ThirdWeb (primary post-migration)
export const polygonAmoy = defineChain({
  id: 80002,
  name: 'Polygon Amoy',
  nativeCurrency: {
    decimals: 18,
    name: 'MATIC',
    symbol: 'MATIC',
  },
  rpc: networkId === 80002 ? rpcUrl : 'https://rpc-amoy.polygon.technology',
  blockExplorers: [
    {
      name: 'Polygonscan',
      url: 'https://amoy.polygonscan.com',
    },
  ],
  testnet: true,
})

// Define Ethereum Classic mainnet for ThirdWeb
export const ethereumClassic = defineChain({
  id: 61,
  name: 'Ethereum Classic',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETC',
  },
  rpc: networkId === 61 ? rpcUrl : 'https://etc.rivet.link',
  blockExplorers: [
    {
      name: 'Blockscout',
      url: 'https://etc.blockscout.com',
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
  rpc: networkId === 63 ? rpcUrl : 'https://rpc.mordor.etccooperative.org',
  blockExplorers: [
    {
      name: 'Blockscout',
      url: 'https://etc-mordor.blockscout.com',
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
  rpc: networkId === 1337 ? rpcUrl : 'http://127.0.0.1:8545',
  testnet: true,
})

// Helper to get expected chain info
export const getThirdwebChain = () => {
  switch (networkId) {
    case 61:
      return ethereumClassic
    case 63:
      return mordor
    case 1337:
      return hardhat
    case 80002:
    default:
      return polygonAmoy
  }
}

// All supported chains for ThirdWeb
export const supportedChains = [polygonAmoy, ethereumClassic, mordor, hardhat]
