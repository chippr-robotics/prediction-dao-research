import { createContext } from 'react'

/**
 * Context for the wager activity watcher (spec 012). Kept in a .js file —
 * separate from the provider component — so react-refresh sees the .jsx file
 * as components-only (same split as FriendMarketsContext).
 */
export const WagerActivityContext = createContext(null)

export const POLL_INTERVAL_MS = 30_000
