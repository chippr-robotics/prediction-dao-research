/**
 * Unit tests for the wager activity localStorage store (spec 012, T005).
 *
 * Contract under test: specs/012-wager-notifications/contracts/storage-schema.md
 *   - key layout fw_user_<lowercased address>_wager_activity_v1_<chainId>
 *     (account scoping via userStorage, chain scoping via the feature key)
 *   - version-1 value shape, reset on version mismatch / corrupt JSON
 *   - entries pruned to the 100 newest on save, dedup by entry.id on append
 *   - markRead ref forms: {entryId} | {wagerId} | '*'
 *   - snapshot retention: drop only absent + terminal + older than 30 days
 *
 * jsdom localStorage is real — cleared in beforeEach. The module is pure
 * apart from loadStore/saveStore; time is always passed in as nowMs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  defaultStore,
  loadStore,
  saveStore,
  appendEntries,
  markRead,
  pruneSnapshots,
} from '../data/notifications/activityStore'

const ACCOUNT_A = '0xAbCdEF1234567890abcdef1234567890ABCDef12'
const ACCOUNT_B = '0xB0B0000000000000000000000000000000000b0b'
const POLYGON = 137
const AMOY = 80002

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = 1765432100000

function fullKey(account, chainId) {
  return `fw_user_${account.toLowerCase()}_wager_activity_v1_${chainId}`
}

function makeEntry(overrides = {}) {
  return {
    id: '42:won-claimable',
    type: 'won-claimable',
    wagerId: '42',
    message: "You won 'Lakers in 6'! Claim 50 USDC",
    severity: 'success',
    actionable: true,
    createdAt: NOW,
    read: false,
    ...overrides,
  }
}

/** Newest-first list: index 0 has the largest createdAt. */
function makeEntries(count, { prefix = 'w' } = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeEntry({
      id: `${prefix}${i}:state-changed`,
      type: 'state-changed',
      wagerId: `${prefix}${i}`,
      createdAt: NOW - i * 1000,
    })
  )
}

function makeSnapshot(overrides = {}) {
  return {
    id: '42',
    state: 'resolvable',
    status: 'active',
    winner: null,
    paid: false,
    acceptanceDeadline: NOW - DAY_MS,
    resolveDeadlineTime: NOW + DAY_MS,
    tradingEndTime: NOW - 2 * DAY_MS,
    drawProposedBy: null,
    snappedAt: NOW,
    ...overrides,
  }
}

