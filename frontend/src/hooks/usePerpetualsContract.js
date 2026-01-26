import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useWallet } from './useWalletManagement'
import { PERPETUAL_MARKET_ABI } from '../abis/PerpetualFuturesMarket'
import { PERP_FACTORY_ABI } from '../abis/PerpetualFuturesFactory'
import { ERC20_ABI } from '../abis/ERC20'

// Position side enum
export const PositionSide = {
  Long: 0,
  Short: 1
}

// Market category enum
export const MarketCategory = {
  Crypto: 0,
  PredictionOutcome: 1,
  Commodity: 2,
  Index: 3,
  Custom: 4
}

// Market status enum
export const MarketStatus = {
  Active: 0,
  Paused: 1,
  Settled: 2
}

/**
 * Hook for interacting with perpetual futures contracts
 */
export function usePerpetualsContract(factoryAddress) {
  // Use unified wallet context - single source of truth for blockchain interactions
  const {
    signer,
    provider,
    isCorrectNetwork,
    account,
    isConnected
  } = useWallet()

  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Factory contract instance
  const factoryContract = useMemo(() => {
    if (!provider || !factoryAddress) return null
    return new ethers.Contract(factoryAddress, PERP_FACTORY_ABI, provider)
  }, [provider, factoryAddress])

  /**
   * Get market contract instance
   */
  const getMarketContract = useCallback((marketAddress, withSigner = false) => {
    if (!marketAddress) return null
    const signerOrProvider = withSigner && signer ? signer : provider
    if (!signerOrProvider) return null
    return new ethers.Contract(marketAddress, PERPETUAL_MARKET_ABI, signerOrProvider)
  }, [provider, signer])

  /**
   * Get ERC20 token contract instance
   */
  const getTokenContract = useCallback((tokenAddress, withSigner = false) => {
    if (!tokenAddress) return null
    const signerOrProvider = withSigner && signer ? signer : provider
    if (!signerOrProvider) return null
    return new ethers.Contract(tokenAddress, ERC20_ABI, signerOrProvider)
  }, [provider, signer])

  /**
   * Fetch all active markets
   */
  const fetchMarkets = useCallback(async () => {
    if (!factoryContract) return

    setLoading(true)
    setError(null)

    try {
      const marketCount = await factoryContract.marketCount()
      const marketsList = []

      for (let i = 0; i < marketCount; i++) {
        try {
          const marketInfo = await factoryContract.getMarket(i)
          if (marketInfo.active) {
            const marketContract = getMarketContract(marketInfo.marketAddress)
            if (marketContract) {
              const [indexPrice, markPrice, metrics, config] = await Promise.all([
                marketContract.indexPrice(),
                marketContract.markPrice(),
                marketContract.getMetrics(),
                marketContract.getConfig()
              ])

              marketsList.push({
                id: Number(marketInfo.marketId),
                address: marketInfo.marketAddress,
                name: marketInfo.name,
                underlyingAsset: marketInfo.underlyingAsset,
                collateralToken: marketInfo.collateralToken,
                category: Number(marketInfo.category),
                createdAt: new Date(Number(marketInfo.createdAt) * 1000),
                creator: marketInfo.creator,
                active: marketInfo.active,
                linkedConditionalMarketId: Number(marketInfo.linkedConditionalMarketId),
                indexPrice: ethers.formatEther(indexPrice),
                markPrice: ethers.formatEther(markPrice),
                metrics: {
                  totalLongPositions: Number(metrics.totalLongPositions),
                  totalShortPositions: Number(metrics.totalShortPositions),
                  totalLongSize: ethers.formatEther(metrics.totalLongSize),
                  totalShortSize: ethers.formatEther(metrics.totalShortSize),
                  openInterest: ethers.formatEther(metrics.openInterest),
                  currentFundingRate: Number(metrics.currentFundingRate) / 1000000 // Convert from 1e6 precision
                },
                config: {
                  maxLeverage: Number(config.maxLeverage) / 10000,
                  initialMarginRate: Number(config.initialMarginRate) / 100,
                  maintenanceMarginRate: Number(config.maintenanceMarginRate) / 100,
                  tradingFeeRate: Number(config.tradingFeeRate) / 100,
                  fundingInterval: Number(config.fundingInterval)
                }
              })
            }
          }
        } catch (err) {
          console.warn(`Error fetching market ${i}:`, err)
        }
      }

      setMarkets(marketsList)
    } catch (err) {
      console.error('Error fetching markets:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [factoryContract, getMarketContract])

  /**
   * Fetch user positions for a specific market
   */
  const fetchPositions = useCallback(async (marketAddress) => {
    if (!account || !marketAddress) return []

    try {
      const marketContract = getMarketContract(marketAddress)
      if (!marketContract) return []

      const positionIds = await marketContract.getTraderPositions(account)
      const positionsList = []

      for (const positionId of positionIds) {
        const position = await marketContract.getPosition(positionId)
        if (position.isOpen) {
          const [unrealizedPnL, liquidationPrice, isLiquidatable] = await Promise.all([
            marketContract.getUnrealizedPnL(positionId),
            marketContract.getLiquidationPrice(positionId),
            marketContract.isLiquidatable(positionId)
          ])

          positionsList.push({
            id: Number(positionId),
            trader: position.trader,
            side: Number(position.side),
            size: ethers.formatEther(position.size),
            collateral: ethers.formatEther(position.collateral),
            entryPrice: ethers.formatEther(position.entryPrice),
            leverage: Number(position.leverage) / 10000,
            unrealizedPnL: ethers.formatEther(unrealizedPnL),
            accumulatedFunding: ethers.formatEther(position.accumulatedFunding),
            openedAt: new Date(Number(position.openedAt) * 1000),
            liquidationPrice: ethers.formatEther(liquidationPrice),
            isLiquidatable
          })
        }
      }

      setPositions(positionsList)
      return positionsList
    } catch (err) {
      console.error('Error fetching positions:', err)
      return []
    }
  }, [account, getMarketContract])

  /**
   * Open a new position
   */
  const openPosition = useCallback(async (
    marketAddress,
    collateralToken,
    side,
    size,
    collateralAmount,
    leverage
  ) => {
    if (!signer || !isConnected || !isCorrectNetwork) {
      throw new Error('Wallet not connected or wrong network')
    }

    const marketContract = getMarketContract(marketAddress, true)
    const tokenContract = getTokenContract(collateralToken, true)

    if (!marketContract || !tokenContract) {
      throw new Error('Failed to initialize contracts')
    }

    // Get token decimals for correct amount parsing
    const decimals = await tokenContract.decimals()

    // Parse amounts - size uses 18 decimals (internal), collateral uses token decimals
    const sizeWei = ethers.parseEther(size.toString())
    const collateralWei = ethers.parseUnits(collateralAmount.toString(), decimals)
    const leverageScaled = Math.floor(leverage * 10000)

    // Check and approve token allowance
    const allowance = await tokenContract.allowance(account, marketAddress)
    if (allowance < collateralWei) {
      const approveTx = await tokenContract.approve(marketAddress, ethers.MaxUint256)
      await approveTx.wait()
    }

    // Open position
    const tx = await marketContract.openPosition(
      side,
      sizeWei,
      collateralWei,
      leverageScaled
    )

    const receipt = await tx.wait()

    // Parse event to get position ID
    const event = receipt.logs.find(log => {
      try {
        const parsed = marketContract.interface.parseLog(log)
        return parsed?.name === 'PositionOpened'
      } catch {
        return false
      }
    })

    if (event) {
      const parsed = marketContract.interface.parseLog(event)
      return Number(parsed.args.positionId)
    }

    return null
  }, [signer, isConnected, isCorrectNetwork, account, getMarketContract, getTokenContract])

  /**
   * Close a position
   */
  const closePosition = useCallback(async (marketAddress, positionId) => {
    if (!signer || !isConnected || !isCorrectNetwork) {
      throw new Error('Wallet not connected or wrong network')
    }

    const marketContract = getMarketContract(marketAddress, true)
    if (!marketContract) {
      throw new Error('Failed to initialize market contract')
    }

    const tx = await marketContract.closePosition(positionId)
    await tx.wait()
    return true
  }, [signer, isConnected, isCorrectNetwork, getMarketContract])

  /**
   * Add collateral to a position
   */
  const addPositionCollateral = useCallback(async (
    marketAddress,
    collateralToken,
    positionId,
    amount
  ) => {
    if (!signer || !isConnected || !isCorrectNetwork) {
      throw new Error('Wallet not connected or wrong network')
    }

    const marketContract = getMarketContract(marketAddress, true)
    const tokenContract = getTokenContract(collateralToken, true)

    if (!marketContract || !tokenContract) {
      throw new Error('Failed to initialize contracts')
    }

    // Get token decimals for correct amount parsing
    const decimals = await tokenContract.decimals()
    const amountWei = ethers.parseUnits(amount.toString(), decimals)

    // Check and approve token allowance
    const allowance = await tokenContract.allowance(account, marketAddress)
    if (allowance < amountWei) {
      const approveTx = await tokenContract.approve(marketAddress, ethers.MaxUint256)
      await approveTx.wait()
    }

    const tx = await marketContract.addCollateral(positionId, amountWei)
    await tx.wait()
    return true
  }, [signer, isConnected, isCorrectNetwork, account, getMarketContract, getTokenContract])

  /**
   * Remove collateral from a position
   */
  const removePositionCollateral = useCallback(async (
    marketAddress,
    collateralToken,
    positionId,
    amount
  ) => {
    if (!signer || !isConnected || !isCorrectNetwork) {
      throw new Error('Wallet not connected or wrong network')
    }

    const marketContract = getMarketContract(marketAddress, true)
    const tokenContract = getTokenContract(collateralToken, true)

    if (!marketContract || !tokenContract) {
      throw new Error('Failed to initialize contracts')
    }

    // Get token decimals for correct amount parsing
    const decimals = await tokenContract.decimals()
    const amountWei = ethers.parseUnits(amount.toString(), decimals)
    const tx = await marketContract.removeCollateral(positionId, amountWei)
    await tx.wait()
    return true
  }, [signer, isConnected, isCorrectNetwork, getMarketContract, getTokenContract])

  /**
   * Liquidate a position
   */
  const liquidatePosition = useCallback(async (marketAddress, positionId) => {
    if (!signer || !isConnected || !isCorrectNetwork) {
      throw new Error('Wallet not connected or wrong network')
    }

    const marketContract = getMarketContract(marketAddress, true)
    if (!marketContract) {
      throw new Error('Failed to initialize market contract')
    }

    const tx = await marketContract.liquidatePosition(positionId)
    await tx.wait()
    return true
  }, [signer, isConnected, isCorrectNetwork, getMarketContract])

  /**
   * Get token balance
   */
  const getTokenBalance = useCallback(async (tokenAddress) => {
    if (!account || !tokenAddress) return '0'

    try {
      const tokenContract = getTokenContract(tokenAddress)
      if (!tokenContract) return '0'

      const balance = await tokenContract.balanceOf(account)
      const decimals = await tokenContract.decimals()
      return ethers.formatUnits(balance, decimals)
    } catch (err) {
      console.error('Error fetching token balance:', err)
      return '0'
    }
  }, [account, getTokenContract])

  // Fetch markets on mount and when factory changes
  useEffect(() => {
    if (factoryContract) {
      fetchMarkets()
    }
  }, [factoryContract, fetchMarkets])

  // Fetch positions when selected market or account changes
  useEffect(() => {
    if (selectedMarket && account) {
      fetchPositions(selectedMarket.address)
    }
  }, [selectedMarket, account, fetchPositions])

  return {
    // State
    markets,
    selectedMarket,
    positions,
    loading,
    error,

    // Setters
    setSelectedMarket,

    // Actions
    fetchMarkets,
    fetchPositions,
    openPosition,
    closePosition,
    addPositionCollateral,
    removePositionCollateral,
    liquidatePosition,
    getTokenBalance,

    // Contract instances
    factoryContract,
    getMarketContract,
    getTokenContract
  }
}

export default usePerpetualsContract
