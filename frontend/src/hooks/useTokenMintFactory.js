import { useState, useCallback, useMemo, useEffect } from 'react'
import { ethers } from 'ethers'
import { useWallet, useWeb3 } from './index'
import { TOKEN_MINT_FACTORY_ABI, TokenType } from '../abis/TokenMintFactory'
import { getContractAddress } from '../config/contracts'

// Get TokenMintFactory address from environment or centralized config
// Returns null if not deployed yet, which is handled gracefully by the hook
const TOKEN_MINT_FACTORY_ADDRESS = import.meta.env.VITE_TOKEN_MINT_FACTORY_ADDRESS ?? getContractAddress('tokenMintFactory')

/**
 * Loading states for data fetching
 */
export const LoadState = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error'
}

/**
 * useTokenMintFactory Hook
 *
 * Provides read-only access to TokenMintFactory contract data.
 * Fetches user's tokens and token info from the blockchain.
 */
export function useTokenMintFactory() {
  const { address, isConnected } = useWallet()
  const { provider, isCorrectNetwork, chainId } = useWeb3()

  // State
  const [loadState, setLoadState] = useState(LoadState.IDLE)
  const [error, setError] = useState(null)
  const [tokens, setTokens] = useState([])
  const [lastFetch, setLastFetch] = useState(null)

  // Read-only contract instance
  const contract = useMemo(() => {
    if (!provider || !TOKEN_MINT_FACTORY_ADDRESS) {
      return null
    }
    return new ethers.Contract(TOKEN_MINT_FACTORY_ADDRESS, TOKEN_MINT_FACTORY_ABI, provider)
  }, [provider])

  /**
   * Check if factory contract is available
   */
  const hasContract = useMemo(() => {
    return !!contract && !!TOKEN_MINT_FACTORY_ADDRESS
  }, [contract])

  /**
   * Fetch total token count from contract
   */
  const fetchTokenCount = useCallback(async () => {
    if (!contract) return 0

    try {
      const count = await contract.tokenCount()
      return Number(count)
    } catch (err) {
      console.error('Error fetching token count:', err)
      return 0
    }
  }, [contract])

  /**
   * Fetch token info by ID
   */
  const fetchTokenInfo = useCallback(async (tokenId) => {
    if (!contract) return null

    try {
      const info = await contract.getTokenInfo(tokenId)

      return {
        tokenId: Number(info.tokenId),
        tokenType: Number(info.tokenType),
        tokenAddress: info.tokenAddress,
        owner: info.owner,
        name: info.name,
        symbol: info.symbol,
        metadataURI: info.metadataURI,
        createdAt: Number(info.createdAt),
        listedOnETCSwap: info.listedOnETCSwap,
        isBurnable: info.isBurnable,
        isPausable: info.isPausable,
        // Derive type string for UI
        type: Number(info.tokenType) === TokenType.ERC20 ? 'ERC20' : 'ERC721'
      }
    } catch (err) {
      console.error(`Error fetching token ${tokenId}:`, err)
      return null
    }
  }, [contract])

  /**
   * Fetch all tokens owned by current user
   */
  const fetchUserTokens = useCallback(async () => {
    if (!contract || !address) {
      setTokens([])
      return []
    }

    setLoadState(LoadState.LOADING)
    setError(null)

    try {
      // Get token IDs owned by user
      const tokenIds = await contract.getOwnerTokens(address)

      if (!tokenIds || tokenIds.length === 0) {
        setTokens([])
        setLoadState(LoadState.SUCCESS)
        setLastFetch(Date.now())
        return []
      }

      // Fetch details for each token in parallel
      const tokenPromises = tokenIds.map(async (tokenId) => {
        return await fetchTokenInfo(Number(tokenId))
      })

      const tokenResults = await Promise.all(tokenPromises)

      // Filter out any failed fetches
      const validTokens = tokenResults.filter(t => t !== null)

      // Sort by creation time, newest first
      validTokens.sort((a, b) => b.createdAt - a.createdAt)

      setTokens(validTokens)
      setLoadState(LoadState.SUCCESS)
      setLastFetch(Date.now())

      return validTokens
    } catch (err) {
      console.error('Error fetching user tokens:', err)
      setError(err.message || 'Failed to fetch tokens')
      setLoadState(LoadState.ERROR)
      return []
    }
  }, [contract, address, fetchTokenInfo])

  /**
   * Fetch a specific token by its token address
   */
  const fetchTokenByAddress = useCallback(async (tokenAddress) => {
    if (!contract) return null

    try {
      const tokenId = await contract.getTokenIdByAddress(tokenAddress)
      return await fetchTokenInfo(Number(tokenId))
    } catch (err) {
      console.error(`Error fetching token by address ${tokenAddress}:`, err)
      return null
    }
  }, [contract, fetchTokenInfo])

  /**
   * Separate tokens into ERC20 and ERC721 (NFTs)
   */
  const { erc20Tokens, nftTokens } = useMemo(() => {
    const erc20 = tokens.filter(t => t.tokenType === TokenType.ERC20)
    const nfts = tokens.filter(t => t.tokenType === TokenType.ERC721)
    return { erc20Tokens: erc20, nftTokens: nfts }
  }, [tokens])

  /**
   * Get explorer URL for address or transaction
   */
  const getExplorerUrl = useCallback((hash, type = 'address') => {
    // Ethereum Classic Mainnet
    if (chainId === 61) {
      return `https://blockscout.com/etc/mainnet/${type}/${hash}`
    }
    // Mordor Testnet
    if (chainId === 63) {
      return `https://blockscout.com/etc/mordor/${type}/${hash}`
    }
    // Default fallback
    return `https://blockscout.com/etc/mainnet/${type}/${hash}`
  }, [chainId])

  /**
   * Refresh tokens - convenience method with cache check
   */
  const refreshTokens = useCallback(async (force = false) => {
    // Avoid unnecessary refetches within 30 seconds unless forced
    if (!force && lastFetch && Date.now() - lastFetch < 30000) {
      return tokens
    }
    return await fetchUserTokens()
  }, [fetchUserTokens, lastFetch, tokens])

  /**
   * Auto-fetch tokens when wallet connects
   */
  useEffect(() => {
    if (isConnected && address && hasContract) {
      fetchUserTokens()
    } else {
      setTokens([])
      setLoadState(LoadState.IDLE)
    }
    // Note: fetchUserTokens is intentionally excluded from dependencies to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, hasContract])

  return {
    // Connection state
    isConnected,
    isCorrectNetwork,
    walletAddress: address,
    factoryAddress: TOKEN_MINT_FACTORY_ADDRESS,
    hasContract,

    // Loading state
    loadState,
    isLoading: loadState === LoadState.LOADING,
    error,

    // Token data
    tokens,
    erc20Tokens,
    nftTokens,
    tokenCount: tokens.length, // Computed from tokens array

    // Actions
    fetchUserTokens,
    fetchTokenInfo,
    fetchTokenByAddress,
    fetchTokenCount,
    refreshTokens,
    getExplorerUrl
  }
}

export default useTokenMintFactory
