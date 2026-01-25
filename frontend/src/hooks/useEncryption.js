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
  // Utilities
  canDecrypt,
  getRecipients,
  isEncryptedEnvelope
} from '../utils/crypto/envelopeEncryption.js'

// Cache signatures in session storage
const SIGNATURE_CACHE_KEY = 'fairwins_encryption_signature'

// Global initialization promise to prevent concurrent signature requests
let initializationPromise = null

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
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState(null)

  // Load cached signature on mount and derive both keypairs (no wallet interaction needed)
  useEffect(() => {
    let ignore = false

    if (account) {
      const cached = sessionStorage.getItem(`${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`)
      if (cached && !ignore) {
        setSignature(cached)
        // Derive BOTH keypairs from cached signature
        try {
          const x25519Keys = deriveKeyPairFromSignature(cached)
          const xwingKeys = deriveXWingKeyPairFromSignature(cached)
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
          console.log('[useEncryption] Restored dual keypairs from cached signature')
        } catch (err) {
          console.error('Failed to derive keypairs from cached signature:', err)
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
        // Derive X25519 keypair (also gets the signature)
        const x25519Result = await deriveKeyPair(signer)
        // Derive X-Wing keypair from the same signature (no additional wallet popup)
        const xwingKeys = deriveXWingKeyPairFromSignature(x25519Result.signature)

        setSignature(x25519Result.signature)
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

        // Cache signature (works for deriving both key types)
        sessionStorage.setItem(
          `${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`,
          x25519Result.signature
        )

        console.log('[useEncryption] Dual keypairs initialized and cached for session')

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
   * Uses cached keys to avoid wallet popups
   */
  const decryptMetadata = useCallback(async (envelope) => {
    if (!account) {
      throw new Error('Wallet not connected')
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
  }, [signer, account, keyPairs, ensureInitialized])

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

export default useEncryption
