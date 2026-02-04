/**
 * Blockchain Service
 * 
 * Handles all direct interactions with smart contracts on the blockchain.
 * Provides a clean interface for fetching data from deployed contracts.
 */

import { ethers } from 'ethers'
import { getContractAddress, NETWORK_CONFIG } from '../config/contracts'
import { MARKET_FACTORY_ABI } from '../abis/ConditionalMarketFactory'
import { PROPOSAL_REGISTRY_ABI } from '../abis/ProposalRegistry'
import { WELFARE_METRIC_REGISTRY_ABI } from '../abis/WelfareMetricRegistry'
import { ERC20_ABI } from '../abis/ERC20'
import { ZK_KEY_MANAGER_ABI } from '../abis/ZKKeyManager'
import { ETCSWAP_ADDRESSES } from '../constants/etcswap'
import { MARKET_CORRELATION_REGISTRY_ABI } from '../abis/MarketCorrelationRegistry'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../abis/FriendGroupMarketFactory'
import { MULTICALL3_ABI } from '../abis/Multicall3'
import {
  parseEncryptedIpfsReference
} from './ipfsService'
import { logger } from './logger'

// Constants for friend market detection
const FRIEND_MARKET_PROPOSAL_MIN = 1_000_000
const FRIEND_MARKET_PROPOSAL_MAX = 10_000_000_000 // 10 billion

/**
 * Check if a market is a private friend market
 * Uses multiple detection methods for backward compatibility:
 * 1. Encrypted metadata (new method)
 * 2. Market Source attribute in metadata
 * 3. ProposalId range fallback (legacy)
 *
 * @param {Object} market - Market object with metadata
 * @returns {boolean} True if this is a friend/private market
 */
export function isMarketPrivateOrFriend(market) {
  const metadata = market.metadata

  // Method 1: Check for encrypted metadata
  if (metadata?.encrypted === true) {
    return true
  }

  // Method 2: Check Market Source attribute
  const marketSourceAttr = metadata?.attributes?.find(
    attr => attr.trait_type === 'Market Source'
  )
  if (marketSourceAttr?.value === 'friend') {
    return true
  }

  // Method 3: Fallback to proposalId range (legacy markets)
  if (market.proposalId >= FRIEND_MARKET_PROPOSAL_MIN &&
      market.proposalId < FRIEND_MARKET_PROPOSAL_MAX) {
    return true
  }

  return false
}

/**
 * Get a human-readable reason why a market is considered private/friend
 * Useful for debugging
 *
 * @param {Object} market - Market object
 * @returns {string} Description of why market is private
 */
export function getMarketPrivacyReason(market) {
  const metadata = market.metadata

  if (metadata?.encrypted === true) {
    return 'encrypted metadata'
  }

  const marketSourceAttr = metadata?.attributes?.find(
    attr => attr.trait_type === 'Market Source'
  )
  if (marketSourceAttr?.value === 'friend') {
    return 'Market Source: friend'
  }

  if (market.proposalId >= FRIEND_MARKET_PROPOSAL_MIN &&
      market.proposalId < FRIEND_MARKET_PROPOSAL_MAX) {
    return `proposalId in friend range (${market.proposalId})`
  }

  return 'unknown'
}

/**
 * Check if the current user can view a market
 * For encrypted markets, checks if user is in participants list
 *
 * @param {Object} market - Market object with metadata
 * @param {string} userAddress - Current user's address (lowercase)
 * @returns {boolean} True if user can view the market
 */
export function canUserViewMarket(market, userAddress) {
  const metadata = market.metadata

  // Not encrypted - anyone can view
  if (!metadata?.encrypted) {
    return true
  }

  // Encrypted - check if user is a participant
  const normalizedAddress = userAddress?.toLowerCase()
  return metadata.participants?.includes(normalizedAddress) || false
}

/**
 * Get a provider for reading from the blockchain
 * @returns {ethers.JsonRpcProvider}
 */
export function getProvider() {
  return new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
}

/**
 * Get a contract instance
 * @param {string} contractName - Name of the contract (marketFactory, proposalRegistry, etc.)
 * @param {ethers.Signer|ethers.Provider} signerOrProvider - Signer or provider
 * @returns {ethers.Contract}
 */
export function getContract(contractName, signerOrProvider = null) {
  const provider = signerOrProvider || getProvider()
  const address = getContractAddress(contractName)
  
  let abi
  switch (contractName) {
    case 'marketFactory':
      abi = MARKET_FACTORY_ABI
      break
    case 'proposalRegistry':
      abi = PROPOSAL_REGISTRY_ABI
      break
    case 'welfareRegistry':
      abi = WELFARE_METRIC_REGISTRY_ABI
      break
    case 'marketCorrelationRegistry':
      abi = MARKET_CORRELATION_REGISTRY_ABI
      break
    default:
      throw new Error(`Unknown contract: ${contractName}`)
  }
  
  return new ethers.Contract(address, abi, provider)
}

/**
 * Get bet type labels based on betType enum
 * @param {number} betType - Bet type enum value
 * @returns {Object} Object with passLabel and failLabel
 */
function getBetTypeLabels(betType) {
  const labels = {
    0: { passLabel: 'Yes', failLabel: 'No' },
    1: { passLabel: 'Pass', failLabel: 'Fail' },
    2: { passLabel: 'Above', failLabel: 'Below' },
    3: { passLabel: 'Higher', failLabel: 'Lower' },
    4: { passLabel: 'In', failLabel: 'Out' },
    5: { passLabel: 'Over', failLabel: 'Under' },
    6: { passLabel: 'For', failLabel: 'Against' },
    7: { passLabel: 'True', failLabel: 'False' },
    8: { passLabel: 'Win', failLabel: 'Lose' },
    9: { passLabel: 'Up', failLabel: 'Down' }
  }
  return labels[betType] || labels[0]
}

/**
 * Try to fetch market metadata from IPFS
 * @param {ethers.Contract} contract - Market factory contract
 * @param {number} marketId - Market ID
 * @returns {Promise<Object|null>} Metadata or null
 */
/**
 * Get metadata URI from contract (without fetching from IPFS)
 * Returns only the URI for lazy loading later to avoid rate limiting
 * @param {ethers.Contract} contract - Market factory contract
 * @param {number} marketId - Market ID
 * @returns {Promise<string|null>} Metadata URI or null
 */
async function tryGetMarketMetadataUri(contract, marketId) {
  try {
    const metadataUri = await contract.getMarketMetadataUri(marketId)
    if (metadataUri && metadataUri.length > 0) {
      return metadataUri
    }
  } catch (error) {
    // Function may not exist or metadata not set - this is expected
    console.debug(`No metadata URI for market ${marketId}:`, error.message)
  }
  return null
}

/**
 * Fetch and resolve market metadata from IPFS
 * Called on-demand when viewing a specific market to avoid rate limiting
 * @param {string} metadataUri - IPFS URI or URL to fetch
 * @returns {Promise<Object|null>} Metadata or null
 */
export async function fetchMarketMetadataFromUri(metadataUri) {
  if (!metadataUri) return null
  try {
    const { resolveUri } = await import('./ipfsService')
    const metadata = await resolveUri(metadataUri)
    return metadata
  } catch (error) {
    console.warn(`Failed to fetch market metadata from ${metadataUri}:`, error.message)
    return null
  }
}

/**
 * Try to fetch market metadata from IPFS (for single market views)
 * Used when viewing a specific market where we want full metadata
 * @param {ethers.Contract} contract - Market factory contract
 * @param {number} marketId - Market ID
 * @returns {Promise<Object|null>} Metadata or null
 */
async function tryFetchMarketMetadata(contract, marketId) {
  const uri = await tryGetMarketMetadataUri(contract, marketId)
  if (!uri) return null
  return fetchMarketMetadataFromUri(uri)
}

/**
 * Try to get prices from contract
 * @param {ethers.Contract} contract - Market factory contract
 * @param {number} marketId - Market ID
 * @returns {Promise<Object>} Object with passPrice and failPrice
 */
async function tryGetPrices(contract, marketId) {
  try {
    const [passPrice, failPrice] = await contract.getPrices(marketId)
    // Prices returned as wei (18 decimals), convert to decimal
    return {
      passPrice: ethers.formatEther(passPrice),
      failPrice: ethers.formatEther(failPrice)
    }
  } catch (error) {
    console.debug(`Could not get prices for market ${marketId}:`, error.message)
    // Default to 50/50 if prices can't be fetched
    return { passPrice: '0.5', failPrice: '0.5' }
  }
}

/**
 * Validate if a market is valid and should be displayed
 * @param {Object} market - Raw market data from contract
 * @returns {boolean} True if market is valid
 */
function isValidMarket(market) {
  // Check if market has valid trading end time (not zero or in the past)
  if (!market.tradingEndTime || market.tradingEndTime === 0n) {
    return false
  }

  // Check if market has valid liquidity parameter
  if (!market.liquidityParameter || market.liquidityParameter === 0n) {
    return false
  }

  // Check if market has valid token addresses
  if (!market.passToken || market.passToken === ethers.ZeroAddress) {
    return false
  }

  return true
}

/**
 * Extract category from metadata attributes
 * @param {Object} metadata - IPFS metadata
 * @returns {string} Category or 'other'
 */
function extractCategory(metadata) {
  if (!metadata || !metadata.attributes) return 'other'

  const categoryAttr = metadata.attributes.find(
    attr => attr.trait_type === 'Category' || attr.trait_type === 'category'
  )

  if (categoryAttr && categoryAttr.value) {
    // Normalize category to lowercase for consistency with frontend
    return categoryAttr.value.toLowerCase()
  }

  return 'other'
}

// Cache for token decimals to avoid repeated RPC calls
const tokenDecimalsCache = new Map()

/**
 * Get token decimals for a collateral token (cached)
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<number>} Number of decimals (defaults to 18)
 */
async function getTokenDecimals(tokenAddress) {
  try {
    if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
      return 18
    }

    // Check cache first
    const normalizedAddress = tokenAddress.toLowerCase()
    if (tokenDecimalsCache.has(normalizedAddress)) {
      return tokenDecimalsCache.get(normalizedAddress)
    }

    const provider = getProvider()
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
    const decimals = await tokenContract.decimals()
    const result = Number(decimals)

    // Cache the result
    tokenDecimalsCache.set(normalizedAddress, result)
    return result
  } catch (error) {
    logger.debug(`Could not get decimals for token ${tokenAddress}:`, error.message)
    return 18 // Default to 18 decimals
  }
}

/**
 * Fetch trade statistics for a market from TokensPurchased events
 * @param {ethers.Contract} contract - Market factory contract
 * @param {number} marketId - Market ID
 * @param {number} collateralDecimals - Decimals for the collateral token
 * @returns {Promise<Object>} Trade stats (tradesCount, uniqueTraders, totalVolume)
 */
async function tryGetMarketTradeStats(contract, marketId, collateralDecimals = 6) {
  try {
    // Query TokensPurchased events for this market
    const filter = contract.filters.TokensPurchased(marketId)
    const events = await contract.queryFilter(filter, 0, 'latest')

    if (events.length === 0) {
      return {
        tradesCount: 0,
        uniqueTraders: 0,
        totalVolume: '0'
      }
    }

    // Count unique traders
    const uniqueAddresses = new Set()
    let totalVolumeWei = 0n

    for (const event of events) {
      uniqueAddresses.add(event.args.buyer.toLowerCase())
      totalVolumeWei += BigInt(event.args.collateralAmount)
    }

    return {
      tradesCount: events.length,
      uniqueTraders: uniqueAddresses.size,
      totalVolume: ethers.formatUnits(totalVolumeWei, collateralDecimals)
    }
  } catch (error) {
    console.debug(`Could not get trade stats for market ${marketId}:`, error.message)
    return {
      tradesCount: 0,
      uniqueTraders: 0,
      totalVolume: '0'
    }
  }
}

