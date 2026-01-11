import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useWeb3, useWallet } from './index'

// Contract ABIs (simplified for essential functions)
const PERPETUAL_MARKET_ABI = [
  // View functions
  'function marketId() view returns (uint256)',
  'function marketName() view returns (string)',
  'function underlyingAsset() view returns (string)',
  'function indexPrice() view returns (uint256)',
  'function markPrice() view returns (uint256)',
  'function status() view returns (uint8)',
  'function paused() view returns (bool)',
  'function positionCount() view returns (uint256)',
  'function insuranceFund() view returns (uint256)',
  'function getPosition(uint256 positionId) view returns (tuple(address trader, uint8 side, uint256 size, uint256 collateral, uint256 entryPrice, uint256 leverage, int256 unrealizedPnL, int256 accumulatedFunding, uint256 lastFundingTime, uint256 openedAt, bool isOpen))',
  'function getTraderPositions(address trader) view returns (uint256[])',
  'function getUnrealizedPnL(uint256 positionId) view returns (int256)',
  'function isLiquidatable(uint256 positionId) view returns (bool)',
  'function getLiquidationPrice(uint256 positionId) view returns (uint256)',
  'function getCurrentFundingRate() view returns (int256)',
  'function getMetrics() view returns (tuple(uint256 totalLongPositions, uint256 totalShortPositions, uint256 totalLongSize, uint256 totalShortSize, uint256 openInterest, int256 netFunding, uint256 totalVolume, uint256 lastFundingTime, int256 currentFundingRate))',
  'function getConfig() view returns (tuple(uint256 maxLeverage, uint256 initialMarginRate, uint256 maintenanceMarginRate, uint256 liquidationFeeRate, uint256 tradingFeeRate, uint256 fundingInterval, uint256 maxFundingRate))',

  // Write functions
  'function openPosition(uint8 side, uint256 size, uint256 collateralAmount, uint256 leverage) returns (uint256)',
  'function closePosition(uint256 positionId)',
  'function addCollateral(uint256 positionId, uint256 amount)',
  'function removeCollateral(uint256 positionId, uint256 amount)',
  'function liquidatePosition(uint256 positionId)',

  // Events
  'event PositionOpened(uint256 indexed positionId, address indexed trader, uint8 side, uint256 size, uint256 collateral, uint256 leverage, uint256 entryPrice, uint256 timestamp)',
  'event PositionClosed(uint256 indexed positionId, address indexed trader, uint256 exitPrice, int256 realizedPnL, uint256 fee, uint256 timestamp)',
  'event PositionLiquidated(uint256 indexed positionId, address indexed trader, address indexed liquidator, uint256 liquidationPrice, uint256 liquidationFee, uint256 timestamp)'
]

const PERP_FACTORY_ABI = [
  'function marketCount() view returns (uint256)',
  'function creationFee() view returns (uint256)',
  'function getMarket(uint256 marketId) view returns (tuple(uint256 marketId, address marketAddress, string name, string underlyingAsset, address collateralToken, uint8 category, uint256 createdAt, address creator, bool active, uint256 linkedConditionalMarketId))',
  'function getActiveMarkets(uint256 offset, uint256 limit) view returns (uint256[] marketIds, bool hasMore)',
  'function getMarketsByCategory(uint8 category) view returns (uint256[])',
  'function getMarketsByAsset(string asset) view returns (uint256[])',
  'function isMarketActive(uint256 marketId) view returns (bool)',
  'function createMarket(tuple(string name, string underlyingAsset, address collateralToken, uint8 category, uint256 initialIndexPrice, uint256 initialMarkPrice, uint256 linkedConditionalMarketId, tuple(uint256 maxLeverage, uint256 initialMarginRate, uint256 maintenanceMarginRate, uint256 liquidationFeeRate, uint256 tradingFeeRate, uint256 fundingInterval, uint256 maxFundingRate) config) params) payable returns (uint256 marketId, address marketAddress)',
  'event MarketCreated(uint256 indexed marketId, address indexed marketAddress, string name, string underlyingAsset, uint8 category, address collateralToken, address indexed creator, uint256 timestamp)'
]

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]

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
  const { signer, provider, isCorrectNetwork } = useWeb3()
  const { account, isConnected } = useWallet()

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

  // Factory contract with signer for write operations
  const factoryContractWithSigner = useMemo(() => {
    if (!signer || !factoryAddress) return null
    return new ethers.Contract(factoryAddress, PERP_FACTORY_ABI, signer)
  }, [signer, factoryAddress])

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

    // Parse amounts
    const sizeWei = ethers.parseEther(size.toString())
    const collateralWei = ethers.parseEther(collateralAmount.toString())
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

    const amountWei = ethers.parseEther(amount.toString())

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
    positionId,
    amount
  ) => {
    if (!signer || !isConnected || !isCorrectNetwork) {
      throw new Error('Wallet not connected or wrong network')
    }

    const marketContract = getMarketContract(marketAddress, true)
    if (!marketContract) {
      throw new Error('Failed to initialize market contract')
    }

    const amountWei = ethers.parseEther(amount.toString())
    const tx = await marketContract.removeCollateral(positionId, amountWei)
    await tx.wait()
    return true
  }, [signer, isConnected, isCorrectNetwork, getMarketContract])

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
