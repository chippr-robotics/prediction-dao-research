import { createContext, useState, useEffect, useCallback, useContext } from 'react'
import { NETWORKS, getNetworkKey, getRpcUrl } from '../utils/networkConfig'

const NetworkContext = createContext(null)

const STORAGE_KEY = 'network_preferences'

/**
 * NetworkProvider component
 * Manages network selection and RPC endpoint preferences
 */
export function NetworkProvider({ children }) {
  const [selectedNetwork, setSelectedNetwork] = useState('mordor')
  const [customRpcUrl, setCustomRpcUrl] = useState(null)

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const prefs = JSON.parse(stored)
        if (prefs.selectedNetwork) {
          setSelectedNetwork(prefs.selectedNetwork)
        }
        if (prefs.customRpcUrl) {
          setCustomRpcUrl(prefs.customRpcUrl)
        }
      }
    } catch (error) {
      console.error('Error loading network preferences:', error)
    }
  }, [])

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    try {
      const prefs = {
        selectedNetwork,
        customRpcUrl,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch (error) {
      console.error('Error saving network preferences:', error)
    }
  }, [selectedNetwork, customRpcUrl])

  /**
   * Switch to a different network
   * @param {string} networkKey - The network key (mainnet, mordor, hardhat)
   */
  const switchNetwork = useCallback((networkKey) => {
    if (NETWORKS[networkKey]) {
      setSelectedNetwork(networkKey)
      // Clear custom RPC when switching networks
      setCustomRpcUrl(null)
    }
  }, [])

  /**
   * Set a custom RPC URL for the current network
   * @param {string} rpcUrl - The custom RPC URL
   */
  const setCustomRpc = useCallback((rpcUrl) => {
    setCustomRpcUrl(rpcUrl)
  }, [])

  /**
   * Get the current RPC URL (custom or default)
   * @returns {string} RPC URL
   */
  const getCurrentRpcUrl = useCallback(() => {
    if (customRpcUrl) {
      return customRpcUrl
    }
    return getRpcUrl(selectedNetwork)
  }, [customRpcUrl, selectedNetwork])

  /**
   * Get the current network configuration
   * @returns {Object} Network configuration
   */
  const getCurrentNetwork = useCallback(() => {
    return NETWORKS[selectedNetwork]
  }, [selectedNetwork])

  const value = {
    // Current state
    selectedNetwork,
    customRpcUrl,
    
    // Current network info
    currentNetwork: getCurrentNetwork(),
    currentRpcUrl: getCurrentRpcUrl(),
    
    // Actions
    switchNetwork,
    setCustomRpc,
  }

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  )
}

/**
 * Hook to use network context
 * @returns {Object} Network context value
 */
export function useNetworkContext() {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetworkContext must be used within a NetworkProvider')
  }
  return context
}
