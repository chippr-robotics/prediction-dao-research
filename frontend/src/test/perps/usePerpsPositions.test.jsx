/** usePerpsPositions (spec 082 US2) — account reset, per-venue isolation, honest failure. */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePerpsPositions } from '../../hooks/usePerpsPositions'

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const POSITIONS = [
  { id: 'gains:42161:7', venue: 'gains', symbol: 'BTC/USD', direction: 'long', sizeUsd: 1000 },
  { id: 'hyperliquid:ETH:long', venue: 'hyperliquid', symbol: 'ETH/USD', direction: 'long', sizeUsd: 4500 },
]
const SOURCES = { gains: { status: 'read' }, hyperliquid: { status: 'degraded' } }

const deps = (over = {}) => ({
  available: () => true,
  fetchPositions: vi.fn(async () => ({ positions: POSITIONS, sources: SOURCES })),
  ...over,
})

describe('usePerpsPositions', () => {
  it('loads positions and names unreadable venues', async () => {
    const { result } = renderHook(() => usePerpsPositions(A, { deps: deps() }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.positions).toHaveLength(2)
    expect(result.current.unreadableVenues).toEqual(['hyperliquid'])
  })

  it('is idle with no fetch when disconnected', () => {
    const fetchPositions = vi.fn()
    const { result } = renderHook(() => usePerpsPositions(null, { deps: deps({ fetchPositions }) }))
    expect(result.current.status).toBe('idle')
    expect(fetchPositions).not.toHaveBeenCalled()
  })

  it('hard-resets synchronously on account change — no cross-account leak', async () => {
    let resolveB
    const fetchPositions = vi.fn((addr) => {
      if (addr === A) return Promise.resolve({ positions: POSITIONS, sources: SOURCES })
      return new Promise((r) => {
        resolveB = () => r({ positions: [], sources: { gains: { status: 'read' } } })
      })
    })
    const { result, rerender } = renderHook(({ account }) => usePerpsPositions(account, { deps: deps({ fetchPositions }) }), {
      initialProps: { account: A },
    })
    await waitFor(() => expect(result.current.positions).toHaveLength(2))

    rerender({ account: B })
    // A's positions must be gone the moment B is the account — before B's read resolves.
    expect(result.current.positions).toEqual([])
    resolveB()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.positions).toEqual([])
  })

  it('reports unavailable (never fake-empty) on total failure', async () => {
    const { result } = renderHook(() =>
      usePerpsPositions(A, { deps: deps({ fetchPositions: vi.fn(async () => Promise.reject(new Error('down'))) }) }),
    )
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
  })
})
