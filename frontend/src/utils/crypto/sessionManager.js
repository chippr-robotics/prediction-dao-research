/**
 * Unified Session Manager for Friend Market Encryption
 *
 * Provides a high-level API for managing encrypted communications
 * in friend markets, supporting both 1v1 and group scenarios.
 *
 * Features:
 * - Automatic session establishment via X3DH
 * - Double Ratchet for 1v1 forward-secret messaging
 * - Sender Keys for efficient group messaging
 * - Persistent session storage
 * - Key rotation and management
 */

import { keccak256, toUtf8Bytes, getBytes } from 'ethers'
import {
  generateKeyPair,
  bytesToHex,
  hexToBytes
} from './primitives.js'
import {
  generateKeyBundle,
  initiateX3DH,
  completeX3DH
} from './x3dh.js'
import {
  initializeSessionAsInitiator,
  initializeSessionAsRecipient,
  ratchetEncrypt,
  ratchetDecrypt,
  serializeSession,
  deserializeSession
} from './doubleRatchet.js'
import {
  GroupSession
} from './senderKeys.js'

// Storage key prefix
const STORAGE_PREFIX = 'fairwins_crypto_'

// Key derivation message
const KEY_DERIVATION_MESSAGE = 'FairWins Encryption Key v1'

/**
 * Session Manager for encrypted friend market communications
 */
export class SessionManager {
  /**
   * @param {string} myAddress - Our Ethereum address
   */
  constructor(myAddress) {
    this.myAddress = myAddress.toLowerCase()
    this.identityKeyPair = null
    this.keyBundle = null
    this.pairwiseSessions = new Map() // address -> DoubleRatchetSession
    this.groupSessions = new Map() // groupId -> GroupSession
    this.initialized = false
  }

  /**
   * Initialize the session manager with wallet-derived keys
   *
   * @param {Object} signer - Ethers signer
   * @returns {Promise<Object>} - Public key bundle
   */
  async initialize(signer) {
    // Derive identity key from wallet signature
    const signature = await signer.signMessage(KEY_DERIVATION_MESSAGE)
    const hash = keccak256(toUtf8Bytes(signature))
    const identityPrivateKey = getBytes(hash)

    // Store identity key pair
    this.identityKeyPair = {
      privateKey: identityPrivateKey,
      publicKey: generateKeyPair().publicKey // Derive public from private
    }

    // Generate key bundle for X3DH
    this.keyBundle = generateKeyBundle(identityPrivateKey)

    // Load existing sessions from storage
    this.loadSessions()

    this.initialized = true

    return {
      publicBundle: this.keyBundle.publicBundle,
      signature // Include signature for others to derive our public key
    }
  }

  /**
   * Check if initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('SessionManager not initialized. Call initialize() first.')
    }
  }

  // ==================== 1v1 Session Management ====================

  /**
   * Establish a 1v1 session with another user
   *
   * @param {string} theirAddress - Their Ethereum address
   * @param {Object} theirBundle - Their public key bundle
   * @returns {Object} - Initial message to send
   */
  establishSession(theirAddress, theirBundle) {
    this.ensureInitialized()
    const normalized = theirAddress.toLowerCase()

    // Perform X3DH
    const x3dhResult = initiateX3DH({
      identityKeyPrivate: this.identityKeyPair.privateKey,
      identityKeyPublic: this.identityKeyPair.publicKey,
      recipientBundle: theirBundle
    })

    // Initialize Double Ratchet session
    const session = initializeSessionAsInitiator(
      x3dhResult.sharedSecret,
      x3dhResult.recipientRatchetKey
    )

    // Store session with associated data
    this.pairwiseSessions.set(normalized, {
      session,
      associatedData: x3dhResult.associatedData,
      isInitiator: true
    })

    this.saveSessions()

    return {
      initialMessage: x3dhResult.initialMessage,
      sessionEstablished: true
    }
  }

