/**
 * Tests for useUnreadMarketTracker — targeting 90% coverage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createUnreadMarketTracker } from '../hooks/useUnreadMarketTracker'

// Mock userStorage
vi.mock('../utils/userStorage', () => ({
  getUserPreference: vi.fn((account, key, defaultValue) => defaultValue),
  saveUserPreference: vi.fn(),
}))

const ACCOUNT = '0x1234567890123456789012345678901234567890'

describe('createUnreadMarketTracker', () => {
  let useUnreadMarketTracker

  beforeEach(() => {
    vi.clearAllMocks()
    useUnreadMarketTracker = createUnreadMarketTracker({
      storageKey: 'test_unread',
      extraUnreadPredicate: undefined,
    })
  })

  it('returns 0 unread when no markets', () => {
    const { result } = renderHook(() => useUnreadMarketTracker([], ACCOUNT))
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.unreadMarketIds).toEqual([])
  })

  it('returns 0 unread when no account', () => {
    const markets = [{ id: '1', status: 'active' }]
    const { result } = renderHook(() => useUnreadMarketTracker(markets, null))
    expect(result.current.unreadCount).toBe(0)
  })

  it('marks unseen markets as unread', () => {
    const markets = [
      { id: '1', status: 'active' },
      { id: '2', status: 'pending_acceptance' },
    ]
    const { result } = renderHook(() => useUnreadMarketTracker(markets, ACCOUNT))
    expect(result.current.unreadCount).toBe(2)
    expect(result.current.unreadMarketIds).toContain('1')
    expect(result.current.unreadMarketIds).toContain('2')
  })

  it('markMarketAsRead removes a market from unread list', () => {
    const markets = [
      { id: '1', status: 'active' },
      { id: '2', status: 'active' },
    ]
    const { result } = renderHook(() => useUnreadMarketTracker(markets, ACCOUNT))

    expect(result.current.unreadCount).toBe(2)

    act(() => {
      result.current.markMarketAsRead('1')
    })

    expect(result.current.unreadCount).toBe(1)
    expect(result.current.unreadMarketIds).not.toContain('1')
    expect(result.current.unreadMarketIds).toContain('2')
  })

  it('isMarketUnread returns correct boolean', () => {
    const markets = [{ id: '1', status: 'active' }]
    const { result } = renderHook(() => useUnreadMarketTracker(markets, ACCOUNT))

    expect(result.current.isMarketUnread('1')).toBe(true)
    expect(result.current.isMarketUnread('999')).toBe(false)
  })

  it('detects status change as unread', () => {
    const markets = [{ id: '1', status: 'active' }]
    const { result, rerender } = renderHook(
      ({ m }) => useUnreadMarketTracker(m, ACCOUNT),
      { initialProps: { m: markets } }
    )

    // Mark as read
    act(() => {
      result.current.markMarketAsRead('1')
    })
    expect(result.current.unreadCount).toBe(0)

    // Status changes -> should become unread again
    const updatedMarkets = [{ id: '1', status: 'pending_resolution' }]
    rerender({ m: updatedMarkets })

    expect(result.current.unreadCount).toBe(1)
  })

  it('detects increased acceptedCount as unread for pending_acceptance', () => {
    const markets = [{ id: '1', status: 'pending_acceptance', acceptedCount: 1 }]
    const { result, rerender } = renderHook(
      ({ m }) => useUnreadMarketTracker(m, ACCOUNT),
      { initialProps: { m: markets } }
    )

    // Mark as read
    act(() => {
      result.current.markMarketAsRead('1')
    })
    expect(result.current.unreadCount).toBe(0)

    // acceptedCount increases
    const updatedMarkets = [{ id: '1', status: 'pending_acceptance', acceptedCount: 3 }]
    rerender({ m: updatedMarkets })

    expect(result.current.unreadCount).toBe(1)
  })

  it('skips expired pending_acceptance markets', () => {
    const pastTime = Date.now() - 10000
    const markets = [
      { id: '1', status: 'pending_acceptance', acceptanceDeadline: pastTime },
    ]
    const { result } = renderHook(() => useUnreadMarketTracker(markets, ACCOUNT))
    expect(result.current.unreadCount).toBe(0)
  })

  it('does NOT skip pending_acceptance with future deadline', () => {
    const futureTime = Date.now() + 100000
    const markets = [
      { id: '1', status: 'pending_acceptance', acceptanceDeadline: futureTime },
    ]
    const { result } = renderHook(() => useUnreadMarketTracker(markets, ACCOUNT))
    expect(result.current.unreadCount).toBe(1)
  })

  it('markMarketAsRead does nothing when no account', () => {
    const markets = [{ id: '1', status: 'active' }]
    const { result } = renderHook(() => useUnreadMarketTracker(markets, null))

    act(() => {
      result.current.markMarketAsRead('1')
    })
    // Should not throw
    expect(result.current.unreadCount).toBe(0)
  })

  it('markMarketAsRead does nothing when market not found in current list', () => {
    const markets = [{ id: '1', status: 'active' }]
    const { result } = renderHook(() => useUnreadMarketTracker(markets, ACCOUNT))

    act(() => {
      result.current.markMarketAsRead('999')
    })
    // Should not throw, count unchanged
    expect(result.current.unreadCount).toBe(1)
  })

  it('resets state when account changes to null', () => {
    const markets = [{ id: '1', status: 'active' }]
    const { result, rerender } = renderHook(
      ({ acct }) => useUnreadMarketTracker(markets, acct),
      { initialProps: { acct: ACCOUNT } }
    )
    expect(result.current.unreadCount).toBe(1)

    rerender({ acct: null })
    expect(result.current.unreadCount).toBe(0)
  })

  it('loads state when account changes to a new address', () => {
    const markets = [{ id: '1', status: 'active' }]
    const OTHER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

    const { result, rerender } = renderHook(
      ({ acct }) => useUnreadMarketTracker(markets, acct),
      { initialProps: { acct: ACCOUNT } }
    )

    rerender({ acct: OTHER })
    // New account means fresh state — all markets unread
    expect(result.current.unreadCount).toBe(1)
  })
})

describe('createUnreadMarketTracker with extraUnreadPredicate', () => {
  it('uses extraUnreadPredicate to flag additional markets as unread', () => {
    const useTracker = createUnreadMarketTracker({
      storageKey: 'test_extra',
      extraUnreadPredicate: (market, _seen) => market.hasNewComments === true,
    })

    const markets = [{ id: '1', status: 'active', hasNewComments: true }]
    const { result } = renderHook(() => useTracker(markets, ACCOUNT))

    // Mark as read
    act(() => {
      result.current.markMarketAsRead('1')
    })
    // Still unread because extraUnreadPredicate returns true
    expect(result.current.unreadCount).toBe(1)
  })
})
