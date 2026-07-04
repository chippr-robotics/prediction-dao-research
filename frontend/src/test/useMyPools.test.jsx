import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const loadMyWagersSources = vi.fn()
const aggregateMyItems = vi.fn(() => [])
// Stable reference across renders so useMyPools' `load` callback identity is
// stable and its effect doesn't re-run on every render.
const getPoolSummary = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: () => ({ account: '0x1111111111111111111111111111111111111111', chainId: 1 }),
}))
vi.mock('../hooks/usePools', () => ({
  usePools: () => ({ getPoolSummary }),
}))
vi.mock('../lib/lookup/myWagersSources', () => ({
  loadMyWagersSources: (...a) => loadMyWagersSources(...a),
  readJoinedPoolAddresses: () => [],
}))
vi.mock('../lib/lookup/myWagersAggregation', () => ({
  aggregateMyItems: (...a) => aggregateMyItems(...a),
}))

import { useMyPools } from '../hooks/useMyPools'

describe('useMyPools auto-refresh (spec 040 US4)', () => {
  beforeEach(() => {
    loadMyWagersSources.mockReset().mockResolvedValue({ createdPools: [], joinedPools: [] })
    aggregateMyItems.mockClear()
  })

  it('registers a poll interval and clears it on unmount', () => {
    const setSpy = vi.spyOn(global, 'setInterval')
    const clearSpy = vi.spyOn(global, 'clearInterval')
    const { unmount } = renderHook(() => useMyPools())
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 30000)
    const intervalId = setSpy.mock.results[setSpy.mock.results.length - 1].value
    unmount()
    expect(clearSpy).toHaveBeenCalledWith(intervalId)
    setSpy.mockRestore()
    clearSpy.mockRestore()
  })

  it('loads on mount and exposes a manual refresh() that re-loads', async () => {
    const { result } = renderHook(() => useMyPools())
    await waitFor(() => expect(loadMyWagersSources).toHaveBeenCalled())
    loadMyWagersSources.mockClear()
    await act(async () => { await result.current.refresh() })
    expect(loadMyWagersSources).toHaveBeenCalled()
  })
})
