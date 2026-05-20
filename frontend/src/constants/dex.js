/**
 * Uniswap V3 DEX addresses and token metadata for the active chain.
 *
 * Derives from frontend/src/config/networks.js. Polygon Mainnet has the
 * canonical V3 deployment; Polygon Amoy is wired via VITE_AMOY_UNISWAP_*
 * env vars when a community deployment is available. Consumers should gate
 * any DEX-aware UI on `isDexAvailable`.
 */

import { NETWORKS, getCurrentChainId, getNetwork } from '../config/networks'

const _activeChainId = getCurrentChainId()
const _activeNetwork = getNetwork(_activeChainId)

// Whether the active chain has a V3 DEX deployment we can route swaps through.
export const isDexAvailable = Boolean(_activeNetwork?.dex)

const ZERO = '0x0000000000000000000000000000000000000000'

// Core V3 DEX contracts for the active chain. When the chain has no DEX
// deployment, every address falls back to the zero address so that downstream
// code (which often just reads the property) doesn't throw on undefined
// access. Guard real usage with `isDexAvailable`.
export const DEX_ADDRESSES = {
  FACTORY: _activeNetwork?.dex?.factory || ZERO,
  SWAP_ROUTER_02: _activeNetwork?.dex?.swapRouter || ZERO,
  NONFUNGIBLE_TOKEN_POSITION_MANAGER: _activeNetwork?.dex?.positionManager || ZERO,
  QUOTER_V2: _activeNetwork?.dex?.quoter || ZERO,

  // Permit2 has the same address on every EVM chain Uniswap supports.
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',

  // Wrapped-native and stablecoin addresses for the active chain.
  WNATIVE: _activeNetwork?.dex?.wnative || ZERO,
  STABLECOIN: _activeNetwork?.stablecoin?.address || ZERO,
}

// Per-chain explorer URLs derived from networks.js for back-compat.
export const EXPLORER_URLS = Object.fromEntries(
  Object.values(NETWORKS)
    .filter((n) => n.explorer?.baseUrl)
    .map((n) => [n.chainId, n.explorer.baseUrl])
)

// Get explorer URL for address
export const getExplorerUrl = (chainId, address, type = 'address') => {
  const baseUrl = EXPLORER_URLS[chainId] || EXPLORER_URLS[_activeChainId]
  return `${baseUrl}/${type}/${address}`
}

// Token metadata for the active chain.
const _stable = _activeNetwork?.stablecoin
const _native = _activeNetwork?.nativeCurrency
export const TOKENS = {
  WNATIVE: {
    address: DEX_ADDRESSES.WNATIVE,
    symbol: _native?.symbol ? `W${_native.symbol}` : 'WNATIVE',
    name: _native?.name ? `Wrapped ${_native.name}` : 'Wrapped Native',
    decimals: 18,
    icon: '🌐',
  },
  STABLE: _stable
    ? {
        address: _stable.address || ZERO,
        symbol: _stable.symbol,
        name: _stable.name,
        decimals: _stable.decimals,
        icon: '💵',
      }
    : {
        address: ZERO,
        symbol: 'STABLE',
        name: 'Stablecoin',
        decimals: 6,
        icon: '💵',
      },
  NATIVE: {
    address: 'native',
    symbol: _native?.symbol || 'MATIC',
    name: _native?.name || 'MATIC',
    decimals: _native?.decimals || 18,
    icon: '💎',
  },
}

// Swap fee tiers (in basis points)
export const FEE_TIERS = {
  LOWEST: 100,  // 0.01%
  LOW: 500,     // 0.05%
  MEDIUM: 3000, // 0.3%
  HIGH: 10000   // 1%
}

// Slippage tolerance options (in basis points)
export const SLIPPAGE_OPTIONS = [
  { label: '0.1%', value: 10 },
  { label: '0.5%', value: 50 },
  { label: '1%', value: 100 },
  { label: '2%', value: 200 },
  { label: '5%', value: 500 }
]

// Default slippage (0.5%)
export const DEFAULT_SLIPPAGE = 50

// Time horizon options for balance charts (in seconds)
export const TIME_HORIZONS = {
  '1H': 3600,
  '24H': 86400,
  '7D': 604800,
  '30D': 2592000,
  'ALL': 0
}
