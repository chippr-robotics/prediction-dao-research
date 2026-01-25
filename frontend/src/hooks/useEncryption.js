/**
 * React Hook for Friend Market Encryption
 *
 * Provides envelope encryption for friend markets using the simplified
 * one-time encryption model:
 * - Creator encrypts metadata with a random key
 * - Key is wrapped for each participant
 * - Participants decrypt with their wallet-derived keys
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useWallet } from './useWalletManagement'
import {
  // X25519 (v1.0) functions
  deriveKeyPair,
  deriveKeyPairFromSignature,
  publicKeyFromSignature,
  encryptMarketMetadata,
  decryptMarketMetadata,
  createEncryptedMarket,
  addParticipantToMarket,
  // X-Wing (v2.0) functions
  deriveXWingKeyPairFromSignature,
  xwingPublicKeyFromSignature,
  createEncryptedMarketXWing,
  // Unified functions
  decryptEnvelopeUnified,
  addParticipantUnified,
  isXWingEnvelope,
  // Version
  getEnvelopeSigningVersion,
  // Utilities
  canDecrypt,
  getRecipients,
  isEncryptedEnvelope
} from '../utils/crypto/envelopeEncryption.js'

// Cache signatures in session storage (now stores JSON with version info)
const SIGNATURE_CACHE_KEY = 'fairwins_encryption_signature'

// Global initialization promise to prevent concurrent signature requests
let initializationPromise = null

/**
 * Get cached signature data (includes version info)
 * @param {string} account - Wallet address
 * @returns {{ signature: string, version: number } | null}
 */
function getCachedSignatureData(account) {
  if (!account) return null
  const cacheKey = `${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`
  const cached = sessionStorage.getItem(cacheKey)
  if (!cached) return null

  try {
    // Try to parse as JSON (new format with version)
    const parsed = JSON.parse(cached)
    if (parsed.signature && typeof parsed.version === 'number') {
      return parsed
    }
    // Invalid JSON format, treat as legacy
    return null
  } catch {
    // Legacy format: plain signature string without version
    // Assume version 1 for legacy cached signatures
    return { signature: cached, version: 1 }
  }
}

/**
 * Save signature data to cache (with version info)
 * @param {string} account - Wallet address
 * @param {string} signature - The signature
 * @param {number} version - Signing message version
 */
function saveSignatureToCache(account, signature, version) {
  if (!account) return
  const cacheKey = `${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`
  sessionStorage.setItem(cacheKey, JSON.stringify({ signature, version }))
}

/**
 * Clear cached signature for account
 * @param {string} account - Wallet address
 */
function clearSignatureCache(account) {
  if (!account) return
  const cacheKey = `${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`
  sessionStorage.removeItem(cacheKey)
}

/**
 * Main encryption hook for friend markets
 * Supports both X25519 (v1.0) and X-Wing (v2.0 post-quantum) envelopes
 */
