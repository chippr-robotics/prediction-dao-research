import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock EventsSource as fallback
vi.mock('../data/wagers/EventsSource', () => ({
  listPage: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
    totalKnown: 0,
    source: 'events',
  }),
  getById: vi.fn().mockResolvedValue(null),
}))

vi.mock('../data/wagers/cacheStore', () => ({
  upsertCache: vi.fn(),
}))

vi.mock('../constants/wagerDefaults', () => ({
  WagerSortKey: {
    CREATED: 'created',
    ENDS: 'ends',
    RESOLUTION_TYPE: 'resolutionType',
    STATUS: 'status',
  },
  TERMINAL_STATUSES: new Set(['resolved', 'cancelled', 'refunded']),
}))

describe('SubgraphSource', () => {
  let SubgraphSource
  let EventsSource

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset fetch mock
    global.fetch = vi.fn()

    SubgraphSource = await import('../data/wagers/SubgraphSource')
    EventsSource = await import('../data/wagers/EventsSource')
  })

  describe('syncIndex', () => {
    it('should return empty index (subgraph indexes server-side)', async () => {
      const result = await SubgraphSource.syncIndex('0x1234567890123456789012345678901234567890')
      expect(result).toEqual({ marketIds: [], lastBlock: 0 })
    })
  })

  describe('listPage', () => {
    it('should return empty result for null userAddress', async () => {
      const result = await SubgraphSource.listPage({ userAddress: null })
      expect(result).toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
        totalKnown: 0,
        source: 'subgraph',
      })
    })

    it('should fall back to EventsSource when SUBGRAPH_URL is not set', async () => {
      // VITE_SUBGRAPH_URL is empty by default in test env
      const result = await SubgraphSource.listPage({
        userAddress: '0x1234567890123456789012345678901234567890',
        pageSize: 10,
      })
      expect(EventsSource.listPage).toHaveBeenCalled()
      expect(result.source).toBe('subgraph-fallback')
    })
  })

  describe('getById', () => {
    it('should return null for missing id', async () => {
      const result = await SubgraphSource.getById(null, '0x1234567890123456789012345678901234567890')
      expect(result).toBeNull()
    })

    it('should return null for missing userAddress', async () => {
      const result = await SubgraphSource.getById('1', null)
      expect(result).toBeNull()
    })

    it('should fall back to EventsSource when SUBGRAPH_URL is not set', async () => {
      await SubgraphSource.getById('1', '0x1234567890123456789012345678901234567890')
      expect(EventsSource.getById).toHaveBeenCalledWith('1', '0x1234567890123456789012345678901234567890')
    })
  })
})
