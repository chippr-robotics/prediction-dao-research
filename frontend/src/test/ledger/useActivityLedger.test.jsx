/**
 * Spec 051 T016 — useActivityLedger hook: scoping, filters, refresh, and
 * honest error handling (keeps last-known entries).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const listEntries = vi.fn()
const wallet = {
  address: '0xUser',
  chainId: 137,
  isConnected: true,
  provider: null,
}

vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => wallet }))
vi.mock('../../data/ledger', () => ({ getDefaultLedgerRepository: () => ({ listEntries }) }))

const { useActivityLedger } = await import('../../hooks/useActivityLedger')

beforeEach(() => {
  listEntries.mockReset()
})

describe('useActivityLedger', () => {
  it('queries the ledger scoped to the active account + chain and returns entries', async () => {
    listEntries.mockResolvedValue({ entries: [{ entryId: 'cl:a' }], staleClasses: ['earn'], prunedBefore: null })
    const { result } = renderHook(() => useActivityLedger())
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    expect(listEntries).toHaveBeenCalledWith(
      expect.objectContaining({ account: '0xUser', chainId: 137 }),
    )
    expect(result.current.staleClasses).toEqual(['earn'])
  })

  it('passes filter and period through to the repository', async () => {
    listEntries.mockResolvedValue({ entries: [], staleClasses: [], prunedBefore: null })
    const filter = { classes: ['transfer'] }
    const period = { fromMs: 1, toMs: 2 }
    renderHook(() => useActivityLedger({ filter, period }))
    await waitFor(() => expect(listEntries).toHaveBeenCalled())
    expect(listEntries).toHaveBeenCalledWith(expect.objectContaining({ filter, period }))
  })

  it('keeps last-known entries on a failed refresh and surfaces the error', async () => {
    listEntries.mockResolvedValueOnce({ entries: [{ entryId: 'cl:a' }], staleClasses: [], prunedBefore: null })
    const { result } = renderHook(() => useActivityLedger())
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    listEntries.mockRejectedValueOnce(new Error('rpc down'))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.entries).toHaveLength(1) // stale beats blank
    expect(result.current.error).toMatch(/rpc down/)
  })
})
