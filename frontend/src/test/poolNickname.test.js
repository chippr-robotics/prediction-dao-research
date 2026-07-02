import { describe, it, expect } from 'vitest'
import { deriveNickname } from '../lib/pools/nickname'
import { ADJECTIVES, NOUNS } from '../lib/pools/nicknameWords'

// T020 [US1] — nicknames are deterministic, derived from the PUBLIC commitment (reproducible by any
// member), and are a pure client-side function (never on-chain) — FR-009/FR-011/FR-012.

describe('pool nickname', () => {
  const commitment = 0x1234567890abcdefn

  it('is deterministic for the same commitment + pool', () => {
    const a = deriveNickname(commitment, 'pool-1')
    const b = deriveNickname(commitment, 'pool-1')
    expect(a).toEqual(b)
    expect(a.label).toEqual(`${a.adjective} ${a.noun}`)
    expect(ADJECTIVES).toContain(a.adjective)
    expect(NOUNS).toContain(a.noun)
  })

  it('is reproducible by anyone from the public commitment (string or bigint input)', () => {
    const fromBig = deriveNickname(commitment, 'pool-1')
    const fromStr = deriveNickname('0x1234567890abcdef', 'pool-1')
    expect(fromStr).toEqual(fromBig)
  })

  it('is INVARIANT to pool-address casing so every viewer sees the same words (cross-user determinism)', () => {
    // Different users reach a pool via differently-cased addresses (creator: the contract's checksummed
    // address; a shared link: lowercase). The words must not depend on that casing — only the
    // commitment-only suffix was casing-invariant before, which is why suffixes matched but names didn't.
    const checksummed = '0x5aA0Ea1a5Cd4C1b0f0B8a3B2C1D0e9F8a7B6C5d4'
    const lower = checksummed.toLowerCase()
    const upper = checksummed.toUpperCase().replace('0X', '0x')
    const a = deriveNickname(commitment, checksummed)
    const b = deriveNickname(commitment, lower)
    const c = deriveNickname(commitment, upper)
    expect(a.label).toEqual(b.label)
    expect(a.label).toEqual(c.label)
    expect(a).toEqual(b)
  })

  it('varies across commitments and scopes', () => {
    const a = deriveNickname(commitment, 'pool-1')
    const b = deriveNickname(commitment + 1n, 'pool-1')
    const c = deriveNickname(commitment, 'pool-2')
    // not all three identical
    expect(new Set([a.label, b.label, c.label]).size).toBeGreaterThan(1)
  })

  it('exposes a stable 2-hex disambiguation suffix (FR-012)', () => {
    const { suffix } = deriveNickname(commitment, 'pool-1')
    expect(suffix).toMatch(/^[0-9a-f]{2}$/)
    expect(suffix).toEqual('ef') // low byte of the commitment
  })
})
