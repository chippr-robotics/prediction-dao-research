import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getUserPreference,
  saveUserPreference,
} from '../utils/userStorage'

const STORAGE_VERSION = 1

function getDefaultState() {
  return { version: STORAGE_VERSION, seenMarkets: {} }
}

/**
 * Factory that returns a hook for tracking unread / unseen markets.
 *
 * @param {Object} opts
 * @param {string} opts.storageKey
 *   The userStorage key under which the seenMarkets map is persisted.
 *   Pass a unique value per UI surface so MyMarkets and FriendMarkets
 *   maintain independent read state.
 * @param {(market: Object) => boolean} [opts.extraUnreadPredicate]
 *   Surface-specific check that flags a market as unread even when it
 *   was previously seen — e.g. a status transition specific to one UI.
 */
export function createUnreadMarketTracker({ storageKey, extraUnreadPredicate }) {
  return function useUnreadMarketTracker(markets, account) {
    const [state, setState] = useState(() => {
      if (!account) return getDefaultState()
      return getUserPreference(account, storageKey, getDefaultState(), true)
    })

    const prevAccountRef = useRef(account)
    const marketsRef = useRef(markets)
    useEffect(() => {
      marketsRef.current = markets
    }, [markets])

    useEffect(() => {
      if (account && state) saveUserPreference(account, storageKey, state, true)
    }, [account, state])

    useEffect(() => {
      if (account !== prevAccountRef.current) {
        prevAccountRef.current = account
        if (account) {
          setState(getUserPreference(account, storageKey, getDefaultState(), true))
        } else {
          setState(getDefaultState())
        }
      }
    }, [account])

    const { unreadCount, unreadMarketIds } = useMemo(() => {
      if (!account || !markets?.length) return { unreadCount: 0, unreadMarketIds: [] }

      const unread = []
      const now = Date.now()

      for (const market of markets) {
        const marketId = String(market.id)
        const seen = state.seenMarkets[marketId]

        if (
          market.status === 'pending_acceptance' &&
          market.acceptanceDeadline &&
          market.acceptanceDeadline < now
        ) {
          continue
        }

        if (!seen) {
          unread.push(marketId)
          continue
        }
        if (seen.status !== market.status) {
          unread.push(marketId)
          continue
        }
        if (market.status === 'pending_acceptance') {
          const currentCount = market.acceptedCount || 0
          const seenCount = seen.acceptedCount || 0
          if (currentCount > seenCount) {
            unread.push(marketId)
            continue
          }
        }
        if (extraUnreadPredicate && extraUnreadPredicate(market, seen)) {
          unread.push(marketId)
          continue
        }
      }

      return { unreadCount: unread.length, unreadMarketIds: unread }
    }, [markets, state, account])

    const markMarketAsRead = useCallback(
      (marketId) => {
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
              seenAt: Date.now(),
            },
          },
        }))
      },
      [account]
    )

    const isMarketUnread = useCallback(
      (marketId) => unreadMarketIds.includes(String(marketId)),
      [unreadMarketIds]
    )

    return { unreadCount, unreadMarketIds, markMarketAsRead, isMarketUnread }
  }
}
