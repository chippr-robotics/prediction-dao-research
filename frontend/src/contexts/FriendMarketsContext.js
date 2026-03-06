import { createContext, useContext } from 'react'

/**
 * FriendMarketsContext - Single source of truth for friend/private wager data
 *
 * Eliminates duplicate fetching by centralizing market loading, caching,
 * and state management. Both WalletButton and Dashboard consume from this context
 * instead of independently calling fetchFriendMarketsForUser().
 */
export const FriendMarketsContext = createContext(null)

export function useFriendMarkets() {
  const ctx = useContext(FriendMarketsContext)
  if (!ctx) {
    throw new Error('useFriendMarkets must be used within a FriendMarketsProvider')
  }
  return ctx
}