  /**
   * Complete session establishment when receiving initial message
   *
   * @param {string} theirAddress - Their Ethereum address
   * @param {Object} initialMessage - Their X3DH initial message
   * @returns {boolean} - Success
   */
  receiveSessionEstablishment(theirAddress, initialMessage) {
    this.ensureInitialized()
    const normalized = theirAddress.toLowerCase()

    // Complete X3DH
    const x3dhResult = completeX3DH({
      identityKeyPrivate: this.identityKeyPair.privateKey,
      identityKeyPublic: this.identityKeyPair.publicKey,
      privateKeys: this.keyBundle.privateKeys,
      initialMessage
    })

    // Initialize as recipient - we'll create sending chain on first send
    const signedPreKeyPrivate = hexToBytes(this.keyBundle.privateKeys.signedPreKey.privateKey)
    const signedPreKeyPublic = hexToBytes(this.keyBundle.publicBundle.signedPreKey.publicKey)

    const session = initializeSessionAsRecipient(
      x3dhResult.sharedSecret,
      { privateKey: signedPreKeyPrivate, publicKey: signedPreKeyPublic }
    )

    this.pairwiseSessions.set(normalized, {
      session,
      associatedData: x3dhResult.associatedData,
      isInitiator: false
    })

    this.saveSessions()
    return true
  }

  /**
   * Check if we have a session with a user
   *
   * @param {string} theirAddress
   * @returns {boolean}
   */
  hasSession(theirAddress) {
    return this.pairwiseSessions.has(theirAddress.toLowerCase())
  }

  /**
   * Encrypt a message for a 1v1 session
   *
   * @param {string} theirAddress - Recipient address
   * @param {Object|string} message - Message to encrypt
   * @returns {Object} - Encrypted message
   */
  encryptMessage(theirAddress, message) {
    this.ensureInitialized()
    const normalized = theirAddress.toLowerCase()

    const sessionData = this.pairwiseSessions.get(normalized)
    if (!sessionData) {
      throw new Error(`No session with ${theirAddress}`)
    }

    const plaintext = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : new TextEncoder().encode(JSON.stringify(message))

    const encrypted = ratchetEncrypt(
      sessionData.session,
      plaintext,
      sessionData.associatedData
    )

    this.saveSessions()

    return {
      type: '1v1',
      from: this.myAddress,
      to: normalized,
      ...encrypted
    }
  }

  /**
   * Decrypt a message from a 1v1 session
   *
   * @param {Object} encryptedMessage - Encrypted message
   * @returns {Object} - Decrypted message
   */
  decryptMessage(encryptedMessage) {
    this.ensureInitialized()

    const theirAddress = encryptedMessage.from.toLowerCase()
    const sessionData = this.pairwiseSessions.get(theirAddress)

    if (!sessionData) {
      throw new Error(`No session with ${theirAddress}`)
    }

    const plaintext = ratchetDecrypt(
      sessionData.session,
      encryptedMessage,
      sessionData.associatedData
    )

    this.saveSessions()

    const decoded = new TextDecoder().decode(plaintext)
    try {
      return JSON.parse(decoded)
    } catch {
      return decoded
    }
  }

  // ==================== Group Session Management ====================

  /**
   * Create or join a group session
   *
   * @param {string} groupId - Group identifier (e.g., market ID)
   * @returns {Object} - Sender key distribution to share with group
   */
  joinGroup(groupId) {
    this.ensureInitialized()

    let groupSession = this.groupSessions.get(groupId)
    if (!groupSession) {
      groupSession = new GroupSession(groupId, this.myAddress)
      this.groupSessions.set(groupId, groupSession)
    }

    const distribution = groupSession.initialize()
    this.saveSessions()

    return distribution
  }

  /**
   * Process a sender key distribution from a group member
   *
   * @param {string} groupId - Group identifier
   * @param {Object} distribution - Sender key distribution
   */
  processMemberKey(groupId, distribution) {
    this.ensureInitialized()

    let groupSession = this.groupSessions.get(groupId)
    if (!groupSession) {
      groupSession = new GroupSession(groupId, this.myAddress)
      this.groupSessions.set(groupId, groupSession)
    }

    groupSession.processMemberKey(distribution)
    this.saveSessions()
  }

  /**
   * Encrypt a message for a group
   *
   * @param {string} groupId - Group identifier
   * @param {Object|string} message - Message to encrypt
   * @returns {Object} - Encrypted group message
   */
  encryptGroupMessage(groupId, message) {
    this.ensureInitialized()

    const groupSession = this.groupSessions.get(groupId)
    if (!groupSession) {
      throw new Error(`Not a member of group ${groupId}`)
    }

    const plaintext = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : new TextEncoder().encode(JSON.stringify(message))

    const encrypted = groupSession.encrypt(plaintext)
    this.saveSessions()

    return {
      type: 'group',
      groupId,
      ...encrypted
    }
  }

