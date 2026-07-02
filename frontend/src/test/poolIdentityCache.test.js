/**
 * identityCache tests (pool-manager tester feedback) — device-local cache of a member's pool display
 * identity (public commitment + claim code) that lets nickname/claim-code auto-show without re-prompting
 * signatures. The identity secret itself is never stored.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readPoolIdentity, cachePoolIdentity } from '../lib/pools/identityCache'

const ACCOUNT = '0xAbC0000000000000000000000000000000000001'
const POOL = '0xP00L000000000000000000000000000000000001'

describe('pool identityCache', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips and merge-writes per (account, pool)', () => {
    cachePoolIdentity(ACCOUNT, POOL, { commitment: '123' })
    expect(readPoolIdentity(ACCOUNT, POOL)).toEqual({ commitment: '123' })
    cachePoolIdentity(ACCOUNT, POOL, { claimCode: '456' })
    expect(readPoolIdentity(ACCOUNT, POOL)).toEqual({ commitment: '123', claimCode: '456' })
  })

  it('is case-insensitive on account/pool and isolated between pools', () => {
    cachePoolIdentity(ACCOUNT.toUpperCase(), POOL.toUpperCase(), { commitment: '1' })
    expect(readPoolIdentity(ACCOUNT.toLowerCase(), POOL.toLowerCase())).toEqual({ commitment: '1' })
    expect(readPoolIdentity(ACCOUNT, '0xother')).toBeNull()
  })

  it('returns null (never throws) on missing keys or malformed values', () => {
    expect(readPoolIdentity(null, POOL)).toBeNull()
    expect(readPoolIdentity(ACCOUNT, null)).toBeNull()
    localStorage.setItem(
      `fairwins_pool_identity_v1_${ACCOUNT.toLowerCase()}_${POOL.toLowerCase()}`,
      'not-json'
    )
    expect(readPoolIdentity(ACCOUNT, POOL)).toBeNull()
  })
})
