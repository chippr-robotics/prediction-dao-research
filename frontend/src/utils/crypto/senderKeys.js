/**
 * Sender Keys for Group Encryption
 *
 * Implements efficient group messaging based on Signal's Sender Keys protocol.
 * Each group member maintains their own "sender key" that they use to encrypt
 * messages to the group. Other members receive this key via pairwise channels.
 *
 * Benefits over pairwise encryption:
 * - O(1) encryption per message (vs O(n) for n members)
 * - Single ciphertext for all recipients
 * - Still provides forward secrecy via chain ratcheting
 *
 * Limitations:
 * - Adding new members requires re-distributing all sender keys
 * - Compromised sender key affects only that sender's messages
 */

import {
  generateKeyPair,
  deriveKey,
  hmacSha256,
  encrypt,
  decrypt,
  concat,
  bytesToHex,
  hexToBytes,
  randomBytes
} from './primitives.js'

// KDF info strings
const SENDER_KEY_INFO = 'FairWins_SenderKey_v1'
const CHAIN_KDF_INFO = 'FairWins_SenderChain_v1'

/**
 * Sender Key State for a single sender in a group
 *
 * @typedef {Object} SenderKeyState
 * @property {Uint8Array} chainKey - Current chain key for symmetric ratchet
 * @property {Uint8Array} signatureKey - Key for authenticating messages
 * @property {number} iteration - Current chain iteration
 * @property {string} senderId - Identifier for the sender
 * @property {string} groupId - Identifier for the group
 */

/**
 * Generate a new sender key for a group
 * This should be called when joining a group or rotating keys
 *
 * @param {string} senderId - Sender's identifier (address)
 * @param {string} groupId - Group identifier (market ID)
 * @returns {SenderKeyState}
 */
export function generateSenderKey(senderId, groupId) {
  const chainKey = randomBytes(32)
  const signatureKey = randomBytes(32)

  return {
    chainKey,
    signatureKey,
    iteration: 0,
    senderId,
    groupId
  }
}

/**
 * Create a sender key distribution message
 * This is sent to other group members via their pairwise Double Ratchet sessions
 *
 * @param {SenderKeyState} senderKey
 * @returns {Object} - Distribution message to be encrypted and sent
 */
export function createSenderKeyDistribution(senderKey) {
  return {
    type: 'sender_key_distribution',
    senderId: senderKey.senderId,
    groupId: senderKey.groupId,
    chainKey: bytesToHex(senderKey.chainKey),
    signatureKey: bytesToHex(senderKey.signatureKey),
    iteration: senderKey.iteration
  }
}

/**
 * Process a received sender key distribution message
 *
 * @param {Object} distribution - Received distribution message
 * @returns {SenderKeyState}
 */
export function processSenderKeyDistribution(distribution) {
  return {
    chainKey: hexToBytes(distribution.chainKey),
    signatureKey: hexToBytes(distribution.signatureKey),
    iteration: distribution.iteration,
    senderId: distribution.senderId,
    groupId: distribution.groupId
  }
}

/**
 * Encrypt a message for the group using sender key
 *
 * @param {SenderKeyState} senderKey - Our sender key (will be modified)
 * @param {Uint8Array|Object} plaintext - Message to encrypt
 * @returns {Object} - Encrypted group message
 */
export function senderKeyEncrypt(senderKey, plaintext) {
  // Derive message key from chain
  const messageKey = deriveMessageKey(senderKey.chainKey, senderKey.iteration)

  // Ratchet the chain forward
  senderKey.chainKey = ratchetChain(senderKey.chainKey)
  senderKey.iteration++

  // Prepare plaintext
  const plaintextBytes = plaintext instanceof Uint8Array
    ? plaintext
    : new TextEncoder().encode(JSON.stringify(plaintext))

  // Create message metadata
  const metadata = {
    senderId: senderKey.senderId,
    groupId: senderKey.groupId,
    iteration: senderKey.iteration - 1 // The iteration we used
  }

  // Include metadata in AAD
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata))

  // Encrypt
  const { nonce, ciphertext } = encrypt(messageKey, plaintextBytes, metadataBytes)

  // Create MAC for authenticity
  const mac = hmacSha256(senderKey.signatureKey, concat(metadataBytes, ciphertext))

  return {
    metadata,
    ciphertext: {
      nonce: bytesToHex(nonce),
      data: bytesToHex(ciphertext)
    },
    mac: bytesToHex(mac)
  }
}

/**
 * Decrypt a group message using the sender's key
 *
 * @param {SenderKeyState} senderKey - The sender's key state (will be modified)
 * @param {Object} message - Encrypted message
 * @returns {Uint8Array} - Decrypted plaintext
 */
export function senderKeyDecrypt(senderKey, message) {
  const { metadata, ciphertext, mac } = message

  // Verify sender matches
  if (metadata.senderId !== senderKey.senderId) {
    throw new Error('Sender ID mismatch')
  }

  // Advance chain to the correct iteration if needed
  while (senderKey.iteration < metadata.iteration) {
    senderKey.chainKey = ratchetChain(senderKey.chainKey)
    senderKey.iteration++
  }

  // Derive message key
  const messageKey = deriveMessageKey(senderKey.chainKey, metadata.iteration)

  // Verify MAC
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata))
  const ciphertextBytes = hexToBytes(ciphertext.data)
  const expectedMac = hmacSha256(senderKey.signatureKey, concat(metadataBytes, ciphertextBytes))

  if (!constantTimeEqual(hexToBytes(mac), expectedMac)) {
    throw new Error('MAC verification failed')
  }

  // Decrypt
  const nonce = hexToBytes(ciphertext.nonce)
  return decrypt(messageKey, nonce, ciphertextBytes, metadataBytes)
}

