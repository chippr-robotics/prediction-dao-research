/**
 * BIP-39 wordlist registry for ZK-Wager Pools (spec 034).
 *
 * A pool's identity is a language-independent tuple of four BIP-39 word indices (FR-003). The frontend
 * renders/parses that tuple through the member's chosen language's wordlist, so the same pool resolves
 * regardless of language (User Story 2 / SC-008). This module maps a language code to an ethers
 * {Wordlist} (same `getWord`/`getWordIndex` API the open-challenge claim code already uses,
 * utils/claimCode/wordlist.js). English is always available; languages ethers does not bundle fall back
 * to English so the gateway never breaks.
 */
import { wordlists } from 'ethers'

/** Languages offered in the "My Account" selector (US2). Availability is checked at render time. */
export const SUPPORTED_BIP39_LANGS = ['en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'cz', 'zh_cn', 'zh_tw']

export const DEFAULT_BIP39_LANG = 'en'

/** True iff ethers bundles the wordlist for `lang`. */
export function isLangAvailable(lang) {
  return !!(wordlists && wordlists[lang] && typeof wordlists[lang].getWord === 'function')
}

/**
 * Resolve a language code to an ethers Wordlist, falling back to English.
 * @param {string} [lang]
 * @returns {import('ethers').Wordlist}
 */
export function getWordlist(lang = DEFAULT_BIP39_LANG) {
  if (isLangAvailable(lang)) return wordlists[lang]
  return wordlists.en
}
