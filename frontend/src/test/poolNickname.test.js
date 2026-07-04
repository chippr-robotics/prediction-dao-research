import { describe, it, expect } from 'vitest'
import { deriveNickname } from '../lib/pools/nickname'
import { ADJECTIVES, NOUNS } from '../lib/pools/nicknameWords'

// T020 [US1] — nicknames are deterministic, derived from the PUBLIC wallet ADDRESS (spec 034 is
// address-based; Semaphore removed), reproducible by any member from the on-chain roster, and are a pure
// client-side display function (never on-chain) — FR-009/FR-011/FR-012.

describe('pool nickname', () => {
  const address = '0xabcdef0123456789abcdef0123456789abcdef01'

  it('is deterministic for the same address + pool', () => {
    const a = deriveNickname(address, 'pool-1')
    const b = deriveNickname(address, 'pool-1')
    expect(a).toEqual(b)
    expect(a.label).toEqual(`${a.adjective} ${a.noun}`)
    expect(ADJECTIVES).toContain(a.adjective)
    expect(NOUNS).toContain(a.noun)
  })

  it('is reproducible by anyone from the public address, invariant to address casing', () => {
    // A member's address reaches viewers in different casings (checksummed from the roster, lowercase
    // from a shared link). The words must not depend on that casing — the same account renders the same
    // nickname for everyone (cross-user determinism).
    const lower = address.toLowerCase()
    const upper = address.toUpperCase().replace('0X', '0x')
    const a = deriveNickname(address, 'pool-1')
    const b = deriveNickname(lower, 'pool-1')
    const c = deriveNickname(upper, 'pool-1')
    expect(a).toEqual(b)
    expect(a.label).toEqual(c.label)
  })

  it('is invariant to pool-address casing so every viewer sees the same words', () => {
    const checksummed = '0x5aA0Ea1a5Cd4C1b0f0B8a3B2C1D0e9F8a7B6C5d4'
    const lower = checksummed.toLowerCase()
    const upper = checksummed.toUpperCase().replace('0X', '0x')
    const a = deriveNickname(address, checksummed)
    const b = deriveNickname(address, lower)
    const c = deriveNickname(address, upper)
    expect(a.label).toEqual(b.label)
    expect(a.label).toEqual(c.label)
    expect(a).toEqual(b)
  })

  it('varies across addresses and scopes', () => {
    const other = '0xabcdef0123456789abcdef0123456789abcdef02'
    const a = deriveNickname(address, 'pool-1')
    const b = deriveNickname(other, 'pool-1')
    const c = deriveNickname(address, 'pool-2')
    // not all three identical
    expect(new Set([a.label, b.label, c.label]).size).toBeGreaterThan(1)
  })

  it('exposes a stable 2-hex disambiguation suffix from the address (FR-012)', () => {
    const { suffix } = deriveNickname(address, 'pool-1')
    expect(suffix).toMatch(/^[0-9a-f]{2}$/)
    expect(suffix).toEqual('01') // low byte of the (lowercased) address
  })
})