/**
 * Fetch price history for a market from TokensPurchased events
 * Returns an array of price points over time for sparkline visualization
 * @param {ethers.Contract} contract - Market factory contract
 * @param {number} marketId - Market ID
 * @param {number} currentPassPrice - Current pass token price (0-1)
 * @param {number} numPoints - Number of data points to return (default 12)
 * @returns {Promise<Array<number>>} Array of pass token prices (0-1)
 */
async function tryGetPriceHistory(contract, marketId, currentPassPrice = 0.5, numPoints = 12) {
  try {
    // Query TokensPurchased events for this market
    const filter = contract.filters.TokensPurchased(marketId)
    const events = await contract.queryFilter(filter, 0, 'latest')

    if (events.length === 0) {
      // No trades yet - return flat line at current price
      return Array(numPoints).fill(currentPassPrice)
    }

    // Get provider for block timestamps
    const provider = contract.runner?.provider || getProvider()

    // Fetch block timestamps for all events (batch for performance)
    const blockNumbers = [...new Set(events.map(e => e.blockNumber))]
    const blockPromises = blockNumbers.map(bn => provider.getBlock(bn))
    const blocks = await Promise.all(blockPromises)
    const blockTimestamps = {}
    blocks.forEach((block, i) => {
      if (block) blockTimestamps[blockNumbers[i]] = block.timestamp
    })

    // Calculate implied price for each trade
    // For LMSR markets, buying PASS tokens increases PASS price
    // The trade price approximation: collateralAmount / tokenAmount
    const tradeData = events.map(event => {
      const buyPass = event.args.buyPass
      const collateralAmount = parseFloat(ethers.formatUnits(event.args.collateralAmount, 6)) // Assuming 6 decimals
      const tokenAmount = parseFloat(ethers.formatEther(event.args.tokenAmount))
      const impliedPrice = tokenAmount > 0 ? collateralAmount / tokenAmount : 0.5
      const timestamp = blockTimestamps[event.blockNumber] || 0

      return {
        timestamp,
        buyPass,
        impliedPrice: Math.max(0.01, Math.min(0.99, impliedPrice))
      }
    }).sort((a, b) => a.timestamp - b.timestamp)

    // If we have very few trades, interpolate to fill numPoints
    if (tradeData.length < numPoints) {
      const prices = []
      // Note: Markets start at 50/50, but we interpolate from available trade data

      // Linear interpolation between trades
      for (let i = 0; i < numPoints; i++) {
        const tradeIndex = Math.floor((i / numPoints) * tradeData.length)
        if (tradeIndex < tradeData.length) {
          prices.push(tradeData[tradeIndex].impliedPrice)
        } else {
          prices.push(currentPassPrice)
        }
      }
      // Ensure last point is current price
      prices[prices.length - 1] = currentPassPrice
      return prices
    }

    // Group trades into time buckets
    const minTime = tradeData[0].timestamp
    const maxTime = tradeData[tradeData.length - 1].timestamp
    const timeRange = maxTime - minTime || 1

    const buckets = Array(numPoints).fill(null).map(() => [])

    for (const trade of tradeData) {
      const bucketIndex = Math.min(
        numPoints - 1,
        Math.floor(((trade.timestamp - minTime) / timeRange) * numPoints)
      )
      buckets[bucketIndex].push(trade.impliedPrice)
    }

    // Calculate average price for each bucket, forward-fill empty buckets
    const prices = []
    let lastPrice = 0.5 // Start at 50/50

    for (const bucket of buckets) {
      if (bucket.length > 0) {
        lastPrice = bucket.reduce((sum, p) => sum + p, 0) / bucket.length
      }
      prices.push(lastPrice)
    }

    // Ensure last point is current price
    prices[prices.length - 1] = currentPassPrice

    return prices
  } catch (error) {
    console.debug(`Could not get price history for market ${marketId}:`, error.message)
    // Return flat line at current price on error
    return Array(numPoints).fill(currentPassPrice)
  }
}

/**
 * Fetch market creation event data (creator, creation time)
 * @param {ethers.Contract} contract - Market factory contract
 * @param {number} marketId - Market ID
 * @returns {Promise<Object|null>} Event data or null
 */
async function tryGetMarketCreationEvent(contract, marketId) {
  try {
    // Query MarketCreated events for this specific market
    const filter = contract.filters.MarketCreated(marketId)
    const events = await contract.queryFilter(filter, 0, 'latest')

    if (events.length > 0) {
      const event = events[0]
      return {
        creator: event.args.creator,
        createdAt: Number(event.args.createdAt) * 1000, // Convert to milliseconds
        betType: Number(event.args.betType)
      }
    }
  } catch (error) {
    console.debug(`Could not get creation event for market ${marketId}:`, error.message)
  }
  return null
}

/**
 * Fetch a single market's full data (market struct + prices + metadata)
 * @param {ethers.Contract} contract - Market factory contract
 * @param {number} marketId - Market ID
 * @returns {Promise<Object|null>} Transformed market or null if invalid
 */
async function fetchSingleMarket(contract, marketId) {
  try {
    // Fetch market struct, prices, metadata URI, and creation event concurrently
    // NOTE: We only fetch the metadata URI here, not the actual content from IPFS
    // Metadata is loaded lazily when viewing a specific market to avoid rate limiting
    const [market, prices, metadataUri, creationEvent] = await Promise.all([
      contract.markets(marketId),
      tryGetPrices(contract, marketId),
      tryGetMarketMetadataUri(contract, marketId),
      tryGetMarketCreationEvent(contract, marketId)
    ])

    // Validate market before adding
    if (!isValidMarket(market)) {
      console.debug(`Skipping invalid market ${marketId}`)
      return null
    }

    // Get collateral token decimals for proper formatting
    const collateralDecimals = await getTokenDecimals(market.collateralToken)

    // Fetch trade statistics and price history (needs collateralDecimals for volume formatting)
    const [tradeStats, priceHistory] = await Promise.all([
      tryGetMarketTradeStats(contract, marketId, collateralDecimals),
      tryGetPriceHistory(contract, marketId, parseFloat(prices.passPrice))
    ])

    // NOTE: Metadata is NOT fetched here to avoid IPFS rate limiting
    // Use defaults and store URI for lazy loading when viewing the market
    const betTypeLabels = getBetTypeLabels(Number(market.betType || 0))

    // Build the transformed market object
    // Metadata fields (title, description, category, etc.) will be populated
    // when the market is viewed and metadata is fetched lazily
    return {
      id: marketId,
      proposalId: Number(market.proposalId || 0),
      proposalTitle: `Market #${marketId}`,
      description: '',
      category: 'other',
      subcategory: null,
      // Store URI for lazy loading
      metadataUri: metadataUri,
      needsMetadataFetch: !!metadataUri,
      passTokenPrice: prices.passPrice,
      failTokenPrice: prices.failPrice,
      // Use correct decimals for collateral token (USC = 6, not 18)
      totalLiquidity: market.totalLiquidity ? ethers.formatUnits(market.totalLiquidity, collateralDecimals) : '0',
      liquidityParameter: market.liquidityParameter ? ethers.formatUnits(market.liquidityParameter, collateralDecimals) : '0',
      collateralDecimals: collateralDecimals,
      tradingEndTime: market.tradingEndTime ? new Date(Number(market.tradingEndTime) * 1000).toISOString() : new Date().toISOString(),
      status: getMarketStatus(Number(market.status)),
      betType: Number(market.betType || 0),
      betTypeLabels: betTypeLabels,
      collateralToken: market.collateralToken,
      passToken: market.passToken,
      failToken: market.failToken,
      resolved: market.resolved,
      // Creator and creation time from event
      creator: creationEvent?.creator || null,
      creationTime: creationEvent?.createdAt ? new Date(creationEvent.createdAt).toISOString() : null,
      // Trade statistics from events
      tradesCount: tradeStats.tradesCount,
      uniqueTraders: tradeStats.uniqueTraders,
      volume24h: tradeStats.totalVolume, // Using total volume as volume24h for now
      // Price history for sparkline visualization
      priceHistory: priceHistory,
      // Additional metadata fields (populated lazily when metadata is fetched)
      image: null,
      tags: [],
      resolutionCriteria: '',
      // H3 index for weather markets (geographic location)
      h3_index: null,
      // CTF fields for trading
      useCTF: market.useCTF,
      conditionId: market.conditionId,
      passPositionId: market.passPositionId ? Number(market.passPositionId) : null,
      failPositionId: market.failPositionId ? Number(market.failPositionId) : null
    }
  } catch (error) {
    console.warn(`Failed to fetch market ${marketId}:`, error.message)
    return null
  }
}

/**
 * Try to get market's correlation group info (including category)
 * @param {number} marketId - Market ID
 * @returns {Promise<Object|null>} Correlation group info or null
 */
async function tryGetMarketCorrelationGroup(marketId) {
  try {
    const registryAddress = getContractAddress('marketCorrelationRegistry')
    if (!registryAddress || registryAddress === ethers.ZeroAddress) {
      return null
    }

    const contract = getContract('marketCorrelationRegistry')

    // Check if market is in a group
    const isInGroup = await contract.isMarketInGroup(marketId)
    if (!isInGroup) {
      return null
    }

    // Get the group ID and group details
    const groupId = await contract.getMarketGroup(marketId)
    const [group, category] = await Promise.all([
      contract.correlationGroups(groupId),
      contract.groupCategory(groupId)
    ])

    return {
      groupId: Number(groupId),
      groupName: group.name,
      groupDescription: group.description,
      category: category?.toLowerCase() || null,
      creator: group.creator,
      active: group.active
    }
  } catch (error) {
    console.debug(`Could not get correlation group for market ${marketId}:`, error.message)
    return null
  }
}

/**
 * Enrich markets with correlation group data (including categories)
 * @param {Array} markets - Array of market objects
 * @returns {Promise<Array>} Markets enriched with correlation data
 */
async function enrichMarketsWithCorrelationData(markets) {
  if (!markets || markets.length === 0) return markets

  try {
    const registryAddress = getContractAddress('marketCorrelationRegistry')
    if (!registryAddress || registryAddress === ethers.ZeroAddress) {
      console.debug('Correlation registry not deployed, skipping enrichment')
      return markets
    }

    console.log('Enriching markets with correlation group data...')

    // Fetch correlation data for all markets concurrently
    const correlationPromises = markets.map(market =>
      tryGetMarketCorrelationGroup(market.id)
    )
    const correlationResults = await Promise.all(correlationPromises)

    // Merge correlation data into markets
    return markets.map((market, index) => {
      const correlationInfo = correlationResults[index]
      if (correlationInfo) {
        // Keep original title - don't override with correlation group name
        // The correlation group info is available in correlationGroup property
        // If metadata has the actual question, it will be in proposalTitle
        // If not, keep generic "Market #X" and show correlation info separately

        return {
          ...market,
          // Use correlation group category if market category is 'other'
          category: market.category === 'other' && correlationInfo.category
            ? correlationInfo.category
            : market.category,
          correlationGroup: correlationInfo
        }
      }
      return market
    })
  } catch (error) {
    console.warn('Failed to enrich markets with correlation data:', error.message)
    return markets
  }
}

