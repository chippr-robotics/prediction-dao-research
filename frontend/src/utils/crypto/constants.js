/**
 * Cryptographic Constants for FairWins - Versioned Signing System
 *
 * This module implements a versioned signing message system that ensures:
 * 1. Existing encrypted markets remain readable forever
 * 2. New terms/disclaimers can be added without breaking old data
 * 3. Version is stored in the encrypted envelope for decryption lookup
 *
 * VERSIONING RULES:
 * - Never modify an existing version's message (breaks decryption)
 * - Always add new versions with incremented numbers
 * - Default export uses CURRENT_VERSION for new encryptions
 * - Decryption functions should look up version from envelope metadata
 */

/**
 * Current encryption version - used for all NEW encryptions
 * Increment this when adding a new signing message version
 */
export const CURRENT_ENCRYPTION_VERSION = 2

/**
 * Versioned signing messages registry
 *
 * Each version's message MUST remain unchanged forever to preserve
 * decryption capability for markets encrypted with that version.
 */
export const SIGNING_MESSAGES = {
  // Version 1: Original simple message (legacy)
  1: 'FairWins Encryption Key v1',

  // Version 2: Comprehensive terms and disclaimer
  2: `FairWins Terms & Key Authorization v2

By signing this message, I acknowledge and agree to the following:

TERMS OF SERVICE
I accept the FairWins web portal terms and conditions.

AUTOMATED SYSTEM
FairWins is an automated smart contract system. All market offers, acceptances, and resolutions are executed by immutable blockchain code without human intervention.

BINDING AGREEMENT
Acceptance of any market offer constitutes a binding smart contract agreement. Once executed on-chain, transactions cannot be reversed or cancelled.

JURISDICTIONAL COMPLIANCE
I am solely responsible for ensuring my participation complies with all applicable laws and regulations in my jurisdiction.

NO LEGAL ADVICE
FairWins does not provide legal, financial, or investment advice. Users should consult qualified professionals for such guidance.

NOT GAMBLING PROMOTION
FairWins is a prediction market platform designed for information aggregation and does not promote gambling. Users must comply with their local gambling laws.

RISK ACKNOWLEDGMENT
Participation involves financial risk including potential loss of staked assets.

I HAVE READ, UNDERSTOOD, AND AGREE TO THESE TERMS.`
}

/**
 * Market-specific signing messages (for envelope encryption)
 * Same versioning rules apply
 */
export const MARKET_SIGNING_MESSAGES = {
  // Version 1: Original simple message (legacy)
  1: 'FairWins Market Encryption v1',

  // Version 2: With terms acknowledgment
  2: `FairWins Market Encryption Terms v2

By signing this message, I authorize encryption keys for private market communications.

I acknowledge that:
- FairWins is an automated smart contract system
- Market acceptance creates binding on-chain agreements
- I must comply with my local jurisdictional rules
- FairWins does not provide legal advice
- FairWins does not promote gambling
- I accept these terms and conditions`
}

/**
 * Get signing message for a specific version
 * @param {number} version - Version number
 * @returns {string} - Signing message for that version
 * @throws {Error} - If version doesn't exist
 */
export function getSigningMessage(version) {
  const message = SIGNING_MESSAGES[version]
  if (!message) {
    throw new Error(`Unknown encryption version: ${version}. Supported versions: ${Object.keys(SIGNING_MESSAGES).join(', ')}`)
  }
  return message
}

/**
 * Get market signing message for a specific version
 * @param {number} version - Version number
 * @returns {string} - Market signing message for that version
 * @throws {Error} - If version doesn't exist
 */
export function getMarketSigningMessage(version) {
  const message = MARKET_SIGNING_MESSAGES[version]
  if (!message) {
    throw new Error(`Unknown market encryption version: ${version}. Supported versions: ${Object.keys(MARKET_SIGNING_MESSAGES).join(', ')}`)
  }
  return message
}

/**
 * Get the current (latest) signing message for new encryptions
 * @returns {string}
 */
export function getCurrentSigningMessage() {
  return SIGNING_MESSAGES[CURRENT_ENCRYPTION_VERSION]
}

/**
 * Get the current (latest) market signing message for new encryptions
 * @returns {string}
 */
export function getCurrentMarketSigningMessage() {
  return MARKET_SIGNING_MESSAGES[CURRENT_ENCRYPTION_VERSION]
}

/**
 * Legacy exports for backwards compatibility
 * These use the CURRENT version - callers should migrate to versioned functions
 */
export const KEY_DERIVATION_MESSAGE = SIGNING_MESSAGES[CURRENT_ENCRYPTION_VERSION]
export const MARKET_ENCRYPTION_MESSAGE = MARKET_SIGNING_MESSAGES[CURRENT_ENCRYPTION_VERSION]

/**
 * Envelope encryption info string
 */
export const ENVELOPE_INFO = 'FairWins_Envelope_v1'

/**
 * Algorithm identifiers
 */
export const ENCRYPTION_ALGORITHM = 'x25519-xsalsa20-poly1305'

/**
 * Derive key pair for a specific version
 * Used when decrypting old markets that used an older signing message
 *
 * @param {Object} signer - Ethers signer
 * @param {number} version - Encryption version
 * @param {Function} deriveFunction - The actual key derivation function
 * @returns {Promise<Object>} - Key pair
 */
export async function deriveKeyPairForVersion(signer, version, deriveFunction) {
  const message = getSigningMessage(version)
  return deriveFunction(signer, message)
}

/**
 * Check if a version is supported
 * @param {number} version
 * @returns {boolean}
 */
export function isVersionSupported(version) {
  return version in SIGNING_MESSAGES
}

/**
 * Get all supported versions
 * @returns {number[]}
 */
export function getSupportedVersions() {
  return Object.keys(SIGNING_MESSAGES).map(Number).sort((a, b) => a - b)
}
