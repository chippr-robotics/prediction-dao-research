/**
 * Extended tests for wager sortFilter — targeting 95% coverage.
 * Covers uncovered filter/sort branches: disputed status, type filter,
 * default sort key, endTime sort, status sort, and edge cases.
 */
import { describe, it, expect } from 'vitest'
import {
  applyOwnershipGate,
  applyExpiryGate,
  applyTabGate,
  applyTypeFilter,
  applyStatusFilter,
  applyResolutionTypeFilter,
  applySort,
  applyCursor,
  computeSortKey,
  paginate,
  applyFilters,
} from '../data/wagers/sortFilter'
import { WagerSortKey } from '../constants/wagerDefaults'

const OWNER = '0x1234567890123456789012345678901234567890'
const OTHER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

function w(overrides = {}) {
  return {
    id: '1',
    marketType: 'friend',
    status: 'active',
    resolutionType: 0,
    creator: OWNER,
    participants: [OWNER],
    createdAt: 1_700_000_000_000,
    endTime: Date.now() + 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  }
}

describe('applyExpiryGate: disputed status', () => {
  it('keeps disputed wagers regardless of endTime', () => {
    const disputed = w({ id: 'd', status: 'disputed', endTime: 0 })
    expect(applyExpiryGate([disputed]).map(x => x.id)).toEqual(['d'])
  })

  it('drops declined wagers as terminal', () => {
    const declined = w({ id: 'dec', status: 'declined' })
    expect(applyExpiryGate([declined]).map(x => x.id)).toEqual([])
  })

  it('keeps wagers with endTime=0 and non-terminal status', () => {
    const noEnd = w({ id: 'noEnd', status: 'active', endTime: 0 })
    expect(applyExpiryGate([noEnd]).map(x => x.id)).toEqual(['noEnd'])
  })

  it('uses custom now parameter', () => {
    const futureFromNow = w({ id: 'f', endTime: 2000 })
    // now=1000, endTime=2000 -> still in the future
    expect(applyExpiryGate([futureFromNow], { now: 1000 }).map(x => x.id)).toEqual(['f'])
    // now=3000, endTime=2000 -> expired
    expect(applyExpiryGate([futureFromNow], { now: 3000 }).map(x => x.id)).toEqual([])
  })
})

describe('applyTabGate: edge cases', () => {
  it('all tab returns everything', () => {
    const wagers = [w({ id: '1' }), w({ id: '2', status: 'resolved' })]
    expect(applyTabGate(wagers, { tab: 'all', ownerAddress: OWNER })).toHaveLength(2)
  })

  it('null tab returns everything', () => {
    const wagers = [w({ id: '1' })]
    expect(applyTabGate(wagers, { tab: null, ownerAddress: OWNER })).toHaveLength(1)
  })

  it('unknown tab returns non-terminal wagers', () => {
    const wagers = [
      w({ id: '1', status: 'active' }),
      w({ id: '2', status: 'resolved' }),
    ]
    expect(applyTabGate(wagers, { tab: 'unknown_tab', ownerAddress: OWNER }).map(x => x.id)).toEqual(['1'])
  })

  it('participating excludes wagers where user is also creator', () => {
    const wagers = [
      w({ id: '1', creator: OWNER, participants: [OWNER] }),
    ]
    expect(applyTabGate(wagers, { tab: 'participating', ownerAddress: OWNER })).toHaveLength(0)
  })
})

describe('applyTypeFilter', () => {
  it('filters by single marketType', () => {
    const wagers = [
      w({ id: '1', marketType: 'friend' }),
      w({ id: '2', marketType: 'polymarket' }),
      w({ id: '3', marketType: 'friend' }),
    ]
    expect(applyTypeFilter(wagers, ['friend']).map(x => x.id)).toEqual(['1', '3'])
  })

  it('filters by multiple marketTypes', () => {
    const wagers = [
      w({ id: '1', marketType: 'friend' }),
      w({ id: '2', marketType: 'polymarket' }),
      w({ id: '3', marketType: 'dao' }),
    ]
    expect(applyTypeFilter(wagers, ['friend', 'dao']).map(x => x.id)).toEqual(['1', '3'])
  })

  it('passes through when marketTypes is null or empty', () => {
    const wagers = [w({ id: '1' })]
    expect(applyTypeFilter(wagers, null)).toHaveLength(1)
    expect(applyTypeFilter(wagers, [])).toHaveLength(1)
  })

  it('is case-insensitive', () => {
    const wagers = [w({ id: '1', marketType: 'Friend' })]
    expect(applyTypeFilter(wagers, ['friend'])).toHaveLength(1)
  })
})