/**
 * Fetch all markets from the blockchain
 * Uses concurrent fetching for faster loading
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsFromBlockchain() {
  try {
    console.log('Fetching markets from blockchain...')
    console.log('Contract address:', getContractAddress('marketFactory'))
    console.log('RPC URL:', NETWORK_CONFIG.rpcUrl)

    const contract = getContract('marketFactory')

    // Get market count using the public variable (not a function)
    let marketCount
    try {
      marketCount = await contract.marketCount()
      console.log('Market count from blockchain:', marketCount.toString())
    } catch (countError) {
      console.warn('Failed to get marketCount:', countError.message)
      return []
    }

    if (marketCount === 0n) {
      console.log('No markets found on blockchain, returning empty array')
      return []
    }

    // Create array of market IDs to fetch
    const marketIds = Array.from({ length: Number(marketCount) }, (_, i) => i)

    // Fetch all markets concurrently
    console.log(`Fetching ${marketIds.length} markets concurrently...`)
    const startTime = Date.now()

    const marketPromises = marketIds.map(id => fetchSingleMarket(contract, id))
    const results = await Promise.all(marketPromises)

    // Filter out null results (invalid markets)
    const transformedMarkets = results.filter(market => market !== null)

    // Filter out friend markets from public grid
    // Friend markets are identified by:
    // 1. Encrypted metadata (new method) - metadata.encrypted === true
    // 2. Market Source attribute - { trait_type: 'Market Source', value: 'friend' }
    // 3. Fallback: proposalId range [1M, 10B) (legacy method)
    const publicMarkets = transformedMarkets.filter(market => {
      const isFriendMarket = isMarketPrivateOrFriend(market)
      if (isFriendMarket) {
        console.debug(`Filtering out friend market ${market.id} (${getMarketPrivacyReason(market)})`)
      }
      return !isFriendMarket
    })

    const fetchDuration = Date.now() - startTime
    console.log(`Fetched ${publicMarkets.length} public markets (filtered ${transformedMarkets.length - publicMarkets.length} friend markets) in ${fetchDuration}ms`)

    // Enrich markets with correlation group data (provides categories)
    const enrichedMarkets = await enrichMarketsWithCorrelationData(publicMarkets)

    const totalDuration = Date.now() - startTime
    console.log(`Total market fetch + enrichment: ${totalDuration}ms`)
    return enrichedMarkets
  } catch (error) {
    console.error('Error fetching markets from blockchain:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      reason: error.reason
    })
    throw error
  }
}

/**
 * Fetch markets using batched Multicall3 for core data
 * Much faster than individual fetches - 2 RPC calls instead of 2N
 *
 * @param {number[]} marketIds - Market IDs to fetch
 * @param {ethers.Contract} contract - Market factory contract
 * @returns {Promise<Array>} Array of market objects
 */
async function fetchMarketsByIdsBatched(marketIds, contract) {
  const multicall = getMulticall3Contract()
  const factoryAddress = getContractAddress('marketFactory')

  // Build calls for both markets() and getPrices() for all IDs
  const marketCalls = marketIds.map(id => ({
    target: factoryAddress,
    allowFailure: true,
    callData: contract.interface.encodeFunctionData('markets', [id])
  }))

  const priceCalls = marketIds.map(id => ({
    target: factoryAddress,
    allowFailure: true,
    callData: contract.interface.encodeFunctionData('getPrices', [id])
  }))

  // Execute both batches in parallel (2 RPC calls total)
  logger.debug(`Batching ${marketIds.length} markets() + ${marketIds.length} getPrices() calls via Multicall3`)
  const [marketResults, priceResults] = await Promise.all([
    multicall.aggregate3(marketCalls),
    multicall.aggregate3(priceCalls)
  ])

  // Build core data map
  const coreDataMap = new Map()

  for (let i = 0; i < marketIds.length; i++) {
    const marketId = marketIds[i]
    const marketResult = marketResults[i]
    const priceResult = priceResults[i]

    let market = null
    let prices = { passPrice: '0.5', failPrice: '0.5' }

    // Decode market struct
    if (marketResult.success && marketResult.returnData !== '0x') {
      try {
        const decoded = contract.interface.decodeFunctionResult('markets', marketResult.returnData)
        market = decoded[0] || decoded
      } catch (e) {
        logger.debug(`Failed to decode market ${marketId}:`, e.message)
      }
    }

    // Decode prices
    if (priceResult.success && priceResult.returnData !== '0x') {
      try {
        const decoded = contract.interface.decodeFunctionResult('getPrices', priceResult.returnData)
        prices = {
          passPrice: ethers.formatEther(decoded[0]),
          failPrice: ethers.formatEther(decoded[1])
        }
      } catch (e) {
        logger.debug(`Failed to decode prices for market ${marketId}:`, e.message)
      }
    }

    if (market) {
      coreDataMap.set(marketId, { market, prices })
    }
  }

  if (coreDataMap.size === 0) {
    throw new Error('Batch fetch returned no data')
  }

  // Get collateral token decimals (cached after first call)
  let collateralDecimals = 6 // Default for USC
  const firstMarket = coreDataMap.values().next().value
  if (firstMarket?.market?.collateralToken) {
    collateralDecimals = await getTokenDecimals(firstMarket.market.collateralToken)
  }

  // Build market objects from batched data
  const markets = []

  for (const [marketId, { market, prices }] of coreDataMap) {
    // Validate market
    if (!isValidMarket(market)) {
      continue
    }

    const betTypeLabels = getBetTypeLabels(Number(market.betType || 0))

    markets.push({
      id: marketId,
      proposalId: Number(market.proposalId || 0),
      proposalTitle: `Market #${marketId}`,
      description: '',
      category: 'other',
      subcategory: null,
      metadataUri: null, // Will be fetched lazily
      needsMetadataFetch: true,
      passTokenPrice: prices.passPrice,
      failTokenPrice: prices.failPrice,
      totalLiquidity: market.totalLiquidity ? ethers.formatUnits(market.totalLiquidity, collateralDecimals) : '0',
      liquidityParameter: market.liquidityParameter ? ethers.formatUnits(market.liquidityParameter, collateralDecimals) : '0',
      collateralDecimals: collateralDecimals,
      tradingEndTime: market.tradingEndTime ? new Date(Number(market.tradingEndTime) * 1000).toISOString() : new Date().toISOString(),
      status: getMarketStatus(Number(market.status)),
      betType: Number(market.betType || 0),
      betTypeLabels: betTypeLabels,
      collateralToken: market.collateralToken,
      passToken: market.passToken,
      failToken: market.failToken,
      resolved: market.resolved,
      creator: null, // Skip creation event fetch for speed
      creationTime: null,
      tradesCount: 0, // Skip trade stats for initial load
      uniqueTraders: 0,
      volume24h: '0',
      priceHistory: [], // Skip price history for initial load
      image: null,
      tags: [],
      resolutionCriteria: '',
      h3_index: null,
      useCTF: market.useCTF,
      conditionId: market.conditionId,
      passPositionId: market.passPositionId ? Number(market.passPositionId) : null,
      failPositionId: market.failPositionId ? Number(market.failPositionId) : null
    })
  }

  logger.debug(`Batched fetch returned ${markets.length} valid markets`)
  return markets
}

/**
 * Fetch multiple markets by their IDs
 * Uses batched Multicall3 for core data, lazy loading for metadata
 *
 * @param {number[]} marketIds - Array of market IDs to fetch
 * @param {Object} options - Options
 * @param {boolean} options.filterFriendMarkets - Filter out friend markets (default: true)
 * @param {boolean} options.useBatching - Use Multicall3 batching (default: true)
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsByIds(marketIds, { filterFriendMarkets = true, useBatching = true } = {}) {
  try {
    if (!marketIds || marketIds.length === 0) {
      return []
    }

    const contract = getContract('marketFactory')

    // Try batched approach first for better performance
    if (useBatching) {
      try {
        const markets = await fetchMarketsByIdsBatched(marketIds, contract)

        // Filter out null results and friend markets
        let filtered = markets.filter(market => market !== null)
        if (filterFriendMarkets) {
          filtered = filtered.filter(market => !isMarketPrivateOrFriend(market))
        }

        // Enrich with correlation data
        return await enrichMarketsWithCorrelationData(filtered)
      } catch (batchError) {
        logger.debug('Batch fetch failed, falling back to individual fetches:', batchError.message)
        // Fall through to individual fetch
      }
    }

    // Fallback: Fetch markets individually (original approach)
    const marketPromises = marketIds.map(id => fetchSingleMarket(contract, id))
    const results = await Promise.all(marketPromises)

    // Filter out null results (invalid markets)
    let markets = results.filter(market => market !== null)

    // Optionally filter out friend markets
    if (filterFriendMarkets) {
      markets = markets.filter(market => !isMarketPrivateOrFriend(market))
    }

    // Enrich with correlation data
    return await enrichMarketsWithCorrelationData(markets)
  } catch (error) {
    console.error('Error fetching markets by IDs:', error)
    throw error
  }
}

/**
 * Fetch a page of active markets using pagination
 * Returns market IDs in reverse order (newest first) when no index is available
 *
 * @param {Object} options - Pagination options
 * @param {number} options.offset - Starting offset (default: 0)
 * @param {number} options.limit - Number of markets to fetch (default: 20)
 * @returns {Promise<Object>} { markets: Array, hasMore: boolean, total: number }
 */
export async function fetchActiveMarketsPaginated({ offset = 0, limit = 20 } = {}) {
  try {
    const contract = getContract('marketFactory')
    const marketCount = await contract.marketCount()
    const total = Number(marketCount)

    if (total === 0) {
      return { markets: [], hasMore: false, total: 0 }
    }

    // Generate market IDs in reverse order (newest first)
    const startId = Math.max(0, total - 1 - offset)
    const endId = Math.max(0, startId - limit + 1)

    const marketIds = []
    for (let id = startId; id >= endId; id--) {
      marketIds.push(id)
    }

    // Fetch the markets
    const markets = await fetchMarketsByIds(marketIds)

    // Filter for active markets only
    const activeMarkets = markets.filter(m => m.status === 'active')

    // Note: hasMore is approximate since we don't know how many are active
    const hasMore = endId > 0

    return { markets: activeMarkets, hasMore, total }
  } catch (error) {
    console.error('Error fetching paginated markets:', error)
    throw error
  }
}

/**
 * Get total market count from the contract
 * @returns {Promise<number>} Total number of markets
 */
export async function getMarketCount() {
  const contract = getContract('marketFactory')
  const count = await contract.marketCount()
  return Number(count)
}

/**
 * Fetch markets by category from the blockchain
 * Note: The actual contract doesn't store categories - this filters all markets client-side
 * @param {string} category - Market category (currently unused as contract doesn't support categories)
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsByCategoryFromBlockchain(_category) {
  try {
    // The contract doesn't have category filtering - fetch all and filter client-side
    const allMarkets = await fetchMarketsFromBlockchain()
    // Since markets don't have categories stored on-chain, return all
    return allMarkets
  } catch (error) {
    console.error('Error fetching markets by category from blockchain:', error)
    throw error
  }
}

/**
 * Fetch a single market by ID from the blockchain
 * @param {number} id - Market ID
 * @returns {Promise<Object|null>} Market object or null
 */
