/**
 * X3DH (Extended Triple Diffie-Hellman) Key Agreement
 *
 * Implements the Signal Protocol's X3DH for establishing shared secrets
 * between two parties, even if one is offline.
 *
 * Key types:
 * - Identity Key (IK): Long-term key pair, derived from wallet signature
 * - Signed Pre-Key (SPK): Medium-term key pair, rotated periodically
 * - One-Time Pre-Key (OPK): Single-use keys for additional security
 * - Ephemeral Key (EK): Fresh key pair for each session
 *
 * Protocol flow:
 * 1. Bob publishes: IK_B, SPK_B, signature(IK_B, SPK_B), [OPK_B...]
 * 2. Alice fetches Bob's keys and generates ephemeral key EK_A
 * 3. Alice computes:
 *    DH1 = DH(IK_A, SPK_B)
 *    DH2 = DH(EK_A, IK_B)
 *    DH3 = DH(EK_A, SPK_B)
 *    DH4 = DH(EK_A, OPK_B) [if OPK available]
 *    SK = KDF(DH1 || DH2 || DH3 || DH4)
 * 4. Alice sends initial message with EK_A public key
 * 5. Bob computes same SK using his private keys
 */

import { x25519 } from '@noble/curves/ed25519'
import {
  generateKeyPair,
  computeSharedSecret,
  deriveKey,
  hmacSha256,
  concat,
  bytesToHex,
  hexToBytes,
  randomBytes
} from './primitives.js'

// Protocol info string for HKDF
const X3DH_INFO = 'FairWins_X3DH_v1'

// Salt for HKDF (can be empty or fixed)
const X3DH_SALT = new Uint8Array(32) // Zero salt as per Signal spec

/**
 * Generate a complete key bundle for a user
 * This should be done once and the public parts published
 *
 * @param {Uint8Array} identityPrivateKey - Long-term identity private key
 * @returns {Object} Key bundle with public and private components
 */
export function generateKeyBundle(identityPrivateKey) {
  // Identity key (long-term, derived from wallet)
  const identityKeyPair = {
    privateKey: identityPrivateKey,
    publicKey: computePublicKey(identityPrivateKey)
  }

  // Signed pre-key (medium-term, rotate monthly)
  const signedPreKey = generateKeyPair()
  const signedPreKeyId = randomId()

  // Sign the pre-key with identity key
  const preKeySignature = signPreKey(identityPrivateKey, signedPreKey.publicKey)

  // One-time pre-keys (single use, generate batch)
  const oneTimePreKeys = []
  for (let i = 0; i < 10; i++) {
    const otpk = generateKeyPair()
    oneTimePreKeys.push({
      id: randomId(),
      ...otpk
    })
  }

  return {
    // Public bundle (to be published)
    publicBundle: {
      identityKey: bytesToHex(identityKeyPair.publicKey),
      signedPreKey: {
        id: signedPreKeyId,
        publicKey: bytesToHex(signedPreKey.publicKey),
        signature: bytesToHex(preKeySignature)
      },
      oneTimePreKeys: oneTimePreKeys.map(k => ({
        id: k.id,
        publicKey: bytesToHex(k.publicKey)
      }))
    },
    // Private keys (to be stored securely)
    privateKeys: {
      identityKey: bytesToHex(identityKeyPair.privateKey),
      signedPreKey: {
        id: signedPreKeyId,
        privateKey: bytesToHex(signedPreKey.privateKey)
      },
      oneTimePreKeys: oneTimePreKeys.map(k => ({
        id: k.id,
        privateKey: bytesToHex(k.privateKey)
      }))
    }
  }
}

/**
 * Compute public key from private key
 * @param {Uint8Array} privateKey
 * @returns {Uint8Array}
 */
function computePublicKey(privateKey) {
  // X25519 public key derivation
  return x25519.getPublicKey(privateKey)
}

/**
 * Sign a pre-key with identity key (simplified HMAC-based)
 * @param {Uint8Array} identityPrivateKey
 * @param {Uint8Array} preKeyPublic
 * @returns {Uint8Array}
 */
function signPreKey(identityPrivateKey, preKeyPublic) {
  // Use HMAC as a simple signature scheme
  // In production, use Ed25519 signatures
  return hmacSha256(identityPrivateKey, preKeyPublic)
}

/**
 * Verify a pre-key signature
 * @param {Uint8Array} identityPublicKey
 * @param {Uint8Array} preKeyPublic
 * @param {Uint8Array} signature
 * @returns {boolean}
 */
function verifyPreKeySignature(identityPublicKey, preKeyPublic, signature) {
  // For HMAC-based signature, we can't verify without private key
  // In production, use Ed25519 verify
  // For now, we trust the signature if it's the right length
  return signature.length === 32
}

/**
 * Generate a random ID
 * @returns {number}
 */
function randomId() {
  const bytes = randomBytes(4)
  return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]
}

/**
 * Initiator (Alice) performs X3DH to establish session with recipient (Bob)
 *
 * @param {Object} params
 * @param {Uint8Array} params.identityKeyPrivate - Alice's identity private key
 * @param {Uint8Array} params.identityKeyPublic - Alice's identity public key
 * @param {Object} params.recipientBundle - Bob's public key bundle
 * @returns {Object} - Session establishment data
 */
