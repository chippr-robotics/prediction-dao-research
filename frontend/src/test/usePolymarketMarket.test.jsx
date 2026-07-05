import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { usePolymarketMarket } from '../hooks/usePolymarketMarket'
import { installGammaFetch, urlHas } from './helpers/mockGammaFetch'

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

// Raw Gamma market shape (outcomes/outcomePrices are JSON strings on the wire).
const rawMarket = (over = {}) => ({
  id: 'm1',
  question: 'Will it happen?',
  conditionId: '0xabc123',
  slug: 'will-it-happen',
  endDate: '2026-12-31T00:00:00Z',
  volume: 12345,
  active: true,
  closed: false,
  outcomes: JSON.stringify(['Yes', 'No']),
  outcomePrices: JSON.stringify(['0.62', '0.38']),
  ...over,
})

describe('usePolymarketMarket (spec 041, FR-014)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches by condition id and returns the normalized market shape', async () => {
    const fetchMock = installGammaFetch([
      { match: urlHas('/markets?condition_ids=0xabc123'), json: [rawMarket()] },
    ])

    const { result } = renderHook(() => usePolymarketMarket('0xabc123'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(String(fetchMock.mock.calls[0][0])).toContain('condition_ids=0xabc123')
    expect(result.current.error).toBeNull()
    expect(result.current.market).toMatchObject({
      conditionId: '0xabc123',
      question: 'Will it happen?',
      slug: 'will-it-happen',
      closed: false,
      outcomes: [
        { name: 'Yes', price: 0.62 },
        { name: 'No', price: 0.38 },
      ],
    })
  })

  it('reports an error (market null) when the market is not found', async () => {
    installGammaFetch([{ match: urlHas('/markets'), json: [] }])

    const { result } = renderHook(() => usePolymarketMarket('0xdeadbeef'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.market).toBeNull()
    expect(result.current.error).toBeTruthy()
  })

  it('reports an error on a non-OK response and on network failure — never throws', async () => {
    installGammaFetch([{ match: urlHas('/markets'), ok: false, status: 503 }])
    const bad = renderHook(() => usePolymarketMarket('0xabc123'))
    await waitFor(() => expect(bad.result.current.isLoading).toBe(false))
    expect(bad.result.current.market).toBeNull()
    expect(bad.result.current.error).toMatch(/503/)
    bad.unmount()

    installGammaFetch([{ match: urlHas('/markets'), error: new Error('network down') }])
    const failed = renderHook(() => usePolymarketMarket('0xdef456'))
    await waitFor(() => expect(failed.result.current.isLoading).toBe(false))
    expect(failed.result.current.market).toBeNull()
    expect(failed.result.current.error).toBeTruthy()
  })

  it('skips the fetch entirely for falsy or zero-hash condition ids, and when disabled', async () => {
    const fetchMock = installGammaFetch([{ match: () => true, json: [rawMarket()] }])

    const none = renderHook(() => usePolymarketMarket(null))
    const zero = renderHook(() => usePolymarketMarket(ZERO_HASH))
    const off = renderHook(() => usePolymarketMarket('0xabc123', { enabled: false }))
    await waitFor(() => {
      expect(none.result.current.isLoading).toBe(false)
      expect(zero.result.current.isLoading).toBe(false)
      expect(off.result.current.isLoading).toBe(false)
    })

    expect(fetchMock).not.toHaveBeenCalled()
    for (const r of [none, zero, off]) {
      expect(r.result.current.market).toBeNull()
      expect(r.result.current.error).toBeNull()
    }
  })

  it('refresh() refetches on demand', async () => {
    const fetchMock = installGammaFetch([
      { match: urlHas('/markets'), json: [rawMarket({ outcomePrices: JSON.stringify(['0.7', '0.3']) })] },
    ])

    const { result } = renderHook(() => usePolymarketMarket('0xabc123'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => { await result.current.refresh() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.market.outcomes[0].price).toBe(0.7)
  })
})
