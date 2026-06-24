/**
 * Migration tests (spec 031) — a legacy spec-012 wager store is lifted into the generalized platform store on
 * first load, preserving read-state, with no data loss; idempotent thereafter.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { loadStore, defaultStore, migrateLegacyWagerStore, getSourceSlice } from '../data/notifications/activityStore'

const ACCOUNT = '0xAbCdEF1234567890abcdef1234567890ABCDef12'
const CHAIN = 137
const NOW = 1765432100000

const legacyKey = `fw_user_${ACCOUNT.toLowerCase()}_wager_activity_v1_${CHAIN}`
const platformKey = `fw_user_${ACCOUNT.toLowerCase()}_platform_activity_v1_${CHAIN}`

function legacyStore() {
  return {
    version: 1,
    lastPolledAt: NOW,
    snapshots: { 42: { state: 'active', snappedAt: NOW } },
    entries: [
      { id: '42:state-changed', type: 'state-changed', wagerId: '42', message: 'Accepted', severity: 'info', actionable: false, createdAt: NOW, read: true },
      { id: '7:won', type: 'won-claimable', wagerId: '7', message: 'You won', severity: 'success', actionable: true, createdAt: NOW - 1000, read: false },
    ],
    deadlineWarnings: { 7: { resolution: NOW } },
    drawScanBlock: 9999,
  }
}

describe('legacy wager store migration (spec 031)', () => {
  beforeEach(() => localStorage.clear())

  it('migrateLegacyWagerStore stamps domain/refId, partitions snapshots/aux, preserves read-state', () => {
    const m = migrateLegacyWagerStore(legacyStore())
    expect(m.version).toBe(1)
    expect(m.lastPolledAt).toBe(NOW)
    expect(m.entries).toHaveLength(2)
    expect(m.entries[0]).toMatchObject({ domain: 'wagers', refId: '42', read: true })
    expect(m.entries[1]).toMatchObject({ domain: 'wagers', refId: '7', read: false })
    expect(getSourceSlice(m, 'wagers').snapshots).toEqual({ 42: { state: 'active', snappedAt: NOW } })
    expect(getSourceSlice(m, 'wagers').aux).toEqual({ 7: { resolution: NOW } })
    expect('drawScanBlock' in m).toBe(false) // dropped
  })

  it('loadStore migrates a legacy store on first load and persists under the new key', () => {
    localStorage.setItem(legacyKey, JSON.stringify(legacyStore()))
    expect(localStorage.getItem(platformKey)).toBeNull()
    const loaded = loadStore(ACCOUNT, CHAIN)
    expect(loaded.entries).toHaveLength(2)
    expect(getSourceSlice(loaded, 'wagers').snapshots[42]).toBeTruthy()
    // persisted under the platform key now
    expect(localStorage.getItem(platformKey)).not.toBeNull()
  })

  it('is idempotent — once migrated, the platform key wins and legacy is not re-applied', () => {
    localStorage.setItem(legacyKey, JSON.stringify(legacyStore()))
    loadStore(ACCOUNT, CHAIN) // first load migrates
    // mutate the platform store; a second load must read it, not re-migrate the legacy
    const platform = JSON.parse(localStorage.getItem(platformKey))
    platform.entries = []
    localStorage.setItem(platformKey, JSON.stringify(platform))
    expect(loadStore(ACCOUNT, CHAIN).entries).toEqual([])
  })

  it('falls back to default when the legacy store is malformed', () => {
    localStorage.setItem(legacyKey, JSON.stringify({ garbage: true }))
    expect(loadStore(ACCOUNT, CHAIN)).toEqual(defaultStore())
  })
})
