/**
 * V3 DEX addresses and token metadata for the active chain.
 *
 * Historical name: this file used to hold ETCSwap-specific addresses (Mordor
 * only). It now derives from frontend/src/config/networks.js so the same
 * exports work on Mordor (ETCSwap V3) and Polygon Amoy (no DEX deployed yet —
 * `isDexAvailable` is false on Amoy and consumers should branch).
 *
 * The file path is preserved to avoid touching every importer — long term this
 * should be renamed to constants/dex.js.
 */

import { NETWORKS, getCurrentChainId, getNetwork } from '../config/networks'

const _activeChainId = getCurrentChainId()
const _activeNetwork = getNetwork(_activeChainId)

// Whether the active chain has a V3 DEX deployment we can route swaps through.
// On Amoy this is false today (no official Uniswap V3 deployment); the friend-
// market settle-by-referenced-lookup flow does not require it. UI components
// that offer swapping should hide themselves when this is false.
export const isDexAvailable = Boolean(_activeNetwork?.dex)

// Core V3 DEX contracts for the active chain. Falls back to placeholder values
// when the chain has no DEX deployment so that downstream code (which often
// just reads the property) doesn't throw on undefined access.
export const ETCSWAP_ADDRESSES = {
  FACTORY: _activeNetwork?.dex?.factory || '0x0000000000000000000000000000000000000000',
  SWAP_ROUTER_02: _activeNetwork?.dex?.swapRouter || '0x0000000000000000000000000000000000000000',
  NONFUNGIBLE_TOKEN_POSITION_MANAGER: _activeNetwork?.dex?.positionManager || '0x0000000000000000000000000000000000000000',

  // Mordor-specific ancillary V3 contracts. Polygon Amoy has no official
  // deployment of these today; values default to zero on chains where dex is
  // null. The presence of these values does not imply they're functional —
  // gate any usage on isDexAvailable.
  UNIVERSAL_ROUTER: '0x9b676E761040D60C6939dcf5f582c2A4B51025F1',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  MULTICALL_V3: '0x1E4282069e4822D5E6Fb88B2DbDE014f3E0625a9',
  PROXY_ADMIN: '0x4823673F7cA96A42c4E69C8953de89f4857E193D',
  TICK_LENS: '0x23B7Bab45c84fA8f68f813D844E8afD44eE8C315',
  NFT_DESCRIPTOR_LIBRARY: '0xa47E8033964FbDa1cEEE77191Fc6188898355c0D',
  NONFUNGIBLE_TOKEN_POSITION_DESCRIPTOR: '0xBCA1B20B81429cA4ca39AC38a5374A7F41Db2Ed6',
  DESCRIPTOR_PROXY: '0x224c3992F98f75314eE790DFd081017673bd0617',
  MIGRATOR: '0x19B067263c36FA09d06bec71B1E1236573D56C00',
  STAKER: '0x12775aAf6bD5Aca04F0cCD5969b391314868A7e9',
  QUOTER_V2: '0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B',

  // Wrapped-native and stablecoin addresses for the active chain. WETC on
  // Mordor; on Amoy the wrapped-native is WMATIC and is not yet wired in.
  WETC: NETWORKS[63]?.dex ? '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a' : '0x0000000000000000000000000000000000000000',
  USC_STABLECOIN: _activeNetwork?.stablecoin?.address || '0x0000000000000000000000000000000000000000',
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

// Token metadata for the active chain. The "USC" key is preserved as the
// stable-token slot (now USDC on Amoy, USC on Mordor); rename was avoided to
// keep the surface stable for existing imports.
const _stable = _activeNetwork?.stablecoin
const _native = _activeNetwork?.nativeCurrency
export const TOKENS = {
  WETC: {
    address: ETCSWAP_ADDRESSES.WETC,
    symbol: _native?.symbol === 'MATIC' ? 'WMATIC' : 'WETC',
    name: _native?.symbol === 'MATIC' ? 'Wrapped MATIC' : 'Wrapped ETC',
    decimals: 18,
    icon: '🌐',
  },
  USC: _stable
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
  ETC: {
    address: 'native',
    symbol: _native?.symbol || 'ETC',
    name: _native?.name || 'Ethereum Classic',
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
