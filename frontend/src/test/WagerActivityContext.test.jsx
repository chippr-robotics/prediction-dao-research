/**
 * WagerActivityContext provider tests (spec 012, tasks T007/T013/T022/T026/T029).
 *
 * Strategy: real pure modules (derivedState/diffEngine/activityStore/
 * deadlineWarnings), mocked data seams (fetchWagers / scanProposals via
 * props), mocked wallet + notification hooks, fake timers, real jsdom
 * localStorage (cleared per test).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const { walletState, showNotification } = vi.hoisted(() => ({
  walletState: {
    account: '0xAAAA000000000000000000000000000000000001',
    address: '0xAAAA000000000000000000000000000000000001',
    isConnected: true,
    chainId: 80002,
  },
  showNotification: vi.fn(),
}))

vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: () => walletState,
}))

vi.mock('../hooks/useUI', () => ({
  useNotification: () => ({ showNotification, hideNotification: vi.fn(), notification: null }),
}))

import { WagerActivityProvider } from '../contexts/WagerActivityContext.jsx'
import { useWagerActivity, useWagerActivityOptional } from '../hooks/useWagerActivity'
import { loadStore, saveStore, defaultStore } from '../data/notifications/activityStore'

const ACCOUNT = '0xaaaa000000000000000000000000000000000001'
const OPPONENT = '0xbbbb000000000000000000000000000000000002'
const CHAIN = 80002

const HOUR = 3600 * 1000
const NOW = 1765000000000 // fixed wall-clock for fake timers

function wager(overrides = {}) {
  return {
    id: '1',
    creator: ACCOUNT,
    opponent: OPPONENT,
    arbitrator: null,
    status: 'pending',
    winner: null,
    paid: false,
    acceptanceDeadline: NOW + 48 * HOUR,
    resolveDeadlineTime: NOW + 96 * HOUR,
    tradingEndTime: NOW + 48 * HOUR,
    resolutionType: 0,
    creatorStake: '10',
    opponentStake: '10',
    stakeTokenSymbol: 'USDC',
    description: 'Lakers in 6',
    ...overrides,
  }
}

let captured = null
function Probe() {
  captured = useWagerActivity()
  return <div data-testid="probe">{captured.unreadCount}</div>
}

function OptionalProbe() {
  const value = useWagerActivityOptional()
  return <div data-testid="optional">{value === null ? 'null' : 'present'}</div>
}

const okScan = vi.fn(async ({ fromBlock }) => ({ proposals: [], toBlock: fromBlock || 100 }))

function renderProvider({ fetchWagers, scanProposals = okScan } = {}) {
  return render(
    <WagerActivityProvider fetchWagers={fetchWagers} scanProposals={scanProposals}>
      <div data-testid="child">child</div>
      <Probe />
    </WagerActivityProvider>
  )
}

async function flushPoll(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  localStorage.clear()
  captured = null
  showNotification.mockClear()
  okScan.mockClear()
  walletState.account = '0xAAAA000000000000000000000000000000000001'
  walletState.address = walletState.account
  walletState.isConnected = true
  walletState.chainId = CHAIN
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('WagerActivityProvider — lifecycle (T007)', () => {
  it('renders children immediately and defers the first poll past first paint', async () => {
    let resolveFetch
    const fetchWagers = vi.fn(() => new Promise(res => { resolveFetch = res }))
    renderProvider({ fetchWagers })
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(captured.entries).toEqual([])
    await flushPoll(0)
    expect(fetchWagers).toHaveBeenCalledWith(ACCOUNT, CHAIN)
    await act(async () => { resolveFetch([]) })
  })

  it('polls again on the 30s interval', async () => {
    const fetchWagers = vi.fn(async () => [])
    renderProvider({ fetchWagers })
    await flushPoll(0)
    expect(fetchWagers).toHaveBeenCalledTimes(1)
    await flushPoll(30_000)
    expect(fetchWagers).toHaveBeenCalledTimes(2)
    await flushPoll(30_000)
    expect(fetchWagers).toHaveBeenCalledTimes(3)
  })

  it('pauses polling while hidden and polls immediately on visible', async () => {
    const fetchWagers = vi.fn(async () => [])
    renderProvider({ fetchWagers })
    await flushPoll(0)
    expect(fetchWagers).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await flushPoll(90_000)
    expect(fetchWagers).toHaveBeenCalledTimes(1) // no polls while hidden

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await flushPoll(0)
    expect(fetchWagers).toHaveBeenCalledTimes(2) // immediate poll on return
  })

  it('does not poll or write storage when disconnected', async () => {
    walletState.account = null
    walletState.address = null
    walletState.isConnected = false
    const fetchWagers = vi.fn(async () => [])
    renderProvider({ fetchWagers })
    await flushPoll(30_000)
    expect(fetchWagers).not.toHaveBeenCalled()
    expect(captured.entries).toEqual([])
    expect(captured.unreadCount).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it('retains state and shows at most one failure notice on poll errors, then recovers', async () => {
    let fail = true
    const fetchWagers = vi.fn(async () => {
      if (fail) throw new Error('rpc down')
      return [wager({ status: 'active' })]
    })
    // seed: previous session knew this wager as pending
    seedStore({ 1: snapshotOf(wager(), 'pending') })
    renderProvider({ fetchWagers })
    await flushPoll(0)
    const errorToasts = () => showNotification.mock.calls.filter(c => c[1] === 'error')
    expect(errorToasts().length).toBe(1)
    expect(captured.entries).toEqual([]) // nothing fabricated

    await flushPoll(30_000) // second failure: no second notice
    expect(errorToasts().length).toBe(1)

    fail = false
    await flushPoll(30_000) // recovery: change detected (pending -> active)
    expect(captured.entries.some(e => e.type === 'accepted')).toBe(true)
  })
})

function snapshotOf(w, state) {
  return {
    id: String(w.id),
    state,
    status: w.status,
    winner: w.winner ? w.winner.toLowerCase() : null,
    paid: w.paid,
    acceptanceDeadline: w.acceptanceDeadline,
    resolveDeadlineTime: w.resolveDeadlineTime,
    tradingEndTime: w.tradingEndTime,
    drawProposedBy: null,
    snappedAt: NOW - 24 * HOUR,
  }
}

function seedStore(snapshots, account = ACCOUNT, chainId = CHAIN) {
  const store = { ...defaultStore(), snapshots, lastPolledAt: NOW - 24 * HOUR }
  saveStore(account, chainId, store)
}

describe('catch-up + feed (T013)', () => {
  it('populates the feed on first poll from persisted snapshots, without toasts', async () => {
    seedStore({ 1: snapshotOf(wager(), 'pending') })
    const fetchWagers = vi.fn(async () => [wager({ status: 'active' })])
    renderProvider({ fetchWagers })
    await flushPoll(0)
    expect(captured.entries.length).toBe(1)
    expect(captured.entries[0].type).toBe('accepted')
    expect(captured.unreadCount).toBe(1)
    expect(showNotification).not.toHaveBeenCalled() // catch-up silence
  })

  it('emits zero new entries when chain state is unchanged (reload semantics)', async () => {
    seedStore({ 1: snapshotOf(wager(), 'pending') })
    const fetchWagers = vi.fn(async () => [wager({ status: 'active' })])
    const { unmount } = renderProvider({ fetchWagers })
    await flushPoll(0)
    expect(captured.entries.length).toBe(1)
    unmount()

    // simulate reload: fresh provider, same chain state
    renderProvider({ fetchWagers })
    await flushPoll(0)
    expect(captured.entries.length).toBe(1) // no duplicate
  })

  it('first sight on a fresh device records snapshots but emits no entries', async () => {
    const fetchWagers = vi.fn(async () => [wager({ status: 'active' })])
    renderProvider({ fetchWagers })
    await flushPoll(0)
    expect(captured.entries).toEqual([])
    const persisted = loadStore(ACCOUNT, CHAIN)
    expect(persisted.snapshots['1']).toBeTruthy()
  })

  it('does not clobber read flags set while a poll is in flight', async () => {
    seedStore({ 1: snapshotOf(wager(), 'pending') })
    const fetchWagers = vi.fn(async () => [wager({ status: 'active' })])
    let releaseScan
    const gate = new Promise((res) => { releaseScan = res })
    const scanProposals = vi.fn()
      .mockImplementationOnce(async ({ fromBlock }) => ({ proposals: [], toBlock: fromBlock }))
      .mockImplementationOnce(async ({ fromBlock }) => {
        await gate
        return { proposals: [], toBlock: fromBlock }
      })
    renderProvider({ fetchWagers, scanProposals })
    await flushPoll(0) // poll 1: catch-up creates the entry
    expect(captured.unreadCount).toBe(1)
    const entryId = captured.entries[0].id

    await flushPoll(30_000) // poll 2 starts and parks inside scanProposals
    act(() => { captured.markEntryRead(entryId) }) // user acknowledges mid-poll
    expect(captured.unreadCount).toBe(0)

    await act(async () => {
      releaseScan()
      await vi.advanceTimersByTimeAsync(0)
    })
    // The poll's save must not resurrect the unread flag from its stale base.
    expect(captured.unreadCount).toBe(0)
    expect(loadStore(ACCOUNT, CHAIN).entries[0].read).toBe(true)
  })

  it('markEntryRead / markWagerRead / markAllRead update the count and persist', async () => {
    seedStore({ 1: snapshotOf(wager(), 'pending') })
    const fetchWagers = vi.fn(async () => [wager({ status: 'active' })])
    renderProvider({ fetchWagers })
    await flushPoll(0)
    expect(captured.unreadCount).toBe(1)
    const entryId = captured.entries[0].id

    act(() => { captured.markEntryRead(entryId) })
    expect(captured.unreadCount).toBe(0)
    expect(loadStore(ACCOUNT, CHAIN).entries[0].read).toBe(true)

    act(() => { captured.markWagerRead('1') })
    expect(captured.unreadCount).toBe(0)

    act(() => { captured.markAllRead() })
    expect(captured.unreadCount).toBe(0)
  })
})

describe('account/network scoping (T007)', () => {
  it('swaps stores atomically on account switch with no carryover', async () => {
    seedStore({ 1: snapshotOf(wager(), 'pending') })
    const fetchWagers = vi.fn(async (account) =>
      account === ACCOUNT ? [wager({ status: 'active' })] : [])
    const { rerender } = render(
      <WagerActivityProvider fetchWagers={fetchWagers} scanProposals={okScan}>
        <Probe />
      </WagerActivityProvider>
    )
    await flushPoll(0)
    expect(captured.entries.length).toBe(1)

    walletState.account = '0xCCCC000000000000000000000000000000000003'
    walletState.address = walletState.account
    rerender(
      <WagerActivityProvider fetchWagers={fetchWagers} scanProposals={okScan}>
        <Probe />
      </WagerActivityProvider>
    )
    await flushPoll(0)
    expect(captured.entries).toEqual([]) // other account's history not shown
    expect(captured.unreadCount).toBe(0)

    // original account's store untouched
    expect(loadStore(ACCOUNT, CHAIN).entries.length).toBe(1)
  })

  it('scopes stores by chainId', async () => {
    seedStore({ 1: snapshotOf(wager(), 'pending') }, ACCOUNT, 137)
    const fetchWagers = vi.fn(async () => [wager({ status: 'active' })])
    renderProvider({ fetchWagers }) // chain 80002
    await flushPoll(0)
    // 80002 had no snapshots: first-sight, no entries; 137 store untouched
    expect(captured.entries).toEqual([])
    expect(loadStore(ACCOUNT, 137).snapshots['1']).toBeTruthy()
    expect(loadStore(ACCOUNT, 137).entries).toEqual([])
  })
})

describe('live toast policy (T026)', () => {
  it('toasts live-poll entries with severity, capping at 3 + summary', async () => {
    const initial = [1, 2, 3, 4, 5].map(i => wager({ id: String(i), description: `W${i}` }))
    const fetchWagers = vi.fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(initial.map(w => ({ ...w, status: 'active' })))
    renderProvider({ fetchWagers })
    await flushPoll(0) // first sight, silent
    expect(showNotification).not.toHaveBeenCalled()

    await flushPoll(30_000) // 5 live transitions
    const calls = showNotification.mock.calls
    const summary = calls.filter(c => String(c[0]).includes('more update'))
    expect(calls.length).toBe(4) // 3 toasts + 1 summary
    expect(summary.length).toBe(1)
    expect(captured.entries.length).toBe(5) // feed keeps everything
  })

  it('uses the entry severity as the toast type', async () => {
    const fetchWagers = vi.fn()
      .mockResolvedValueOnce([wager()])
      .mockResolvedValue([wager({ status: 'resolved', winner: ACCOUNT, paid: false })])
    renderProvider({ fetchWagers })
    await flushPoll(0)
    await flushPoll(30_000)
    const call = showNotification.mock.calls.find(c => String(c[0]).includes('You won'))
    expect(call).toBeTruthy()
    expect(call[1]).toBe('success')
  })
})

describe('deadline warnings wiring (T029)', () => {
  it('emits an acceptance warning inside 24h, once per UTC day across polls', async () => {
    const w = wager({
      creator: OPPONENT,
      opponent: ACCOUNT, // we are the opponent: actionable accept warning
      acceptanceDeadline: NOW + 10 * HOUR,
    })
    const fetchWagers = vi.fn(async () => [w])
    renderProvider({ fetchWagers })
    await flushPoll(0)
    const warns = () => captured.entries.filter(e => e.type === 'warn-acceptance')
    expect(warns().length).toBe(1)
    await flushPoll(30_000)
    await flushPoll(30_000)
    expect(warns().length).toBe(1) // anti-spam within the day
  })
})

describe('draw-proposal scan wiring (T022)', () => {
  it('emits draw-proposed entry and respondDraw action when counterparty proposes', async () => {
    const w = wager({ status: 'active' })
    const fetchWagers = vi.fn(async () => [w])
    const scanProposals = vi.fn()
      .mockResolvedValueOnce({ proposals: [], toBlock: 50 })
      .mockResolvedValue({ proposals: [{ wagerId: '1', proposer: OPPONENT, revoked: false }], toBlock: 80 })
    renderProvider({ fetchWagers, scanProposals })
    await flushPoll(0)
    expect(captured.entries.filter(e => e.type === 'draw-proposed')).toEqual([])

    await flushPoll(30_000)
    expect(captured.entries.some(e => e.type === 'draw-proposed')).toBe(true)
    expect(captured.actionNeededByWagerId['1']).toBe('respondDraw')
    // watermark advanced + persisted
    expect(loadStore(ACCOUNT, CHAIN).drawScanBlock).toBe(80)
    // scan got the known wager ids and prior watermark
    expect(scanProposals).toHaveBeenLastCalledWith(
      expect.objectContaining({ chainId: CHAIN, wagerIds: ['1'], fromBlock: 50 })
    )
  })

  it('scan failure leaves the struct pipeline unaffected', async () => {
    const fetchWagers = vi.fn()
      .mockResolvedValueOnce([wager()])
      .mockResolvedValue([wager({ status: 'active' })])
    const scanProposals = vi.fn(async ({ fromBlock }) => ({ proposals: [], toBlock: fromBlock || 0 }))
    renderProvider({ fetchWagers, scanProposals })
    await flushPoll(0)
    await flushPoll(30_000)
    expect(captured.entries.some(e => e.type === 'accepted')).toBe(true)
  })
})

describe('action-needed derivation (T008)', () => {
  it('flags claimable wagers and counts them', async () => {
    const fetchWagers = vi.fn(async () => [
      wager({ id: '7', status: 'resolved', winner: ACCOUNT, paid: false }),
      wager({ id: '8', status: 'active' }),
    ])
    renderProvider({ fetchWagers })
    await flushPoll(0)
    expect(captured.actionNeededByWagerId['7']).toBe('claim')
    expect(captured.actionNeededByWagerId['8']).toBeNull()
    expect(captured.actionNeededCount).toBe(1)
  })
})

describe('hook contracts (T009)', () => {
  it('useWagerActivity throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/WagerActivityProvider/)
    spy.mockRestore()
  })

  it('useWagerActivityOptional returns null outside the provider', () => {
    render(<OptionalProbe />)
    expect(screen.getByTestId('optional').textContent).toBe('null')
  })
})
