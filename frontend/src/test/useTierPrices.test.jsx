import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Mock ethers to prevent actual RPC connections.
// Must use class constructors (not plain functions) because the source does `new ethers.Contract(...)`.
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()

  class TestJsonRpcProvider { constructor() {} }

  class TestContract {
    constructor() {}
    async getTierConfig() { throw new Error('not deployed') }
  }

  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: TestJsonRpcProvider,
      Contract: TestContract,
    },
    JsonRpcProvider: TestJsonRpcProvider,
    Contract: TestContract,
  }
})

// Mock the contracts config before importing the hook
vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => '0xMembershipManagerAddress'),
  NETWORK_CONFIG: { rpcUrl: 'http://mock-rpc' },
}))

// Mock the MembershipManager ABI
vi.mock('../abis/MembershipManager', () => ({
  MEMBERSHIP_MANAGER_ABI: [],
}))

import { useTierPrices } from '../hooks/useTierPrices'
import { getContractAddress } from '../config/contracts'

describe('useTierPrices hook', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(getContractAddress).mockReturnValue('0xMembershipManagerAddress')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should start with fallback prices', () => {
    const { result, unmount } = renderHook(() => useTierPrices())

    // Fallback prices should be set initially
    expect(result.current.tierPrices.BRONZE.WAGER_PARTICIPANT).toBe(2)
    expect(result.current.tierPrices.SILVER.WAGER_PARTICIPANT).toBe(8)
    expect(result.current.tierPrices.GOLD.WAGER_PARTICIPANT).toBe(25)
    expect(result.current.tierPrices.PLATINUM.WAGER_PARTICIPANT).toBe(100)
    unmount()
  })

  it('should expose FALLBACK_PRICES constant', () => {
    const { result, unmount } = renderHook(() => useTierPrices())

    expect(result.current.FALLBACK_PRICES).toBeDefined()
    expect(result.current.FALLBACK_PRICES.BRONZE.WAGER_PARTICIPANT).toBe(2)
    expect(result.current.FALLBACK_PRICES.SILVER.WAGER_PARTICIPANT).toBe(8)
    expect(result.current.FALLBACK_PRICES.GOLD.WAGER_PARTICIPANT).toBe(25)
    expect(result.current.FALLBACK_PRICES.PLATINUM.WAGER_PARTICIPANT).toBe(100)
    unmount()
  })

  it('should expose TIER_IDS constant', () => {
    const { result, unmount } = renderHook(() => useTierPrices())

    expect(result.current.TIER_IDS).toEqual({
      BRONZE: 1,
      SILVER: 2,
      GOLD: 3,
      PLATINUM: 4,
    })
    unmount()
  })

  it('should expose ROLE_HASHES constant', () => {
    const { result, unmount } = renderHook(() => useTierPrices())

    expect(result.current.ROLE_HASHES).toBeDefined()
    expect(result.current.ROLE_HASHES.WAGER_PARTICIPANT).toBeDefined()
    expect(typeof result.current.ROLE_HASHES.WAGER_PARTICIPANT).toBe('string')
    unmount()
  })

  it('should start in loading state', () => {
    const { result, unmount } = renderHook(() => useTierPrices())
    // isLoading is initially true
    expect(result.current.isLoading).toBe(true)
    unmount()
  })

  it('should have null lastUpdated initially', () => {
    const { result, unmount } = renderHook(() => useTierPrices())
    // Before first successful fetch
    expect(result.current.lastUpdated).toBeNull()
    unmount()
  })

  it('should handle missing contract address', async () => {
    vi.mocked(getContractAddress).mockReturnValue(null)

    const { result, unmount } = renderHook(() => useTierPrices())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('MembershipManager not deployed')
    unmount()
  })

  it('should complete loading after fetch attempt', async () => {
    const { result, unmount } = renderHook(() => useTierPrices())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // After fetch (with mock contract that has no getTierConfig),
    // should still have fallback prices
    expect(result.current.tierPrices.BRONZE.WAGER_PARTICIPANT).toBe(2)
    unmount()
  })

  describe('getPrice', () => {
    it('should return price for a given role and tier', () => {
      const { result, unmount } = renderHook(() => useTierPrices())

      expect(result.current.getPrice('WAGER_PARTICIPANT', 'BRONZE')).toBe(2)
      expect(result.current.getPrice('WAGER_PARTICIPANT', 'SILVER')).toBe(8)
      expect(result.current.getPrice('WAGER_PARTICIPANT', 'GOLD')).toBe(25)
      expect(result.current.getPrice('WAGER_PARTICIPANT', 'PLATINUM')).toBe(100)
      unmount()
    })

    it('should return 0 for unknown role/tier combination', () => {
      const { result, unmount } = renderHook(() => useTierPrices())

      expect(result.current.getPrice('UNKNOWN_ROLE', 'BRONZE')).toBe(0)
      expect(result.current.getPrice('WAGER_PARTICIPANT', 'UNKNOWN_TIER')).toBe(0)
      unmount()
    })
  })

  describe('getTotalPrice', () => {
    it('should sum prices for multiple roles', () => {
      const { result, unmount } = renderHook(() => useTierPrices())

      const total = result.current.getTotalPrice(['WAGER_PARTICIPANT'], 'BRONZE')
      expect(total).toBe(2)
      unmount()
    })

    it('should return 0 for empty role array', () => {
      const { result, unmount } = renderHook(() => useTierPrices())

      expect(result.current.getTotalPrice([], 'BRONZE')).toBe(0)
      unmount()
    })
  })

  describe('getLimits', () => {
    it('should return null for tiers without loaded limits', () => {
      const { result, unmount } = renderHook(() => useTierPrices())

      // Before fetching from contract, tierLimits is empty
      expect(result.current.getLimits('WAGER_PARTICIPANT', 'BRONZE')).toBeNull()
      unmount()
    })
  })

  describe('isTierActive', () => {
    it('should return true by default when no limits are loaded', () => {
      const { result, unmount } = renderHook(() => useTierPrices())

      // Defaults to true when no limit data is available
      expect(result.current.isTierActive('WAGER_PARTICIPANT', 'BRONZE')).toBe(true)
      unmount()
    })
  })

  describe('fetchPrices', () => {
    it('should expose fetchPrices as a function', () => {
      const { result, unmount } = renderHook(() => useTierPrices())
      expect(typeof result.current.fetchPrices).toBe('function')
      unmount()
    })
  })

  describe('return shape', () => {
    it('should return all expected properties', () => {
      const { result, unmount } = renderHook(() => useTierPrices())

      expect(result.current).toHaveProperty('tierPrices')
      expect(result.current).toHaveProperty('tierLimits')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('lastUpdated')
      expect(result.current).toHaveProperty('fetchPrices')
      expect(result.current).toHaveProperty('getPrice')
      expect(result.current).toHaveProperty('getTotalPrice')
      expect(result.current).toHaveProperty('getLimits')
      expect(result.current).toHaveProperty('isTierActive')
      expect(result.current).toHaveProperty('TIER_IDS')
      expect(result.current).toHaveProperty('ROLE_HASHES')
      expect(result.current).toHaveProperty('FALLBACK_PRICES')
      unmount()
    })
  })
})
