import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spec 102 §5 — deep links. The rules with teeth: ONLY the tenant's own
// origin routes (a foreign URL through the link channel is ignored outright),
// and the seam is inert on web.

const platformRef = { value: 'android' }
const listeners = []

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => platformRef.value,
    isPluginAvailable: () => true,
  },
}))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((event, handler) => {
      const entry = { event, handler, removed: false }
      listeners.push(entry)
      return Promise.resolve({ remove: () => { entry.removed = true } })
    }),
  },
}))

import { pathForIncomingUrl, subscribeDeepLinks } from '../../lib/native/deepLinks'
import { __resetRuntimeForTests } from '../../lib/native/runtime'

const ORIGIN = 'https://fairwins.app'

function fire(url) {
  for (const entry of listeners) {
    if (entry.event === 'appUrlOpen' && !entry.removed) entry.handler({ url })
  }
}

describe('deep links', () => {
  beforeEach(() => {
    platformRef.value = 'android'
    listeners.length = 0
    __resetRuntimeForTests()
  })

  it('maps tenant-origin URLs to SPA paths, query and hash intact', () => {
    expect(pathForIncomingUrl('https://fairwins.app/wallet?tab=trade&view=perps#top', { appOrigin: ORIGIN }))
      .toBe('/wallet?tab=trade&view=perps#top')
    expect(pathForIncomingUrl('https://fairwins.app/', { appOrigin: ORIGIN })).toBe('/')
  })

  it('IGNORES anything that is not the tenant origin — never opened, never navigated', () => {
    expect(pathForIncomingUrl('https://evil.example/wallet', { appOrigin: ORIGIN })).toBeNull()
    expect(pathForIncomingUrl('http://fairwins.app/wallet', { appOrigin: ORIGIN })).toBeNull() // scheme downgrade
    expect(pathForIncomingUrl('not a url', { appOrigin: ORIGIN })).toBeNull()
  })

  it('delivers mapped paths to the consumer and drops foreign ones', () => {
    const onPath = vi.fn()
    subscribeDeepLinks(onPath, { appOrigin: ORIGIN })
    fire('https://fairwins.app/wallet?tab=custody')
    fire('https://attacker.example/wallet')
    expect(onPath).toHaveBeenCalledTimes(1)
    expect(onPath).toHaveBeenCalledWith('/wallet?tab=custody')
  })

  it('is inert on web and unsubscribes cleanly on native', async () => {
    platformRef.value = 'web'
    __resetRuntimeForTests()
    const onPath = vi.fn()
    const unsubscribe = subscribeDeepLinks(onPath, { appOrigin: ORIGIN })
    expect(listeners).toHaveLength(0)
    unsubscribe()

    platformRef.value = 'ios'
    __resetRuntimeForTests()
    const stop = subscribeDeepLinks(onPath, { appOrigin: ORIGIN })
    expect(listeners).toHaveLength(1)
    stop()
    await Promise.resolve()
    await Promise.resolve()
    expect(listeners[0].removed).toBe(true)
  })
})
