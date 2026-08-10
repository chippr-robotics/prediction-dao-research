/**
 * Solana address codec + validation (spec 063, US3 / T032).
 *
 * A Solana address is the raw 32-byte ed25519 public key, base58-encoded with the
 * Bitcoin alphabet and NO checksum (unlike Bitcoin/Zcash base58check). Validation
 * is therefore: decodes under base58 AND is exactly 32 bytes. Destination addresses
 * may legitimately be off-curve (program-derived addresses), so on-curve is NOT a
 * validity gate. All base58 rides @scure/base's audited codec — no hand-rolled code.
 */

import { base58 } from '@scure/base'

/**
 * Encode a 32-byte ed25519 public key as a Solana address.
 * @param {Uint8Array} pubkey 32-byte ed25519 public key
 * @returns {string} base58 address
 */
export function encodeSolanaAddress(pubkey) {
  if (!(pubkey instanceof Uint8Array) || pubkey.length !== 32) {
    throw new Error('encodeSolanaAddress: pubkey must be a 32-byte Uint8Array')
  }
  return base58.encode(pubkey)
}

/**
 * Whether a string is a structurally valid Solana address (base58, decodes to 32 bytes).
 * Never throws.
 * @param {string} str
 * @returns {boolean}
 */
export function isValidSolanaAddress(str) {
  if (typeof str !== 'string' || str.length < 32 || str.length > 44) return false
  try {
    return base58.decode(str).length === 32
  } catch {
    return false
  }
}
