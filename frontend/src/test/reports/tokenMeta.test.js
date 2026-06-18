import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveTokenMeta, clearTokenMetaCache } from '../../data/reports/tokenMeta'

const CHAIN = 137
const STABLE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const CUSTOM = '0x000000000000000000000000000000000000dEaD'

const network = () => ({
  chainId: CHAIN,
  stablecoin: { address: STABLE, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
})

beforeEach(() => clearTokenMetaCache())

describe('resolveTokenMeta (FR-004)', () => {
  it('resolves the canonical stablecoin from network config without I/O', async () => {
    const fetchOnChain = vi.fn()
    const meta = await resolveTokenMeta(STABLE.toLowerCase(), CHAIN, { network, fetchOnChain })
    expect(meta).toEqual({ ticker: 'USDC', decimals: 6, address: STABLE })
    expect(fetchOnChain).not.toHaveBeenCalled()
  })

  it('falls back to an injected on-chain lookup for custom tokens and memoizes it', async () => {
    const fetchOnChain = vi.fn().mockResolvedValue({ symbol: 'PYUSD', decimals: 6 })
    const first = await resolveTokenMeta(CUSTOM, CHAIN, { network, fetchOnChain })
    expect(first).toEqual({ ticker: 'PYUSD', decimals: 6, address: CUSTOM })

    const second = await resolveTokenMeta(CUSTOM, CHAIN, { network, fetchOnChain })
    expect(second).toEqual(first)
    expect(fetchOnChain).toHaveBeenCalledTimes(1) // memoized per (chainId, address)
  })

  it('returns a safe truncated fallback when the on-chain lookup throws', async () => {
    const fetchOnChain = vi.fn().mockRejectedValue(new Error('rpc down'))
    const meta = await resolveTokenMeta(CUSTOM, CHAIN, { network, fetchOnChain })
    expect(meta.ticker).toMatch(/^0x0000…dEaD$/i)
    expect(meta.decimals).toBe(18)
  })

  it('scopes the memo by chainId (same address, different chain re-resolves)', async () => {
    const fetchOnChain = vi.fn().mockResolvedValue({ symbol: 'AAA', decimals: 8 })
    await resolveTokenMeta(CUSTOM, 137, { network, fetchOnChain })
    await resolveTokenMeta(CUSTOM, 80002, { network, fetchOnChain })
    expect(fetchOnChain).toHaveBeenCalledTimes(2)
  })
})
