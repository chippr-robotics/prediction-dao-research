/**
 * Crypto Module for Friend Market Privacy
 *
 * Exports:
 * - Envelope Encryption (primary API for friend markets)
 * - Low-level primitives (for advanced use cases)
 */

// Primary API - Envelope Encryption for Friend Markets
export {
  // Key management
  deriveKeyPair,
  publicKeyFromSignature,

  // Encryption/Decryption
  encryptEnvelope,
  decryptEnvelope,
  encryptMarketMetadata,
  decryptMarketMetadata,

  // Participant management
  addRecipient,
  removeRecipient,
  addParticipantToMarket,

  // Utilities
  canDecrypt,
  getRecipients,
  isEncryptedEnvelope,

  // High-level market API
  createEncryptedMarket
} from './envelopeEncryption.js'

// Low-level primitives (for advanced use)
export {
  generateKeyPair,
  computeSharedSecret,
  deriveKey,
  encrypt,
  decrypt,
  encryptJson,
  decryptJson,
  hash,
  hmacSha256,
  randomBytes,
  bytesToHex,
  hexToBytes
} from './primitives.js'

// Double Ratchet (available but not primary)
// Use for ongoing messaging if needed in future
export {
  initializeSessionAsInitiator,
  initializeSessionAsRecipient,
  ratchetEncrypt,
  ratchetDecrypt,
  serializeSession,
  deserializeSession
} from './doubleRatchet.js'

// Group Sessions with Sender Keys
export { GroupSession } from './senderKeys.js'

// Session Manager (combines X3DH + Double Ratchet)
export {
  SessionManager,
  getSessionManager,
  clearSessionManager
} from './sessionManager.js'