export async function fetchMarketByIdFromBlockchain(id) {
  try {
    const contract = getContract('marketFactory')

    // Check if market exists by verifying id is within range
    const marketCount = await contract.marketCount()
    if (id >= Number(marketCount)) {
      return null
    }

    // Fetch market struct, prices, metadata, correlation data, and creation event concurrently
    const [market, prices, metadata, correlationInfo, creationEvent] = await Promise.all([
      contract.markets(id),
      tryGetPrices(contract, id),
      tryFetchMarketMetadata(contract, id),
      tryGetMarketCorrelationGroup(id),
      tryGetMarketCreationEvent(contract, id)
    ])

    // Validate market
    if (!isValidMarket(market)) {
      return null
    }

    // Get collateral token decimals for proper formatting
    const collateralDecimals = await getTokenDecimals(market.collateralToken)

    // Fetch trade statistics and price history (needs collateralDecimals for volume formatting)
    const [tradeStats, priceHistory] = await Promise.all([
      tryGetMarketTradeStats(contract, id, collateralDecimals),
      tryGetPriceHistory(contract, id, parseFloat(prices.passPrice))
    ])

    // Extract info from metadata or use defaults
    let category = extractCategory(metadata)
    // Use correlation group category if metadata category is 'other'
    if (category === 'other' && correlationInfo?.category) {
      category = correlationInfo.category
    }

    // Use actual title from metadata if available, otherwise generic
    // Correlation group info is available separately in correlationGroup property
    const title = metadata?.name || `Market #${id}`

    const description = metadata?.description || ''
    const betTypeLabels = getBetTypeLabels(Number(market.betType || 0))

    return {
      id: id,
      proposalId: Number(market.proposalId || 0),
      proposalTitle: title,
      description: description,
      category: category,
      subcategory: metadata?.properties?.subcategory || null,
      passTokenPrice: prices.passPrice,
      failTokenPrice: prices.failPrice,
      // Use correct decimals for collateral token (USC = 6, not 18)
      totalLiquidity: market.totalLiquidity ? ethers.formatUnits(market.totalLiquidity, collateralDecimals) : '0',
      liquidityParameter: market.liquidityParameter ? ethers.formatUnits(market.liquidityParameter, collateralDecimals) : '0',
      collateralDecimals: collateralDecimals,
      tradingEndTime: market.tradingEndTime ? new Date(Number(market.tradingEndTime) * 1000).toISOString() : new Date().toISOString(),
      status: getMarketStatus(Number(market.status)),
      betType: Number(market.betType || 0),
      betTypeLabels: betTypeLabels,
      collateralToken: market.collateralToken,
      passToken: market.passToken,
      failToken: market.failToken,
      resolved: market.resolved,
      // Creator and creation time from event
      creator: creationEvent?.creator || null,
      creationTime: creationEvent?.createdAt ? new Date(creationEvent.createdAt).toISOString() : null,
      // Trade statistics from events
      tradesCount: tradeStats.tradesCount,
      uniqueTraders: tradeStats.uniqueTraders,
      volume24h: tradeStats.totalVolume,
      // Price history for sparkline visualization
      priceHistory: priceHistory,
      // Additional metadata fields
      image: metadata?.image || null,
      tags: metadata?.properties?.tags || [],
      resolutionCriteria: metadata?.properties?.resolution_criteria || '',
      // H3 index for weather markets (geographic location)
      h3_index: metadata?.properties?.h3_index || null,
      // CTF fields for trading
      useCTF: market.useCTF,
      conditionId: market.conditionId,
      passPositionId: market.passPositionId ? Number(market.passPositionId) : null,
      failPositionId: market.failPositionId ? Number(market.failPositionId) : null,
      // Correlation group info from on-chain registry
      correlationGroup: correlationInfo
    }
  } catch (error) {
    console.error('Error fetching market by ID from blockchain:', error)
    throw error
  }
}

/**
 * Fetch all proposals from the blockchain
 * @returns {Promise<Array>} Array of proposal objects
 */
export async function fetchProposalsFromBlockchain() {
  try {
    const contract = getContract('proposalRegistry')
    const proposals = await contract.getAllProposals()
    
    return proposals.map((proposal, index) => ({
      id: Number(proposal.id || index),
      title: proposal.title || '',
      description: proposal.description || '',
      fundingAmount: proposal.fundingAmount ? ethers.formatEther(proposal.fundingAmount) : '0',
      status: getProposalStatus(Number(proposal.status)),
      proposer: proposal.proposer || ethers.ZeroAddress,
      createdAt: proposal.createdAt ? new Date(Number(proposal.createdAt) * 1000).toISOString() : new Date().toISOString()
    }))
  } catch (error) {
    console.error('Error fetching proposals from blockchain:', error)
    throw error
  }
}

/**
 * Fetch friend markets for a user from the blockchain
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<Array>} Array of friend market objects
 */
export async function fetchFriendMarketsForUser(userAddress) {
  // Skip blockchain calls in test environment
  if (import.meta.env.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') {
    return []
  }

  try {
    if (!userAddress || !ethers.isAddress(userAddress)) {
      return []
    }

    const provider = getProvider()
    const friendFactoryAddress = getContractAddress('friendGroupMarketFactory')

    if (!friendFactoryAddress) {
      console.warn('FriendGroupMarketFactory address not configured')
      return []
    }

    const contract = new ethers.Contract(
      friendFactoryAddress,
      FRIEND_GROUP_MARKET_FACTORY_ABI,
      provider
    )

    // Get market IDs for the user
    const marketIds = await contract.getUserMarkets(userAddress)
    console.log(`[fetchFriendMarketsForUser] Found ${marketIds.length} markets for ${userAddress}`)

    if (marketIds.length === 0) {
      return []
    }

    // Fetch details for each market
    const markets = await Promise.all(
      marketIds.map(async (marketId) => {
        try {
          const marketResult = await contract.getFriendMarketWithStatus(marketId)
          const acceptanceStatus = await contract.getAcceptanceStatus(marketId)

          console.log(`[fetchFriendMarketsForUser] Market ${marketId} raw data:`, {
            description: marketResult.description,
            creator: marketResult.creator,
            status: Number(marketResult.status),
            members: marketResult.members,
            acceptanceDeadline: marketResult.acceptanceDeadline?.toString(),
            tradingEndTime: marketResult.tradingEndTime?.toString(),
            stakePerParticipant: marketResult.stakePerParticipant?.toString()
          })

          // Map market type enum to string
          const marketTypes = ['oneVsOne', 'smallGroup', 'eventTracking', 'propBet']
          const statusNames = ['pending_acceptance', 'active', 'resolved', 'cancelled', 'refunded']

          // Determine token decimals first (before fetching acceptances)
          // USC has 6 decimals, most others have 18
          const stakeToken = marketResult.stakeToken
          const isUSC = stakeToken && stakeToken.toLowerCase() === ETCSWAP_ADDRESSES?.USC_STABLECOIN?.toLowerCase()
          const tokenDecimals = isUSC ? 6 : 18

          // Fetch acceptances for participants
          const acceptances = {}
          const members = marketResult.members || []

          for (const member of members) {
            try {
              const record = await contract.getParticipantAcceptance(marketId, member)
              acceptances[member.toLowerCase()] = {
                hasAccepted: record.hasAccepted,
                stakedAmount: ethers.formatUnits(record.stakedAmount, tokenDecimals),
                isArbitrator: record.isArbitrator
              }
            } catch {
              // Member not found, skip
            }
          }

          const arbitrator = marketResult.arbitrator
          const hasArbitrator = arbitrator && arbitrator !== ethers.ZeroAddress

          // Safely parse timestamps - handle 0 or invalid values
          const acceptanceDeadlineMs = Number(marketResult.acceptanceDeadline) * 1000
          const tradingEndTimeMs = Number(marketResult.tradingEndTime) * 1000

          // Create safe date strings - use fallbacks for invalid dates
          const now = new Date()
          const defaultEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days from now

          let endDateStr
          try {
            if (tradingEndTimeMs > 0) {
              const endDate = new Date(tradingEndTimeMs)
              endDateStr = !isNaN(endDate.getTime()) ? endDate.toISOString() : defaultEndDate.toISOString()
            } else {
              endDateStr = defaultEndDate.toISOString()
            }
          } catch {
            endDateStr = defaultEndDate.toISOString()
          }

          // stakeToken, isUSC, and tokenDecimals are already defined above for acceptances
          const stakeAmountFormatted = ethers.formatUnits(marketResult.stakePerParticipant, tokenDecimals)

          // Check if description contains encrypted metadata
          // Supports:
          // 1. IPFS reference: "encrypted:ipfs://..." (new, preferred) - lazy loaded
          // 2. Inline JSON envelope (legacy, for backwards compatibility)
          let description = marketResult.description
          let metadata = null
          let isEncryptedMarket = false
          let ipfsCid = null
          let needsIpfsFetch = false

          // First check for IPFS reference (new format)
          // NOTE: We do NOT fetch the envelope here to avoid rate limiting on page load.
          // The envelope will be fetched lazily when the user views the market.
          const ipfsRef = parseEncryptedIpfsReference(description)
          if (ipfsRef.isIpfs && ipfsRef.cid) {
            // Store the CID for lazy loading - the useLazyIpfsEnvelope hook will fetch it
            ipfsCid = ipfsRef.cid
            isEncryptedMarket = true
            needsIpfsFetch = true
            description = 'Encrypted Market' // Placeholder until envelope is fetched and decrypted
            console.log(`[fetchFriendMarketsForUser] Market ${marketId} has IPFS encrypted metadata, CID: ${ipfsRef.cid} (lazy load)`)
          } else {
            // Fallback: check for inline JSON envelope (legacy format)
            try {
              const parsed = JSON.parse(description)
              // Check if it matches encrypted envelope format (v1.0 or v2.0)
              const isV1Envelope = parsed?.version === '1.0' &&
                  parsed?.algorithm === 'x25519-chacha20poly1305' &&
                  parsed?.content?.ciphertext &&
                  Array.isArray(parsed?.keys)
              const isV2Envelope = parsed?.version === '2.0' &&
                  parsed?.algorithm === 'xwing-chacha20poly1305' &&
                  parsed?.content?.ciphertext &&
                  Array.isArray(parsed?.keys)

              if (isV1Envelope || isV2Envelope) {
                // This is an encrypted envelope - store in metadata for decryption hook
                metadata = parsed
                isEncryptedMarket = true
                description = 'Encrypted Market' // Placeholder until decrypted
                console.log(`[fetchFriendMarketsForUser] Market ${marketId} has inline encrypted metadata (${parsed.algorithm})`)
              }
            } catch {
              // Not JSON, keep as plain description
            }
          }

          return {
            id: marketId.toString(),
            description: description,
            metadata: metadata,
            isEncrypted: isEncryptedMarket,
            ipfsCid: ipfsCid, // CID for IPFS-stored encrypted envelopes
            needsIpfsFetch: needsIpfsFetch, // True if envelope needs to be fetched from IPFS
            creator: marketResult.creator,
            participants: members,
            arbitrator: hasArbitrator ? arbitrator : null,
            type: marketTypes[Number(marketResult.marketType)] || 'oneVsOne',
            status: statusNames[Number(marketResult.status)] || 'pending_acceptance',
            acceptanceDeadline: acceptanceDeadlineMs > 0 ? acceptanceDeadlineMs : now.getTime() + 48 * 60 * 60 * 1000,
            minAcceptanceThreshold: Number(marketResult.minThreshold) || 2,
            stakeAmount: stakeAmountFormatted,
            stakeTokenAddress: stakeToken,
            stakeTokenSymbol: isUSC ? 'USC' : 'ETC',
            acceptances,
            acceptedCount: Number(acceptanceStatus.accepted),
            endDate: endDateStr,
            createdAt: now.toISOString() // Contract doesn't store creation time
          }
        } catch (err) {
          console.error(`Error fetching market ${marketId}:`, err)
          return null
        }
      })
    )

    // Filter out null results
    return markets.filter(m => m !== null)
  } catch (error) {
    console.error('Error fetching friend markets from blockchain:', error)
    return []
  }
}

/**
 * Fetch user positions from the blockchain
 * Note: Positions are tracked in CTF1155 (ERC-1155) tokens, not in the factory contract directly.
 * This would require querying the CTF1155 contract for balance of each position token.
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<Array>} Array of position objects
 */
