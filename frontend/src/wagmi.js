import { http, createConfig } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'

// Define Ethereum Classic mainnet
const ethereumClassic = {
  id: 61,
  name: 'Ethereum Classic',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETC',
  },
  rpcUrls: {
    default: { http: ['https://etc.rivet.link'] },
    public: { http: ['https://etc.rivet.link'] },
  },
  blockExplorers: {
    default: { name: 'BlockScout', url: 'https://blockscout.com/etc/mainnet' },
  },
  testnet: false,
}

// Define Mordor testnet
const mordor = {
  id: 63,
  name: 'Mordor',
  nativeCurrency: {
    decimals: 18,
    name: 'Mordor Ether',
    symbol: 'METC',
  },
  rpcUrls: {
    default: { http: ['https://rpc.mordor.etccooperative.org'] },
    public: { http: ['https://rpc.mordor.etccooperative.org'] },
  },
  blockExplorers: {
    default: { name: 'BlockScout', url: 'https://blockscout.com/etc/mordor' },
  },
  testnet: true,
}

// Define Hardhat local network (for development)
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

// Get network ID from environment or default to Mordor testnet
const networkId = import.meta.env.VITE_NETWORK_ID 
  ? parseInt(import.meta.env.VITE_NETWORK_ID, 10) 
  : 63

// Get RPC URL from environment
const rpcUrl = import.meta.env.VITE_RPC_URL || 'https://rpc.mordor.etccooperative.org'

// Get WalletConnect project ID from environment
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ''

// Get app URL for WalletConnect metadata
const resolveAppUrl = () => {
  const envUrl = import.meta.env.VITE_APP_URL

  if (envUrl) {
    return envUrl
  }

  // In production, require VITE_APP_URL to be set to avoid metadata mismatches
  if (import.meta.env.PROD && walletConnectProjectId) {
    console.warn('VITE_APP_URL should be set in production for correct WalletConnect metadata. Falling back to window.location.origin.')
  }

  // In development, fall back to the current origin when available
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin
  }

  // As a last resort, return a fallback domain
  return 'https://fairwins.app'
}

const appUrl = resolveAppUrl()

// Define supported chains
const chains = [ethereumClassic, mordor, hardhat]

// Create wagmi config
export const config = createConfig({
  chains,
  connectors: [
    injected({ target: 'metaMask' }),
    // Add WalletConnect connector if project ID is provided
    ...(walletConnectProjectId ? [walletConnect({
      projectId: walletConnectProjectId,
      metadata: {
        name: 'Prediction DAO',
        description: 'Decentralized prediction markets on Ethereum Classic',
        url: appUrl,
        icons: [`${appUrl}/assets/fairwins_no-text_logo.svg`]
      },
      showQrModal: true,
    })] : []),
  ],
  transports: {
    [ethereumClassic.id]: http(),
    [mordor.id]: http(rpcUrl),
    [hardhat.id]: http('http://localhost:8545'),
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
