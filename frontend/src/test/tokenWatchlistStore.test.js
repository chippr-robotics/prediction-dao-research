import { describe, it, expect, beforeEach } from 'vitest'
import {
  createEmptyWatchlist,
  entryKey,
  addEntry,
  removeEntry,
  mergeWatchlists,
  loadWatchlist,
  saveWatchlist,
} from '../lib/tokens/tokenWatchlistStore'

// Spec 034 — pure watchlist store: identity is (address, chainId); dedupe (FR-010),
// distinct-per-network (FR-007), removal (FR-009), invalid rejection (FR-011), and an
// idempotent union merge with no conflicts (FR-015).

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const ACCT = '0x9999999999999999999999999999999999999999'
const mk = (address, chainId, extra = {}) => ({
  address,
  chainId,
  source: 'registry',
  symbol: 'TKN',
  name: 'Token',
  decimals: 18,
  addedAt: 1,
  ...extra,
})

beforeEach(() => localStorage.clear())

describe('tokenWatchlistStore', () => {
  it('entryKey lowercases address and numifies chainId', () => {
    expect(entryKey('0xABCDEF', '137')).toBe('0xabcdef:137')
  })

  it('addEntry dedupes by (address, chainId) regardless of case (FR-010)', () => {
    // A checksummed (mixed-case) address and its lowercase form are both valid and
    // must collapse to one entry (identity lowercases the address).
    const C = '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a'
    let l = createEmptyWatchlist()
    l = addEntry(l, mk(C, 137))
    l = addEntry(l, mk(C.toLowerCase(), 137))
    expect(l.entries).toHaveLength(1)
  })

  it('keeps the same address on different chains as distinct entries (FR-007)', () => {
    let l = createEmptyWatchlist()
    l = addEntry(l, mk(A, 137))
    l = addEntry(l, mk(A, 63))
    expect(l.entries).toHaveLength(2)
  })

  it('removeEntry removes by identity (FR-009)', () => {
    let l = addEntry(createEmptyWatchlist(), mk(A, 137))
    l = removeEntry(l, A, 137)
    expect(l.entries).toHaveLength(0)
  })

  it('addEntry throws on an invalid address (FR-011)', () => {
    expect(() => addEntry(createEmptyWatchlist(), mk('not-an-address', 137))).toThrow()
  })

  it('mergeWatchlists unions, keeps earliest addedAt, returns no conflicts (FR-015)', () => {
    const cur = addEntry(createEmptyWatchlist(), mk(A, 137, { addedAt: 100 }))
    const inc = { schemaVersion: 1, entries: [mk(A, 137, { addedAt: 50 }), mk(B, 137, { addedAt: 200 })], updatedAt: 1 }
    const { value, conflicts } = mergeWatchlists(cur, inc)
    expect(conflicts).toEqual([])
    expect(value.entries).toHaveLength(2)
    expect(value.entries.find((e) => e.address === A.toLowerCase()).addedAt).toBe(50)
  })

  it('load/save round-trips and lowercases the address', () => {
    saveWatchlist(ACCT, addEntry(createEmptyWatchlist(), mk(A, 137)))
    const loaded = loadWatchlist(ACCT)
    expect(loaded.entries).toHaveLength(1)
    expect(loaded.entries[0].address).toBe(A.toLowerCase())
  })

  it('loadWatchlist drops entries missing a numeric chainId (network-tag)', () => {
    saveWatchlist(ACCT, {
      schemaVersion: 1,
      entries: [{ address: A, source: 'custom', symbol: 'X', decimals: 18 }],
      updatedAt: 1,
    })
    expect(loadWatchlist(ACCT).entries).toHaveLength(0)
  })
})
