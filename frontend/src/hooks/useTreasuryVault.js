/**
 * useTreasuryVault Hook
 *
 * Provides React hook for interacting with the TreasuryVault smart contract.
 * Handles:
 * - Balance queries (ETH + ERC20 tokens)
 * - Withdrawal operations with spending limit awareness
 * - Authorized spender management
 * - Emergency controls
 *
 * @module useTreasuryVault
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { ethers } from 'ethers'
import { TREASURY_VAULT_ABI } from '../abis/TreasuryVault'
import { getContractAddress, DEPLOYED_CONTRACTS } from '../config/contracts'

// Contract address from contracts.js config
const TREASURY_VAULT_ADDRESS = getContractAddress('treasuryVault') || null

// Known token addresses
const FAIRWINS_TOKEN_ADDRESS = DEPLOYED_CONTRACTS.fairWinsToken

// Address(0) represents ETH in the contract
const ETH_ADDRESS = ethers.ZeroAddress

// Polling interval for state refresh (5 minutes, reduced from 30s to minimize load)
const REFRESH_INTERVAL = 300000

/**
 * Hook for interacting with TreasuryVault contract
 * @param {Object} options
 * @param {Object} options.signer - ethers signer for write operations
 * @param {Object} options.provider - ethers provider for read operations
 * @param {string} options.account - Connected account address
 * @returns {Object} Contract state and functions
 */
