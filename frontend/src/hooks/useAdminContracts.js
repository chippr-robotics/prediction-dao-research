import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { MINIMAL_ROLE_MANAGER_ABI, MEMBERSHIP_TIERS, TIER_NAMES } from '../abis/MinimalRoleManager'
import { DEPLOYED_CONTRACTS, NETWORK_CONFIG } from '../config/contracts'

// Refresh interval for contract state (30 seconds)
export const CONTRACT_STATE_REFRESH_INTERVAL = 30000

/**
 * Get the role manager contract address
 * Falls back to environment variable if deployed contract is not set
 * @returns {string|null} Role manager address or null if not configured
 */
function getRoleManagerAddress() {
  // First check for explicit role manager address in config
  const configAddress = DEPLOYED_CONTRACTS.roleManager
  if (configAddress) {
    return configAddress
  }
  
  // Check environment variable
  const envAddress = import.meta.env.VITE_ROLE_MANAGER_ADDRESS
  if (envAddress) {
    return envAddress
  }
  
  // Role manager not deployed yet - return null
  console.warn('Role manager contract not deployed. Role persistence to blockchain is disabled.')
  return null
}

const ROLE_MANAGER_ADDRESS = getRoleManagerAddress()

// FriendGroupMarketFactory address for market stake revenue
const FRIEND_GROUP_MARKET_FACTORY_ADDRESS = DEPLOYED_CONTRACTS.friendGroupMarketFactory || null

// Minimal ABI for FriendGroupMarketFactory withdraw function
const FRIEND_GROUP_MARKET_FACTORY_ABI = [
  'function withdrawCollectedFees() external',
  'function owner() external view returns (address)'
]

/**
 * Hook for interacting with admin contract functions
 * Provides methods for emergency controls, tier configuration, and role management
 */
