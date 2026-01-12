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
async function tryFetchMarketMetadata(contract, marketId) {
  try {
    // First try to get metadata URI from contract
    const metadataUri = await contract.getMarketMetadataUri(marketId)
    if (metadataUri && metadataUri.length > 0) {
      // Import dynamically to avoid circular dependencies
      const { resolveUri } = await import('./ipfsService')
      const metadata = await resolveUri(metadataUri)
      return metadata
    }
  } catch (error) {
    // Function may not exist or metadata not set - this is expected
    console.debug(`No metadata URI for market ${marketId}:`, error.message)
  }
  return null
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

/**
 * Get token decimals for a collateral token
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<number>} Number of decimals (defaults to 18)
 */
async function getTokenDecimals(tokenAddress) {
  try {
    if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
      return 18
    }
    const provider = getProvider()
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
    const decimals = await tokenContract.decimals()
    return Number(decimals)
  } catch (error) {
    console.debug(`Could not get decimals for token ${tokenAddress}:`, error.message)
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
    // Fetch market struct, prices, metadata, and creation event concurrently
    const [market, prices, metadata, creationEvent] = await Promise.all([
      contract.markets(marketId),
      tryGetPrices(contract, marketId),
      tryFetchMarketMetadata(contract, marketId),
      tryGetMarketCreationEvent(contract, marketId)
    ])

    // Validate market before adding
    if (!isValidMarket(market)) {
      console.debug(`Skipping invalid market ${marketId}`)
      return null
    }

    // Get collateral token decimals for proper formatting
    const collateralDecimals = await getTokenDecimals(market.collateralToken)

    // Fetch trade statistics (needs collateralDecimals for volume formatting)
    const tradeStats = await tryGetMarketTradeStats(contract, marketId, collateralDecimals)

    // Extract info from metadata or use defaults
    const category = extractCategory(metadata)
    const title = metadata?.name || `Market #${marketId}`
    const description = metadata?.description || ''
    const betTypeLabels = getBetTypeLabels(Number(market.betType || 0))

    // Build the transformed market object
    return {
      id: marketId,
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
      volume24h: tradeStats.totalVolume, // Using total volume as volume24h for now
      // Additional metadata fields
      image: metadata?.image || null,
      tags: metadata?.properties?.tags || [],
      resolutionCriteria: metadata?.properties?.resolution_criteria || '',
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

    const fetchDuration = Date.now() - startTime
    console.log(`Fetched ${transformedMarkets.length} valid markets in ${fetchDuration}ms`)

    // Enrich markets with correlation group data (provides categories)
    const enrichedMarkets = await enrichMarketsWithCorrelationData(transformedMarkets)

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
 * Fetch markets by category from the blockchain
 * Note: The actual contract doesn't store categories - this filters all markets client-side
 * @param {string} category - Market category (currently unused as contract doesn't support categories)
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsByCategoryFromBlockchain(category) {
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

    // Fetch trade statistics (needs collateralDecimals for volume formatting)
    const tradeStats = await tryGetMarketTradeStats(contract, id, collateralDecimals)

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
      // Additional metadata fields
      image: metadata?.image || null,
      tags: metadata?.properties?.tags || [],
      resolutionCriteria: metadata?.properties?.resolution_criteria || '',
      // CTF fields for trading
      useCTF: market.useCTF,
      conditionId: market.conditionId,
      passPositionId: market.passPositionId ? Number(market.passPositionId) : null,
      failPositionId: market.failPositionId ? Number(market.failPositionId) : null,
      // Correlation group info
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
 * @returns {Promise<Object>} Transaction receipt
 */
export async function buyMarketShares(signer, marketId, outcome, amount) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  try {
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
        console.log('Approving collateral token...')
        const approveTx = await collateralToken.approve(
          getContractAddress('marketFactory'),
          amountWei
        )
        await approveTx.wait()
        console.log('Collateral approved')
      }

      // Call buyTokens function (ERC20 collateral - no value sent)
      const tx = await contract.buyTokens(marketId, outcome, amountWei)
      const receipt = await tx.wait()

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 1 ? 'success' : 'failed',
        gasUsed: receipt.gasUsed.toString()
      }
    } else {
      // Native ETC collateral - send value with transaction
      const tx = await contract.buyTokens(marketId, outcome, amountWei, {
        value: amountWei
      })
      const receipt = await tx.wait()

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 1 ? 'success' : 'failed',
        gasUsed: receipt.gasUsed.toString()
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
  'MARKET_MAKER': ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
  'CLEARPATH_USER': ethers.keccak256(ethers.toUtf8Bytes('CLEARPATH_USER_ROLE')),
  'TOKENMINT': ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE')),
  'FRIEND_MARKET': ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  'Market Maker': ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
  'ClearPath User': ethers.keccak256(ethers.toUtf8Bytes('CLEARPATH_USER_ROLE')),
  'Token Mint': ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE')),
  'Friend Market': ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE'))
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

// Membership tier enum values
const MembershipTier = {
  NONE: 0,
  BASIC: 1,
  STANDARD: 2,
  PREMIUM: 3,
  ENTERPRISE: 4
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
    const roleManagerAddress = getContractAddress('roleManager')
    if (!roleManagerAddress) {
      console.warn('Role manager not deployed - cannot check on-chain role')
      return false
    }

    const roleHash = getRoleHash(roleName)
    if (!roleHash) {
      console.warn(`Unknown role: ${roleName}`)
      return false
    }

    const provider = getProvider()
    const roleManagerContract = new ethers.Contract(
      roleManagerAddress,
      ROLE_MANAGER_ABI,
      provider
    )

    return await roleManagerContract.hasRole(roleHash, userAddress)
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
export async function grantRoleOnChain(signer, userAddress, roleName, durationDays = 365) {
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
 * Purchase a role using USC stablecoin
 * This function calls the PaymentProcessor's purchaseTierWithToken function,
 * which handles both the payment and role granting in a single transaction.
 *
 * Requires modular RBAC deployment: npx hardhat run scripts/deploy-modular-rbac.js --network mordor
 *
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {string} roleName - Name of the role being purchased
 * @param {number} priceUSD - Price in USD (will be converted to USC with 6 decimals)
 * @returns {Promise<Object>} Transaction receipt with roleGranted status
 */
export async function purchaseRoleWithUSC(signer, roleName, priceUSD) {
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
    } catch (e) {
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
        if (approveError.code === 'ACTION_REJECTED') {
          throw new Error('Transaction rejected by user')
        }
        // Try to provide more helpful error message
        throw new Error(`Failed to approve USC. Please ensure you have enough ETC for gas and try again. Details: ${approveError.message || 'Unknown error'}`)
      }
    } else {
      console.log('USC already approved for PaymentProcessor, allowance:', ethers.formatUnits(allowance, 6))
    }

    // Call purchaseTierWithToken on PaymentProcessor
    // This handles both payment and role granting in a single atomic transaction
    console.log('Purchasing role via PaymentProcessor...', {
      roleHash,
      tier: MembershipTier.BASIC,
      paymentToken: uscAddress,
      amount: amountWei.toString()
    })

    const purchaseTx = await paymentProcessor.purchaseTierWithToken(
      roleHash,
      MembershipTier.BASIC,  // Use BASIC tier for standard purchases
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
      amount: priceUSD,
      roleGrantedOnChain: receipt.status === 1,
      roleGrantTxHash: receipt.hash
    }
  } catch (error) {
    console.error('Error purchasing role:', error)

    if (error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected by user')
    } else if (error.message.includes('Insufficient USC balance')) {
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

