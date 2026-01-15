/**
 * Double Ratchet Algorithm Implementation
 *
 * Provides forward secrecy and break-in recovery for encrypted messaging.
 * Based on the Signal Protocol specification.
 *
 * Key concepts:
 * - Root Key (RK): Ratcheted with each DH exchange
 * - Chain Key (CK): Ratcheted with each message
 * - Message Key (MK): Derived from chain key, used once
 * - DH Ratchet: New key pair generated periodically
 * - Symmetric Ratchet: Chain advanced with each message
 *
 * Forward secrecy: Compromised keys don't reveal past messages
 * Break-in recovery: Future messages protected after compromise
 */

import {
  generateKeyPair,
  computeSharedSecret,
  deriveKey,
  hmacSha256,
  encrypt,
  decrypt,
  concat,
  bytesToHex,
  hexToBytes
} from './primitives.js'

// KDF info strings
const ROOT_KDF_INFO = 'FairWins_RootRatchet_v1'

// Maximum number of skipped message keys to store
const MAX_SKIP = 100

/**
 * Double Ratchet Session State
 *
 * @typedef {Object} SessionState
 * @property {Uint8Array} rootKey - Current root key
 * @property {Uint8Array} sendingChainKey - Current sending chain key
 * @property {Uint8Array} receivingChainKey - Current receiving chain key
 * @property {Uint8Array} sendingRatchetKey - Our current DH private key
 * @property {Uint8Array} sendingRatchetPublic - Our current DH public key
 * @property {Uint8Array} receivingRatchetKey - Their current DH public key
 * @property {number} sendingCounter - Messages sent in current chain
 * @property {number} receivingCounter - Messages received in current chain
 * @property {number} previousSendingCounter - Messages sent in previous chain
 * @property {Map} skippedMessageKeys - Keys for out-of-order messages
 */

/**
 * Initialize a Double Ratchet session as the initiator (Alice)
 *
 * @param {Uint8Array} sharedSecret - From X3DH
 * @param {Uint8Array} recipientRatchetKey - Bob's signed pre-key public
 * @returns {SessionState}
 */
export function initializeSessionAsInitiator(sharedSecret, recipientRatchetKey) {
  // Generate our first ratchet key pair
  const sendingRatchetKeyPair = generateKeyPair()

  // Perform initial DH ratchet step
  const dhOutput = computeSharedSecret(sendingRatchetKeyPair.privateKey, recipientRatchetKey)

  // Derive root key and sending chain key
  const { rootKey, chainKey } = kdfRootKey(sharedSecret, dhOutput)

  return {
    rootKey,
    sendingChainKey: chainKey,
    receivingChainKey: null, // Set when we receive first message
    sendingRatchetKey: sendingRatchetKeyPair.privateKey,
    sendingRatchetPublic: sendingRatchetKeyPair.publicKey,
    receivingRatchetKey: recipientRatchetKey,
    sendingCounter: 0,
    receivingCounter: 0,
    previousSendingCounter: 0,
    skippedMessageKeys: new Map()
  }
}

/**
 * Initialize a Double Ratchet session as the recipient (Bob)
 *
 * @param {Uint8Array} sharedSecret - From X3DH
 * @param {Uint8Array} ourRatchetKeyPair - Our signed pre-key (private + public)
 * @returns {SessionState}
 */
export function initializeSessionAsRecipient(sharedSecret, ourRatchetKeyPair) {
  return {
    rootKey: sharedSecret,
    sendingChainKey: null, // Set when we send first message
    receivingChainKey: null, // Set when we receive first message
    sendingRatchetKey: ourRatchetKeyPair.privateKey,
    sendingRatchetPublic: ourRatchetKeyPair.publicKey,
    receivingRatchetKey: null, // Set when we receive first message
    sendingCounter: 0,
    receivingCounter: 0,
    previousSendingCounter: 0,
    skippedMessageKeys: new Map()
  }
}

/**
 * Encrypt a message using the Double Ratchet
 *
 * @param {SessionState} state - Current session state (will be modified)
 * @param {Uint8Array|Object} plaintext - Message to encrypt
 * @param {Uint8Array} associatedData - AD from X3DH
 * @returns {{header: Object, ciphertext: Object}}
 */
