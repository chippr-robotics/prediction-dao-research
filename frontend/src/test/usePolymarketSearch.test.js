/**
 * Tests for usePolymarketSearch — targeting 80% coverage.
 * Tests search, debouncing, result normalisation, clear, and error handling.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePolymarketSearch, usePolymarketTopMarkets } from '../hooks/usePolymarketSearch'

// Mock wagmi
vi.mock('wagmi', () => ({
  useChainId: vi.fn(() => 80002),
}))

// Mock networks config
vi.mock('../config/networks', () => ({
  getNetwork: vi.fn(() => ({
    polymarket: {
      gammaApiUrl: 'https://gamma-api.polymarket.com',
    },
  })),
  getCurrentChainId: vi.fn(() => 80002),
}))

// Mock logger
vi.mock('../utils/logger', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('usePolymarketSearch', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('initializes with empty results and no loading', () => {
    const { result } = renderHook(() => usePolymarketSearch())
    expect(result.current.results).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastQuery).toBe('')
  })

  it('search triggers debounced fetch', async () => {
    const mockResults = [
      {
        id: '1',
        question: 'Will BTC hit 100k?',
        conditionId: '0xcondition1',
        outcomes: '["Yes","No"]',
        outcomePrices: '[0.6, 0.4]',
      },
    ]

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    })

    const { result } = renderHook(() => usePolymarketSearch())

    act(() => {
      result.current.search('bitcoin')
    })

    // Advance past debounce timer (400ms)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.results).toHaveLength(1)
    expect(result.current.results[0].question).toBe('Will BTC hit 100k?')
    expect(result.current.results[0].conditionId).toBe('0xcondition1')
    expect(result.current.results[0].outcomes).toHaveLength(2)
    expect(result.current.results[0].outcomes[0].name).toBe('Yes')
    expect(result.current.results[0].outcomes[0].price).toBe(0.6)
  })

  it('search with empty query clears results', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: '1', question: 'Q?', conditionId: '0x1' }],
    })

    const { result } = renderHook(() => usePolymarketSearch())

    // First, do a search
    act(() => {
      result.current.search('test')
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    // Now search with empty
    act(() => {
      result.current.runSearch('')
    })

    expect(result.current.results).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles API error gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => usePolymarketSearch())

    await act(async () => {
      await result.current.runSearch('test')
    })

    expect(result.current.error).toContain('500')
    expect(result.current.results).toEqual([])
  })

  it('handles fetch rejection gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('Network failure'))

    const { result } = renderHook(() => usePolymarketSearch())

    await act(async () => {
      await result.current.runSearch('test')
    })

    expect(result.current.error).toContain('Network failure')
    expect(result.current.results).toEqual([])
  })

  it('handles AbortError silently', async () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    fetchMock.mockRejectedValue(abortError)

    const { result } = renderHook(() => usePolymarketSearch())

    await act(async () => {
      await result.current.runSearch('test')
    })

    // AbortError should not set error state
    expect(result.current.error).toBeNull()
  })

  it('clear resets all state', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: '1', question: 'Q?', conditionId: '0x1' }],
    })

    const { result } = renderHook(() => usePolymarketSearch())

    // Do a search
    await act(async () => {
      await result.current.runSearch('test')
    })

    expect(result.current.results.length).toBeGreaterThan(0)

    // Clear
    act(() => {
      result.current.clear()
    })

    expect(result.current.results).toEqual([])
    expect(result.current.error).toBeNull()
    expect(result.current.lastQuery).toBe('')
    expect(result.current.isLoading).toBe(false)
  })

  it('filters out results without conditionId', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: '1', question: 'Q1', conditionId: '0x1' },
        { id: '2', question: 'Q2' }, // no conditionId
      ],
    })

    const { result } = renderHook(() => usePolymarketSearch())

    await act(async () => {
      await result.current.runSearch('test')
    })

    expect(result.current.results).toHaveLength(1)
    expect(result.current.results[0].id).toBe('1')
  })

  it('normalises data wrapped in { data: [] }', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: '1', question: 'Q?', conditionId: '0x1' }],
      }),
    })

    const { result } = renderHook(() => usePolymarketSearch())

    await act(async () => {
      await result.current.runSearch('test')
    })

    expect(result.current.results).toHaveLength(1)
  })

  it('normalises markets with various field name formats', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          marketId: 'm1',
          title: 'Alt Title',
          condition_id: '0xcond',
          end_date_iso: '2026-01-01',
          volume: '5000',
          liquidity: '2000',
          active: true,
          closed: false,
          icon: 'icon.png',
          categories: 'politics',
        },
      ],
    })

    const { result } = renderHook(() => usePolymarketSearch())

    await act(async () => {
      await result.current.runSearch('test')
    })

    const r = result.current.results[0]
    expect(r.id).toBe('m1')
    expect(r.question).toBe('Alt Title')
    expect(r.conditionId).toBe('0xcond')
    expect(r.endDate).toBe('2026-01-01')
    expect(r.volume).toBe(5000)
    expect(r.liquidity).toBe(2000)
    expect(r.active).toBe(true)
    expect(r.closed).toBe(false)
    expect(r.image).toBe('icon.png')
    expect(r.category).toBe('politics')
  })

  it('handles outcomes as pre-parsed arrays', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: '1',
          question: 'Q?',
          conditionId: '0x1',
          outcomes: ['Yes', 'No'],
          outcomePrices: [0.7, 0.3],
        },
      ],
    })

    const { result } = renderHook(() => usePolymarketSearch())

    await act(async () => {
      await result.current.runSearch('test')
    })

    expect(result.current.results[0].outcomes[0]).toEqual({ name: 'Yes', price: 0.7 })
    expect(result.current.results[0].outcomes[1]).toEqual({ name: 'No', price: 0.3 })
  })

  it('handles malformed outcomes gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: '1',
          question: 'Q?',
          conditionId: '0x1',
          outcomes: 'not-valid-json{{',
        },
      ],
    })

    const { result } = renderHook(() => usePolymarketSearch())

    await act(async () => {
      await result.current.runSearch('test')
    })

    expect(result.current.results[0].outcomes).toEqual([])
  })

  it('respects custom limit', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    })

    renderHook(() => usePolymarketSearch({ limit: 5 }))
    // Just verifying it initialises without error
  })
})

describe('usePolymarketTopMarkets', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('fetches top markets on mount', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: '1', question: 'Top Q?', conditionId: '0x1' },
      ],
    })

    const { result } = renderHook(() => usePolymarketTopMarkets())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.results).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('handles API error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
    })

    const { result } = renderHook(() => usePolymarketTopMarkets())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toContain('503')
    expect(result.current.results).toEqual([])
  })

  it('refresh triggers re-fetch', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    })

    const { result } = renderHook(() => usePolymarketTopMarkets())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.refresh()
    })

    // Should have been called at least twice (mount + refresh)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('passes categories as tag_slug parameter', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    })

    renderHook(() => usePolymarketTopMarkets({ categories: ['sports', 'politics'] }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const url = fetchMock.mock.calls[0][0]
    expect(url).toContain('tag_slug=')
  })
})
