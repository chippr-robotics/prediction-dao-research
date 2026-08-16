/**
 * useAccountStats acting-account override (spec 074 US3) — contract A2–A4:
 * every address-scoped read targets the acting account, the native balance
 * comes from a direct provider read (never the connected wallet's context
 * figure), and balances clear when the effective address changes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const CONNECTED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const ACTING = '0x8cc5000000000000000000000000000000000000'

const listMyWagers = vi.fn(async () => ({ items: [], hasMore: false, nextCursor: null }))
const listEntries = vi.fn(async () => ({ entries: [], staleClasses: [], prunedBefore: null }))
const getBalance = vi.fn(async () => 2n * 10n ** 18n) // 2.0 native

let walletState

vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => walletState,
}))
vi.mock('../../hooks/usePriceConversion', () => ({
  default: () => ({ convertToUsd: (n) => Number(n) || 0 }),
  usePriceConversion: () => ({ convertToUsd: (n) => Number(n) || 0 }),
}))
vi.mock('../../hooks/useChainTokens', () => ({
  useChainTokens: () => ({
    native: 'MATIC',
    stable: 'USDC',
    // No stable token configured → the ERC-20 read path stays out of this
    // test's way; the native-balance path is what the contract covers.
    stableAddress: null,
    stableDecimals: 6,
  }),
}))
vi.mock('../../data/wagers/WagerRepository', () => ({
  getDefaultWagerRepository: () => ({ listMyWagers }),
}))
vi.mock('../../data/ledger', () => ({
  getDefaultLedgerRepository: () => ({ listEntries }),
}))
vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: () => '0x000000000000000000000000000000000000e5c0',
}))

const { useAccountStats } = await import('../../hooks/useAccountStats')

beforeEach(() => {
  vi.clearAllMocks()
  walletState = {
    address: CONNECTED,
    chainId: 137,
    isConnected: true,
    balances: { native: '5' }, // the CONNECTED wallet's native balance
    refreshBalances: vi.fn(),
    provider: { getBalance },
  }
})

describe('useAccountStats({ accountAddress }) — acting override (spec 074)', () => {
  it('scopes wager and ledger reads to the acting address (A2)', async () => {
    renderHook(() => useAccountStats({ accountAddress: ACTING }))
    await waitFor(() => expect(listMyWagers).toHaveBeenCalled())
    expect(listMyWagers.mock.calls[0][0].userAddress).toBe(ACTING)
    await waitFor(() => expect(listEntries).toHaveBeenCalled())
    expect(listEntries.mock.calls[0][0].account).toBe(ACTING)
  })

  it('reads the acting account\'s native balance directly, not the wallet context\'s (A3)', async () => {
    const { result } = renderHook(() => useAccountStats({ accountAddress: ACTING }))
    await waitFor(() => expect(getBalance).toHaveBeenCalledWith(ACTING))
    // 2.0 acting-native (direct read) — NOT the connected wallet's 5.0
    await waitFor(() => expect(result.current.summary.walletBalanceUsd).toBe(2))
  })

  it('uses the connected wallet and its context balance with no override (A2/A3 baseline)', async () => {
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() => expect(listMyWagers).toHaveBeenCalled())
    expect(listMyWagers.mock.calls[0][0].userAddress).toBe(CONNECTED)
    expect(getBalance).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.summary.walletBalanceUsd).toBe(5))
  })

  it('annotates wager activity entries with the wager message from the loaded records', async () => {
    listMyWagers.mockResolvedValueOnce({
      items: [{ id: 7, metadata: { name: 'Pizza bet with Sam' } }],
      hasMore: false,
      nextCursor: null,
    })
    listEntries.mockResolvedValueOnce({
      entries: [
        { entryId: 'w-7', class: 'wager', kind: 'deposit', refs: { wagerId: '7' } },
        { entryId: 't-1', class: 'transfer', kind: 'send', refs: {} },
      ],
      staleClasses: [],
      prunedBefore: null,
    })
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() => expect(result.current.activity).toHaveLength(2))
    expect(result.current.activity[0].wagerTitle).toBe('Pizza bet with Sam')
    expect(result.current.activity[1].wagerTitle).toBeUndefined()
  })

  it('clears held balances when the effective address changes (A4)', async () => {
    const { result, rerender } = renderHook(({ accountAddress }) => useAccountStats({ accountAddress }), {
      initialProps: { accountAddress: ACTING },
    })
    await waitFor(() => expect(result.current.summary.walletBalanceUsd).toBe(2))

    // Switch to a different acting account whose balance read never resolves —
    // the previous account's 2.0 must not linger while the new load is pending.
    getBalance.mockImplementation(() => new Promise(() => {}))
    const NEXT = '0x0e35000000000000000000000000000000000c0B'
    await act(async () => {
      rerender({ accountAddress: NEXT })
    })
    expect(result.current.summary.walletBalanceUsd).toBe(0)
  })
})
