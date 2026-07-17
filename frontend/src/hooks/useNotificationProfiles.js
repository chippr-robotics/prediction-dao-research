import { useCallback, useEffect, useState } from 'react'
import {
  getProfiles,
  getActiveStatus,
  createProfile as storeCreateProfile,
  updateProfile as storeUpdateProfile,
  deleteProfile as storeDeleteProfile,
  enableProfile as storeEnableProfile,
  disableActiveProfile as storeDisableActiveProfile,
  subscribe,
} from '../lib/notifications/notificationProfiles'

/** How often displayed active-state ("On until 6:00 PM") is re-evaluated. */
const STATUS_TICK_MS = 30_000

/**
 * React binding for the device-scoped notification profiles
 * (lib/notifications/notificationProfiles.js). Re-renders on any store change
 * from anywhere (settings panel, quick access, delivery path pruning) and on a
 * 30 s tick so schedule boundaries and manual expiries flip the displayed
 * status without interaction. The delivery gate itself never depends on this
 * tick — getActiveStatus() is evaluated lazily at read time.
 */
export function useNotificationProfiles() {
  const [profiles, setProfiles] = useState(getProfiles)
  const [activeStatus, setActiveStatus] = useState(() => getActiveStatus())

  useEffect(() => {
    const sync = () => {
      setProfiles(getProfiles())
      setActiveStatus(getActiveStatus())
    }
    const unsubscribe = subscribe(sync)
    const interval = setInterval(sync, STATUS_TICK_MS)
    // Catch any change that landed between the initial render and this effect.
    sync()
    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  const createProfile = useCallback((input) => storeCreateProfile(input), [])
  const updateProfile = useCallback((id, patch) => storeUpdateProfile(id, patch), [])
  const deleteProfile = useCallback((id) => storeDeleteProfile(id), [])
  const enableProfile = useCallback((id, options) => storeEnableProfile(id, options), [])
  const disableActiveProfile = useCallback(() => storeDisableActiveProfile(), [])

  return { profiles, activeStatus, createProfile, updateProfile, deleteProfile, enableProfile, disableActiveProfile }
}

export default useNotificationProfiles
