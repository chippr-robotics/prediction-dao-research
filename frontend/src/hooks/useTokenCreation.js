import { useState, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useWallet, useWeb3 } from './index'
import { TOKEN_MINT_FACTORY_ABI } from '../abis/TokenMintFactory'
import { getContractAddress } from '../config/contracts'

// Get TokenMintFactory address from environment or centralized config
// Returns null if not deployed yet, which is handled gracefully by the hook
const TOKEN_MINT_FACTORY_ADDRESS = import.meta.env.VITE_TOKEN_MINT_FACTORY_ADDRESS ?? getContractAddress('tokenMintFactory')

/**
 * Transaction states for UI feedback
 */
export const TxState = {
  IDLE: 'idle',
  ESTIMATING: 'estimating',
  PENDING_SIGNATURE: 'pending_signature',
  PENDING_CONFIRMATION: 'pending_confirmation',
  SUCCESS: 'success',
  ERROR: 'error'
}

/**
 * useTokenCreation Hook
 *
 * Provides web3 integration for token creation via TokenMintFactory contract.
 * Handles gas estimation, transaction states, and error handling.
 */
export function useTokenCreation() {
  const { address, isConnected } = useWallet()
  const { signer, provider, isCorrectNetwork, chainId } = useWeb3()

  // Transaction state
  const [txState, setTxState] = useState(TxState.IDLE)
  const [txHash, setTxHash] = useState(null)
  const [txError, setTxError] = useState(null)
  const [createdToken, setCreatedToken] = useState(null)

  // Gas estimation state
  const [estimatedGas, setEstimatedGas] = useState(null)
  const [gasPrice, setGasPrice] = useState(null)

  // Get contract instance
  const contract = useMemo(() => {
    if (!signer || !TOKEN_MINT_FACTORY_ADDRESS) {
      return null
    }
    return new ethers.Contract(TOKEN_MINT_FACTORY_ADDRESS, TOKEN_MINT_FACTORY_ABI, signer)
  }, [signer])

  // Read-only contract for estimation
  const readContract = useMemo(() => {
    if (!provider || !TOKEN_MINT_FACTORY_ADDRESS) {
      return null
    }
    return new ethers.Contract(TOKEN_MINT_FACTORY_ADDRESS, TOKEN_MINT_FACTORY_ABI, provider)
  }, [provider])

  /**
   * Calculate total cost in ETC
   */
  const totalCostETC = useMemo(() => {
    if (!estimatedGas || !gasPrice) return null
    const cost = estimatedGas * gasPrice
    return ethers.formatEther(cost)
  }, [estimatedGas, gasPrice])

  /**
   * Reset transaction state
   */
  const resetTxState = useCallback(() => {
    setTxState(TxState.IDLE)
    setTxHash(null)
    setTxError(null)
    setCreatedToken(null)
    setEstimatedGas(null)
    setGasPrice(null)
  }, [])

  /**
   * Estimate gas for token creation
   */
  const estimateGas = useCallback(async (tokenConfig) => {
    if (!TOKEN_MINT_FACTORY_ADDRESS) {
      const error = new Error('TokenMintFactory contract is not deployed on this network. Please check network configuration.')
      setTxState(TxState.ERROR)
      setTxError(error.message)
      throw error
    }

    if (!readContract) {
      const error = new Error('Unable to connect to TokenMintFactory contract. Please check your network connection.')
      setTxState(TxState.ERROR)
      setTxError(error.message)
      throw error
    }

    if (!address) {
      const error = new Error('Please connect your wallet to estimate gas.')
      setTxState(TxState.ERROR)
      setTxError(error.message)
      throw error
    }

    setTxState(TxState.ESTIMATING)
    setTxError(null)

    try {
      let gasEstimate

      if (tokenConfig.tokenType === 'ERC20') {
        // Parse initial supply with 18 decimals
        const initialSupply = ethers.parseUnits(
          tokenConfig.initialSupply.toString(),
          tokenConfig.decimals || 18
        )

        gasEstimate = await readContract.createERC20.estimateGas(
          tokenConfig.name,
          tokenConfig.symbol,
          initialSupply,
          tokenConfig.metadataURI || '',
          tokenConfig.isBurnable || false,
          tokenConfig.isPausable || false,
          tokenConfig.listOnETCSwap || false
        )
      } else {
        // ERC721
        gasEstimate = await readContract.createERC721.estimateGas(
          tokenConfig.name,
          tokenConfig.symbol,
          tokenConfig.metadataURI || '',
          tokenConfig.isBurnable || false
        )
      }

      // Get current gas price
      const feeData = await provider.getFeeData()
      const currentGasPrice = feeData.gasPrice || feeData.maxFeePerGas

      // Add 20% buffer to gas estimate
      const bufferedGas = (gasEstimate * 120n) / 100n

      setEstimatedGas(bufferedGas)
      setGasPrice(currentGasPrice)
      setTxState(TxState.IDLE)

      return {
        gasLimit: bufferedGas,
        gasPrice: currentGasPrice,
        totalCost: ethers.formatEther(bufferedGas * currentGasPrice)
      }
    } catch (error) {
      console.error('Gas estimation failed:', error)
      setTxState(TxState.ERROR)
      setTxError(error.message || 'Failed to estimate gas')
      throw error
    }
  }, [readContract, address, provider])

  /**
   * Create a new token
   */
  const createToken = useCallback(async (tokenConfig) => {
    if (!TOKEN_MINT_FACTORY_ADDRESS) {
      const error = new Error('TokenMintFactory contract is not deployed on this network. Please check network configuration.')
      setTxState(TxState.ERROR)
      setTxError(error.message)
      throw error
    }

    if (!contract) {
      const error = new Error('Unable to connect to TokenMintFactory contract. Please check your wallet connection.')
      setTxState(TxState.ERROR)
      setTxError(error.message)
      throw error
    }

    if (!isConnected) {
      const error = new Error('Please connect your wallet to create a token.')
      setTxState(TxState.ERROR)
      setTxError(error.message)
      throw error
    }

    if (!isCorrectNetwork) {
      const error = new Error('Please switch to the correct network to create a token.')
      setTxState(TxState.ERROR)
      setTxError(error.message)
      throw error
    }

    setTxState(TxState.PENDING_SIGNATURE)
    setTxError(null)
    setTxHash(null)
    setCreatedToken(null)

    try {
      let tx

      if (tokenConfig.tokenType === 'ERC20') {
        // Parse initial supply with 18 decimals
        const initialSupply = ethers.parseUnits(
          tokenConfig.initialSupply.toString(),
          tokenConfig.decimals || 18
        )

        tx = await contract.createERC20(
          tokenConfig.name,
          tokenConfig.symbol,
          initialSupply,
          tokenConfig.metadataURI || '',
          tokenConfig.isBurnable || false,
          tokenConfig.isPausable || false,
          tokenConfig.listOnETCSwap || false,
          {
            gasLimit: estimatedGas || undefined
          }
        )
      } else {
        // ERC721
        tx = await contract.createERC721(
          tokenConfig.name,
          tokenConfig.symbol,
          tokenConfig.metadataURI || '',
          tokenConfig.isBurnable || false,
          {
            gasLimit: estimatedGas || undefined
          }
        )
      }

      setTxHash(tx.hash)
      setTxState(TxState.PENDING_CONFIRMATION)

      // Wait for confirmation
      const receipt = await tx.wait()

      // Parse the TokenCreated event to get token details
      const tokenCreatedEvent = receipt.logs
        .map(log => {
          try {
            return contract.interface.parseLog(log)
          } catch {
            return null
          }
        })
        .find(parsed => parsed?.name === 'TokenCreated')

      const tokenData = {
        tokenId: tokenCreatedEvent?.args?.tokenId?.toString(),
        tokenAddress: tokenCreatedEvent?.args?.tokenAddress,
        tokenType: tokenConfig.tokenType,
        name: tokenConfig.name,
        symbol: tokenConfig.symbol,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      }

      setCreatedToken(tokenData)
      setTxState(TxState.SUCCESS)

      return tokenData
    } catch (error) {
      console.error('Token creation failed:', error)
      setTxState(TxState.ERROR)

      // Handle user rejection
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        setTxError('Transaction was rejected')
      } else if (error.reason) {
        setTxError(error.reason)
      } else if (error.message) {
        setTxError(error.message)
      } else {
        setTxError('Failed to create token')
      }

      throw error
    }
  }, [contract, isConnected, isCorrectNetwork, estimatedGas])

  /**
   * Get explorer URL for transaction or address
   */
  const getExplorerUrl = useCallback((hash, type = 'tx') => {
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

  return {
    // Connection state
    isConnected,
    isCorrectNetwork,
    walletAddress: address,
    factoryAddress: TOKEN_MINT_FACTORY_ADDRESS,
    hasContract: !!contract,
    isContractDeployed: !!TOKEN_MINT_FACTORY_ADDRESS,

    // Transaction state
    txState,
    txHash,
    txError,
    createdToken,

    // Gas estimation
    estimatedGas: estimatedGas ? estimatedGas.toString() : null, // Return raw BigInt value as string
    gasPrice: gasPrice ? ethers.formatUnits(gasPrice, 'gwei') : null,
    totalCostETC,

    // Actions
    estimateGas,
    createToken,
    resetTxState,
    getExplorerUrl
  }
}

export default useTokenCreation
