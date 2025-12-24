// Web3 hooks
export { 
  useWeb3, 
  useAccount, 
  useNetwork, 
  useEthers, 
  useWallet 
} from './useWeb3'

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