export async function fetchPositionsFromBlockchain(userAddress) {
  try {
    if (!userAddress || !ethers.isAddress(userAddress)) {
      return []
    }

    // The actual contract uses CTF1155 for positions, not a getUserPositions function
    // To properly implement this, we'd need to:
    // 1. Get all markets
    // 2. For each market, get the passPositionId and failPositionId
    // 3. Query CTF1155.balanceOf(userAddress, positionId) for each

    // For now, return empty as this requires CTF1155 integration
    console.log('Positions are tracked in CTF1155 - full integration pending')
    return []
  } catch (error) {
    console.error('Error fetching positions from blockchain:', error)
    return []
  }
}

/**
 * Fetch welfare metrics from the blockchain
 * @returns {Promise<Array>} Array of welfare metric objects
 */
export async function fetchWelfareMetricsFromBlockchain() {
  try {
    const contract = getContract('welfareRegistry')
    const metrics = await contract.getAllMetrics()
    
    return metrics.map((metric, index) => ({
      id: Number(metric.id || index),
      name: metric.name || '',
      description: metric.description || '',
      value: metric.value ? Number(metric.value) : 0,
      timestamp: metric.timestamp ? new Date(Number(metric.timestamp) * 1000).toISOString() : new Date().toISOString(),
      active: Boolean(metric.active)
    }))
  } catch (error) {
    console.error('Error fetching welfare metrics from blockchain:', error)
    throw error
  }
}

/**
 * Get unique categories from blockchain markets
 * @returns {Promise<Array>} Array of category strings
 */
export async function fetchCategoriesFromBlockchain() {
  try {
    const markets = await fetchMarketsFromBlockchain()
    const categories = new Set(markets.map(m => m.category).filter(Boolean))
    return Array.from(categories).sort()
  } catch (error) {
    console.error('Error fetching categories from blockchain:', error)
    throw error
  }
}

/**
 * Helper function to convert market status number to string
 * @param {number} status - Status code
 * @returns {string} Status string
 */
function getMarketStatus(status) {
  const statusMap = {
    0: 'Active',
    1: 'Closed',
    2: 'Resolved',
    3: 'Cancelled'
  }
  return statusMap[status] || 'Active'
}

/**
 * Helper function to convert proposal status number to string
 * @param {number} status - Status code
 * @returns {string} Status string
 */
function getProposalStatus(status) {
  const statusMap = {
    0: 'Reviewing',
    1: 'Active',
    2: 'Executed',
    3: 'Cancelled',
    4: 'Forfeited'
  }
  return statusMap[status] || 'Reviewing'
}

/**
 * Buy shares in a prediction market
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {number} marketId - Market ID
 * @param {boolean} outcome - true for YES/PASS, false for NO/FAIL
 * @param {string} amount - Amount in collateral tokens to spend
 * @param {Function} onProgress - Optional callback for progress updates: (step, message) => void
 *   Steps: 'checking', 'approval_needed', 'approval_pending', 'approval_confirmed', 'buy_pending', 'buy_confirmed'
 * @returns {Promise<Object>} Transaction receipt
 */
export async function buyMarketShares(signer, marketId, outcome, amount, onProgress = null) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  const reportProgress = (step, message) => {
    if (onProgress) {
      onProgress(step, message)
    }
    console.log(`[Trade Progress] ${step}: ${message}`)
  }

  try {
    reportProgress('checking', 'Checking market and token allowance...')

    const contract = getContract('marketFactory', signer)

    // Get the market to find the collateral token
    const market = await contract.markets(marketId)
    if (!market || !market.collateralToken) {
      throw new Error('Market not found or invalid')
    }

    const collateralTokenAddress = market.collateralToken
    const userAddress = await signer.getAddress()

    // Determine token decimals - USC stablecoin has 6 decimals
    const isUSC = collateralTokenAddress.toLowerCase() === ETCSWAP_ADDRESSES.USC_STABLECOIN.toLowerCase()
    const tokenDecimals = isUSC ? 6 : 18
    const amountWei = ethers.parseUnits(amount.toString(), tokenDecimals)

    // If collateral is not native ETC (zero address), we need to approve
    if (collateralTokenAddress !== ethers.ZeroAddress) {
      const collateralToken = new ethers.Contract(
        collateralTokenAddress,
        ERC20_ABI,
        signer
      )

      // Check current allowance
      const currentAllowance = await collateralToken.allowance(
        userAddress,
        getContractAddress('marketFactory')
      )

      // Approve if needed
      if (currentAllowance < amountWei) {
        reportProgress('approval_needed', 'Token approval required. Please confirm the approval transaction (1 of 2).')

        const approveTx = await collateralToken.approve(
          getContractAddress('marketFactory'),
          amountWei
        )

        reportProgress('approval_pending', 'Approval transaction submitted. Waiting for confirmation...')
        await approveTx.wait()

        reportProgress('approval_confirmed', 'Approval confirmed! Now submitting buy transaction (2 of 2).')
      } else {
        reportProgress('approval_confirmed', 'Token already approved. Submitting buy transaction...')
      }

      // Call buyTokens function (ERC20 collateral - no value sent)
      reportProgress('buy_pending', 'Please confirm the buy transaction in your wallet.')
      const tx = await contract.buyTokens(marketId, outcome, amountWei)

      reportProgress('buy_pending', 'Buy transaction submitted. Waiting for confirmation...')
      const receipt = await tx.wait()

      reportProgress('buy_confirmed', 'Transaction confirmed!')

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 1 ? 'success' : 'failed',
        gasUsed: receipt.gasUsed.toString(),
        approvalRequired: currentAllowance < amountWei
      }
    } else {
      // Native ETC collateral - send value with transaction
      reportProgress('buy_pending', 'Please confirm the transaction in your wallet.')
      const tx = await contract.buyTokens(marketId, outcome, amountWei, {
        value: amountWei
      })

      reportProgress('buy_pending', 'Transaction submitted. Waiting for confirmation...')
      const receipt = await tx.wait()

      reportProgress('buy_confirmed', 'Transaction confirmed!')

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 1 ? 'success' : 'failed',
        gasUsed: receipt.gasUsed.toString(),
        approvalRequired: false
      }
    }
  } catch (error) {
    console.error('Error buying market shares:', error)

    // Parse common error messages
    if (error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected by user')
    } else if (error.message.includes('insufficient funds')) {
      throw new Error('Insufficient funds for transaction')
    } else if (error.message.includes('insufficient balance')) {
      throw new Error('Insufficient token balance')
    } else if (error.message.includes('Market not active')) {
      throw new Error('Market is not active')
    } else if (error.message.includes('execution reverted')) {
      throw new Error('Transaction failed - market may be inactive or invalid')
    } else {
      throw new Error(error.message || 'Transaction failed')
    }
  }
}

/**
 * Estimate gas for buying shares
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {number} marketId - Market ID
 * @param {boolean} outcome - true for YES/PASS, false for NO/FAIL
 * @param {string} amount - Amount in collateral tokens to spend
 * @returns {Promise<string>} Estimated gas in native tokens
 */
export async function estimateBuyGas(signer, marketId, outcome, amount) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  try {
    const contract = getContract('marketFactory', signer)

    // Get the market to find the collateral token
    const market = await contract.markets(marketId)
    const collateralTokenAddress = market?.collateralToken

    // Determine token decimals - USC stablecoin has 6 decimals
    const isUSC = collateralTokenAddress?.toLowerCase() === ETCSWAP_ADDRESSES.USC_STABLECOIN.toLowerCase()
    const tokenDecimals = isUSC ? 6 : 18
    const amountWei = ethers.parseUnits(amount.toString(), tokenDecimals)

    let gasEstimate
    if (collateralTokenAddress && collateralTokenAddress !== ethers.ZeroAddress) {
      // ERC20 collateral - no value sent
      gasEstimate = await contract.buyTokens.estimateGas(marketId, outcome, amountWei)
    } else {
      // Native token collateral - send value
      gasEstimate = await contract.buyTokens.estimateGas(marketId, outcome, amountWei, {
        value: amountWei
      })
    }

    // Get current gas price
    const provider = signer.provider
    const feeData = await provider.getFeeData()
    const gasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei')

    // Calculate total gas cost
    const gasCost = gasEstimate * gasPrice

    return ethers.formatEther(gasCost)
  } catch (error) {
    console.error('Error estimating gas:', error)
    // Return a default estimate if estimation fails
    return '0.001'
  }
}

/**
 * Sell shares in a prediction market
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {number} marketId - Market ID
 * @param {boolean} outcome - true for YES, false for NO
 * @param {string} shares - Number of shares to sell
 * @returns {Promise<Object>} Transaction receipt
 */
export async function sellMarketShares(signer, marketId, outcome, shares) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  try {
    const contract = getContract('marketFactory', signer)
    const sharesWei = ethers.parseEther(shares.toString())

    const tx = await contract.sellTokens(marketId, outcome, sharesWei)
    const receipt = await tx.wait()

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      gasUsed: receipt.gasUsed.toString()
    }
  } catch (error) {
    console.error('Error selling market shares:', error)

    if (error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected by user')
    } else if (error.message.includes('insufficient shares')) {
      throw new Error('Insufficient shares to sell')
    } else {
      throw new Error(error.message || 'Transaction failed')
    }
  }
}

// Role name to on-chain role hash mapping
const ROLE_NAME_TO_HASH = {
  // Premium user roles
  'MARKET_MAKER': ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
  'CLEARPATH_USER': ethers.keccak256(ethers.toUtf8Bytes('CLEARPATH_USER_ROLE')),
  'TOKENMINT': ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE')),
  'FRIEND_MARKET': ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  // Admin roles
  'ADMIN': '0x0000000000000000000000000000000000000000000000000000000000000000', // DEFAULT_ADMIN_ROLE
  'OPERATIONS_ADMIN': ethers.keccak256(ethers.toUtf8Bytes('OPERATIONS_ADMIN_ROLE')),
  'EMERGENCY_GUARDIAN': ethers.keccak256(ethers.toUtf8Bytes('EMERGENCY_GUARDIAN_ROLE')),
  'CORE_SYSTEM_ADMIN': ethers.keccak256(ethers.toUtf8Bytes('CORE_SYSTEM_ADMIN_ROLE')),
  'OVERSIGHT_COMMITTEE': ethers.keccak256(ethers.toUtf8Bytes('OVERSIGHT_COMMITTEE_ROLE')),
  // Display name aliases
  'Market Maker': ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
  'ClearPath User': ethers.keccak256(ethers.toUtf8Bytes('CLEARPATH_USER_ROLE')),
  'Token Mint': ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE')),
  'Friend Market': ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  // Display names from ROLE_INFO (plural forms)
  'Friend Markets': ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE'))
}

// Minimal ABI for role manager contract
const ROLE_MANAGER_ABI = [
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "grantRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "revokeRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "hasRole",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "user", "type": "address" },
      { "internalType": "bytes32", "name": "role", "type": "bytes32" }
    ],
    "name": "isActiveMember",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Purchase role with ERC20 token - handles payment and role granting internally
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "uint8", "name": "tier", "type": "uint8" },
      { "internalType": "address", "name": "paymentToken", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "purchaseRoleWithTierToken",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Check payment manager configuration
  {
    "inputs": [],
    "name": "paymentManager",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  }
]

// Membership tier enum values - matches TieredRoleManager contract
const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
}

// Export tier names for UI display
export const TIER_NAMES = {
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum'
}

// TierRegistry ABI for checking user tiers
const TIER_REGISTRY_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "user", "type": "address" },
      { "internalType": "bytes32", "name": "role", "type": "bytes32" }
    ],
    "name": "getUserTier",
    "outputs": [{ "internalType": "enum TierRegistry.MembershipTier", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  }
]

