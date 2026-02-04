import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getUserPreference,
  saveUserPreference
} from '../utils/userStorage'

const STORAGE_KEY = 'friend_market_notifications'
const STORAGE_VERSION = 1

/**
 * Get default notification state
 */
function getDefaultState() {
  return {
    version: STORAGE_VERSION,
    seenMarkets: {}
  }
}

/**
 * Hook for tracking unread/unseen friend market notifications
 *
 * Tracks which markets the user has seen and calculates unread count.
 * A market is considered "unread" if:
 * - It's a new market the user hasn't seen
 * - The market's status has changed since last seen
 * - The acceptance count has increased (for pending markets)
 *
 * @param {Array} markets - Array of friend markets (active + pending)
 * @param {string} account - User's wallet address
 * @returns {Object} - { unreadCount, unreadMarketIds, markMarketAsRead, isMarketUnread }
 */
export function useFriendMarketNotifications(markets, account) {
  const [state, setState] = useState(() => {
    if (!account) return getDefaultState()
    return getUserPreference(account, STORAGE_KEY, getDefaultState(), true)
  })

  // Track previous account to detect changes (initialized to current account to prevent mount trigger)
  const prevAccountRef = useRef(account)

  // Use ref for markets to avoid callback recreation
  const marketsRef = useRef(markets)
  useEffect(() => {
    marketsRef.current = markets
  }, [markets])

  // Persist state changes to localStorage
  useEffect(() => {
    if (account && state) {
      saveUserPreference(account, STORAGE_KEY, state, true)
    }
  }, [account, state])

  // Reload state when account changes (but not on mount)
  useEffect(() => {
    if (account !== prevAccountRef.current) {
      prevAccountRef.current = account
      if (account) {
        const savedState = getUserPreference(account, STORAGE_KEY, getDefaultState(), true)
        setState(savedState)
      } else {
        setState(getDefaultState())
      }
    }
  }, [account])

  // Calculate unread markets
  const { unreadCount, unreadMarketIds } = useMemo(() => {
    if (!account || !markets?.length) {
      return { unreadCount: 0, unreadMarketIds: [] }
    }

    const unread = []
    // eslint-disable-next-line react-hooks/purity -- Date.now() is calculated once per render to check market expiration
    const now = Date.now() // Calculate once outside the loop

    for (const market of markets) {
      const marketId = String(market.id)
      const seen = state.seenMarkets[marketId]

      // Skip expired pending invitations - they're not actionable
      if (market.status === 'pending_acceptance' &&
          market.acceptanceDeadline &&
          market.acceptanceDeadline < now) {
        continue
      }

      // New market never seen before
      if (!seen) {
        unread.push(marketId)
        continue
      }

      // Status changed (e.g., pending -> active)
      if (seen.status !== market.status) {
        unread.push(marketId)
        continue
      }

      // Acceptance count changed (for pending markets)
      if (market.status === 'pending_acceptance') {
        const currentCount = market.acceptedCount || 0
        const seenCount = seen.acceptedCount || 0
        if (currentCount > seenCount) {
          unread.push(marketId)
          continue
        }
      }
    }

    return {
      unreadCount: unread.length,
      unreadMarketIds: unread
    }
  }, [markets, state, account])

  // Mark specific market as read
  const markMarketAsRead = useCallback((marketId) => {
    if (!account) return

    const market = marketsRef.current?.find(m => String(m.id) === String(marketId))
    if (!market) return

    setState(prev => ({
      ...prev,
      seenMarkets: {
        ...prev.seenMarkets,
        [String(marketId)]: {
          status: market.status,
          acceptedCount: market.acceptedCount || 0,
          seenAt: Date.now()
        }
      }
    }))
  }, [account])

  // Check if specific market is unread
  const isMarketUnread = useCallback((marketId) => {
    return unreadMarketIds.includes(String(marketId))
  }, [unreadMarketIds])

  return {
    unreadCount,
    unreadMarketIds,
    markMarketAsRead,
    isMarketUnread
  }
}
