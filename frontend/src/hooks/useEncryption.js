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

/**
 * Main encryption hook for friend markets
 */
export function useEncryption() {
  const { account, signer, isConnected } = useWallet()
  const [keyPair, setKeyPair] = useState(null)
  const [signature, setSignature] = useState(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState(null)

  // Load cached signature on mount
  useEffect(() => {
    if (account) {
      const cached = sessionStorage.getItem(`${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`)
      if (cached) {
        setSignature(cached)
        // Derive public key from cached signature
        try {
          const pubKey = publicKeyFromSignature(cached)
          setKeyPair({ publicKey: pubKey, signature: cached })
        } catch (err) {
          console.error('Failed to derive key from cached signature:', err)
        }
      }
    }
  }, [account])

  /**
   * Initialize encryption keys by signing the derivation message
   * Requires user interaction (wallet popup)
   */
  const initializeKeys = useCallback(async () => {
    if (!signer || !account) {
      throw new Error('Wallet not connected')
    }

    setIsInitializing(true)
    setError(null)

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

      return {
        signature: result.signature,
        publicKey: result.publicKey
      }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsInitializing(false)
    }
  }, [signer, account])

  /**
   * Ensure keys are initialized, prompting if needed
   */
  const ensureInitialized = useCallback(async () => {
    if (keyPair?.privateKey) {
      return { signature, publicKey: keyPair.publicKey }
    }

    // Try to derive from cached signature
    if (signature && signer) {
      const result = await deriveKeyPair(signer)
      setKeyPair({
        publicKey: result.publicKey,
        privateKey: result.privateKey,
        signature: result.signature
      })
      return { signature: result.signature, publicKey: result.publicKey }
    }

    // Need to initialize
    return initializeKeys()
  }, [signature, keyPair, signer, initializeKeys])

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
   */
  const decryptMetadata = useCallback(async (envelope) => {
    if (!signer || !account) {
      throw new Error('Wallet not connected')
    }

    await ensureInitialized()

    return decryptMarketMetadata(envelope, account, signer)
  }, [signer, account, ensureInitialized])

  /**
   * Add a participant to an encrypted market
   */
  const addParticipant = useCallback(async (envelope, newAddress, newSignature) => {
    if (!signer || !account) {
      throw new Error('Wallet not connected')
    }

    await ensureInitialized()

    return addParticipantToMarket(envelope, account, signer, newAddress, newSignature)
  }, [signer, account, ensureInitialized])

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
    if (!isConnected) {
      setKeyPair(null)
      setSignature(null)
    }
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
    if (!markets?.length) {
      setDecryptedMarkets([])
      return
    }

    if (!isConnected || !signer) {
      // Not connected - mark encrypted as not viewable
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
      setDecryptedMarkets(processed)
      return
    }

    const decryptAll = async () => {
      setIsDecrypting(true)

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

      setDecryptedMarkets(processed)
      setIsDecrypting(false)
    }

    decryptAll()
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
