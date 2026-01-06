/**
 * IPFS Service
 *
 * Service for interacting with IPFS gateway to retrieve and upload data.
 * Provides caching, retry logic, and error handling for IPFS requests.
 *
 * Features:
 * - Fetch data from IPFS with caching
 * - Upload JSON metadata to IPFS
 * - Batch operations for multiple requests
 * - Gateway health checks
 */

import {
  IPFS_CONFIG,
  IPFS_GATEWAY,
  IPFS_UPLOAD_API,
  getIpfsUrl,
  buildIpfsPath,
  isValidCid
} from '../constants/ipfs'

/**
 * In-memory cache for IPFS data
 * Structure: { key: { data, timestamp } }
 */
const cache = new Map()

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Check if cached data is still valid
 * @param {number} timestamp - Cache timestamp
 * @returns {boolean} True if cache is still valid
 */
const isCacheValid = (timestamp) => {
  return Date.now() - timestamp < IPFS_CONFIG.CACHE_DURATION
}

/**
 * Get data from cache
 * @param {string} key - Cache key
 * @returns {any|null} Cached data or null if not found/expired
 */
const getFromCache = (key) => {
  const cached = cache.get(key)
  if (cached && isCacheValid(cached.timestamp)) {
    return cached.data
  }
  if (cached) {
    cache.delete(key) // Remove expired cache
  }
  return null
}

/**
 * Store data in cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
const setInCache = (key, data) => {
  cache.set(key, {
    data,
    timestamp: Date.now()
  })
}

/**
 * Clear all cache
 */
export const clearCache = () => {
  cache.clear()
}

/**
 * Clear specific cache entry
 * @param {string} key - Cache key to clear
 */
export const clearCacheEntry = (key) => {
  cache.delete(key)
}

/**
 * Fetch data from IPFS with retry logic
 * @param {string} url - Full IPFS URL
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If all retry attempts fail
 */
const fetchWithRetry = async (url, options = {}) => {
  let lastError
  
  for (let attempt = 0; attempt < IPFS_CONFIG.MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), IPFS_CONFIG.TIMEOUT)
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...options.headers,
        },
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      return data
      
    } catch (error) {
      lastError = error
      
      // Don't retry on abort (timeout)
      if (error.name === 'AbortError') {
        throw new Error('IPFS request timeout')
      }
      
      // Wait before retry (except on last attempt)
      if (attempt < IPFS_CONFIG.MAX_RETRIES - 1) {
        await sleep(IPFS_CONFIG.RETRY_DELAY * (attempt + 1)) // Exponential backoff
      }
    }
  }
  
  throw new Error(`IPFS fetch failed after ${IPFS_CONFIG.MAX_RETRIES} attempts: ${lastError.message}`)
}

/**
 * Fetch data from IPFS with caching
 * @param {string} path - IPFS path or CID
 * @param {Object} options - Options
 * @param {boolean} options.skipCache - Skip cache check
 * @returns {Promise<any>} Data from IPFS
 */
export const fetchFromIpfs = async (path, options = {}) => {
  const { skipCache = false } = options
  
  // Check cache first unless skipCache is true
  if (!skipCache) {
    const cached = getFromCache(path)
    if (cached) {
      return cached
    }
  }
  
  // Fetch from IPFS
  const url = getIpfsUrl(path)
  const data = await fetchWithRetry(url)
  
  // Store in cache
  setInCache(path, data)
  
  return data
}

/**
 * Fetch token metadata from IPFS
 * @param {string} tokenAddress - Token contract address
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Token metadata
 */
export const fetchTokenMetadata = async (tokenAddress, options = {}) => {
  if (!tokenAddress) {
    throw new Error('Token address is required')
  }
  
  const path = buildIpfsPath.tokenMetadata(tokenAddress)
  return fetchFromIpfs(path, options)
}

/**
 * Fetch market data from IPFS
 * @param {string} marketId - Market identifier
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Market data
 */
export const fetchMarketData = async (marketId, options = {}) => {
  if (!marketId) {
    throw new Error('Market ID is required')
  }
  
  const path = buildIpfsPath.marketData(marketId)
  return fetchFromIpfs(path, options)
}

/**
 * Fetch market metadata from IPFS
 * @param {string} marketId - Market identifier
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Market metadata
 */
export const fetchMarketMetadata = async (marketId, options = {}) => {
  if (!marketId) {
    throw new Error('Market ID is required')
  }
  
  const path = buildIpfsPath.marketMetadata(marketId)
  return fetchFromIpfs(path, options)
}

/**
 * Fetch data from IPFS using CID
 * @param {string} cid - IPFS content identifier
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} Data from IPFS
 */
export const fetchByCid = async (cid, options = {}) => {
  if (!cid) {
    throw new Error('CID is required')
  }
  
  if (!isValidCid(cid)) {
    throw new Error('Invalid CID format')
  }
  
  const path = buildIpfsPath.fromCid(cid)
  return fetchFromIpfs(path, options)
}

/**
 * Batch fetch multiple items from IPFS
 * @param {Array<string>} paths - Array of IPFS paths or CIDs
 * @param {Object} options - Fetch options
 * @returns {Promise<Array>} Array of results (null for failed fetches)
 */
