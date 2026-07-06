/**
 * ActivityProvider delivery-routing tests. Verifies per-domain delivery modes
 * route a fresh entry to a toast (app), a toast + system notification (push),
 * or nothing beyond the feed (silent), and that push degrades to app-toast when
 * the master push flag is off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ActivityProvider } from '../contexts/ActivityProvider'
import { setDeliveryMode, setPushEnabled } from '../lib/notifications/deliveryPreferences'

const NOW = 1765432100000
const ACC = '0xAAA0000000000000000000000000000000000aaa'

const h = vi.hoisted(() => ({
  wallet: { account: '', chainId: 0 },
  showNotification: vi.fn(),
  showSystem: vi.fn(),
}))
vi.mock('../hooks/useWalletManagement', () => ({ useWallet: () => h.wallet }))
vi.mock('../hooks/useUI', () => ({ useNotification: () => ({ showNotification: h.showNotification }) }))
vi.mock('../lib/notifications/pushDelivery', () => ({
  showSystemNotification: (...args) => h.showSystem(...args),
}))

function entry(id, domain) {
  return { id, domain, refId: id, type: 't', message: `msg-${id}`, severity: 'info', actionable: false, createdAt: NOW, read: false }
}
// call 1 = catch-up (feed-only, empty); call 2 = live poll emitting `entries`.
function twoPhaseSource(entries) {
  let call = 0
  return {
    key: 'wagers',
    label: 'Wagers',
    detect: vi.fn(async () => {
      call += 1
      return { ok: true, entries: call === 1 ? [] : entries, nextSnapshots: {}, nextAux: {}, currentIds: [], actionNeededById: {} }
    }),
  }
}
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  localStorage.clear()
  h.wallet = { account: ACC, chainId: 137 }
  h.showNotification.mockReset()
  h.showSystem.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('ActivityProvider delivery routing', () => {
  it('push domain (master on): toasts AND raises a system notification', async () => {
    setDeliveryMode('wagers', 'push')
    setPushEnabled(true)
    const src = twoPhaseSource([entry('w1', 'wagers')])
    render(<ActivityProvider sources={[src]} />)
    await tick(0) // catch-up
    await tick(30_000) // live
    expect(h.showNotification).toHaveBeenCalledWith('msg-w1', 'info', 6000)
    expect(h.showSystem).toHaveBeenCalledTimes(1)
    expect(h.showSystem).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1', domain: 'wagers' }))
  })

  it('silent domain: no toast and no system notification', async () => {
    setDeliveryMode('wagers', 'silent')
    const src = twoPhaseSource([entry('w1', 'wagers')])
    render(<ActivityProvider sources={[src]} />)
    await tick(0)
    await tick(30_000)
    expect(h.showNotification).not.toHaveBeenCalled()
    expect(h.showSystem).not.toHaveBeenCalled()
  })

  it('push domain with master off: degrades to an app toast, no system notification', async () => {
    setDeliveryMode('wagers', 'push')
    setPushEnabled(false)
    const src = twoPhaseSource([entry('w1', 'wagers')])
    render(<ActivityProvider sources={[src]} />)
    await tick(0)
    await tick(30_000)
    expect(h.showNotification).toHaveBeenCalledWith('msg-w1', 'info', 6000)
    expect(h.showSystem).not.toHaveBeenCalled()
  })

  it('default (unconfigured) domain: app toast, no system notification', async () => {
    const src = twoPhaseSource([entry('w1', 'wagers')])
    render(<ActivityProvider sources={[src]} />)
    await tick(0)
    await tick(30_000)
    expect(h.showNotification).toHaveBeenCalledWith('msg-w1', 'info', 6000)
    expect(h.showSystem).not.toHaveBeenCalled()
  })
})
