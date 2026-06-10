import { useContext } from 'react'
import { WagerActivityContext } from '../contexts/WagerActivityContext.js'

/**
 * Access the wager activity watcher (feed entries, unread count,
 * action-needed state). Throws outside WagerActivityProvider — use this in
 * components that only ever render inside the app-mode tree (bell, feed).
 */
export function useWagerActivity() {
  const context = useContext(WagerActivityContext)
  if (!context) {
    throw new Error('useWagerActivity must be used within a WagerActivityProvider')
  }
  return context
}

/**
 * Null-safe variant for components that also render outside the provider
 * (legacy trees, tests): returns null when no provider is mounted. Callers
 * must optional-chain.
 */
export function useWagerActivityOptional() {
  return useContext(WagerActivityContext) ?? null
}
