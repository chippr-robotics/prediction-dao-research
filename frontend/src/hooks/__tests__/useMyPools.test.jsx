/**
 * useMyPools tests (tester feedback: pools must reliably surface in My Wagers).
 * Covers the on-chain fallback: a device-recorded pool the subgraph did not return is backfilled with a
 * direct summary read, so it still lists.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  load: vi.fn(),
  readJoined: vi.fn(),
  getPoolSummary: vi.fn(),
}))
vi.mock('../useWalletManagement', () => ({ useWallet: () => ({ account: '0xUser', chainId: 137 }) }))
vi.mock('../usePools', () => ({ usePools: () => ({ getPoolSummary: h.getPoolSummary }) }))
vi.mock('../../lib/lookup/myWagersSources', () => ({
  loadMyWagersSources: h.load,
  readJoinedPoolAddresses: h.readJoined,
}))

import { useMyPools } from '../useMyPools'

describe('useMyPools', () => {
  beforeEach(() => {
    h.load.mockReset()
    h.readJoined.mockReset().mockReturnValue([])
    h.getPoolSummary.mockReset()
  })

  it('aggregates subgraph-indexed pools', async () => {
    h.load.mockResolvedValue({
      createdPools: [{ address: '0xa', poolId: 1, state: 0, stateLabel: 'Open', memberCount: 2, maxMembers: 10 }],
      joinedPools: [],
    })
    const { result } = renderHook(() => useMyPools())
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0]).toMatchObject({ type: 'pool', id: '0xa' })
    expect(h.getPoolSummary).not.toHaveBeenCalled()
  })

  it('backfills device-recorded pools missing from the subgraph with on-chain reads', async () => {
    h.load.mockResolvedValue({ createdPools: [], joinedPools: [] })
    h.readJoined.mockReturnValue(['0xdeviceonly'])
    h.getPoolSummary.mockResolvedValue({
      address: '0xdeviceonly', state: 1, stateDisplay: 'Closed — resolving', memberCount: 4, maxMembers: 5,
    })
    const { result } = renderHook(() => useMyPools())
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(h.getPoolSummary).toHaveBeenCalledWith('0xdeviceonly')
    expect(result.current.items[0]).toMatchObject({ type: 'pool', id: '0xdeviceonly', status: 'Closed — resolving' })
  })

  it('stays empty (no errors) when a fallback read also fails', async () => {
    h.load.mockResolvedValue({ createdPools: [], joinedPools: [] })
    h.readJoined.mockReturnValue(['0xgone'])
    h.getPoolSummary.mockRejectedValue(new Error('no contract'))
    const { result } = renderHook(() => useMyPools())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
  })
})
