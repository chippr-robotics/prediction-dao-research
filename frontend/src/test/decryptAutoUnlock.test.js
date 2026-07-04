import { describe, it, expect, vi } from 'vitest'

vi.mock('../utils/claimCode/deriveFromCode.js', () => ({
  deriveFromCode: (code) => ({ symKey: `key:${code}` }),
}))
vi.mock('../utils/crypto/envelopeEncryption.js', () => ({
  decryptEnvelopeCode: (envelope, symKey) => {
    if (symKey !== 'key:river tiger kite zoo') throw new Error('wrong code')
    return 'the secret terms'
  },
}))

import { findSavedCode, decryptWithCode } from '../lib/openChallenge/autoUnlock'

const codes = [
  { code: 'apple berry cherry date', wagerId: '5', savedAt: 2 },
  { code: 'river tiger kite zoo', wagerId: '7', savedAt: 1 },
]

describe('open-challenge auto-unlock (spec 040 US3)', () => {
  it('finds the saved code for a wager by id', () => {
    expect(findSavedCode(codes, '7')?.code).toBe('river tiger kite zoo')
    expect(findSavedCode(codes, 7)?.code).toBe('river tiger kite zoo')
  })

  it('returns null when no saved code matches (first encounter → prompt)', () => {
    expect(findSavedCode(codes, '99')).toBeNull()
    expect(findSavedCode([], '7')).toBeNull()
    expect(findSavedCode(null, '7')).toBeNull()
  })

  it('decrypts terms with a saved code without prompting', () => {
    expect(decryptWithCode({}, 'river tiger kite zoo')).toEqual({ description: 'the secret terms' })
  })

  it('throws when the saved code does not unlock the envelope', () => {
    expect(() => decryptWithCode({}, 'apple berry cherry date')).toThrow()
  })
})
