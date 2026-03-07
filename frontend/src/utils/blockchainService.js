/**
 * Blockchain Service
 * 
 * Handles all direct interactions with smart contracts on the blockchain.
 * Provides a clean interface for fetching data from deployed contracts.
 */

import { ethers } from 'ethers'
import { getContractAddress, NETWORK_CONFIG, DEPLOYMENT_BLOCKS } from '../config/contracts'
import { ERC20_ABI } from '../abis/ERC20'
import { ZK_KEY_MANAGER_ABI } from '../abis/ZKKeyManager'
import { ETCSWAP_ADDRESSES } from '../constants/etcswap'
import { WAGER_DEFAULTS } from '../constants/wagerDefaults'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../abis/FriendGroupMarketFactory'
import {
  parseEncryptedIpfsReference
} from './ipfsService'

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
    case 'friendGroupMarketFactory':
      abi = FRIEND_GROUP_MARKET_FACTORY_ABI
      break
    case 'zkKeyManager':
      abi = ZK_KEY_MANAGER_ABI
      break
    default:
      throw new Error(`Unknown contract: ${contractName}`)
  }
  
  return new ethers.Contract(address, abi, provider)
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

// --- Event-based market index cache ---
const MARKET_INDEX_PREFIX = 'friendMarketIndex_'
const MARKET_CACHE_PREFIX = 'friendMarketCache_'

/**
 * Load cached market index for a user (market IDs + last indexed block)
 */
function loadMarketIndex(userAddress) {
  try {
    const key = MARKET_INDEX_PREFIX + userAddress.toLowerCase()
    const stored = localStorage.getItem(key)
    if (!stored) return { marketIds: [], lastBlock: 0 }
    return JSON.parse(stored)
  } catch {
    return { marketIds: [], lastBlock: 0 }
  }
}

/**
 * Save market index to localStorage
 */
function saveMarketIndex(userAddress, index) {
  try {
    const key = MARKET_INDEX_PREFIX + userAddress.toLowerCase()
    localStorage.setItem(key, JSON.stringify(index))
  } catch (e) {
    console.warn('[MarketIndex] Failed to save index:', e)
  }
}

/**
 * Load cached market details
 */
function loadMarketCache(userAddress) {
  try {
    const key = MARKET_CACHE_PREFIX + userAddress.toLowerCase()
    const stored = localStorage.getItem(key)
    if (!stored) return {}
    return JSON.parse(stored)
  } catch {
    return {}
  }
}

/**
 * Save market details cache
 */
function saveMarketCache(userAddress, cache) {
  try {
    const key = MARKET_CACHE_PREFIX + userAddress.toLowerCase()
    localStorage.setItem(key, JSON.stringify(cache))
  } catch (e) {
    console.warn('[MarketIndex] Failed to save cache:', e)
  }
}

/**
 * Discover market IDs for a user via MemberAdded events (indexed by member address).
 * Uses incremental block scanning with a cached watermark.
 */
