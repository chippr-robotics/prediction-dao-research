import { describe, it, expect, beforeEach } from 'vitest'
import {
  sanitizeTokenList,
  fetchTokenList,
  getCachedList,
  putCachedList,
  isFresh,
  filterByChain,
} from '../lib/tokens/tokenList'

// Spec 034 — token list fetch/sanitize/cache. Strict allowlist sanitization (no new
// dependency), TTL cache, and degrade-friendly fetch (FR-016).

const valid = (over = {}) => ({
  chainId: 137,
  address: '0x1111111111111111111111111111111111111111',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  ...over,
})

beforeEach(() => localStorage.clear())

describe('sanitizeTokenList', () => {
  it('keeps well-formed rows and preserves logoURI', () => {
    const out = sanitizeTokenList({ tokens: [valid({ logoURI: 'ipfs://x' })] })
    expect(out).toHaveLength(1)
    expect(out[0].address).toBe('0x1111111111111111111111111111111111111111')
    expect(out[0].logoURI).toBe('ipfs://x')
  })

  it('drops unsupported chainId, bad address, bad decimals, and missing symbol', () => {
    const out = sanitizeTokenList({
      tokens: [
        valid({ chainId: 1 }),
        valid({ address: 'nope' }),
        valid({ decimals: 999 }),
        valid({ symbol: '' }),
      ],
    })
    expect(out).toHaveLength(0)
  })

  it('de-dupes identical (chain, address) rows', () => {
    const out = sanitizeTokenList({ tokens: [valid(), valid()] })
    expect(out).toHaveLength(1)
  })
})

describe('token list cache', () => {
  it('put/get round-trips and isFresh respects the TTL', () => {
    putCachedList('u', { tokens: [valid()], version: 1 }, { now: 1000 })
    const c = getCachedList('u')
    expect(c.tokens).toHaveLength(1)
    expect(isFresh(c, { now: 2000, ttl: 5000 })).toBe(true)
    expect(isFresh(c, { now: 7000, ttl: 5000 })).toBe(false)
  })
})

describe('fetchTokenList', () => {
  it('fetches and sanitizes on a 200 response', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ version: { major: 1 }, tokens: [valid(), valid({ chainId: 1 })] }),
    })
    const res = await fetchTokenList('u', { fetchImpl })
    expect(res.tokens).toHaveLength(1) // the chainId:1 row is dropped
  })

  it('throws on a non-ok response so callers can degrade', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500 })
    await expect(fetchTokenList('u', { fetchImpl })).rejects.toThrow()
  })
})

describe('filterByChain', () => {
  it('filters tokens to a single chain', () => {
    const tokens = [
      valid({ chainId: 137 }),
      valid({ chainId: 63, address: '0x2222222222222222222222222222222222222222' }),
    ]
    expect(filterByChain(tokens, 137)).toHaveLength(1)
  })
})
