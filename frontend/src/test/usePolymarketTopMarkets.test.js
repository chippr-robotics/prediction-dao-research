import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePolymarketTopMarkets } from '../hooks/usePolymarketSearch'
import { installGammaFetch, urlHasAll, urlHas } from './helpers/mockGammaFetch'
import { topEventsDefault, sportsEvents, cryptoEvents } from './fixtures/polymarket'

describe('usePolymarketTopMarkets', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('browses /events ordered by volume with no tag_id when no category selected', async () => {
    const fetchMock = installGammaFetch([
      { match: urlHas('/events'), json: topEventsDefault },
    ])

    const { result } = renderHook(() => usePolymarketTopMarkets({ limit: 12 }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/events')
    expect(url).toContain('order=volume')
    expect(url).toContain('ascending=false')
    expect(url).not.toContain('tag_id')
    expect(url).not.toContain('/markets')
    expect(url).not.toContain('tag_slug')
    expect(result.current.results).toHaveLength(2)
  })

  it('filters by numeric tag_id for a single category (sports => tag_id=1)', async () => {
    const fetchMock = installGammaFetch([
      { match: urlHasAll('/events', 'tag_id=1'), json: sportsEvents },
    ])

    const { result } = renderHook(() => usePolymarketTopMarkets({ categories: ['sports'], limit: 12 }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('tag_id=1')
    expect(result.current.results[0].id).toBe('ev-sport1')
  })

  it('fans out one request per category and merges/de-dupes by event id (OR)', async () => {
    const fetchMock = installGammaFetch([
      { match: urlHasAll('/events', 'tag_id=1'), json: sportsEvents },
      { match: urlHasAll('/events', 'tag_id=21'), json: cryptoEvents },
    ])

    const { result } = renderHook(() =>
      usePolymarketTopMarkets({ categories: ['sports', 'crypto'], limit: 12 }),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // One request per selected category.
    const taggedCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('tag_id='))
    expect(taggedCalls).toHaveLength(2)

    const ids = result.current.results.map((e) => e.id).sort()
    expect(ids).toEqual(['ev-crypto1', 'ev-sport1'])
  })
})
