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
  addParticipantToMarket,
  addRecipient,
  // X-Wing (v2.0) functions
  deriveXWingKeyPairFromSignature,
  xwingPublicKeyFromSignature,
  encryptMarketMetadataXWing,
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
import {
  lookupPublicKey,
  hasRegisteredKey,
  ensureKeyRegistered,
  clearKeyCache
} from '../utils/keyRegistryService.js'
import { CURRENT_ENCRYPTION_VERSION } from '../utils/crypto/constants.js'

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
        // Reuse a cached session signature if one exists, deriving keypairs WITHOUT a
        // wallet popup. This makes initialization idempotent across hook instances and
        // rapid sequential calls, so the encryption-terms message is only ever signed
        // once per session (Minor bug #1 — repeated signature prompts on wager creation).
        const cached = getCachedSignatureData(account)
        if (cached?.signature) {
          const x25519Keys = deriveKeyPairFromSignature(cached.signature)
          const xwingKeys = deriveXWingKeyPairFromSignature(cached.signature)
          setSignature(cached.signature)
          setCachedVersion(cached.version)
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
          console.log('[useEncryption] Reused cached session signature (no wallet popup)')
          return {
            signature: cached.signature,
            version: cached.version,
            publicKey: x25519Keys.publicKey,
            xwingPublicKey: xwingKeys.publicKey
          }
        }

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

        // Auto-register X25519 public key on-chain (non-blocking)
        // This allows other users to look up our key for encrypted wagers
        ensureKeyRegistered(signer, account, x25519Result.publicKey).then(wasRegistered => {
          if (wasRegistered) {
            console.log('[useEncryption] Encryption key registered on-chain')
          }
        }).catch(err => {
          // Non-fatal — user can still encrypt/decrypt locally, just won't be
          // discoverable by others until key is registered
          console.warn('[useEncryption] Failed to auto-register key on-chain:', err.message)
        })

        console.log(`[useEncryption] Keypairs initialized and cached for session (version ${signingVersion})`)

        return {
          signature: x25519Result.signature,
          version: signingVersion,
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
        version: cachedVersion ?? CURRENT_ENCRYPTION_VERSION,
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
        version: cachedVersion ?? CURRENT_ENCRYPTION_VERSION,
        publicKey: x25519Keys.publicKey,
        xwingPublicKey: xwingKeys.publicKey
      }
    }

    // No cached signature - need to prompt user to sign
    return initializeKeys()
  }, [signature, cachedVersion, keyPairs, initializeKeys])

  /**
   * Create encrypted market metadata
   * Returns envelope ready for IPFS upload
   * Uses X-Wing (post-quantum) by default for new markets
   *
   * @param {Object} metadata - Market metadata to encrypt
   * @param {Object} options - { algorithm: 'xwing' | 'x25519', termsVersion?: {id, hash} }
   *   termsVersion (Spec 007, FR-056): the in-force T&C version bound into the wager's
   *   AEAD so it carries tamper-evident proof of its governing terms.
   */
  const createEncrypted = useCallback(async (metadata, options = {}) => {
    const { algorithm = 'xwing', termsVersion = null } = options

    if (!signer || !account) {
      throw new Error('Wallet not connected')
    }

    // Obtain the creator's key-derivation signature ONCE (prompts at most a single
    // wallet popup, or none if a session signature is cached). The envelope is then
    // built synchronously from that signature via the encryptMarketMetadata* helpers.
    //
    // Previously this called createEncryptedMarket{,XWing}(metadata, signer, ...),
    // which re-derived the keypair by signing the message a SECOND time — the source
    // of the duplicate "sign the rules" prompt on every wager creation.
    const { signature: creatorSignature, version } = await ensureInitialized()
    const signingVersion = version || CURRENT_ENCRYPTION_VERSION

    const recipients = [{ address: account, signature: creatorSignature }]

    // Use X-Wing (post-quantum) by default for new markets
    const envelope = algorithm === 'xwing'
      ? encryptMarketMetadataXWing(metadata, recipients, signingVersion, termsVersion)
      : encryptMarketMetadata(metadata, recipients, signingVersion, termsVersion)

    return { envelope, creatorSignature, signingVersion }
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

    // Obtain the key-derivation signature, prompting the wallet at most once.
    // We capture the RETURNED signature here rather than reading the keyPairs
    // state below, because initializeKeys/ensureInitialized call setKeyPairs()
    // and React has not flushed that update into this closure yet. Reading the
    // stale (null) keyPairs is exactly what made decryption fall through to the
    // signer-based path and prompt the user to sign a SECOND time — the decrypt
    // double-signature bug. With the signature in hand we derive the keys
    // synchronously, so a single signature unlocks the wager (click → sign → see).
    let init
    if (cachedVersion !== null && cachedVersion !== envelopeVersion) {
      console.log(`[useEncryption] Version mismatch: cached v${cachedVersion}, envelope v${envelopeVersion}. Re-signing...`)
      // Clear the stale cache and directly call initializeKeys to force fresh signature
      clearSignatureCache(account)
      init = await initializeKeys()
    } else {
      // Ensure we have keys (may prompt user once if no cached signature)
      init = await ensureInitialized()
    }

    // Derive both private keys from the freshly-obtained signature and decrypt
    // in the same pass — no dependence on the not-yet-flushed keyPairs state.
    if (init?.signature) {
      const x25519Keys = deriveKeyPairFromSignature(init.signature)
      const xwingKeys = deriveXWingKeyPairFromSignature(init.signature)
      return decryptEnvelopeUnified(envelope, account, {
        x25519PrivateKey: x25519Keys.privateKey,
        xwingSecretKey: xwingKeys.secretKey
      })
    }

    // Fallback: use in-state keys if they already happen to be populated.
    if (keyPairs.x25519?.privateKey && keyPairs.xwing?.secretKey) {
      return decryptEnvelopeUnified(envelope, account, {
        x25519PrivateKey: keyPairs.x25519.privateKey,
        xwingSecretKey: keyPairs.xwing.secretKey
      })
    }

    // Last-resort signer-based decryption for v1.0 only (shouldn't happen after
    // ensureInitialized returns a signature).
    if (!signer) {
      throw new Error('No signer available')
    }
    return decryptMarketMetadata(envelope, account, signer)
  }, [signer, account, keyPairs, cachedVersion, ensureInitialized, initializeKeys])

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
   * Look up an opponent's encryption public key from the on-chain registry
   * @param {string} opponentAddress - Ethereum address
   * @returns {Promise<Uint8Array|null>} X25519 public key bytes, or null if not registered
   */
  const lookupOpponentKey = useCallback(async (opponentAddress) => {
    if (!opponentAddress) return null
    const provider = signer?.provider
    if (!provider) {
      throw new Error('No provider available')
    }
    return lookupPublicKey(opponentAddress, provider)
  }, [signer])

  /**
   * Check if an opponent has a registered encryption key
   * @param {string} opponentAddress - Ethereum address
   * @returns {Promise<boolean>}
   */
  const opponentHasKey = useCallback(async (opponentAddress) => {
    if (!opponentAddress) return false
    const provider = signer?.provider
    if (!provider) return false
    return hasRegisteredKey(opponentAddress, provider)
  }, [signer])

  /**
   * Add a recipient to an existing envelope using their on-chain public key
   * (no signature from the opponent needed)
   * @param {Object} envelope - Existing encrypted envelope
   * @param {string} recipientAddress - Address to add
   * @param {Uint8Array} recipientPublicKey - Their X25519 public key from on-chain registry
   * @returns {Object} Updated envelope with the new recipient
   */
  const addRecipientByPublicKey = useCallback((envelope, recipientAddress, recipientPublicKey) => {
    if (!account) {
      throw new Error('Wallet not connected')
    }
    // Prefer the in-state private key, but fall back to deriving it from the cached
    // session signature. setKeyPairs() from a just-completed initializeKeys() hasn't
    // flushed into this render's closure yet, so reading keyPairs alone can spuriously
    // report "Encryption keys not initialized" when this is called right after
    // createEncrypted() within the same handler tick (the user-visible bug).
    let x25519PrivateKey = keyPairs.x25519?.privateKey
    if (!x25519PrivateKey) {
      const cached = getCachedSignatureData(account)
      if (cached?.signature) {
        x25519PrivateKey = deriveKeyPairFromSignature(cached.signature).privateKey
      }
    }
    if (!x25519PrivateKey) {
      throw new Error('Encryption keys not initialized')
    }
    if (isXWingEnvelope(envelope)) {
      // The on-chain KeyRegistry only stores 32-byte X25519 keys, so we have
      // no X-Wing key to encrypt for. Callers should create X25519 envelopes
      // when they intend to add a recipient via on-chain lookup.
      throw new Error(
        'addRecipientByPublicKey: cannot add an X-Wing recipient using an X25519 key. ' +
        'Create the envelope with { algorithm: "x25519" } when the recipient comes from KeyRegistry.'
      )
    }
    return addRecipient(envelope, account, x25519PrivateKey, {
      address: recipientAddress,
      publicKey: recipientPublicKey
    })
  }, [account, keyPairs])

  /**
   * Clear cached keys
   */
  const clearKeys = useCallback(() => {
    if (account) {
      sessionStorage.removeItem(`${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`)
      clearKeyCache(account)
    }
    setKeyPairs({ x25519: null, xwing: null })
    setSignature(null)
    setCachedVersion(null)
  }, [account])

  // Clear on disconnect
  useEffect(() => {
    let ignore = false

    if (!isConnected && !ignore) {
      setKeyPairs({ x25519: null, xwing: null })
      setSignature(null)
      setCachedVersion(null)
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
    getXWingPublicKeyFromSignature,

    // On-chain key registry
    lookupOpponentKey,
    opponentHasKey,
    addRecipientByPublicKey
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
  const { decryptMetadata, canUserDecrypt, isEncrypted } = useEncryption()
  const { account, isConnected } = useWallet()

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
  const decryptMarket = useCallback(async (marketId, envelopeOverride = null) => {
    const marketIdStr = String(marketId)
    const market = markets?.find(m => String(m.id) === marketIdStr)

    if (!market && !envelopeOverride) {
      throw new Error('Market not found')
    }

    // Already cached?
    const cached = decryptionCache.get(marketIdStr)
    if (cached) {
      return cached.metadata
    }

    // Prefer an envelope handed straight to us by the caller (typically the
    // value fetchEnvelope just resolved). The markets prop only merges that
    // envelope into market.metadata on the NEXT render, so the market captured
    // in this closure can still carry the un-encrypted placeholder. Without the
    // override the first "Decrypt" click saw "not encrypted" and silently
    // no-opped, which is why decryption used to take two clicks.
    const envelope = envelopeOverride ?? market?.metadata

    // Not encrypted?
    if (!isEncrypted(envelope)) {
      return envelope
    }

    // Note: We don't hard-block based on canUserDecrypt here.
    // The UI allows participants to attempt decryption even if canUserDecrypt returns false
    // (e.g., when the user is a market participant but envelope key check fails due to version mismatch).
    // We let the actual decryption attempt determine success/failure.

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
      const decrypted = await decryptMetadata(envelope)

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
  }, [markets, decryptionCache, decryptingIds, isEncrypted, decryptMetadata, account])

  // Inject an already-decrypted metadata object into the cache. Used by the
  // open-challenge (feature 024) flow, whose terms are sealed under a code-derived
  // symmetric key — not a recipient key — so they're decrypted out-of-band (the
  // user supplies their four-word code) rather than through decryptMetadata's
  // wallet-key path. Storing the result here lets the shared view model render the
  // revealed terms exactly as it does for recipient-keyed wagers.
  const setDecryptedMetadata = useCallback((marketId, metadata) => {
    const marketIdStr = String(marketId)
    setDecryptionCache(prev => {
      const next = new Map(prev)
      next.set(marketIdStr, { metadata, timestamp: Date.now() })
      return next
    })
    setDecryptionErrors(prev => {
      if (!prev.has(marketIdStr)) return prev
      const next = new Map(prev)
      next.delete(marketIdStr)
      return next
    })
  }, [])

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

    // Inject an out-of-band decryption (open challenges — code-keyed terms)
    setDecryptedMetadata,

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
