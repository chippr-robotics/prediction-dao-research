import { useCallback, useSyncExternalStore } from 'react'
import {
  subscribe,
  getUpdateReadySnapshot,
  applyUpdate as applyUpdateImpl,
  checkForUpdate as checkForUpdateImpl,
} from '../lib/pwa/serviceWorkerUpdate'

/**
 * usePwaUpdate — reactive access to the service-worker update state.
 *
 * @returns {{
 *   updateReady: boolean,                 // a new version is installed and waiting
 *   applyUpdate: () => boolean,           // activate it (reloads on takeover)
 *   checkForUpdate: () => Promise<void>,  // manually poll for a new version
 * }}
 */
export function usePwaUpdate() {
  const updateReady = useSyncExternalStore(subscribe, getUpdateReadySnapshot, () => false)
  const applyUpdate = useCallback(() => applyUpdateImpl(), [])
  const checkForUpdate = useCallback(() => checkForUpdateImpl(), [])
  return { updateReady, applyUpdate, checkForUpdate }
}
