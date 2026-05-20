import { createUnreadMarketTracker } from './useUnreadMarketTracker'

/**
 * Tracks unread/unseen wagers for the MyMarketsModal.
 *
 * Independent from `useFriendMarketNotifications` — opening a wager in the
 * MyMarkets view does not mark it read in the FriendMarkets view, since the
 * two surfaces show different information.
 *
 * Adds one MyMarkets-specific unread trigger: a transition from
 * `active` → `pending_resolution` (the wager just ended and the user
 * should look at it).
 */
export const useMyWagerNotifications = createUnreadMarketTracker({
  storageKey: 'my_wagers_notifications',
  extraUnreadPredicate: (market, seen) => {
    return seen?.status === 'active' && market.status === 'pending_resolution'
  },
})
