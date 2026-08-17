// App Store favorites (Quick Access shortcuts) — device-scoped store, same shape as
// `lib/network/endpointStore.js`. This file guards persistence, normalization of garbage
// input, and the revision/subscriber contract the catalog panel and nav drawer both rely on.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  FAVORITES_PREF_KEY,
  addFavoriteApp,
  favoritesRevision,
  isFavoriteApp,
  loadFavoriteApps,
  removeFavoriteApp,
  subscribeFavoriteApps,
  toggleFavoriteApp,
  __resetFavoriteAppsForTests,
} from '../../lib/miniapps/favorites'

describe('favorites — persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
  })

  it('starts empty', () => {
    expect(loadFavoriteApps()).toEqual([])
  })

  it('round-trips a favorite through storage', () => {
    addFavoriteApp({ id: 7, slug: 'token-mint', name: 'Token Mint' })
    __resetFavoriteAppsForTests() // force a re-read from storage
    expect(loadFavoriteApps()).toEqual([{ id: 7, slug: 'token-mint', name: 'Token Mint' }])
  })

  it('is a no-op when adding a second time', () => {
    addFavoriteApp({ id: 7, slug: 'token-mint', name: 'Token Mint' })
    addFavoriteApp({ id: 7, slug: 'token-mint', name: 'Token Mint' })
    expect(loadFavoriteApps()).toHaveLength(1)
  })

  it('refuses an entry missing an id, slug or name', () => {
    addFavoriteApp({ slug: 'token-mint', name: 'Token Mint' })
    addFavoriteApp({ id: 7, name: 'Token Mint' })
    addFavoriteApp({ id: 7, slug: 'token-mint' })
    addFavoriteApp({})
    expect(loadFavoriteApps()).toEqual([])
  })

  it('removes a favorite, leaving the others alone', () => {
    addFavoriteApp({ id: 7, slug: 'token-mint', name: 'Token Mint' })
    addFavoriteApp({ id: 8, slug: 'clearpath', name: 'ClearPath' })
    removeFavoriteApp(7)
    expect(loadFavoriteApps()).toEqual([{ id: 8, slug: 'clearpath', name: 'ClearPath' }])
  })

  it('removing an id that was never favorited is a no-op', () => {
    addFavoriteApp({ id: 7, slug: 'token-mint', name: 'Token Mint' })
    removeFavoriteApp(999)
    expect(loadFavoriteApps()).toHaveLength(1)
  })

  it('toggle adds when absent and removes when present', () => {
    const app = { id: 7, slug: 'token-mint', name: 'Token Mint' }
    toggleFavoriteApp(app)
    expect(isFavoriteApp(7)).toBe(true)
    toggleFavoriteApp(app)
    expect(isFavoriteApp(7)).toBe(false)
  })

  it('bumps the revision and notifies subscribers on every change', () => {
    const seen = []
    const unsubscribe = subscribeFavoriteApps((rev) => seen.push(rev))
    const before = favoritesRevision()

    addFavoriteApp({ id: 7, slug: 'token-mint', name: 'Token Mint' })
    removeFavoriteApp(7)

    expect(seen).toHaveLength(2)
    expect(favoritesRevision()).toBe(before + 2)
    unsubscribe()
    addFavoriteApp({ id: 8, slug: 'clearpath', name: 'ClearPath' })
    expect(seen).toHaveLength(2) // unsubscribed
  })

  it('ignores garbage in storage rather than throwing', () => {
    localStorage.setItem('fw_global_prefs', JSON.stringify({ [FAVORITES_PREF_KEY]: 'not-an-array' }))
    __resetFavoriteAppsForTests()
    expect(loadFavoriteApps()).toEqual([])
  })

  it('drops a malformed entry from a mixed list rather than the whole list', () => {
    localStorage.setItem(
      'fw_global_prefs',
      JSON.stringify({
        [FAVORITES_PREF_KEY]: [
          { id: 7, slug: 'token-mint', name: 'Token Mint' },
          { id: 'nope', slug: 'bad', name: 'Bad' },
        ],
      }),
    )
    __resetFavoriteAppsForTests()
    expect(loadFavoriteApps()).toEqual([{ id: 7, slug: 'token-mint', name: 'Token Mint' }])
  })

  it('de-duplicates by id when storage somehow carries the same id twice', () => {
    localStorage.setItem(
      'fw_global_prefs',
      JSON.stringify({
        [FAVORITES_PREF_KEY]: [
          { id: 7, slug: 'token-mint', name: 'Token Mint' },
          { id: 7, slug: 'token-mint-v2', name: 'Token Mint (renamed)' },
        ],
      }),
    )
    __resetFavoriteAppsForTests()
    expect(loadFavoriteApps()).toHaveLength(1)
  })
})

/*
 * Spec 093 follow-up — admin-tool pins share this store under a disjoint
 * string-id namespace (`admin-tool:<appId>`), with no slug: the destination
 * derives from the id, not from a registry record.
 */
describe('admin-tool favorites (spec 093 follow-up)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
  })

  it('round-trips an admin-tool entry, slug-less', () => {
    addFavoriteApp({ id: 'admin-tool:incident-response', name: 'Incident Response' })
    expect(loadFavoriteApps()).toEqual([
      { id: 'admin-tool:incident-response', slug: '', name: 'Incident Response' },
    ])
    expect(isFavoriteApp('admin-tool:incident-response')).toBe(true)

    removeFavoriteApp('admin-tool:incident-response')
    expect(loadFavoriteApps()).toEqual([])
  })

  it('coexists with registry entries and never collides with their numeric ids', () => {
    addFavoriteApp({ id: 7, slug: 'token-mint', name: 'Token Mint' })
    addFavoriteApp({ id: 'admin-tool:maintenance', name: 'Maintenance' })

    expect(loadFavoriteApps()).toHaveLength(2)
    expect(isFavoriteApp(7)).toBe(true)
    expect(isFavoriteApp('admin-tool:maintenance')).toBe(true)
    removeFavoriteApp(7)
    expect(isFavoriteApp('admin-tool:maintenance')).toBe(true)
  })

  it('refuses a string id outside the reserved namespace', () => {
    addFavoriteApp({ id: 'not-a-tool', name: 'Nope' })
    addFavoriteApp({ id: 'admin-tool:INVALID CHARS', name: 'Nope' })
    expect(loadFavoriteApps()).toEqual([])
  })
})
