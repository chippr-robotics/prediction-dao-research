/**
 * Envelope Encryption for Friend Market Privacy
 *
 * Simple, sustainable encryption model for friend markets:
 * 1. Creator generates a random Data Encryption Key (DEK)
 * 2. Market metadata encrypted once with DEK
 * 3. DEK encrypted separately for each participant using their public key
 * 4. Participants decrypt the DEK, then decrypt the content
 *
 * Benefits:
 * - O(1) content encryption regardless of group size
 * - Simple key management
 * - Easy to add/remove participants
 * - Appropriate for static content (not ongoing messaging)
 */

import { x25519 } from '@noble/curves/ed25519'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { chacha20poly1305 } from '@noble/ciphers/chacha'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils'
import { keccak256, toUtf8Bytes, getBytes } from 'ethers'
import {
  CURRENT_ENCRYPTION_VERSION,
  getMarketSigningMessage,
  ENVELOPE_INFO
} from './constants.js'

/**
 * Derive an X25519 key pair from a wallet signature
 * Deterministic: same wallet + same version always produces same keypair
 *
 * @param {Object} signer - Ethers signer
 * @param {number} [version=CURRENT_ENCRYPTION_VERSION] - Signing message version
 * @returns {Promise<{publicKey: Uint8Array, privateKey: Uint8Array, signature: string, version: number}>}
 */
export async function deriveKeyPair(signer, version = CURRENT_ENCRYPTION_VERSION) {
  const message = getMarketSigningMessage(version)
  const signature = await signer.signMessage(message)
  const hash = keccak256(toUtf8Bytes(signature))
  const privateKey = getBytes(hash)
  const publicKey = x25519.getPublicKey(privateKey)

  return {
    publicKey,
    privateKey,
    signature, // Include for sharing with others
    version    // Include version for decryption
  }
}

/**
 * Derive a public key from a signature
 * Allows getting someone's encryption public key from their signature
 *
 * @param {string} signature - Their signature of KEY_DERIVATION_MESSAGE
 * @returns {Uint8Array} - Their X25519 public key
 */
export function publicKeyFromSignature(signature) {
  const hash = keccak256(toUtf8Bytes(signature))
  const privateKey = getBytes(hash)
  return x25519.getPublicKey(privateKey)
}

/**
 * Derive full keypair from a cached signature (no wallet interaction)
 * Use this when you have a cached signature and need both public and private keys
 *
 * @param {string} signature - Cached signature of KEY_DERIVATION_MESSAGE
 * @returns {{publicKey: Uint8Array, privateKey: Uint8Array, signature: string}}
 */
export function deriveKeyPairFromSignature(signature) {
  const hash = keccak256(toUtf8Bytes(signature))
  const privateKey = getBytes(hash)
  const publicKey = x25519.getPublicKey(privateKey)

  return {
    publicKey,
    privateKey,
    signature
  }
}

/**
 * Encrypt data for multiple recipients using envelope encryption
 *
 * @param {Object|string} data - Data to encrypt
 * @param {Array<{address: string, publicKey: Uint8Array}>} recipients - List of recipients
 * @param {number} [signingVersion=CURRENT_ENCRYPTION_VERSION] - Signing message version used for key derivation
 * @returns {Object} - Encrypted envelope with version info
 */
