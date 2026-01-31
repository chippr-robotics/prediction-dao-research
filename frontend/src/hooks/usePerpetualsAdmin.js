/**
 * usePerpetualsAdmin Hook
 *
 * Provides React hook for admin operations on the Perpetual Futures system.
 * Handles:
 * - Factory state fetching (market count, creation fee)
 * - Market listing with metrics
 * - Market creation
 * - Market details fetching
 *
 * @module usePerpetualsAdmin
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { ethers } from 'ethers'
import { PERP_FACTORY_ABI } from '../abis/PerpetualFuturesFactory'
import { PERPETUAL_MARKET_ABI } from '../abis/PerpetualFuturesMarket'
import { getContractAddress } from '../config/contracts'

// Contract address from config
const PERP_FACTORY_ADDRESS = getContractAddress('perpFactory') || null

// Polling interval for state refresh (5 minutes, reduced from 30s to minimize load)
const REFRESH_INTERVAL = 300000

// Market categories
export const MarketCategory = {
  Crypto: 0,
  PredictionOutcome: 1,
  Commodity: 2,
  Index: 3,
  Custom: 4
}

// Market status
export const MarketStatus = {
  Active: 0,
  Paused: 1,
  Settled: 2
}

// Category labels for display
const CATEGORY_LABELS = {
  [MarketCategory.Crypto]: 'Crypto',
  [MarketCategory.PredictionOutcome]: 'Prediction',
  [MarketCategory.Commodity]: 'Commodity',
  [MarketCategory.Index]: 'Index',
  [MarketCategory.Custom]: 'Custom'
}

// Status labels for display
const STATUS_LABELS = {
  [MarketStatus.Active]: 'Active',
  [MarketStatus.Paused]: 'Paused',
  [MarketStatus.Settled]: 'Settled'
}

/**
 * Hook for admin operations on Perpetual Futures
 * @param {Object} options
 * @param {Object} options.signer - ethers signer for write operations
 * @param {Object} options.provider - ethers provider for read operations
 * @param {string} options.account - Connected account address
 * @returns {Object} Factory state and admin functions
 */
