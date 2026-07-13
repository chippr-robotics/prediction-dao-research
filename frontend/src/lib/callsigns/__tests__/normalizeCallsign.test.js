import { describe, it, expect } from 'vitest'
import { normalizeCallsign, isValidCallsign, isCallsignLike, formatCallsign, CallsignFormatError } from '../normalizeCallsign'

describe('normalizeCallsign', () => {
  it('strips a leading %, trims, and lowercases', () => {
    expect(normalizeCallsign('%ChipprBots')).toBe('chipprbots')
    expect(normalizeCallsign('  ChipprBots  ')).toBe('chipprbots')
    expect(normalizeCallsign('%chippr-bots')).toBe('chippr-bots')
  })

  it('accepts valid canonical forms including interior hyphens and digits', () => {
    for (const t of ['abc', 'a-b', 'chipprbots', 'user123', 'a1-b2-c3', 'x'.repeat(20)]) {
      expect(isValidCallsign(t)).toBe(true)
    }
  })

  it('rejects invalid formats (length, charset, hyphen placement)', () => {
    for (const bad of ['ab', 'a'.repeat(21), '-lead', 'trail-', 'dou--ble', 'bad_underscore', 'has space', 'emoji😀x', '']) {
      expect(isValidCallsign(bad)).toBe(false)
      expect(() => normalizeCallsign(bad)).toThrow(CallsignFormatError)
    }
  })

  it('is case-insensitive for uniqueness: different casings normalize identically', () => {
    expect(normalizeCallsign('ACME')).toBe(normalizeCallsign('acme'))
    expect(normalizeCallsign('%Acme')).toBe('acme')
  })

  it('isCallsignLike detects callsign-shaped input (with or without %) without validating fully', () => {
    expect(isCallsignLike('%chipprbots')).toBe(true)
    expect(isCallsignLike('chipprbots')).toBe(true)
    expect(isCallsignLike('0x1234567890abcdef1234567890abcdef12345678')).toBe(false) // 42 chars → address
    expect(isCallsignLike('ab')).toBe(false)
    expect(isCallsignLike(null)).toBe(false)
  })

  it('formatCallsign renders %<callsign> idempotently', () => {
    expect(formatCallsign('chipprbots')).toBe('%chipprbots')
    expect(formatCallsign('%chipprbots')).toBe('%chipprbots')
    expect(formatCallsign('')).toBe('')
  })
})