export function useEncryption() {
  const { account, signer, isConnected } = useWallet()
  // Dual keypair state: X25519 for backward compatibility, X-Wing for new markets
  const [keyPairs, setKeyPairs] = useState({
    x25519: null,  // { publicKey, privateKey }
    xwing: null    // { publicKey, secretKey }
  })
  const [signature, setSignature] = useState(null)
  const [cachedVersion, setCachedVersion] = useState(null) // Track signing version of cached signature
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState(null)

  // Load cached signature on mount and derive both keypairs (no wallet interaction needed)
  useEffect(() => {
    let ignore = false

    if (account) {
      const cachedData = getCachedSignatureData(account)
      if (cachedData && !ignore) {
        setSignature(cachedData.signature)
        setCachedVersion(cachedData.version)
        // Derive BOTH keypairs from cached signature
        try {
          const x25519Keys = deriveKeyPairFromSignature(cachedData.signature)
          const xwingKeys = deriveXWingKeyPairFromSignature(cachedData.signature)
          if (!ignore) {
            setKeyPairs({
              x25519: {
                publicKey: x25519Keys.publicKey,
                privateKey: x25519Keys.privateKey
              },
              xwing: {
                publicKey: xwingKeys.publicKey,
                secretKey: xwingKeys.secretKey
              }
            })
          }
          console.log(`[useEncryption] Restored dual keypairs from cached signature (version ${cachedData.version})`)
        } catch (err) {
          console.error('Failed to derive keypairs from cached signature:', err)
          // Clear invalid cache
          clearSignatureCache(account)
        }
      }
    }

    return () => { ignore = true }
  }, [account])

  /**
   * Initialize encryption keys by signing the derivation message
   * Derives both X25519 and X-Wing keypairs from the same signature
   * Requires user interaction (wallet popup)
   * Uses global promise to prevent concurrent signature requests
   */
  const initializeKeys = useCallback(async () => {
    if (!signer || !account) {
      throw new Error('Wallet not connected')
    }

    // If initialization is already in progress, wait for it
    if (initializationPromise) {
      console.log('[useEncryption] Waiting for existing initialization to complete...')
      return initializationPromise
    }

    setIsInitializing(true)
    setError(null)

    // Create and store the promise to prevent concurrent requests
    initializationPromise = (async () => {
      try {
        // Derive X25519 keypair (also gets the signature and version)
        const x25519Result = await deriveKeyPair(signer)
        const signingVersion = x25519Result.version || 2 // Default to current version
        // Derive X-Wing keypair from the same signature (no additional wallet popup)
        const xwingKeys = deriveXWingKeyPairFromSignature(x25519Result.signature)

        setSignature(x25519Result.signature)
        setCachedVersion(signingVersion)
        setKeyPairs({
          x25519: {
            publicKey: x25519Result.publicKey,
            privateKey: x25519Result.privateKey
          },
          xwing: {
            publicKey: xwingKeys.publicKey,
            secretKey: xwingKeys.secretKey
          }
        })

        // Cache signature with version info
        saveSignatureToCache(account, x25519Result.signature, signingVersion)

        console.log(`[useEncryption] Dual keypairs initialized and cached for session (version ${signingVersion})`)

        return {
          signature: x25519Result.signature,
          publicKey: x25519Result.publicKey,
          xwingPublicKey: xwingKeys.publicKey
        }
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setIsInitializing(false)
        initializationPromise = null // Clear promise when done
      }
    })()

    return initializationPromise
  }, [signer, account])

  /**
   * Ensure keys are initialized, prompting if needed
   * Uses cached signature if available (no wallet popup)
   */
  const ensureInitialized = useCallback(async () => {
    // Already have both keypairs
    if (keyPairs.x25519?.privateKey && keyPairs.xwing?.secretKey) {
      return {
        signature,
        publicKey: keyPairs.x25519.publicKey,
        xwingPublicKey: keyPairs.xwing.publicKey
      }
    }

    // Try to derive from cached signature WITHOUT wallet interaction
    if (signature) {
      const x25519Keys = deriveKeyPairFromSignature(signature)
      const xwingKeys = deriveXWingKeyPairFromSignature(signature)
      setKeyPairs({
        x25519: {
          publicKey: x25519Keys.publicKey,
          privateKey: x25519Keys.privateKey
        },
        xwing: {
          publicKey: xwingKeys.publicKey,
          secretKey: xwingKeys.secretKey
        }
      })
      console.log('[useEncryption] Derived dual keypairs from cached signature (no wallet popup)')
      return {
        signature,
        publicKey: x25519Keys.publicKey,
        xwingPublicKey: xwingKeys.publicKey
      }
    }

    // No cached signature - need to prompt user to sign
    return initializeKeys()
  }, [signature, keyPairs, initializeKeys])

  /**
   * Create encrypted market metadata
   * Returns envelope ready for IPFS upload
   * Uses X-Wing (post-quantum) by default for new markets
   *
   * @param {Object} metadata - Market metadata to encrypt
   * @param {Object} options - { algorithm: 'xwing' | 'x25519' }
   */
  const createEncrypted = useCallback(async (metadata, options = {}) => {
    const { algorithm = 'xwing' } = options

    if (!signer || !account) {
      throw new Error('Wallet not connected')
    }

    await ensureInitialized()

    // Use X-Wing (post-quantum) by default for new markets
    if (algorithm === 'xwing') {
      return createEncryptedMarketXWing(metadata, signer, account)
    } else {
      return createEncryptedMarket(metadata, signer, account)
    }
  }, [signer, account, ensureInitialized])

  /**
   * Encrypt metadata for specific participants
   */
  const encryptForParticipants = useCallback(async (metadata, participants) => {
    if (!signer || !account) {
      throw new Error('Wallet not connected')
    }

    // Ensure all participants have signatures
    const validParticipants = participants.filter(p => p.signature)
    if (validParticipants.length === 0) {
      throw new Error('No participants with valid signatures')
    }

    return encryptMarketMetadata(metadata, validParticipants)
  }, [signer, account])

  /**
   * Decrypt market metadata
   * Auto-detects envelope version (X25519 v1.0 or X-Wing v2.0)
   * Checks signing version and re-derives keys if needed
   * Uses cached keys to avoid wallet popups when possible
   */
  const decryptMetadata = useCallback(async (envelope) => {
    if (!account) {
      throw new Error('Wallet not connected')
    }

    // Get the envelope's signing version
    const envelopeVersion = getEnvelopeSigningVersion(envelope)

    // Check if cached signature version matches envelope's signing version
    if (cachedVersion !== null && cachedVersion !== envelopeVersion) {
      console.log(`[useEncryption] Version mismatch: cached v${cachedVersion}, envelope v${envelopeVersion}. Re-signing...`)
      // Clear the stale cache and force re-initialization
      clearSignatureCache(account)
      setSignature(null)
      setCachedVersion(null)
      setKeyPairs({ x25519: null, xwing: null })
    }

    // Ensure we have keys (may prompt user once if no cached signature)
    await ensureInitialized()

    // Use unified decrypt with both key types
    if (keyPairs.x25519?.privateKey && keyPairs.xwing?.secretKey) {
      return decryptEnvelopeUnified(envelope, account, {
        x25519PrivateKey: keyPairs.x25519.privateKey,
        xwingSecretKey: keyPairs.xwing.secretKey
      })
    }

    // Fallback to signer-based decryption for v1.0 only (shouldn't happen after ensureInitialized)
    if (!signer) {
      throw new Error('No signer available')
    }
    return decryptMarketMetadata(envelope, account, signer)
  }, [signer, account, keyPairs, cachedVersion, ensureInitialized])

  /**
   * Add a participant to an encrypted market
   * Auto-detects envelope version and uses appropriate key wrapping
   * Uses cached keys to avoid wallet popups
   */
  const addParticipant = useCallback(async (envelope, newAddress, newSignature) => {
    if (!account) {
      throw new Error('Wallet not connected')
    }

    await ensureInitialized()

    // Use unified add participant with both key types
    if (keyPairs.x25519?.privateKey && keyPairs.xwing?.secretKey) {
      return addParticipantUnified(envelope, account, {
        x25519PrivateKey: keyPairs.x25519.privateKey,
        xwingSecretKey: keyPairs.xwing.secretKey
      }, newAddress, newSignature)
    }

    // Fallback to signer for v1.0 only (shouldn't happen after ensureInitialized)
    if (!signer) {
      throw new Error('No signer available')
    }
    return addParticipantToMarket(envelope, account, signer, newAddress, newSignature)
  }, [signer, account, keyPairs, ensureInitialized])

  /**
   * Check if current user can decrypt an envelope
   */
  const canUserDecrypt = useCallback((envelope) => {
    if (!account) return false
    return canDecrypt(envelope, account)
  }, [account])

  /**
   * Get recipient list from envelope
   */
  const getEnvelopeRecipients = useCallback((envelope) => {
    return getRecipients(envelope)
  }, [])

  /**
   * Check if data is encrypted
   */
  const isEncrypted = useCallback((data) => {
    return isEncryptedEnvelope(data)
  }, [])

  /**
   * Get X25519 public key for another user from their signature
   */
  const getPublicKeyFromSignature = useCallback((sig) => {
    return publicKeyFromSignature(sig)
  }, [])

  /**
   * Get X-Wing public key for another user from their signature
   */
  const getXWingPublicKeyFromSignature = useCallback((sig) => {
    return xwingPublicKeyFromSignature(sig)
  }, [])

  /**
   * Check if an envelope is X-Wing (post-quantum)
   */
  const isPostQuantum = useCallback((envelope) => {
    return isXWingEnvelope(envelope)
  }, [])

  /**
   * Clear cached keys
   */
  const clearKeys = useCallback(() => {
    if (account) {
      sessionStorage.removeItem(`${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`)
    }
    setKeyPairs({ x25519: null, xwing: null })
    setSignature(null)
  }, [account])

  // Clear on disconnect
  useEffect(() => {
    let ignore = false

    if (!isConnected && !ignore) {
      setKeyPairs({ x25519: null, xwing: null })
      setSignature(null)
    }

    return () => { ignore = true }
  }, [isConnected])

  return {
    // State
    isInitialized: !!(keyPairs.x25519?.privateKey && keyPairs.xwing?.secretKey),
    isInitializing,
    error,
    signature,
    publicKey: keyPairs.x25519?.publicKey,
    xwingPublicKey: keyPairs.xwing?.publicKey,

    // Key management
    initializeKeys,
    ensureInitialized,
    clearKeys,

    // Encryption operations
    createEncrypted,
    encryptForParticipants,
    decryptMetadata,
    addParticipant,

    // Utilities
    canUserDecrypt,
    getEnvelopeRecipients,
    isEncrypted,
    isPostQuantum,
    getPublicKeyFromSignature,
    getXWingPublicKeyFromSignature
  }
}

