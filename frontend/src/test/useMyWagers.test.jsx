import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMyWagers } from '../hooks/useMyWagers'

// Mock the WagerRepository module
vi.mock('../data/wagers/WagerRepository', () => ({
  getDefaultWagerRepository: vi.fn(() => ({
    listMyWagers: vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
      totalKnown: 0,
    }),
  })),
}))

const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890'

function createMockRepository(overrides = {}) {
  return {
    listMyWagers: vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
      totalKnown: 0,
      ...overrides,
    }),
  }
}

describe('useMyWagers hook', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should return empty items when no account provided', async () => {
      const repo = createMockRepository()
      const { result } = renderHook(() => useMyWagers({ repository: repo }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.items).toEqual([])
      expect(result.current.hasMore).toBe(false)
      expect(result.current.totalKnown).toBe(0)
      expect(result.current.error).toBeNull()
    })

    it('should not call repository when no account', async () => {
      const repo = createMockRepository()
      renderHook(() => useMyWagers({ repository: repo }))

      await waitFor(() => {
        expect(repo.listMyWagers).not.toHaveBeenCalled()
      })
    })
  })

  describe('loading wagers', () => {
    it('should load wagers for a given account', async () => {
      const mockItems = [
        { id: '1', description: 'Wager 1' },
        { id: '2', description: 'Wager 2' },
      ]
      const repo = createMockRepository({
        items: mockItems,
        totalKnown: 2,
      })

      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.items).toEqual(mockItems)
      expect(result.current.totalKnown).toBe(2)
    })

    it('should pass correct parameters to repository', async () => {
      const repo = createMockRepository()
      renderHook(() =>
        useMyWagers({
          account: TEST_ACCOUNT,
          tab: 'created',
          sort: 'endTime',
          repository: repo,
        })
      )

      await waitFor(() => {
        expect(repo.listMyWagers).toHaveBeenCalled()
      })

      expect(repo.listMyWagers).toHaveBeenCalledWith(
        expect.objectContaining({
          userAddress: TEST_ACCOUNT,
          cursor: null,
          sortKey: 'endTime',
          filter: expect.objectContaining({ tab: 'created' }),
        })
      )
    })

    it('should use default sort key when not specified', async () => {
      const repo = createMockRepository()
      renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      await waitFor(() => {
        expect(repo.listMyWagers).toHaveBeenCalled()
      })

      expect(repo.listMyWagers).toHaveBeenCalledWith(
        expect.objectContaining({
          sortKey: 'createdAt',
        })
      )
    })

    it('should use default page size', async () => {
      const repo = createMockRepository()
      renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      await waitFor(() => {
        expect(repo.listMyWagers).toHaveBeenCalled()
      })

      expect(repo.listMyWagers).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 25,
        })
      )
    })

    it('should accept custom page size', async () => {
      const repo = createMockRepository()
      renderHook(() =>
        useMyWagers({
          account: TEST_ACCOUNT,
          tab: 'participating',
          pageSize: 10,
          repository: repo,
        })
      )

      await waitFor(() => {
        expect(repo.listMyWagers).toHaveBeenCalled()
      })

      expect(repo.listMyWagers).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 10,
        })
      )
    })
  })

  describe('error handling', () => {
    it('should set error state on repository failure', async () => {
      const repo = {
        listMyWagers: vi.fn().mockRejectedValue(new Error('Network error')),
      }

      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.error).toBe('Network error')
      expect(result.current.items).toEqual([])
    })

    it('should set generic error message when error has no message', async () => {
      const repo = {
        listMyWagers: vi.fn().mockRejectedValue({}),
      }

      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.error).toBe('Failed to load wagers')
    })
  })

  describe('pagination', () => {
    it('should indicate hasMore when more pages available', async () => {
      const repo = createMockRepository({
        items: [{ id: '1' }],
        nextCursor: 'cursor-123',
        hasMore: true,
        totalKnown: 50,
      })

      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.hasMore).toBe(true)
      expect(result.current.totalKnown).toBe(50)
    })

    it('should load more items on loadMore', async () => {
      const repo = {
        listMyWagers: vi.fn()
          .mockResolvedValueOnce({
            items: [{ id: '1' }],
            nextCursor: 'cursor-1',
            hasMore: true,
            totalKnown: 2,
          })
          .mockResolvedValueOnce({
            items: [{ id: '2' }],
            nextCursor: null,
            hasMore: false,
            totalKnown: 2,
          }),
      }

      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      await act(async () => {
        await result.current.loadMore()
      })

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2)
      })

      expect(result.current.hasMore).toBe(false)
    })

    it('should not call loadMore when hasMore is false', async () => {
      const repo = createMockRepository({
        items: [{ id: '1' }],
        hasMore: false,
      })

      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      repo.listMyWagers.mockClear()

      await act(async () => {
        await result.current.loadMore()
      })

      // Should not make another call
      expect(repo.listMyWagers).not.toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    it('should reload first page on refresh', async () => {
      const repo = createMockRepository({
        items: [{ id: '1' }],
        totalKnown: 1,
      })

      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      repo.listMyWagers.mockResolvedValueOnce({
        items: [{ id: '1' }, { id: '2' }],
        nextCursor: null,
        hasMore: false,
        totalKnown: 2,
      })

      await act(async () => {
        await result.current.refresh()
      })

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2)
      })
    })
  })

  describe('return shape', () => {
    it('should return all expected properties', async () => {
      const repo = createMockRepository()
      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', repository: repo })
      )

      expect(result.current).toHaveProperty('items')
      expect(result.current).toHaveProperty('sort')
      expect(result.current).toHaveProperty('filter')
      expect(result.current).toHaveProperty('loadMore')
      expect(result.current).toHaveProperty('refresh')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('hasMore')
      expect(result.current).toHaveProperty('totalKnown')
    })

    it('should expose the effective sort value', () => {
      const repo = createMockRepository()
      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', sort: 'endTime', repository: repo })
      )
      expect(result.current.sort).toBe('endTime')
    })

    it('should expose the effective filter value', () => {
      const repo = createMockRepository()
      const filter = { status: 'active' }
      const { result } = renderHook(() =>
        useMyWagers({ account: TEST_ACCOUNT, tab: 'participating', filter, repository: repo })
      )
      expect(result.current.filter).toEqual(filter)
    })
  })
})
