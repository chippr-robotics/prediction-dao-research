import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useIpfs,
  useTokenMetadata,
  useMarketData,
  useMarketMetadata,
  useIpfsByCid,
  useBatchIpfs,
  useIpfsCache,
} from '../hooks/useIpfs'
import * as ipfsService from '../utils/ipfsService'

// Mock the ipfsService module
vi.mock('../utils/ipfsService', () => ({
  fetchFromIpfs: vi.fn(),
  fetchTokenMetadata: vi.fn(),
  fetchMarketData: vi.fn(),
  fetchMarketMetadata: vi.fn(),
  fetchByCid: vi.fn(),
  batchFetch: vi.fn(),
  clearCache: vi.fn(),
  clearCacheEntry: vi.fn(),
}))

describe('useIpfs Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('useIpfs', () => {
    it('fetches data successfully', async () => {
      const mockData = { test: 'data' }
      ipfsService.fetchFromIpfs.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => useIpfs('/test/path'))

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toEqual(mockData)
      expect(result.current.error).toBeNull()
      expect(ipfsService.fetchFromIpfs).toHaveBeenCalledWith('/test/path', { skipCache: false })
    })

    it('handles errors correctly', async () => {
      const errorMessage = 'Failed to fetch'
      ipfsService.fetchFromIpfs.mockRejectedValueOnce(new Error(errorMessage))

      const { result } = renderHook(() => useIpfs('/test/path'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toBeNull()
      expect(result.current.error).toBe(errorMessage)
    })

    it('does not fetch when path is null', async () => {
      const { result } = renderHook(() => useIpfs(null))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(ipfsService.fetchFromIpfs).not.toHaveBeenCalled()
      expect(result.current.data).toBeNull()
    })

    it('does not fetch when enabled is false', async () => {
      const { result } = renderHook(() => useIpfs('/test/path', { enabled: false }))

      expect(ipfsService.fetchFromIpfs).not.toHaveBeenCalled()
      expect(result.current.loading).toBe(false)
    })

    it('refetch function works correctly', async () => {
      const mockData = { test: 'data' }
      ipfsService.fetchFromIpfs.mockResolvedValue(mockData)

      const { result } = renderHook(() => useIpfs('/test/path'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Call refetch
      result.current.refetch()

      await waitFor(() => {
        expect(ipfsService.fetchFromIpfs).toHaveBeenCalledTimes(2)
      })
    })

    it('clearCached function calls clearCacheEntry', () => {
      const { result } = renderHook(() => useIpfs('/test/path'))

      result.current.clearCached()

      expect(ipfsService.clearCacheEntry).toHaveBeenCalledWith('/test/path')
    })
  })

  describe('useTokenMetadata', () => {
    it('fetches token metadata successfully', async () => {
      const mockMetadata = { name: 'Test Token', symbol: 'TEST', decimals: 18 }
      ipfsService.fetchTokenMetadata.mockResolvedValueOnce(mockMetadata)

      const { result } = renderHook(() => 
        useTokenMetadata('0x1234567890123456789012345678901234567890')
      )

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.metadata).toEqual(mockMetadata)
      expect(result.current.error).toBeNull()
      expect(ipfsService.fetchTokenMetadata).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        { skipCache: false }
      )
    })

    it('handles errors correctly', async () => {
      const errorMessage = 'Token not found'
      ipfsService.fetchTokenMetadata.mockRejectedValueOnce(new Error(errorMessage))

      const { result } = renderHook(() => useTokenMetadata('0x1234'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.metadata).toBeNull()
      expect(result.current.error).toBe(errorMessage)
    })

    it('does not fetch when tokenAddress is null', async () => {
      const { result } = renderHook(() => useTokenMetadata(null))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(ipfsService.fetchTokenMetadata).not.toHaveBeenCalled()
    })
  })

  describe('useMarketData', () => {
    it('fetches market data successfully', async () => {
      const mockData = { id: '123', volume: 1000 }
      ipfsService.fetchMarketData.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => useMarketData('market-123'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.marketData).toEqual(mockData)
      expect(result.current.error).toBeNull()
    })

    it('handles errors correctly', async () => {
      const errorMessage = 'Market not found'
      ipfsService.fetchMarketData.mockRejectedValueOnce(new Error(errorMessage))

      const { result } = renderHook(() => useMarketData('market-123'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.marketData).toBeNull()
      expect(result.current.error).toBe(errorMessage)
    })
  })

  describe('useMarketMetadata', () => {
    it('fetches market metadata successfully', async () => {
      const mockMetadata = { title: 'Test Market', description: 'A test market' }
      ipfsService.fetchMarketMetadata.mockResolvedValueOnce(mockMetadata)

      const { result } = renderHook(() => useMarketMetadata('market-456'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.metadata).toEqual(mockMetadata)
      expect(result.current.error).toBeNull()
    })
  })

  describe('useIpfsByCid', () => {
    it('fetches data by CID successfully', async () => {
      const mockData = { content: 'IPFS content' }
      ipfsService.fetchByCid.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => 
        useIpfsByCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toEqual(mockData)
      expect(result.current.error).toBeNull()
    })

    it('handles errors correctly', async () => {
      const errorMessage = 'Invalid CID'
      ipfsService.fetchByCid.mockRejectedValueOnce(new Error(errorMessage))

      const { result } = renderHook(() => useIpfsByCid('invalid-cid'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toBeNull()
      expect(result.current.error).toBe(errorMessage)
    })
  })

  describe('useBatchIpfs', () => {
    it('fetches multiple items successfully', async () => {
      const mockResults = [{ id: 1 }, { id: 2 }, { id: 3 }]
      ipfsService.batchFetch.mockResolvedValueOnce(mockResults)

      const { result } = renderHook(() => 
        useBatchIpfs(['/path1', '/path2', '/path3'])
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toEqual(mockResults)
      expect(result.current.error).toBeNull()
    })

    it('handles empty paths array', async () => {
      const { result } = renderHook(() => useBatchIpfs([]))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(ipfsService.batchFetch).not.toHaveBeenCalled()
      expect(result.current.data).toEqual([])
    })

    it('handles errors correctly', async () => {
      const errorMessage = 'Batch fetch failed'
      ipfsService.batchFetch.mockRejectedValueOnce(new Error(errorMessage))

      const { result } = renderHook(() => useBatchIpfs(['/path1', '/path2']))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toEqual([])
      expect(result.current.error).toBe(errorMessage)
    })
  })

  describe('useIpfsCache', () => {
    it('provides clearAll function', () => {
      const { result } = renderHook(() => useIpfsCache())

      result.current.clearAll()

      expect(ipfsService.clearCache).toHaveBeenCalled()
    })

    it('provides clearEntry function', () => {
      const { result } = renderHook(() => useIpfsCache())

      result.current.clearEntry('/test/path')

      expect(ipfsService.clearCacheEntry).toHaveBeenCalledWith('/test/path')
    })
  })

  describe('Hook options', () => {
    it('respects skipCache option', async () => {
      const mockData = { test: 'data' }
      ipfsService.fetchFromIpfs.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => useIpfs('/test/path', { skipCache: true }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(ipfsService.fetchFromIpfs).toHaveBeenCalledWith('/test/path', { skipCache: true })
    })

    it('updates when path changes', async () => {
      const mockData1 = { id: 1 }
      const mockData2 = { id: 2 }
      
      ipfsService.fetchFromIpfs
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2)

      const { result, rerender } = renderHook(
        ({ path }) => useIpfs(path),
        { initialProps: { path: '/path1' } }
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toEqual(mockData1)

      // Change path
      rerender({ path: '/path2' })

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData2)
      })

      expect(ipfsService.fetchFromIpfs).toHaveBeenCalledTimes(2)
    })
  })
})