export const batchFetch = async (paths, options = {}) => {
  if (!Array.isArray(paths) || paths.length === 0) {
    return []
  }
  
  const promises = paths.map(async (path) => {
    try {
      return await fetchFromIpfs(path, options)
    } catch (error) {
      console.error(`Failed to fetch from IPFS path ${path}:`, error)
      return null
    }
  })
  
  return Promise.all(promises)
}

/**
 * Check if IPFS gateway is accessible
 * @returns {Promise<boolean>} True if gateway is accessible
 */
export const checkGatewayHealth = async () => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    // Try to fetch a known IPFS CID or health endpoint
    const response = await fetch(`${IPFS_GATEWAY}/`, {
      method: 'HEAD',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return response.ok || response.status === 404 // 404 is ok, means gateway is up
  } catch {
    return false
  }
}

// ==========================================
// IPFS Upload Functions
// ==========================================

/**
 * Upload JSON data to IPFS
 * @param {Object} data - JSON data to upload
 * @param {Object} options - Upload options
 * @param {string} options.name - Optional name for the content
 * @returns {Promise<{cid: string, uri: string}>} Upload result with CID and URI
 * @throws {Error} If upload fails
 */
export const uploadJson = async (data, options = {}) => {
  if (!data || typeof data !== 'object') {
    throw new Error('Data must be a valid object')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), IPFS_CONFIG.UPLOAD_TIMEOUT)

  try {
    const response = await fetch(`${IPFS_UPLOAD_API}/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: data,
        name: options.name || 'metadata.json',
        pin: true,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `Upload failed with status ${response.status}`)
    }

    const result = await response.json()

    if (!result.cid) {
      throw new Error('Upload response missing CID')
    }

    return {
      cid: result.cid,
      uri: `ipfs://${result.cid}`,
      size: result.size || JSON.stringify(data).length,
    }
  } catch (error) {
    clearTimeout(timeoutId)

    if (error.name === 'AbortError') {
      throw new Error('IPFS upload timeout')
    }

    throw new Error(`IPFS upload failed: ${error.message}`)
  }
}

/**
 * Upload market metadata to IPFS
 * Validates and formats metadata according to OpenSea standard
 * @param {Object} metadata - Market metadata object
 * @returns {Promise<{cid: string, uri: string}>} Upload result
 */
export const uploadMarketMetadata = async (metadata) => {
  // Validate required fields
  if (!metadata.name) {
    throw new Error('Market metadata requires a name (question)')
  }
  if (!metadata.description) {
    throw new Error('Market metadata requires a description')
  }

  // Ensure proper format
  const formattedMetadata = {
    // Standard OpenSea fields
    name: metadata.name,
    description: metadata.description,
    image: metadata.image || 'ipfs://QmDefaultMarketImage',
    external_url: metadata.external_url,

    // Attributes array for structured data
    attributes: Array.isArray(metadata.attributes) ? metadata.attributes : [],

    // Custom properties
    properties: {
      ...metadata.properties,
      schema_version: '1.0.0',
      uploaded_at: new Date().toISOString(),
    },
  }

  return uploadJson(formattedMetadata, { name: 'market-metadata.json' })
}

/**
 * Resolve a URI to fetch its content
 * Handles ipfs://, https://, and raw CID formats
 * @param {string} uri - URI to resolve
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} Resolved content
 */
export const resolveUri = async (uri, options = {}) => {
  if (!uri) {
    throw new Error('URI is required')
  }

  // Handle IPFS URIs
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '').split('/')[0]
    const path = uri.replace(`ipfs://${cid}`, '') || ''
    return fetchFromIpfs(cid + path, options)
  }

  // Handle raw CIDs
  if (isValidCid(uri)) {
    return fetchByCid(uri, options)
  }

  // Handle HTTPS URLs
  if (uri.startsWith('https://')) {
    const response = await fetch(uri, { ...options })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${uri}: ${response.status}`)
    }
    return response.json()
  }

  throw new Error(`Unsupported URI format: ${uri}`)
}

/**
 * Upload and pin content with metadata registry integration
 * Uploads to IPFS and optionally registers with MetadataRegistry contract
 * @param {Object} content - Content to upload
 * @param {Object} options - Options
 * @param {string} options.resourceType - Resource type for registry (e.g., 'market')
 * @param {string} options.resourceId - Resource ID for registry
 * @param {Function} options.registerCallback - Callback to register with contract
 * @returns {Promise<{cid: string, uri: string, registered: boolean}>}
 */
export const uploadAndRegister = async (content, options = {}) => {
  // Upload to IPFS first
  const uploadResult = await uploadJson(content, { name: options.name })

  // If registration callback provided, register with MetadataRegistry
  if (options.registerCallback && options.resourceType && options.resourceId) {
    try {
      await options.registerCallback(
        options.resourceType,
        options.resourceId,
        uploadResult.cid
      )
      return { ...uploadResult, registered: true }
    } catch (error) {
      console.error('Failed to register metadata:', error)
      return { ...uploadResult, registered: false, registrationError: error.message }
    }
  }

  return { ...uploadResult, registered: false }
}
