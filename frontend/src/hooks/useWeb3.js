import { useContext } from 'react'
import { WalletContext } from '../contexts/WalletContext'

/**
 * @deprecated Use useWallet from '../hooks/useWalletManagement' instead
 *
 * This hook is maintained for backwards compatibility and delegates to WalletContext.
 * All new code should use the useWallet hook from useWalletManagement.js
 *
 * @returns {Object} Web3 context value (aliases to WalletContext)
 * @throws {Error} If used outside WalletProvider
 */
export function useWeb3() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWeb3 must be used within a WalletProvider')
  }
  return context
}

/**
 * @deprecated Use useWalletAddress from '../hooks/useWalletManagement' instead
 *
 * Hook to access account information
 * @returns {Object} Account and connection state
 */
export function useAccount() {
  const { account, isConnected } = useWeb3()
  return { account, isConnected }
}

/**
 * @deprecated Use useWalletNetwork from '../hooks/useWalletManagement' instead
 *
 * Hook to access network information
 * @returns {Object} Network state and switch function
 */
export function useNetwork() {
  const { chainId, networkError, isCorrectNetwork, switchNetwork } = useWeb3()
  return { chainId, networkError, isCorrectNetwork, switchNetwork }
}

/**
 * @deprecated Use useWalletTransactions from '../hooks/useWalletManagement' instead
 *
 * Hook to access provider and signer
 * @returns {Object} Provider and signer instances
 */
export function useEthers() {
  const { provider, signer } = useWeb3()
  return { provider, signer }
}

/**
 * @deprecated Use useWalletConnection from '../hooks/useWalletManagement' instead
 *
 * Hook to access wallet connection functions
 * @returns {Object} Connect and disconnect functions
 */
export function useWalletLegacy() {
  const { connectWallet, disconnectWallet, isConnected } = useWeb3()
  return { connectWallet, disconnectWallet, isConnected }
}
