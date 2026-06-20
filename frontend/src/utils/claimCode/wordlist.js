/**
 * Claim-code wordlist (feature 024 — open-challenge wagers).
 *
 * A claim code is four words from the BIP-39 English wordlist (2048 words ⇒ 2048^4 = 2^44 of entropy, the
 * spec's floor, FR-003). The same four words drive discovery, accept authorization, and terms decryption
 * (see deriveFromCode.js). Generation is client-side CSPRNG and the code is never sent to a server — the
 * creator shares it out-of-band.
 *
 * v1 anti-guessing scope is casual/indiscriminate only: the on-chain commitment is public, so a determined
 * offline attacker could brute-force a four-word code. This residual risk is accepted for v1 (FR-003a) and
 * MUST be surfaced honestly in the UI for meaningful stakes.
 */
import { wordlists } from 'ethers'

const WORDLIST = wordlists.en
const WORD_COUNT = 4
const LIST_SIZE = 2048

/**
 * Normalize a code to its canonical form so equivalent inputs derive identical keys:
 * NFKC, lowercase, trim, and collapse internal whitespace to single spaces.
 * @param {string} input
 * @returns {string}
 */
export function normalizeCode(input) {
  if (typeof input !== 'string') return ''
  return input
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * @param {string} input
 * @returns {boolean} true iff `input` normalizes to exactly four words, each in the BIP-39 English list.
 */
export function isValidCode(input) {
  const normalized = normalizeCode(input)
  if (!normalized) return false
  const words = normalized.split(' ')
  if (words.length !== WORD_COUNT) return false
  return words.every((w) => WORDLIST.getWordIndex(w) >= 0)
}

/**
 * Generate a fresh four-word claim code using the platform CSPRNG.
 * Uses rejection sampling on 16-bit reads to map uniformly onto the 2048-word list (no modulo bias).
 * @returns {string} e.g. "river amber tiger kite"
 */
export function generateCode() {
  const words = []
  const buf = new Uint16Array(1)
  // Largest multiple of LIST_SIZE that fits in 16 bits; reject reads at/above it to keep the mapping uniform.
  const limit = Math.floor(65536 / LIST_SIZE) * LIST_SIZE
  while (words.length < WORD_COUNT) {
    crypto.getRandomValues(buf)
    if (buf[0] >= limit) continue
    words.push(WORDLIST.getWord(buf[0] % LIST_SIZE))
  }
  return words.join(' ')
}

export const CLAIM_CODE_WORD_COUNT = WORD_COUNT
