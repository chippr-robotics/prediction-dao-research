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
    default:
      throw new Error(`Unknown contract: ${contractName}`)
  }
  
  return new ethers.Contract(address, abi, provider)
}

/**
 * Fetch all markets from the blockchain
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsFromBlockchain() {
  try {
    const contract = getContract('marketFactory')
    const markets = await contract.getAllMarkets()
    
    // Transform blockchain data to match frontend format
    return markets.map((market, index) => ({
      id: Number(market.id || index),
      proposalTitle: market.question || '',
      description: market.description || '',
      category: market.category || 'other',
      passTokenPrice: market.yesPrice ? ethers.formatEther(market.yesPrice) : '0.5',
      failTokenPrice: market.noPrice ? ethers.formatEther(market.noPrice) : '0.5',
      totalLiquidity: market.totalLiquidity ? ethers.formatEther(market.totalLiquidity) : '0',
      tradingEndTime: market.endTime ? new Date(Number(market.endTime) * 1000).toISOString() : new Date().toISOString(),
      status: getMarketStatus(Number(market.status)),
      creator: market.creator || ethers.ZeroAddress
    }))
  } catch (error) {
    console.error('Error fetching markets from blockchain:', error)
    throw error
  }
}

/**
 * Fetch markets by category from the blockchain
 * @param {string} category - Market category
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsByCategoryFromBlockchain(category) {
  try {
    const contract = getContract('marketFactory')
    const marketIds = await contract.getMarketsByCategory(category)
    
    const markets = await Promise.all(
      marketIds.map(async (id) => {
        const market = await contract.getMarket(id)
        return {
          id: Number(market.id || id),
          proposalTitle: market.question || '',
          description: market.description || '',
          category: market.category || category,
          passTokenPrice: market.yesPrice ? ethers.formatEther(market.yesPrice) : '0.5',
          failTokenPrice: market.noPrice ? ethers.formatEther(market.noPrice) : '0.5',
          totalLiquidity: market.totalLiquidity ? ethers.formatEther(market.totalLiquidity) : '0',
          tradingEndTime: market.endTime ? new Date(Number(market.endTime) * 1000).toISOString() : new Date().toISOString(),
          status: getMarketStatus(Number(market.status)),
          creator: market.creator || ethers.ZeroAddress
        }
      })
    )
    
    return markets
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
    const market = await contract.getMarket(id)
    
    if (!market || !market.question) {
      return null
    }
    
    return {
      id: Number(market.id || id),
      proposalTitle: market.question || '',
      description: market.description || '',
      category: market.category || 'other',
      passTokenPrice: market.yesPrice ? ethers.formatEther(market.yesPrice) : '0.5',
      failTokenPrice: market.noPrice ? ethers.formatEther(market.noPrice) : '0.5',
      totalLiquidity: market.totalLiquidity ? ethers.formatEther(market.totalLiquidity) : '0',
      tradingEndTime: market.endTime ? new Date(Number(market.endTime) * 1000).toISOString() : new Date().toISOString(),
      status: getMarketStatus(Number(market.status)),
      creator: market.creator || ethers.ZeroAddress
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
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<Array>} Array of position objects
 */
export async function fetchPositionsFromBlockchain(userAddress) {
  try {
    if (!userAddress || !ethers.isAddress(userAddress)) {
      return []
    }
    
    const contract = getContract('marketFactory')
    const positions = await contract.getUserPositions(userAddress)
    
    return positions.map((position) => ({
      marketId: Number(position.marketId),
      yesShares: position.yesShares ? ethers.formatEther(position.yesShares) : '0',
      noShares: position.noShares ? ethers.formatEther(position.noShares) : '0',
      invested: position.invested ? ethers.formatEther(position.invested) : '0'
    }))
  } catch (error) {
    console.error('Error fetching positions from blockchain:', error)
    throw error
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