/**
 * Hook for automatically decrypting a list of markets
 * @deprecated Use useLazyMarketDecryption for better performance.
 * This hook decrypts ALL markets on mount which causes poor UX with many markets.
 */
export function useDecryptedMarkets(markets) {
  const { decryptMetadata, canUserDecrypt, isEncrypted } = useEncryption()
  const { account, isConnected, signer } = useWallet()
  const [decryptedMarkets, setDecryptedMarkets] = useState([])
  const [isDecrypting, setIsDecrypting] = useState(false)

  useEffect(() => {
    let ignore = false

    if (!markets?.length) {
      const clearMarkets = async () => {
        if (!ignore) {
          setDecryptedMarkets([])
        }
      }
      clearMarkets()
      return () => { ignore = true }
    }

    if (!isConnected || !signer) {
      // Not connected - mark encrypted as not viewable
      const processNotConnected = async () => {
        const processed = markets.map(market => {
          if (isEncrypted(market.metadata)) {
            return {
              ...market,
              isPrivate: true,
              canView: false,
              metadata: {
                name: 'Private Market',
                description: 'Connect wallet to view',
                encrypted: true
              }
            }
          }
          return { ...market, isPrivate: false, canView: true }
        })
        if (!ignore) {
          setDecryptedMarkets(processed)
        }
      }
      processNotConnected()
      return () => { ignore = true }
    }

    const decryptAll = async () => {
      if (!ignore) {
        setIsDecrypting(true)
      }

      const processed = await Promise.all(
        markets.map(async (market) => {
          const metadata = market.metadata

          // Not encrypted
          if (!isEncrypted(metadata)) {
            return { ...market, isPrivate: false, canView: true }
          }

          // Check if we can decrypt
          if (!canUserDecrypt(metadata)) {
            return {
              ...market,
              isPrivate: true,
              canView: false,
              metadata: {
                name: 'Private Market',
                description: 'You are not a participant in this market.',
                encrypted: true,
                participants: metadata.keys?.map(k => k.address) || []
              }
            }
          }

          // Try to decrypt
          try {
            const decrypted = await decryptMetadata(metadata)
            return {
              ...market,
              isPrivate: true,
              canView: true,
              metadata: decrypted
            }
          } catch (err) {
            console.error('Failed to decrypt market:', market.id, err)
            return {
              ...market,
              isPrivate: true,
              canView: false,
              decryptionError: err.message
            }
          }
        })
      )

      if (!ignore) {
        setDecryptedMarkets(processed)
        setIsDecrypting(false)
      }
    }

    decryptAll()

    return () => { ignore = true }
  }, [markets, account, isConnected, signer, decryptMetadata, canUserDecrypt, isEncrypted])

  // Filter helpers
  const viewableMarkets = useMemo(() =>
    decryptedMarkets.filter(m => m.canView),
    [decryptedMarkets]
  )

  const privateMarkets = useMemo(() =>
    decryptedMarkets.filter(m => m.isPrivate && m.canView),
    [decryptedMarkets]
  )

  const publicMarkets = useMemo(() =>
    decryptedMarkets.filter(m => !m.isPrivate),
    [decryptedMarkets]
  )

  return {
    markets: decryptedMarkets,
    viewableMarkets,
    privateMarkets,
    publicMarkets,
    isDecrypting
  }
}

