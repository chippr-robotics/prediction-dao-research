/**
 * ActivityProvider integration tests (spec 031). Real engine + store; sources injected as mocks. Proves the
 * generalized provider preserves the wager watcher's mechanics: deferred first poll, catch-up feed-only,
 * toast cap, read-state survives a concurrent poll, per-source failure isolation + one notice, and atomic
 * per-(account,chain) scope swap. Fake timers + a fixed clock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useActivity } from '../hooks/useActivity'
import { ActivityProvider } from '../contexts/ActivityProvider'

const NOW = 1765432100000
const ACC_A = '0xAAA0000000000000000000000000000000000aaa'
const ACC_B = '0xBBB0000000000000000000000000000000000bbb'

const h = vi.hoisted(() => ({ wallet: { account: '', chainId: 0 }, showNotification: vi.fn() }))
vi.mock('../hooks/useWalletManagement', () => ({ useWallet: () => h.wallet }))
vi.mock('../hooks/useUI', () => ({ useNotification: () => ({ showNotification: h.showNotification }) }))

let captured = null
function Probe() {
  captured = useActivity()
  return null
}
function entry(id, over = {}) {
  return { id, domain: 'mock', refId: id, type: 't', message: `msg-${id}`, severity: 'info', actionable: false, createdAt: NOW, read: false, ...over }
}
function mockSource(detectImpl) {
  return { key: 'mock', label: 'Mock', detect: vi.fn(detectImpl) }
}
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  localStorage.clear()
  h.wallet = { account: ACC_A, chainId: 137 }
  h.showNotification.mockReset()
  captured = null
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('ActivityProvider (spec 031)', () => {
  it('defers the first poll, populates the feed, and stays feed-only on catch-up', async () => {
    const src = mockSource(async () => ({ ok: true, entries: [entry('e1')], nextSnapshots: {}, nextAux: {}, currentIds: ['e1'], actionNeededById: {} }))
    render(<ActivityProvider sources={[src]}><Probe /></ActivityProvider>)
    expect(src.detect).not.toHaveBeenCalled() // deferred — not during first paint
    await tick(0)
    expect(src.detect).toHaveBeenCalledTimes(1)
    expect(captured.entries.map((e) => e.id)).toEqual(['e1'])
    expect(captured.unreadCount).toBe(1)
    expect(h.showNotification).not.toHaveBeenCalled() // catch-up cycle never toasts
  })

  it('toasts new entries on a live poll, capped with a summary', async () => {
    let call = 0
    const src = mockSource(async () => {
      call += 1
      const entries = call === 1 ? [] : [entry('a'), entry('b'), entry('c'), entry('d')]
      return { ok: true, entries, nextSnapshots: {}, nextAux: {}, currentIds: [], actionNeededById: {} }
    })
    render(<ActivityProvider sources={[src]}><Probe /></ActivityProvider>)
    await tick(0) // catch-up (empty)
    await tick(30_000) // live poll → 4 fresh
    expect(captured.entries).toHaveLength(4)
    expect(h.showNotification).toHaveBeenCalledWith('msg-a', 'info', 6000)
    expect(h.showNotification).toHaveBeenCalledWith('msg-c', 'info', 6000)
    expect(h.showNotification).toHaveBeenCalledWith(expect.stringContaining('+1 more updates'), 'info', 6000)
    expect(h.showNotification).toHaveBeenCalledTimes(4) // 3 entries + 1 summary, capped
  })

  it('read-state survives a subsequent poll (dedup keeps the read copy)', async () => {
    const src = mockSource(async () => ({ ok: true, entries: [entry('e1')], nextSnapshots: {}, nextAux: {}, currentIds: ['e1'], actionNeededById: {} }))
    render(<ActivityProvider sources={[src]}><Probe /></ActivityProvider>)
    await tick(0)
    act(() => captured.markRefRead('e1'))
    expect(captured.entries[0].read).toBe(true)
    await tick(30_000) // poll re-emits e1 → existing (read) entry wins
    expect(captured.entries[0].read).toBe(true)
    expect(captured.unreadCount).toBe(0)
  })

  it('isolates a source failure: retains entries + fires one error notice', async () => {
    let call = 0
    const src = mockSource(async () => {
      call += 1
      return call === 1
        ? { ok: true, entries: [entry('e1')], nextSnapshots: {}, nextAux: {}, currentIds: ['e1'], actionNeededById: {} }
        : { ok: false }
    })
    render(<ActivityProvider sources={[src]}><Probe /></ActivityProvider>)
    await tick(0)
    await tick(30_000) // failure
    expect(captured.entries.map((e) => e.id)).toEqual(['e1']) // retained, nothing fabricated/removed
    expect(h.showNotification).toHaveBeenCalledWith(expect.stringContaining("Couldn't refresh"), 'error', 6000)
  })

  it('exposes action-needed count distinct from unread', async () => {
    const src = mockSource(async () => ({ ok: true, entries: [entry('e1', { actionable: true })], nextSnapshots: {}, nextAux: {}, currentIds: ['e1'], actionNeededById: { e1: 'vote' } }))
    render(<ActivityProvider sources={[src]}><Probe /></ActivityProvider>)
    await tick(0)
    expect(captured.actionNeededCount).toBe(1)
    expect(captured.actionNeededByDomain).toEqual({ mock: { e1: 'vote' } })
  })

  it('swaps scope atomically on account change — no carryover', async () => {
    const src = mockSource(async () => ({ ok: true, entries: [entry('A1')], nextSnapshots: {}, nextAux: {}, currentIds: ['A1'], actionNeededById: {} }))
    const { rerender } = render(<ActivityProvider sources={[src]}><Probe /></ActivityProvider>)
    await tick(0)
    expect(captured.entries.map((e) => e.id)).toEqual(['A1'])
    // switch account → different scope's (empty) store, no leak
    h.wallet = { account: ACC_B, chainId: 137 }
    await act(async () => { rerender(<ActivityProvider sources={[src]}><Probe /></ActivityProvider>) })
    expect(captured.entries).toEqual([])
  })
})
