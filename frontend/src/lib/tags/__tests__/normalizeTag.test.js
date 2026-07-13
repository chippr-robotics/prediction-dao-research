import { describe, it, expect } from 'vitest'
import { normalizeTag, isValidTag, isTagLike, formatTag, TagFormatError } from '../normalizeTag'

describe('normalizeTag', () => {
  it('strips a leading %, trims, and lowercases', () => {
    expect(normalizeTag('%ChipprBots')).toBe('chipprbots')
    expect(normalizeTag('  ChipprBots  ')).toBe('chipprbots')
    expect(normalizeTag('%chippr-bots')).toBe('chippr-bots')
  })

  it('accepts valid canonical forms including interior hyphens and digits', () => {
    for (const t of ['abc', 'a-b', 'chipprbots', 'user123', 'a1-b2-c3', 'x'.repeat(20)]) {
      expect(isValidTag(t)).toBe(true)
    }
  })

  it('rejects invalid formats (length, charset, hyphen placement)', () => {
    for (const bad of ['ab', 'a'.repeat(21), '-lead', 'trail-', 'dou--ble', 'bad_underscore', 'has space', 'emoji😀x', '']) {
      expect(isValidTag(bad)).toBe(false)
      expect(() => normalizeTag(bad)).toThrow(TagFormatError)
    }
  })

  it('is case-insensitive for uniqueness: different casings normalize identically', () => {
    expect(normalizeTag('ACME')).toBe(normalizeTag('acme'))
    expect(normalizeTag('%Acme')).toBe('acme')
  })

  it('isTagLike detects tag-shaped input (with or without %) without validating fully', () => {
    expect(isTagLike('%chipprbots')).toBe(true)
    expect(isTagLike('chipprbots')).toBe(true)
    expect(isTagLike('0x1234567890abcdef1234567890abcdef12345678')).toBe(false) // 42 chars → address
    expect(isTagLike('ab')).toBe(false)
    expect(isTagLike(null)).toBe(false)
  })

  it('formatTag renders %<tag> idempotently', () => {
    expect(formatTag('chipprbots')).toBe('%chipprbots')
    expect(formatTag('%chipprbots')).toBe('%chipprbots')
    expect(formatTag('')).toBe('')
  })
})
