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
  deriveKeyPair,
  deriveKeyPairFromSignature,
  publicKeyFromSignature,
  encryptMarketMetadata,
  decryptMarketMetadata,
  createEncryptedMarket,
  addParticipantToMarket,
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
 */
export function useEncryption() {
  const { account, signer, isConnected } = useWallet()
  const [keyPair, setKeyPair] = useState(null)
  const [signature, setSignature] = useState(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState(null)

  // Load cached signature on mount and derive full keypair (no wallet interaction needed)
  useEffect(() => {
    let ignore = false

    if (account) {
      const cached = sessionStorage.getItem(`${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`)
      if (cached && !ignore) {
        setSignature(cached)
        // Derive FULL keypair from cached signature (including privateKey for decryption)
        try {
          const keys = deriveKeyPairFromSignature(cached)
          if (!ignore) {
            setKeyPair(keys)
          }
          console.log('[useEncryption] Restored keypair from cached signature')
        } catch (err) {
          console.error('Failed to derive keypair from cached signature:', err)
        }
      }
    }

    return () => { ignore = true }
  }, [account])

  /**
   * Initialize encryption keys by signing the derivation message
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
        const result = await deriveKeyPair(signer)
        setSignature(result.signature)
        setKeyPair({
          publicKey: result.publicKey,
          privateKey: result.privateKey,
          signature: result.signature
        })

        // Cache signature
        sessionStorage.setItem(
          `${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`,
          result.signature
        )

        console.log('[useEncryption] Keys initialized and cached for session')

        return {
          signature: result.signature,
          publicKey: result.publicKey
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
    // Already have full keypair
    if (keyPair?.privateKey) {
      return { signature, publicKey: keyPair.publicKey }
    }

    // Try to derive from cached signature WITHOUT wallet interaction
    if (signature) {
      const keys = deriveKeyPairFromSignature(signature)
      setKeyPair(keys)
      console.log('[useEncryption] Derived keypair from cached signature (no wallet popup)')
      return { signature, publicKey: keys.publicKey }
    }

    // No cached signature - need to prompt user to sign
    return initializeKeys()
  }, [signature, keyPair, initializeKeys])

  /**
   * Create encrypted market metadata
   * Returns envelope ready for IPFS upload
   */
  const createEncrypted = useCallback(async (metadata) => {
    if (!signer || !account) {
      throw new Error('Wallet not connected')
    }

    await ensureInitialized()

    return createEncryptedMarket(metadata, signer, account)
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
   * Uses cached private key to avoid wallet popups
   */
  const decryptMetadata = useCallback(async (envelope) => {
    if (!account) {
      throw new Error('Wallet not connected')
    }

    // Ensure we have keys (may prompt user once if no cached signature)
    await ensureInitialized()

    // Use cached private key if available (no wallet popup)
    if (keyPair?.privateKey) {
      return decryptMarketMetadata(envelope, account, keyPair.privateKey)
    }

    // Fallback to signer if no cached key (shouldn't happen after ensureInitialized)
    if (!signer) {
      throw new Error('No signer available')
    }
    return decryptMarketMetadata(envelope, account, signer)
  }, [signer, account, keyPair, ensureInitialized])

  /**
   * Add a participant to an encrypted market
   * Uses cached private key to avoid wallet popups
   */
  const addParticipant = useCallback(async (envelope, newAddress, newSignature) => {
    if (!account) {
      throw new Error('Wallet not connected')
    }

    await ensureInitialized()

    // Use cached private key if available (no wallet popup)
    if (keyPair?.privateKey) {
      return addParticipantToMarket(envelope, account, keyPair.privateKey, newAddress, newSignature)
    }

    // Fallback to signer if no cached key
    if (!signer) {
      throw new Error('No signer available')
    }
    return addParticipantToMarket(envelope, account, signer, newAddress, newSignature)
  }, [signer, account, keyPair, ensureInitialized])

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
   * Get public key for another user from their signature
   */
  const getPublicKeyFromSignature = useCallback((sig) => {
    return publicKeyFromSignature(sig)
  }, [])

  /**
   * Clear cached keys
   */
  const clearKeys = useCallback(() => {
    if (account) {
      sessionStorage.removeItem(`${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`)
    }
    setKeyPair(null)
    setSignature(null)
  }, [account])

  // Clear on disconnect
  useEffect(() => {
    let ignore = false

    if (!isConnected && !ignore) {
      setKeyPair(null)
      setSignature(null)
    }

    return () => { ignore = true }
  }, [isConnected])

  return {
    // State
    isInitialized: !!keyPair?.privateKey,
    isInitializing,
    error,
    signature,
    publicKey: keyPair?.publicKey,

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
    getPublicKeyFromSignature
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