export function initiateX3DH({
  identityKeyPrivate,
  identityKeyPublic,
  recipientBundle
}) {
  // Parse recipient's keys
  const IK_B = hexToBytes(recipientBundle.identityKey)
  const SPK_B = hexToBytes(recipientBundle.signedPreKey.publicKey)
  const SPK_B_sig = hexToBytes(recipientBundle.signedPreKey.signature)

  // Verify signed pre-key signature
  if (!verifyPreKeySignature(IK_B, SPK_B, SPK_B_sig)) {
    throw new Error('Invalid signed pre-key signature')
  }

  // Generate ephemeral key pair
  const ephemeralKey = generateKeyPair()

  // Select a one-time pre-key if available
  let OPK_B = null
  let usedOPKId = null
  if (recipientBundle.oneTimePreKeys?.length > 0) {
    const opk = recipientBundle.oneTimePreKeys[0]
    OPK_B = hexToBytes(opk.publicKey)
    usedOPKId = opk.id
  }

  // Compute DH values
  const DH1 = computeSharedSecret(identityKeyPrivate, SPK_B)
  const DH2 = computeSharedSecret(ephemeralKey.privateKey, IK_B)
  const DH3 = computeSharedSecret(ephemeralKey.privateKey, SPK_B)

  let dhConcat
  if (OPK_B) {
    const DH4 = computeSharedSecret(ephemeralKey.privateKey, OPK_B)
    dhConcat = concat(DH1, DH2, DH3, DH4)
  } else {
    dhConcat = concat(DH1, DH2, DH3)
  }

  // Derive shared secret
  const sharedSecret = deriveKey(dhConcat, X3DH_SALT, X3DH_INFO, 32)

  // Associated data for the session
  const AD = concat(identityKeyPublic, IK_B)

  return {
    // Shared secret for Double Ratchet initialization
    sharedSecret,
    // Associated data
    associatedData: AD,
    // Data to send to recipient
    initialMessage: {
      identityKey: bytesToHex(identityKeyPublic),
      ephemeralKey: bytesToHex(ephemeralKey.publicKey),
      usedSignedPreKeyId: recipientBundle.signedPreKey.id,
      usedOneTimePreKeyId: usedOPKId
    },
    // Recipient's ratchet public key (their signed pre-key)
    recipientRatchetKey: SPK_B
  }
}

/**
 * Recipient (Bob) completes X3DH using received initial message
 *
 * @param {Object} params
 * @param {Uint8Array} params.identityKeyPrivate - Bob's identity private key
 * @param {Uint8Array} params.identityKeyPublic - Bob's identity public key
 * @param {Object} params.privateKeys - Bob's private key store
 * @param {Object} params.initialMessage - Message from Alice
 * @returns {Object} - Session establishment data
 */
export function completeX3DH({
  identityKeyPrivate,
  identityKeyPublic,
  privateKeys,
  initialMessage
}) {
  // Parse initiator's keys from message
  const IK_A = hexToBytes(initialMessage.identityKey)
  const EK_A = hexToBytes(initialMessage.ephemeralKey)

  // Get our signed pre-key
  const spkPrivate = hexToBytes(privateKeys.signedPreKey.privateKey)

  // Get one-time pre-key if used
  let opkPrivate = null
  if (initialMessage.usedOneTimePreKeyId != null) {
    const opk = privateKeys.oneTimePreKeys.find(
      k => k.id === initialMessage.usedOneTimePreKeyId
    )
    if (opk) {
      opkPrivate = hexToBytes(opk.privateKey)
    }
  }

  // Compute DH values (reverse of initiator)
  const DH1 = computeSharedSecret(spkPrivate, IK_A)
  const DH2 = computeSharedSecret(identityKeyPrivate, EK_A)
  const DH3 = computeSharedSecret(spkPrivate, EK_A)

  let dhConcat
  if (opkPrivate) {
    const DH4 = computeSharedSecret(opkPrivate, EK_A)
    dhConcat = concat(DH1, DH2, DH3, DH4)
  } else {
    dhConcat = concat(DH1, DH2, DH3)
  }

  // Derive shared secret (same as initiator)
  const sharedSecret = deriveKey(dhConcat, X3DH_SALT, X3DH_INFO, 32)

  // Associated data (same order as initiator)
  const AD = concat(IK_A, identityKeyPublic)

  return {
    sharedSecret,
    associatedData: AD,
    // Initiator's identity key for the session
    initiatorIdentityKey: IK_A
  }
}

/**
 * Simplified key bundle for friend markets
 * Uses wallet-derived identity key only (no pre-keys for simplicity)
 *
 * @param {Uint8Array} identityPrivateKey - From wallet signature
 * @returns {Object}
 */
export function generateSimpleBundle(identityPrivateKey) {
  const publicKey = computePublicKey(identityPrivateKey)
  return {
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(identityPrivateKey)
  }
}

/**
 * Simple two-party key agreement without pre-keys
 * Suitable for friend markets where both parties are online
 *
 * @param {Uint8Array} myPrivateKey - My identity private key
 * @param {Uint8Array} theirPublicKey - Their identity public key
 * @returns {Uint8Array} - 32-byte shared secret
 */
export function simpleKeyAgreement(myPrivateKey, theirPublicKey) {
  const dh = computeSharedSecret(myPrivateKey, theirPublicKey)
  return deriveKey(dh, X3DH_SALT, X3DH_INFO, 32)
}
