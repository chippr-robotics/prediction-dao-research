import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchFromIpfs,
  fetchTokenMetadata,
  fetchMarketData,
  fetchMarketMetadata,
  fetchByCid,
  batchFetch,
  clearCache,
  clearCacheEntry,
  checkGatewayHealth,
} from '../utils/ipfsService'

// Mock fetch globally
global.fetch = vi.fn()

describe('IPFS Service', () => {
  beforeEach(() => {
    clearCache()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchFromIpfs', () => {
    it('fetches data from IPFS successfully', async () => {
      const mockData = { name: 'Test Token', symbol: 'TEST' }
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      })

      const result = await fetchFromIpfs('/test/path')
      
      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test/path'),
        expect.any(Object)
      )
    })

    it('uses cached data on subsequent calls', async () => {
      const mockData = { name: 'Cached Data' }
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      })

      // First call - should fetch
      const result1 = await fetchFromIpfs('/test/cache')
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      const result2 = await fetchFromIpfs('/test/cache')
      expect(global.fetch).toHaveBeenCalledTimes(1) // Still only 1 call
      expect(result2).toEqual(result1)
    })

    it('skips cache when skipCache option is true', async () => {
      const mockData = { name: 'Fresh Data' }
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      })

      await fetchFromIpfs('/test/skip-cache')
      await fetchFromIpfs('/test/skip-cache', { skipCache: true })
      
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('retries on failure and eventually succeeds', async () => {
      const mockData = { name: 'Success After Retry' }
      
      // First call fails, second succeeds
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData,
        })

      const result = await fetchFromIpfs('/test/retry')
      
      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('throws error after max retries', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'))

      await expect(fetchFromIpfs('/test/fail')).rejects.toThrow(
        'IPFS fetch failed after'
      )
    })

    it('handles HTTP error responses', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(fetchFromIpfs('/test/404')).rejects.toThrow()
    })

    it('handles timeout correctly', async () => {
      // Mock a timeout scenario
      global.fetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          const error = new Error('Timeout')
          error.name = 'AbortError'
          reject(error)
        })
      })

      await expect(fetchFromIpfs('/test/timeout')).rejects.toThrow(
        'IPFS request timeout'
      )
    })
  })

  describe('fetchTokenMetadata', () => {
    it('fetches token metadata with correct path', async () => {
      const mockMetadata = { name: 'Test Token', symbol: 'TEST', decimals: 18 }
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      })

      const result = await fetchTokenMetadata('0x1234567890123456789012345678901234567890')
      
      expect(result).toEqual(mockMetadata)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/token/0x1234567890123456789012345678901234567890/metadata.json'),
        expect.any(Object)
      )
    })

    it('throws error when token address is missing', async () => {
      await expect(fetchTokenMetadata('')).rejects.toThrow('Token address is required')
      await expect(fetchTokenMetadata(null)).rejects.toThrow('Token address is required')
    })
  })

  describe('fetchMarketData', () => {
    it('fetches market data with correct path', async () => {
      const mockData = { id: '123', volume: 1000 }
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      })

      const result = await fetchMarketData('market-123')
      
      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/market-123/data.json'),
        expect.any(Object)
      )
    })

    it('throws error when market ID is missing', async () => {
      await expect(fetchMarketData('')).rejects.toThrow('Market ID is required')
    })
  })

  describe('fetchMarketMetadata', () => {
    it('fetches market metadata with correct path', async () => {
      const mockMetadata = { title: 'Test Market', description: 'A test market' }
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      })

      const result = await fetchMarketMetadata('market-456')
      
      expect(result).toEqual(mockMetadata)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/market-456/metadata.json'),
        expect.any(Object)
      )
    })
  })

  describe('fetchByCid', () => {
    it('fetches data by valid CID', async () => {
      const mockData = { content: 'IPFS content' }
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      })

      const result = await fetchByCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      
      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'),
        expect.any(Object)
      )
    })

    it('throws error for invalid CID format', async () => {
      await expect(fetchByCid('invalid-cid')).rejects.toThrow('Invalid CID format')
    })

    it('throws error when CID is missing', async () => {
      await expect(fetchByCid('')).rejects.toThrow('CID is required')
    })
  })

  describe('batchFetch', () => {
    it('fetches multiple items successfully', async () => {
      const mockData1 = { id: 1 }
      const mockData2 = { id: 2 }
      
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData1,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData2,
        })

      const results = await batchFetch(['/path1', '/path2'])
      
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual(mockData1)
      expect(results[1]).toEqual(mockData2)
    })

    it('returns null for failed fetches in batch', async () => {
      const mockData = { id: 1 }
      
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData,
        })
        .mockRejectedValueOnce(new Error('Failed'))

      const results = await batchFetch(['/path1', '/path2'])
      
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual(mockData)
      expect(results[1]).toBeNull()
    })

    it('returns empty array for empty paths', async () => {
      const results = await batchFetch([])
      expect(results).toEqual([])
    })
  })

  describe('Cache Management', () => {
    it('clears cache entry', async () => {
      const mockData = { data: 'test' }
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      })

      // Fetch and cache
      await fetchFromIpfs('/test/clear-entry')
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Clear specific entry
      clearCacheEntry('/test/clear-entry')

      // Should fetch again
      await fetchFromIpfs('/test/clear-entry')
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('clears all cache', async () => {
      const mockData = { data: 'test' }
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      })

      // Fetch and cache multiple items
      await fetchFromIpfs('/test/1')
      await fetchFromIpfs('/test/2')
      expect(global.fetch).toHaveBeenCalledTimes(2)

      // Clear all cache
      clearCache()

      // Should fetch both again
      await fetchFromIpfs('/test/1')
      await fetchFromIpfs('/test/2')
      expect(global.fetch).toHaveBeenCalledTimes(4)
    })
  })

  describe('checkGatewayHealth', () => {
    it('returns true when gateway is accessible', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await checkGatewayHealth()
      expect(result).toBe(true)
    })

    it('returns true even with 404 status', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await checkGatewayHealth()
      expect(result).toBe(true)
    })

    it('returns false when gateway is not accessible', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await checkGatewayHealth()
      expect(result).toBe(false)
    })
  })
})
