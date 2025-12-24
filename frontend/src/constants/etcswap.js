/**
 * ETCswap contract addresses and configuration
 * These addresses are consistent across both ETC mainnet and Mordor testnet
 */

// Core ETCswap V3 contracts
export const ETCSWAP_ADDRESSES = {
  // V3 Factory
  FACTORY: '0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC',
  
  // V3 Universal Router
  UNIVERSAL_ROUTER: '0x9b676E761040D60C6939dcf5f582c2A4B51025F1',
  
  // Permit2
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  
  // Multicall V3
  MULTICALL_V3: '0x1E4282069e4822D5E6Fb88B2DbDE014f3E0625a9',
  
  // Proxy Admin
  PROXY_ADMIN: '0x4823673F7cA96A42c4E69C8953de89f4857E193D',
  
  // Tick Lens
  TICK_LENS: '0x23B7Bab45c84fA8f68f813D844E8afD44eE8C315',
  
  // NFT Descriptor Library
  NFT_DESCRIPTOR_LIBRARY: '0xa47E8033964FbDa1cEEE77191Fc6188898355c0D',
  
  // Nonfungible Token Position Descriptor
  NONFUNGIBLE_TOKEN_POSITION_DESCRIPTOR: '0xBCA1B20B81429cA4ca39AC38a5374A7F41Db2Ed6',
  
  // Descriptor Proxy
  DESCRIPTOR_PROXY: '0x224c3992F98f75314eE790DFd081017673bd0617',
  
  // Nonfungible Token Position Manager
  NONFUNGIBLE_TOKEN_POSITION_MANAGER: '0x3CEDe6562D6626A04d7502CC35720901999AB699',
  
  // Migrator Address
  MIGRATOR: '0x19B067263c36FA09d06bec71B1E1236573D56C00',
  
  // Staker Address
  STAKER: '0x12775aAf6bD5Aca04F0cCD5969b391314868A7e9',
  
  // Quoter V2
  QUOTER_V2: '0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B',
  
  // Swap Router02 (primary swap interface)
  SWAP_ROUTER_02: '0xEd88EDD995b00956097bF90d39C9341BBde324d1',
  
  // Token addresses
  WETC: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a',
  USC_STABLECOIN: '0xDE093684c796204224BC081f937aa059D903c52a'
}

// Blockchain explorer base URLs
export const EXPLORER_URLS = {
  61: 'https://etc.blockscout.com', // ETC Mainnet
  63: 'https://etc-mordor.blockscout.com', // Mordor Testnet
}

// Get explorer URL for address
export const getExplorerUrl = (chainId, address, type = 'address') => {
  const baseUrl = EXPLORER_URLS[chainId] || EXPLORER_URLS[63]
  return `${baseUrl}/${type}/${address}`
}

// Token metadata
export const TOKENS = {
  WETC: {
    address: ETCSWAP_ADDRESSES.WETC,
    symbol: 'WETC',
    name: 'Wrapped ETC',
    decimals: 18,
    icon: '🌐'
  },
  USC: {
    address: ETCSWAP_ADDRESSES.USC_STABLECOIN,
    symbol: 'USC',
    name: 'Classic USD Stablecoin',
    decimals: 18,
    icon: '💵'
  },
  ETC: {
    address: 'native',
    symbol: 'ETC',
    name: 'Ethereum Classic',
    decimals: 18,
    icon: '💎'
  }
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
