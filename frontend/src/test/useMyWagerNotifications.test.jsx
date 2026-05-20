import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMyWagerNotifications } from '../hooks/useMyWagerNotifications'

const ACCOUNT = '0x1234567890123456789012345678901234567890'

function market(id, overrides = {}) {
  return {
    id,
    status: 'active',
    creator: ACCOUNT,
    participants: [ACCOUNT],
    acceptedCount: 0,
    acceptanceDeadline: Date.now() + 24 * 60 * 60 * 1000,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('useMyWagerNotifications', () => {
  it('flags new wagers as unread', () => {
    const markets = [market('1'), market('2')]
    const { result } = renderHook(() => useMyWagerNotifications(markets, ACCOUNT))
    expect(result.current.unreadCount).toBe(2)
    expect(result.current.unreadMarketIds.sort()).toEqual(['1', '2'])
  })

  it('flags an active→pending_resolution transition as unread (MyWagers-specific trigger)', () => {
    // First render: mark as read while active
    const initialMarkets = [market('1', { status: 'active' })]
    const { result, rerender } = renderHook(({ ms }) => useMyWagerNotifications(ms, ACCOUNT), {
      initialProps: { ms: initialMarkets },
    })
    act(() => result.current.markMarketAsRead('1'))
    expect(result.current.isMarketUnread('1')).toBe(false)

    // Status changes to pending_resolution
    const updatedMarkets = [market('1', { status: 'pending_resolution' })]
    rerender({ ms: updatedMarkets })
    expect(result.current.isMarketUnread('1')).toBe(true)
  })

  it('markMarketAsRead clears the unread state and persists across remount', () => {
    const markets = [market('1')]
    const { result, unmount } = renderHook(() => useMyWagerNotifications(markets, ACCOUNT))
    act(() => result.current.markMarketAsRead('1'))
    expect(result.current.unreadCount).toBe(0)
    unmount()

    const { result: r2 } = renderHook(() => useMyWagerNotifications(markets, ACCOUNT))
    expect(r2.current.isMarketUnread('1')).toBe(false)
  })

  it('returns 0 unread when account is missing', () => {
    const { result } = renderHook(() => useMyWagerNotifications([market('1')], null))
    expect(result.current.unreadCount).toBe(0)
  })

  it('isolates storage from useFriendMarketNotifications (different key)', async () => {
    const { useFriendMarketNotifications } = await import('../hooks/useFriendMarketNotifications')
    const markets = [market('1')]
    const my = renderHook(() => useMyWagerNotifications(markets, ACCOUNT))
    act(() => my.result.current.markMarketAsRead('1'))

    const friend = renderHook(() => useFriendMarketNotifications(markets, ACCOUNT))
    expect(friend.result.current.isMarketUnread('1')).toBe(true)
  })
})
