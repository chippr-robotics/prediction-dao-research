import { createUnreadMarketTracker } from './useUnreadMarketTracker'

/**
 * Tracks unread/unseen friend market notifications for the FriendMarketsModal.
 *
 * Uses the shared `createUnreadMarketTracker` factory with an isolated
 * storage key so MyMarkets and FriendMarkets have independent read state.
 *
 * @param {Array} markets - Array of friend markets (active + pending)
 * @param {string} account - User's wallet address
 * @returns {Object} - { unreadCount, unreadMarketIds, markMarketAsRead, isMarketUnread }
 */
export const useFriendMarketNotifications = createUnreadMarketTracker({
  storageKey: 'friend_market_notifications',
})