// TieredRoleManager ABI for checking role sync status
const TIERED_ROLE_MANAGER_ABI = [
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "hasRole",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "u", "type": "address" },
      { "internalType": "bytes32", "name": "r", "type": "bytes32" }
    ],
    "name": "getUserTier",
    "outputs": [{ "internalType": "enum TieredRoleManager.MembershipTier", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "u", "type": "address" },
      { "internalType": "bytes32", "name": "r", "type": "bytes32" }
    ],
    "name": "isMembershipActive",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  }
]

/**
 * Check if user's role needs to be synced from TierRegistry to TieredRoleManager
 *
 * The modular RBAC system (TierRegistry + PaymentProcessor) and FriendGroupMarketFactory's
 * TieredRoleManager are separate systems. This function detects when a user has a role
 * in TierRegistry but NOT in TieredRoleManager, which prevents friend market creation.
 *
 * @param {string} userAddress - User's wallet address
 * @param {string} roleName - Role name to check (e.g., 'Friend Market')
 * @returns {Promise<{needsSync: boolean, tierRegistryTier: number, tieredRoleManagerTier: number, tierName: string}>}
 */
export async function checkRoleSyncNeeded(userAddress, roleName) {
  // Skip blockchain calls in test environment
  if (import.meta.env.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') {
    return { needsSync: false, tierRegistryTier: 0, tieredRoleManagerTier: 0, tierName: 'None' }
  }

  try {
    const roleHash = getRoleHash(roleName)
    if (!roleHash) {
      console.warn(`Unknown role: ${roleName}`)
      return { needsSync: false, tierRegistryTier: 0, tieredRoleManagerTier: 0, tierName: 'None' }
    }

    const provider = getProvider()
    const tierRegistryAddress = getContractAddress('tierRegistry')
    const tieredRoleManagerAddress = getContractAddress('tieredRoleManager')

    let tierRegistryTier = 0
    let tieredRoleManagerTier = 0
    let tieredRoleManagerHasRole = false

    // Check TierRegistry
    if (tierRegistryAddress) {
      try {
        const tierRegistry = new ethers.Contract(tierRegistryAddress, TIER_REGISTRY_ABI, provider)
        const tier = await tierRegistry.getUserTier(userAddress, roleHash)
        tierRegistryTier = Number(tier)
      } catch (e) {
        console.debug('[checkRoleSyncNeeded] TierRegistry check failed:', e.message)
      }
    }

    // Check TieredRoleManager
    if (tieredRoleManagerAddress) {
      try {
        const tieredRoleManager = new ethers.Contract(tieredRoleManagerAddress, TIERED_ROLE_MANAGER_ABI, provider)
        const [hasRole, tier] = await Promise.all([
          tieredRoleManager.hasRole(roleHash, userAddress),
          tieredRoleManager.getUserTier(userAddress, roleHash)
        ])
        tieredRoleManagerHasRole = hasRole
        tieredRoleManagerTier = Number(tier)
      } catch (e) {
        console.debug('[checkRoleSyncNeeded] TieredRoleManager check failed:', e.message)
      }
    }

    // Sync is needed if:
    // 1. User has tier in TierRegistry but NOT in TieredRoleManager, OR
    // 2. TieredRoleManager has a LOWER tier than TierRegistry (upgraded in TierRegistry but not synced)
    // Note: If TieredRoleManager tier is HIGHER, that's fine - user has more access than minimum required
    // Note: Tier 0 means no tier/inactive, so it's considered "lower" than any active tier
    const needsSync = tierRegistryTier > 0 && (
      !tieredRoleManagerHasRole ||
      tieredRoleManagerTier === 0 ||  // Tier 0 = no tier = needs sync
      tieredRoleManagerTier < tierRegistryTier  // Flag if TieredRoleManager has LOWER tier
    )
    const tierName = tierRegistryTier > 0 ? (TIER_NAMES[tierRegistryTier] || 'Unknown') : 'None'

    console.log(`[checkRoleSyncNeeded] ${roleName}:`, {
      userAddress,
      tierRegistryTier,
      tieredRoleManagerTier,
      tieredRoleManagerHasRole,
      needsSync,
      tierName
    })

    return {
      needsSync,
      tierRegistryTier,
      tieredRoleManagerTier,
      tierName
    }
  } catch (error) {
    console.error('Error checking role sync status:', error)
    return { needsSync: false, tierRegistryTier: 0, tieredRoleManagerTier: 0, tierName: 'None' }
  }
}

/**
 * Get user's current membership tier for a role from blockchain
 * @param {string} userAddress - User's wallet address
 * @param {string} roleName - Role name or constant
 * @returns {Promise<{tier: number, tierName: string}>} Current tier (0=None, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum)
 */
export async function getUserTierOnChain(userAddress, roleName) {
  // Skip blockchain calls in test environment
  if (import.meta.env.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') {
    return { tier: 0, tierName: 'None' }
  }

  try {
    const tierRegistryAddress = getContractAddress('tierRegistry')
    if (!tierRegistryAddress) {
      console.warn('TierRegistry not deployed - cannot check user tier')
      return { tier: 0, tierName: 'None' }
    }

    const roleHash = getRoleHash(roleName)
    if (!roleHash) {
      console.warn(`Unknown role: ${roleName}`)
      return { tier: 0, tierName: 'None' }
    }

    const provider = getProvider()
    const tierRegistry = new ethers.Contract(
      tierRegistryAddress,
      TIER_REGISTRY_ABI,
      provider
    )

    const tier = await tierRegistry.getUserTier(userAddress, roleHash)
    const tierNum = Number(tier)
    const tierName = tierNum === 0 ? 'None' : (TIER_NAMES[tierNum] || 'Unknown')

    console.log(`[getUserTierOnChain] ${roleName}: tier=${tierNum} (${tierName}) for ${userAddress}`)

    return { tier: tierNum, tierName }
  } catch (error) {
    console.error('Error getting user tier:', error)
    return { tier: 0, tierName: 'None' }
  }
}

/**
 * Get the role hash for a given role name
 * @param {string} roleName - Human readable role name or constant
 * @returns {string|null} Role hash or null if not found
 */
export function getRoleHash(roleName) {
  return ROLE_NAME_TO_HASH[roleName] || null
}

/**
 * Check if user has a role on-chain
 * Checks both the TierRegistry (modular RBAC) and RoleManager (legacy)
 * @param {string} userAddress - User's wallet address
 * @param {string} roleName - Role name or constant
 * @returns {Promise<boolean>} True if user has the role on-chain
 */
export async function hasRoleOnChain(userAddress, roleName) {
  // Skip blockchain calls in test environment
  if (import.meta.env.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') {
    return false
  }

  try {
    const roleHash = getRoleHash(roleName)
    if (!roleHash) {
      console.warn(`Unknown role: ${roleName}`)
      return false
    }

    const provider = getProvider()

    // First check TierRegistry (modular RBAC system) - tier > 0 means user has the role
    const tierRegistryAddress = getContractAddress('tierRegistry')
    if (tierRegistryAddress) {
      try {
        const tierRegistry = new ethers.Contract(
          tierRegistryAddress,
          TIER_REGISTRY_ABI,
          provider
        )
        const tier = await tierRegistry.getUserTier(userAddress, roleHash)
        const tierNum = Number(tier)
        if (tierNum > 0) {
          console.log(`[hasRoleOnChain] ${roleName}: found in TierRegistry with tier ${tierNum}`)
          return true
        }
      } catch (tierError) {
        console.debug('[hasRoleOnChain] TierRegistry check failed:', tierError.message)
      }
    }

    // Fall back to checking RoleManager (legacy/standalone system)
    const roleManagerAddress = getContractAddress('roleManager')
    if (!roleManagerAddress) {
      console.warn('Role manager not deployed - cannot check on-chain role')
      return false
    }

    const roleManagerContract = new ethers.Contract(
      roleManagerAddress,
      ROLE_MANAGER_ABI,
      provider
    )

    const hasRole = await roleManagerContract.hasRole(roleHash, userAddress)
    console.log(`[hasRoleOnChain] ${roleName}: RoleManager.hasRole = ${hasRole}`)
    return hasRole
  } catch (error) {
    console.error('Error checking on-chain role:', error)
    return false
  }
}

/**
 * Grant a role to user on-chain (admin function)
 * @param {ethers.Signer} signer - Connected wallet signer (must be admin)
 * @param {string} userAddress - Address to grant role to
 * @param {string} roleName - Role name to grant
 * @param {number} durationDays - Duration in days (0 for permanent)
 * @returns {Promise<Object>} Transaction receipt
 */
export async function grantRoleOnChain(signer, userAddress, roleName, _durationDays = 365) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  const roleManagerAddress = getContractAddress('roleManager')
  if (!roleManagerAddress) {
    throw new Error('Role manager contract not deployed. Cannot grant role on-chain.')
  }

  const roleHash = getRoleHash(roleName)
  if (!roleHash) {
    throw new Error(`Unknown role: ${roleName}`)
  }

  try {
    const roleManagerContract = new ethers.Contract(
      roleManagerAddress,
      ROLE_MANAGER_ABI,
      signer
    )

    // RoleManagerCore uses AccessControl: grantRole(role, account)
    const tx = await roleManagerContract.grantRole(roleHash, userAddress)
    const receipt = await tx.wait()

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      gasUsed: receipt.gasUsed.toString(),
      roleName,
      userAddress
    }
  } catch (error) {
    console.error('Error granting role on-chain:', error)
    throw new Error(error.message || 'Failed to grant role on-chain')
  }
}

// PaymentProcessor ABI for role purchases (modular RBAC system)
const PAYMENT_PROCESSOR_ABI = [
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "uint8", "name": "tier", "type": "uint8" },
      { "internalType": "address", "name": "paymentToken", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "purchaseTierWithToken",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paymentManager",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  }
]

/**
 * Purchase a role using USC stablecoin with tiered membership
 * This function calls the PaymentProcessor's purchaseTierWithToken function,
 * which handles both the payment and role granting in a single transaction.
 *
 * Requires modular RBAC deployment: npx hardhat run scripts/deploy-modular-rbac.js --network mordor
 *
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {string} roleName - Name of the role being purchased
 * @param {number} priceUSD - Price in USD (will be converted to USC with 6 decimals)
 * @param {number} tier - Membership tier (1=Bronze, 2=Silver, 3=Gold, 4=Platinum), defaults to Bronze
 * @returns {Promise<Object>} Transaction receipt with roleGranted status
 */
