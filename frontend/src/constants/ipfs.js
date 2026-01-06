/**
 * IPFS Configuration
 *
 * Configuration for accessing IPFS gateway hosted at ipfs.fairwins.app
 * Used for retrieving token metadata and market data
 */

/**
 * IPFS Gateway Configuration
 * Default gateway is ipfs.fairwins.app, can be overridden via environment variable
 */
export const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.fairwins.app'

/**
 * IPFS Upload API Configuration
 * Configurable upload endpoint for pinning content to IPFS
 */
export const IPFS_UPLOAD_API = import.meta.env.VITE_IPFS_UPLOAD_API || 'https://api.fairwins.app/ipfs'

/**
 * IPFS API Configuration
 */
export const IPFS_CONFIG = {
  // Request timeout in milliseconds
  TIMEOUT: 30000,

  // Upload timeout in milliseconds (2 minutes, intentionally higher to also support potential larger file uploads)
  UPLOAD_TIMEOUT: 120000,

  // Number of retry attempts for failed requests
  MAX_RETRIES: 3,

  // Delay between retries in milliseconds
  RETRY_DELAY: 1000,

  // Cache duration in milliseconds (5 minutes)
  CACHE_DURATION: 300000,
}

/**
 * IPFS Content Types
 * Common content types for IPFS data retrieval
 */
export const IPFS_CONTENT_TYPES = {
  TOKEN_METADATA: 'token',
  MARKET_DATA: 'market',
  MARKET_METADATA: 'market-metadata',
  USER_DATA: 'user',
}

/**
 * IPFS Path Builders
 * Helper functions to construct IPFS paths
 */
export const buildIpfsPath = {
  /**
   * Build path for token metadata
   * @param {string} tokenAddress - Token contract address
   * @returns {string} IPFS path for token metadata
   */
  tokenMetadata: (tokenAddress) => `/token/${tokenAddress}/metadata.json`,
  
  /**
   * Build path for market data
   * @param {string} marketId - Market identifier
   * @returns {string} IPFS path for market data
   */
  marketData: (marketId) => `/market/${marketId}/data.json`,
  
  /**
   * Build path for market metadata
   * @param {string} marketId - Market identifier
   * @returns {string} IPFS path for market metadata
   */
  marketMetadata: (marketId) => `/market/${marketId}/metadata.json`,
  
  /**
   * Build path for IPFS CID
   * @param {string} cid - IPFS content identifier
   * @returns {string} IPFS path for CID
   */
  fromCid: (cid) => `/ipfs/${cid}`,
}

/**
 * Get full IPFS URL
 * @param {string} path - IPFS path or CID
 * @returns {string} Full IPFS gateway URL
 */
export const getIpfsUrl = (path) => {
  // Handle IPFS CID format (ipfs://...)
  if (path.startsWith('ipfs://')) {
    const cid = path.replace('ipfs://', '')
    return `${IPFS_GATEWAY}/ipfs/${cid}`
  }
  
  // Handle paths that already include /ipfs/
  if (path.startsWith('/ipfs/')) {
    return `${IPFS_GATEWAY}${path}`
  }
  
  // Handle regular paths
  if (path.startsWith('/')) {
    return `${IPFS_GATEWAY}${path}`
  }
  
  // Assume it's a CID
  return `${IPFS_GATEWAY}/ipfs/${path}`
}

/**
 * Validate IPFS CID format
 * @param {string} cid - Content identifier to validate
 * @returns {boolean} True if valid CID format
 */
export const isValidCid = (cid) => {
  if (!cid || typeof cid !== 'string') return false
  
  // Basic CID validation (CIDv0 and CIDv1)
  // CIDv0: starts with Qm, 46 characters
  // CIDv1: starts with b, longer format
  const cidv0Pattern = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/
  const cidv1Pattern = /^b[a-z2-7]{58,}$/
  
  return cidv0Pattern.test(cid) || cidv1Pattern.test(cid)
}
