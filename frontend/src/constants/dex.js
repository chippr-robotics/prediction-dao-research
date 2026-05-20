/**
 * V3 DEX addresses and token metadata for the active chain.
 *
 * Derives from frontend/src/config/networks.js. Polygon Amoy doesn't have an
 * official Uniswap V3 deployment at the time of writing, so `isDexAvailable`
 * is false and consumers must branch on it before exposing swap UI. The
 * friend-market settle-by-referenced-lookup flow does not require the DEX
 * path.
 */

import { NETWORKS, getCurrentChainId, getNetwork } from '../config/networks'

const _activeChainId = getCurrentChainId()
const _activeNetwork = getNetwork(_activeChainId)

// Whether the active chain has a V3 DEX deployment we can route swaps through.
export const isDexAvailable = Boolean(_activeNetwork?.dex)

// Core V3 DEX contracts for the active chain. Falls back to placeholder values
// when the chain has no DEX deployment so that downstream code (which often
// just reads the property) doesn't throw on undefined access.
export const DEX_ADDRESSES = {
  FACTORY: _activeNetwork?.dex?.factory || '0x0000000000000000000000000000000000000000',
  SWAP_ROUTER_02: _activeNetwork?.dex?.swapRouter || '0x0000000000000000000000000000000000000000',
  NONFUNGIBLE_TOKEN_POSITION_MANAGER: _activeNetwork?.dex?.positionManager || '0x0000000000000000000000000000000000000000',

  // Ancillary V3 contracts. Polygon Amoy has no official deployment of these
  // today; values default to zero on chains where dex is null. The presence of
  // these values does not imply they're functional — gate any usage on
  // isDexAvailable.
  UNIVERSAL_ROUTER: '0x0000000000000000000000000000000000000000',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  MULTICALL_V3: '0x0000000000000000000000000000000000000000',
  PROXY_ADMIN: '0x0000000000000000000000000000000000000000',
  TICK_LENS: '0x0000000000000000000000000000000000000000',
  NFT_DESCRIPTOR_LIBRARY: '0x0000000000000000000000000000000000000000',
  NONFUNGIBLE_TOKEN_POSITION_DESCRIPTOR: '0x0000000000000000000000000000000000000000',
  DESCRIPTOR_PROXY: '0x0000000000000000000000000000000000000000',
  MIGRATOR: '0x0000000000000000000000000000000000000000',
  STAKER: '0x0000000000000000000000000000000000000000',
  QUOTER_V2: '0x0000000000000000000000000000000000000000',

  // Wrapped-native and stablecoin addresses for the active chain. On Amoy
  // these are WMATIC and USDC respectively; addresses default to zero when
  // the chain doesn't have a DEX deployment.
  WNATIVE: '0x0000000000000000000000000000000000000000',
  STABLECOIN: _activeNetwork?.stablecoin?.address || '0x0000000000000000000000000000000000000000',
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
        address: _stable.address || '0x0000000000000000000000000000000000000000',
        symbol: _stable.symbol,
        name: _stable.name,
        decimals: _stable.decimals,
        icon: '💵',
      }
    : {
        address: '0x0000000000000000000000000000000000000000',
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
