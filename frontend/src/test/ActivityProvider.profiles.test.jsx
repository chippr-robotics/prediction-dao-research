/**
 * ActivityProvider × notification profiles (spec 059). Verifies the poll
 * loop's delivery gate honors the active profile: blocked domains are feed-only
 * (still appended, still unread), allowed domains keep their base-layer mode,
 * exceptions (actionable / deadline warn-*) break through — upgrading a silent
 * base to an in-app toast — and the no-profile path matches the pre-profile
 * behavior exactly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ActivityProvider } from '../contexts/ActivityProvider'
import { setDeliveryMode, setPushEnabled } from '../lib/notifications/deliveryPreferences'
import { createProfile, enableProfile, updateProfile } from '../lib/notifications/notificationProfiles'
import { loadStore } from '../data/notifications/activityStore'

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

function entry(id, domain, over = {}) {
  return { id, domain, refId: id, type: 't', message: `msg-${id}`, severity: 'info', actionable: false, createdAt: NOW, read: false, ...over }
}
// call 1 = catch-up (feed-only, empty); call 2 = live poll emitting `entries`.
function twoPhaseSource(key, entries) {
  let call = 0
  return {
    key,
    label: key,
    detect: vi.fn(async () => {
      call += 1
      return { ok: true, entries: call === 1 ? [] : entries, nextSnapshots: {}, nextAux: {}, currentIds: [], actionNeededById: {} }
    }),
  }
}
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

async function runLive(sources) {
  render(<ActivityProvider sources={sources} />)
  await tick(0) // catch-up
  await tick(30_000) // live
}

beforeEach(() => {
  localStorage.clear()
  h.wallet = { account: ACC, chainId: 137 }
  h.showNotification.mockReset()
  h.showSystem.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('ActivityProvider with an active notification profile', () => {
  it('blocked domain: no toast, no push — but appended to the feed unread', async () => {
    const p = createProfile({ name: 'Sleep', allowedDomains: ['wagers'], allowActionRequired: false, allowDeadlineReminders: false })
    enableProfile(p.id)
    setDeliveryMode('dao', 'push')
    setPushEnabled(true)
    await runLive([twoPhaseSource('dao', [entry('d1', 'dao')])])
    expect(h.showNotification).not.toHaveBeenCalled()
    expect(h.showSystem).not.toHaveBeenCalled()
    const persisted = loadStore(ACC.toLowerCase(), 137)
    expect(persisted.entries.map((e) => e.id)).toContain('d1')
    expect(persisted.entries.find((e) => e.id === 'd1').read).toBe(false)
  })

  it('allowed domain: delivered per its base mode (push)', async () => {
    const p = createProfile({ name: 'Sleep', allowedDomains: ['wagers'] })
    enableProfile(p.id)
    setDeliveryMode('wagers', 'push')
    setPushEnabled(true)
    await runLive([twoPhaseSource('wagers', [entry('w1', 'wagers')])])
    expect(h.showNotification).toHaveBeenCalledWith('msg-w1', 'info', 6000)
    expect(h.showSystem).toHaveBeenCalledTimes(1)
  })

  it('action-required entry from a blocked domain breaks through; toggle off silences it', async () => {
    const p = createProfile({ name: 'Sleep', allowedDomains: ['wagers'] })
    enableProfile(p.id)
    setDeliveryMode('custody', 'app')
    await runLive([twoPhaseSource('custody', [entry('c1', 'custody', { actionable: true })])])
    expect(h.showNotification).toHaveBeenCalledWith('msg-c1', 'info', 6000)

    h.showNotification.mockReset()
    updateProfile(p.id, { allowActionRequired: false, allowDeadlineReminders: false })
    await runLive([twoPhaseSource('custody', [entry('c2', 'custody', { actionable: true })])])
    expect(h.showNotification).not.toHaveBeenCalled()
  })

  it('deadline warn-* entry breaks through even from a blocked domain', async () => {
    const p = createProfile({ name: 'Sleep', allowedDomains: [], allowActionRequired: false })
    enableProfile(p.id)
    setDeliveryMode('wagers', 'app')
    await runLive([twoPhaseSource('wagers', [entry('w1', 'wagers', { type: 'warn-acceptance', actionable: true, severity: 'warning' })])])
    expect(h.showNotification).toHaveBeenCalledWith('msg-w1', 'warning', 6000)
  })

  it('exception over a silent base category upgrades to an in-app toast (no push)', async () => {
    const p = createProfile({ name: 'Sleep', allowedDomains: [] })
    enableProfile(p.id)
    setDeliveryMode('custody', 'silent')
    await runLive([twoPhaseSource('custody', [entry('c1', 'custody', { actionable: true })])])
    expect(h.showNotification).toHaveBeenCalledWith('msg-c1', 'info', 6000)
    expect(h.showSystem).not.toHaveBeenCalled()
  })

  it('profiles saved but none active: behavior identical to base layer', async () => {
    createProfile({ name: 'Sleep', allowedDomains: [] }) // never enabled
    setDeliveryMode('wagers', 'push')
    setPushEnabled(true)
    await runLive([twoPhaseSource('wagers', [entry('w1', 'wagers')])])
    expect(h.showNotification).toHaveBeenCalledWith('msg-w1', 'info', 6000)
    expect(h.showSystem).toHaveBeenCalledTimes(1)
  })
})
