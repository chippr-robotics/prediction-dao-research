/**
 * DEPRECATED: This file is kept for reference only.
 * 
 * This implementation has been superseded by crypto/envelopeEncryption.js
 * which uses the more modern @noble/curves library and envelope encryption pattern.
 * 
 * DO NOT USE this file for new code. Import from crypto/envelopeEncryption.js instead.
 * 
 * ---
 * 
 * ECDH Encryption Utilities for Friend Market Privacy
 *
 * Uses X25519-XSalsa20-Poly1305 (NaCl box) for authenticated encryption.
 * Keys are derived from wallet signatures for deterministic key generation.
 *
 * Flow:
 * 1. User signs deterministic message -> derive encryption keypair
 * 2. For 1v1 markets, both parties can derive shared secret
 * 3. Metadata encrypted with shared secret, only participants can decrypt
 */

import nacl from 'tweetnacl'
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util'
import { keccak256, toUtf8Bytes, getBytes, hexlify, recoverPublicKey, hashMessage } from 'ethers'
import {
  KEY_DERIVATION_MESSAGE,
  ENCRYPTION_ALGORITHM,
  CURRENT_ENCRYPTION_VERSION
} from './crypto/constants'

// Re-export for backwards compatibility
export { ENCRYPTION_ALGORITHM, CURRENT_ENCRYPTION_VERSION }

/**
 * Derive a deterministic X25519 keypair from a wallet signature
 *
 * The same wallet signing the same message will always produce the same keypair.
 * This allows key recovery without storing private keys.
 *
 * @param {object} signer - Ethers signer object
 * @returns {Promise<{publicKey: Uint8Array, secretKey: Uint8Array}>}
 */
export async function deriveEncryptionKeyPair(signer) {
  // Sign the deterministic message
  const signature = await signer.signMessage(KEY_DERIVATION_MESSAGE)

  // Hash the signature to get 32 bytes of entropy
  const hash = keccak256(toUtf8Bytes(signature))

  // Convert to Uint8Array (remove 0x prefix, take 32 bytes)
  const seed = getBytes(hash)

  // Generate X25519 keypair from seed
  return nacl.box.keyPair.fromSecretKey(seed)
}

/**
 * Extract the signer's public key from a signature
 *
 * This allows the recipient to derive the sender's encryption public key
 * without an on-chain registry.
 *
 * @param {string} signature - Signature of KEY_DERIVATION_MESSAGE
 * @returns {Uint8Array} - X25519 public key
 */
export function derivePublicKeyFromSignature(signature) {
  // Recover the Ethereum public key from the signature (not used but validates signature)
  const messageHash = hashMessage(KEY_DERIVATION_MESSAGE)
  recoverPublicKey(messageHash, signature)

  // Hash the recovered public key to get encryption seed
  const hash = keccak256(toUtf8Bytes(signature))
  const seed = getBytes(hash)

  // Generate the same keypair and return public key
  const keyPair = nacl.box.keyPair.fromSecretKey(seed)
  return keyPair.publicKey
}

/**
 * Get the signature needed for key derivation (to share with opponent)
 *
 * @param {object} signer - Ethers signer object
 * @returns {Promise<string>} - Signature hex string
 */
export async function getKeyDerivationSignature(signer) {
  return await signer.signMessage(KEY_DERIVATION_MESSAGE)
}

/**
 * Encrypt market metadata for a 1v1 friend market
 *
 * @param {object} metadata - Market metadata object
 * @param {Uint8Array} mySecretKey - Sender's X25519 secret key
 * @param {Uint8Array} theirPublicKey - Recipient's X25519 public key
 * @returns {object} - Encrypted metadata wrapper
 */
export function encryptMetadata(metadata, mySecretKey, theirPublicKey) {
  // Generate random nonce
  const nonce = nacl.randomBytes(nacl.box.nonceLength)

  // Convert metadata to bytes
  const messageBytes = decodeUTF8(JSON.stringify(metadata))

  // Encrypt with NaCl box (authenticated encryption)
  const ciphertext = nacl.box(messageBytes, nonce, theirPublicKey, mySecretKey)

  if (!ciphertext) {
    throw new Error('Encryption failed')
  }

  return {
    encrypted: true,
    version: '1.0',
    algorithm: ENCRYPTION_ALGORITHM,
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext)
  }
}

/**
 * Decrypt market metadata for a 1v1 friend market
 *
 * @param {object} encryptedData - Encrypted metadata wrapper
 * @param {Uint8Array} mySecretKey - Recipient's X25519 secret key
 * @param {Uint8Array} theirPublicKey - Sender's X25519 public key
 * @returns {object} - Decrypted metadata object
 */
