import { createContext } from 'react'

/**
 * Context for the platform-wide activity watcher (spec 031). Kept in a .js file — separate from the provider
 * component — so react-refresh sees the .jsx file as components-only (same split the wager watcher used).
 */
export const ActivityContext = createContext(null)

export const POLL_INTERVAL_MS = 30_000
