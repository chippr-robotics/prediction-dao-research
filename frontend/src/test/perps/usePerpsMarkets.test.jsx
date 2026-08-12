/** usePerpsMarkets (spec 082) — three-state honesty, per-venue degradation, search/filter/sort. */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { usePerpsMarkets } from '../../hooks/usePerpsMarkets'

const PAIRS = [
  { id: 'gains:137:BTC/USD', venue: 'gains', chainId: 137, symbol: 'BTC/USD', base: 'BTC', openInterestUsd: 100, fundingRate: 0.001, volume24hUsd: null },
  { id: 'gmx:42161:ETH/USD:0x1', venue: 'gmx', chainId: 42161, symbol: 'ETH/USD', base: 'ETH', openInterestUsd: 300, fundingRate: -0.002, volume24hUsd: null },
  { id: 'hyperliquid:SOL', venue: 'hyperliquid', chainId: null, symbol: 'SOL/USD', base: 'SOL', openInterestUsd: 200, fundingRate: 0.0005, volume24hUsd: 5 },
]
const SOURCES = {
  gains: { status: 'read', chains: [137] },
  gmx: { status: 'read', chains: [42161] },
  hyperliquid: { status: 'degraded', chains: [] },
}

const deps = (over = {}) => ({
  available: () => true,
  fetchPairs: vi.fn(async () => ({ pairs: PAIRS, sources: SOURCES, asOf: 'now' })),
  ...over,
})

describe('usePerpsMarkets', () => {
  it('loads to ready with pairs sorted by open interest and degraded venues named', async () => {
    const { result } = renderHook(() => usePerpsMarkets({ deps: deps() }))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.pairs.map((p) => p.venue)).toEqual(['gmx', 'hyperliquid', 'gains'])
    expect(result.current.degradedVenues).toEqual(['hyperliquid'])
  })

  it('reports unavailable (not empty) on a total failure', async () => {
    const { result } = renderHook(() =>
      usePerpsMarkets({ deps: deps({ fetchPairs: vi.fn(async () => Promise.reject(new Error('down'))) }) }),
    )
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.pairs).toEqual([])
  })

  it('is unavailable without fetching when the surface is unsupported', async () => {
    const fetchPairs = vi.fn()
    const { result } = renderHook(() => usePerpsMarkets({ deps: deps({ available: () => false, fetchPairs }) }))
    expect(result.current.status).toBe('unavailable')
    expect(fetchPairs).not.toHaveBeenCalled()
  })

  it('search and venue filter narrow the list', async () => {
    const { result } = renderHook(() => usePerpsMarkets({ deps: deps() }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setSearch('eth'))
    expect(result.current.pairs.map((p) => p.symbol)).toEqual(['ETH/USD'])
    act(() => {
      result.current.setSearch('')
      result.current.setVenueFilter('hyperliquid')
    })
    expect(result.current.pairs.map((p) => p.venue)).toEqual(['hyperliquid'])
    expect(result.current.totalCount).toBe(3) // the unfiltered universe stays reported
  })

  it('sorts by funding magnitude when selected', async () => {
    const { result } = renderHook(() => usePerpsMarkets({ deps: deps() }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setSortKey('funding'))
    expect(result.current.pairs[0].symbol).toBe('ETH/USD') // |-0.002| is the largest
  })
})
