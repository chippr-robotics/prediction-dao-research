import { createContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { ethers } from 'ethers'
import { EXPECTED_CHAIN_ID, getExpectedChain } from '../wagmi'
import { 
  getUserRoles, 
  hasRole as checkRole,
  addUserRole,
  removeUserRole
} from '../utils/roleStorage'

/**
 * WalletContext - Unified wallet and user management system
 * 
 * This context provides a single source of truth for all wallet-related state and operations:
 * - Wallet connection and address management
 * - Balance tracking (ETC, WETC, tokens)
 * - Provider and signer for transactions
 * - RVAC role management integrated with wallet
 * - Network state and switching
 * 
 * All components needing wallet functionality should use this context via the useWallet hook.
 */
export const WalletContext = createContext(null)

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

  // Load user roles from storage
  const loadRoles = useCallback((walletAddress) => {
    setRolesLoading(true)
    try {
      const userRoles = getUserRoles(walletAddress)
      setRoles(userRoles)
    } catch (error) {
      console.error('Error loading user roles:', error)
      setRoles([])
    } finally {
      setRolesLoading(false)
    }
  }, [])

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
  const hasRole = useCallback((role) => {
    if (!address) return false
    return checkRole(address, role)
  }, [address])

  const hasAnyRole = useCallback((rolesToCheck) => {
    if (!address || !Array.isArray(rolesToCheck)) return false
    return rolesToCheck.some(role => checkRole(address, role))
  }, [address])

  const hasAllRoles = useCallback((rolesToCheck) => {
    if (!address || !Array.isArray(rolesToCheck)) return false
    return rolesToCheck.every(role => checkRole(address, role))
  }, [address])

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
