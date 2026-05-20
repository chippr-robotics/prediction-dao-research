import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadIndex,
  saveIndex,
  loadCache,
  upsertCache,
  __testing,
} from '../data/wagers/cacheStore'

const ADDR = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

beforeEach(() => {
  localStorage.clear()
})

describe('loadIndex / saveIndex', () => {
  it('returns empty index on first read', () => {
    const idx = loadIndex(ADDR)
    expect(idx).toEqual({ marketIds: [], lastBlock: 0, schemaVersion: __testing.SCHEMA_VERSION })
  })

  it('migrates from legacy friendMarketIndex_ keys', () => {
    const legacyKey = __testing.LEGACY_INDEX_PREFIX + ADDR.toLowerCase()
    localStorage.setItem(legacyKey, JSON.stringify({ marketIds: ['1', '2'], lastBlock: 42 }))
    const idx = loadIndex(ADDR)
    expect(idx.marketIds).toEqual(['1', '2'])
    expect(idx.lastBlock).toBe(42)
    expect(idx.schemaVersion).toBe(__testing.SCHEMA_VERSION)
  })

  it('persists the new schema after save', () => {
    saveIndex(ADDR, { marketIds: ['5'], lastBlock: 9 })
    const idx = loadIndex(ADDR)
    expect(idx).toMatchObject({ marketIds: ['5'], lastBlock: 9 })
  })
})

describe('loadCache / saveCache', () => {
  it('returns empty cache on first read', () => {
    expect(loadCache(ADDR)).toEqual({})
  })

  it('migrates legacy friendMarketCache_ entries and flags them for rehydration', () => {
    const legacyKey = __testing.LEGACY_CACHE_PREFIX + ADDR.toLowerCase()
    localStorage.setItem(
      legacyKey,
      JSON.stringify({ '1': { id: '1', description: 'X', status: 'active' } })
    )
    const cache = loadCache(ADDR)
    expect(cache['1']).toMatchObject({ id: '1', needsRehydration: true })
  })

  it('upsertCache merges and timestamps entries', () => {
    upsertCache(ADDR, [{ id: '1', status: 'active' }])
    const cache = loadCache(ADDR)
    expect(cache['1'].status).toBe('active')
    expect(typeof cache['1'].lastTouched).toBe('number')
  })
})

describe('byte-budget eviction', () => {
  it('evicts the oldest entries when over budget', () => {
    const big = 'x'.repeat(1024)
    const entries = {}
    for (let i = 0; i < 50; i++) {
      entries[i] = { id: String(i), description: big, lastTouched: i }
    }
    const evicted = __testing.evictLru(entries, 5_000)
    expect(__testing.estimateBytes(evicted)).toBeLessThanOrEqual(5_000)
    expect(Object.keys(evicted).length).toBeLessThan(50)
    const remainingTouched = Object.values(evicted).map(e => e.lastTouched)
    const minRemaining = Math.min(...remainingTouched)
    expect(minRemaining).toBeGreaterThan(0)
  })
})
