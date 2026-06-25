import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Spec 034 — useTokenWatchlist filters to the active chain (FR-008) and persists
// per-wallet (FR-012). Wallet + active-chain are mocked; the store is real (localStorage).

const state = vi.hoisted(() => ({
  address: '0x9999999999999999999999999999999999999999',
  chainId: 137,
}))

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: () => ({ address: state.address }) }))
vi.mock('../hooks/useWeb3', () => ({ useWeb3: () => ({ chainId: state.chainId }) }))

import { useTokenWatchlist } from '../hooks/useTokenWatchlist'
import { loadWatchlist } from '../lib/tokens/tokenWatchlistStore'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const mk = (address, chainId) => ({ address, chainId, source: 'registry', symbol: 'TKN', name: 'T', decimals: 18 })

beforeEach(() => {
  localStorage.clear()
  state.address = '0x9999999999999999999999999999999999999999'
  state.chainId = 137
})

describe('useTokenWatchlist', () => {
  it('filters entries to the active chain and persists across reloads (FR-008/FR-012)', () => {
    const { result, rerender } = renderHook(() => useTokenWatchlist())

    act(() => result.current.addToken(mk(A, 137)))
    act(() => result.current.addToken(mk(B, 63)))

    expect(result.current.entries.map((e) => e.address)).toEqual([A])
    // All networks persisted in storage…
    expect(loadWatchlist(state.address).entries).toHaveLength(2)

    // …switching the active chain instantly re-scopes the view.
    state.chainId = 63
    rerender()
    expect(result.current.entries.map((e) => e.address)).toEqual([B])
  })

  it('is a no-op with no wallet connected', () => {
    state.address = undefined
    const { result } = renderHook(() => useTokenWatchlist())
    expect(result.current.entries).toEqual([])
  })
})
