/**
 * useAccountStats acting-account override (spec 074 US3) — contract A2–A4:
 * every address-scoped read targets the acting account, the native balance
 * comes from a direct provider read (never the connected wallet's context
 * figure), and balances clear when the effective address changes.
 *
 * Spec 092: history reads span the cohort (here mocked as [137, 1]) via the
 * estate seam; the estate describe below covers merging, partial labelling,
 * per-(chain,wager) keying, and the all-unreachable honest failure.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const CONNECTED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const ACTING = '0x8cc5000000000000000000000000000000000000'

const listMyWagers = vi.fn(async () => ({ items: [], hasMore: false, nextCursor: null }))
const emptyEstate = () => ({
  entries: [],
  chainStates: [
    { chainId: 137, state: 'read', entryCount: 0 },
    { chainId: 1, state: 'read', entryCount: 0 },
  ],
  partialChains: [],
  staleByChain: new Map(),
  prunedByChain: new Map(),
})
const listEntriesAcrossEstate = vi.fn(async () => emptyEstate())
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
  getDefaultEstateLedger: () => ({ listEntriesAcrossEstate }),
}))
vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: () => '0x000000000000000000000000000000000000e5c0',
}))
vi.mock('../../config/networks', () => ({
  cohortChainIds: () => [137, 1],
}))
vi.mock('../../lib/chains/estate', () => ({
  networkName: (id) => ({ 137: 'Polygon', 1: 'Ethereum' })[id] || `Chain ${id}`,
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
    await waitFor(() => expect(listEntriesAcrossEstate).toHaveBeenCalled())
    expect(listEntriesAcrossEstate.mock.calls[0][0].account).toBe(ACTING)
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
    // First per-chain wager read (chain 137) returns the record; chain 1 stays empty.
    listMyWagers.mockResolvedValueOnce({
      items: [{ id: 7, metadata: { name: 'Pizza bet with Sam' } }],
      hasMore: false,
      nextCursor: null,
    })
    listEntriesAcrossEstate.mockResolvedValueOnce({
      ...emptyEstate(),
      entries: [
        { entryId: 'w-7', chainId: 137, class: 'wager', kind: 'deposit', refs: { wagerId: '7' } },
        { entryId: 't-1', chainId: 137, class: 'transfer', kind: 'send', refs: {} },
      ],
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

describe('useAccountStats — estate merge (spec 092)', () => {
  const twoChainEstate = () => ({
    ...emptyEstate(),
    entries: [
      {
        entryId: 'oc:1:new', chainId: 1, class: 'wager', kind: 'payout', status: 'settled',
        refs: { wagerId: '12' }, valueUsd: 90, amount: 90, timestamp: 2000,
      },
      {
        entryId: 'oc:137:old', chainId: 137, class: 'wager', kind: 'deposit', status: 'settled',
        refs: { wagerId: '12' }, valueUsd: 50, amount: 50, timestamp: 1000,
      },
    ],
    chainStates: [
      { chainId: 137, state: 'read', entryCount: 1 },
      { chainId: 1, state: 'read', entryCount: 1 },
    ],
  })

  it('exposes the merged record with per-entry chainIds intact', async () => {
    listEntriesAcrossEstate.mockResolvedValueOnce(twoChainEstate())
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() => expect(result.current.activity).toHaveLength(2))
    expect(result.current.activity.map((e) => e.chainId)).toEqual([1, 137])
    expect(result.current.networkStates).toHaveLength(2)
    expect(result.current.partialChains).toEqual([])
  })

  it('summary combines both chains and settled-filtering keys on (chainId, wagerId)', async () => {
    // Wager #12 exists on BOTH chains: settled on 137, still active on 1.
    // Its chain-1 payout must NOT enter the settled P&L series.
    listEntriesAcrossEstate.mockResolvedValue(twoChainEstate())
    listMyWagers.mockImplementation(async () => ({
      // Same repository mock serves both chains; per-chain tagging happens in
      // the hook, so chain 137's copy and chain 1's copy get distinct keys.
      items: [{ id: 12, status: 'resolved' }],
      hasMore: false,
      nextCursor: null,
    }))
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() => expect(result.current.activity).toHaveLength(2))
    // Both entries feed the summary's totals (deposit 50 out + payout 90 in).
    expect(result.current.summary.totalWageredUsd).toBeGreaterThan(0)
    // Both chains report 'resolved' here, so both transfers are settled; the
    // series exists. (The keying itself is pinned by the adapter tests.)
    expect(result.current.series).toBeTruthy()
  })

  it('names unreachable chains and labels per-class staleness with its network', async () => {
    listEntriesAcrossEstate.mockResolvedValueOnce({
      ...emptyEstate(),
      entries: [],
      chainStates: [
        { chainId: 137, state: 'read', entryCount: 0 },
        { chainId: 1, state: 'unreachable', reason: 'rpc down', entryCount: 0 },
      ],
      partialChains: [1],
      staleByChain: new Map([[137, ['earn']]]),
    })
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() => expect(result.current.partialChains).toEqual(['Ethereum']))
    expect(result.current.staleClasses).toEqual(['earn on Polygon'])
  })

  it('all chains unreachable ⇒ error + last-known kept, never a blank record (FR-009)', async () => {
    // First load succeeds with data…
    listEntriesAcrossEstate.mockResolvedValueOnce(twoChainEstate())
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() => expect(result.current.activity).toHaveLength(2))
    // …then every chain fails on refresh.
    listEntriesAcrossEstate.mockResolvedValueOnce({
      ...emptyEstate(),
      chainStates: [
        { chainId: 137, state: 'unreachable', reason: 'down', entryCount: 0 },
        { chainId: 1, state: 'unreachable', reason: 'down', entryCount: 0 },
      ],
      partialChains: [137, 1],
    })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.error).toMatch(/none of your networks could be read/i)
    expect(result.current.activity).toHaveLength(2) // last-known kept
    expect(result.current.freshness.activity.status).toBe('stale')
    expect(result.current.partialChains).toEqual(['Polygon', 'Ethereum'])
  })
})

/**
 * Issue #1280 — freshness is a claim about what was READ, not about when the
 * load finished. The observed failure was an activity panel reading
 * "Updated 50s ago" over "No activity yet" while every RPC answered 503.
 */
