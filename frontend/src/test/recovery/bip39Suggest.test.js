/**
 * BIP-39 word suggestions (spec 062) — typo help as the member types a phrase.
 */
import { describe, it, expect } from 'vitest'
import {
  bip39Words,
  isBip39Word,
  suggestWords,
  currentWord,
  applySuggestion,
  unknownWordsIn,
} from '../../lib/recovery/bip39Suggest'

describe('bip39 wordlist', () => {
  it('loads the 2048-word English list', () => {
    const words = bip39Words()
    expect(words).toHaveLength(2048)
    expect(words[0]).toBe('abandon')
    expect(words[words.length - 1]).toBe('zoo')
  })

  it('recognizes valid and rejects invalid words', () => {
    expect(isBip39Word('abandon')).toBe(true)
    expect(isBip39Word('ABANDON')).toBe(true)
    expect(isBip39Word('notaword')).toBe(false)
  })
})

describe('suggestWords', () => {
  it('returns completions for a prefix, excluding an exact match, capped', () => {
    const s = suggestWords('aban')
    expect(s).toContain('abandon')
    expect(suggestWords('')).toEqual([])
    expect(suggestWords('zoo')).not.toContain('zoo') // exact full word ⇒ nothing to suggest
    expect(suggestWords('a', 3)).toHaveLength(3)
  })
})

describe('currentWord + applySuggestion', () => {
  it('identifies the word being typed and completes it', () => {
    expect(currentWord('legal winner thank ye')).toBe('ye')
    expect(currentWord('legal winner ')).toBe('') // trailing space ⇒ new word
    expect(applySuggestion('legal winner thank ye', 'year')).toBe('legal winner thank year ')
    expect(applySuggestion('legal winner ', 'thank')).toBe('legal winner thank ')
  })
})

describe('unknownWordsIn', () => {
  it('flags completed words that are not valid BIP-39 words', () => {
    // "wrongg" is a completed (space-followed) invalid word; "aban" is still being typed.
    expect(unknownWordsIn('legal wrongg aban')).toEqual(['wrongg'])
    // no trailing space ⇒ last token is still being typed and is not flagged
    expect(unknownWordsIn('abandon abandon')).toEqual([])
    // all valid ⇒ nothing flagged
    expect(unknownWordsIn('legal winner thank ')).toEqual([])
  })
})