function populatedStore(overrides = {}) {
  return {
    ...defaultStore(),
    lastPolledAt: NOW,
    snapshots: { 42: makeSnapshot() },
    entries: [makeEntry()],
    deadlineWarnings: { 42: { resolution: NOW } },
    drawScanBlock: 88123456,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('defaultStore', () => {
  it('returns the version-1 schema shape', () => {
    expect(defaultStore()).toEqual({
      version: 1,
      lastPolledAt: 0,
      snapshots: {},
      entries: [],
      deadlineWarnings: {},
      drawScanBlock: 0,
    })
  })

  it('returns a fresh object on every call (mutation safe)', () => {
    const first = defaultStore()
    first.entries.push(makeEntry())
    first.snapshots['42'] = makeSnapshot()
    expect(defaultStore().entries).toEqual([])
    expect(defaultStore().snapshots).toEqual({})
  })
})

describe('loadStore / saveStore — account and chain scoping', () => {
  it('persists under fw_user_<address>_wager_activity_v1_<chainId> in localStorage only', () => {
    saveStore(ACCOUNT_A, POLYGON, populatedStore())
    expect(localStorage.getItem(fullKey(ACCOUNT_A, POLYGON))).not.toBeNull()
    expect(sessionStorage.getItem(fullKey(ACCOUNT_A, POLYGON))).toBeNull()
  })

  it('round-trips a full store', () => {
    const store = populatedStore()
    saveStore(ACCOUNT_A, POLYGON, store)
    expect(loadStore(ACCOUNT_A, POLYGON)).toEqual(store)
  })

  it('keeps two accounts on the same chain isolated', () => {
    saveStore(ACCOUNT_A, POLYGON, populatedStore({ drawScanBlock: 111 }))
    saveStore(ACCOUNT_B, POLYGON, populatedStore({ drawScanBlock: 222 }))

    expect(loadStore(ACCOUNT_A, POLYGON).drawScanBlock).toBe(111)
    expect(loadStore(ACCOUNT_B, POLYGON).drawScanBlock).toBe(222)
  })

  it('keeps two chains for the same account isolated', () => {
    saveStore(ACCOUNT_A, POLYGON, populatedStore({ drawScanBlock: 137137 }))
    saveStore(ACCOUNT_A, AMOY, populatedStore({ drawScanBlock: 80002 }))

    expect(loadStore(ACCOUNT_A, POLYGON).drawScanBlock).toBe(137137)
    expect(loadStore(ACCOUNT_A, AMOY).drawScanBlock).toBe(80002)
    // The unsaved (account, chain) pair stays empty — no bleed.
    expect(loadStore(ACCOUNT_B, AMOY)).toEqual(defaultStore())
  })

  it('treats account addresses case-insensitively', () => {
    saveStore(ACCOUNT_A.toUpperCase().replace('0X', '0x'), POLYGON, populatedStore())
    expect(loadStore(ACCOUNT_A.toLowerCase(), POLYGON).entries).toHaveLength(1)
  })

  it('returns defaults for a pair with nothing stored, without warning', () => {
    expect(loadStore(ACCOUNT_A, POLYGON)).toEqual(defaultStore())
    expect(console.warn).not.toHaveBeenCalled()
  })
})

describe('loadStore — resilience', () => {
  it('resets to defaults on version mismatch', () => {
    localStorage.setItem(
      fullKey(ACCOUNT_A, POLYGON),
      JSON.stringify({ ...populatedStore(), version: 2 })
    )
    expect(loadStore(ACCOUNT_A, POLYGON)).toEqual(defaultStore())
    expect(console.warn).toHaveBeenCalled()
  })

  it('resets to defaults on corrupt JSON without throwing (console.warn)', () => {
    localStorage.setItem(fullKey(ACCOUNT_A, POLYGON), '{not valid json!!')
    let store
    expect(() => {
      store = loadStore(ACCOUNT_A, POLYGON)
    }).not.toThrow()
    expect(store).toEqual(defaultStore())
    expect(console.warn).toHaveBeenCalled()
  })

  it('resets to defaults when the stored value is not an object', () => {
    localStorage.setItem(fullKey(ACCOUNT_A, POLYGON), JSON.stringify('hello'))
    expect(loadStore(ACCOUNT_A, POLYGON)).toEqual(defaultStore())
    expect(console.warn).toHaveBeenCalled()
  })

  it('resets to defaults when a version-1 store has a corrupt shape', () => {
    localStorage.setItem(
      fullKey(ACCOUNT_A, POLYGON),
      JSON.stringify({ ...populatedStore(), entries: 'nope' })
    )
    expect(loadStore(ACCOUNT_A, POLYGON)).toEqual(defaultStore())
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('no connected account', () => {
  it('loadStore returns defaults without reading storage', () => {
    saveStore(ACCOUNT_A, POLYGON, populatedStore())
    const getSpy = vi.spyOn(Storage.prototype, 'getItem')

    expect(loadStore(null, POLYGON)).toEqual(defaultStore())
    expect(loadStore(undefined, POLYGON)).toEqual(defaultStore())
    expect(loadStore('', POLYGON)).toEqual(defaultStore())
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('saveStore writes nothing', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    saveStore(null, POLYGON, populatedStore())
    saveStore(undefined, POLYGON, populatedStore())
    expect(setSpy).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
})

describe('saveStore — entry pruning', () => {
  it('prunes entries to the 100 newest on write', () => {
    const entries = makeEntries(120)
    saveStore(ACCOUNT_A, POLYGON, populatedStore({ entries }))

    const persisted = loadStore(ACCOUNT_A, POLYGON)
    expect(persisted.entries).toHaveLength(100)
    // Newest-first order preserved; the 20 oldest (tail) are dropped.
    expect(persisted.entries[0].id).toBe(entries[0].id)
    expect(persisted.entries[99].id).toBe(entries[99].id)
    const keptIds = new Set(persisted.entries.map((e) => e.id))
    expect(keptIds.has(entries[100].id)).toBe(false)
    expect(keptIds.has(entries[119].id)).toBe(false)
  })

  it('does not mutate the store it is given', () => {
    const store = populatedStore({ entries: makeEntries(120) })
    saveStore(ACCOUNT_A, POLYGON, store)
    expect(store.entries).toHaveLength(120)
  })
})

describe('appendEntries', () => {
  it('prepends new entries ahead of existing ones (newest first)', () => {
    const existing = makeEntry({ id: '1:accepted', wagerId: '1', createdAt: NOW - 5000 })
    const incoming = makeEntry({ id: '2:won-claimable', wagerId: '2', createdAt: NOW })

    const next = appendEntries({ ...defaultStore(), entries: [existing] }, [incoming])
    expect(next.entries.map((e) => e.id)).toEqual(['2:won-claimable', '1:accepted'])
  })

  it('never re-adds an existing id — the existing entry wins', () => {
    const existing = makeEntry({ id: '42:won-claimable', read: true, message: 'original' })
    const replay = makeEntry({ id: '42:won-claimable', read: false, message: 'replayed' })

    const next = appendEntries({ ...defaultStore(), entries: [existing] }, [replay])
    expect(next.entries).toHaveLength(1)
    expect(next.entries[0].read).toBe(true)
    expect(next.entries[0].message).toBe('original')
  })

  it('dedups within the incoming batch itself', () => {
    const a = makeEntry({ id: '7:expired', wagerId: '7' })
    const b = makeEntry({ id: '7:expired', wagerId: '7', message: 'dup' })

    const next = appendEntries(defaultStore(), [a, b])
    expect(next.entries).toHaveLength(1)
    expect(next.entries[0].message).toBe(a.message)
  })

  it('caps at 100, dropping the oldest from the tail', () => {
    const existing = makeEntries(95)
    const incoming = makeEntries(10, { prefix: 'n' })

    const next = appendEntries({ ...defaultStore(), entries: existing }, incoming)
    expect(next.entries).toHaveLength(100)
    expect(next.entries[0].id).toBe(incoming[0].id)
    expect(next.entries[9].id).toBe(incoming[9].id)
    expect(next.entries[10].id).toBe(existing[0].id)
    const keptIds = new Set(next.entries.map((e) => e.id))
    for (const dropped of existing.slice(90)) {
      expect(keptIds.has(dropped.id)).toBe(false)
    }
  })

  it('returns a new store and leaves the input untouched', () => {
    const store = { ...defaultStore(), entries: [makeEntry()] }
    const next = appendEntries(store, [makeEntry({ id: '9:lost', wagerId: '9' })])

    expect(next).not.toBe(store)
    expect(next.entries).not.toBe(store.entries)
    expect(store.entries).toHaveLength(1)
  })
})

describe('markRead', () => {
  function threeEntryStore() {
    return {
      ...defaultStore(),
      entries: [
        makeEntry({ id: '1:won-claimable', wagerId: '1' }),
        makeEntry({ id: '1:resolvable', wagerId: '1', type: 'resolvable' }),
        makeEntry({ id: '2:lost', wagerId: '2', type: 'lost' }),
      ],
    }
  }

  it('{entryId} marks exactly that entry read', () => {
    const next = markRead(threeEntryStore(), { entryId: '1:resolvable' })
    expect(next.entries.map((e) => e.read)).toEqual([false, true, false])
  })

  it('{wagerId} marks all of that wager’s entries read', () => {
    const next = markRead(threeEntryStore(), { wagerId: '1' })
    expect(next.entries.map((e) => e.read)).toEqual([true, true, false])
  })

  it("'*' marks every entry read", () => {
    const next = markRead(threeEntryStore(), '*')
    expect(next.entries.every((e) => e.read)).toBe(true)
  })

  it('does not mutate the input store or its entries', () => {
    const store = threeEntryStore()
    const next = markRead(store, '*')

    expect(next).not.toBe(store)
    expect(store.entries.every((e) => e.read === false)).toBe(true)
  })

  it('ignores unknown or non-matching refs without throwing', () => {
    expect(markRead(threeEntryStore(), {}).entries.every((e) => !e.read)).toBe(true)
    expect(markRead(threeEntryStore(), { entryId: 'missing' }).entries.every((e) => !e.read)).toBe(
      true
    )
    expect(() => markRead(threeEntryStore(), null)).not.toThrow()
  })
})

describe('pruneSnapshots', () => {
  const OLD = NOW - 31 * DAY_MS
  const RECENT = NOW - DAY_MS

  it('drops only snapshots that are absent from the poll AND terminal AND older than 30 days', () => {
    const store = {
      ...defaultStore(),
      snapshots: {
        1: makeSnapshot({ id: '1', state: 'resolved-lost', snappedAt: OLD }),
        2: makeSnapshot({ id: '2', state: 'cancelled', snappedAt: OLD }),
        3: makeSnapshot({ id: '3', state: 'draw', snappedAt: RECENT }),
        4: makeSnapshot({ id: '4', state: 'active', snappedAt: OLD }),
        5: makeSnapshot({ id: '5', state: 'resolvable', snappedAt: OLD }),
      },
    }

    // Wager 2 is still returned by the poll; 1, 3, 4, 5 are not.
    const next = pruneSnapshots(store, ['2'], NOW)

    expect(Object.keys(next.snapshots).sort()).toEqual(['2', '3', '4', '5'])
  })

  it('keeps a terminal absent snapshot exactly 30 days old (strictly older required)', () => {
    const store = {
      ...defaultStore(),
      snapshots: {
        9: makeSnapshot({ id: '9', state: 'refunded', snappedAt: NOW - 30 * DAY_MS }),
      },
    }
    expect(pruneSnapshots(store, [], NOW).snapshots).toHaveProperty('9')
  })

  it('treats all six terminal states as prunable', () => {
    const terminal = [
      'resolved-claimable',
      'resolved-won-paid',
      'resolved-lost',
      'draw',
      'cancelled',
      'refunded',
    ]
    const snapshots = {}
    terminal.forEach((state, i) => {
      snapshots[String(i)] = makeSnapshot({ id: String(i), state, snappedAt: OLD })
    })

    const next = pruneSnapshots({ ...defaultStore(), snapshots }, [], NOW)
    expect(Object.keys(next.snapshots)).toEqual([])
  })

  it('returns a new store and leaves the input untouched', () => {
    const store = {
      ...defaultStore(),
      snapshots: {
        1: makeSnapshot({ id: '1', state: 'resolved-lost', snappedAt: OLD }),
      },
    }
    const next = pruneSnapshots(store, [], NOW)

    expect(next).not.toBe(store)
    expect(next.snapshots).not.toBe(store.snapshots)
    expect(store.snapshots).toHaveProperty('1')
  })
})
