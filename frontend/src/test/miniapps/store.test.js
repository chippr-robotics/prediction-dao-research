/**
 * Spec 073 T020 — the namespaced mini-app store (data-model.md §3).
 *
 * The load-bearing test is the collision test: two apps writing the same
 * logical key must not see each other's data, and that has to hold because of
 * the API's shape (FR-018), not because apps behave. The rest proves the
 * defensive contract this store owes a host that mounts third-party code — a
 * corrupt blob resets instead of throwing, and no write ever throws into the
 * app that made it.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  createAppStore,
  appStoreFeatureKey,
  appStoreStorageKey,
  __resetMiniAppStores,
  STORE_VERSION,
  MAX_NAMESPACE_BYTES,
} from '../../lib/miniapps/store'

const ACCOUNT = '0xAbCd000000000000000000000000000000000073'
const APP_A = 'app-one'
const APP_B = 'app-two'

beforeEach(() => {
  localStorage.clear()
  __resetMiniAppStores()
  vi.restoreAllMocks()
})

afterEach(() => {
  __resetMiniAppStores()
})

describe('mini-app store namespacing (FR-018)', () => {
  it('gives two apps writing the same logical key entirely separate data', () => {
    const a = createAppStore(ACCOUNT, APP_A)
    const b = createAppStore(ACCOUNT, APP_B)

    a.set('tracked', ['alpha'])
    b.set('tracked', ['beta'])

    expect(a.get('tracked')).toEqual(['alpha'])
    expect(b.get('tracked')).toEqual(['beta'])

    // Neither app's blob contains the other's value: the separation is in the
    // storage key, not in a filter applied at read time.
    const blobA = localStorage.getItem(appStoreStorageKey(ACCOUNT, APP_A))
    const blobB = localStorage.getItem(appStoreStorageKey(ACCOUNT, APP_B))
    expect(blobA).toContain('alpha')
    expect(blobA).not.toContain('beta')
    expect(blobB).toContain('beta')
    expect(blobB).not.toContain('alpha')
  })

  it('exposes no argument that could address another app (the namespace is structural)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = createAppStore(ACCOUNT, APP_A)
    const b = createAppStore(ACCOUNT, APP_B)
    b.set('tracked', ['beta'])

    // The whole surface is get/set/subscribe over a KEY — nothing takes an app
    // id, a namespace or a storage key, and the object cannot be re-pointed.
    expect(Object.keys(a).sort()).toEqual(['get', 'set', 'subscribe'])
    expect(Object.isFrozen(a)).toBe(true)

    // Keys shaped like a path, a feature key or a raw storage key reach
    // nothing: they are either not addressable keys at all, or ordinary keys
    // inside app A's OWN namespace. Either way app B is untouched.
    for (const hostile of [
      `../${APP_B}/tracked`,
      `${APP_B}:tracked`,
      appStoreFeatureKey(APP_B),
      appStoreStorageKey(ACCOUNT, APP_B),
    ]) {
      a.set(hostile, 'stolen')
      expect(a.get(hostile, 'absent')).not.toEqual(['beta'])
    }
    expect(b.get('tracked')).toEqual(['beta'])
    expect(localStorage.getItem(appStoreStorageKey(ACCOUNT, APP_B))).not.toContain('stolen')
  })

  it('refuses prototype-reaching keys instead of polluting Object.prototype', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = createAppStore(ACCOUNT, APP_A)
    expect(a.set('__proto__', { polluted: true })).toBe(false)
    expect(a.set('constructor', { polluted: true })).toBe(false)
    expect({}.polluted).toBeUndefined()
    expect(Object.prototype.polluted).toBeUndefined()
  })

  it('keys the namespace by account as well as app', () => {
    const other = '0xBeeF000000000000000000000000000000000073'
    createAppStore(ACCOUNT, APP_A).set('tracked', ['mine'])
    expect(createAppStore(other, APP_A).get('tracked')).toBe(null)
    expect(createAppStore(ACCOUNT, APP_A).get('tracked')).toEqual(['mine'])
  })

  it('refuses to open a namespace for a malformed app id', () => {
    // A malformed id could produce a storage key that collides with another
    // app's, so it fails loudly at construction rather than silently.
    for (const bad of ['', 'Bad-Id', '../escape', 'a'.repeat(64), null, 42]) {
      expect(() => createAppStore(ACCOUNT, bad)).toThrow(/invalid app id/)
    }
  })
})

describe('mini-app store persistence', () => {
  it('survives unmount/remount within a session (FR-016)', () => {
    createAppStore(ACCOUNT, APP_A).set('drafts', { note: 'in progress' })
    // A remount builds a new store object over the same namespace.
    expect(createAppStore(ACCOUNT, APP_A).get('drafts')).toEqual({ note: 'in progress' })
  })

  it('rehydrates from storage in a fresh session', () => {
    createAppStore(ACCOUNT, APP_A).set('drafts', { note: 'kept' })
    __resetMiniAppStores() // forget the in-memory tier, as a reload would
    expect(createAppStore(ACCOUNT, APP_A).get('drafts')).toEqual({ note: 'kept' })
  })

  it('writes the versioned shape data-model.md §3 specifies', () => {
    createAppStore(ACCOUNT, APP_A).set('tracked', [1, 2])
    const stored = JSON.parse(localStorage.getItem(appStoreStorageKey(ACCOUNT, APP_A)))
    expect(stored).toEqual({ version: STORE_VERSION, data: { tracked: [1, 2] } })
  })

  it('removes a key when set to undefined', () => {
    const a = createAppStore(ACCOUNT, APP_A)
    a.set('tracked', ['x'])
    expect(a.set('tracked', undefined)).toBe(true)
    expect(a.get('tracked', 'gone')).toBe('gone')
    expect(a.set('tracked', undefined)).toBe(false) // nothing left to remove
  })

  it('runs session-only with no account, persisting nothing', () => {
    const a = createAppStore(null, APP_A)
    expect(a.set('tracked', ['anon'])).toBe(true)
    expect(a.get('tracked')).toEqual(['anon'])
    expect(localStorage.length).toBe(0)
  })
})

describe('mini-app store defensive behavior', () => {
  it('resets a corrupt stored shape instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {}) // userStorage reports its own parse failure
    for (const corrupt of ['not json at all', JSON.stringify({ version: 99, data: { tracked: 1 } }), JSON.stringify([1, 2])]) {
      localStorage.setItem(appStoreStorageKey(ACCOUNT, APP_A), corrupt)
      __resetMiniAppStores()
      const a = createAppStore(ACCOUNT, APP_A)
      expect(a.get('tracked', 'reset')).toBe('reset')
      // The store is usable afterwards — a damaged blob is not a dead app.
      expect(a.set('tracked', ['fresh'])).toBe(true)
      expect(a.get('tracked')).toEqual(['fresh'])
    }
    expect(warn).toHaveBeenCalled()
  })

  it('drops unaddressable keys found in a stored blob', () => {
    // Written as raw JSON on purpose: an object literal's `__proto__` sets the
    // prototype instead of an own property, so it would never reach the blob.
    localStorage.setItem(
      appStoreStorageKey(ACCOUNT, APP_A),
      `{"version":${STORE_VERSION},"data":{"tracked":1,"not a key":2,"__proto__":{"bad":true}}}`,
    )
    __resetMiniAppStores()
    const a = createAppStore(ACCOUNT, APP_A)
    expect(a.get('tracked')).toBe(1)
    expect(a.get('not a key', 'absent')).toBe('absent')
    expect({}.bad).toBeUndefined()
  })

  it('never throws when storage is unavailable, and stays coherent for the session', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // userStorage reports the quota failure
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    try {
      const a = createAppStore(ACCOUNT, APP_A)
      expect(() => a.set('tracked', ['x'])).not.toThrow()
      // The durable tier could not take it; the app still reads what it wrote.
      expect(a.get('tracked')).toEqual(['x'])
    } finally {
      Storage.prototype.setItem = original
    }
  })

  it('refuses a value that cannot be persisted rather than keeping it in memory only', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = createAppStore(ACCOUNT, APP_A)
    const cyclic = {}
    cyclic.self = cyclic
    expect(a.set('tracked', cyclic)).toBe(false)
    expect(a.set('tracked', () => 'nope')).toBe(false)
    expect(a.set('tracked', 1n)).toBe(false)
    expect(a.get('tracked', 'absent')).toBe('absent')
  })

  it('refuses a write that would blow the namespace budget, keeping the previous value', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = createAppStore(ACCOUNT, APP_A)
    a.set('tracked', 'small')
    expect(a.set('drafts', 'x'.repeat(MAX_NAMESPACE_BYTES + 1))).toBe(false)
    expect(a.get('tracked')).toBe('small')
    expect(a.get('drafts', 'absent')).toBe('absent')
  })

  it('hands out frozen, stable values so an app cannot mutate stored state', () => {
    const a = createAppStore(ACCOUNT, APP_A)
    const written = { note: 'original', nested: { deep: true } }
    a.set('drafts', written)
    written.note = 'mutated after the write'

    const read = a.get('drafts')
    expect(read.note).toBe('original')
    expect(Object.isFrozen(read)).toBe(true)
    expect(Object.isFrozen(read.nested)).toBe(true)
    // Stable reference between writes — usable as a useSyncExternalStore snapshot.
    expect(a.get('drafts')).toBe(read)
  })
})

describe('mini-app store subscribe seam', () => {
  it('notifies on a real change and stays quiet for a no-op write', () => {
    const a = createAppStore(ACCOUNT, APP_A)
    const seen = vi.fn()
    const unsubscribe = a.subscribe(seen)

    expect(a.set('tracked', ['one'])).toBe(true)
    expect(seen).toHaveBeenCalledTimes(1)

    expect(a.set('tracked', ['one'])).toBe(false) // same value
    expect(seen).toHaveBeenCalledTimes(1)

    unsubscribe()
    a.set('tracked', ['two'])
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('does not notify another app', () => {
    const seen = vi.fn()
    createAppStore(ACCOUNT, APP_A).subscribe(seen)
    createAppStore(ACCOUNT, APP_B).set('tracked', ['beta'])
    expect(seen).not.toHaveBeenCalled()
  })

  it('survives a listener that throws', () => {
    const a = createAppStore(ACCOUNT, APP_A)
    a.subscribe(() => {
      throw new Error('bad subscriber')
    })
    const good = vi.fn()
    a.subscribe(good)
    expect(() => a.set('tracked', ['x'])).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    expect(a.get('tracked')).toEqual(['x'])
  })

  it('picks up a cross-tab write to its own namespace', () => {
    const a = createAppStore(ACCOUNT, APP_A)
    const seen = vi.fn()
    a.subscribe(seen)

    const key = appStoreStorageKey(ACCOUNT, APP_A)
    localStorage.setItem(key, JSON.stringify({ version: STORE_VERSION, data: { tracked: ['other tab'] } }))
    window.dispatchEvent(new StorageEvent('storage', { key }))

    expect(seen).toHaveBeenCalled()
    expect(a.get('tracked')).toEqual(['other tab'])
  })

  it('ignores a cross-tab write to a different app', () => {
    const a = createAppStore(ACCOUNT, APP_A)
    a.set('tracked', ['mine'])
    const seen = vi.fn()
    a.subscribe(seen)

    window.dispatchEvent(new StorageEvent('storage', { key: appStoreStorageKey(ACCOUNT, APP_B) }))

    expect(seen).not.toHaveBeenCalled()
    expect(a.get('tracked')).toEqual(['mine'])
  })
})
