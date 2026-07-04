import { describe, it, expect } from 'vitest'
import { deriveAddressName } from '../lib/naming/addressName'
import { ADJECTIVES, NOUNS } from '../lib/pools/nicknameWords'

const ADDR_A = '0x1111111111111111111111111111111111111111'
const ADDR_B = '0x2222222222222222222222222222222222222222'

describe('deriveAddressName', () => {
  it('returns a two-word label drawn from the shared vocabulary', () => {
    const { adjective, noun, label } = deriveAddressName(ADDR_A)
    expect(ADJECTIVES).toContain(adjective)
    expect(NOUNS).toContain(noun)
    expect(label).toBe(`${adjective} ${noun}`)
  })

  it('is deterministic — the same address always yields the same name', () => {
    expect(deriveAddressName(ADDR_A).label).toBe(deriveAddressName(ADDR_A).label)
  })

  it('is casing-invariant — checksum and lowercase map to the same name', () => {
    const checksummed = '0xAbC1230000000000000000000000000000000000'
    const lowercased = checksummed.toLowerCase()
    expect(deriveAddressName(checksummed).label).toBe(deriveAddressName(lowercased).label)
  })

  it('produces different names for different addresses (typically)', () => {
    expect(deriveAddressName(ADDR_A).label).not.toBe(deriveAddressName(ADDR_B).label)
  })

  it('throws on a non-address input', () => {
    expect(() => deriveAddressName('not-an-address')).toThrow()
    expect(() => deriveAddressName(null)).toThrow()
  })
})