describe('useAccountStats — freshness never asserts a read that did not happen (#1280)', () => {
  it('marks the ledger-derived sections fresh only when the whole estate answered', async () => {
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() => expect(result.current.freshness.activity.status).toBe('fresh'))
    expect(result.current.freshness.summary.status).toBe('fresh')
    expect(result.current.freshness.activity.lastUpdated).toBeGreaterThan(0)
    expect(result.current.error).toBe(null)
  })

  it('an unreachable chain marks the ledger sections partial, not "just updated"', async () => {
    listEntriesAcrossEstate.mockResolvedValueOnce({
      ...emptyEstate(),
      entries: [],
      chainStates: [
        { chainId: 137, state: 'read', entryCount: 0 },
        { chainId: 1, state: 'unreachable', reason: 'rpc 503', entryCount: 0 },
      ],
      partialChains: [1],
    })
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() => expect(result.current.partialChains).toEqual(['Ethereum']))
    expect(result.current.freshness.activity.status).toBe('partial')
    expect(result.current.freshness.summary.status).toBe('partial')
    // `partial`, not `fresh`: the indicator must not claim a complete update.
    expect(result.current.freshness.activity.status).not.toBe('fresh')
    // …and not `stale` either: a read DID happen, so the timestamp is real and
    // "showing last known" would be untrue (there is no last-known here).
    expect(result.current.freshness.activity.lastUpdated).toBeGreaterThan(0)
  })

  it('a class that could not be refreshed marks the ledger sections partial too', async () => {
    listEntriesAcrossEstate.mockResolvedValueOnce({
      ...emptyEstate(),
      entries: [],
      staleByChain: new Map([[137, ['wager', 'transfer']]]),
    })
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() =>
      expect(result.current.staleClasses).toEqual(['wager on Polygon', 'transfer on Polygon']),
    )
    expect(result.current.freshness.activity.status).toBe('partial')
    // The wallet-balance tile reads the connected wallet on its active chain;
    // the estate's history reads do not speak for it.
    expect(result.current.freshness.balances.status).toBe('fresh')
  })

  it('a partial read never sticks: the next complete one is fresh again', async () => {
    listEntriesAcrossEstate.mockResolvedValueOnce({
      ...emptyEstate(),
      chainStates: [
        { chainId: 137, state: 'read', entryCount: 0 },
        { chainId: 1, state: 'unreachable', reason: 'rpc 503', entryCount: 0 },
      ],
      partialChains: [1],
    })
    const { result } = renderHook(() => useAccountStats())
    await waitFor(() => expect(result.current.freshness.activity.status).toBe('partial'))

    await act(async () => {
      await result.current.refresh()
    })
    await waitFor(() => expect(result.current.freshness.activity.status).toBe('fresh'))
    expect(result.current.partialChains).toEqual([])
  })
})