export function useAdminContracts() {
  const { signer, account, isConnected } = useWeb3()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [contractState, setContractState] = useState({
    isPaused: false,
    contractBalance: '0',
    friendMarketBalance: '0',
    roleHashes: {},
    supportsTiers: false,
    isDeployed: !!ROLE_MANAGER_ADDRESS,
    friendMarketFactoryDeployed: !!FRIEND_GROUP_MARKET_FACTORY_ADDRESS
  })
  
  // Track if a fetch is in progress to prevent redundant calls
  const fetchInProgressRef = useRef(false)

  /**
   * Get a read-only provider for querying contract state
   * Memoized to reuse the same provider instance
   */
  const readProvider = useMemo(() => {
    return new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
  }, [])

  /**
   * Get the role manager contract instance
   * Returns null if role manager is not deployed
   */
  const getRoleManagerContract = useCallback((useSigner = false) => {
    if (!ROLE_MANAGER_ADDRESS) {
      return null
    }
    const providerOrSigner = useSigner && signer ? signer : readProvider
    return new ethers.Contract(ROLE_MANAGER_ADDRESS, MINIMAL_ROLE_MANAGER_ABI, providerOrSigner)
  }, [signer, readProvider])

  /**
   * Fetch current contract state
   */
  const fetchContractState = useCallback(async () => {
    // Role manager not deployed
    if (!ROLE_MANAGER_ADDRESS) {
      // Still try to fetch FriendGroupMarketFactory balance if available
      let friendMarketBalance = '0'
      if (FRIEND_GROUP_MARKET_FACTORY_ADDRESS) {
        try {
          friendMarketBalance = ethers.formatEther(
            await readProvider.getBalance(FRIEND_GROUP_MARKET_FACTORY_ADDRESS)
          )
        } catch (e) {
          console.warn('Error fetching FriendGroupMarketFactory balance:', e)
        }
      }
      setContractState({
        isPaused: false,
        contractBalance: '0',
        friendMarketBalance,
        roleHashes: {},
        isDeployed: false,
        friendMarketFactoryDeployed: !!FRIEND_GROUP_MARKET_FACTORY_ADDRESS
      })
      return null
    }

    // Prevent redundant fetches
    if (fetchInProgressRef.current) {
      return null
    }
    
    fetchInProgressRef.current = true
    try {
      const contract = getRoleManagerContract(false)
      if (!contract) {
        return null
      }

      // Fetch paused state and balances in parallel
      const [isPaused, balance, friendMarketBalanceWei] = await Promise.all([
        contract.paused().catch(() => false),
        readProvider.getBalance(ROLE_MANAGER_ADDRESS).catch(() => 0n),
        FRIEND_GROUP_MARKET_FACTORY_ADDRESS
          ? readProvider.getBalance(FRIEND_GROUP_MARKET_FACTORY_ADDRESS).catch(() => 0n)
          : Promise.resolve(0n)
      ])

      // Fetch role hashes
      const roleNames = [
        'CORE_SYSTEM_ADMIN_ROLE',
        'OPERATIONS_ADMIN_ROLE',
        'EMERGENCY_GUARDIAN_ROLE',
        'MARKET_MAKER_ROLE',
        'CLEARPATH_USER_ROLE',
        'TOKENMINT_ROLE',
        'FRIEND_MARKET_ROLE',
        'OVERSIGHT_COMMITTEE_ROLE'
      ]

      const roleHashes = { DEFAULT_ADMIN_ROLE: ethers.ZeroHash }

      for (const roleName of roleNames) {
        try {
          roleHashes[roleName] = await contract[roleName]()
        } catch {
          // Role might not exist on this contract version
          roleHashes[roleName] = null
        }
      }

      // Detect whether tier extension functions are supported on this deployment.
      // RoleManagerCore (deterministic deploy) does NOT include tier pricing/membership storage.
      let supportsTiers = false
      try {
        // If the function selector doesn't exist, this call will revert.
        await contract.tierPrices(ethers.ZeroHash, 1)
        supportsTiers = true
      } catch {
        supportsTiers = false
      }

      setContractState({
        isPaused,
        contractBalance: ethers.formatEther(balance),
        friendMarketBalance: ethers.formatEther(friendMarketBalanceWei),
        roleHashes,
        supportsTiers,
        isDeployed: true,
        friendMarketFactoryDeployed: !!FRIEND_GROUP_MARKET_FACTORY_ADDRESS
      })

      return {
        isPaused,
        contractBalance: ethers.formatEther(balance),
        friendMarketBalance: ethers.formatEther(friendMarketBalanceWei),
        roleHashes,
        supportsTiers,
        isDeployed: true,
        friendMarketFactoryDeployed: !!FRIEND_GROUP_MARKET_FACTORY_ADDRESS
      }
    } catch (err) {
      console.error('Error fetching contract state:', err)
      setError(err.message)
      return null
    } finally {
      fetchInProgressRef.current = false
    }
  }, [getRoleManagerContract, readProvider])

  /**
   * Emergency pause the contract
   */
  const emergencyPause = useCallback(async () => {
    if (!signer || !isConnected) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      const contract = getRoleManagerContract(true)
      const tx = await contract.emergencyPause()
      const receipt = await tx.wait()

      await fetchContractState()

      return {
        success: true,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      }
    } catch (err) {
      const message = parseContractError(err)
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [signer, isConnected, getRoleManagerContract, fetchContractState])

  /**
   * Emergency unpause the contract
   */
  const emergencyUnpause = useCallback(async () => {
    if (!signer || !isConnected) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      const contract = getRoleManagerContract(true)
      const tx = await contract.emergencyUnpause()
      const receipt = await tx.wait()

      await fetchContractState()

      return {
        success: true,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      }
    } catch (err) {
      const message = parseContractError(err)
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [signer, isConnected, getRoleManagerContract, fetchContractState])

  /**
   * Configure a tier for a role
   */
  const configureTier = useCallback(async (roleHash, tier, priceInEth, isActive) => {
    if (!signer || !isConnected) {
      throw new Error('Wallet not connected')
    }
    
    if (!roleHash || roleHash === null) {
      throw new Error('Invalid role hash. Role may not exist on this contract.')
    }

    setIsLoading(true)
    setError(null)

    try {
      if (!contractState.supportsTiers) {
        throw new Error('Tier configuration not available: deploy the modular tier extensions (scripts/deploy-modular-rbac.js).')
      }

      const contract = getRoleManagerContract(true)
      const priceWei = ethers.parseEther(priceInEth.toString())

      const tx = await contract.configureTier(roleHash, tier, priceWei, isActive)
      const receipt = await tx.wait()

      return {
        success: true,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      }
    } catch (err) {
      const message = parseContractError(err)
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [signer, isConnected, getRoleManagerContract, contractState.supportsTiers])

  /**
   * Grant a tier to a user
   */
  const grantTier = useCallback(async (userAddress, roleHash, tier, durationDays) => {
    if (!signer || !isConnected) {
      throw new Error('Wallet not connected')
    }

    if (!ethers.isAddress(userAddress)) {
      throw new Error('Invalid user address')
    }
    
    if (!roleHash || roleHash === null) {
      throw new Error('Invalid role hash. Role may not exist on this contract.')
    }

    setIsLoading(true)
    setError(null)

    try {
      if (!contractState.supportsTiers) {
        throw new Error('Tier grants not available: deploy the modular membership extensions (scripts/deploy-modular-rbac.js).')
      }

      const contract = getRoleManagerContract(true)
      const tx = await contract.grantTier(userAddress, roleHash, tier, durationDays)
      const receipt = await tx.wait()

      return {
        success: true,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      }
    } catch (err) {
      const message = parseContractError(err)
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [signer, isConnected, getRoleManagerContract, contractState.supportsTiers])

  /**
   * Grant a role to an address on-chain
   */
  const grantRoleOnChain = useCallback(async (roleHash, userAddress) => {
    if (!signer || !isConnected) {
      throw new Error('Wallet not connected')
    }

    if (!ethers.isAddress(userAddress)) {
      throw new Error('Invalid user address')
    }

    setIsLoading(true)
    setError(null)

    try {
      const contract = getRoleManagerContract(true)
      const tx = await contract.grantRole(roleHash, userAddress)
      const receipt = await tx.wait()

      return {
        success: true,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      }
    } catch (err) {
      const message = parseContractError(err)
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [signer, isConnected, getRoleManagerContract])

  /**
   * Revoke a role from an address on-chain
   */
  const revokeRoleOnChain = useCallback(async (roleHash, userAddress) => {
    if (!signer || !isConnected) {
      throw new Error('Wallet not connected')
    }

    if (!ethers.isAddress(userAddress)) {
      throw new Error('Invalid user address')
    }

    setIsLoading(true)
    setError(null)

    try {
      const contract = getRoleManagerContract(true)
      const tx = await contract.revokeRole(roleHash, userAddress)
      const receipt = await tx.wait()

      return {
        success: true,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      }
    } catch (err) {
      const message = parseContractError(err)
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [signer, isConnected, getRoleManagerContract])

  /**
   * Check if an address has a specific role on-chain
   */
  const hasRoleOnChain = useCallback(async (roleHash, userAddress) => {
    try {
      const contract = getRoleManagerContract(false)
      return await contract.hasRole(roleHash, userAddress)
    } catch (err) {
      console.error('Error checking role:', err)
      return false
    }
  }, [getRoleManagerContract, contractState.supportsTiers])

  /**
   * Withdraw funds from the contract
   */
  const withdraw = useCallback(async (toAddress, amountInEth) => {
    if (!signer || !isConnected) {
      throw new Error('Wallet not connected')
    }

    if (!ethers.isAddress(toAddress)) {
      throw new Error('Invalid recipient address')
    }

    setIsLoading(true)
    setError(null)

    try {
      const contract = getRoleManagerContract(true)
      const amountWei = ethers.parseEther(amountInEth.toString())

      const tx = await contract.withdraw(toAddress, amountWei)
      const receipt = await tx.wait()

      await fetchContractState()

      return {
        success: true,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      }
    } catch (err) {
      const message = parseContractError(err)
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [signer, isConnected, getRoleManagerContract, fetchContractState])

  /**
   * Withdraw collected fees from FriendGroupMarketFactory
   * Sends all accumulated market stake fees to the owner
   */
  const withdrawFromFriendMarketFactory = useCallback(async () => {
    if (!signer || !isConnected) {
      throw new Error('Wallet not connected')
    }

    if (!FRIEND_GROUP_MARKET_FACTORY_ADDRESS) {
      throw new Error('FriendGroupMarketFactory not deployed')
    }

    setIsLoading(true)
    setError(null)

    try {
      const contract = new ethers.Contract(
        FRIEND_GROUP_MARKET_FACTORY_ADDRESS,
        FRIEND_GROUP_MARKET_FACTORY_ABI,
        signer
      )

      const tx = await contract.withdrawCollectedFees()
      const receipt = await tx.wait()

      await fetchContractState()

      return {
        success: true,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      }
    } catch (err) {
      const message = parseContractError(err)
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [signer, isConnected, fetchContractState])

  /**
   * Get tier information for a role
   */
  const getTierInfo = useCallback(async (roleHash, tier) => {
    try {
      if (!contractState.supportsTiers) {
        return null
      }

      const contract = getRoleManagerContract(false)
      const [price, isActive] = await Promise.all([
        contract.tierPrices(roleHash, tier),
        contract.tierActive(roleHash, tier)
      ])

      return {
        price: ethers.formatEther(price),
        isActive,
        tierName: TIER_NAMES[tier]
      }
    } catch (err) {
      console.error('Error getting tier info:', err)
      return null
    }
  }, [getRoleManagerContract])

  /**
   * Get user's tier and membership info for a role
   */
  const getUserMembership = useCallback(async (userAddress, roleHash) => {
    try {
      if (!contractState.supportsTiers) {
        return null
      }

      const contract = getRoleManagerContract(false)
      const [tier, expiration, isActive] = await Promise.all([
        contract.userTiers(userAddress, roleHash),
        contract.membershipExpiration(userAddress, roleHash),
        contract.isActiveMember(userAddress, roleHash)
      ])

      return {
        tier: Number(tier),
        tierName: TIER_NAMES[Number(tier)],
        expiration: Number(expiration) > 0 ? new Date(Number(expiration) * 1000) : null,
        isActive
      }
    } catch (err) {
      console.error('Error getting user membership:', err)
      return null
    }
  }, [getRoleManagerContract, contractState.supportsTiers])

  // Fetch contract state on mount and when account changes
  useEffect(() => {
    fetchContractState()
  }, [fetchContractState, account])

  return {
    // State
    isLoading,
    error,
    contractState,

    // Actions
    emergencyPause,
    emergencyUnpause,
    configureTier,
    grantTier,
    grantRoleOnChain,
    revokeRoleOnChain,
    hasRoleOnChain,
    withdraw,
    withdrawFromFriendMarketFactory,
    fetchContractState,
    getTierInfo,
    getUserMembership,

    // Contract addresses for reference
    roleManagerAddress: ROLE_MANAGER_ADDRESS,
    friendMarketFactoryAddress: FRIEND_GROUP_MARKET_FACTORY_ADDRESS
  }
}

/**
 * Parse contract errors into user-friendly messages
 */
function parseContractError(error) {
  if (error.code === 'ACTION_REJECTED') {
    return 'Transaction rejected by user'
  }

  if (error.message?.includes('Not authorized')) {
    return 'You do not have permission to perform this action'
  }

  if (error.message?.includes('insufficient funds')) {
    return 'Insufficient funds for transaction'
  }

  if (error.message?.includes('Already initialized')) {
    return 'Contract has already been initialized'
  }

  if (error.message?.includes('Pausable: paused')) {
    return 'Contract is currently paused'
  }

  if (error.message?.includes('Pausable: not paused')) {
    return 'Contract is not currently paused'
  }

  if (error.message?.includes('Invalid address')) {
    return 'Invalid address provided'
  }

  if (error.message?.includes('Insufficient balance')) {
    return 'Contract has insufficient balance for withdrawal'
  }

  // Return original message if no specific parsing matched
  return error.message || 'Transaction failed'
}

export default useAdminContracts
