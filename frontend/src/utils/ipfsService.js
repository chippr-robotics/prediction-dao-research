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
  PINATA_CONFIG,
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
// IPFS Upload Functions (Pinata Integration)
// ==========================================

/**
 * Get Pinata authentication headers
 * Prefers JWT over API Key/Secret if available
 * @returns {Object} Headers object with authorization
 */
const getPinataAuthHeaders = () => {
  if (PINATA_CONFIG.JWT) {
    return {
      'Authorization': `Bearer ${PINATA_CONFIG.JWT}`,
    }
  }

  if (PINATA_CONFIG.API_KEY && PINATA_CONFIG.API_SECRET) {
    return {
      'pinata_api_key': PINATA_CONFIG.API_KEY,
      'pinata_secret_api_key': PINATA_CONFIG.API_SECRET,
    }
  }

  throw new Error('Pinata authentication not configured. Please set VITE_PINATA_JWT or VITE_PINATA_API_KEY and VITE_PINATA_API_SECRET environment variables.')
}

/**
 * Upload JSON data to IPFS via Pinata
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

  // Validate that data can be stringified (no circular references)
  let jsonString
  try {
    jsonString = JSON.stringify(data)
  } catch (error) {
    throw new Error(`Cannot stringify data: ${error.message}`)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), IPFS_CONFIG.UPLOAD_TIMEOUT)

  try {
    // Get auth headers for Pinata
    const authHeaders = getPinataAuthHeaders()

    // Pinata pinJSONToIPFS endpoint
    const response = await fetch(`${PINATA_CONFIG.API_URL}/pinning/pinJSONToIPFS`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        pinataContent: data,
        pinataMetadata: {
          name: options.name || 'metadata.json',
        },
        pinataOptions: {
          cidVersion: 1, // Use CIDv1 for better compatibility
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const responseText = await response.text()
      let errorMessage
      try {
        const errorData = JSON.parse(responseText)
        errorMessage = errorData?.error?.reason || errorData?.error?.message || errorData?.message || null
      } catch {
        errorMessage = null
      }
      if (!errorMessage) {
        const bodySnippet = responseText ? responseText.slice(0, 200) : ''
        errorMessage = `Pinata upload failed with status ${response.status}` + (bodySnippet ? `. Response: ${bodySnippet}` : '')
      }
      throw new Error(errorMessage)
    }

    const result = await response.json()

    // Pinata returns IpfsHash (CID) in the response
    const cid = result.IpfsHash
    if (!cid) {
      throw new Error('Pinata response missing IpfsHash (CID)')
    }

    console.log('Successfully pinned to Pinata:', {
      cid,
      name: options.name,
      size: result.PinSize,
      timestamp: result.Timestamp,
    })

    return {
      cid,
      uri: `ipfs://${cid}`,
      size: result.PinSize || new Blob([jsonString]).size,
      timestamp: result.Timestamp,
    }
  } catch (error) {
    clearTimeout(timeoutId)

    if (error.name === 'AbortError') {
      throw new Error('Pinata upload timeout')
    }

    // Re-throw auth errors as-is
    if (error.message.includes('authentication not configured')) {
      throw error
    }

    throw new Error(`Pinata upload failed: ${error.message}`)
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
    throw new Error('Market metadata requires a name/question field')
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
      schema_version: '1.1.0',
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
    // Use caller-provided signal if present; otherwise create a timed abort controller
    const hasCallerSignal = options && options.signal

    if (hasCallerSignal) {
      const response = await fetch(uri, { ...options })
      if (!response.ok) {
        throw new Error(`Failed to fetch ${uri}: ${response.status}`)
      }
      return response.json()
    }

    const controller = new AbortController()
    // Prefer a configured timeout if available, otherwise fall back to a sane default
    const timeoutMs =
      (IPFS_CONFIG && (IPFS_CONFIG.REQUEST_TIMEOUT_MS || IPFS_CONFIG.FETCH_TIMEOUT_MS)) || 10000
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(uri, { ...options, signal: controller.signal })
      if (!response.ok) {
        throw new Error(`Failed to fetch ${uri}: ${response.status}`)
      }
      return response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw new Error(`Unsupported URI format: ${uri}`)
}

/**
 * Upload and pin content with metadata registry integration
 * Uploads to IPFS and optionally registers with MetadataRegistry contract
 * Note: If registration fails, metadata remains uploaded to IPFS (orphaned content).
 * This is by design to prevent data loss - the caller can retry registration later.
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