export async function purchaseRoleWithUSC(signer, roleName, priceUSD, tier = MembershipTier.BRONZE) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  try {
    const uscAddress = ETCSWAP_ADDRESSES.USC_STABLECOIN
    const paymentProcessorAddress = getContractAddress('paymentProcessor')

    if (!paymentProcessorAddress) {
      throw new Error('PaymentProcessor not deployed. Run: npx hardhat run scripts/deploy-modular-rbac.js --network mordor')
    }

    const uscContract = new ethers.Contract(uscAddress, ERC20_ABI, signer)
    const paymentProcessor = new ethers.Contract(paymentProcessorAddress, PAYMENT_PROCESSOR_ABI, signer)

    // Convert price to USC units (USC has 6 decimals like USDC)
    const amountWei = ethers.parseUnits(String(priceUSD), 6)

    // Check USC balance
    const userAddress = await signer.getAddress()
    const balanceRaw = await uscContract.balanceOf(userAddress)
    const balance = BigInt(balanceRaw.toString())
    const amount = BigInt(amountWei.toString())

    // Debug logging for balance issues
    console.log('USC Balance Check:', {
      userAddress,
      balanceWei: balance.toString(),
      balanceFormatted: ethers.formatUnits(balance, 6),
      requiredWei: amount.toString(),
      requiredFormatted: priceUSD
    })

    if (balance < amount) {
      const balanceFormatted = ethers.formatUnits(balance, 6)
      throw new Error(`Insufficient USC balance. You have ${parseFloat(balanceFormatted).toFixed(2)} USC but need ${priceUSD} USC.`)
    }

    // Get role hash
    const roleHash = getRoleHash(roleName)
    if (!roleHash) {
      throw new Error(`Unknown role: ${roleName}`)
    }

    // Check if payment manager is configured on PaymentProcessor
    let paymentManagerAddress
    try {
      paymentManagerAddress = await paymentProcessor.paymentManager()
    } catch {
      paymentManagerAddress = ethers.ZeroAddress
    }

    if (paymentManagerAddress === ethers.ZeroAddress) {
      throw new Error('MembershipPaymentManager not configured. Run: npx hardhat run scripts/deploy-modular-rbac.js --network mordor')
    }

    // Check and approve USC for the PaymentProcessor
    const allowanceRaw = await uscContract.allowance(userAddress, paymentProcessorAddress)
    const allowance = BigInt(allowanceRaw.toString())

    if (allowance < amount) {
      console.log('Approving USC for PaymentProcessor...', {
        spender: paymentProcessorAddress,
        amount: amountWei.toString(),
        amountFormatted: ethers.formatUnits(amountWei, 6) + ' USC'
      })
      try {
        // First try to estimate gas to see if the transaction would succeed
        let gasEstimate
        try {
          gasEstimate = await uscContract.approve.estimateGas(paymentProcessorAddress, amountWei)
          console.log('Gas estimate for approve:', gasEstimate.toString())
        } catch (estimateError) {
          console.warn('Gas estimation failed, using default:', estimateError.message)
          gasEstimate = 60000n // Standard approve gas
        }

        // Add 20% buffer to gas estimate
        const gasLimit = (gasEstimate * 120n) / 100n

        const approveTx = await uscContract.approve(paymentProcessorAddress, amountWei, {
          gasLimit: gasLimit
        })
        console.log('Approve transaction sent:', approveTx.hash)
        await approveTx.wait()
        console.log('USC approved successfully')
      } catch (approveError) {
        console.error('Approve failed:', approveError)
        if (approveError.code === 'ACTION_REJECTED' || approveError.code === 4001) {
          throw new Error('Transaction rejected by user')
        }
        // Check for wallet authorization errors (code 4100)
        if (approveError.code === 4100 || approveError.message?.includes('4100') || approveError.message?.includes('not been authorized')) {
          throw new Error('Wallet authorization lost. Please reconnect your wallet and try again.')
        }
        // Try to provide more helpful error message
        throw new Error(`Failed to approve USC. Please ensure you have enough ETC for gas and try again. Details: ${approveError.message || 'Unknown error'}`)
      }
    } else {
      console.log('USC already approved for PaymentProcessor, allowance:', ethers.formatUnits(allowance, 6))
    }

    // Validate tier value
    const validTier = [1, 2, 3, 4].includes(tier) ? tier : MembershipTier.BRONZE
    const tierName = TIER_NAMES[validTier] || 'Bronze'

    // Call purchaseTierWithToken on PaymentProcessor
    // This handles both payment and role granting in a single atomic transaction
    console.log('Purchasing role via PaymentProcessor...', {
      roleHash,
      tier: validTier,
      tierName,
      paymentToken: uscAddress,
      amount: amountWei.toString()
    })

    const purchaseTx = await paymentProcessor.purchaseTierWithToken(
      roleHash,
      validTier,
      uscAddress,
      amountWei
    )
    const receipt = await purchaseTx.wait()

    console.log('Role purchased successfully:', receipt)

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      gasUsed: receipt.gasUsed.toString(),
      roleName: roleName,
      tier: validTier,
      tierName: tierName,
      amount: priceUSD,
      roleGrantedOnChain: receipt.status === 1,
      roleGrantTxHash: receipt.hash
    }
  } catch (error) {
    console.error('Error purchasing role:', error)

    if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
      throw new Error('Transaction rejected by user')
    } else if (error.code === 4100 || error.message?.includes('4100') || error.message?.includes('not been authorized')) {
      throw new Error('Wallet authorization lost. Please reconnect your wallet and try again.')
    } else if (error.message?.includes('Insufficient USC balance')) {
      throw error
    } else {
      throw new Error(error.message || 'Transaction failed')
    }
  }
}

/**
 * Register a zero-knowledge public key for ClearPath governance
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {string} publicKey - Zero-knowledge public key (base64 or hex encoded)
 * @returns {Promise<Object>} Transaction receipt
 */
export async function registerZKKey(signer, publicKey) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  if (!publicKey || publicKey.trim().length === 0) {
    throw new Error('Public key is required')
  }

  try {
    // Get ZKKeyManager contract address (may not be deployed yet)
    const zkKeyManagerAddress = getContractAddress('zkKeyManager')
    
    if (!zkKeyManagerAddress) {
      throw new Error('ZKKeyManager contract not deployed yet. Please register your key later.')
    }

    const zkKeyManagerContract = new ethers.Contract(
      zkKeyManagerAddress,
      ZK_KEY_MANAGER_ABI,
      signer
    )

    // Call registerKey function
    const tx = await zkKeyManagerContract.registerKey(publicKey.trim())
    const receipt = await tx.wait()

    return {
      hash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      gasUsed: receipt.gasUsed.toString()
    }
  } catch (error) {
    console.error('Error registering ZK key:', error)

    if (error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected by user')
    } else if (error.message.includes('not deployed')) {
      throw error
    } else {
      throw new Error(error.message || 'ZK key registration failed')
    }
  }
}

// ============================================================================
// CORRELATION GROUP FUNCTIONS
// ============================================================================

/**
 * Check if the MarketCorrelationRegistry is deployed
 * @returns {boolean} True if deployed
 */
export function isCorrelationRegistryDeployed() {
  const address = getContractAddress('marketCorrelationRegistry')
  return address && address !== ethers.ZeroAddress && address !== null
}

/**
 * Get total number of correlation groups
 * @returns {Promise<number>} Group count
 */
export async function getCorrelationGroupCount() {
  if (!isCorrelationRegistryDeployed()) {
    console.warn('MarketCorrelationRegistry not deployed')
    return 0
  }

  try {
    const contract = getContract('marketCorrelationRegistry')
    const count = await contract.groupCount()
    return Number(count)
  } catch (error) {
    console.error('Error getting correlation group count:', error)
    return 0
  }
}

/**
 * Fetch all correlation groups from the blockchain
 * @returns {Promise<Array>} Array of correlation group objects
 */
export async function fetchCorrelationGroups() {
  if (!isCorrelationRegistryDeployed()) {
    console.warn('MarketCorrelationRegistry not deployed')
    return []
  }

  try {
    const contract = getContract('marketCorrelationRegistry')
    const groupCount = await contract.groupCount()
    const count = Number(groupCount)

    if (count === 0) {
      return []
    }

    const groups = []
    for (let i = 0; i < count; i++) {
      try {
        const group = await contract.correlationGroups(i)
        const category = await contract.groupCategory(i)
        const marketIds = await contract.getGroupMarkets(i)

        groups.push({
          id: i,
          name: group.name,
          description: group.description,
          creator: group.creator,
          createdAt: new Date(Number(group.createdAt) * 1000).toISOString(),
          active: group.active,
          category: category,
          marketIds: marketIds.map(id => Number(id)),
          marketCount: marketIds.length
        })
      } catch (groupError) {
        console.warn(`Failed to fetch group ${i}:`, groupError.message)
      }
    }

    return groups.filter(g => g.active) // Only return active groups
  } catch (error) {
    console.error('Error fetching correlation groups:', error)
    return []
  }
}

/**
 * Fetch correlation groups filtered by category
 * @param {string} category - Category to filter by
 * @returns {Promise<Array>} Array of correlation group objects
 */
export async function fetchCorrelationGroupsByCategory(category) {
  if (!isCorrelationRegistryDeployed()) {
    console.warn('MarketCorrelationRegistry not deployed')
    return []
  }

  try {
    const contract = getContract('marketCorrelationRegistry')
    const groupIds = await contract.getGroupsByCategory(category)

    const groups = []
    for (const id of groupIds) {
      try {
        const group = await contract.correlationGroups(id)

        if (!group.active) continue // Skip inactive groups

        const marketIds = await contract.getGroupMarkets(id)

        groups.push({
          id: Number(id),
          name: group.name,
          description: group.description,
          creator: group.creator,
          createdAt: new Date(Number(group.createdAt) * 1000).toISOString(),
          active: group.active,
          category: category,
          marketIds: marketIds.map(mid => Number(mid)),
          marketCount: marketIds.length
        })
      } catch (groupError) {
        console.warn(`Failed to fetch group ${id}:`, groupError.message)
      }
    }

    return groups
  } catch (error) {
    console.error('Error fetching correlation groups by category:', error)
    return []
  }
}

/**
 * Get the correlation group for a market
 * @param {number} marketId - Market ID
 * @returns {Promise<Object|null>} Correlation group object or null
 */
export async function getMarketCorrelationGroup(marketId) {
  if (!isCorrelationRegistryDeployed()) {
    return null
  }

  try {
    const contract = getContract('marketCorrelationRegistry')
    const groupId = await contract.getMarketGroup(marketId)

    // Check if market is in a group (returns type(uint256).max if not)
    const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    if (groupId === maxUint256) {
      return null
    }

    const group = await contract.correlationGroups(groupId)
    const category = await contract.groupCategory(groupId)
    const marketIds = await contract.getGroupMarkets(groupId)

    return {
      id: Number(groupId),
      name: group.name,
      description: group.description,
      creator: group.creator,
      createdAt: new Date(Number(group.createdAt) * 1000).toISOString(),
      active: group.active,
      category: category,
      marketIds: marketIds.map(id => Number(id)),
      marketCount: marketIds.length
    }
  } catch (error) {
    console.error('Error getting market correlation group:', error)
    return null
  }
}

/**
 * Create a new correlation group
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {string} name - Group name
 * @param {string} description - Group description
 * @param {string} category - Group category
 * @returns {Promise<Object>} Transaction result with groupId
 */
export async function createCorrelationGroup(signer, name, description, category) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  if (!isCorrelationRegistryDeployed()) {
    throw new Error('MarketCorrelationRegistry not deployed')
  }

  if (!name || name.trim().length === 0) {
    throw new Error('Group name is required')
  }

  if (!category || category.trim().length === 0) {
    throw new Error('Category is required')
  }

  try {
    const contract = getContract('marketCorrelationRegistry', signer)

    console.log('Creating correlation group:', { name, description, category })

    const tx = await contract.createCorrelationGroup(
      name.trim(),
      description?.trim() || '',
      category.trim()
    )
    const receipt = await tx.wait()

    // Extract groupId from event
    let groupId = null
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log)
        if (parsed?.name === 'CorrelationGroupCreated') {
          groupId = Number(parsed.args.groupId)
          break
        }
      } catch {
        // Ignore logs we can't parse
      }
    }

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      gasUsed: receipt.gasUsed.toString(),
      groupId: groupId
    }
  } catch (error) {
    console.error('Error creating correlation group:', error)

    if (error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected by user')
    } else {
      throw new Error(error.message || 'Failed to create correlation group')
    }
  }
}

/**
 * Add a market to a correlation group
 * Note: This requires group creator or owner permission on the MarketCorrelationRegistry
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {number} groupId - Correlation group ID
 * @param {number} marketId - Market ID to add
 * @returns {Promise<Object>} Transaction result
 */