export function usePerpetualsAdmin({ signer, provider } = {}) {
  // State
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [factoryState, setFactoryState] = useState({
    marketCount: 0,
    creationFee: '0',
    isDeployed: false
  })
  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)

  // Check if factory is available
  const isFactoryAvailable = !!PERP_FACTORY_ADDRESS

  // Get factory contract instance
  const getFactoryContract = useCallback((useSigner = false) => {
    if (!PERP_FACTORY_ADDRESS) return null

    const signerOrProvider = useSigner && signer ? signer : provider
    if (!signerOrProvider) return null

    return new ethers.Contract(
      PERP_FACTORY_ADDRESS,
      PERP_FACTORY_ABI,
      signerOrProvider
    )
  }, [signer, provider])

  // Get market contract instance
  const getMarketContract = useCallback((marketAddress, useSigner = false) => {
    if (!marketAddress) return null

    const signerOrProvider = useSigner && signer ? signer : provider
    if (!signerOrProvider) return null

    return new ethers.Contract(
      marketAddress,
      PERPETUAL_MARKET_ABI,
      signerOrProvider
    )
  }, [signer, provider])

  // Read-only factory contract
  const readFactory = useMemo(() => getFactoryContract(false), [getFactoryContract])

  // Write factory contract
  const writeFactory = useMemo(() => getFactoryContract(true), [getFactoryContract])

  // ========== Utility Functions ==========

  /**
   * Format category enum to label
   */
  const formatMarketCategory = useCallback((category) => {
    return CATEGORY_LABELS[category] || 'Unknown'
  }, [])

  /**
   * Format status enum to label
   */
  const formatMarketStatus = useCallback((status) => {
    return STATUS_LABELS[status] || 'Unknown'
  }, [])

  /**
   * Get health indicator based on metrics
   */
  const getHealthIndicator = useCallback((metrics) => {
    if (!metrics) return 'unknown'

    // Check open interest balance
    const longSize = parseFloat(ethers.formatEther(metrics.totalLongSize || '0'))
    const shortSize = parseFloat(ethers.formatEther(metrics.totalShortSize || '0'))
    const imbalance = Math.abs(longSize - shortSize) / Math.max(longSize + shortSize, 1)

    // Check funding rate
    const fundingRate = Math.abs(parseFloat(metrics.currentFundingRate || '0'))

    if (imbalance > 0.8 || fundingRate > 0.05) return 'critical'
    if (imbalance > 0.5 || fundingRate > 0.02) return 'warning'
    return 'healthy'
  }, [])

  // ========== Fetch Functions ==========

  /**
   * Fetch factory state (market count, creation fee)
   */
  const fetchFactoryState = useCallback(async () => {
    if (!readFactory) {
      setFactoryState(prev => ({ ...prev, isDeployed: false }))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [marketCount, creationFee] = await Promise.all([
        readFactory.marketCount(),
        readFactory.creationFee()
      ])

      setFactoryState({
        marketCount: Number(marketCount),
        creationFee: ethers.formatEther(creationFee),
        isDeployed: true
      })
    } catch (err) {
      console.error('Error fetching factory state:', err)
      setError(err.message)
      setFactoryState(prev => ({ ...prev, isDeployed: false }))
    } finally {
      setIsLoading(false)
    }
  }, [readFactory])

  /**
   * Fetch all markets with basic info
   */
  const fetchAllMarkets = useCallback(async () => {
    if (!readFactory) return []

    setIsLoading(true)
    setError(null)

    try {
      const allMarkets = []
      let offset = 0
      const limit = 20
      let hasMore = true

      // Fetch markets with pagination
      while (hasMore) {
        const result = await readFactory.getActiveMarkets(offset, limit)
        const marketIds = result.marketIds || result[0]
        hasMore = result.hasMore || result[1]

        // Fetch details for each market
        for (const marketId of marketIds) {
          try {
            const marketData = await readFactory.getMarket(marketId)

            // Parse market tuple
            const market = {
              id: Number(marketData.marketId || marketData[0]),
              address: marketData.marketAddress || marketData[1],
              name: marketData.name || marketData[2],
              underlyingAsset: marketData.underlyingAsset || marketData[3],
              collateralToken: marketData.collateralToken || marketData[4],
              category: Number(marketData.category || marketData[5]),
              createdAt: new Date(Number(marketData.createdAt || marketData[6]) * 1000),
              creator: marketData.creator || marketData[7],
              active: marketData.active ?? marketData[8] ?? true,
              linkedConditionalMarketId: Number(marketData.linkedConditionalMarketId || marketData[9] || 0)
            }

            // Fetch additional data from market contract
            const marketContract = getMarketContract(market.address, false)
            if (marketContract) {
              try {
                const [paused, metrics] = await Promise.all([
                  marketContract.paused(),
                  marketContract.getMetrics()
                ])

                market.paused = paused
                market.metrics = {
                  totalLongPositions: Number(metrics.totalLongPositions || metrics[0] || 0),
                  totalShortPositions: Number(metrics.totalShortPositions || metrics[1] || 0),
                  totalLongSize: (metrics.totalLongSize || metrics[2] || '0').toString(),
                  totalShortSize: (metrics.totalShortSize || metrics[3] || '0').toString(),
                  openInterest: (metrics.openInterest || metrics[4] || '0').toString(),
                  netFunding: (metrics.netFunding || metrics[5] || '0').toString(),
                  totalVolume: (metrics.totalVolume || metrics[6] || '0').toString(),
                  lastFundingTime: Number(metrics.lastFundingTime || metrics[7] || 0),
                  currentFundingRate: (metrics.currentFundingRate || metrics[8] || '0').toString()
                }
              } catch (metricsErr) {
                console.warn(`Failed to fetch metrics for market ${market.id}:`, metricsErr.message)
                market.paused = false
                market.metrics = null
              }
            }

            allMarkets.push(market)
          } catch (marketErr) {
            console.warn(`Failed to fetch market ${marketId}:`, marketErr.message)
          }
        }

        offset += limit
      }

      setMarkets(allMarkets)
      return allMarkets
    } catch (err) {
      console.error('Error fetching markets:', err)
      setError(err.message)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [readFactory, getMarketContract])

  /**
   * Fetch detailed info for a specific market
   */
  const fetchMarketDetails = useCallback(async (marketId) => {
    if (!readFactory) return null

    setIsLoading(true)
    setError(null)

    try {
      const marketData = await readFactory.getMarket(marketId)

      const market = {
        id: Number(marketData.marketId || marketData[0]),
        address: marketData.marketAddress || marketData[1],
        name: marketData.name || marketData[2],
        underlyingAsset: marketData.underlyingAsset || marketData[3],
        collateralToken: marketData.collateralToken || marketData[4],
        category: Number(marketData.category || marketData[5]),
        createdAt: new Date(Number(marketData.createdAt || marketData[6]) * 1000),
        creator: marketData.creator || marketData[7],
        active: marketData.active ?? marketData[8] ?? true,
        linkedConditionalMarketId: Number(marketData.linkedConditionalMarketId || marketData[9] || 0)
      }

      // Fetch from market contract
      const marketContract = getMarketContract(market.address, false)
      if (marketContract) {
        const [indexPrice, markPrice, paused, positionCount, insuranceFund, metrics, config] = await Promise.all([
          marketContract.indexPrice(),
          marketContract.markPrice(),
          marketContract.paused(),
          marketContract.positionCount(),
          marketContract.insuranceFund(),
          marketContract.getMetrics(),
          marketContract.getConfig()
        ])

        market.indexPrice = ethers.formatEther(indexPrice)
        market.markPrice = ethers.formatEther(markPrice)
        market.paused = paused
        market.positionCount = Number(positionCount)
        market.insuranceFund = ethers.formatEther(insuranceFund)

        market.metrics = {
          totalLongPositions: Number(metrics.totalLongPositions || metrics[0] || 0),
          totalShortPositions: Number(metrics.totalShortPositions || metrics[1] || 0),
          totalLongSize: ethers.formatEther(metrics.totalLongSize || metrics[2] || '0'),
          totalShortSize: ethers.formatEther(metrics.totalShortSize || metrics[3] || '0'),
          openInterest: ethers.formatEther(metrics.openInterest || metrics[4] || '0'),
          netFunding: ethers.formatEther(metrics.netFunding || metrics[5] || '0'),
          totalVolume: ethers.formatEther(metrics.totalVolume || metrics[6] || '0'),
          lastFundingTime: Number(metrics.lastFundingTime || metrics[7] || 0),
          currentFundingRate: Number(metrics.currentFundingRate || metrics[8] || 0) / 1e18
        }

        market.config = {
          maxLeverage: Number(config.maxLeverage || config[0] || 20),
          initialMarginRate: Number(config.initialMarginRate || config[1] || 500) / 100,
          maintenanceMarginRate: Number(config.maintenanceMarginRate || config[2] || 250) / 100,
          liquidationFeeRate: Number(config.liquidationFeeRate || config[3] || 50) / 100,
          tradingFeeRate: Number(config.tradingFeeRate || config[4] || 10) / 100,
          fundingInterval: Number(config.fundingInterval || config[5] || 28800),
          maxFundingRate: Number(config.maxFundingRate || config[6] || 10) / 100
        }
      }

      setSelectedMarket(market)
      return market
    } catch (err) {
      console.error('Error fetching market details:', err)
      setError(err.message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [readFactory, getMarketContract])

  /**
   * Create a new perpetual market
   */
  const createMarket = useCallback(async (params) => {
    if (!writeFactory) {
      throw new Error('Wallet not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      // Prepare config struct
      const config = {
        maxLeverage: params.maxLeverage || 20,
        initialMarginRate: Math.floor((params.initialMarginRate || 5) * 100),
        maintenanceMarginRate: Math.floor((params.maintenanceMarginRate || 2.5) * 100),
        liquidationFeeRate: Math.floor((params.liquidationFeeRate || 0.5) * 100),
        tradingFeeRate: Math.floor((params.tradingFeeRate || 0.1) * 100),
        fundingInterval: params.fundingInterval || 28800,
        maxFundingRate: Math.floor((params.maxFundingRate || 0.1) * 100)
      }

      // Prepare market params
      const marketParams = {
        name: params.name,
        underlyingAsset: params.underlyingAsset,
        collateralToken: params.collateralToken,
        category: params.category || MarketCategory.Crypto,
        initialIndexPrice: ethers.parseEther(params.initialIndexPrice.toString()),
        initialMarkPrice: ethers.parseEther((params.initialMarkPrice || params.initialIndexPrice).toString()),
        linkedConditionalMarketId: params.linkedConditionalMarketId || 0,
        config
      }

      // Get creation fee
      const creationFee = await readFactory.creationFee()

      // Send transaction
      const tx = await writeFactory.createMarket(marketParams, { value: creationFee })
      const receipt = await tx.wait()

      // Parse event for new market ID
      const event = receipt.logs.find(log => {
        try {
          const parsed = writeFactory.interface.parseLog(log)
          return parsed?.name === 'MarketCreated'
        } catch {
          return false
        }
      })

      let marketId, marketAddress
      if (event) {
        const parsed = writeFactory.interface.parseLog(event)
        marketId = Number(parsed.args.marketId)
        marketAddress = parsed.args.marketAddress
      }

      // Refresh markets list
      await fetchAllMarkets()

      return { marketId, marketAddress, receipt }
    } catch (err) {
      console.error('Error creating market:', err)
      setError(err.reason || err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeFactory, readFactory, fetchAllMarkets])

  // ========== Effects ==========

  // Initial fetch on mount
  useEffect(() => {
    if (isFactoryAvailable && provider) {
      fetchFactoryState()
    }
  }, [isFactoryAvailable, provider, fetchFactoryState])

  // Periodic refresh
  useEffect(() => {
    if (!isFactoryAvailable || !provider) return

    const interval = setInterval(() => {
      fetchFactoryState()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [isFactoryAvailable, provider, fetchFactoryState])

  return {
    // State
    isLoading,
    error,
    factoryState,
    markets,
    selectedMarket,

    // Factory info
    marketCount: factoryState.marketCount,
    creationFee: factoryState.creationFee,
    isFactoryAvailable,
    isFactoryDeployed: factoryState.isDeployed,

    // Actions
    fetchFactoryState,
    fetchAllMarkets,
    fetchMarketDetails,
    createMarket,
    setSelectedMarket,

    // Utilities
    formatMarketCategory,
    formatMarketStatus,
    getHealthIndicator,

    // Constants
    MarketCategory,
    MarketStatus,
    PERP_FACTORY_ADDRESS
  }
}

export default usePerpetualsAdmin
