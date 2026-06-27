/**
 * Per-device word-list language preference for the ZK-Wager Pool four-word gateway (spec 034, US2).
 *
 * Follows the qrColorPreference.js pattern: plain-string localStorage, curated enum, graceful fallback,
 * never throws. The selected language only changes how the language-independent BIP-39 index tuple is
 * rendered/parsed — the same pool resolves regardless of language (SC-008). Default English (FR-008/US2).
 */
import { SUPPORTED_BIP39_LANGS, DEFAULT_BIP39_LANG } from '../lib/pools/bip39Lists'

const WORDLIST_LANG_KEY = 'fairwins_wordlist_lang_v1'

/** Human labels for the selector. */
export const WORDLIST_LANGUAGE_LABELS = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
  ja: '日本語',
  ko: '한국어',
  cz: 'Čeština',
  zh_cn: '简体中文',
  zh_tw: '繁體中文',
}

function isSupported(lang) {
  return SUPPORTED_BIP39_LANGS.includes(lang)
}

/** Read the saved word-list language for this device (default 'en'). */
export function getWordListLang() {
  try {
    const saved = localStorage.getItem(WORDLIST_LANG_KEY)
    return isSupported(saved) ? saved : DEFAULT_BIP39_LANG
  } catch {
    return DEFAULT_BIP39_LANG
  }
}

/** Persist the word-list language for this device. Unknown codes are ignored. */
export function setWordListLang(lang) {
  try {
    if (isSupported(lang)) localStorage.setItem(WORDLIST_LANG_KEY, lang)
  } catch {
    /* private browsing / quota — degrade to session-only */
  }
}