async function discoverMarketIds(contract, userAddress, provider) {
  const index = loadMarketIndex(userAddress)
  const currentBlock = await provider.getBlockNumber()

  // If we have a cached index and it's recent, just return it
  if (index.lastBlock >= currentBlock) {
    console.log(`[MarketIndex] Index up to date at block ${index.lastBlock}, ${index.marketIds.length} markets`)
    return index.marketIds
  }

  // Scan from last indexed block + 1, or contract deployment block on first run
  const deployBlock = DEPLOYMENT_BLOCKS.friendGroupMarketFactory || 0
  const fromBlock = index.lastBlock > 0 ? index.lastBlock + 1 : deployBlock
  console.log(`[MarketIndex] Scanning MemberAdded events from block ${fromBlock} to ${currentBlock}`)

  // Query MemberAdded events where member = userAddress (indexed topic)
  const memberAddedFilter = contract.filters.MemberAdded(null, userAddress)

  // Scan in chunks to avoid RPC limits (10k blocks per query)
  const CHUNK_SIZE = 10000
  const newMarketIds = new Set(index.marketIds.map(id => id.toString()))
  let scanFrom = fromBlock

  while (scanFrom <= currentBlock) {
    const scanTo = Math.min(scanFrom + CHUNK_SIZE - 1, currentBlock)
    try {
      const events = await contract.queryFilter(memberAddedFilter, scanFrom, scanTo)
      for (const event of events) {
        const marketId = event.args.friendMarketId.toString()
        newMarketIds.add(marketId)
      }
    } catch (err) {
      console.warn(`[MarketIndex] Error scanning blocks ${scanFrom}-${scanTo}:`, err.message)
      // On error, try smaller chunks
      if (CHUNK_SIZE > 1000) {
        const smallChunk = 1000
        for (let s = scanFrom; s <= scanTo; s += smallChunk) {
          const e = Math.min(s + smallChunk - 1, scanTo)
          try {
            const events = await contract.queryFilter(memberAddedFilter, s, e)
            for (const event of events) {
              newMarketIds.add(event.args.friendMarketId.toString())
            }
          } catch {
            console.warn(`[MarketIndex] Skipping blocks ${s}-${e}`)
          }
        }
      }
    }
    scanFrom = scanTo + 1
  }

  const allIds = Array.from(newMarketIds)
  saveMarketIndex(userAddress, { marketIds: allIds, lastBlock: currentBlock })
  console.log(`[MarketIndex] Index updated: ${allIds.length} markets (scanned ${fromBlock}-${currentBlock})`)
  return allIds
}

/**
 * Process raw market data into the standard market object format
 */
function processMarketResult(marketId, marketResult, acceptanceStatus, acceptances) {
  const marketTypes = ['oneVsOne', 'smallGroup', 'eventTracking', 'propBet']
  const statusNames = ['pending_acceptance', 'active', 'pending_resolution', 'challenged', 'resolved', 'cancelled', 'refunded', 'oracle_timed_out']

  const stakeToken = marketResult.stakeToken
  const isUSC = stakeToken && stakeToken.toLowerCase() === ETCSWAP_ADDRESSES?.USC_STABLECOIN?.toLowerCase()
  const tokenDecimals = isUSC ? 6 : 18
  const stakeAmountFormatted = ethers.formatUnits(marketResult.stakePerParticipant, tokenDecimals)

  const arbitrator = marketResult.arbitrator
  const hasArbitrator = arbitrator && arbitrator !== ethers.ZeroAddress

  // Safely parse timestamps
  const acceptanceDeadlineMs = Number(marketResult.acceptanceDeadline) * 1000
  const tradingEndTimeMs = Number(marketResult.tradingEndTime || 0) * 1000

  const now = new Date()
  const defaultEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

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

  // Check for encrypted metadata
  let description = marketResult.description
  let metadata = null
  let isEncryptedMarket = false
  let ipfsCid = null
  let needsIpfsFetch = false

  const ipfsRef = parseEncryptedIpfsReference(description)
  if (ipfsRef.isIpfs && ipfsRef.cid) {
    ipfsCid = ipfsRef.cid
    isEncryptedMarket = true
    needsIpfsFetch = true
    description = 'Encrypted Market'
  } else {
    try {
      const parsed = JSON.parse(description)
      const isV1Envelope = parsed?.version === '1.0' &&
          parsed?.algorithm === 'x25519-chacha20poly1305' &&
          parsed?.content?.ciphertext &&
          Array.isArray(parsed?.keys)
      const isV2Envelope = parsed?.version === '2.0' &&
          parsed?.algorithm === 'xwing-chacha20poly1305' &&
          parsed?.content?.ciphertext &&
          Array.isArray(parsed?.keys)

      if (isV1Envelope || isV2Envelope) {
        metadata = parsed
        isEncryptedMarket = true
        description = 'Encrypted Market'
      }
    } catch {
      // Not JSON, keep as plain description
    }
  }

  const members = marketResult.members || []

  return {
    id: marketId.toString(),
    description,
    metadata,
    isEncrypted: isEncryptedMarket,
    ipfsCid,
    needsIpfsFetch,
    creator: marketResult.creator,
    participants: members,
    arbitrator: hasArbitrator ? arbitrator : null,
    type: marketTypes[Number(marketResult.marketType)] || 'oneVsOne',
    status: statusNames[Number(marketResult.status)] || 'pending_acceptance',
    acceptanceDeadline: acceptanceDeadlineMs > 0 ? acceptanceDeadlineMs : now.getTime() + WAGER_DEFAULTS.ACCEPTANCE_DEADLINE_HOURS * 60 * 60 * 1000,
    minAcceptanceThreshold: Number(marketResult.minThreshold) || WAGER_DEFAULTS.MIN_ACCEPTANCE_THRESHOLD,
    stakeAmount: stakeAmountFormatted,
    stakeTokenAddress: stakeToken,
    stakeTokenSymbol: isUSC ? 'USC' : 'ETC',
    acceptances,
    acceptedCount: Number(acceptanceStatus.accepted),
    endDate: endDateStr,
    createdAt: now.toISOString()
  }
}

