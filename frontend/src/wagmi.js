import { http, createConfig } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { NETWORKS, getCurrentChainId, getNetwork } from './config/networks'

// Chain definitions are derived from the per-chain config in
// frontend/src/config/networks.js. This keeps wagmi, thirdweb, the block
// explorer config, and the swap context aligned on a single source of truth.
const toViemChain = (n) => ({
  id: n.chainId,
  name: n.name,
  nativeCurrency: n.nativeCurrency,
  rpcUrls: {
    default: { http: [n.rpcUrl] },
    public: { http: [n.rpcUrl] },
  },
  blockExplorers: n.explorer?.baseUrl
    ? { default: { name: n.explorer.name, url: n.explorer.baseUrl } }
    : undefined,
  testnet: n.isTestnet,
})

const networkId = getCurrentChainId()

// RPC URL override (legacy env var preserved for back-compat with existing
// deployments that set VITE_RPC_URL when targeting Mordor).
const rpcUrl = import.meta.env.VITE_RPC_URL || getNetwork(networkId).rpcUrl

// Get WalletConnect project ID from environment
// Using a fallback demo project ID if none is provided to ensure WalletConnect option is always available
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'e7a122e5963ecec9bb2ab09e08bca54f'

// Warn if using fallback project ID (only in development)
if (!import.meta.env.VITE_WALLETCONNECT_PROJECT_ID && import.meta.env.DEV) {
  console.warn(
    'WalletConnect: Using fallback project ID. For production, please set VITE_WALLETCONNECT_PROJECT_ID in your .env file. ' +
    'Get your project ID at https://cloud.walletconnect.com'
  )
}

// Get app URL for WalletConnect metadata
const resolveAppUrl = () => {
  const envUrl = import.meta.env.VITE_APP_URL

  if (envUrl) {
    return envUrl
  }

  // Silently use window.location.origin in production if VITE_APP_URL is not set
  // Only warn in development mode
  if (import.meta.env.DEV) {
    console.warn('VITE_APP_URL is not set. Using window.location.origin as fallback. Set VITE_APP_URL in .env for production deployments.')
  }

  // In development, fall back to the current origin when available
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin
  }

  // As a last resort, return a fallback domain
  return 'https://fairwins.app'
}

const appUrl = resolveAppUrl()

// All chains in NETWORKS are advertised to wagmi. The user's connected chain
// must be one of these for the app to function.
const chains = Object.values(NETWORKS).map(toViemChain)

// Per-chain transports. The active network gets its RPC overridable via
// VITE_RPC_URL; everything else uses the chain's default URL.
const transports = Object.fromEntries(
  Object.values(NETWORKS).map((n) => [
    n.chainId,
    n.chainId === networkId ? http(rpcUrl) : http(n.rpcUrl),
  ])
)

// Create wagmi config
export const config = createConfig({
  chains,
  connectors: [
    // Generic injected connector - works with any browser wallet (MetaMask, Coinbase, etc.)
    injected({
      shimDisconnect: true,
    }),
    // WalletConnect is always available for hardware wallet and mobile wallet support
    walletConnect({
      projectId: walletConnectProjectId,
      metadata: {
        name: 'Prediction DAO',
        description: 'Decentralized prediction markets and wagers',
        url: appUrl,
        icons: [`${appUrl}/assets/fairwins_no-text_logo.svg`]
      },
      showQrModal: true,
    }),
  ],
  transports,
})

// Helper to get expected chain info
export const getExpectedChain = () => {
  const network = getNetwork(networkId)
  return toViemChain(network)
}

export const EXPECTED_CHAIN_ID = networkId