export function encryptEnvelope(data, recipients, signingVersion = CURRENT_ENCRYPTION_VERSION) {
  // 1. Generate random Data Encryption Key (DEK)
  const dek = randomBytes(32)

  // 2. Encrypt the content with DEK
  const plaintext = typeof data === 'string'
    ? utf8ToBytes(data)
    : utf8ToBytes(JSON.stringify(data))

  const contentNonce = randomBytes(12)
  const cipher = chacha20poly1305(dek, contentNonce)
  const encryptedContent = cipher.encrypt(plaintext)

  // 3. Encrypt DEK for each recipient using X25519 + HKDF + ChaCha20
  const wrappedKeys = recipients.map(recipient => {
    const ephemeralKeyPair = generateEphemeralKeyPair()

    // ECDH to derive shared secret
    const sharedSecret = x25519.getSharedSecret(
      ephemeralKeyPair.privateKey,
      recipient.publicKey
    )

    // Derive key encryption key from shared secret
    const kek = hkdf(sha256, sharedSecret, new Uint8Array(0), ENVELOPE_INFO, 32)

    // Encrypt DEK with KEK
    const keyNonce = randomBytes(12)
    const keyCipher = chacha20poly1305(kek, keyNonce)
    const wrappedDek = keyCipher.encrypt(dek)

    return {
      address: recipient.address.toLowerCase(),
      ephemeralPublicKey: bytesToHex(ephemeralKeyPair.publicKey),
      nonce: bytesToHex(keyNonce),
      wrappedKey: bytesToHex(wrappedDek)
    }
  })

  return {
    version: '1.0',
    algorithm: 'x25519-chacha20poly1305',
    // Store the signing message version for decryption
    signingVersion: signingVersion,
    content: {
      nonce: bytesToHex(contentNonce),
      ciphertext: bytesToHex(encryptedContent)
    },
    keys: wrappedKeys
  }
}

/**
 * Decrypt an envelope using our private key
 *
 * @param {Object} envelope - Encrypted envelope
 * @param {string} myAddress - Our address
 * @param {Uint8Array} myPrivateKey - Our X25519 private key
 * @returns {Object|string} - Decrypted data
 */
export function decryptEnvelope(envelope, myAddress, myPrivateKey) {
  const normalizedAddress = myAddress.toLowerCase()

  // Find our wrapped key
  const wrappedKeyEntry = envelope.keys.find(
    k => k.address === normalizedAddress
  )

  if (!wrappedKeyEntry) {
    throw new Error('No key found for this address')
  }

  // Reconstruct the shared secret using ECDH
  const ephemeralPublicKey = hexToBytes(wrappedKeyEntry.ephemeralPublicKey)
  const sharedSecret = x25519.getSharedSecret(myPrivateKey, ephemeralPublicKey)

  // Derive key encryption key
  const kek = hkdf(sha256, sharedSecret, new Uint8Array(0), ENVELOPE_INFO, 32)

  // Decrypt the DEK
  const keyNonce = hexToBytes(wrappedKeyEntry.nonce)
  const wrappedKey = hexToBytes(wrappedKeyEntry.wrappedKey)
  const keyCipher = chacha20poly1305(kek, keyNonce)
  const dek = keyCipher.decrypt(wrappedKey)

  // Decrypt the content
  const contentNonce = hexToBytes(envelope.content.nonce)
  const ciphertext = hexToBytes(envelope.content.ciphertext)
  const contentCipher = chacha20poly1305(dek, contentNonce)
  const plaintext = contentCipher.decrypt(ciphertext)

  // Parse as JSON if possible
  const decoded = new TextDecoder().decode(plaintext)
  try {
    return JSON.parse(decoded)
  } catch {
    return decoded
  }
}

/**
 * Add a new recipient to an existing envelope
 * Requires the DEK, which means an existing recipient must do this
 *
 * @param {Object} envelope - Existing encrypted envelope
 * @param {string} existingRecipientAddress - Address of existing recipient
 * @param {Uint8Array} existingRecipientPrivateKey - Private key to decrypt DEK
 * @param {{address: string, publicKey: Uint8Array}} newRecipient - New recipient to add
 * @returns {Object} - Updated envelope
 */