/**
 * Derive a message key from chain key and iteration
 *
 * @param {Uint8Array} chainKey
 * @param {number} iteration
 * @returns {Uint8Array}
 */
function deriveMessageKey(chainKey, iteration) {
  const iterBytes = new Uint8Array(4)
  iterBytes[0] = (iteration >> 24) & 0xff
  iterBytes[1] = (iteration >> 16) & 0xff
  iterBytes[2] = (iteration >> 8) & 0xff
  iterBytes[3] = iteration & 0xff

  return deriveKey(concat(chainKey, iterBytes), new Uint8Array(0), CHAIN_KDF_INFO, 32)
}

/**
 * Ratchet the chain key forward
 *
 * @param {Uint8Array} chainKey
 * @returns {Uint8Array}
 */
function ratchetChain(chainKey) {
  return hmacSha256(chainKey, new Uint8Array([0x01]))
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
 * Group Session Manager
 * Manages sender keys for all members of a group
 */
export class GroupSession {
  /**
   * @param {string} groupId - Group identifier
   * @param {string} myId - Our identifier
   */
  constructor(groupId, myId) {
    this.groupId = groupId
    this.myId = myId
    this.mySenderKey = null
    this.memberSenderKeys = new Map() // senderId -> SenderKeyState
  }

  /**
   * Initialize our sender key for this group
   * @returns {Object} - Distribution message to send to other members
   */
  initialize() {
    this.mySenderKey = generateSenderKey(this.myId, this.groupId)
    return createSenderKeyDistribution(this.mySenderKey)
  }

  /**
   * Process a sender key distribution from another member
   * @param {Object} distribution
   */
  processMemberKey(distribution) {
    if (distribution.groupId !== this.groupId) {
      throw new Error('Group ID mismatch')
    }
    const senderKey = processSenderKeyDistribution(distribution)
    this.memberSenderKeys.set(distribution.senderId, senderKey)
  }

  /**
   * Encrypt a message for the group
   * @param {Object|Uint8Array} plaintext
   * @returns {Object}
   */
  encrypt(plaintext) {
    if (!this.mySenderKey) {
      throw new Error('Sender key not initialized')
    }
    return senderKeyEncrypt(this.mySenderKey, plaintext)
  }

  /**
   * Decrypt a message from the group
   * @param {Object} message
   * @returns {Uint8Array}
   */
  decrypt(message) {
    const senderId = message.metadata.senderId

    // Our own message
    if (senderId === this.myId) {
      throw new Error('Cannot decrypt own message')
    }

    const senderKey = this.memberSenderKeys.get(senderId)
    if (!senderKey) {
      throw new Error(`No sender key for ${senderId}`)
    }

    return senderKeyDecrypt(senderKey, message)
  }

  /**
   * Get list of members we have keys for
   * @returns {string[]}
   */
  getKnownMembers() {
    return Array.from(this.memberSenderKeys.keys())
  }

  /**
   * Check if we have a key for a specific member
   * @param {string} memberId
   * @returns {boolean}
   */
  hasMemberKey(memberId) {
    return this.memberSenderKeys.has(memberId)
  }

  /**
   * Rotate our sender key (for forward secrecy)
   * @returns {Object} - New distribution message
   */
  rotateKey() {
    this.mySenderKey = generateSenderKey(this.myId, this.groupId)
    return createSenderKeyDistribution(this.mySenderKey)
  }

  /**
   * Serialize for storage
   * @returns {Object}
   */
  serialize() {
    return {
      groupId: this.groupId,
      myId: this.myId,
      mySenderKey: this.mySenderKey ? {
        chainKey: bytesToHex(this.mySenderKey.chainKey),
        signatureKey: bytesToHex(this.mySenderKey.signatureKey),
        iteration: this.mySenderKey.iteration,
        senderId: this.mySenderKey.senderId,
        groupId: this.mySenderKey.groupId
      } : null,
      memberSenderKeys: Array.from(this.memberSenderKeys.entries()).map(([id, key]) => ({
        id,
        chainKey: bytesToHex(key.chainKey),
        signatureKey: bytesToHex(key.signatureKey),
        iteration: key.iteration,
        senderId: key.senderId,
        groupId: key.groupId
      }))
    }
  }

  /**
   * Deserialize from storage
   * @param {Object} data
   * @returns {GroupSession}
   */
  static deserialize(data) {
    const session = new GroupSession(data.groupId, data.myId)

    if (data.mySenderKey) {
      session.mySenderKey = {
        chainKey: hexToBytes(data.mySenderKey.chainKey),
        signatureKey: hexToBytes(data.mySenderKey.signatureKey),
        iteration: data.mySenderKey.iteration,
        senderId: data.mySenderKey.senderId,
        groupId: data.mySenderKey.groupId
      }
    }

    for (const member of data.memberSenderKeys || []) {
      session.memberSenderKeys.set(member.id, {
        chainKey: hexToBytes(member.chainKey),
        signatureKey: hexToBytes(member.signatureKey),
        iteration: member.iteration,
        senderId: member.senderId,
        groupId: member.groupId
      })
    }

    return session
  }
}
