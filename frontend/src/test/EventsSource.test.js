import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ethers before importing EventsSource
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: vi.fn().mockImplementation(() => ({
        getBlockNumber: vi.fn().mockResolvedValue(100000),
        getBalance: vi.fn().mockResolvedValue(0n),
      })),
      Contract: vi.fn().mockImplementation(() => ({
        filters: { MemberAdded: vi.fn().mockReturnValue({}) },
        queryFilter: vi.fn().mockResolvedValue([]),
        getFriendMarketWithStatus: vi.fn(),
        friendMarkets: vi.fn(),
      })),
      isAddress: actual.ethers?.isAddress || ((a) => /^0x[0-9a-fA-F]{40}$/.test(a)),
      ZeroAddress: '0x0000000000000000000000000000000000000000',
      formatUnits: actual.ethers?.formatUnits || actual.formatUnits,
    },
    // Also expose at top level for named imports
    isAddress: actual.isAddress || ((a) => /^0x[0-9a-fA-F]{40}$/.test(a)),
    ZeroAddress: '0x0000000000000000000000000000000000000000',
    formatUnits: actual.formatUnits,
  }
})

// Mock config
vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => '0x1111111111111111111111111111111111111111'),
  NETWORK_CONFIG: { rpcUrl: 'http://localhost:8545' },
  DEPLOYMENT_BLOCKS: { friendGroupMarketFactory: 0 },
}))

vi.mock('../constants/dex', () => ({
  DEX_ADDRESSES: {
    STABLECOIN: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  },
}))

vi.mock('../abis/FriendGroupMarketFactory', () => ({
  FRIEND_GROUP_MARKET_FACTORY_ABI: [],
}))

vi.mock('../utils/ipfsService', () => ({
  parseEncryptedIpfsReference: vi.fn((desc) => ({
    isIpfs: false,
    cid: null,
    raw: desc,
  })),
}))

// Mock cacheStore
const mockLoadIndex = vi.fn(() => ({ marketIds: [], lastBlock: 0 }))
const mockSaveIndex = vi.fn()
const mockLoadCache = vi.fn(() => ({}))
const mockUpsertCache = vi.fn()

vi.mock('../data/wagers/cacheStore', () => ({
  loadIndex: (...args) => mockLoadIndex(...args),
  saveIndex: (...args) => mockSaveIndex(...args),
  loadCache: (...args) => mockLoadCache(...args),
  upsertCache: (...args) => mockUpsertCache(...args),
}))

// Mock sortFilter
vi.mock('../data/wagers/sortFilter', () => ({
  applyFilters: vi.fn((wagers) => wagers),
  paginate: vi.fn((items) => ({
    items,
    nextCursor: null,
    hasMore: false,
    totalKnown: items.length,
  })),
}))

vi.mock('../constants/wagerDefaults', () => ({
  WagerSortKey: { CREATED: 'created', ENDS: 'ends' },
}))

// Set env before import
const originalEnv = { ...import.meta.env }

describe('EventsSource', () => {
  let EventsSource

  beforeEach(async () => {
    vi.clearAllMocks()
    mockLoadIndex.mockReturnValue({ marketIds: [], lastBlock: 0 })
    mockLoadCache.mockReturnValue({})

    // Dynamically import to get fresh module state
    EventsSource = await import('../data/wagers/EventsSource')
  })

  describe('syncIndex', () => {
    it('should return empty result for null userAddress', async () => {
      const result = await EventsSource.syncIndex(null)
      expect(result).toEqual({ marketIds: [], lastBlock: 0 })
    })

    it('should return empty result for invalid address', async () => {
      const result = await EventsSource.syncIndex('not-an-address')
      expect(result).toEqual({ marketIds: [], lastBlock: 0 })
    })
  })

  describe('listPage', () => {
    it('should return empty result for null userAddress', async () => {
      const result = await EventsSource.listPage({ userAddress: null })
      expect(result).toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
        totalKnown: 0,
        source: 'events',
      })
    })
  })

  describe('getById', () => {
    it('should return null for missing id', async () => {
      const result = await EventsSource.getById(null, '0x1234567890123456789012345678901234567890')
      expect(result).toBeNull()
    })

    it('should return null for missing userAddress', async () => {
      const result = await EventsSource.getById('1', null)
      expect(result).toBeNull()
    })
  })

  describe('fetchAllCompat', () => {
    it('should return empty array for null address', async () => {
      const result = await EventsSource.fetchAllCompat(null)
      expect(result).toEqual([])
    })

    it('should return empty array for invalid address', async () => {
      const result = await EventsSource.fetchAllCompat('bad')
      expect(result).toEqual([])
    })
  })
})
