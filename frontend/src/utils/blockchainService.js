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
import { ETCSWAP_ADDRESSES } from '../constants/etcswap'

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

/**
 * Buy shares in a prediction market
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {number} marketId - Market ID
 * @param {boolean} outcome - true for YES, false for NO
 * @param {string} amount - Amount in ETC to spend
 * @returns {Promise<Object>} Transaction receipt
 */
export async function buyMarketShares(signer, marketId, outcome, amount) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  try {
    const contract = getContract('marketFactory', signer)
    const amountWei = ethers.parseEther(amount.toString())

    // Call the buy function with value
    const tx = await contract.buy(marketId, outcome, amountWei, {
      value: amountWei
    })

    // Wait for transaction confirmation
    const receipt = await tx.wait()

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      gasUsed: receipt.gasUsed.toString()
    }
  } catch (error) {
    console.error('Error buying market shares:', error)

    // Parse common error messages
    if (error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected by user')
    } else if (error.message.includes('insufficient funds')) {
      throw new Error('Insufficient funds for transaction')
    } else if (error.message.includes('Market not active')) {
      throw new Error('Market is not active')
    } else {
      throw new Error(error.message || 'Transaction failed')
    }
  }
}

/**
 * Estimate gas for buying shares
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {number} marketId - Market ID
 * @param {boolean} outcome - true for YES, false for NO
 * @param {string} amount - Amount in ETC to spend
 * @returns {Promise<string>} Estimated gas in ETC
 */
export async function estimateBuyGas(signer, marketId, outcome, amount) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  try {
    const contract = getContract('marketFactory', signer)
    const amountWei = ethers.parseEther(amount.toString())

    const gasEstimate = await contract.buy.estimateGas(marketId, outcome, amountWei, {
      value: amountWei
    })

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

    const tx = await contract.sell(marketId, outcome, sharesWei)
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

/**
 * Purchase a role using USC stablecoin
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {string} roleName - Name of the role being purchased
 * @param {number} priceUSD - Price in USD (will be converted to USC with 18 decimals)
 * @returns {Promise<Object>} Transaction receipt
 */
export async function purchaseRoleWithUSC(signer, roleName, priceUSD) {
  if (!signer) {
    throw new Error('Wallet not connected')
  }

  try {
    const uscAddress = ETCSWAP_ADDRESSES.USC_STABLECOIN
    const treasuryAddress = getContractAddress('treasuryVault')
    const uscContract = new ethers.Contract(uscAddress, ERC20_ABI, signer)

    // Convert price to USC wei (USC has 18 decimals)
    const amountWei = ethers.parseEther(priceUSD.toString())

    // Check USC balance
    const userAddress = await signer.getAddress()
    const balance = await uscContract.balanceOf(userAddress)

    if (balance < amountWei) {
      throw new Error('Insufficient USC balance. You need ' + priceUSD + ' USC.')
    }

    // Check allowance
    const allowance = await uscContract.allowance(userAddress, treasuryAddress)

    // Approve if needed
    if (allowance < amountWei) {
      const approveTx = await uscContract.approve(treasuryAddress, amountWei)
      await approveTx.wait()
    }

    // Transfer USC to treasury
    const transferTx = await uscContract.transfer(treasuryAddress, amountWei)
    const receipt = await transferTx.wait()

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      gasUsed: receipt.gasUsed.toString(),
      roleName: roleName,
      amount: priceUSD
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
