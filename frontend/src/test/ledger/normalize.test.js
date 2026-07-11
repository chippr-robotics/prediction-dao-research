/**
 * Spec 051 T005 — normalization invariants (data-model.md "Invariants").
 */
import { describe, it, expect } from 'vitest'
import { normalizeEntry } from '../../data/ledger/normalize'

const TX = '0x' + 'cd'.repeat(32)
const CTX = { account: '0xUSER', chainId: 137 }

function pre(overrides = {}) {
  return {
    entryId: `oc:137:${TX}:0`,
    chainId: 137,
    class: 'wager',
    kind: 'deposit',
    direction: 'out',
    status: 'settled',
    provenance: 'onchain',
    txHash: TX,
    amountRaw: '1000000',
    tokenAddress: '0xToken',
    timestamp: 1_700_000_000_000,
    timestampProvenance: 'chain',
    ...overrides,
  }
}

describe('normalizeEntry', () => {
  it('passes a valid entry through with lowercased account + token', () => {
    const e = normalizeEntry(pre(), CTX)
    expect(e.account).toBe('0xuser')
    expect(e.tokenAddress).toBe('0xtoken')
    expect(e.timestamp).toBe(1_700_000_000_000)
  })

  it('rejects timestamp 0 / negative / NaN — coerces to null + unavailable (never renders as epoch)', () => {
    for (const bad of [0, -5, NaN, '0', undefined]) {
      const e = normalizeEntry(pre({ timestamp: bad, timestampProvenance: 'chain' }), CTX)
      expect(e.timestamp).toBe(null)
      expect(e.timestampProvenance).toBe('unavailable')
    }
  })

  it('forces direction to none on failed entries', () => {
    const e = normalizeEntry(pre({ status: 'failed', direction: 'out', txHash: null, provenance: 'client', entryId: 'cl:u1' }), CTX)
    expect(e.direction).toBe('none')
  })

  it('throws when an on-chain entry has no txHash', () => {
    expect(() => normalizeEntry(pre({ txHash: null }), CTX)).toThrow(/txHash/)
  })

  it('throws on cross-network leakage (entry chainId ≠ query chainId)', () => {
    expect(() => normalizeEntry(pre({ chainId: 1 }), CTX)).toThrow(/chainId/)
  })

  it('throws on unknown class or status', () => {
    expect(() => normalizeEntry(pre({ class: 'lottery' }), CTX)).toThrow(/class/)
    expect(() => normalizeEntry(pre({ status: 'maybe' }), CTX)).toThrow(/status/)
  })

  it('throws when entryId namespace disagrees with provenance', () => {
    expect(() => normalizeEntry(pre({ provenance: 'derived' }), CTX)).toThrow(/namespace/)
  })

  it('defaults refs to an object and preserves failureReason verbatim', () => {
    const e = normalizeEntry(
      pre({
        entryId: 'cl:u2',
        provenance: 'client',
        txHash: null,
        status: 'failed',
        failureReason: 'Smart Account does not have sufficient funds to execute the User Operation.',
        timestampProvenance: 'device',
      }),
      CTX,
    )
    expect(e.refs).toEqual({})
    expect(e.failureReason).toMatch(/sufficient funds/)
  })
})
