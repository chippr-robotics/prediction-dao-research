// Web3 hooks (legacy)
export { 
  useWeb3, 
  useAccount, 
  useNetwork, 
  useEthers 
} from './useWeb3'

// Unified Wallet Management hooks (primary)
export {
  useWallet,
  useWalletAddress,
  useWalletBalances,
  useWalletTransactions,
  useWalletRoles,
  useWalletNetwork,
  useWalletConnection
} from './useWalletManagement'

// ETCswap hooks
export { useETCswap } from './useETCswap'

// UI hooks
export { 
  useUI, 
  useNotification, 
  useAnnouncement, 
  useModal, 
  useError 
} from './useUI'

// Theme hooks
export { useTheme } from './useTheme'

// Blockchain event hooks
export {
  useContractEvent,
  useContractEvents,
  useAccountChange,
  useChainChange
} from './useBlockchainEvents'

// Responsive hooks
export {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useOrientation,
  useDeviceInfo
} from './useMediaQuery'

// Scroll hooks
export {
  useScrollDirection,
  useScrollPast
} from './useScrollDirection'

// Role hooks
export { useRoles } from './useRoles'

// Admin hooks
export { useAdminContracts } from './useAdminContracts'

// Data fetcher hooks
export { useDataFetcher } from './useDataFetcher'

// Token creation hooks
export { useTokenCreation, TxState } from './useTokenCreation'
export { useTokenMintFactory, LoadState } from './useTokenMintFactory'