/**
 * Fetch friend markets for a user from the blockchain.
 *
 * Uses event-based discovery (MemberAdded events) with incremental block scanning
 * instead of the old getUserMarkets() approach. This preserves privacy (no public
 * mapping of user -> markets) and optimizes lookups via cached block watermarks.
 *
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

    // Step 1: Discover market IDs via events (incremental, cached)
    const marketIds = await discoverMarketIds(contract, userAddress, provider)
    console.log(`[fetchFriendMarketsForUser] Found ${marketIds.length} markets for ${userAddress}`)

    if (marketIds.length === 0) {
      return []
    }

    // Step 2: Load cached market details and determine which need refreshing
    const detailCache = loadMarketCache(userAddress)
    const terminalStatuses = new Set(['resolved', 'cancelled', 'refunded'])
    const idsToFetch = [] // Markets that need fresh data from chain
    const cachedMarkets = [] // Markets we can serve from cache

    for (const id of marketIds) {
      const cached = detailCache[id]
      if (cached && terminalStatuses.has(cached.status)) {
        // Terminal state markets don't change - serve from cache
        cachedMarkets.push(cached)
      } else {
        idsToFetch.push(id)
      }
    }

    console.log(`[fetchFriendMarketsForUser] ${cachedMarkets.length} cached (terminal), ${idsToFetch.length} need refresh`)

    // Step 3: Fetch fresh data for non-terminal markets in parallel
    const freshMarkets = await Promise.all(
      idsToFetch.map(async (marketId) => {
        try {
          const [marketResult, acceptedCount] = await Promise.all([
            contract.getFriendMarketWithStatus(marketId),
            contract.acceptedParticipantCount(marketId)
          ])
          const acceptanceStatus = { accepted: acceptedCount }

          // Determine token decimals for formatting
          const stakeToken = marketResult.stakeToken
          const isUSC = stakeToken && stakeToken.toLowerCase() === ETCSWAP_ADDRESSES?.USC_STABLECOIN?.toLowerCase()
          const tokenDecimals = isUSC ? 6 : 18

          // Fetch acceptances for participants in parallel
          const members = marketResult.members || []
          const acceptances = {}

          const acceptanceResults = await Promise.all(
            members.map(async (member) => {
              try {
                const record = await contract.getParticipantAcceptance(marketId, member)
                return {
                  address: member.toLowerCase(),
                  hasAccepted: record.hasAccepted,
                  stakedAmount: ethers.formatUnits(record.stakedAmount, tokenDecimals),
                  isArbitrator: record.isArbitrator
                }
              } catch {
                return null
              }
            })
          )

          for (const result of acceptanceResults) {
            if (result) {
              acceptances[result.address] = {
                hasAccepted: result.hasAccepted,
                stakedAmount: result.stakedAmount,
                isArbitrator: result.isArbitrator
              }
            }
          }

          return processMarketResult(marketId, marketResult, acceptanceStatus, acceptances)
        } catch (err) {
          console.error(`Error fetching market ${marketId}:`, err)
          // Fall back to cached version if available
          return detailCache[marketId] || null
        }
      })
    )

    // Step 4: Merge results and update cache
    const allMarkets = [...cachedMarkets, ...freshMarkets.filter(m => m !== null)]

    // Update the detail cache with fresh data
    const updatedCache = { ...detailCache }
    for (const market of allMarkets) {
      updatedCache[market.id] = market
    }
    saveMarketCache(userAddress, updatedCache)

    return allMarkets
  } catch (error) {
    console.error('Error fetching friend markets from blockchain:', error)
    throw error
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
