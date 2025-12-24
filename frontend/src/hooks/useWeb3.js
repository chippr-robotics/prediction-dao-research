import { useContext } from 'react'
import { Web3Context } from '../contexts/Web3Context'

/**
 * Hook to access Web3 context
 * @returns {Object} Web3 context value
 * @throws {Error} If used outside Web3Provider
 */
export function useWeb3() {
  const context = useContext(Web3Context)
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider')
  }
  return context
}

/**
 * Hook to access account information
 * @returns {Object} Account and connection state
 */
export function useAccount() {
  const { account, isConnected } = useWeb3()
  return { account, isConnected }
}

/**
 * Hook to access network information
 * @returns {Object} Network state and switch function
 */
export function useNetwork() {
  const { chainId, networkError, isCorrectNetwork, switchNetwork } = useWeb3()
  return { chainId, networkError, isCorrectNetwork, switchNetwork }
}

/**
 * Hook to access provider and signer
 * @returns {Object} Provider and signer instances
 */
export function useEthers() {
  const { provider, signer } = useWeb3()
  return { provider, signer }
}

/**
 * Hook to access wallet connection functions
 * @returns {Object} Connect and disconnect functions
 */
export function useWallet() {
  const { connectWallet, disconnectWallet, isConnected } = useWeb3()
  return { connectWallet, disconnectWallet, isConnected }
}