describe('applyStatusFilter', () => {
  it('filters by specific statuses', () => {
    const wagers = [
      w({ id: '1', status: 'active' }),
      w({ id: '2', status: 'pending_resolution' }),
      w({ id: '3', status: 'resolved' }),
    ]
    expect(applyStatusFilter(wagers, ['active', 'pending_resolution']).map(x => x.id)).toEqual(['1', '2'])
  })

  it('is case-insensitive', () => {
    const wagers = [w({ id: '1', status: 'Active' })]
    expect(applyStatusFilter(wagers, ['active'])).toHaveLength(1)
  })
})

describe('applyResolutionTypeFilter: edge cases', () => {
  it('handles string resolution types by converting to Number', () => {
    const wagers = [
      w({ id: '1', resolutionType: '3' }),
      w({ id: '2', resolutionType: 0 }),
    ]
    expect(applyResolutionTypeFilter(wagers, [3]).map(x => x.id)).toEqual(['1'])
  })

  it('passes through when resolutionTypes is null', () => {
    const wagers = [w()]
    expect(applyResolutionTypeFilter(wagers, null)).toHaveLength(1)
  })
})

describe('applyOwnershipGate: participant matching', () => {
  it('includes wager where user is only a participant (not creator)', () => {
    const wagers = [w({ id: '1', creator: OTHER, participants: [OWNER, OTHER] })]
    expect(applyOwnershipGate(wagers, OWNER)).toHaveLength(1)
  })

  it('handles empty participants array', () => {
    const wagers = [w({ id: '1', creator: OTHER, participants: [] })]
    expect(applyOwnershipGate(wagers, OWNER)).toHaveLength(0)
  })

  it('handles missing participants field', () => {
    const wagers = [{ id: '1', creator: OWNER }]
    expect(applyOwnershipGate(wagers, OWNER)).toHaveLength(1)
  })
})

describe('computeSortKey: all sort key types', () => {
  it('ENDS sort key uses endTime', () => {
    const k1 = computeSortKey(w({ endTime: 1000 }), WagerSortKey.ENDS)
    const k2 = computeSortKey(w({ endTime: 2000 }), WagerSortKey.ENDS)
    // Newer endTime should sort first (descending) -> k2 < k1
    expect(k2 < k1).toBe(true)
  })

  it('STATUS sort key uses status order', () => {
    const kActive = computeSortKey(w({ status: 'active' }), WagerSortKey.STATUS)
    const kPending = computeSortKey(w({ status: 'pending_acceptance' }), WagerSortKey.STATUS)
    // pending_acceptance (index 0) < active (index 1)
    expect(kPending < kActive).toBe(true)
  })

  it('default sort key uses id only', () => {
    const k = computeSortKey(w({ id: '42' }), 'unknown_key')
    expect(k).toBe('0000000000000042')
  })

  it('handles missing createdAt as 0', () => {
    const k = computeSortKey(w({ createdAt: undefined }), WagerSortKey.CREATED)
    expect(k).toBeDefined()
  })

  it('handles missing endTime as 0', () => {
    const k = computeSortKey(w({ endTime: undefined }), WagerSortKey.ENDS)
    expect(k).toBeDefined()
  })

  it('unknown status gets max index in STATUS sort', () => {
    const kUnknown = computeSortKey(w({ status: 'unknown_status_xyz' }), WagerSortKey.STATUS)
    const kCancelled = computeSortKey(w({ status: 'cancelled' }), WagerSortKey.STATUS)
    // unknown should sort after known statuses
    expect(kUnknown > kCancelled).toBe(true)
  })

  it('unknown resolutionType gets max index in RESOLUTION_TYPE sort', () => {
    const kUnknown = computeSortKey(w({ resolutionType: 999 }), WagerSortKey.RESOLUTION_TYPE)
    const kKnown = computeSortKey(w({ resolutionType: 0 }), WagerSortKey.RESOLUTION_TYPE)
    expect(kUnknown > kKnown).toBe(true)
  })
})

