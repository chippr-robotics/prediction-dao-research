/**
 * Unit tests for the generalized platform activity store (spec 031; generalizes spec 012).
 *
 * Contract: specs/031-platform-notifications/contracts/store-schema.md
 *   - key fw_user_<lowercased address>_platform_activity_v1_<chainId>
 *   - version-1 partitioned shape { version, lastPolledAt, entries, sources }, reset on corrupt/old shape
 *   - appendEntries: global id-dedup (existing wins) + cap 100, newest-first
 *   - markRead ref forms: '*' | {entryId} | {refId}
 *   - setSourceSlice/getSourceSlice partition by source key
 *   - pruneSnapshotMap: drop only absent + terminal + older than 30 days
 *   - cross-account + cross-chain isolation
 *
 * jsdom localStorage is real — cleared in beforeEach. Pure apart from loadStore/saveStore; time is nowMs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  defaultStore,
  loadStore,
  saveStore,
  appendEntries,
  markRead,
  setSourceSlice,
  getSourceSlice,
  pruneSnapshotMap,
  SNAPSHOT_RETENTION_MS,
} from '../data/notifications/activityStore'

const ACCOUNT_A = '0xAbCdEF1234567890abcdef1234567890ABCDef12'
const ACCOUNT_B = '0xB0B0000000000000000000000000000000000b0b'
const POLYGON = 137
const AMOY = 80002
const NOW = 1765432100000

function fullKey(account, chainId) {
  return `fw_user_${account.toLowerCase()}_platform_activity_v1_${chainId}`
}

function makeEntry(overrides = {}) {
  return {
    id: 'wagers:42:won-claimable',
    domain: 'wagers',
    refId: '42',
    type: 'won-claimable',
    message: "You won! Claim 50 USDC",
    severity: 'success',
    actionable: true,
    createdAt: NOW,
    read: false,
    ...overrides,
  }
}

function makeEntries(count, { prefix = 'e' } = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeEntry({ id: `${prefix}${i}`, refId: `${prefix}${i}`, createdAt: NOW - i * 1000 })
  )
}

describe('activityStore (generalized, spec 031)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('defaultStore is a fresh empty v1 partitioned store', () => {
    const a = defaultStore()
    expect(a).toEqual({ version: 1, lastPolledAt: 0, entries: [], sources: {} })
    expect(defaultStore()).not.toBe(a) // new object each call
  })

  it('loadStore returns default without touching storage when no account', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem')
    expect(loadStore(null, POLYGON)).toEqual(defaultStore())
    expect(spy).not.toHaveBeenCalled()
  })

  it('round-trips through save/load under the platform key', () => {
    let s = defaultStore()
    s = appendEntries(s, [makeEntry()])
    s = setSourceSlice(s, 'wagers', { snapshots: { 42: { state: 'active' } }, aux: {} })
    saveStore(ACCOUNT_A, POLYGON, s)
    expect(localStorage.getItem(fullKey(ACCOUNT_A, POLYGON))).not.toBeNull()
    const loaded = loadStore(ACCOUNT_A, POLYGON)
    expect(loaded.entries).toHaveLength(1)
    expect(getSourceSlice(loaded, 'wagers').snapshots).toEqual({ 42: { state: 'active' } })
  })

  it('resets to default + warns on a corrupt/old-shape stored value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(fullKey(ACCOUNT_A, POLYGON), JSON.stringify({ version: 1, snapshots: {}, entries: [], deadlineWarnings: {} }))
    expect(loadStore(ACCOUNT_A, POLYGON)).toEqual(defaultStore()) // legacy-wager shape is NOT a valid platform store
    expect(warn).toHaveBeenCalled()
  })

  it('appendEntries dedups by id globally (existing wins) and caps at 100', () => {
    let s = defaultStore()
    s = appendEntries(s, [makeEntry({ id: 'x', read: true })])
    s = appendEntries(s, [makeEntry({ id: 'x', read: false }), makeEntry({ id: 'y' })])
    expect(s.entries.map((e) => e.id)).toEqual(['y', 'x']) // y prepended; x kept (read:true preserved)
    expect(s.entries.find((e) => e.id === 'x').read).toBe(true)

    let big = defaultStore()
    big = appendEntries(big, makeEntries(120))
    expect(big.entries).toHaveLength(100)
  })

  it('markRead supports *, {entryId}, {refId}', () => {
    let s = defaultStore()
    s = appendEntries(s, [makeEntry({ id: 'a', refId: '1' }), makeEntry({ id: 'b', refId: '1' }), makeEntry({ id: 'c', refId: '2' })])
    const byEntry = markRead(s, { entryId: 'a' })
    expect(byEntry.entries.filter((e) => e.read).map((e) => e.id)).toEqual(['a'])
    const byRef = markRead(s, { refId: '1' })
    expect(byRef.entries.filter((e) => e.read).map((e) => e.id).sort()).toEqual(['a', 'b'])
    const all = markRead(s, '*')
    expect(all.entries.every((e) => e.read)).toBe(true)
    expect(markRead(s, { nope: 1 }).entries.some((e) => e.read)).toBe(false) // unknown ref matches nothing
  })

  it('isolates by account and by chain', () => {
    saveStore(ACCOUNT_A, POLYGON, appendEntries(defaultStore(), [makeEntry({ id: 'A' })]))
    saveStore(ACCOUNT_B, POLYGON, appendEntries(defaultStore(), [makeEntry({ id: 'B' })]))
    saveStore(ACCOUNT_A, AMOY, appendEntries(defaultStore(), [makeEntry({ id: 'amoy' })]))
    expect(loadStore(ACCOUNT_A, POLYGON).entries.map((e) => e.id)).toEqual(['A'])
    expect(loadStore(ACCOUNT_B, POLYGON).entries.map((e) => e.id)).toEqual(['B'])
    expect(loadStore(ACCOUNT_A, AMOY).entries.map((e) => e.id)).toEqual(['amoy'])
  })

  it('pruneSnapshotMap drops only absent + terminal + older-than-30d snapshots', () => {
    const isTerminal = (s) => s.terminal === true
    const old = NOW - SNAPSHOT_RETENTION_MS - 1
    const snaps = {
      keep_present: { terminal: true, snappedAt: old }, // present this cycle → keep
      keep_recent: { terminal: true, snappedAt: NOW }, // not old → keep
      keep_nonterminal: { terminal: false, snappedAt: old }, // not terminal → keep
      drop_me: { terminal: true, snappedAt: old }, // absent + terminal + old → drop
    }
    const out = pruneSnapshotMap(snaps, ['keep_present'], NOW, isTerminal)
    expect(Object.keys(out).sort()).toEqual(['keep_nonterminal', 'keep_present', 'keep_recent'])
  })
})
