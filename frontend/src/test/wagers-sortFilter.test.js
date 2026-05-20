import { describe, it, expect } from 'vitest'
import {
  applyOwnershipGate,
  applyExpiryGate,
  applyTabGate,
  applyResolutionTypeFilter,
  applyStatusFilter,
  applyFilters,
  applySort,
  applyCursor,
  computeSortKey,
  paginate,
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

describe('applyOwnershipGate', () => {
  it('drops wagers where the user is neither creator nor participant', () => {
    const wagers = [w({ id: '1' }), w({ id: '2', creator: OTHER, participants: [OTHER] })]
    const out = applyOwnershipGate(wagers, OWNER)
    expect(out.map(x => x.id)).toEqual(['1'])
  })

  it('returns empty when ownerAddress is missing', () => {
    expect(applyOwnershipGate([w()], null)).toEqual([])
  })

  it('matches case-insensitively', () => {
    const wagers = [w({ creator: OWNER.toUpperCase() })]
    expect(applyOwnershipGate(wagers, OWNER.toLowerCase())).toHaveLength(1)
  })
})

describe('applyExpiryGate', () => {
  it('drops terminal statuses by default', () => {
    const wagers = [
      w({ id: '1', status: 'active' }),
      w({ id: '2', status: 'resolved' }),
      w({ id: '3', status: 'cancelled' }),
      w({ id: '4', status: 'refunded' }),
      w({ id: '5', status: 'oracle_timed_out' }),
    ]
    expect(applyExpiryGate(wagers).map(x => x.id)).toEqual(['1'])
  })

  it('drops wagers whose endTime is past', () => {
    const past = w({ id: 'past', endTime: Date.now() - 1000 })
    const future = w({ id: 'future', endTime: Date.now() + 1000 })
    expect(applyExpiryGate([past, future]).map(x => x.id)).toEqual(['future'])
  })

  it('keeps pending_resolution and challenged regardless of endTime', () => {
    const pendingRes = w({ id: 'p', status: 'pending_resolution', endTime: 0 })
    const challenged = w({ id: 'c', status: 'challenged', endTime: 0 })
    expect(applyExpiryGate([pendingRes, challenged]).map(x => x.id)).toEqual(['p', 'c'])
  })

  it('includes everything when includeExpired=true', () => {
    const wagers = [w({ status: 'resolved' }), w({ status: 'active' })]
    expect(applyExpiryGate(wagers, { includeExpired: true })).toHaveLength(2)
  })
})

describe('applyTabGate', () => {
  it('participating: in participants, not creator, not terminal', () => {
    const wagers = [
      w({ id: '1', creator: OTHER, participants: [OWNER] }),
      w({ id: '2', creator: OWNER, participants: [OWNER] }),
      w({ id: '3', creator: OTHER, participants: [OWNER], status: 'resolved' }),
    ]
    const out = applyTabGate(wagers, { tab: 'participating', ownerAddress: OWNER })
    expect(out.map(x => x.id)).toEqual(['1'])
  })

  it('created: user is creator, not terminal', () => {
    const wagers = [
      w({ id: '1', creator: OWNER }),
      w({ id: '2', creator: OTHER }),
      w({ id: '3', creator: OWNER, status: 'resolved' }),
    ]
    const out = applyTabGate(wagers, { tab: 'created', ownerAddress: OWNER })
    expect(out.map(x => x.id)).toEqual(['1'])
  })

  it('history: only terminal statuses', () => {
    const wagers = [
      w({ id: '1', status: 'resolved' }),
      w({ id: '2', status: 'active' }),
      w({ id: '3', status: 'cancelled' }),
    ]
    const out = applyTabGate(wagers, { tab: 'history', ownerAddress: OWNER })
    expect(out.map(x => x.id).sort()).toEqual(['1', '3'])
  })
})

describe('applyResolutionTypeFilter and applyStatusFilter', () => {
  it('filters resolution types', () => {
    const wagers = [w({ id: '0', resolutionType: 0 }), w({ id: '3', resolutionType: 3 })]
    expect(applyResolutionTypeFilter(wagers, [3]).map(x => x.id)).toEqual(['3'])
  })

  it('passes through when filter is empty', () => {
    const wagers = [w({ id: '1' }), w({ id: '2' })]
    expect(applyStatusFilter(wagers, null)).toHaveLength(2)
    expect(applyStatusFilter(wagers, [])).toHaveLength(2)
  })
})

describe('applyFilters (full pipeline)', () => {
  it('applies ownership, tab and expiry together', () => {
    const wagers = [
      w({ id: 'mine-active', creator: OTHER, participants: [OWNER], status: 'active' }),
      w({ id: 'mine-resolved', creator: OTHER, participants: [OWNER], status: 'resolved' }),
      w({ id: 'theirs', creator: OTHER, participants: [OTHER], status: 'active' }),
    ]
    const out = applyFilters(wagers, {
      ownerAddress: OWNER,
      tab: 'participating',
      includeExpired: false,
    })
    expect(out.map(x => x.id)).toEqual(['mine-active'])
  })
})

describe('applySort + computeSortKey', () => {
  it('groups by resolution type respecting ResolutionTypeOrder', () => {
    const wagers = [
      w({ id: 'a', resolutionType: 3, createdAt: 100 }),
      w({ id: 'b', resolutionType: 0, createdAt: 100 }),
      w({ id: 'c', resolutionType: 1, createdAt: 100 }),
    ]
    const sorted = applySort(wagers, WagerSortKey.RESOLUTION_TYPE)
    expect(sorted.map(x => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('createdAt sort returns newest first', () => {
    const wagers = [w({ id: 'old', createdAt: 100 }), w({ id: 'new', createdAt: 200 })]
    const sorted = applySort(wagers, WagerSortKey.CREATED)
    expect(sorted.map(x => x.id)).toEqual(['new', 'old'])
  })

  it('produces stable sortKey strings', () => {
    const k1 = computeSortKey(w({ createdAt: 1000 }), WagerSortKey.CREATED)
    const k2 = computeSortKey(w({ createdAt: 1000 }), WagerSortKey.CREATED)
    expect(k1).toEqual(k2)
  })
})

describe('applyCursor + paginate', () => {
  it('cursor resumes after lastSortKey', () => {
    const wagers = [
      w({ id: 'a', createdAt: 300 }),
      w({ id: 'b', createdAt: 200 }),
      w({ id: 'c', createdAt: 100 }),
    ]
    const sorted = applySort(wagers, WagerSortKey.CREATED)
    const resumed = applyCursor(sorted, { lastSortKey: sorted[0].sortKey })
    expect(resumed.map(x => x.id)).toEqual(['b', 'c'])
  })

  it('paginate returns nextCursor when more pages remain', () => {
    const wagers = Array.from({ length: 5 }, (_, i) =>
      w({ id: String(i), createdAt: 1000 - i })
    )
    const page1 = paginate(wagers, { pageSize: 2, sortKey: WagerSortKey.CREATED })
    expect(page1.items.map(x => x.id)).toEqual(['0', '1'])
    expect(page1.hasMore).toBe(true)
    expect(page1.nextCursor).not.toBeNull()

    const page2 = paginate(wagers, {
      pageSize: 2,
      sortKey: WagerSortKey.CREATED,
      cursor: page1.nextCursor,
    })
    expect(page2.items.map(x => x.id)).toEqual(['2', '3'])
  })
})
