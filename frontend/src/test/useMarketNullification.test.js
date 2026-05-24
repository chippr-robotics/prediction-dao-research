import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock useNullifierContracts
const mockUseNullifierContracts = vi.fn()
vi.mock('../hooks/useNullifierContracts', () => ({
  useNullifierContracts: (...args) => mockUseNullifierContracts(...args),
}))

// Mock primeMapping
vi.mock('../utils/primeMapping', () => ({
  getMarketNullificationData: vi.fn((market) => ({
    hash: `hash-${market.id}`,
    prime: 7n,
  })),
  getAddressNullificationData: vi.fn((addr) => ({
    hash: `addr-hash-${addr}`,
    prime: 11n,
  })),
  cacheNullificationData: vi.fn(),
  loadCachedNullificationData: vi.fn(() => null),
  clearNullificationCache: vi.fn(),
}))

// Mock RSA accumulator
vi.mock('../utils/rsaAccumulator', () => ({
  RSAAccumulator: {
    fromContractParams: vi.fn(() => ({
      getValue: vi.fn(() => 'acc-value'),
    })),
  },
}))

import { useMarketNullification } from '../hooks/useMarketNullification'

describe('useMarketNullification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseNullifierContracts.mockReturnValue({
      nullifiedMarkets: [],
      nullifiedAddresses: [],
      nullifierState: { accumulator: null, rsaParams: {} },
      isMarketNullified: vi.fn().mockResolvedValue(false),
      isAddressNullified: vi.fn().mockResolvedValue(false),
      fetchNullifiedMarkets: vi.fn().mockResolvedValue([]),
      fetchNullifiedAddresses: vi.fn().mockResolvedValue([]),
      isLoading: false,
      isRegistryAvailable: false,
    })
  })

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useMarketNullification())
    // Initially loading then settles
    expect(typeof result.current.isLoading).toBe('boolean')
  })

  it('should expose check functions', () => {
    const { result } = renderHook(() => useMarketNullification())
    expect(typeof result.current.checkMarketNullified).toBe('function')
    expect(typeof result.current.checkMarketHashNullified).toBe('function')
    expect(typeof result.current.checkAddressNullified).toBe('function')
  })

  it('should expose on-chain verification functions', () => {
    const { result } = renderHook(() => useMarketNullification())
    expect(typeof result.current.verifyMarketNullifiedOnChain).toBe('function')
    expect(typeof result.current.verifyAddressNullifiedOnChain).toBe('function')
  })

  it('should expose filtering functions', () => {
    const { result } = renderHook(() => useMarketNullification())
    expect(typeof result.current.filterMarkets).toBe('function')
    expect(typeof result.current.getNullifiedFromList).toBe('function')
    expect(typeof result.current.partitionMarkets).toBe('function')
  })

  it('should expose refresh functions', () => {
    const { result } = renderHook(() => useMarketNullification())
    expect(typeof result.current.refresh).toBe('function')
    expect(typeof result.current.forceRefresh).toBe('function')
  })

  it('should return false for checkMarketNullified when registry unavailable', () => {
    const { result } = renderHook(() => useMarketNullification())
    const isNullified = result.current.checkMarketNullified({ id: '1' })
    expect(isNullified).toBe(false)
  })

  it('should return false for checkMarketHashNullified when registry unavailable', () => {
    const { result } = renderHook(() => useMarketNullification())
    const isNullified = result.current.checkMarketHashNullified('0xhash')
    expect(isNullified).toBe(false)
  })

  it('should return false for checkAddressNullified when registry unavailable', () => {
    const { result } = renderHook(() => useMarketNullification())
    const isNullified = result.current.checkAddressNullified('0xaddr')
    expect(isNullified).toBe(false)
  })

  it('should return all markets from filterMarkets when registry unavailable', () => {
    const { result } = renderHook(() => useMarketNullification())
    const markets = [{ id: '1' }, { id: '2' }]
    const filtered = result.current.filterMarkets(markets)
    expect(filtered).toEqual(markets)
  })

  it('should return empty from getNullifiedFromList when registry unavailable', () => {
    const { result } = renderHook(() => useMarketNullification())
    const nullified = result.current.getNullifiedFromList([{ id: '1' }])
    expect(nullified).toEqual([])
  })

  it('should partition all as active when registry unavailable', () => {
    const { result } = renderHook(() => useMarketNullification())
    const markets = [{ id: '1' }, { id: '2' }]
    const { active, nullified } = result.current.partitionMarkets(markets)
    expect(active).toEqual(markets)
    expect(nullified).toEqual([])
  })

  it('should expose stats', () => {
    const { result } = renderHook(() => useMarketNullification())
    expect(result.current.stats.nullifiedMarketsCount).toBe(0)
    expect(result.current.stats.nullifiedAddressesCount).toBe(0)
    expect(result.current.stats.isRegistryAvailable).toBe(false)
    expect(result.current.stats.hasAccumulator).toBe(false)
  })

  it('should return false from verifyMarketNullifiedOnChain when registry unavailable', async () => {
    const { result } = renderHook(() => useMarketNullification())
    const isNullified = await result.current.verifyMarketNullifiedOnChain({ id: '1' })
    expect(isNullified).toBe(false)
  })

  it('should return false from verifyAddressNullifiedOnChain when registry unavailable', async () => {
    const { result } = renderHook(() => useMarketNullification())
    const isNullified = await result.current.verifyAddressNullifiedOnChain('0xaddr')
    expect(isNullified).toBe(false)
  })
})