  /**
   * Decrypt a message from a group
   *
   * @param {Object} encryptedMessage - Encrypted group message
   * @returns {Object} - Decrypted message
   */
  decryptGroupMessage(encryptedMessage) {
    this.ensureInitialized()

    const groupSession = this.groupSessions.get(encryptedMessage.groupId)
    if (!groupSession) {
      throw new Error(`Not a member of group ${encryptedMessage.groupId}`)
    }

    const plaintext = groupSession.decrypt(encryptedMessage)
    this.saveSessions()

    const decoded = new TextDecoder().decode(plaintext)
    try {
      return JSON.parse(decoded)
    } catch {
      return decoded
    }
  }

  /**
   * Get known members of a group
   *
   * @param {string} groupId
   * @returns {string[]}
   */
  getGroupMembers(groupId) {
    const groupSession = this.groupSessions.get(groupId)
    if (!groupSession) return []
    return groupSession.getKnownMembers()
  }

  /**
   * Rotate sender key for a group (for forward secrecy)
   *
   * @param {string} groupId
   * @returns {Object} - New distribution to share
   */
  rotateGroupKey(groupId) {
    this.ensureInitialized()

    const groupSession = this.groupSessions.get(groupId)
    if (!groupSession) {
      throw new Error(`Not a member of group ${groupId}`)
    }

    const distribution = groupSession.rotateKey()
    this.saveSessions()

    return distribution
  }

  // ==================== Persistence ====================

  /**
   * Save all sessions to localStorage
   */
  saveSessions() {
    const data = {
      myAddress: this.myAddress,
      pairwiseSessions: Array.from(this.pairwiseSessions.entries()).map(([addr, data]) => ({
        address: addr,
        session: serializeSession(data.session),
        associatedData: bytesToHex(data.associatedData),
        isInitiator: data.isInitiator
      })),
      groupSessions: Array.from(this.groupSessions.entries()).map(([id, session]) => ({
        groupId: id,
        session: session.serialize()
      }))
    }

    try {
      localStorage.setItem(
        `${STORAGE_PREFIX}sessions_${this.myAddress}`,
        JSON.stringify(data)
      )
    } catch (error) {
      console.error('Failed to save sessions:', error)
    }
  }

  /**
   * Load sessions from localStorage
   */
  loadSessions() {
    try {
      const stored = localStorage.getItem(
        `${STORAGE_PREFIX}sessions_${this.myAddress}`
      )
      if (!stored) return

      const data = JSON.parse(stored)

      // Load pairwise sessions
      for (const item of data.pairwiseSessions || []) {
        this.pairwiseSessions.set(item.address, {
          session: deserializeSession(item.session),
          associatedData: hexToBytes(item.associatedData),
          isInitiator: item.isInitiator
        })
      }

      // Load group sessions
      for (const item of data.groupSessions || []) {
        this.groupSessions.set(
          item.groupId,
          GroupSession.deserialize(item.session)
        )
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }

  /**
   * Clear all sessions (logout)
   */
  clearSessions() {
    this.pairwiseSessions.clear()
    this.groupSessions.clear()
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}sessions_${this.myAddress}`)
    } catch (error) {
      console.error('Failed to clear sessions:', error)
    }
  }

  /**
   * Get public key bundle for sharing
   *
   * @returns {Object|null}
   */
  getPublicBundle() {
    return this.keyBundle?.publicBundle || null
  }
}

/**
 * Create a session manager instance
 * Singleton pattern per address
 */
const managers = new Map()

export function getSessionManager(address) {
  const normalized = address.toLowerCase()
  if (!managers.has(normalized)) {
    managers.set(normalized, new SessionManager(normalized))
  }
  return managers.get(normalized)
}

export function clearSessionManager(address) {
  const normalized = address.toLowerCase()
  const manager = managers.get(normalized)
  if (manager) {
    manager.clearSessions()
    managers.delete(normalized)
  }
}
