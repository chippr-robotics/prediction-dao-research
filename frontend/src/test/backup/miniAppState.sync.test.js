/**
 * Spec 073 T040 — mini-app state rides the spec-032 backup.
 *
 * The interesting cases here are not "does a round trip work" but the three
 * ways this seam could quietly lose or leak state: a restore landing in storage
 * while a mounted app keeps serving pre-restore values, a hand-edited bundle
 * carrying keys or ids a live `set` would have refused, and `replace` leaving
 * orphan namespaces from the device being restored ONTO.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createAppStore,
  loadMiniAppState,
  applyMiniAppState,
  mergeMiniAppState,
  listStoredAppIds,
  __resetMiniAppStores,
  MAX_NAMESPACE_BYTES,
} from '../../lib/miniapps/store'
import { syncedObjects } from '../../lib/backup/syncedObjects'

const ACCT = '0xAbC0000000000000000000000000000000000073'

beforeEach(() => {
  localStorage.clear()
  __resetMiniAppStores()
})

describe('miniAppState synced object registration', () => {
  it('is registered, not network-scoped, and wired to the store seam', () => {
    const entry = syncedObjects.find((o) => o.key === 'miniAppState')
    expect(entry).toBeDefined()
    // App data is chain-agnostic; claiming otherwise would make the restore UI
    // offer a per-network choice this data cannot honor.
    expect(entry.networkScoped).toBe(false)
    expect(entry.label).toBe('Mini-app data')
    expect(typeof entry.load).toBe('function')
    expect(typeof entry.apply).toBe('function')
    expect(typeof entry.merge).toBe('function')
  })

  it('collects every app in ONE entry, so a new listing needs no backup edit', () => {
    createAppStore(ACCT, 'token-mint').set('drafts', { name: 'ACME' })
    createAppStore(ACCT, 'clearpath').set('tracked', ['0xdao'])
    const entry = syncedObjects.find((o) => o.key === 'miniAppState')
    expect(entry.load(ACCT)).toEqual({
      'clearpath': { tracked: ['0xdao'] },
      'token-mint': { drafts: { name: 'ACME' } },
    })
  })
})

describe('loadMiniAppState', () => {
  it('reads the durable tier for every app with state', () => {
    createAppStore(ACCT, 'token-mint').set('drafts', { symbol: 'ACME' })
    expect(loadMiniAppState(ACCT)).toEqual({ 'token-mint': { drafts: { symbol: 'ACME' } } })
  })

  it('omits empty namespaces rather than writing noise into the backup', () => {
    createAppStore(ACCT, 'token-mint') // mounted, never wrote
    expect(loadMiniAppState(ACCT)).toEqual({})
  })

  it('returns nothing with no account (session-only state is not persisted)', () => {
    createAppStore(null, 'token-mint').set('drafts', { symbol: 'ACME' })
    expect(loadMiniAppState(null)).toEqual({})
  })

  it('still captures an app that has since been delisted — the state is the member\'s', () => {
    createAppStore(ACCT, 'some-old-app').set('notes', 'keep me')
    // No registry read is involved; enumeration is purely local storage.
    expect(listStoredAppIds(ACCT)).toContain('some-old-app')
    expect(loadMiniAppState(ACCT)['some-old-app']).toEqual({ notes: 'keep me' })
  })
})

describe('mergeMiniAppState', () => {
  it('unions apps and, within an app, unions keys', () => {
    const { value } = mergeMiniAppState(
      { 'token-mint': { a: 1 } },
      { 'token-mint': { b: 2 }, 'clearpath': { c: 3 } },
    )
    expect(value).toEqual({ 'token-mint': { a: 1, b: 2 }, 'clearpath': { c: 3 } })
  })

  it('reports a same-key disagreement instead of silently discarding one side', () => {
    const { value, conflicts } = mergeMiniAppState(
      { 'token-mint': { draft: 'local' } },
      { 'token-mint': { draft: 'backup' } },
    )
    expect(conflicts).toEqual([{ appId: 'token-mint', key: 'draft' }])
    expect(value['token-mint'].draft).toBe('backup') // incoming wins, but it is reported
  })

  it('does not report a conflict when both sides hold the same value', () => {
    const { conflicts } = mergeMiniAppState(
      { 'token-mint': { draft: { x: 1 } } },
      { 'token-mint': { draft: { x: 1 } } },
    )
    expect(conflicts).toEqual([])
  })

  it('merges shallowly — it never invents a semantics for opaque app values', () => {
    const { value } = mergeMiniAppState(
      { app: { list: [1, 2], obj: { keep: true } } },
      { app: { list: [3], obj: { other: true } } },
    )
    // No array concat, no deep object union: the incoming value replaces wholesale.
    expect(value.app.list).toEqual([3])
    expect(value.app.obj).toEqual({ other: true })
  })
})

describe('applyMiniAppState — untrusted input', () => {
  it('drops an app id a live store would refuse to open', () => {
    applyMiniAppState(ACCT, { 'Bad_Id': { k: 1 }, '../escape': { k: 1 }, 'ok-app': { k: 1 } }, 'replace')
    expect(Object.keys(loadMiniAppState(ACCT))).toEqual(['ok-app'])
  })

  it('drops keys a live `set` would refuse, including prototype names', () => {
    applyMiniAppState(ACCT, { 'ok-app': { good: 1, __proto__: { polluted: true }, 'bad key!': 2 } }, 'replace')
    expect(loadMiniAppState(ACCT)['ok-app']).toEqual({ good: 1 })
    expect({}.polluted).toBeUndefined()
  })

  it('refuses a namespace over the same ceiling a live write is held to', () => {
    const huge = 'x'.repeat(MAX_NAMESPACE_BYTES + 10)
    applyMiniAppState(ACCT, { 'ok-app': { big: huge }, 'small-app': { k: 1 } }, 'replace')
    expect(loadMiniAppState(ACCT)).toEqual({ 'small-app': { k: 1 } })
  })

  it('survives a bundle that is not an object', () => {
    expect(() => applyMiniAppState(ACCT, null, 'replace')).not.toThrow()
    expect(() => applyMiniAppState(ACCT, 'nope', 'merge')).not.toThrow()
    expect(loadMiniAppState(ACCT)).toEqual({})
  })
})

describe('applyMiniAppState — modes', () => {
  it('merge is additive and returns the conflicts', () => {
    createAppStore(ACCT, 'token-mint').set('draft', 'local')
    createAppStore(ACCT, 'keep-me').set('k', 1)
    const { conflicts } = applyMiniAppState(ACCT, { 'token-mint': { draft: 'backup' } }, 'merge')
    expect(conflicts).toEqual([{ appId: 'token-mint', key: 'draft' }])
    const state = loadMiniAppState(ACCT)
    expect(state['token-mint'].draft).toBe('backup')
    expect(state['keep-me']).toEqual({ k: 1 }) // untouched
  })

  it('replace clears namespaces the bundle does not mention', () => {
    createAppStore(ACCT, 'orphan').set('k', 1)
    applyMiniAppState(ACCT, { 'token-mint': { draft: 'backup' } }, 'replace')
    const state = loadMiniAppState(ACCT)
    expect(state['token-mint']).toEqual({ draft: 'backup' })
    // The orphan namespace is emptied, so a restore reproduces the backed-up
    // device rather than leaving state from this one behind.
    expect(state.orphan).toBeUndefined()
  })
})

describe('applyMiniAppState — a mounted app sees the restore', () => {
  it('refreshes the session tier and notifies subscribers', () => {
    const store = createAppStore(ACCT, 'token-mint')
    store.set('draft', 'before')
    let notifications = 0
    store.subscribe(() => { notifications += 1 })

    applyMiniAppState(ACCT, { 'token-mint': { draft: 'after' } }, 'replace')

    // Without the re-hydration this is the bug that reads as "the restore did
    // nothing": storage moved, but `get` still serves the session copy.
    expect(store.get('draft')).toBe('after')
    expect(notifications).toBeGreaterThan(0)
  })

  it('leaves another account\'s mounted store alone', () => {
    const other = '0xDdD0000000000000000000000000000000000073'
    const mine = createAppStore(ACCT, 'token-mint')
    const theirs = createAppStore(other, 'token-mint')
    mine.set('draft', 'mine')
    theirs.set('draft', 'theirs')

    applyMiniAppState(ACCT, { 'token-mint': { draft: 'restored' } }, 'replace')

    expect(mine.get('draft')).toBe('restored')
    expect(theirs.get('draft')).toBe('theirs')
  })
})
