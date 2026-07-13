/**
 * Callsign normalization + formatting (spec 054). Mirrors the on-chain canonical rules in
 * CallsignRegistry._validate byte-for-byte so the client never submits a callsign the contract will
 * reject: 3–20 chars, lowercase `a-z` + digits `0-9` + single NON-leading/trailing/consecutive
 * hyphens. The `%` prefix is a display/entry convention only and is never part of the stored callsign.
 *
 * Callsigns are OPTIONAL and this module is pure — it powers entry-field detection and display, and never
 * blocks a flow: callers treat a throw / falsey as "not a callsign, fall back to a raw address".
 */

export class CallsignFormatError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CallsignFormatError'
  }
}

/** Min/max callsign length (matches the contract). */
export const CALLSIGN_MIN = 3
export const CALLSIGN_MAX = 20

/** Loose detector: does this input LOOK like a callsign (with or without the `%`)? Case-insensitive. */
export function isCallsignLike(input) {
  if (typeof input !== 'string') return false
  const s = input.trim()
  return /^%?[a-z0-9-]{3,20}$/i.test(s)
}

/**
 * Normalize user input to the canonical stored form. Strips a leading `%`, trims, lowercases, and
 * validates against the on-chain rules. Throws {CallsignFormatError} on any violation.
 * @param {string} input e.g. "%ChipprBots" or "chippr-bots"
 * @returns {string} canonical callsign, e.g. "chipprbots"
 */
export function normalizeCallsign(input) {
  if (typeof input !== 'string') throw new CallsignFormatError('Callsign must be a string')
  let s = input.trim()
  if (s.startsWith('%')) s = s.slice(1)
  s = s.toLowerCase()

  if (s.length < CALLSIGN_MIN || s.length > CALLSIGN_MAX) {
    throw new CallsignFormatError(`Callsign must be ${CALLSIGN_MIN}–${CALLSIGN_MAX} characters`)
  }
  let prevHyphen = false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    const isLower = c >= 0x61 && c <= 0x7a // a-z
    const isDigit = c >= 0x30 && c <= 0x39 // 0-9
    const isHyphen = c === 0x2d // '-'
    if (isHyphen) {
      if (i === 0 || i === s.length - 1 || prevHyphen) {
        throw new CallsignFormatError('Hyphens must be between letters or digits (no leading, trailing, or repeated)')
      }
      prevHyphen = true
    } else {
      if (!isLower && !isDigit) {
        throw new CallsignFormatError('Only lowercase letters, digits, and single hyphens are allowed')
      }
      prevHyphen = false
    }
  }
  return s
}

/** True if `input` is a valid callsign after normalization (never throws). */
export function isValidCallsign(input) {
  try {
    normalizeCallsign(input)
    return true
  } catch {
    return false
  }
}

/** Display form: `%<callsign>` (FR-015). Accepts raw or already-%-prefixed input. */
export function formatCallsign(callsign) {
  if (typeof callsign !== 'string' || callsign.length === 0) return ''
  return callsign.startsWith('%') ? callsign : `%${callsign}`
}
