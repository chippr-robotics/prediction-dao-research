import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock sources
const mockListPage = vi.fn()
const mockGetById = vi.fn()
const mockSyncIndex = vi.fn()

vi.mock('../data/wagers/EventsSource', () => ({
  listPage: (...args) => mockListPage(...args),
  getById: (...args) => mockGetById(...args),
  syncIndex: (...args) => mockSyncIndex(...args),
}))

vi.mock('../data/wagers/SubgraphSource', () => ({
  listPage: (...args) => mockListPage(...args),
  getById: (...args) => mockGetById(...args),
  syncIndex: (...args) => mockSyncIndex(...args),
}))

vi.mock('../constants/wagerDefaults', () => ({
  WagerSortKey: {
    CREATED: 'created',
    ENDS: 'ends',
  },
}))

import { createWagerRepository, getDefaultWagerRepository } from '../data/wagers/WagerRepository'

describe('WagerRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListPage.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
      totalKnown: 0,
      source: 'subgraph',
    })
    mockGetById.mockResolvedValue(null)
    mockSyncIndex.mockResolvedValue({ marketIds: [], lastBlock: 0 })
  })

  describe('createWagerRepository', () => {
    it('should create a repository with default source (subgraph)', () => {
      const repo = createWagerRepository()
      expect(repo.sourceKey).toBe('subgraph')
    })

    it('should create a repository with explicit events source', () => {
      const repo = createWagerRepository({ source: 'events' })
      expect(repo.sourceKey).toBe('events')
    })

    it('should fall back to subgraph for unknown source', () => {
      const repo = createWagerRepository({ source: 'unknown' })
      expect(repo.sourceKey).toBe('subgraph')
    })
  })

  describe('listMyWagers', () => {
    it('should return empty result for null userAddress', async () => {
      const repo = createWagerRepository()
      const result = await repo.listMyWagers({ userAddress: null })
      expect(result).toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
        totalKnown: 0,
        source: 'subgraph',
      })
      expect(mockListPage).not.toHaveBeenCalled()
    })

    it('should call source.listPage with lowercased address', async () => {
      const repo = createWagerRepository()
      await repo.listMyWagers({
        userAddress: '0xABCD1234567890123456789012345678901234EF',
      })
      expect(mockListPage).toHaveBeenCalledWith(
        expect.objectContaining({
          userAddress: '0xabcd1234567890123456789012345678901234ef',
        })
      )
    })

    it('should pass through cursor, pageSize, sortKey, filter', async () => {
      const repo = createWagerRepository()
      const cursor = { lastSortKey: '123' }
      await repo.listMyWagers({
        userAddress: '0x1234567890123456789012345678901234567890',
        cursor,
        pageSize: 10,
        sortKey: 'ends',
        filter: { tab: 'created' },
      })
      expect(mockListPage).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor,
          pageSize: 10,
          sortKey: 'ends',
          filter: { tab: 'created' },
        })
      )
    })

    it('should use default values', async () => {
      const repo = createWagerRepository()
      await repo.listMyWagers({
        userAddress: '0x1234567890123456789012345678901234567890',
      })
      expect(mockListPage).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: null,
          pageSize: 25,
          sortKey: 'created',
          filter: {},
        })
      )
    })
  })

  describe('getWagerById', () => {
    it('should return null for missing id', async () => {
      const repo = createWagerRepository()
      const result = await repo.getWagerById(null, '0x1234567890123456789012345678901234567890')
      expect(result).toBeNull()
    })

    it('should return null for missing userAddress', async () => {
      const repo = createWagerRepository()
      const result = await repo.getWagerById('1', null)
      expect(result).toBeNull()
    })

    it('should call source.getById with lowercased address', async () => {
      const repo = createWagerRepository()
      await repo.getWagerById('42', '0xABCD1234567890123456789012345678901234EF')
      expect(mockGetById).toHaveBeenCalledWith(
        '42',
        '0xabcd1234567890123456789012345678901234ef'
      )
    })
  })

  describe('syncIndex', () => {
    it('should return empty for null userAddress', async () => {
      const repo = createWagerRepository()
      const result = await repo.syncIndex(null)
      expect(result).toEqual({ marketIds: [], lastBlock: 0 })
    })

    it('should call source.syncIndex with lowercased address', async () => {
      const repo = createWagerRepository()
      await repo.syncIndex('0xABCD1234567890123456789012345678901234EF')
      expect(mockSyncIndex).toHaveBeenCalledWith('0xabcd1234567890123456789012345678901234ef')
    })
  })

  describe('getDefaultWagerRepository', () => {
    it('should return a repository instance', () => {
      const repo = getDefaultWagerRepository()
      expect(repo).toBeDefined()
      expect(repo.sourceKey).toBe('subgraph')
      expect(typeof repo.listMyWagers).toBe('function')
      expect(typeof repo.getWagerById).toBe('function')
      expect(typeof repo.syncIndex).toBe('function')
    })

    it('should return the same singleton instance', () => {
      const repo1 = getDefaultWagerRepository()
      const repo2 = getDefaultWagerRepository()
      expect(repo1).toBe(repo2)
    })
  })
})
