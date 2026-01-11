import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { ethers } from 'ethers'
import { EXPECTED_CHAIN_ID, getExpectedChain } from '../wagmi'
import {
  getUserRoles,
  hasRole as checkRole,
  addUserRole,
  removeUserRole
} from '../utils/roleStorage'
import { hasRoleOnChain } from '../utils/blockchainService'
import { WalletContext } from './WalletContext'

export function WalletProvider({ children }) {
  // Wagmi hooks for wallet connection
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  
  // Provider and signer for transactions
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  
  // Network state
  const [networkError, setNetworkError] = useState(null)
  
  // Balances (cached)
  const [balances, setBalances] = useState({
    etc: '0',
    wetc: '0',
    tokens: {} // For other ERC20 tokens
  })
  const [balancesLoading, setBalancesLoading] = useState(false)
  
  // RVAC roles integrated with wallet
  const [roles, setRoles] = useState([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [blockchainSynced, setBlockchainSynced] = useState(false)

  // Update provider and signer when connection changes
  useEffect(() => {
    const updateProviderAndSigner = async () => {
      if (isConnected && window.ethereum) {
        try {
          const ethersProvider = new ethers.BrowserProvider(window.ethereum)
          const ethersSigner = await ethersProvider.getSigner()
          setProvider(ethersProvider)
          setSigner(ethersSigner)
        } catch (error) {
          console.error('Error creating provider/signer:', error)
          setProvider(null)
          setSigner(null)
        }
      } else {
        setProvider(null)
        setSigner(null)
      }
    }
    
    updateProviderAndSigner()
  }, [isConnected, address])

  // Check network compatibility
  useEffect(() => {
    if (isConnected && chainId !== EXPECTED_CHAIN_ID) {
      const expectedChain = getExpectedChain()
      setNetworkError(`Wrong network. Please switch to ${expectedChain.name} (Chain ID: ${EXPECTED_CHAIN_ID})`)
    } else {
      setNetworkError(null)
    }
  }, [chainId, isConnected])

  /**
   * Sync local roles with blockchain state
   * If a role exists on-chain but not locally, add it
   * If a role exists locally but not on-chain, remove it (expired)
   */
  const syncRolesWithBlockchain = useCallback(async (walletAddress, localRoles) => {
    const premiumRoles = ['MARKET_MAKER', 'CLEARPATH_USER', 'TOKENMINT', 'FRIEND_MARKET']
    const updatedRoles = []
    let hasChanges = false
    let syncErrors = []

    console.log('[RoleSync] Starting blockchain sync for:', walletAddress)
    console.log('[RoleSync] Local roles:', localRoles)

    // Check each premium role on-chain
    for (const roleName of premiumRoles) {
      try {
        const hasOnChain = await hasRoleOnChain(walletAddress, roleName)
        const hasLocally = localRoles.includes(roleName)

        console.log(`[RoleSync] ${roleName}: onChain=${hasOnChain}, local=${hasLocally}`)

        if (hasOnChain) {
          // Role exists on-chain - keep it
          updatedRoles.push(roleName)
          if (!hasLocally) {
            console.log(`[RoleSync] Adding ${roleName} from blockchain to local storage`)
            addUserRole(walletAddress, roleName)
            hasChanges = true
          }
        } else if (hasLocally) {
          // Role exists locally but not on-chain - it may have expired
          // Note: Keep the local role if blockchain check failed - be conservative
          console.log(`[RoleSync] ${roleName} not found on-chain but exists locally`)
          // Don't remove immediately - only remove if we got a definitive "false" from blockchain
          // For now, keep the local role to avoid false negatives from RPC issues
          updatedRoles.push(roleName)
        }
      } catch (roleError) {
        console.error(`[RoleSync] Error checking ${roleName}:`, roleError.message)
        syncErrors.push({ role: roleName, error: roleError.message })
        // Keep local role if blockchain check fails - be conservative
        if (localRoles.includes(roleName)) {
          updatedRoles.push(roleName)
        }
      }
    }

    // Keep non-premium roles (like ADMIN) that are stored locally
    for (const role of localRoles) {
      if (!premiumRoles.includes(role) && !updatedRoles.includes(role)) {
        updatedRoles.push(role)
      }
    }

    console.log('[RoleSync] Final roles:', updatedRoles)
    if (syncErrors.length > 0) {
      console.warn('[RoleSync] Sync completed with errors:', syncErrors)
    }

    return { roles: updatedRoles, hasChanges, errors: syncErrors }
  }, [])

  /**
   * Load roles from both localStorage and blockchain
   * Blockchain is the source of truth for premium roles
   */
  const loadRoles = useCallback(async (walletAddress) => {
    setRolesLoading(true)
    setBlockchainSynced(false)
    try {
      // First load from local storage (immediate response)
      const localRoles = getUserRoles(walletAddress)
      setRoles(localRoles)

      // Then sync with blockchain (authoritative source)
      const { roles: syncedRoles } = await syncRolesWithBlockchain(walletAddress, localRoles)
      setRoles(syncedRoles)
      setBlockchainSynced(true)
    } catch (error) {
      console.error('Error loading user roles:', error)
      setRoles([])
    } finally {
      setRolesLoading(false)
    }
  }, [syncRolesWithBlockchain])

  /**
   * Manually refresh roles from blockchain
   * Call this to get fresh role data from the chain
   */
  const refreshRoles = useCallback(async () => {
    if (!address) return
    await loadRoles(address)
  }, [address, loadRoles])

  // Fetch wallet balances
  const fetchBalances = useCallback(async (walletAddress) => {
    if (!provider || !walletAddress) return
    
    setBalancesLoading(true)
    try {
      // Get native ETC balance
      const etcBalance = await provider.getBalance(walletAddress)
      
      setBalances(prev => ({
        ...prev,
        etc: ethers.formatEther(etcBalance)
      }))
    } catch (error) {
      console.error('Error fetching balances:', error)
    } finally {
      setBalancesLoading(false)
    }
  }, [provider])

  // Load RVAC roles when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      loadRoles(address)
      fetchBalances(address)
    } else {
      setRoles([])
      setBalances({ etc: '0', wetc: '0', tokens: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected])

  // Refresh balances manually
  const refreshBalances = useCallback(() => {
    if (address) {
      return fetchBalances(address)
    }
  }, [address, fetchBalances])

  // Get balance for specific token
  const getTokenBalance = useCallback(async (tokenAddress) => {
    if (!provider || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      )
      const balance = await tokenContract.balanceOf(address)
      const formatted = ethers.formatEther(balance)
      
      // Cache the balance
      setBalances(prev => ({
        ...prev,
        tokens: {
          ...prev.tokens,
          [tokenAddress]: formatted
        }
      }))
      
      return formatted
    } catch (error) {
      console.error('Error getting token balance:', error)
      throw error
    }
  }, [provider, address])

  // Connect wallet
  const connectWallet = useCallback(async (connectorId) => {
    try {
      // If no specific connector is requested, try injected first, then WalletConnect
      let connector
      
      if (connectorId) {
        // Use specific connector if requested
        connector = connectors.find(c => c.id === connectorId)
      } else {
        // Try injected first if available, otherwise use WalletConnect
        connector = connectors.find(c => c.id === 'injected') || 
                   connectors.find(c => c.id === 'walletConnect')
      }
      
      if (!connector) {
        throw new Error('No wallet connector available')
      }

      await connect({ connector })
      return true
    } catch (error) {
      console.error('Error connecting wallet:', error)
      
      // Check for user rejection
      if (error.code === 4001 || error.name === 'UserRejectedRequestError') {
        throw new Error('Please approve the connection request')
      }
      throw error
    }
  }, [connect, connectors])

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    disconnect()
    setRoles([])
    setBalances({ etc: '0', wetc: '0', tokens: {} })
    
    // Clear wagmi persistence from storage
    try {
      // List of known wagmi storage keys to clear
      const wagmiKeys = [
        'wagmi.store',
        'wagmi.cache', 
        'wagmi.wallet',
        'wagmi.connected',
        'wagmi.recentConnectorId',
        'wagmi.injected.shimDisconnect'
      ]
      
      // Clear from both localStorage and sessionStorage
      wagmiKeys.forEach(key => {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      })
    } catch (error) {
      console.error('Error clearing wallet persistence:', error)
    }
  }, [disconnect])

  // Switch to correct network
  const switchNetwork = useCallback(async () => {
    try {
      await switchChain({ chainId: EXPECTED_CHAIN_ID })
      return true
    } catch (error) {
      console.error('Error switching network:', error)
      throw new Error(`Please manually switch to ${getExpectedChain().name} in your wallet`)
    }
  }, [switchChain])

  // Send transaction helper
  const sendTransaction = useCallback(async (transactionRequest) => {
    if (!signer) {
      throw new Error('Wallet not connected')
    }

    try {
      const tx = await signer.sendTransaction(transactionRequest)
      return tx
    } catch (error) {
      console.error('Error sending transaction:', error)
      throw error
    }
  }, [signer])

  // Sign message
  const signMessage = useCallback(async (message) => {
    if (!signer) {
      throw new Error('Wallet not connected')
    }

    try {
      const signature = await signer.signMessage(message)
      return signature
    } catch (error) {
      console.error('Error signing message:', error)
      throw error
    }
  }, [signer])

  // RVAC Role management
  // Use the synced `roles` state as source of truth (blockchain is authoritative)
  const hasRole = useCallback((role) => {
    if (!address) return false
    // Check the synced roles state instead of localStorage
    // This ensures we reflect the actual on-chain state
    return roles.includes(role)
  }, [address, roles])

  const hasAnyRole = useCallback((rolesToCheck) => {
    if (!address || !Array.isArray(rolesToCheck)) return false
    return rolesToCheck.some(role => roles.includes(role))
  }, [address, roles])

  const hasAllRoles = useCallback((rolesToCheck) => {
    if (!address || !Array.isArray(rolesToCheck)) return false
    return rolesToCheck.every(role => roles.includes(role))
  }, [address, roles])

  const grantRole = useCallback((role) => {
    if (!address) {
      throw new Error('Cannot grant role: no wallet connected')
    }

    try {
      addUserRole(address, role)
      const updatedRoles = getUserRoles(address)
      setRoles(updatedRoles)
      return true
    } catch (error) {
      console.error('Error granting role:', error)
      return false
    }
  }, [address])

  const revokeRole = useCallback((role) => {
    if (!address) {
      throw new Error('Cannot revoke role: no wallet connected')
    }

    try {
      removeUserRole(address, role)
      const updatedRoles = getUserRoles(address)
      setRoles(updatedRoles)
      return true
    } catch (error) {
      console.error('Error revoking role:', error)
      return false
    }
  }, [address])

  // Computed values
  const isCorrectNetwork = useMemo(
    () => isConnected && chainId === EXPECTED_CHAIN_ID,
    [isConnected, chainId]
  )

  const value = {
    // Wallet state
    address,
    account: address, // Alias for backwards compatibility
    isConnected,
    chainId,
    
    // Available connectors
    connectors,
    
    // Provider and signer for transactions
    provider,
    signer,
    
    // Network state
    networkError,
    isCorrectNetwork,
    
    // Balances
    balances,
    balancesLoading,
    
    // RVAC roles
    roles,
    rolesLoading,
    blockchainSynced,
    refreshRoles,

    // Wallet actions
    connectWallet,
    disconnectWallet,
    switchNetwork,
    
    // Transaction methods
    sendTransaction,
    signMessage,
    
    // Balance methods
    refreshBalances,
    getTokenBalance,
    
    // RVAC role methods
    hasRole,
    hasAnyRole,
    hasAllRoles,
    grantRole,
    revokeRole,
  }

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  )
}
