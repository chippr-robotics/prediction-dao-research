import { useState, useCallback, useEffect } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { MINIMAL_ROLE_MANAGER_ABI, MEMBERSHIP_TIERS, TIER_NAMES } from '../abis/MinimalRoleManager'
import { DEPLOYED_CONTRACTS, NETWORK_CONFIG } from '../config/contracts'

/**
 * Hook for interacting with admin contract functions
 * Provides methods for emergency controls, tier configuration, and role management
 */
export function useAdminContracts() {
  const { signer, account, isConnected, provider } = useWeb3()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [contractState, setContractState] = useState({
    isPaused: false,
    contractBalance: '0',
    roleHashes: {}
  })

  // Contract addresses - using deployer as placeholder for role manager
  // In production, this would be the actual deployed MinimalRoleManager address
  const ROLE_MANAGER_ADDRESS = DEPLOYED_CONTRACTS.deployer

  /**
   * Get a read-only provider for querying contract state
   */
  const getReadProvider = useCallback(() => {
    return new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
  }, [])

  /**
   * Get the role manager contract instance
   */
  const getRoleManagerContract = useCallback((useSigner = false) => {
    const providerOrSigner = useSigner && signer ? signer : getReadProvider()
    return new ethers.Contract(ROLE_MANAGER_ADDRESS, MINIMAL_ROLE_MANAGER_ABI, providerOrSigner)
  }, [signer, getReadProvider])

  /**
   * Fetch current contract state
   */
  const fetchContractState = useCallback(async () => {
    try {
      const contract = getRoleManagerContract(false)
      const readProvider = getReadProvider()

      // Fetch paused state and balance in parallel
      const [isPaused, balance] = await Promise.all([
        contract.paused().catch(() => false),
        readProvider.getBalance(ROLE_MANAGER_ADDRESS).catch(() => 0n)
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
        } catch (e) {
          // Role might not exist on this contract version
          roleHashes[roleName] = null
        }
      }

      setContractState({
        isPaused,
        contractBalance: ethers.formatEther(balance),
        roleHashes
      })

      return { isPaused, contractBalance: ethers.formatEther(balance), roleHashes }
    } catch (err) {
      console.error('Error fetching contract state:', err)
      setError(err.message)
      return null
    }
  }, [getRoleManagerContract, getReadProvider])

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

    setIsLoading(true)
    setError(null)

    try {
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
  }, [signer, isConnected, getRoleManagerContract])

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

    setIsLoading(true)
    setError(null)

    try {
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
  }, [signer, isConnected, getRoleManagerContract])

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
  }, [getRoleManagerContract])

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
   * Get tier information for a role
   */
  const getTierInfo = useCallback(async (roleHash, tier) => {
    try {
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
  }, [getRoleManagerContract])

  // Fetch contract state on mount and when account changes
  useEffect(() => {
    fetchContractState()
  }, [fetchContractState, account])

  return {
    // State
    isLoading,
    error,
    contractState,
    MEMBERSHIP_TIERS,
    TIER_NAMES,

    // Actions
    emergencyPause,
    emergencyUnpause,
    configureTier,
    grantTier,
    grantRoleOnChain,
    revokeRoleOnChain,
    hasRoleOnChain,
    withdraw,
    fetchContractState,
    getTierInfo,
    getUserMembership,

    // Contract address for reference
    roleManagerAddress: ROLE_MANAGER_ADDRESS
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
