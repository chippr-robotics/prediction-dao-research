import { describe, it, expect, beforeEach } from 'vitest'
import { getWordListLang, setWordListLang } from '../utils/wordListLanguage'
import { indicesToPhrase, phraseToIndices } from '../lib/pools/gateway'

// T038 [US2] — word-list language preference: default English, persistence, unknown-code rejection,
// and that a phrase generated under one language resolves to the same pool indices under another
// (the index tuple is the identity, not the words — SC-008).

describe('word-list language preference (US2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to English and persists a supported choice', () => {
    expect(getWordListLang()).toBe('en')
    setWordListLang('ja')
    expect(getWordListLang()).toBe('ja')
  })

  it('ignores unsupported language codes', () => {
    setWordListLang('en')
    setWordListLang('klingon')
    expect(getWordListLang()).toBe('en')
  })

  it('renders the same pool identity across the selected languages (SC-008)', () => {
    const indices = [42, 7, 1000, 2047]
    setWordListLang('es')
    const es = indicesToPhrase(indices, getWordListLang())
    setWordListLang('ja')
    const ja = indicesToPhrase(indices, getWordListLang())
    expect(es).not.toBe(ja)
    // both decode back to the same canonical index tuple
    expect(phraseToIndices(es, 'es')).toEqual(indices)
    expect(phraseToIndices(ja, 'ja')).toEqual(indices)
  })
})