export function ratchetEncrypt(state, plaintext, associatedData) {
  // Advance the sending chain
  const { chainKey, messageKey } = kdfChainKey(state.sendingChainKey)
  state.sendingChainKey = chainKey

  // Create message header
  const header = {
    ratchetKey: bytesToHex(state.sendingRatchetPublic),
    previousCounter: state.previousSendingCounter,
    counter: state.sendingCounter
  }

  // Encrypt the message
  const plaintextBytes = plaintext instanceof Uint8Array
    ? plaintext
    : new TextEncoder().encode(JSON.stringify(plaintext))

  // Include header in AAD for authentication
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const fullAD = concat(associatedData, headerBytes)

  const { nonce, ciphertext } = encrypt(messageKey, plaintextBytes, fullAD)

  // Increment counter
  state.sendingCounter++

  return {
    header,
    ciphertext: {
      nonce: bytesToHex(nonce),
      data: bytesToHex(ciphertext)
    }
  }
}

/**
 * Decrypt a message using the Double Ratchet
 *
 * @param {SessionState} state - Current session state (will be modified)
 * @param {{header: Object, ciphertext: Object}} message - Encrypted message
 * @param {Uint8Array} associatedData - AD from X3DH
 * @returns {Uint8Array|Object} - Decrypted plaintext
 */
export function ratchetDecrypt(state, message, associatedData) {
  const { header, ciphertext } = message
  const theirRatchetKey = hexToBytes(header.ratchetKey)

  // Try skipped message keys first
  const skippedKey = trySkippedMessageKey(state, theirRatchetKey, header.counter)
  if (skippedKey) {
    return decryptWithKey(skippedKey, header, ciphertext, associatedData)
  }

  // Check if we need to perform a DH ratchet step
  if (!state.receivingRatchetKey ||
      !constantTimeEqual(theirRatchetKey, state.receivingRatchetKey)) {
    // Store skipped message keys from current receiving chain
    skipMessageKeys(state, header.previousCounter)

    // Perform DH ratchet
    performDHRatchet(state, theirRatchetKey)
  }

  // Store skipped message keys
  skipMessageKeys(state, header.counter)

  // Advance receiving chain and get message key
  const { chainKey, messageKey } = kdfChainKey(state.receivingChainKey)
  state.receivingChainKey = chainKey
  state.receivingCounter++

  return decryptWithKey(messageKey, header, ciphertext, associatedData)
}

/**
 * Perform a DH ratchet step
 *
 * @param {SessionState} state
 * @param {Uint8Array} theirRatchetKey - Their new public key
 */
function performDHRatchet(state, theirRatchetKey) {
  state.previousSendingCounter = state.sendingCounter
  state.sendingCounter = 0
  state.receivingCounter = 0
  state.receivingRatchetKey = theirRatchetKey

  // Compute new receiving chain
  const dhReceive = computeSharedSecret(state.sendingRatchetKey, theirRatchetKey)
  const { rootKey: newRootKey1, chainKey: receivingChainKey } =
    kdfRootKey(state.rootKey, dhReceive)
  state.rootKey = newRootKey1
  state.receivingChainKey = receivingChainKey

  // Generate new sending ratchet key
  const newRatchetKeyPair = generateKeyPair()
  state.sendingRatchetKey = newRatchetKeyPair.privateKey
  state.sendingRatchetPublic = newRatchetKeyPair.publicKey

  // Compute new sending chain
  const dhSend = computeSharedSecret(state.sendingRatchetKey, theirRatchetKey)
  const { rootKey: newRootKey2, chainKey: sendingChainKey } =
    kdfRootKey(state.rootKey, dhSend)
  state.rootKey = newRootKey2
  state.sendingChainKey = sendingChainKey
}

/**
 * Root key KDF - derives new root key and chain key
 *
 * @param {Uint8Array} rootKey - Current root key
 * @param {Uint8Array} dhOutput - DH shared secret
 * @returns {{rootKey: Uint8Array, chainKey: Uint8Array}}
 */
function kdfRootKey(rootKey, dhOutput) {
  const input = concat(rootKey, dhOutput)
  const output = deriveKey(input, new Uint8Array(0), ROOT_KDF_INFO, 64)
  return {
    rootKey: output.slice(0, 32),
    chainKey: output.slice(32, 64)
  }
}

