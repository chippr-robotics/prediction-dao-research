import { describe, it, expect, vi } from 'vitest'
import {
  getMockMarkets,
  getMockMarketsByCategory,
  getMockMarketById,
  getMockProposals,
  getMockPositions,
  getMockWelfareMetrics,
  getMockCategories,
  getMockMarketsByCorrelationGroup
} from '../utils/mockDataLoader'

// Mock the mock-data.json import
vi.mock('../mock-data.json', () => ({
  default: {
    markets: [
      {
        id: 1,
        category: 'Politics',
        title: 'Test Market 1',
        endTime: 'RELATIVE:45d',
        correlationGroupId: 'group1'
      },
      {
        id: 2,
        category: 'Sports',
        title: 'Test Market 2',
        endTime: 'RELATIVE:-2d',
        correlationGroupId: 'group1'
      },
      {
        id: 3,
        category: 'Politics',
        title: 'Test Market 3',
        endTime: '2024-12-31T00:00:00Z',
        correlationGroupId: 'group2'
      }
    ],
    proposals: [
      { id: 1, title: 'Proposal 1' },
      { id: 2, title: 'Proposal 2' }
    ],
    positions: [
      { id: 1, marketId: 1, shares: 100 },
      { id: 2, marketId: 2, shares: 200 }
    ],
    welfareMetrics: [
      { metric: 'totalUsers', value: 1000 },
      { metric: 'activeUsers', value: 500 }
    ]
  }
}))

describe('mockDataLoader', () => {
  describe('getMockMarkets', () => {
    it('should return all mock markets', () => {
      const markets = getMockMarkets()
      expect(markets).toHaveLength(3)
      expect(markets[0]).toHaveProperty('id', 1)
      expect(markets[1]).toHaveProperty('id', 2)
      expect(markets[2]).toHaveProperty('id', 3)
    })

    it('should process relative time strings in markets', () => {
      const markets = getMockMarkets()
      // The RELATIVE: times should be converted to ISO strings
      expect(markets[0].endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(markets[1].endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(markets[2].endTime).toBe('2024-12-31T00:00:00Z')
    })
  })

  describe('getMockMarketsByCategory', () => {
    it('should return markets filtered by category', () => {
      const politicsMarkets = getMockMarketsByCategory('Politics')
      expect(politicsMarkets).toHaveLength(2)
      expect(politicsMarkets.every(m => m.category === 'Politics')).toBe(true)

      const sportsMarkets = getMockMarketsByCategory('Sports')
      expect(sportsMarkets).toHaveLength(1)
      expect(sportsMarkets[0].category).toBe('Sports')
    })

    it('should return empty array for non-existent category', () => {
      const markets = getMockMarketsByCategory('NonExistent')
      expect(markets).toHaveLength(0)
    })
  })

  describe('getMockMarketById', () => {
    it('should return market by id', () => {
      const market = getMockMarketById(1)
      expect(market).toBeDefined()
      expect(market.id).toBe(1)
      expect(market.title).toBe('Test Market 1')
    })

    it('should return null for non-existent id', () => {
      const market = getMockMarketById(999)
      expect(market).toBeNull()
    })
  })

  describe('getMockProposals', () => {
    it('should return all mock proposals', () => {
      const proposals = getMockProposals()
      expect(proposals).toHaveLength(2)
      expect(proposals[0]).toHaveProperty('id', 1)
      expect(proposals[1]).toHaveProperty('id', 2)
    })
  })

  describe('getMockPositions', () => {
    it('should return all mock positions', () => {
      const positions = getMockPositions()
      expect(positions).toHaveLength(2)
      expect(positions[0]).toHaveProperty('marketId', 1)
      expect(positions[1]).toHaveProperty('marketId', 2)
    })
  })

  describe('getMockWelfareMetrics', () => {
    it('should return all mock welfare metrics', () => {
      const metrics = getMockWelfareMetrics()
      expect(metrics).toHaveLength(2)
      expect(metrics[0]).toHaveProperty('metric', 'totalUsers')
      expect(metrics[1]).toHaveProperty('metric', 'activeUsers')
    })
  })

  describe('getMockCategories', () => {
    it('should return unique categories sorted', () => {
      const categories = getMockCategories()
      expect(categories).toEqual(['Politics', 'Sports'])
    })

    it('should handle duplicate categories', () => {
      const categories = getMockCategories()
      expect(categories).toHaveLength(2) // Only unique categories
    })
  })

  describe('getMockMarketsByCorrelationGroup', () => {
    it('should return markets by correlation group', () => {
      const group1Markets = getMockMarketsByCorrelationGroup('group1')
      expect(group1Markets).toHaveLength(2)
      expect(group1Markets.every(m => m.correlationGroupId === 'group1')).toBe(true)
    })

    it('should return empty array for non-existent correlation group', () => {
      const markets = getMockMarketsByCorrelationGroup('nonexistent')
      expect(markets).toHaveLength(0)
    })
  })

  describe('relative time processing', () => {
    it('should handle positive relative days', () => {
      const markets = getMockMarkets()
      const market1 = markets.find(m => m.id === 1)
      
      // Check that the date is in the future
      const endDate = new Date(market1.endTime)
      const now = new Date()
      expect(endDate.getTime()).toBeGreaterThan(now.getTime())
    })

    it('should handle negative relative days', () => {
      const markets = getMockMarkets()
      const market2 = markets.find(m => m.id === 2)
      
      // Check that the date is in the past
      const endDate = new Date(market2.endTime)
      const now = new Date()
      expect(endDate.getTime()).toBeLessThan(now.getTime())
    })

    it('should preserve non-relative time strings', () => {
      const markets = getMockMarkets()
      const market3 = markets.find(m => m.id === 3)
      expect(market3.endTime).toBe('2024-12-31T00:00:00Z')
    })
  })
})