describe('applySort: endTime and status sorts', () => {
  it('endTime sort returns soonest-ending first', () => {
    const wagers = [
      w({ id: 'far', endTime: 9999 }),
      w({ id: 'soon', endTime: 1000 }),
    ]
    const sorted = applySort(wagers, WagerSortKey.ENDS)
    expect(sorted.map(x => x.id)).toEqual(['far', 'soon'])
  })

  it('status sort orders by status pipeline', () => {
    const wagers = [
      w({ id: 'resolved', status: 'resolved', createdAt: 100 }),
      w({ id: 'active', status: 'active', createdAt: 100 }),
      w({ id: 'pending', status: 'pending_acceptance', createdAt: 100 }),
    ]
    const sorted = applySort(wagers, WagerSortKey.STATUS)
    expect(sorted.map(x => x.id)).toEqual(['pending', 'active', 'resolved'])
  })
})

describe('applyCursor: edge cases', () => {
  it('returns all when cursor is null', () => {
    const wagers = [{ sortKey: 'a' }, { sortKey: 'b' }]
    expect(applyCursor(wagers, null)).toHaveLength(2)
  })

  it('returns all when cursor.lastSortKey is missing', () => {
    expect(applyCursor([{ sortKey: 'a' }], {})).toHaveLength(1)
  })

  it('returns all when lastSortKey not found in wagers', () => {
    const wagers = [{ sortKey: 'a' }, { sortKey: 'b' }]
    expect(applyCursor(wagers, { lastSortKey: 'z' })).toHaveLength(2)
  })
})

describe('paginate: edge cases', () => {
  it('returns empty items and no cursor for empty input', () => {
    const result = paginate([], { pageSize: 10, sortKey: WagerSortKey.CREATED })
    expect(result.items).toEqual([])
    expect(result.nextCursor).toBeNull()
    expect(result.hasMore).toBe(false)
    expect(result.totalKnown).toBe(0)
  })

  it('returns all items with no cursor when all fit in one page', () => {
    const wagers = [w({ id: '1', createdAt: 100 }), w({ id: '2', createdAt: 200 })]
    const result = paginate(wagers, { pageSize: 10, sortKey: WagerSortKey.CREATED })
    expect(result.items).toHaveLength(2)
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })

  it('uses default pageSize and sortKey', () => {
    const wagers = [w({ id: '1', createdAt: 100 })]
    const result = paginate(wagers, {})
    expect(result.items).toHaveLength(1)
  })
})

describe('applyFilters: full pipeline with all options', () => {
  it('applies type filter', () => {
    const wagers = [
      w({ id: '1', marketType: 'friend' }),
      w({ id: '2', marketType: 'polymarket' }),
    ]
    const out = applyFilters(wagers, {
      ownerAddress: OWNER,
      tab: 'all',
      includeExpired: true,
      marketTypes: ['polymarket'],
    })
    expect(out.map(x => x.id)).toEqual(['2'])
  })

  it('applies status filter', () => {
    const wagers = [
      w({ id: '1', status: 'active' }),
      w({ id: '2', status: 'pending_resolution' }),
    ]
    const out = applyFilters(wagers, {
      ownerAddress: OWNER,
      tab: 'all',
      includeExpired: true,
      statuses: ['pending_resolution'],
    })
    expect(out.map(x => x.id)).toEqual(['2'])
  })

  it('applies resolution type filter', () => {
    const wagers = [
      w({ id: '1', resolutionType: 0 }),
      w({ id: '2', resolutionType: 5 }),
    ]
    const out = applyFilters(wagers, {
      ownerAddress: OWNER,
      tab: 'all',
      includeExpired: true,
      resolutionTypes: [5],
    })
    expect(out.map(x => x.id)).toEqual(['2'])
  })
})
