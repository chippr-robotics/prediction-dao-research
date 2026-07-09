import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain, useWalletClient } from 'wagmi'
import { ethers } from 'ethers'
import { isSupportedChainId, getNetwork, PRIMARY_CHAIN_ID } from '../config/networks'
import { makeReadProvider } from '../utils/rpcProvider'
import {
  getUserRoles,
  addUserRole,
  removeUserRole
} from '../utils/roleStorage'
import { hasRoleOnChain } from '../utils/blockchainService'
import { WalletContext } from './WalletContext'

export function WalletProvider({ children }) {
  // Wagmi hooks for wallet connection
  const { address, isConnected, connector: activeConnector } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { data: walletClient } = useWalletClient()

  // Connector-backed write transport for classic wallets only. Passkey sessions never
  // hydrate an injected BrowserProvider/signer here: reads go through `readProvider`
  // and writes go through `sendCalls`.
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  
  // Network state
  const [networkError, setNetworkError] = useState(null)
  
  // Balances (cached)
  const [balances, setBalances] = useState({
    native: '0',
    wnative: '0',
    tokens: {} // For other ERC20 tokens
  })
  const [balancesLoading, setBalancesLoading] = useState(false)
  
  // RVAC roles integrated with wallet
  const [roles, setRoles] = useState([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [blockchainSynced, setBlockchainSynced] = useState(false)

  // ---- Spec 041: unified login-method + capability surface (FR-002) ----
  // `loginMethod` is INFORMATIONAL ONLY (signing ceremony differs); identity,
  // gating, and screening always key off `address` — no feature may branch on
  // it for authorization.
  const loginMethod = useMemo(() => {
    if (!isConnected || !activeConnector) return null
    if (activeConnector.id === 'fairwinsPasskey' || activeConnector.type === 'passkey') return 'passkey'
    if (activeConnector.id === 'walletConnect') return 'walletconnect'
    return 'injected'
  }, [isConnected, activeConnector])
  const readProvider = useMemo(() => {
    const net = getNetwork(chainId)
    const rpcProvider = net?.rpcUrl ? makeReadProvider(net.rpcUrl, chainId) : null
    return loginMethod === 'passkey' ? (rpcProvider || provider) : (provider || rpcProvider)
  }, [chainId, loginMethod, provider])

  // Encryption capability for the FR-012 degradation UI. Classic wallets keep
  // the legacy signature-derived path (always available); passkey sessions
  // resolve through the PRF pipeline lazily (state refined by usePasskeyAccount
  // /account-management surfaces as ceremonies happen).
  const [accountCapabilities, setAccountCapabilities] = useState({ encryption: 'available' })
  useEffect(() => {
    let cancelled = false
    async function resolveCapabilities() {
      if (!isConnected) return setAccountCapabilities({ encryption: 'available' })
      if (loginMethod !== 'passkey') return setAccountCapabilities({ encryption: 'available' })
      try {
        const [{ capability }, { knownCredentials }] = await Promise.all([
          import('../lib/passkey/prfKeys'),
          import('../lib/passkey/credentials'),
        ])
        const cred = knownCredentials().find((c) => c.address?.toLowerCase() === address?.toLowerCase())
        const out = capability({
          account: address,
          credentialId: cred?.credentialId,
          prfCapable: cred?.prfCapable ?? false,
        })
        if (!cancelled) setAccountCapabilities({ encryption: out.state, encryptionReason: out.reason })
      } catch {
        if (!cancelled) {
          setAccountCapabilities({
            encryption: 'unavailable',
            encryptionReason: 'Encrypted-feature capability could not be determined on this device.',
          })
        }
      }
    }
    resolveCapabilities()
    return () => {
      cancelled = true
    }
  }, [isConnected, loginMethod, address])

  /**
   * Unified write abstraction (spec 041): batched calls in one confirmation.
   * - Passkey sessions: fulfilled by the smart-account layer (viem-first) via
   *   the submission router — ONE ceremony covers the whole batch (FR-016).
   * - Classic wallets: sequential signer transactions (existing behavior,
   *   unchanged for existing users — SC-004).
   * Each call: { target, data, value? }.
   */
  const sendCalls = useCallback(
    async (calls) => {
      if (!calls?.length) throw new Error('sendCalls: empty batch')
      if (loginMethod === 'passkey') {
        const { sendPasskeyBatch } = await import('../lib/passkey/sendBatch')
        return sendPasskeyBatch({ chainId, address, calls })
      }
      if (!signer) throw new Error('No signer available')
      const receipts = []
      for (const c of calls) {
        const tx = await signer.sendTransaction({ to: c.target ?? c.to, data: c.data, value: c.value ?? 0n })
        receipts.push(await tx.wait())
      }
      return { route: 'direct', receipts, txHash: receipts.at(-1)?.hash }
    },
    [loginMethod, chainId, address, signer]
  )

  // Update provider and signer when connection changes
  // Use wagmi's walletClient for proper authorization
  useEffect(() => {
    let cancelled = false
    const updateProviderAndSigner = async () => {
      if (loginMethod === 'passkey') {
        if (cancelled) return
        setProvider(null)
        setSigner(null)
        return
      }
      if (isConnected && walletClient) {
        try {
          // Create provider from walletClient's transport for proper authorization
          // This ensures the signer is authorized for the connected account
          const ethersProvider = new ethers.BrowserProvider(walletClient.transport, {
            chainId: walletClient.chain?.id,
            name: walletClient.chain?.name || 'Unknown'
          })

          // Get signer for the specific account that wagmi has authorized
          const ethersSigner = await ethersProvider.getSigner(walletClient.account.address)
          if (cancelled) return
          setProvider(ethersProvider)
          setSigner(ethersSigner)
          console.log('[WalletContext] Signer created for:', walletClient.account.address)
        } catch (error) {
          if (cancelled) return
          console.error('Error creating provider/signer from walletClient:', error)

          // Fallback to window.ethereum if walletClient approach fails
          if (typeof window !== 'undefined' && window.ethereum) {
            try {
              const fallbackProvider = new ethers.BrowserProvider(window.ethereum)
              const fallbackSigner = await fallbackProvider.getSigner()
              if (cancelled) return
              setProvider(fallbackProvider)
              setSigner(fallbackSigner)
              console.log('[WalletContext] Using fallback signer')
            } catch (fallbackError) {
              if (cancelled) return
              console.error('Fallback signer creation also failed:', fallbackError)
              setProvider(null)
              setSigner(null)
            }
          } else {
            setProvider(null)
            setSigner(null)
          }
        }
      } else if (isConnected && typeof window !== 'undefined' && window.ethereum) {
        // If walletClient is not available yet, try window.ethereum directly
        try {
          const ethersProvider = new ethers.BrowserProvider(window.ethereum)
          const ethersSigner = await ethersProvider.getSigner()
          if (cancelled) return
          setProvider(ethersProvider)
          setSigner(ethersSigner)
          console.log('[WalletContext] Signer created from window.ethereum')
        } catch (error) {
          if (cancelled) return
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
    return () => { cancelled = true }
  }, [isConnected, address, walletClient, loginMethod])

  // Auto-switch to Polygon (PRIMARY_CHAIN_ID) when the wallet connects on an
  // unsupported chain. If the switch fails, show a network error instead.
  useEffect(() => {
    if (!isConnected) {
      setNetworkError(null)
      return
    }
    if (isSupportedChainId(chainId)) {
      setNetworkError(null)
      return
    }
    // Wallet is on an unsupported chain — try switching automatically
    switchChain(
      { chainId: PRIMARY_CHAIN_ID },
      {
        onError: () => {
          const primary = getNetwork(PRIMARY_CHAIN_ID)
          setNetworkError(
            `Please switch to ${primary?.name || 'Polygon'} in your wallet.`
          )
        },
      }
    )
  }, [chainId, isConnected, switchChain])

  // Clear stale WalletConnect data on mount if not connected
  // This prevents "failed to process inbound message" errors from stale sessions
  useEffect(() => {
    // Only run once on mount, and only if not already connected
    if (!isConnected) {
      try {
        const keysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          // Only clear WalletConnect message/pairing data, not session data
          // This allows reconnection while clearing stale relay messages
          if (key && (key.startsWith('wc@2:core:') || key.includes(':messages:'))) {
            keysToRemove.push(key)
          }
        }
        if (keysToRemove.length > 0) {
          keysToRemove.forEach(key => localStorage.removeItem(key))
          console.log('[WalletContext] Cleared stale WalletConnect data')
        }
      } catch {
        // Silently ignore cleanup errors
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Sync local roles with blockchain state
   * If a role exists on-chain but not locally, add it
   * If a role exists locally but not on-chain, remove it (expired)
   */
  const syncRolesWithBlockchain = useCallback(async (walletAddress, localRoles, activeChainId) => {
    const premiumRoles = ['WAGER_PARTICIPANT']
    const adminRoles = ['ADMIN', 'GUARDIAN', 'ACCOUNT_MODERATOR', 'ROLE_MANAGER']
    const allSyncedRoles = [...premiumRoles, ...adminRoles]
    const updatedRoles = []
    let hasChanges = false
    let syncErrors = []

    console.log('[RoleSync] Starting blockchain sync for:', walletAddress)
    console.log('[RoleSync] Local roles:', localRoles)

    // Check each role on-chain (both premium and admin roles)
    for (const roleName of allSyncedRoles) {
      try {
        const hasOnChain = await hasRoleOnChain(walletAddress, roleName, activeChainId)
        const hasLocally = localRoles.includes(roleName)

        console.log(`[RoleSync] ${roleName}: onChain=${hasOnChain}, local=${hasLocally}`)

        if (hasOnChain) {
          // Role exists on-chain - keep it
          updatedRoles.push(roleName)
          if (!hasLocally) {
            console.log(`[RoleSync] Adding ${roleName} from blockchain to local storage`)
            addUserRole(walletAddress, roleName, activeChainId)
            hasChanges = true
          }
        } else if (hasLocally) {
          // Role exists locally but not on-chain - it has expired or was never purchased
          // Blockchain is the source of truth - remove the stale local role
          console.log(`[RoleSync] ${roleName} not found on-chain - removing stale local role`)
          removeUserRole(walletAddress, roleName, activeChainId)
          hasChanges = true
          // Don't add to updatedRoles - role is no longer valid
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

    // Keep any other roles that are stored locally but not in our synced list
    for (const role of localRoles) {
      if (!allSyncedRoles.includes(role) && !updatedRoles.includes(role)) {
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
  const loadRoles = useCallback(async (walletAddress, activeChainId) => {
    setRolesLoading(true)
    setBlockchainSynced(false)
    try {
      // First load from local storage (immediate response), scoped to the chain
      const localRoles = getUserRoles(walletAddress, activeChainId)
      setRoles(localRoles)

      // Then sync with blockchain (authoritative source) for the active chain
      const { roles: syncedRoles } = await syncRolesWithBlockchain(walletAddress, localRoles, activeChainId)
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
    await loadRoles(address, chainId)
  }, [address, chainId, loadRoles])

  // Fetch wallet balances
  const fetchBalances = useCallback(async (walletAddress) => {
    if (!readProvider || !walletAddress) return
    
    setBalancesLoading(true)
    try {
      // Get native token balance
      const nativeBalance = await readProvider.getBalance(walletAddress)

      setBalances(prev => ({
        ...prev,
        native: ethers.formatEther(nativeBalance)
      }))
    } catch (error) {
      console.error('Error fetching balances:', error)
    } finally {
      setBalancesLoading(false)
    }
  }, [readProvider])

  // Load RVAC roles when the wallet connects or the active network changes.
  // Membership (the paid WAGER_PARTICIPANT role) lives in a per-chain
  // MembershipManager, so a testnet ↔ mainnet switch must re-query the chain
  // — otherwise a testnet membership would appear active on mainnet where it
  // doesn't exist. chainId is included in the deps to force that re-query.
  useEffect(() => {
    if (isConnected && address) {
      loadRoles(address, chainId)
      fetchBalances(address)
    } else {
      setRoles([])
      setBalances({ native: '0', wnative: '0', tokens: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, chainId])

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
    setBalances({ native: '0', wnative: '0', tokens: {} })

    // Clear wagmi and WalletConnect persistence from storage
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

      // Clear WalletConnect v2 storage to prevent stale relay message errors
      // WalletConnect stores data under keys starting with "wc@2:"
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('wc@2:')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))

      // Spec 041 FR-003: sign-out clears the passkey session atomically too.
      // (Credential bookkeeping and wrapped key blobs stay — they are not
      // session state; the passkey itself lives in the platform authenticator.)
      localStorage.removeItem('fairwins.passkey.session.v1')
    } catch (error) {
      console.error('Error clearing wallet persistence:', error)
    }
  }, [disconnect])

  // Switch to the configured primary network (Polygon Amoy). Invoked from
  // the network-error banner / "Switch Network" button when the user is on
  // an unsupported chain.
  const switchNetwork = useCallback(async () => {
    const target = PRIMARY_CHAIN_ID
    try {
      await switchChain({ chainId: target })
      return true
    } catch (error) {
      console.error('Error switching network:', error)
      const targetNet = getNetwork(target)
      throw new Error(`Please manually switch to ${targetNet?.name || 'Polygon Amoy'} in your wallet`)
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
      addUserRole(address, role, chainId)
      const updatedRoles = getUserRoles(address, chainId)
      setRoles(updatedRoles)
      return true
    } catch (error) {
      console.error('Error granting role:', error)
      return false
    }
  }, [address, chainId])

  const revokeRole = useCallback((role) => {
    if (!address) {
      throw new Error('Cannot revoke role: no wallet connected')
    }

    try {
      removeUserRole(address, role, chainId)
      const updatedRoles = getUserRoles(address, chainId)
      setRoles(updatedRoles)
      return true
    } catch (error) {
      console.error('Error revoking role:', error)
      return false
    }
  }, [address, chainId])

  // Computed values. "Correct" here means a supported chain (Polygon Amoy
  // or local Hardhat). Per-chain feature gates (e.g. polymarketSidebets) are
  // enforced via the capabilities map in networks.js.
  const isCorrectNetwork = useMemo(
    () => isConnected && isSupportedChainId(chainId),
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
    
    // Expose the unified read transport here: passkey sessions get direct RPC reads,
    // while classic wallets keep their connector-backed provider (with RPC fallback).
    provider: readProvider,
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
    sendCalls,

    // Spec 041: unified login surface (informational only — never authz)
    loginMethod,
    accountCapabilities,
    
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