export function useTreasuryVault({ signer, provider, account } = {}) {
  // State
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [treasuryState, setTreasuryState] = useState({
    ethBalance: '0',
    fairWinsBalance: '0',
    isPaused: false,
    owner: null,
    guardian: null,
    isAuthorizedSpender: false,
    ethTransactionLimit: '0',
    ethRateLimitPeriod: 0,
    ethPeriodLimit: '0',
    ethRemainingAllowance: '0',
    fairWinsTransactionLimit: '0',
    fairWinsRateLimitPeriod: 0,
    fairWinsPeriodLimit: '0',
    fairWinsRemainingAllowance: '0',
    nullifierRegistry: null,
    enforceNullification: false
  })

  // Check if treasury is available
  const isTreasuryAvailable = !!TREASURY_VAULT_ADDRESS

  // Get read-only provider
  const readProvider = useMemo(() => {
    if (provider) return provider
    // Create a fallback provider if none provided
    const rpcUrl = import.meta.env.VITE_RPC_URL || 'https://rpc.mordor.etccooperative.org'
    return new ethers.JsonRpcProvider(rpcUrl)
  }, [provider])

  // Get contract instance
  const getContract = useCallback((useSigner = false) => {
    if (!TREASURY_VAULT_ADDRESS) return null

    const signerOrProvider = useSigner && signer ? signer : readProvider
    if (!signerOrProvider) return null

    return new ethers.Contract(
      TREASURY_VAULT_ADDRESS,
      TREASURY_VAULT_ABI,
      signerOrProvider
    )
  }, [signer, readProvider])

  // Read-only contract instance
  const readContract = useMemo(() => getContract(false), [getContract])

  // Write contract instance
  const writeContract = useMemo(() => getContract(true), [getContract])

  // ========== Fetch Functions ==========

  /**
   * Fetch current treasury state from contract
   */
  const fetchTreasuryState = useCallback(async () => {
    if (!readContract) return

    setIsLoading(true)
    setError(null)

    try {
      // Batch core read calls (these should always exist)
      const [
        ethBalance,
        isPaused,
        owner,
        guardian,
        ethTxLimit,
        ethRatePeriod,
        ethPeriodLimitVal,
        ethRemaining
      ] = await Promise.all([
        readContract.getETHBalance(),
        readContract.paused(),
        readContract.owner(),
        readContract.guardian(),
        readContract.transactionLimit(ETH_ADDRESS),
        readContract.rateLimitPeriod(ETH_ADDRESS),
        readContract.periodLimit(ETH_ADDRESS),
        readContract.getRemainingPeriodAllowance(ETH_ADDRESS)
      ])

      // Fetch nullifier state separately (may not exist in older contract versions)
      let nullifierReg = ethers.ZeroAddress
      let enforceNull = false
      try {
        [nullifierReg, enforceNull] = await Promise.all([
          readContract.nullifierRegistry(),
          readContract.enforceNullificationOnWithdrawals()
        ])
      } catch (nullifierErr) {
        console.warn('Nullifier functions not available (may be older contract version):', nullifierErr.message)
      }

      // Fetch FairWins token balance and limits if token exists
      let fairWinsBalance = 0n
      let fwTxLimit = 0n
      let fwRatePeriod = 0n
      let fwPeriodLimitVal = 0n
      let fwRemaining = ethers.MaxUint256

      if (FAIRWINS_TOKEN_ADDRESS) {
        try {
          [fairWinsBalance, fwTxLimit, fwRatePeriod, fwPeriodLimitVal, fwRemaining] = await Promise.all([
            readContract.getTokenBalance(FAIRWINS_TOKEN_ADDRESS),
            readContract.transactionLimit(FAIRWINS_TOKEN_ADDRESS),
            readContract.rateLimitPeriod(FAIRWINS_TOKEN_ADDRESS),
            readContract.periodLimit(FAIRWINS_TOKEN_ADDRESS),
            readContract.getRemainingPeriodAllowance(FAIRWINS_TOKEN_ADDRESS)
          ])
        } catch (err) {
          console.warn('Error fetching FairWins token state:', err)
        }
      }

      // Check if current account is authorized
      let isAuthorized = false
      if (account) {
        try {
          isAuthorized = await readContract.isAuthorizedSpender(account)
        } catch (err) {
          console.warn('Error checking spender authorization:', err)
        }
      }

      setTreasuryState({
        ethBalance: ethers.formatEther(ethBalance),
        fairWinsBalance: ethers.formatEther(fairWinsBalance),
        isPaused,
        owner,
        guardian,
        isAuthorizedSpender: isAuthorized,
        ethTransactionLimit: ethers.formatEther(ethTxLimit),
        ethRateLimitPeriod: Number(ethRatePeriod),
        ethPeriodLimit: ethers.formatEther(ethPeriodLimitVal),
        ethRemainingAllowance: ethRatePeriod > 0 ? ethers.formatEther(ethRemaining) : 'Unlimited',
        fairWinsTransactionLimit: ethers.formatEther(fwTxLimit),
        fairWinsRateLimitPeriod: Number(fwRatePeriod),
        fairWinsPeriodLimit: ethers.formatEther(fwPeriodLimitVal),
        fairWinsRemainingAllowance: fwRatePeriod > 0 ? ethers.formatEther(fwRemaining) : 'Unlimited',
        nullifierRegistry: nullifierReg === ethers.ZeroAddress ? null : nullifierReg,
        enforceNullification: enforceNull
      })
    } catch (err) {
      console.error('Error fetching treasury state:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [readContract, account])

  // ========== Write Functions ==========

  /**
   * Withdraw ETH from treasury
   * @param {string} toAddress - Recipient address
   * @param {string} amountInEth - Amount in ETH
   * @returns {Promise<Object>} Transaction result
   */
  const withdrawETH = useCallback(async (toAddress, amountInEth) => {
    if (!writeContract) throw new Error('Wallet not connected')

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = ethers.parseEther(amountInEth.toString())
      const tx = await writeContract.withdrawETH(toAddress, amountWei)
      const receipt = await tx.wait()

      await fetchTreasuryState()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error withdrawing ETH:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, fetchTreasuryState])

  /**
   * Withdraw ERC20 tokens from treasury
   * @param {string} tokenAddress - Token contract address
   * @param {string} toAddress - Recipient address
   * @param {string} amount - Amount in token units
   * @returns {Promise<Object>} Transaction result
   */
  const withdrawERC20 = useCallback(async (tokenAddress, toAddress, amount) => {
    if (!writeContract) throw new Error('Wallet not connected')

    setIsLoading(true)
    setError(null)

    try {
      const amountWei = ethers.parseEther(amount.toString())
      const tx = await writeContract.withdrawERC20(tokenAddress, toAddress, amountWei)
      const receipt = await tx.wait()

      await fetchTreasuryState()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error withdrawing ERC20:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, fetchTreasuryState])

  /**
   * Authorize a new spender
   * @param {string} spenderAddress - Address to authorize
   * @returns {Promise<Object>} Transaction result
   */
  const authorizeSpender = useCallback(async (spenderAddress) => {
    if (!writeContract) throw new Error('Wallet not connected')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.authorizeSpender(spenderAddress)
      const receipt = await tx.wait()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error authorizing spender:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract])

  /**
   * Revoke a spender's authorization
   * @param {string} spenderAddress - Address to revoke
   * @returns {Promise<Object>} Transaction result
   */
  const revokeSpender = useCallback(async (spenderAddress) => {
    if (!writeContract) throw new Error('Wallet not connected')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.revokeSpender(spenderAddress)
      const receipt = await tx.wait()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error revoking spender:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract])

  /**
   * Set transaction limit for a token
   * @param {string} tokenAddress - Token address (ethers.ZeroAddress for ETH)
   * @param {string} limitInEth - Limit amount
   * @returns {Promise<Object>} Transaction result
   */
  const setTransactionLimit = useCallback(async (tokenAddress, limitInEth) => {
    if (!writeContract) throw new Error('Wallet not connected')

    setIsLoading(true)
    setError(null)

    try {
      const limitWei = ethers.parseEther(limitInEth.toString())
      const tx = await writeContract.setTransactionLimit(tokenAddress, limitWei)
      const receipt = await tx.wait()

      await fetchTreasuryState()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error setting transaction limit:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, fetchTreasuryState])

  /**
   * Set rate limit for a token
   * @param {string} tokenAddress - Token address (ethers.ZeroAddress for ETH)
   * @param {number} periodSeconds - Time period in seconds
   * @param {string} limitInEth - Limit amount per period
   * @returns {Promise<Object>} Transaction result
   */
  const setRateLimit = useCallback(async (tokenAddress, periodSeconds, limitInEth) => {
    if (!writeContract) throw new Error('Wallet not connected')

    setIsLoading(true)
    setError(null)

    try {
      const limitWei = ethers.parseEther(limitInEth.toString())
      const tx = await writeContract.setRateLimit(tokenAddress, periodSeconds, limitWei)
      const receipt = await tx.wait()

      await fetchTreasuryState()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error setting rate limit:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, fetchTreasuryState])

  /**
   * Emergency pause the vault
   * @returns {Promise<Object>} Transaction result
   */
  const pauseVault = useCallback(async () => {
    if (!writeContract) throw new Error('Wallet not connected')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.pause()
      const receipt = await tx.wait()

      await fetchTreasuryState()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error pausing vault:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, fetchTreasuryState])

  /**
   * Unpause the vault
   * @returns {Promise<Object>} Transaction result
   */
  const unpauseVault = useCallback(async () => {
    if (!writeContract) throw new Error('Wallet not connected')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.unpause()
      const receipt = await tx.wait()

      await fetchTreasuryState()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error unpausing vault:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, fetchTreasuryState])

  /**
   * Check if an address is authorized to withdraw
   * @param {string} address - Address to check
   * @returns {Promise<boolean>}
   */
  const checkSpenderAuthorization = useCallback(async (address) => {
    if (!readContract) return false
    try {
      return await readContract.isAuthorizedSpender(address)
    } catch (err) {
      console.error('Error checking spender authorization:', err)
      return false
    }
  }, [readContract])

  // ========== Effects ==========

  // Initial fetch on mount
  useEffect(() => {
    if (readContract) {
      fetchTreasuryState()
    }
  }, [readContract, fetchTreasuryState])

  // Re-fetch when account changes
  useEffect(() => {
    if (readContract && account) {
      fetchTreasuryState()
    }
  }, [account, readContract, fetchTreasuryState])

  // Periodic refresh
  useEffect(() => {
    if (!readContract) return

    const interval = setInterval(() => {
      fetchTreasuryState()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [readContract, fetchTreasuryState])

  // ========== Return ==========

  return {
    // State
    isLoading,
    error,
    treasuryState,
    isTreasuryAvailable,

    // Computed
    canWithdraw: treasuryState.isAuthorizedSpender,
    isOwner: account && treasuryState.owner?.toLowerCase() === account?.toLowerCase(),
    isGuardian: account && treasuryState.guardian?.toLowerCase() === account?.toLowerCase(),

    // Fetch functions
    fetchTreasuryState,
    checkSpenderAuthorization,

    // Write functions - Withdrawals
    withdrawETH,
    withdrawERC20,

    // Write functions - Admin
    authorizeSpender,
    revokeSpender,
    setTransactionLimit,
    setRateLimit,

    // Write functions - Emergency
    pauseVault,
    unpauseVault,

    // Constants
    contractAddress: TREASURY_VAULT_ADDRESS,
    fairWinsTokenAddress: FAIRWINS_TOKEN_ADDRESS,
    ETH_ADDRESS
  }
}

export default useTreasuryVault
