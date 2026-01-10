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

    // Fetch each market individually using the markets(uint256) mapping
    const transformedMarkets = []
    for (let i = 0; i < Number(marketCount); i++) {
      try {
        const market = await contract.markets(i)

        // The actual contract returns a struct with these fields:
        // proposalId, passToken, failToken, collateralToken, tradingEndTime,
        // liquidityParameter, totalLiquidity, resolved, passValue, failValue,
        // status, betType, useCTF, conditionId, questionId, passPositionId, failPositionId

        transformedMarkets.push({
          id: i,
          proposalId: Number(market.proposalId || 0),
          proposalTitle: `Market #${i}`, // Markets don't store question text on-chain
          description: '',
          category: 'prediction',
          passTokenPrice: '0.5', // Would need to calculate from LMSR
          failTokenPrice: '0.5',
          totalLiquidity: market.totalLiquidity ? ethers.formatEther(market.totalLiquidity) : '0',
          tradingEndTime: market.tradingEndTime ? new Date(Number(market.tradingEndTime) * 1000).toISOString() : new Date().toISOString(),
          status: getMarketStatus(Number(market.status)),
          betType: Number(market.betType || 0),
          collateralToken: market.collateralToken,
          resolved: market.resolved
        })
      } catch (marketError) {
        console.warn(`Failed to fetch market ${i}:`, marketError.message)
      }
    }

    console.log('Transformed markets:', transformedMarkets)
    return transformedMarkets
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

    const market = await contract.markets(id)

    // Check if market is valid (proposalId will be 0 for non-existent markets)
    if (!market || market.proposalId === 0n) {
      return null
    }

    return {
      id: id,
      proposalId: Number(market.proposalId || 0),
      proposalTitle: `Market #${id}`,
      description: '',
      category: 'prediction',
      passTokenPrice: '0.5',
      failTokenPrice: '0.5',
      totalLiquidity: market.totalLiquidity ? ethers.formatEther(market.totalLiquidity) : '0',
      tradingEndTime: market.tradingEndTime ? new Date(Number(market.tradingEndTime) * 1000).toISOString() : new Date().toISOString(),
      status: getMarketStatus(Number(market.status)),
      betType: Number(market.betType || 0),
      collateralToken: market.collateralToken,
      resolved: market.resolved
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
      console.log('Approving USC for PaymentProcessor...')
      try {
        // Use explicit gas limit to avoid estimation issues
        const approveTx = await uscContract.approve(paymentProcessorAddress, amountWei, {
          gasLimit: 100000 // Standard approve gas limit
        })
        await approveTx.wait()
        console.log('USC approved')
      } catch (approveError) {
        console.error('Approve failed:', approveError)
        if (approveError.code === 'ACTION_REJECTED') {
          throw new Error('Transaction rejected by user')
        }
        // Try to provide more helpful error message
        throw new Error(`Failed to approve USC. Please ensure you have enough ETC for gas and try again. Details: ${approveError.message || 'Unknown error'}`)
      }
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