export function decryptMetadata(encryptedData, mySecretKey, theirPublicKey) {
  if (!encryptedData.encrypted) {
    throw new Error('Data is not encrypted')
  }

  if (encryptedData.algorithm !== ENCRYPTION_ALGORITHM) {
    throw new Error(`Unsupported algorithm: ${encryptedData.algorithm}`)
  }

  // Decode from base64
  const nonce = decodeBase64(encryptedData.nonce)
  const ciphertext = decodeBase64(encryptedData.ciphertext)

  // Decrypt with NaCl box.open
  const decrypted = nacl.box.open(ciphertext, nonce, theirPublicKey, mySecretKey)

  if (!decrypted) {
    throw new Error('Decryption failed - invalid key or corrupted data')
  }

  // Parse JSON
  return JSON.parse(encodeUTF8(decrypted))
}

/**
 * Create encrypted metadata for a friend market with all required fields
 *
 * @param {object} params - Creation parameters
 * @param {object} params.metadata - Standard market metadata
 * @param {object} params.signer - Ethers signer object
 * @param {string} params.opponentSignature - Opponent's key derivation signature
 * @param {string} params.creatorAddress - Creator's address
 * @param {string} params.opponentAddress - Opponent's address
 * @returns {Promise<object>} - Complete encrypted metadata with signatures
 */
export async function createEncryptedFriendMarketMetadata({
  metadata,
  signer,
  opponentSignature,
  creatorAddress,
  opponentAddress
}) {
  // Get creator's keypair and signature
  const creatorKeyPair = await deriveEncryptionKeyPair(signer)
  const creatorSignature = await getKeyDerivationSignature(signer)

  // Derive opponent's public key from their signature
  const opponentPublicKey = derivePublicKeyFromSignature(opponentSignature)

  // Encrypt the metadata
  const encryptedContent = encryptMetadata(
    metadata,
    creatorKeyPair.secretKey,
    opponentPublicKey
  )

  // Add participant info and signatures for decryption
  return {
    ...encryptedContent,
    participants: [
      creatorAddress.toLowerCase(),
      opponentAddress.toLowerCase()
    ],
    signatures: {
      [creatorAddress.toLowerCase()]: creatorSignature,
      [opponentAddress.toLowerCase()]: opponentSignature
    }
  }
}

/**
 * Decrypt friend market metadata if the current user is a participant
 *
 * @param {object} encryptedData - Encrypted metadata from IPFS
 * @param {object} signer - Ethers signer object
 * @param {string} currentAddress - Current user's address
 * @returns {Promise<object|null>} - Decrypted metadata or null if not participant
 */
export async function decryptFriendMarketMetadata(encryptedData, signer, currentAddress) {
  // Check if user is a participant
  const normalizedAddress = currentAddress.toLowerCase()
  if (!encryptedData.participants?.includes(normalizedAddress)) {
    return null
  }

  // Get my keypair
  const myKeyPair = await deriveEncryptionKeyPair(signer)

  // Find the other participant
  const otherParticipant = encryptedData.participants.find(
    addr => addr !== normalizedAddress
  )

  // Get their signature and derive their public key
  const theirSignature = encryptedData.signatures?.[otherParticipant]
  if (!theirSignature) {
    throw new Error('Missing signature for other participant')
  }

  const theirPublicKey = derivePublicKeyFromSignature(theirSignature)

  // Decrypt
  return decryptMetadata(encryptedData, myKeyPair.secretKey, theirPublicKey)
}

/**
 * Check if metadata is encrypted
 *
 * @param {object} metadata - Metadata object from IPFS
 * @returns {boolean}
 */
export function isEncryptedMetadata(metadata) {
  return metadata?.encrypted === true &&
         metadata?.algorithm === ENCRYPTION_ALGORITHM &&
         metadata?.ciphertext != null
}

/**
 * Check if current user can decrypt the metadata
 *
 * @param {object} metadata - Encrypted metadata object
 * @param {string} currentAddress - Current user's address
 * @returns {boolean}
 */
export function canDecryptMetadata(metadata, currentAddress) {
  if (!isEncryptedMetadata(metadata)) {
    return true // Not encrypted, anyone can read
  }

  const normalizedAddress = currentAddress?.toLowerCase()
  return metadata.participants?.includes(normalizedAddress)
}

/**
 * Convert public key to hex string for display/storage
 *
 * @param {Uint8Array} publicKey - X25519 public key
 * @returns {string} - Hex string with 0x prefix
 */
export function publicKeyToHex(publicKey) {
  return hexlify(publicKey)
}

/**
 * Convert hex string back to public key
 *
 * @param {string} hex - Hex string with or without 0x prefix
 * @returns {Uint8Array} - X25519 public key
 */
export function hexToPublicKey(hex) {
  return getBytes(hex)
}
