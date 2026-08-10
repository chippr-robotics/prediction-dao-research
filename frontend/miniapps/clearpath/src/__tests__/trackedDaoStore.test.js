/**
 * Spec 042 tracked-DAO store, on the mini-app host store (spec 073 T028).
 *
 * The behaviour tests are the originals, re-pointed at the new signature: the store takes the
 * host's namespaced store instead of owning a raw `localStorage` key, and the account scoping that
 * used to live in that key is now the namespace's job.
 *
 * The MIGRATION tests are new, and they are the ones that matter. Members already have DAOs in
 * `clearpath.tracked.v1.<chainId>.<account>` keys written by the host-native version, and a
 * conversion that silently dropped them would be the worst outcome of this task — the data is
 * device-local, so there is nowhere to recover it from.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import * as store from '../trackedDaoStore'

const A = '0xAAAA000000000000000000000000000000000001'
const B = '0xBBBB000000000000000000000000000000000002'
const acct = '0xMember0000000000000000000000000000000009'

/** A stand-in for the namespaced host store, with the same never-throws contract. */
function makeStore(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get: (key, fallback = null) => (data.has(key) ? data.get(key) : fallback),
    set: (key, value) => { data.set(key, value); return true },
    subscribe: () => () => {},
  }
}

let s

beforeEach(() => {
  window.localStorage.clear()
  s = makeStore()
})

describe('trackedDaoStore (spec 042)', () => {
  it('adds and lists a tracked DAO, newest first', () => {
    store.add(s, acct, 1, { address: A, framework: 0, label: 'ENS' })
    store.add(s, acct, 1, { address: B, framework: 1, label: 'Uniswap' })
    const list = store.list(s, acct, 1)
    expect(list).toHaveLength(2)
    expect(list[0].address).toBe(B) // newest first
    expect(list.map((e) => e.label)).toContain('ENS')
  })

  it('rejects a duplicate (case-insensitive) with reason "exists" — no phantom row', () => {
    store.add(s, acct, 1, { address: A, framework: 0, label: 'ENS' })
    const res = store.add(s, acct, 1, { address: A.toLowerCase(), framework: 0, label: 'dup' })
    expect(res.added).toBe(false)
    expect(res.reason).toBe('exists')
    expect(store.list(s, acct, 1)).toHaveLength(1)
  })

  it('has() is case-insensitive', () => {
    store.add(s, acct, 1, { address: A, framework: 0 })
    expect(store.has(s, acct, 1, A.toLowerCase())).toBe(true)
    expect(store.has(s, acct, 1, B)).toBe(false)
  })

  it('removes a tracked DAO', () => {
    store.add(s, acct, 1, { address: A })
    expect(store.remove(s, acct, 1, A).removed).toBe(true)
    expect(store.list(s, acct, 1)).toHaveLength(0)
    expect(store.remove(s, acct, 1, A).removed).toBe(false)
  })

  it('keeps networks strictly separate', () => {
    store.add(s, acct, 1, { address: A, label: 'mainnet' })
    expect(store.list(s, acct, 137)).toHaveLength(0)
    expect(store.list(s, acct, 1)).toHaveLength(1)
  })

  it('keeps accounts separate — because the NAMESPACE does', () => {
    // Account scoping moved OUT of this module: the host store is already per-account, so two
    // accounts are two different stores rather than two key suffixes. Pinned because the guarantee
    // did not disappear, it relocated.
    store.add(s, acct, 1, { address: A })
    expect(store.list(makeStore(), '0xother', 1)).toHaveLength(0)
  })

  it('reports a failed write rather than claiming the DAO was tracked', () => {
    const failing = { ...makeStore(), set: () => false }
    expect(store.add(failing, acct, 1, { address: A }).added).toBe(false)
  })
})

describe('legacy migration (T028)', () => {
  const legacyKey = (chainId) => `clearpath.tracked.v1.${chainId}.${acct.toLowerCase()}`

  it('imports DAOs the host-native version wrote, across every chain', () => {
    window.localStorage.setItem(legacyKey(1), JSON.stringify([{ address: A, label: 'ENS', addedAt: 10 }]))
    window.localStorage.setItem(legacyKey(63), JSON.stringify([{ address: B, label: 'Mordor DAO', addedAt: 20 }]))

    expect(store.list(s, acct, 1).map((e) => e.address)).toEqual([A])
    expect(store.list(s, acct, 63).map((e) => e.address)).toEqual([B])
  })

  it('does NOT delete the legacy keys', () => {
    // The host store's write is best-effort (quota, private mode), so deleting first could lose a
    // member's list to a failure this module cannot even observe.
    window.localStorage.setItem(legacyKey(1), JSON.stringify([{ address: A }]))
    store.list(s, acct, 1)
    expect(window.localStorage.getItem(legacyKey(1))).not.toBeNull()
  })

  it('runs ONCE — an untracked DAO does not reappear on the next read', () => {
    window.localStorage.setItem(legacyKey(1), JSON.stringify([{ address: A, addedAt: 10 }]))
    store.list(s, acct, 1)
    store.remove(s, acct, 1, A)
    expect(store.list(s, acct, 1)).toHaveLength(0)
  })

  it('never duplicates a DAO the member already has', () => {
    s.set('tracked', { 1: [{ address: A, label: 'already here', addedAt: 5 }] })
    window.localStorage.setItem(legacyKey(1), JSON.stringify([{ address: A.toLowerCase(), addedAt: 10 }]))
    expect(store.list(s, acct, 1)).toHaveLength(1)
  })

  it("ignores another account's legacy keys", () => {
    window.localStorage.setItem(
      'clearpath.tracked.v1.1.0xsomeoneelse00000000000000000000000000',
      JSON.stringify([{ address: B }]),
    )
    expect(store.list(s, acct, 1)).toHaveLength(0)
  })

  it('survives a corrupt legacy blob, importing the chains that are readable', () => {
    window.localStorage.setItem(legacyKey(1), 'not json{')
    window.localStorage.setItem(legacyKey(63), JSON.stringify([{ address: B }]))
    expect(store.list(s, acct, 1)).toHaveLength(0)
    expect(store.list(s, acct, 63)).toHaveLength(1)
  })

  it('marks itself done even with nothing to import, so the scan is not repeated', () => {
    store.list(s, acct, 1)
    expect(s.get('trackedMigratedAt', null)).toBeTruthy()
  })
})