export function addRecipient(envelope, existingRecipientAddress, existingRecipientPrivateKey, newRecipient) {
  // First, recover the DEK
  const normalizedAddress = existingRecipientAddress.toLowerCase()
  const wrappedKeyEntry = envelope.keys.find(k => k.address === normalizedAddress)

  if (!wrappedKeyEntry) {
    throw new Error('Not a recipient of this envelope')
  }

  // Decrypt DEK
  const ephemeralPublicKey = hexToBytes(wrappedKeyEntry.ephemeralPublicKey)
  const sharedSecret = x25519.getSharedSecret(existingRecipientPrivateKey, ephemeralPublicKey)
  const kek = hkdf(sha256, sharedSecret, new Uint8Array(0), ENVELOPE_INFO, 32)
  const keyNonce = hexToBytes(wrappedKeyEntry.nonce)
  const wrappedKey = hexToBytes(wrappedKeyEntry.wrappedKey)
  const keyCipher = chacha20poly1305(kek, keyNonce)
  const dek = keyCipher.decrypt(wrappedKey)

  // Encrypt DEK for new recipient
  const ephemeralKeyPair = generateEphemeralKeyPair()
  const newSharedSecret = x25519.getSharedSecret(ephemeralKeyPair.privateKey, newRecipient.publicKey)
  const newKek = hkdf(sha256, newSharedSecret, new Uint8Array(0), ENVELOPE_INFO, 32)
  const newKeyNonce = randomBytes(12)
  const newKeyCipher = chacha20poly1305(newKek, newKeyNonce)
  const newWrappedDek = newKeyCipher.encrypt(dek)

  // Add to envelope
  const newWrappedKey = {
    address: newRecipient.address.toLowerCase(),
    ephemeralPublicKey: bytesToHex(ephemeralKeyPair.publicKey),
    nonce: bytesToHex(newKeyNonce),
    wrappedKey: bytesToHex(newWrappedDek)
  }

  return {
    ...envelope,
    keys: [...envelope.keys, newWrappedKey]
  }
}

/**
 * Remove a recipient from an envelope
 * Note: This doesn't re-encrypt - they may still have the DEK cached
 * For true revocation, create a new envelope with new DEK
 *
 * @param {Object} envelope - Encrypted envelope
 * @param {string} addressToRemove - Address to remove
 * @returns {Object} - Updated envelope
 */
export function removeRecipient(envelope, addressToRemove) {
  const normalized = addressToRemove.toLowerCase()
  return {
    ...envelope,
    keys: envelope.keys.filter(k => k.address !== normalized)
  }
}

/**
 * Check if an address can decrypt an envelope
 *
 * @param {Object} envelope - Encrypted envelope
 * @param {string} address - Address to check
 * @returns {boolean}
 */
export function canDecrypt(envelope, address) {
  if (!envelope?.keys) return false
  const normalized = address?.toLowerCase()
  return envelope.keys.some(k => k.address === normalized)
}

/**
 * Get list of recipients who can decrypt
 *
 * @param {Object} envelope - Encrypted envelope
 * @returns {string[]} - Array of addresses
 */
export function getRecipients(envelope) {
  if (!envelope?.keys) return []
  return envelope.keys.map(k => k.address)
}

/**
 * Check if data is an encrypted envelope
 *
 * @param {Object} data
 * @returns {boolean}
 */
export function isEncryptedEnvelope(data) {
  return data?.version === '1.0' &&
         data?.algorithm === 'x25519-chacha20poly1305' &&
         data?.content?.ciphertext != null &&
         Array.isArray(data?.keys)
}

// ==================== Helper Functions ====================

/**
 * Generate an ephemeral X25519 key pair
 */
function generateEphemeralKeyPair() {
  const privateKey = randomBytes(32)
  const publicKey = x25519.getPublicKey(privateKey)
  return { privateKey, publicKey }
}

// ==================== High-Level API ====================

/**
 * Encrypt market metadata for a friend market
 *
 * @param {Object} metadata - Market metadata (name, description, etc.)
 * @param {Array<{address: string, signature: string}>} participants - Participants with signatures
 * @param {number} [signingVersion=CURRENT_ENCRYPTION_VERSION] - Signing message version
 * @returns {Object} - Encrypted envelope ready for IPFS
 */
