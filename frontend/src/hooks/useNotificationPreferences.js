import { useCallback, useEffect, useState } from 'react'
import {
  getNotificationPrefs,
  setDeliveryMode,
  setPushEnabled,
  subscribe,
} from '../lib/notifications/deliveryPreferences'
import { ensurePushPermission, getPermissionState } from '../lib/notifications/pushDelivery'

/**
 * React binding for the device-scoped notification delivery preferences
 * (lib/notifications/deliveryPreferences.js). Re-renders when preferences change
 * from anywhere — the Preferences panel and the delivery path share one source
 * of truth. Enabling push is user-gesture-driven: it requests the browser
 * permission and only persists the master flag if the user actually grants it.
 */
export function useNotificationPreferences() {
  const [prefs, setPrefs] = useState(getNotificationPrefs)
  const [permission, setPermission] = useState(getPermissionState)

  useEffect(() => {
    const sync = () => {
      setPrefs(getNotificationPrefs())
      setPermission(getPermissionState())
    }
    const unsubscribe = subscribe(sync)
    // Catch any change that landed between the initial render and this effect.
    sync()
    return unsubscribe
  }, [])

  const setMode = useCallback((domain, mode) => {
    setDeliveryMode(domain, mode)
  }, [])

  const enablePush = useCallback(async () => {
    const granted = await ensurePushPermission()
    setPushEnabled(granted)
    setPermission(getPermissionState())
    return granted
  }, [])

  const disablePush = useCallback(() => {
    setPushEnabled(false)
  }, [])

  return { prefs, permission, setMode, enablePush, disablePush }
}

export default useNotificationPreferences
