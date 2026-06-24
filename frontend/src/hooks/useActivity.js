import { useContext } from 'react'
import { ActivityContext } from '../contexts/ActivityContext.js'

/**
 * Access the platform-wide activity watcher (spec 031): merged feed entries, unread + action-needed counts,
 * per-domain action maps, and read-state controls. Throws outside ActivityProvider — use in components that
 * only ever render inside the app-mode tree (bell, feed).
 */
export function useActivity() {
  const context = useContext(ActivityContext)
  if (!context) {
    throw new Error('useActivity must be used within an ActivityProvider')
  }
  return context
}

/**
 * Null-safe variant for components that also render outside the provider (landing pages, tests): returns null
 * when no provider is mounted. Callers must optional-chain.
 */
export function useActivityOptional() {
  return useContext(ActivityContext) ?? null
}

export default useActivity
