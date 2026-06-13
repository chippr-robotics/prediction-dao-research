import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePolymarketSearch } from '../hooks/usePolymarketSearch'
import { installGammaFetch, urlHas } from './helpers/mockGammaFetch'
import {
  searchKnicksPayload,
  searchIneligiblePayload,
} from './fixtures/polymarket'

describe('usePolymarketSearch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('searches via /public-search?q= (never /markets?search=) and groups results by event', async () => {
    const fetchMock = installGammaFetch([
      { match: urlHas('/public-search'), json: searchKnicksPayload },
    ])

    const { result } = renderHook(() => usePolymarketSearch({ limit: 10 }))
    await act(async () => {
      await result.current.runSearch('knicks')
    })

    const requestedUrl = String(fetchMock.mock.calls[0][0])
    expect(requestedUrl).toContain('/public-search')
    expect(requestedUrl).toContain('q=knicks')
    expect(requestedUrl).toContain('limit_per_type=10')
    expect(requestedUrl).not.toContain('/markets')
    expect(requestedUrl).not.toContain('search=knicks')

    // Two events: a multi-sub-market game (grouped) and a single-market event.
    expect(result.current.results).toHaveLength(2)
    const game = result.current.results.find((e) => e.id === 'ev-knicks-game')
    expect(game.markets).toHaveLength(3)
    expect(game.markets[0].label).toBe('Moneyline')
    const single = result.current.results.find((e) => e.id === 'ev-knicks-single')
    expect(single.markets).toHaveLength(1)
  })

  it('drops events whose markets are all ineligible (closed / no conditionId)', async () => {
    installGammaFetch([{ match: urlHas('/public-search'), json: searchIneligiblePayload }])

    const { result } = renderHook(() => usePolymarketSearch({ limit: 10 }))
    await act(async () => {
      await result.current.runSearch('whatever')
    })

    expect(result.current.results).toEqual([])
  })

  it('fires no request and clears for a blank query', async () => {
    const fetchMock = installGammaFetch([{ match: urlHas('/public-search'), json: searchKnicksPayload }])

    const { result } = renderHook(() => usePolymarketSearch({ limit: 10 }))
    await act(async () => {
      await result.current.runSearch('   ')
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('constrains results to the selected categories (OR by tag id)', async () => {
    installGammaFetch([{ match: urlHas('/public-search'), json: searchKnicksPayload }])

    // Both fixture events are tagged Sports (id 1).
    const sports = renderHook(() => usePolymarketSearch({ limit: 10, categories: ['sports'] }))
    await act(async () => {
      await sports.result.current.runSearch('knicks')
    })
    expect(sports.result.current.results).toHaveLength(2)

    const crypto = renderHook(() => usePolymarketSearch({ limit: 10, categories: ['crypto'] }))
    await act(async () => {
      await crypto.result.current.runSearch('knicks')
    })
    expect(crypto.result.current.results).toHaveLength(0)
  })

  it('surfaces an error and clears results on a non-2xx response', async () => {
    installGammaFetch([{ match: urlHas('/public-search'), ok: false, status: 503, json: {} }])

    const { result } = renderHook(() => usePolymarketSearch({ limit: 10 }))
    await act(async () => {
      await result.current.runSearch('knicks')
    })

    expect(result.current.error).toContain('503')
    expect(result.current.results).toEqual([])
  })

  it('swallows AbortError without setting an error', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    installGammaFetch([{ match: urlHas('/public-search'), error: abortErr }])

    const { result } = renderHook(() => usePolymarketSearch({ limit: 10 }))
    await act(async () => {
      await result.current.runSearch('knicks')
    })

    expect(result.current.error).toBeNull()
    expect(result.current.results).toEqual([])
  })

  it('aborts the in-flight request when a newer search supersedes it', async () => {
    installGammaFetch([{ match: urlHas('/public-search'), json: searchKnicksPayload }])
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')

    const { result } = renderHook(() => usePolymarketSearch({ limit: 10 }))
    await act(async () => {
      await result.current.runSearch('knick')
      await result.current.runSearch('knicks')
    })

    // The second search must have aborted the first request's controller.
    expect(abortSpy).toHaveBeenCalled()
  })
})