/**
 * Chain key KDF - derives new chain key and message key
 *
 * @param {Uint8Array} chainKey - Current chain key
 * @returns {{chainKey: Uint8Array, messageKey: Uint8Array}}
 */
function kdfChainKey(chainKey) {
  // Use HMAC to derive message key and next chain key
  const messageKey = hmacSha256(chainKey, new Uint8Array([0x01]))
  const newChainKey = hmacSha256(chainKey, new Uint8Array([0x02]))
  return {
    chainKey: newChainKey,
    messageKey
  }
}

/**
 * Try to find a skipped message key
 *
 * @param {SessionState} state
 * @param {Uint8Array} ratchetKey
 * @param {number} counter
 * @returns {Uint8Array|null}
 */
function trySkippedMessageKey(state, ratchetKey, counter) {
  const key = `${bytesToHex(ratchetKey)}:${counter}`
  const messageKey = state.skippedMessageKeys.get(key)
  if (messageKey) {
    state.skippedMessageKeys.delete(key)
    return hexToBytes(messageKey)
  }
  return null
}

/**
 * Store skipped message keys
 *
 * @param {SessionState} state
 * @param {number} until - Counter to skip until
 */
function skipMessageKeys(state, until) {
  if (!state.receivingChainKey) return

  while (state.receivingCounter < until) {
    const { chainKey, messageKey } = kdfChainKey(state.receivingChainKey)
    state.receivingChainKey = chainKey

    const key = `${bytesToHex(state.receivingRatchetKey)}:${state.receivingCounter}`
    state.skippedMessageKeys.set(key, bytesToHex(messageKey))

    state.receivingCounter++

    // Limit stored keys to prevent memory exhaustion
    if (state.skippedMessageKeys.size > MAX_SKIP) {
      // Remove oldest keys
      const keys = Array.from(state.skippedMessageKeys.keys())
      state.skippedMessageKeys.delete(keys[0])
    }
  }
}

/**
 * Decrypt message with a specific key
 *
 * @param {Uint8Array} messageKey
 * @param {Object} header
 * @param {Object} ciphertext
 * @param {Uint8Array} associatedData
 * @returns {Uint8Array}
 */
function decryptWithKey(messageKey, header, ciphertext, associatedData) {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const fullAD = concat(associatedData, headerBytes)

  const nonce = hexToBytes(ciphertext.nonce)
  const data = hexToBytes(ciphertext.data)

  return decrypt(messageKey, nonce, data, fullAD)
}

/**
 * Constant-time comparison
 */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

/**
 * Serialize session state for storage
 *
 * @param {SessionState} state
 * @returns {Object}
 */
export function serializeSession(state) {
  return {
    rootKey: bytesToHex(state.rootKey),
    sendingChainKey: state.sendingChainKey ? bytesToHex(state.sendingChainKey) : null,
    receivingChainKey: state.receivingChainKey ? bytesToHex(state.receivingChainKey) : null,
    sendingRatchetKey: bytesToHex(state.sendingRatchetKey),
    sendingRatchetPublic: bytesToHex(state.sendingRatchetPublic),
    receivingRatchetKey: state.receivingRatchetKey ? bytesToHex(state.receivingRatchetKey) : null,
    sendingCounter: state.sendingCounter,
    receivingCounter: state.receivingCounter,
    previousSendingCounter: state.previousSendingCounter,
    skippedMessageKeys: Object.fromEntries(state.skippedMessageKeys)
  }
}

/**
 * Deserialize session state from storage
 *
 * @param {Object} data
 * @returns {SessionState}
 */
export function deserializeSession(data) {
  return {
    rootKey: hexToBytes(data.rootKey),
    sendingChainKey: data.sendingChainKey ? hexToBytes(data.sendingChainKey) : null,
    receivingChainKey: data.receivingChainKey ? hexToBytes(data.receivingChainKey) : null,
    sendingRatchetKey: hexToBytes(data.sendingRatchetKey),
    sendingRatchetPublic: hexToBytes(data.sendingRatchetPublic),
    receivingRatchetKey: data.receivingRatchetKey ? hexToBytes(data.receivingRatchetKey) : null,
    sendingCounter: data.sendingCounter,
    receivingCounter: data.receivingCounter,
    previousSendingCounter: data.previousSendingCounter,
    skippedMessageKeys: new Map(Object.entries(data.skippedMessageKeys || {}))
  }
}
