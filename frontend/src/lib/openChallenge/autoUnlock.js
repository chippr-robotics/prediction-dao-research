/**
 * Auto-unlock helpers for open-challenge terms (spec 040, US3 / FR-009..011).
 *
 * A member who has already supplied an open challenge's four-word code has it saved (encrypted,
 * wallet-scoped) in the code vault. These pure helpers let My Wagers find that saved code and
 * decrypt the terms WITHOUT re-prompting the member for the words. First-encounter items (no saved
 * code) still fall back to the manual prompt.
 */
import { deriveFromCode } from '../../utils/claimCode/deriveFromCode.js'
import { decryptEnvelopeCode } from '../../utils/crypto/envelopeEncryption.js'

/**
 * Find the saved vault entry whose code unlocks the given wager, if any.
 * @param {Array<{code?: string, wagerId?: string|number}>} codes vault entries (newest first)
 * @param {string|number} wagerId the wager to unlock
 * @returns {{code: string, wagerId: string|number}|null}
 */
export function findSavedCode(codes, wagerId) {
  if (!Array.isArray(codes) || wagerId == null) return null
  return codes.find((e) => e && e.code && String(e.wagerId) === String(wagerId)) || null
}

/**
 * Decrypt a code-keyed envelope with a saved four-word code, returning display metadata.
 * Throws if the code doesn't unlock the envelope (wrong code / tampered bytes).
 * @param {object} envelope the code-keyed terms envelope
 * @param {string} code the four-word claim code
 * @returns {object} decrypted metadata (`{ description }` when the terms are a plain string)
 */
export function decryptWithCode(envelope, code) {
  const { symKey } = deriveFromCode(code)
  const terms = decryptEnvelopeCode(envelope, symKey)
  return typeof terms === 'string' ? { description: terms } : terms
}