export async function addMarketToCorrelationGroup(signer, groupId, marketId) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  if (!isCorrelationRegistryDeployed()) {
    throw new Error('MarketCorrelationRegistry not deployed')
  }

  try {
    const contract = getContract('marketCorrelationRegistry', signer)
    const userAddress = await signer.getAddress()

    console.log('Adding market to correlation group:', { groupId, marketId })

    // Pre-flight check: verify user has permission
    const [group, contractOwner] = await Promise.all([
      contract.correlationGroups(groupId),
      contract.owner()
    ])

    const groupCreator = group.creator
    const isGroupCreator = groupCreator.toLowerCase() === userAddress.toLowerCase()
    const isOwner = contractOwner.toLowerCase() === userAddress.toLowerCase()

    console.log('Permission check:', {
      userAddress,
      groupCreator,
      contractOwner,
      isGroupCreator,
      isOwner
    })

    if (!isGroupCreator && !isOwner) {
      throw new Error(`Only the group creator (${groupCreator.slice(0, 8)}...) or contract owner can add markets to this group`)
    }

    const tx = await contract.addMarketToGroup(groupId, marketId)
    const receipt = await tx.wait()

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      gasUsed: receipt.gasUsed.toString(),
      groupId: groupId,
      marketId: marketId
    }
  } catch (error) {
    console.error('Error adding market to correlation group:', error)

    if (error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected by user')
    } else if (error.message.includes('not active')) {
      throw new Error('Correlation group is not active')
    } else if (error.message.includes('already in a group')) {
      throw new Error('Market is already in a correlation group')
    } else {
      throw new Error(error.message || 'Failed to add market to group')
    }
  }
}

/**
 * Remove a market from its correlation group
 * Note: This requires owner permission on the MarketCorrelationRegistry
 * @param {ethers.Signer} signer - Connected wallet signer (must be owner)
 * @param {number} marketId - Market ID to remove
 * @returns {Promise<Object>} Transaction result
 */
export async function removeMarketFromCorrelationGroup(signer, marketId) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  if (!isCorrelationRegistryDeployed()) {
    throw new Error('MarketCorrelationRegistry not deployed')
  }

  try {
    const contract = getContract('marketCorrelationRegistry', signer)

    console.log('Removing market from correlation group:', { marketId })

    const tx = await contract.removeMarketFromGroup(marketId)
    const receipt = await tx.wait()

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      gasUsed: receipt.gasUsed.toString(),
      marketId: marketId
    }
  } catch (error) {
    console.error('Error removing market from correlation group:', error)

    if (error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected by user')
    } else if (error.message.includes('not in any group')) {
      throw new Error('Market is not in a correlation group')
    } else {
      throw new Error(error.message || 'Failed to remove market from group')
    }
  }
}

/**
 * Fetch all markets in a correlation group with their full data
 * @param {number} groupId - Correlation group ID
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsInCorrelationGroup(groupId) {
  if (!isCorrelationRegistryDeployed()) {
    return []
  }

  try {
    const registryContract = getContract('marketCorrelationRegistry')
    const marketIds = await registryContract.getGroupMarkets(groupId)

    const markets = []
    for (const marketId of marketIds) {
      try {
        const market = await fetchMarketByIdFromBlockchain(Number(marketId))
        if (market) {
          markets.push({
            ...market,
            correlationGroupId: groupId
          })
        }
      } catch (marketError) {
        console.warn(`Failed to fetch market ${marketId}:`, marketError.message)
      }
    }

    return markets
  } catch (error) {
    console.error('Error fetching markets in correlation group:', error)
    return []
  }
}

// ============================================================================
// MULTICALL3 BATCHED FETCHING
// ============================================================================

/**
 * Get Multicall3 contract instance for batching RPC calls
 * @returns {ethers.Contract} Multicall3 contract
 */
function getMulticall3Contract() {
  const provider = new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
  return new ethers.Contract(ETCSWAP_ADDRESSES.MULTICALL_V3, MULTICALL3_ABI, provider)
}

/**
 * Batch fetch market categories from the correlation registry
 * Uses Multicall3 to minimize RPC calls
 *
 * @param {number[]} marketIds - Array of market IDs to fetch categories for
 * @returns {Promise<Map<number, string>>} Map of marketId → category
 */
export async function batchFetchMarketCategories(marketIds) {
  if (!marketIds || marketIds.length === 0) {
    return new Map()
  }

  const registryAddress = getContractAddress('marketCorrelationRegistry')
  if (!registryAddress || registryAddress === ethers.ZeroAddress) {
    logger.debug('Correlation registry not deployed, returning empty category map')
    return new Map()
  }

  try {
    const multicall = getMulticall3Contract()
    const registry = getContract('marketCorrelationRegistry')

    // Step 1: Batch check if markets are in groups and get their group IDs
    const groupIdCalls = marketIds.map(id => ({
      target: registryAddress,
      allowFailure: true,
      callData: registry.interface.encodeFunctionData('getMarketGroup', [id])
    }))

    logger.debug(`Batching ${groupIdCalls.length} getMarketGroup calls`)
    const groupIdResults = await multicall.aggregate3(groupIdCalls)

    // Decode group IDs, handling failures
    const marketGroupMap = new Map() // marketId → groupId
    const uniqueGroupIds = new Set()

    for (let i = 0; i < marketIds.length; i++) {
      const result = groupIdResults[i]
      if (result.success && result.returnData !== '0x') {
        try {
          const decoded = registry.interface.decodeFunctionResult('getMarketGroup', result.returnData)
          const groupId = Number(decoded[0])
          // Group ID 0 means not in a group
          if (groupId > 0) {
            marketGroupMap.set(marketIds[i], groupId)
            uniqueGroupIds.add(groupId)
          }
        } catch {
          // Decode failed, market not in group
        }
      }
    }

    logger.debug(`Found ${uniqueGroupIds.size} unique groups for ${marketIds.length} markets`)

    // Step 2: Batch fetch categories for unique group IDs
    const groupIdArray = Array.from(uniqueGroupIds)
    const groupCategoryMap = new Map() // groupId → category

    if (groupIdArray.length > 0) {
      const categoryCalls = groupIdArray.map(groupId => ({
        target: registryAddress,
        allowFailure: true,
        callData: registry.interface.encodeFunctionData('groupCategory', [groupId])
      }))

      logger.debug(`Batching ${categoryCalls.length} groupCategory calls`)
      const categoryResults = await multicall.aggregate3(categoryCalls)

      for (let i = 0; i < groupIdArray.length; i++) {
        const result = categoryResults[i]
        if (result.success && result.returnData !== '0x') {
          try {
            const decoded = registry.interface.decodeFunctionResult('groupCategory', result.returnData)
            const category = decoded[0]
            if (category) {
              groupCategoryMap.set(groupIdArray[i], category.toLowerCase())
            }
          } catch {
            // Decode failed
          }
        }
      }
    }

    // Step 3: Build final marketId → category map
    const categoryMap = new Map()
    for (const [marketId, groupId] of marketGroupMap.entries()) {
      const category = groupCategoryMap.get(groupId) || 'other'
      categoryMap.set(marketId, category)
    }

    // Markets not in any group get 'other'
    for (const marketId of marketIds) {
      if (!categoryMap.has(marketId)) {
        categoryMap.set(marketId, 'other')
      }
    }

    logger.debug(`Built category map for ${categoryMap.size} markets`)
    return categoryMap
  } catch (error) {
    logger.debug('Failed to batch fetch market categories:', error.message)
    // Return empty map, caller should fall back to individual fetches
    return new Map()
  }
}

/**
 * Batch fetch market statuses using Multicall3
 *
 * @param {number[]} marketIds - Array of market IDs
 * @returns {Promise<Map<number, number>>} Map of marketId → status
 */
export async function batchFetchMarketStatuses(marketIds) {
  if (!marketIds || marketIds.length === 0) {
    return new Map()
  }

  try {
    const multicall = getMulticall3Contract()
    const factoryAddress = getContractAddress('marketFactory')
    const factory = getContract('marketFactory')

    const statusCalls = marketIds.map(id => ({
      target: factoryAddress,
      allowFailure: true,
      callData: factory.interface.encodeFunctionData('markets', [id])
    }))

    logger.debug(`Batching ${statusCalls.length} market status calls`)
    const results = await multicall.aggregate3(statusCalls)

    const statusMap = new Map()
    for (let i = 0; i < marketIds.length; i++) {
      const result = results[i]
      if (result.success && result.returnData !== '0x') {
        try {
          const decoded = factory.interface.decodeFunctionResult('markets', result.returnData)
          // Market struct has status as one of its fields
          // The exact position depends on the struct definition
          const status = Number(decoded.status || decoded[5] || 0)
          statusMap.set(marketIds[i], status)
        } catch {
          statusMap.set(marketIds[i], 0)
        }
      } else {
        statusMap.set(marketIds[i], 0)
      }
    }

    return statusMap
  } catch (error) {
    logger.debug('Failed to batch fetch market statuses:', error.message)
    return new Map()
  }
}

/**
 * Batch fetch core market data using Multicall3
 * Fetches market structs and prices in 2 batched calls instead of 2N individual calls
 *
 * @param {number[]} marketIds - Array of market IDs
 * @returns {Promise<Map<number, Object>>} Map of marketId → { market, prices }
 */
export async function batchFetchMarketCoreData(marketIds) {
  if (!marketIds || marketIds.length === 0) {
    return new Map()
  }

  try {
    const multicall = getMulticall3Contract()
    const factoryAddress = getContractAddress('marketFactory')
    const factory = getContract('marketFactory')

    // Build calls for both markets() and getPrices() for all IDs
    const marketCalls = marketIds.map(id => ({
      target: factoryAddress,
      allowFailure: true,
      callData: factory.interface.encodeFunctionData('markets', [id])
    }))

    const priceCalls = marketIds.map(id => ({
      target: factoryAddress,
      allowFailure: true,
      callData: factory.interface.encodeFunctionData('getPrices', [id])
    }))

    // Execute both batches in parallel
    logger.debug(`Batching ${marketIds.length} markets() and ${marketIds.length} getPrices() calls`)
    const [marketResults, priceResults] = await Promise.all([
      multicall.aggregate3(marketCalls),
      multicall.aggregate3(priceCalls)
    ])

    const dataMap = new Map()

    for (let i = 0; i < marketIds.length; i++) {
      const marketId = marketIds[i]
      const marketResult = marketResults[i]
      const priceResult = priceResults[i]

      let market = null
      let prices = { passPrice: '0.5', failPrice: '0.5' }

      // Decode market struct
      if (marketResult.success && marketResult.returnData !== '0x') {
        try {
          const decoded = factory.interface.decodeFunctionResult('markets', marketResult.returnData)
          market = decoded[0] || decoded
        } catch (e) {
          logger.debug(`Failed to decode market ${marketId}:`, e.message)
        }
      }

      // Decode prices
      if (priceResult.success && priceResult.returnData !== '0x') {
        try {
          const decoded = factory.interface.decodeFunctionResult('getPrices', priceResult.returnData)
          prices = {
            passPrice: ethers.formatEther(decoded[0]),
            failPrice: ethers.formatEther(decoded[1])
          }
        } catch (e) {
          logger.debug(`Failed to decode prices for market ${marketId}:`, e.message)
        }
      }

      if (market) {
        dataMap.set(marketId, { market, prices })
      }
    }

    logger.debug(`Batch fetched core data for ${dataMap.size}/${marketIds.length} markets`)
    return dataMap
  } catch (error) {
    logger.debug('Failed to batch fetch market core data:', error.message)
    return new Map()
  }
}