export function encryptMarketMetadata(metadata, participants, signingVersion = CURRENT_ENCRYPTION_VERSION) {
  // Convert signatures to public keys
  const recipients = participants.map(p => ({
    address: p.address,
    publicKey: publicKeyFromSignature(p.signature)
  }))

  return encryptEnvelope(metadata, recipients, signingVersion)
}

/**
 * Decrypt market metadata
 *
 * Uses the signing version stored in the envelope to derive the correct keys.
 * For backwards compatibility, assumes version 1 if not specified.
 *
 * @param {Object} envelope - Encrypted envelope from IPFS
 * @param {string} myAddress - Our address
 * @param {Object|Uint8Array} signerOrPrivateKey - Ethers signer OR cached private key
 * @returns {Promise<Object>} - Decrypted metadata
 */
export async function decryptMarketMetadata(envelope, myAddress, signerOrPrivateKey) {
  // Get the signing version from envelope (default to 1 for backwards compatibility)
  const signingVersion = envelope.signingVersion || 1

  // If it's already a Uint8Array (cached private key), use it directly
  // Note: cached private keys are version-specific, caller must ensure correct version
  let privateKey
  if (signerOrPrivateKey instanceof Uint8Array) {
    privateKey = signerOrPrivateKey
  } else {
    // It's a signer - derive the key with the correct version (requires wallet popup)
    const result = await deriveKeyPair(signerOrPrivateKey, signingVersion)
    privateKey = result.privateKey
  }
  return decryptEnvelope(envelope, myAddress, privateKey)
}

/**
 * Get the signing version required to decrypt an envelope
 * Useful for UI to inform users which signing message will be shown
 *
 * @param {Object} envelope - Encrypted envelope
 * @returns {number} - Signing version (defaults to 1 for legacy envelopes)
 */
export function getEnvelopeSigningVersion(envelope) {
  return envelope?.signingVersion || 1
}

/**
 * Create encrypted friend market metadata with creator as first recipient
 *
 * @param {Object} metadata - Market metadata
 * @param {Object} signer - Creator's signer
 * @param {string} creatorAddress - Creator's address
 * @returns {Promise<{envelope: Object, creatorSignature: string, signingVersion: number}>}
 */
export async function createEncryptedMarket(metadata, signer, creatorAddress) {
  // Use current version for new markets
  const { signature, version } = await deriveKeyPair(signer, CURRENT_ENCRYPTION_VERSION)

  // Start with just creator as recipient
  const envelope = encryptMarketMetadata(metadata, [
    { address: creatorAddress, signature }
  ], version)

  return {
    envelope,
    creatorSignature: signature,
    signingVersion: version
  }
}

/**
 * Add a participant to an encrypted market
 *
 * IMPORTANT: The new participant must have signed with the SAME version
 * as the original market. Use getEnvelopeSigningVersion() to determine
 * which signing message to present to the new participant.
 *
 * @param {Object} envelope - Existing envelope
 * @param {string} existingAddress - An existing recipient's address
 * @param {Object|Uint8Array} existingSignerOrPrivateKey - Existing recipient's signer OR cached private key
 * @param {string} newAddress - New participant's address
 * @param {string} newSignature - New participant's key derivation signature (must be same version as envelope)
 * @returns {Promise<Object>} - Updated envelope
 */
export async function addParticipantToMarket(envelope, existingAddress, existingSignerOrPrivateKey, newAddress, newSignature) {
  // Get the signing version from the envelope
  const signingVersion = envelope.signingVersion || 1

  // If it's already a Uint8Array (cached private key), use it directly
  let privateKey
  if (existingSignerOrPrivateKey instanceof Uint8Array) {
    privateKey = existingSignerOrPrivateKey
  } else {
    // It's a signer - derive the key with the envelope's version (requires wallet popup)
    const result = await deriveKeyPair(existingSignerOrPrivateKey, signingVersion)
    privateKey = result.privateKey
  }

  const newPublicKey = publicKeyFromSignature(newSignature)

  return addRecipient(envelope, existingAddress, privateKey, {
    address: newAddress,
    publicKey: newPublicKey
  })
}
