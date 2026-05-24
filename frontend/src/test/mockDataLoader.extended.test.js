/**
 * Extended tests for mockDataLoader — targeting 95% coverage.
 * Covers processRelativeTime edge cases, extreme day values, non-string inputs.
 */
import { describe, it, expect, vi } from 'vitest'

// Re-mock with additional edge cases
vi.mock('../mock-data.json', () => ({
  default: {
    markets: [
      {
        id: 1,
        category: 'Crypto',
        title: 'Test',
        endTime: 'RELATIVE:45d',
        correlationGroupId: 'g1',
        correlationGroupName: 'Group 1',
      },
      {
        id: 2,
        category: 'Sports',
        title: 'Test 2',
        endTime: 'RELATIVE:-2d',
      },
      {
        id: 3,
        category: 'Crypto',
        title: 'Test 3',
        endTime: 'RELATIVE:invalid',
      },
      {
        id: 4,
        category: 'Crypto',
        title: 'Test 4',
        endTime: 'RELATIVE:800d',
      },
      {
        id: 5,
        category: 'Crypto',
        title: 'Test 5',
        endTime: 12345,
      },
      {
        id: 6,
        category: 'Politics',
        title: 'Test 6',
        endTime: null,
      },
    ],
    proposals: [],
    positions: [],
    welfareMetrics: [],
  },
}))

import {
  getMockMarkets,
  getMockMarketsByCategory,
  getMockMarketById,
  getMockProposals,
  getMockPositions,
  getMockWelfareMetrics,
  getMockCategories,
  getMockMarketsByCorrelationGroup,
} from '../utils/mockDataLoader'

describe('mockDataLoader: processRelativeTime edge cases', () => {
  it('RELATIVE: with invalid format returns original string', () => {
    const markets = getMockMarkets()
    const m3 = markets.find(m => m.id === 3)
    // 'RELATIVE:invalid' does not match /RELATIVE:(-?\d+)d/ so returns as-is
    expect(m3.endTime).toBe('RELATIVE:invalid')
  })

  it('RELATIVE: with extreme days (>730) gets clamped', () => {
    const markets = getMockMarkets()
    const m4 = markets.find(m => m.id === 4)
    // 800d > 730, should be clamped and converted to ISO
    expect(m4.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('non-string endTime is preserved as-is', () => {
    const markets = getMockMarkets()
    const m5 = markets.find(m => m.id === 5)
    expect(m5.endTime).toBe(12345)
  })

  it('null endTime is preserved as-is', () => {
    const markets = getMockMarkets()
    const m6 = markets.find(m => m.id === 6)
    expect(m6.endTime).toBeNull()
  })
})

describe('mockDataLoader: empty data fallbacks', () => {
  it('getMockProposals returns empty array when none exist', () => {
    expect(getMockProposals()).toEqual([])
  })

  it('getMockPositions returns empty array when none exist', () => {
    expect(getMockPositions()).toEqual([])
  })

  it('getMockWelfareMetrics returns empty array when none exist', () => {
    expect(getMockWelfareMetrics()).toEqual([])
  })
})

describe('mockDataLoader: category and correlation functions', () => {
  it('getMockCategories returns sorted unique categories', () => {
    const categories = getMockCategories()
    expect(categories).toEqual(['Crypto', 'Politics', 'Sports'])
  })

  it('getMockMarketsByCategory returns correct filtered results', () => {
    expect(getMockMarketsByCategory('Crypto')).toHaveLength(4)
    expect(getMockMarketsByCategory('Sports')).toHaveLength(1)
    expect(getMockMarketsByCategory('NonExistent')).toHaveLength(0)
  })

  it('getMockMarketById returns market or null', () => {
    expect(getMockMarketById(1)).toBeDefined()
    expect(getMockMarketById(1).id).toBe(1)
    expect(getMockMarketById(9999)).toBeNull()
  })

  it('getMockMarketsByCorrelationGroup returns correct markets', () => {
    const group = getMockMarketsByCorrelationGroup('g1')
    expect(group).toHaveLength(1)
    expect(group[0].id).toBe(1)
  })

  it('getMockMarketsByCorrelationGroup returns empty for unknown group', () => {
    expect(getMockMarketsByCorrelationGroup('nonexistent')).toHaveLength(0)
  })
})

describe('mockDataLoader: transformCorrelationData', () => {
  it('adds nested correlationGroup for market with flat data', () => {
    const markets = getMockMarkets()
    const m1 = markets.find(m => m.id === 1)
    expect(m1.correlationGroup).toBeDefined()
    expect(m1.correlationGroup.groupId).toBe('g1')
    expect(m1.correlationGroup.groupName).toBe('Group 1')
  })

  it('does not add correlationGroup for market without correlationGroupId', () => {
    const markets = getMockMarkets()
    const m2 = markets.find(m => m.id === 2)
    expect(m2.correlationGroup).toBeUndefined()
  })
})
