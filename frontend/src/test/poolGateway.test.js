import { describe, it, expect } from 'vitest'
import { indicesToPhrase, phraseToIndices, resolvePool, POOL_WORD_COUNT } from '../lib/pools/gateway'

// T019 [US1] — 4-word gateway: index<->phrase round-trip, invalid/stale handling, cross-language
// resolution (the tuple, not the words, identifies the pool — SC-008).

describe('pool gateway', () => {
  const indices = [12, 2047, 0, 999]

  it('round-trips indices <-> phrase in English', () => {
    const phrase = indicesToPhrase(indices, 'en')
    expect(phrase.split(' ')).to.have.length(POOL_WORD_COUNT)
    expect(phraseToIndices(phrase, 'en')).toEqual(indices)
  })

  it('is case-insensitive and whitespace-tolerant', () => {
    const phrase = indicesToPhrase(indices, 'en').toUpperCase().replace(/ /g, '   ')
    expect(phraseToIndices(`  ${phrase}  `, 'en')).toEqual(indices)
  })

  it('returns null for the wrong word count or an unknown word (clear "not found")', () => {
    expect(phraseToIndices('river amber tiger', 'en')).toBeNull() // 3 words
    expect(phraseToIndices('river amber tiger notaword', 'en')).toBeNull()
    expect(phraseToIndices('', 'en')).toBeNull()
    expect(phraseToIndices(null, 'en')).toBeNull()
  })

  it('rejects out-of-range indices when rendering', () => {
    expect(() => indicesToPhrase([0, 1, 2], 'en')).toThrow()
    expect(() => indicesToPhrase([0, 1, 2, 2048], 'en')).toThrow()
  })

  it('the same tuple resolves the same pool across languages (SC-008)', () => {
    const en = indicesToPhrase(indices, 'en')
    const es = indicesToPhrase(indices, 'es')
    expect(en).not.toEqual(es) // different words...
    expect(phraseToIndices(es, 'es')).toEqual(indices) // ...same identity
    expect(phraseToIndices(en, 'en')).toEqual(phraseToIndices(es, 'es'))
  })

  it('resolvePool returns null when no pool maps to the phrase', async () => {
    const zero = '0x0000000000000000000000000000000000000000'
    const known = '0x00000000000000000000000000000000000000A1'
    const factory = { poolByPhrase: async (idx) => (idx[0] === 12 ? known : zero) }
    expect(await resolvePool(factory, indices)).toEqual(known)
    expect(await resolvePool(factory, [1, 1, 1, 1])).toBeNull()
  })
})