/**
 * Hook for lazy/on-demand market decryption
 * Only decrypts markets when explicitly requested, not on mount.
 * This provides much better UX when users have many private markets.
 *
 * @param {Array} markets - Array of markets (may contain encrypted/non-encrypted)
 * @returns {Object} - Lazy decryption state and functions
 */
export function useLazyMarketDecryption(markets) {
  const { decryptMetadata, canUserDecrypt, isEncrypted, ensureInitialized } = useEncryption()
  const { account, isConnected, signer } = useWallet()

  // Cache: Map<marketId, { metadata, timestamp }>
  const [decryptionCache, setDecryptionCache] = useState(new Map())

  // Track which markets are currently being decrypted
  const [decryptingIds, setDecryptingIds] = useState(new Set())

  // Track decryption errors per market
  const [decryptionErrors, setDecryptionErrors] = useState(new Map())

  // Process markets to add encryption status WITHOUT decrypting
  const processedMarkets = useMemo(() => {
    if (!markets?.length) return []

    return markets.map(market => {
      const metadata = market.metadata
      const marketId = String(market.id)

      // Check if already in cache
      const cached = decryptionCache.get(marketId)
      if (cached) {
        return {
          ...market,
          encryptionStatus: 'decrypted',
          isPrivate: true,
          canView: true,
          decryptedMetadata: cached.metadata,
          metadata: cached.metadata, // Replace metadata with decrypted version
          decryptionError: null,
          isDecrypting: false,
        }
      }

      // Check for decryption error - still allow retry by keeping canView: true
      const errorMsg = decryptionErrors.get(marketId)
      if (errorMsg) {
        return {
          ...market,
          encryptionStatus: 'error',
          isPrivate: true,
          canView: true,  // Allow retry
          decryptedMetadata: null,
          decryptionError: errorMsg,
          isDecrypting: false,
        }
      }

      // Not encrypted
      if (!isEncrypted(metadata)) {
        return {
          ...market,
          encryptionStatus: 'not_encrypted',
          isPrivate: false,
          canView: true,
          decryptedMetadata: null,
          decryptionError: null,
          isDecrypting: false,
        }
      }

      // Encrypted - check if user can decrypt
      const userCanDecrypt = account && canUserDecrypt(metadata)

      // Also check if user is a market participant (fallback for encryption key mismatch)
      const userAddr = account?.toLowerCase()
      const isMarketParticipant = userAddr && (
        market.participants?.some(p => p?.toLowerCase() === userAddr) ||
        market.creator?.toLowerCase() === userAddr
      )

      // User can view if they can decrypt OR if they're a market participant
      // (participant check is a fallback - decryption might still fail, but let them try)
      const canViewMarket = userCanDecrypt || isMarketParticipant

      return {
        ...market,
        encryptionStatus: 'encrypted',
        isPrivate: true,
        canView: canViewMarket,
        decryptedMetadata: null,
        decryptionError: canViewMarket ? null : 'You are not a participant in this market',
        isDecrypting: decryptingIds.has(marketId),
      }
    })
  }, [markets, decryptionCache, decryptingIds, decryptionErrors, account, isEncrypted, canUserDecrypt])

  // Function to decrypt a single market on demand
  const decryptMarket = useCallback(async (marketId) => {
    const marketIdStr = String(marketId)
    const market = markets?.find(m => String(m.id) === marketIdStr)

    if (!market) {
      throw new Error('Market not found')
    }

    // Already cached?
    const cached = decryptionCache.get(marketIdStr)
    if (cached) {
      return cached.metadata
    }

    // Not encrypted?
    if (!isEncrypted(market.metadata)) {
      return market.metadata
    }

    // Can user decrypt?
    if (!canUserDecrypt(market.metadata)) {
      const error = 'You are not a participant in this market'
      setDecryptionErrors(prev => {
        const next = new Map(prev)
        next.set(marketIdStr, error)
        return next
      })
      throw new Error(error)
    }

    // Already decrypting? Skip to avoid duplicate work
    // The UI will update when decryption completes via the processedMarkets useMemo
    if (decryptingIds.has(marketIdStr)) {
      return null
    }

    // Mark as decrypting
    setDecryptingIds(prev => new Set([...prev, marketIdStr]))

    // Clear any previous error
    setDecryptionErrors(prev => {
      const next = new Map(prev)
      next.delete(marketIdStr)
      return next
    })

    try {
      // This may prompt for signature if not yet initialized
      const decrypted = await decryptMetadata(market.metadata)

      // Cache the result
      setDecryptionCache(prev => {
        const next = new Map(prev)
        next.set(marketIdStr, { metadata: decrypted, timestamp: Date.now() })
        return next
      })

      return decrypted
    } catch (err) {
      // Check for "invalid tag" error - likely version mismatch, clear cache
      if (err.message === 'invalid tag') {
        console.log('[useLazyMarketDecryption] Invalid tag error - clearing signature cache for retry')
        clearSignatureCache(account)
      }

      // Store a user-friendly error message
      const errorMsg = err.message === 'invalid tag'
        ? 'Decryption failed - please try again'
        : (err.message || 'Failed to decrypt market')
      setDecryptionErrors(prev => {
        const next = new Map(prev)
        next.set(marketIdStr, errorMsg)
        return next
      })
      throw err
    } finally {
      // Remove from decrypting set
      setDecryptingIds(prev => {
        const next = new Set(prev)
        next.delete(marketIdStr)
        return next
      })
    }
  }, [markets, decryptionCache, decryptingIds, decryptionErrors, isEncrypted, canUserDecrypt, decryptMetadata])

  // Check if a specific market is currently decrypting
  const isMarketDecrypting = useCallback((marketId) => {
    return decryptingIds.has(String(marketId))
  }, [decryptingIds])

  // Clear cache for a specific market or all
  const clearCache = useCallback((marketId) => {
    if (marketId) {
      const marketIdStr = String(marketId)
      setDecryptionCache(prev => {
        const next = new Map(prev)
        next.delete(marketIdStr)
        return next
      })
      setDecryptionErrors(prev => {
        const next = new Map(prev)
        next.delete(marketIdStr)
        return next
      })
    } else {
      setDecryptionCache(new Map())
      setDecryptionErrors(new Map())
    }
  }, [])

  // Clear cache on disconnect
  useEffect(() => {
    if (!isConnected) {
      setDecryptionCache(new Map())
      setDecryptionErrors(new Map())
      setDecryptingIds(new Set())
    }
  }, [isConnected])

  // Check if any market is currently decrypting
  const isAnyDecrypting = decryptingIds.size > 0

  // Filter helpers (similar to useDecryptedMarkets for compatibility)
  const viewableMarkets = useMemo(() =>
    processedMarkets.filter(m => m.canView || !m.isPrivate),
    [processedMarkets]
  )

  const privateMarkets = useMemo(() =>
    processedMarkets.filter(m => m.isPrivate && m.canView),
    [processedMarkets]
  )

  const publicMarkets = useMemo(() =>
    processedMarkets.filter(m => !m.isPrivate),
    [processedMarkets]
  )

  return {
    // Markets with encryption status (decrypted only if explicitly requested)
    markets: processedMarkets,
    viewableMarkets,
    privateMarkets,
    publicMarkets,

    // Function to decrypt a single market on demand
    decryptMarket,

    // Check if a specific market is currently decrypting
    isMarketDecrypting,

    // Global loading state (true if any market is decrypting)
    isAnyDecrypting,

    // Clear cache for a specific market or all
    clearCache,

    // Get the decryption cache (for debugging/testing)
    decryptionCache,
  }
}

export default useEncryption
